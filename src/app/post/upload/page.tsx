"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Upload,
  MonitorPlay,
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  CalendarDays,
  Globe,
  Tags,
  FileText,
  Image as ImageIcon,
  Eye,
  Send,
  Trash2,
  Plus,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

/* ─── 타입 정의 ─── */
type PostUpload = {
  id: string;
  user_id: string;
  project_id: number | null;
  channel_id: number | null;
  title: string;
  description: string | null;
  tags: string[] | null;
  thumbnail_url: string | null;
  scheduled_at: string | null;
  uploaded_at: string | null;
  youtube_video_id: string | null;
  youtube_url: string | null;
  status: string;
  memo: string | null;
  created_at: string;
};

type Project = {
  id: number;
  title: string;
};

type Channel = {
  id: number;
  name: string;
};

const statusConfig: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  draft: { label: "초안", color: "text-muted-foreground", bg: "bg-muted", icon: Clock },
  scheduled: { label: "예약됨", color: "text-blue-600", bg: "bg-blue-50", icon: CalendarDays },
  uploaded: { label: "업로드됨", color: "text-brand-olive", bg: "bg-brand-olive/10", icon: CheckCircle2 },
  public: { label: "공개됨", color: "text-green-600", bg: "bg-green-50", icon: Globe },
  error: { label: "오류", color: "text-red-600", bg: "bg-red-50", icon: AlertCircle },
};

const visibilityOptions = ["공개", "일부 공개", "비공개"];

