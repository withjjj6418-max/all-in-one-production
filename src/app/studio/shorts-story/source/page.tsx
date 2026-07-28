"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ArrowRight, ClipboardPaste, FilePenLine, Globe2, Loader2, Play,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { productionTypes } from "@/lib/project-workflows";

type SourceKind = "youtube" | "web" | "screenshot" | "text";
type Draft = { sourceKind: SourceKind; title: string; sourceUrl: string; content: string };

const emptyDraft: Draft = { sourceKind: "youtube", title: "", sourceUrl: "", content: "" };

const sourceKinds: Array<{ key: SourceKind; label: string; icon: typeof Globe2 }> = [
  { key: "youtube", label: "유튜브", icon: Play },
  { key: "web", label: "웹 사연", icon: Globe2 },
  { key: "screenshot", label: "캡처 원문", icon: ClipboardPaste },
  { key: "text", label: "직접 입력", icon: FilePenLine },
];

export default function StoryNewSourcePage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState("");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [fetchingYoutube, setFetchingYoutube] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!active) return;
      if (user) setUserId(user.id);
      else setError("로그인이 필요합니다.");
      setLoading(false);
    });
    return () => { active = false; };
  }, [supabase]);

  const clearMessage = () => { setError(""); setNotice(""); };

  async function importYoutube() {
    clearMessage();
    const url = draft.sourceUrl.trim();
    if (!url) return setError("YouTube 주소를 먼저 입력해주세요.");
    setFetchingYoutube(true);
    try {
      const response = await fetch(`/api/youtube/transcript?url=${encodeURIComponent(url)}`);
      const payload = await response.json() as { success?: boolean; error?: string; data?: { title?: string; transcript?: string | null } };
      if (!response.ok || !payload.success) throw new Error(payload.error || "YouTube 정보를 가져오지 못했습니다.");
      setDraft((current) => ({
        ...current,
        sourceKind: "youtube",
        title: payload.data?.title || current.title,
        content: payload.data?.transcript || current.content,
      }));
      setNotice(payload.data?.transcript
        ? "제목과 원문을 가져왔습니다. 프로젝트 이름과 내용을 확인해주세요."
        : "영상 제목만 가져왔습니다. 원문은 직접 붙여넣어주세요.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "YouTube 원문을 가져오지 못했습니다.");
    } finally {
      setFetchingYoutube(false);
    }
  }

  async function extractScreenshots(files: FileList | null) {
    clearMessage();
    if (!files?.length) return;
    const selected = Array.from(files);
    if (selected.length > 10 || selected.some((file) => file.size > 5_000_000)) {
      return setError("캡처는 최대 10장, 한 장당 5MB까지 사용할 수 있습니다.");
    }
    setExtracting(true);
    try {
      const images = await Promise.all(selected.map((file) => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("이미지를 읽지 못했습니다."));
        reader.readAsDataURL(file);
      })));
      const response = await fetch("/api/story/extract-text", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ images }),
      });
      const payload = await response.json() as { content?: string; error?: string };
      if (!response.ok || !payload.content) throw new Error(payload.error || "캡처에서 글자를 추출하지 못했습니다.");
      setDraft((current) => ({
        ...current,
        sourceKind: "screenshot",
        title: current.title || "캡처 사연",
        content: current.content ? `${current.content}\n\n${payload.content}` : payload.content || "",
      }));
      setNotice(`${selected.length}장의 캡처에서 원문을 추출했습니다.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "캡처 처리 중 오류가 발생했습니다.");
    } finally {
      setExtracting(false);
    }
  }

  async function createProject() {
    clearMessage();
    const title = draft.title.trim();
    const content = draft.content.trim();
    if (!userId) return setError("로그인이 필요합니다.");
    if (!title) return setError("프로젝트 이름을 입력해주세요.");
    if (!content) return setError("저장할 원문을 입력해주세요.");

    setCreating(true);
    const now = new Date().toISOString();
    const { data: project, error: projectError } = await supabase.from("projects").insert({
      user_id: userId,
      title,
      production_type: productionTypes.shortsStory,
      status: "원문 수집",
      progress: 15,
      uploaded: false,
      updated_at: now,
    }).select("id").single();

    if (projectError || !project) {
      setCreating(false);
      return setError("사연 프로젝트를 만들지 못했습니다.");
    }

    const { error: sourceError } = await supabase.from("story_sources").insert({
      project_id: project.id,
      user_id: userId,
      source_kind: draft.sourceKind,
      title,
      source_url: draft.sourceUrl.trim() || null,
      content,
      updated_at: now,
    });

    if (sourceError) {
      await supabase.from("projects").delete().eq("id", project.id).eq("user_id", userId);
      setCreating(false);
      return setError("프로젝트는 만들었지만 원문을 저장하지 못해 생성을 취소했습니다. 잠시 후 다시 시도해주세요.");
    }

    window.localStorage.setItem("last-shorts-story-project-id", String(project.id));
    router.push(`/studio/shorts-story/projects/${project.id}/story`);
  }

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="animate-spin text-brand-olive" /></div>;

  return <div className="mx-auto max-w-5xl space-y-5">
    <Link href="/studio/shorts-story" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-brand-olive"><ArrowLeft size={16} /> 사연 프로젝트</Link>
    <header>
      <p className="text-sm font-bold text-rose-700">새 제작 시작</p>
      <h1 className="mt-1 text-3xl font-bold">원문수집 · 새 프로젝트 만들기</h1>
      <p className="mt-2 text-sm text-muted-foreground">원문을 준비하고 프로젝트 이름으로 적용하면 기존 프로젝트와 분리된 새 사연 프로젝트가 생성됩니다.</p>
    </header>

    {(error || notice) && <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{error || notice}</div>}

    <section className="space-y-4 rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-6">
      <div>
        <h2 className="text-lg font-bold">새 프로젝트 원문</h2>
        <p className="mt-1 text-xs text-muted-foreground">유튜브 대본, 웹 사연, 캡처 또는 직접 입력한 글로 시작할 수 있습니다.</p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {sourceKinds.map((item) => {
          const Icon = item.icon;
          return <button key={item.key} type="button" onClick={() => setDraft((current) => ({ ...current, sourceKind: item.key }))} className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-bold ${draft.sourceKind === item.key ? "border-brand-olive bg-brand-cream text-brand-olive-dark" : "border-border text-muted-foreground"}`}><Icon size={15} />{item.label}</button>;
        })}
      </div>

      <label className="block text-sm font-semibold">출처 URL (선택)<input value={draft.sourceUrl} onChange={(event) => setDraft((current) => ({ ...current, sourceUrl: event.target.value }))} placeholder="YouTube 또는 게시물 주소" className="mt-2 h-11 w-full rounded-xl border border-border px-3 outline-none focus:border-brand-olive" /></label>
      {draft.sourceKind === "youtube" && <button type="button" onClick={importYoutube} disabled={fetchingYoutube || creating} className="inline-flex h-10 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-bold text-red-700 disabled:opacity-50">{fetchingYoutube ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />} YouTube 제목·원문 가져오기</button>}
      {draft.sourceKind === "screenshot" && <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-brand-olive/30 bg-brand-cream px-4 text-sm font-bold text-brand-olive-dark"><input type="file" accept="image/jpeg,image/png,image/gif,image/webp" multiple className="hidden" disabled={extracting || creating} onChange={(event) => { extractScreenshots(event.target.files); event.currentTarget.value = ""; }} />{extracting ? <Loader2 size={16} className="animate-spin" /> : <ClipboardPaste size={16} />}{extracting ? "캡처 글자를 읽는 중..." : "캡처 이미지 선택 · 글자 추출"}</label>}
      <label className="block text-sm font-semibold">프로젝트 이름<input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="가져온 제목을 수정해도 됩니다" className="mt-2 h-11 w-full rounded-xl border border-border px-3 outline-none focus:border-brand-olive" /></label>
      <label className="block text-sm font-semibold">원문<textarea value={draft.content} onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))} placeholder="수집한 원문을 붙여넣거나 직접 입력하세요." className="mt-2 min-h-80 w-full resize-y rounded-xl border border-border p-3 leading-7 outline-none focus:border-brand-olive" /></label>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-xs text-muted-foreground">{draft.content.length.toLocaleString()}자</span>
        <button type="button" onClick={createProject} disabled={creating || fetchingYoutube || extracting || !draft.title.trim() || !draft.content.trim()} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-olive px-5 text-sm font-bold text-white disabled:opacity-40">{creating ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />} 프로젝트 이름으로 적용</button>
      </div>
    </section>
  </div>;
}
