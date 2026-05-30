"use client";

import { useState, useEffect } from "react";
import { Mic, Plus, Edit2, Trash2, ExternalLink, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function SoundStudioPage() {
  const supabase = createClient();

  const [sounds, setSounds] = useState<any[]>([]);
  const [projects, setProjects] = useState<{ id: number; title: string }[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form State
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState<number | "">("");
  const [url, setUrl] = useState("");
  const [duration, setDuration] = useState<number | "">("");
  const [memo, setMemo] = useState("");

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    const [projectsRes, soundsRes] = await Promise.all([
      supabase.from("projects").select("id, title").order("updated_at", { ascending: false }),
      supabase.from("post_sounds").select(`
        *,
        projects ( title )
      `).eq("user_id", user.id).order("created_at", { ascending: false })
    ]);

    if (projectsRes.data) setProjects(projectsRes.data);
    if (soundsRes.data) setSounds(soundsRes.data);
  };

useEffect(() => {
    fetchData();
  }, []);

  // URL에 project_id가 있으면, 그 프로젝트로 새 내레이션 추가 모달을 자동으로 연다
  // 예: /post/sound?project_id=5 로 들어오면 5번 프로젝트가 선택된 채로 추가창이 열림
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pid = params.get("project_id");
    if (pid) {
      // 기존 추가 모달 로직을 그대로 사용하되, 프로젝트만 미리 선택
      setIsEditMode(false);
      setEditingId(null);
      setTitle("");
      setProjectId(Number(pid));  // ← URL로 받은 프로젝트를 미리 선택
      setUrl("");
      setDuration("");
      setMemo("");
      setIsModalOpen(true);
    }
  }, []);

  const openAddModal = () => {
    setIsEditMode(false);
    setEditingId(null);
    setTitle("");
    setProjectId("");
    setUrl("");
    setDuration("");
    setMemo("");
    setIsModalOpen(true);
  };

  const openEditModal = (sound: any) => {
    setIsEditMode(true);
    setEditingId(sound.id);
    setTitle(sound.title || "");
    setProjectId(sound.project_id || "");
    setUrl(sound.url || "");
    setDuration(sound.duration_seconds || "");
    setMemo(sound.memo || "");
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  const handleSave = async () => {
    if (!title.trim() || !url.trim()) {
      alert("제목과 결과물 링크는 필수입니다.");
      return;
    }
    if (!userId) return;

    const payload = {
      user_id: userId,
      project_id: projectId === "" ? null : Number(projectId),
      title: title.trim(),
      url: url.trim(),
      source: "타입캐스트",
      duration_seconds: duration === "" ? null : Number(duration),
      memo: memo.trim(),
      type: "내레이션"
    };

    if (isEditMode && editingId) {
      const { error } = await supabase.from("post_sounds").update(payload).eq("id", editingId);
      if (error) {
        console.error(error);
        alert("저장에 실패했습니다.");
      } else {
        showToast("수정됐어요");
        closeModal();
        fetchData();
      }
    } else {
      const { error } = await supabase.from("post_sounds").insert([payload]);
      if (error) {
        console.error(error);
        alert("저장에 실패했습니다.");
      } else {
        showToast("저장됐어요");
        closeModal();
        fetchData();
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("정말 삭제하시겠습니까?")) return;
    const { error } = await supabase.from("post_sounds").delete().eq("id", id);
    if (error) {
      console.error(error);
      alert("삭제에 실패했습니다.");
    } else {
      showToast("삭제됐어요");
      fetchData();
    }
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return "";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="mx-auto max-w-5xl space-y-10 pb-16">
      {/* ── 페이지 제목 ── */}
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          🎵 사운드
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          오디오 에셋 관리 및 음성 생성
        </p>
      </div>

      {/* ── 1. 외부 도구 허브 ── */}
      <section>
        <h3 className="text-sm font-semibold text-foreground mb-4">외부 도구 허브</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <div 
            onClick={() => window.open('https://typecast.ai/kr', '_blank')}
            className="flex flex-col justify-between p-5 rounded-xl border border-border bg-white shadow-sm hover:shadow-md hover:border-brand-olive-light transition-all cursor-pointer group"
          >
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                  <Mic size={18} />
                </div>
                <h4 className="font-bold text-foreground">타입캐스트</h4>
              </div>
              <p className="text-sm text-muted-foreground">AI 내레이션 음성 생성</p>
            </div>
            <div className="mt-4 flex items-center justify-end text-xs font-semibold text-brand-olive opacity-0 group-hover:opacity-100 transition-opacity">
              바로 가기 <ExternalLink size={12} className="ml-1" />
            </div>
          </div>
        </div>
      </section>

      {/* ── 2 & 3. 내가 만든 내레이션 목록 ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-foreground">📚 내가 만든 내레이션</h3>
          <button
            onClick={openAddModal}
            className="flex items-center gap-1.5 rounded-lg bg-brand-olive px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand-olive-dark"
          >
            <Plus size={16} /> 새 내레이션 추가
          </button>
        </div>

        {sounds.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center rounded-xl border border-border bg-white shadow-sm">
            <Mic size={32} className="text-muted-foreground/50 mb-3" />
            <h3 className="text-sm font-medium text-foreground">아직 저장된 내레이션이 없어요</h3>
            <p className="text-xs text-muted-foreground mt-1">타입캐스트 등에서 생성한 결과물을 추가해보세요.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {sounds.map((sound) => (
              <div key={sound.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-border bg-white shadow-sm hover:border-brand-olive/30 transition-colors gap-4">
                <div className="flex items-start sm:items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-cream text-brand-olive">
                    <Mic size={20} />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-foreground">{sound.title}</h4>
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground/70">
                        {sound.projects?.title || "독립 라이브러리"}
                      </span>
                      {sound.duration_seconds && (
                        <>
                          <span className="text-border">•</span>
                          <span>{formatDuration(sound.duration_seconds)}</span>
                        </>
                      )}
                      {sound.source && (
                        <>
                          <span className="text-border">•</span>
                          <span>{sound.source}</span>
                        </>
                      )}
                    </div>
                    {sound.memo && (
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-1">{sound.memo}</p>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                  <button
                    onClick={() => window.open(sound.url, '_blank')}
                    className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    <ExternalLink size={14} /> 듣기
                  </button>
                  <button
                    onClick={() => openEditModal(sound)}
                    className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-gray-100 hover:text-foreground transition-colors"
                  >
                    <Edit2 size={14} /> 편집
                  </button>
                  <button
                    onClick={() => handleDelete(sound.id)}
                    className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={14} /> 삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── 4 & 5. 추가 / 편집 모달 ── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md animate-in fade-in zoom-in duration-200 rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="mb-5 text-xl font-bold text-gray-900">
              {isEditMode ? "내레이션 편집" : "새 내레이션 추가"}
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">제목 *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="예: 도입부 - AI 부업 영상"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-olive focus:ring-1 focus:ring-brand-olive"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">프로젝트 (선택)</label>
                <select
                  value={projectId}
                  onChange={(e) => {
                    const value = e.target.value;
                    setProjectId(value === "" ? "" : Number(value));
                  }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-olive focus:ring-1 focus:ring-brand-olive"
                >
                  <option value="">독립 라이브러리</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">결과물 링크 *</label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="예: 구글 드라이브 링크"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-olive focus:ring-1 focus:ring-brand-olive"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">길이 (초, 선택)</label>
                <input
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="숫자 입력"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-olive focus:ring-1 focus:ring-brand-olive"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">메모 (선택)</label>
                <textarea
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="기타 참고사항"
                  className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-olive focus:ring-1 focus:ring-brand-olive h-24"
                />
              </div>
            </div>

            <div className="mt-8 flex gap-3">
              <button
                onClick={closeModal}
                className="flex-1 rounded-xl bg-gray-100 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-200"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                className="flex-1 rounded-xl bg-brand-olive py-2.5 text-sm font-semibold text-white transition hover:bg-brand-olive-dark shadow-sm"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 토스트 메시지 UI */}
      {toastMessage && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 fade-in">
          <div className="bg-gray-800 text-white px-6 py-3 rounded-full shadow-lg font-medium text-sm flex items-center gap-2">
            <Check size={16} className="text-green-400" />
            {toastMessage}
          </div>
        </div>
      )}
    </div>
  );
}