export default function UploadPage() {
  const [uploads, setUploads] = useState<PostUpload[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // 편집 폼 상태
  const [form, setForm] = useState<Partial<PostUpload>>({
    title: "",
    description: "",
    tags: [],
    status: "draft",
    project_id: null,
    channel_id: null,
    visibility: "공개",
  } as any);

  /* ─── 데이터 페칭 ─── */
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: uploadsData, error: uploadsError } = await supabase
        .from("post_uploads")
        .select("*")
        .order("created_at", { ascending: false });

      const { data: projectsData } = await supabase
        .from("projects")
        .select("id, title");

      const { data: channelsData } = await supabase
        .from("channels")
        .select("id, name");

      if (uploadsError) throw uploadsError;
      setUploads(uploadsData || []);
      setProjects(projectsData || []);
      setChannels(channelsData || []);

      if (uploadsData && uploadsData.length > 0 && !selectedId) {
        handleSelect(uploadsData[0]);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSelect = (upload: PostUpload) => {
    setSelectedId(upload.id);
    setForm({
      ...upload,
      tags: upload.tags || [],
    });
  };

  const handleCreate = async () => {
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("post_uploads")
        .insert({
          title: "새 업로드 항목",
          user_id: user.id,
          status: "draft",
        })
        .select()
        .single();

      if (error) throw error;
      await fetchData();
      if (data) handleSelect(data);
    } catch (error) {
      console.error("Error creating upload:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!selectedId) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("post_uploads")
        .update({
          ...form,
          updated_at: new Date().toISOString(),
          // project_id와 channel_id가 string일 경우 number로 변환
          project_id: form.project_id ? Number(form.project_id) : null,
          channel_id: form.channel_id ? Number(form.channel_id) : null,
        })
        .eq("id", selectedId);

      if (error) throw error;
      await fetchData();
      alert("저장되었습니다.");
    } catch (error) {
      console.error("Error updating upload:", error);
      alert("저장 중 오류가 발생했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    try {
      const { error } = await supabase.from("post_uploads").delete().eq("id", id);
      if (error) throw error;
      if (selectedId === id) setSelectedId(null);
      await fetchData();
    } catch (error) {
      console.error("Error deleting upload:", error);
    }
  };

  const activeUpload = uploads.find((v) => v.id === selectedId);

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          📤 업로드 매니저
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          완성된 영상을 YouTube에 업로드하고 메타데이터를 관리합니다
        </p>
      </div>

      <div className="flex gap-5">
        {/* ── 왼쪽: 영상 목록 ── */}
        <div className="w-80 shrink-0 space-y-3">
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-foreground">업로드 목록</h3>
              {loading && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
            </div>
            
            <div className="max-h-[600px] space-y-2 overflow-y-auto pr-1">
              {uploads.map((v) => {
                const s = statusConfig[v.status] || statusConfig.draft;
                const Icon = s.icon;
                return (
                  <div key={v.id} className="group relative">
                    <button
                      onClick={() => handleSelect(v)}
                      className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-all ${
                        selectedId === v.id
                          ? "border-brand-pink bg-brand-pink/5"
                          : "border-border hover:shadow-sm"
                      }`}
                    >
                      <div className={`flex h-12 w-16 shrink-0 items-center justify-center rounded-md bg-gray-100`}>
                        {v.thumbnail_url ? (
                          <img src={v.thumbnail_url} alt="" className="h-full w-full rounded-md object-cover" />
                        ) : (
                          <FileText size={16} className="text-muted-foreground/40" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-foreground">{v.title}</p>
                        <p className="text-[10px] text-muted-foreground">{v.youtube_url ? "YouTube 연동됨" : "미연동"}</p>
                        <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-medium ${s.bg} ${s.color}`}>
                          <Icon size={10} /> {s.label}
                        </span>
                      </div>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(v.id); }}
                      className="absolute right-2 top-2 hidden rounded-md bg-white/80 p-1.5 text-muted-foreground hover:text-red-500 group-hover:block"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>

            <button
              onClick={handleCreate}
              disabled={isSaving}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-border py-3 text-xs font-medium text-muted-foreground hover:border-brand-olive/40 hover:text-foreground disabled:opacity-50"
            >
              <Plus size={14} /> {isSaving ? "생성 중..." : "새 업로드 추가"}
            </button>
          </Card>

          {/* 프로젝트 & 채널 연결 */}
          {selectedId && (
            <Card>
              <h3 className="mb-3 text-xs font-semibold text-foreground">연결 설정</h3>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-muted-foreground">프로젝트</label>
                  <select
                    value={form.project_id || ""}
                    onChange={(e) => setForm({ ...form, project_id: e.target.value ? Number(e.target.value) : null })}
                    className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs outline-none focus:border-brand-olive"
                  >
                    <option value="">독립 라이브러리</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.title}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-muted-foreground">채널</label>
                  <select
                    value={form.channel_id || ""}
                    onChange={(e) => setForm({ ...form, channel_id: e.target.value ? Number(e.target.value) : null })}
                    className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs outline-none focus:border-brand-olive"
                  >
                    <option value="">채널 선택 안함</option>
                    {channels.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* ── 오른쪽: 메타데이터 편집 ── */}
        <div className="min-w-0 flex-1 space-y-4">
          {!selectedId ? (
            <div className="flex h-96 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-white/50 text-muted-foreground">
              <FileText size={48} className="mb-4 opacity-20" />
              <p>편집할 항목을 선택하거나 새로 추가하세요</p>
            </div>
          ) : (
            <>
              {/* 썸네일 + 제목 */}
              <Card>
                <div className="flex gap-4">
                  <div className={`flex h-36 w-60 shrink-0 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border transition-colors hover:border-brand-olive/40 bg-gray-50 overflow-hidden relative group`}>
                    {form.thumbnail_url ? (
                      <img src={form.thumbnail_url} alt="Thumbnail" className="h-full w-full object-cover" />
                    ) : (
                      <div className="text-center">
                        <ImageIcon size={24} className="mx-auto mb-1 text-muted-foreground/40" />
                        <span className="text-[10px] text-muted-foreground">썸네일 URL 입력</span>
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                      <input 
                        type="text" 
                        placeholder="이미지 URL"
                        value={form.thumbnail_url || ""}
                        onChange={(e) => setForm({ ...form, thumbnail_url: e.target.value })}
                        className="w-[80%] rounded px-2 py-1 text-[10px] text-black outline-none"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1 space-y-3">
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">제목</label>
                      <input
                        value={form.title || ""}
                        onChange={(e) => setForm({ ...form, title: e.target.value })}
                        className="h-9 w-full rounded-lg border border-border bg-brand-cream/50 px-3 text-sm outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">상태</label>
                      <select
                        value={form.status || "draft"}
                        onChange={(e) => setForm({ ...form, status: e.target.value })}
                        className="h-9 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-brand-olive"
                      >
                        <option value="draft">초안</option>
                        <option value="scheduled">예약됨</option>
                        <option value="uploaded">업로드됨</option>
                        <option value="public">공개됨</option>
                      </select>
                    </div>
                  </div>
                </div>
              </Card>

              {/* 설명 */}
              <Card>
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">설명</label>
                <textarea
                  rows={5}
                  value={form.description || ""}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="영상 설명을 입력하세요"
                  className="w-full resize-none rounded-lg border border-border bg-brand-cream/50 px-3 py-2 text-sm outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                />
              </Card>

              {/* 태그 */}
              <Card>
                <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                  <Tags size={12} /> 태그 (쉼표로 구분)
                </label>
                <input
                  value={(form.tags || []).join(", ")}
                  onChange={(e) => setForm({ ...form, tags: e.target.value.split(",").map(t => t.trim()).filter(t => t !== "") })}
                  placeholder="예: 호르무즈, 석유, 경제"
                  className="h-9 w-full rounded-lg border border-border bg-brand-cream/50 px-3 text-sm outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                />
              </Card>

              {/* YouTube 정보 */}
              <Card>
                <h3 className="mb-3 text-xs font-semibold text-foreground">YouTube 정보</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-muted-foreground">YouTube URL</label>
                    <div className="flex gap-2">
                      <input
                        value={form.youtube_url || ""}
                        onChange={(e) => setForm({ ...form, youtube_url: e.target.value })}
                        placeholder="https://youtu.be/..."
                        className="h-9 flex-1 rounded-lg border border-border bg-white px-3 text-xs outline-none focus:border-brand-olive"
                      />
                      {form.youtube_url && (
                        <a href={form.youtube_url} target="_blank" rel="noopener noreferrer" className="flex h-9 w-9 items-center justify-center rounded-lg border border-border hover:bg-gray-50 text-muted-foreground">
                          <ExternalLink size={14} />
                        </a>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-muted-foreground">예약 시간</label>
                    <input
                      type="datetime-local"
                      value={form.scheduled_at ? new Date(form.scheduled_at).toISOString().slice(0, 16) : ""}
                      onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
                      className="h-9 w-full rounded-lg border border-border bg-white px-3 text-xs outline-none focus:border-brand-olive"
                    />
                  </div>
                </div>
              </Card>

              {/* 메모 */}
              <Card>
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">내부 메모</label>
                <textarea
                  rows={2}
                  value={form.memo || ""}
                  onChange={(e) => setForm({ ...form, memo: e.target.value })}
                  className="w-full resize-none rounded-lg border border-border bg-white px-3 py-2 text-xs outline-none focus:border-brand-olive"
                />
              </Card>

              {/* 저장 버튼 */}
              <div className="flex gap-3">
                <button
                  onClick={handleUpdate}
                  disabled={isSaving}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-olive py-3.5 text-sm font-semibold text-white transition-colors hover:bg-brand-olive-dark disabled:opacity-50"
                >
                  {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  설정 저장
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-border bg-white p-4 shadow-sm">{children}</div>;
}
