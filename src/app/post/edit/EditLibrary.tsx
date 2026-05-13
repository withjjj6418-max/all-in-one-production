"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Trash2,
  Plus,
  Loader2,
  Scissors,
  Edit2,
  X,
  Clock,
  ExternalLink,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type PostEdit = {
  id: string;
  user_id: string;
  project_id: number | null;
  title: string;
  type: string;
  url: string | null;
  status: string;
  progress: number;
  duration_seconds: number | null;
  memo: string | null;
  tags: string[] | null;
  created_at: string;
};

type Project = {
  id: number;
  title: string;
};

const typeOptions = ["본편", "쇼츠", "예고편", "기타"];
const statusOptions = [
  { value: "planning", label: "기획 중", color: "bg-gray-100 text-gray-700" },
  { value: "in_progress", label: "편집 중", color: "bg-amber-100 text-amber-700" },
  { value: "review", label: "검토 중", color: "bg-blue-100 text-blue-700" },
  { value: "done", label: "완료", color: "bg-green-100 text-green-700" },
];

export default function EditLibrary({ onSelect }: { onSelect: (edit: PostEdit) => void }) {
  const [edits, setEdits] = useState<PostEdit[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedEdit, setSelectedEdit] = useState<PostEdit | null>(null);

  const [form, setForm] = useState<Partial<PostEdit>>({
    title: "",
    type: "본편",
    status: "planning",
    progress: 0,
    memo: "",
    tags: [],
    project_id: null,
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: editsData } = await supabase
        .from("post_edits")
        .select("*")
        .order("created_at", { ascending: false });
      
      const { data: projectsData } = await supabase
        .from("projects")
        .select("id, title");

      setEdits(editsData || []);
      setProjects(projectsData || []);
    } catch (error) {
      console.error("Error fetching edits:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleOpenCreate = () => {
    setSelectedEdit(null);
    setForm({
      title: "",
      type: "본편",
      status: "planning",
      progress: 0,
      memo: "",
      tags: [],
      project_id: null,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (edit: PostEdit) => {
    setSelectedEdit(edit);
    setForm({ ...edit });
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

      if (selectedEdit) {
        const { error } = await supabase
          .from("post_edits")
          .update(payload)
          .eq("id", selectedEdit.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("post_edits").insert(payload);
        if (error) throw error;
      }

      setIsModalOpen(false);
      fetchData();
    } catch (error) {
      console.error("Error saving edit:", error);
      alert("저장 중 오류가 발생했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    try {
      const { error } = await supabase.from("post_edits").delete().eq("id", id);
      if (error) throw error;
      fetchData();
    } catch (error) {
      console.error("Error deleting edit:", error);
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "00:00";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex-1 space-y-6 p-8 overflow-y-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">🎬 영상 편집 보관함</h2>
          <p className="text-sm text-muted-foreground">진행 중인 편집 프로젝트를 관리합니다</p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-2 rounded-xl bg-brand-olive px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-olive-dark"
        >
          <Plus size={18} /> 새 편집 프로젝트
        </button>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="animate-spin text-brand-olive" size={32} />
        </div>
      ) : edits.length === 0 ? (
        <div className="flex h-80 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-white text-muted-foreground">
          <Scissors size={48} className="mb-4 opacity-10" />
          <p className="font-medium">편집 프로젝트가 없습니다.</p>
          <p className="text-xs">상단의 버튼을 눌러 첫 프로젝트를 만들어보세요.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {edits.map((edit) => (
            <div
              key={edit.id}
              onClick={() => onSelect(edit)}
              className="group cursor-pointer rounded-2xl border border-border bg-white p-5 shadow-sm transition-all hover:shadow-md hover:border-brand-olive/30"
            >
              <div className="mb-3 flex items-start justify-between">
                <div className={`rounded-lg bg-brand-olive/10 p-2 text-brand-olive`}>
                  <Scissors size={20} />
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleOpenEdit(edit); }}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-brand-cream hover:text-foreground"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(edit.id); }}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-rose-50 hover:text-rose-500"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <h4 className="mb-1 truncate text-base font-bold text-foreground group-hover:text-brand-olive">{edit.title}</h4>
              <div className="mb-4 flex flex-wrap gap-2">
                <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${statusOptions.find(o => o.value === edit.status)?.color}`}>
                  {statusOptions.find(o => o.value === edit.status)?.label}
                </span>
                <span className="rounded-md bg-brand-cream px-2 py-0.5 text-[10px] font-semibold text-brand-olive">
                  {edit.type}
                </span>
                <span className="flex items-center gap-1 rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
                  <Clock size={10} /> {formatDuration(edit.duration_seconds)}
                </span>
              </div>
              
              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px] font-medium text-muted-foreground">
                  <span>진행도</span>
                  <span>{edit.progress}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                  <div 
                    className="h-full bg-brand-olive transition-all duration-500" 
                    style={{ width: `${edit.progress}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 추가/수정 모달 */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md animate-in fade-in zoom-in duration-200 rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-800">
                {selectedEdit ? "편집 정보 수정" : "새 편집 프로젝트"}
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
                    value={form.type || "본편"}
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
                    value={form.status || "planning"}
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

              <div>
                <div className="mb-1 flex justify-between text-xs font-medium text-gray-600">
                  <label>진행률</label>
                  <span className="font-bold text-brand-olive">{form.progress}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={form.progress || 0}
                  onChange={(e) => setForm({ ...form, progress: parseInt(e.target.value) })}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-gray-100 accent-brand-olive"
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
