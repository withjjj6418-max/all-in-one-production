"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Trash2,
  Plus,
  Loader2,
  Image as ImageIcon,
  Edit2,
  X,
  Link as LinkIcon,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type PostImage = {
  id: string;
  user_id: string;
  project_id: number | null;
  title: string;
  type: string;
  url: string | null;
  source: string | null;
  prompt: string | null;
  memo: string | null;
  tags: string[] | null;
  status: string;
  created_at: string;
};

type Project = {
  id: number;
  title: string;
};

const typeOptions = ["썸네일", "B-roll", "AI 이미지", "스톡 영상", "기타"];
const statusOptions = [
  { value: "idea", label: "아이디어", color: "bg-blue-100 text-blue-700" },
  { value: "done", label: "완료", color: "bg-green-100 text-green-700" },
];

export default function ImageLibraryTab() {
  const [images, setImages] = useState<PostImage[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedImage, setSelectedImage] = useState<PostImage | null>(null);

  const [form, setForm] = useState<Partial<PostImage>>({
    title: "",
    type: "AI 이미지",
    source: "",
    prompt: "",
    memo: "",
    tags: [],
    status: "idea",
    project_id: null,
    url: "",
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: imagesData } = await supabase
        .from("post_images")
        .select("*")
        .order("created_at", { ascending: false });
      
      const { data: projectsData } = await supabase
        .from("projects")
        .select("id, title");

      setImages(imagesData || []);
      setProjects(projectsData || []);
    } catch (error) {
      console.error("Error fetching images:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleOpenCreate = () => {
    setSelectedImage(null);
    setForm({
      title: "",
      type: "AI 이미지",
      source: "",
      prompt: "",
      memo: "",
      tags: [],
      status: "idea",
      project_id: null,
      url: "",
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (image: PostImage) => {
    setSelectedImage(image);
    setForm({ ...image });
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

      if (selectedImage) {
        const { error } = await supabase
          .from("post_images")
          .update(payload)
          .eq("id", selectedImage.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("post_images").insert(payload);
        if (error) throw error;
      }

      setIsModalOpen(false);
      fetchData();
    } catch (error) {
      console.error("Error saving image:", error);
      alert("저장 중 오류가 발생했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    try {
      const { error } = await supabase.from("post_images").delete().eq("id", id);
      if (error) throw error;
      fetchData();
    } catch (error) {
      console.error("Error deleting image:", error);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">저장된 이미지 ({images.length})</h3>
        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-1.5 rounded-lg bg-brand-olive px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-olive-dark"
        >
          <Plus size={14} /> 이미지 추가
        </button>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="animate-spin text-brand-olive" />
        </div>
      ) : images.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-white text-muted-foreground">
          <ImageIcon size={40} className="mb-2 opacity-20" />
          <p className="text-sm">저장된 이미지가 없습니다.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {images.map((img) => (
            <div
              key={img.id}
              className="group relative overflow-hidden rounded-xl border border-border bg-white shadow-sm hover:shadow-md transition-all"
            >
              <div className="aspect-square w-full bg-gray-100 flex items-center justify-center overflow-hidden">
                {img.url ? (
                  <img src={img.url} alt={img.title} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                ) : (
                  <ImageIcon size={24} className="text-muted-foreground/30" />
                )}
              </div>
              <div className="p-3">
                <div className="flex items-start justify-between gap-1">
                  <h4 className="truncate text-xs font-bold text-foreground">{img.title}</h4>
                  <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-medium ${statusOptions.find(opt => opt.value === img.status)?.color || "bg-gray-100 text-gray-600"}`}>
                    {statusOptions.find(opt => opt.value === img.status)?.label || img.status}
                  </span>
                </div>
                <p className="mt-1 truncate text-[10px] text-muted-foreground">
                  {img.type} · {img.source || "출처 미상"}
                </p>
                <div className="mt-2 flex gap-1">
                  <button
                    onClick={() => handleOpenEdit(img)}
                    className="flex-1 rounded bg-brand-cream py-1 text-[10px] font-medium text-brand-olive hover:bg-brand-olive/10"
                  >
                    편집
                  </button>
                  <button
                    onClick={() => handleDelete(img.id)}
                    className="rounded bg-rose-50 p-1 text-rose-500 hover:bg-rose-100"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 추가/수정 모달 */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="my-8 w-full max-w-lg animate-in fade-in zoom-in duration-200 rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-800">
                {selectedImage ? "이미지 수정" : "새 이미지 추가"}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
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
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">유형</label>
                    <select
                      value={form.type || "AI 이미지"}
                      onChange={(e) => setForm({ ...form, type: e.target.value })}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-olive"
                    >
                      {typeOptions.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">프로젝트</label>
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
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">이미지 미리보기 (URL)</label>
                  <div className="aspect-square w-full rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 flex flex-col items-center justify-center overflow-hidden relative group">
                    {form.url ? (
                      <img src={form.url} alt="Preview" className="h-full w-full object-cover" />
                    ) : (
                      <ImageIcon size={32} className="text-gray-300" />
                    )}
                    <div className="absolute inset-x-2 bottom-2">
                      <input 
                        type="text" 
                        placeholder="이미지 URL 입력"
                        value={form.url || ""}
                        onChange={(e) => setForm({ ...form, url: e.target.value })}
                        className="w-full rounded border border-gray-300 px-2 py-1 text-[10px] shadow-sm outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">AI 프롬프트</label>
                <textarea
                  value={form.prompt || ""}
                  onChange={(e) => setForm({ ...form, prompt: e.target.value })}
                  rows={4}
                  className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-olive"
                  placeholder="AI 생성 시 사용한 프롬프트를 입력하세요"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
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
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">출처</label>
                  <input
                    type="text"
                    value={form.source || ""}
                    onChange={(e) => setForm({ ...form, source: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-olive"
                    placeholder="예: Midjourney"
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
