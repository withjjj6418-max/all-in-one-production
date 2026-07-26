"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, ExternalLink, Library, Loader2, Play, Search, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { productionTypes } from "@/lib/project-workflows";

type ResearchSource = {
  id: number;
  category: string;
  title: string | null;
  url: string;
  memo: string | null;
};

const emptyDraft = { title: "", sourceUrl: "", transcript: "" };

export default function JapanLongformNewSourcePage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState("");
  const [researchSources, setResearchSources] = useState<ResearchSource[]>([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [librarySearch, setLibrarySearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      const [{ data: { user } }, researchResult] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from("research_sources").select("id, category, title, url, memo").ilike("category", "%일본%").order("created_at", { ascending: false }),
      ]);
      if (!active) return;
      if (!user) setError("로그인이 필요합니다.");
      else setUserId(user.id);
      if (!researchResult.error) setResearchSources((researchResult.data || []) as ResearchSource[]);
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [supabase]);

  const clearMessage = () => { setError(""); setNotice(""); };

  async function fetchYoutube(sourceUrl = draft.sourceUrl.trim(), preferredTitle = draft.title.trim()) {
    clearMessage();
    if (!sourceUrl) return setError("YouTube 주소를 먼저 입력해주세요.");
    setFetching(true);
    try {
      const response = await fetch(`/api/youtube/transcript?url=${encodeURIComponent(sourceUrl)}`);
      const payload = await response.json() as { success?: boolean; error?: string; data?: { title?: string; transcript?: string | null } };
      if (!response.ok || !payload.success) throw new Error(payload.error || "YouTube 정보를 가져오지 못했습니다.");
      setDraft((current) => ({
        ...current,
        sourceUrl,
        title: preferredTitle || payload.data?.title || current.title,
        transcript: payload.data?.transcript || current.transcript,
      }));
      setNotice(payload.data?.transcript
        ? "제목과 자막을 가져왔습니다. 프로젝트 이름과 원문을 확인해주세요."
        : "제목은 가져왔지만 공개 자막이 없습니다. 원문을 직접 붙여넣어주세요.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "YouTube 원문을 가져오지 못했습니다.");
    } finally {
      setFetching(false);
    }
  }

  async function importFromLibrary(source: ResearchSource) {
    setLibraryOpen(false);
    const title = source.title || "영상소스 원문";
    setDraft({ title, sourceUrl: source.url, transcript: "" });
    await fetchYoutube(source.url, title);
  }

  async function createProjectFromSource() {
    clearMessage();
    const title = draft.title.trim();
    const transcript = draft.transcript.trim();
    if (!userId) return setError("로그인이 필요합니다.");
    if (!title) return setError("프로젝트 이름을 입력해주세요.");
    if (!transcript) return setError("프로젝트에 저장할 한국어 원문을 입력해주세요.");
    setCreating(true);
    const now = new Date().toISOString();
    const { data: project, error: projectError } = await supabase.from("projects").insert({
      user_id: userId,
      title,
      production_type: productionTypes.longformJapan,
      status: "시작 전",
      progress: 0,
      uploaded: false,
      updated_at: now,
    }).select("id").single();
    if (projectError || !project) {
      setCreating(false);
      return setError("새 일본 롱폼 프로젝트를 만들지 못했습니다.");
    }
    const { error: sourceError } = await supabase.from("japan_longform_sources").insert({
      project_id: project.id,
      user_id: userId,
      source_kind: draft.sourceUrl.trim() ? "youtube" : "text",
      title,
      source_url: draft.sourceUrl.trim() || null,
      korean_transcript: transcript,
      updated_at: now,
    });
    if (sourceError) {
      await supabase.from("projects").delete().eq("id", project.id).eq("user_id", userId);
      setCreating(false);
      return setError("프로젝트는 만들었지만 원문을 저장하지 못해 생성을 취소했습니다. 잠시 후 다시 시도해주세요.");
    }
    window.localStorage.setItem("last-longform-japan-project-id", String(project.id));
    router.push(`/studio/longform-japan/projects/${project.id}/adapt`);
  }

  const filteredResearchSources = researchSources.filter((source) => {
    const keyword = librarySearch.trim().toLocaleLowerCase("ko");
    if (!keyword) return true;
    return [source.title, source.category, source.memo, source.url].some((value) => value?.toLocaleLowerCase("ko").includes(keyword));
  });

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="animate-spin text-sky-700" /></div>;

  return <div className="mx-auto max-w-6xl space-y-5">
    <Link href="/studio/longform-japan" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-sky-700"><ArrowLeft size={16} /> 일본 롱폼 프로젝트</Link>
    <header><p className="text-sm font-bold text-sky-700">새 제작 시작</p><h1 className="mt-1 text-3xl font-bold">원문수집 · 새 프로젝트 만들기</h1><p className="mt-2 text-sm text-muted-foreground">영상소스모음에서 가져오거나 원문을 직접 입력한 뒤, 프로젝트 이름으로 적용하면 새 프로젝트가 생성됩니다.</p></header>
    {(error || notice) && <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{error || notice}</div>}

    <section className="rounded-2xl border border-sky-100 bg-sky-50/60 p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="flex items-center gap-2 font-bold"><Library size={18} className="text-sky-700" /> 영상소스모음에서 가져오기</h2><p className="mt-1 text-xs text-muted-foreground">카테고리 이름에 ‘일본’이 포함된 영상만 표시됩니다.</p></div><button onClick={() => setLibraryOpen((current) => !current)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 text-sm font-bold text-white"><Library size={16} /> {libraryOpen ? "목록 닫기" : `영상 선택 (${researchSources.length})`}</button></div>
      {libraryOpen && <div className="mt-4 rounded-2xl border border-sky-100 bg-white p-4"><div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={librarySearch} onChange={(event) => setLibrarySearch(event.target.value)} placeholder="제목, 카테고리, 메모 검색" className="h-10 w-full rounded-xl border border-border pl-9 pr-9 text-sm outline-none focus:border-sky-600" />{librarySearch && <button onClick={() => setLibrarySearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"><X size={15} /></button>}</div><div className="mt-3 grid max-h-96 gap-3 overflow-y-auto md:grid-cols-2">{filteredResearchSources.length === 0 && <p className="col-span-full rounded-xl bg-muted p-4 text-center text-sm text-muted-foreground">‘일본’ 카테고리 영상이 없습니다.</p>}{filteredResearchSources.map((source) => <article key={source.id} className="flex flex-col rounded-xl border border-border p-4"><span className="w-fit rounded-full bg-sky-50 px-2 py-1 text-[11px] font-bold text-sky-700">{source.category}</span><h3 className="mt-2 line-clamp-2 font-bold">{source.title || "제목 없는 영상"}</h3>{source.memo && <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{source.memo}</p>}<div className="mt-3 flex items-center gap-2"><a href={source.url} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-xs font-bold"><ExternalLink size={13} /> 영상 보기</a><button onClick={() => importFromLibrary(source)} disabled={fetching} className="inline-flex h-9 flex-1 items-center justify-center gap-1 rounded-lg bg-brand-olive px-3 text-xs font-bold text-white disabled:opacity-50">{fetching ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />} 이 영상 가져오기</button></div></article>)}</div></div>}
    </section>

    <section className="space-y-4 rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-6">
      <div><h2 className="text-lg font-bold">새 프로젝트 원문</h2><p className="mt-1 text-xs text-muted-foreground">아래 내용은 기존 프로젝트를 변경하지 않고 새로운 일본 롱폼 프로젝트로 저장됩니다.</p></div>
      <label className="block text-sm font-semibold">YouTube 주소<input value={draft.sourceUrl} onChange={(event) => setDraft({ ...draft, sourceUrl: event.target.value })} placeholder="https://www.youtube.com/watch?v=..." className="mt-2 h-11 w-full rounded-xl border border-border px-3 outline-none focus:border-sky-600" /></label>
      <button onClick={() => fetchYoutube()} disabled={fetching || creating} className="inline-flex h-10 items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 text-sm font-bold text-sky-700 disabled:opacity-50">{fetching ? <Loader2 size={16} className="animate-spin" /> : <Play size={17} />} YouTube 제목·자막 가져오기</button>
      <label className="block text-sm font-semibold">프로젝트 이름<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="가져온 제목을 수정해도 됩니다" className="mt-2 h-11 w-full rounded-xl border border-border px-3 outline-none focus:border-sky-600" /></label>
      <label className="block text-sm font-semibold">한국어 원문<textarea value={draft.transcript} onChange={(event) => setDraft({ ...draft, transcript: event.target.value })} placeholder="자막을 가져오지 못한 경우 여기에 직접 붙여넣으세요." className="mt-2 min-h-80 w-full resize-y rounded-xl border border-border p-3 leading-7 outline-none focus:border-sky-600" /></label>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><span className="text-xs text-muted-foreground">{draft.transcript.length.toLocaleString()}자</span><button onClick={createProjectFromSource} disabled={creating || fetching || !draft.title.trim() || !draft.transcript.trim()} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-olive px-5 text-sm font-bold text-white disabled:opacity-40">{creating ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />} 프로젝트 이름으로 적용</button></div>
    </section>
  </div>;
}
