"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Play,
  Pause,
  Download,
  Trash2,
  Plus,
  Loader2,
  Music,
  Mic,
  Volume2,
  Edit2,
  Save,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type PostSound = {
  id: string;
  user_id: string;
  project_id: number | null;
  title: string;
  type: string;
  url: string | null;
  source: string | null;
  duration_seconds: number | null;
  memo: string | null;
  tags: string[] | null;
  status: string;
  created_at: string;
};

type Project = {
  id: number;
  title: string;
};

const typeOptions = ["BGM", "효과음", "나레이션", "기타"];
const statusOptions = [
  { value: "idea", label: "아이디어", color: "bg-blue-100 text-blue-700" },
  { value: "in_progress", label: "제작 중", color: "bg-amber-100 text-amber-700" },
  { value: "done", label: "완료", color: "bg-green-100 text-green-700" },
];

export default function SoundLibraryTab() {
  const [sounds, setSounds] = useState<PostSound[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedSound, setSelectedSound] = useState<PostSound | null>(null);

  const [form, setForm] = useState<Partial<PostSound>>({
    title: "",
    type: "BGM",
    source: "",
    memo: "",
    tags: [],
    status: "idea",
    project_id: null,
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: soundsData } = await supabase
        .from("post_sounds")
        .select("*")
        .order("created_at", { ascending: false });
      
      const { data: projectsData } = await supabase
        .from("projects")
        .select("id, title");

      setSounds(soundsData || []);
      setProjects(projectsData || []);
    } catch (error) {
      console.error("Error fetching sounds:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleOpenCreate = () => {
    setSelectedSound(null);
    setForm({
      title: "",
      type: "BGM",
      source: "",
      memo: "",
      tags: [],
      status: "idea",
      project_id: null,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (sound: PostSound) => {
    setSelectedSound(sound);
    setForm({ ...sound });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.title) {
      alert("제목을 입력해주세요.");
      return;
    }

    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const payload = {
        ...form,
        user_id: user.id,
        project_id: form.project_id ? Number(form.project_id) : null,
        updated_at: new Date().toISOString(),
      };

      if (selectedSound) {
        const { error } = await supabase
          .from("post_sounds")
          .update(payload)
          .eq("id", selectedSound.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("post_sounds").insert(payload);
        if (error) throw error;
      }

      setIsModalOpen(false);
      fetchData();
    } catch (error) {
      console.error("Error saving sound:", error);
      alert("저장 중 오류가 발생했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    try {
      const { error } = await supabase.from("post_sounds").delete().eq("id", id);
      if (error) throw error;
      fetchData();
    } catch (error) {
      console.error("Error deleting sound:", error);
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "--:--";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">저장된 사운드 ({sounds.length})</h3>
        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-1.5 rounded-lg bg-brand-olive px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-olive-dark"
        >
          <Plus size={14} /> 사운드 추가
        </button>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="animate-spin text-brand-olive" />
        </div>
      ) : sounds.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-white text-muted-foreground">
          <Music size={40} className="mb-2 opacity-20" />
          <p className="text-sm">저장된 사운드가 없습니다.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {sounds.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-4 rounded-xl border border-border bg-white p-4 shadow-sm hover:shadow-md transition-all"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-olive/10 text-brand-olive">
                {s.type === "나레이션" ? <Mic size={20} /> : <Music size={20} />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="truncate text-sm font-bold text-foreground">{s.title}</h4>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${statusOptions.find(opt => opt.value === s.status)?.color || "bg-gray-100 text-gray-600"}`}>
                    {statusOptions.find(opt => opt.value === s.status)?.label || s.status}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {s.type} · {s.source || "출처 미상"} · {formatDuration(s.duration_seconds)}
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {(s.tags || []).map((t, i) => (
                    <span key={i} className="rounded-md bg-brand-cream px-1.5 py-0.5 text-[10px] text-brand-olive">
                      #{t}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => handleOpenEdit(s)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-brand-cream hover:text-foreground"
                >
                  <Edit2 size={14} />
                </button>
                <button
                  onClick={() => handleDelete(s.id)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-rose-50 hover:text-rose-500"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 추가/수정 모달 */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md animate-in fade-in zoom-in duration-200 rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-800">
                {selectedSound ? "사운드 수정" : "새 사운드 추가"}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">제목</label>
                <input
                  type="text"
                  value={form.title || ""}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-olive"
                  placeholder="제목 입력"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">유형</label>
                  <select
                    value={form.type || "BGM"}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-olive"
                  >
                    {typeOptions.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">상태</label>
                  <select
                    value={form.status || "idea"}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-olive"
                  >
                    {statusOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">프로젝트 연결</label>
                <select
                  value={form.project_id || ""}
                  onChange={(e) => setForm({ ...form, project_id: e.target.value ? Number(e.target.value) : null })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-olive"
                >
                  <option value="">독립 라이브러리</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">출처</label>
                  <input
                    type="text"
                    value={form.source || ""}
                    onChange={(e) => setForm({ ...form, source: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-olive"
                    placeholder="예: Epidemic Sound"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">재생 시간(초)</label>
                  <input
                    type="number"
                    value={form.duration_seconds || ""}
                    onChange={(e) => setForm({ ...form, duration_seconds: Number(e.target.value) })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-olive"
                    placeholder="0"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">태그 (쉼표 구분)</label>
                <input
                  type="text"
                  value={(form.tags || []).join(", ")}
                  onChange={(e) => setForm({ ...form, tags: e.target.value.split(",").map(t => t.trim()).filter(t => t !== "") })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-olive"
                  placeholder="태그 입력"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">메모</label>
                <textarea
                  value={form.memo || ""}
                  onChange={(e) => setForm({ ...form, memo: e.target.value })}
                  rows={2}
                  className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-olive"
                  placeholder="메모 입력"
                />
              </div>
            </div>

            <div className="mt-8 flex gap-3">
              <button
                onClick={() => setIsModalOpen(false)}
                className="flex-1 rounded-xl bg-gray-100 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-200 transition"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1 rounded-xl bg-brand-olive py-3 text-sm font-semibold text-white hover:bg-brand-olive-dark shadow-md transition disabled:opacity-50"
              >
                {isSaving ? <Loader2 size={16} className="mx-auto animate-spin" /> : "저장하기"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
