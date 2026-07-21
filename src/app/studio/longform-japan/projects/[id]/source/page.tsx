"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ArrowRight, ExternalLink, Library, Loader2, Play, Plus, Save, Search, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { productionTypes } from "@/lib/project-workflows";

type Source = {
  id: string;
  title: string;
  source_url: string | null;
  korean_transcript: string;
  created_at: string;
};

type ResearchSource = {
  id: number;
  category: string;
  title: string | null;
  url: string;
  memo: string | null;
  created_at: string;
};

const emptyDraft = { id: "", title: "", sourceUrl: "", transcript: "" };

export default function JapanLongformSourcePage() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);
  const supabase = useMemo(() => createClient(), []);
  const [projectTitle, setProjectTitle] = useState("");
  const [userId, setUserId] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [researchSources, setResearchSources] = useState<ResearchSource[]>([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [librarySearch, setLibrarySearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingProjectTitle, setSavingProjectTitle] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;
      if (!user) {
        setError("로그인이 필요합니다.");
        setLoading(false);
        return;
      }
      setUserId(user.id);
      const [projectRes, sourcesRes, researchRes] = await Promise.all([
        supabase.from("projects").select("title").eq("id", projectId).eq("production_type", productionTypes.longformJapan).maybeSingle(),
        supabase.from("japan_longform_sources").select("id, title, source_url, korean_transcript, created_at").eq("project_id", projectId).order("created_at", { ascending: false }),
        supabase.from("research_sources").select("id, category, title, url, memo, created_at").ilike("category", "%일본%").order("created_at", { ascending: false }),
      ]);
      if (!active) return;
      if (!projectRes.data) setError("일본 롱폼 프로젝트를 찾을 수 없습니다.");
      else setProjectTitle(projectRes.data.title);
      if (sourcesRes.error) setError("원문 데이터를 불러오지 못했습니다. Supabase 마이그레이션 적용 여부를 확인해주세요.");
      else setSources((sourcesRes.data ?? []) as Source[]);
      if (!researchRes.error) setResearchSources((researchRes.data ?? []) as ResearchSource[]);
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [projectId, supabase]);

  const clearMessage = () => { setError(""); setNotice(""); };

  async function fetchYoutube(sourceUrl = draft.sourceUrl.trim(), sourceTitle = draft.title) {
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
        title: sourceTitle || payload.data?.title || current.title,
        transcript: payload.data?.transcript || current.transcript,
      }));
      setNotice(payload.data?.transcript ? "제목과 자막을 가져왔습니다. 내용을 확인한 뒤 저장해주세요." : "제목은 가져왔지만 공개 자막이 없습니다. 원문을 직접 붙여넣어주세요.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "YouTube 원문을 가져오지 못했습니다.");
    } finally {
      setFetching(false);
    }
  }

  async function importFromLibrary(source: ResearchSource) {
    setLibraryOpen(false);
    setDraft({ id: "", title: source.title || "영상소스 원문", sourceUrl: source.url, transcript: "" });
    await fetchYoutube(source.url, source.title || "");
  }

  async function saveSource() {
    clearMessage();
    if (!userId || !draft.title.trim() || !draft.transcript.trim()) return setError("제목과 한국어 원문을 입력해주세요.");
    setSaving(true);
    const values = {
      project_id: projectId,
      user_id: userId,
      source_kind: draft.sourceUrl.trim() ? "youtube" : "text",
      title: draft.title.trim(),
      source_url: draft.sourceUrl.trim() || null,
      korean_transcript: draft.transcript.trim(),
      updated_at: new Date().toISOString(),
    };
    const response = draft.id
      ? await supabase.from("japan_longform_sources").update(values).eq("id", draft.id).select("id, title, source_url, korean_transcript, created_at").single()
      : await supabase.from("japan_longform_sources").insert(values).select("id, title, source_url, korean_transcript, created_at").single();
    setSaving(false);
    if (response.error || !response.data) return setError("원문 저장에 실패했습니다.");
    const saved = response.data as Source;
    setSources((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
    setDraft(emptyDraft);
    setNotice("원문을 저장했습니다.");
  }

  async function applyProjectTitle(title = draft.title) {
    clearMessage();
    const nextTitle = title.trim();
    if (!nextTitle) return setError("프로젝트에 적용할 원문 제목이 없습니다.");
    if (nextTitle === projectTitle) return setNotice("이미 같은 프로젝트 이름을 사용하고 있습니다.");
    if (!window.confirm(`프로젝트 이름을 ‘${nextTitle}’(으)로 바꿀까요?`)) return;
    setSavingProjectTitle(true);
    const { error: updateError } = await supabase.from("projects").update({
      title: nextTitle,
      updated_at: new Date().toISOString(),
    }).eq("id", projectId).eq("production_type", productionTypes.longformJapan);
    setSavingProjectTitle(false);
    if (updateError) return setError("프로젝트 이름 변경에 실패했습니다.");
    setProjectTitle(nextTitle);
    setNotice("가져온 제목으로 프로젝트 이름을 변경했습니다.");
  }

  async function deleteSource(sourceId: string) {
    if (!window.confirm("이 원문을 삭제할까요?")) return;
    const { error: deleteError } = await supabase.from("japan_longform_sources").delete().eq("id", sourceId);
    if (deleteError) return setError("원문 삭제에 실패했습니다.");
    setSources((current) => current.filter((item) => item.id !== sourceId));
    if (draft.id === sourceId) setDraft(emptyDraft);
  }

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="animate-spin text-sky-700" /></div>;

  const filteredResearchSources = researchSources.filter((source) => {
    const keyword = librarySearch.trim().toLocaleLowerCase("ko");
    if (!keyword) return true;
    return [source.title, source.category, source.memo, source.url].some((value) => value?.toLocaleLowerCase("ko").includes(keyword));
  });

  return <div className="mx-auto max-w-6xl space-y-5">
    <Link href={`/studio/longform-japan/projects/${projectId}`} className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-sky-700"><ArrowLeft size={16} /> 워크벤치</Link>
    <header><p className="text-sm font-bold text-sky-700">{projectTitle}</p><h1 className="mt-1 text-3xl font-bold">한국 원문 수집</h1><p className="mt-2 text-sm text-muted-foreground">한국 YouTube 자막을 가져오거나 준비한 원문을 직접 붙여넣습니다.</p></header>
    {(error || notice) && <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{error || notice}</div>}
    <section className="rounded-2xl border border-sky-100 bg-sky-50/60 p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="flex items-center gap-2 font-bold"><Library size={18} className="text-sky-700" /> 영상소스모음에서 가져오기</h2><p className="mt-1 text-xs text-muted-foreground">카테고리 이름에 ‘일본’이 포함된 영상만 표시됩니다.</p></div><button onClick={() => setLibraryOpen((current) => !current)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 text-sm font-bold text-white"><Library size={16} /> {libraryOpen ? "목록 닫기" : `영상 선택 (${researchSources.length})`}</button></div>
      {libraryOpen && <div className="mt-4 rounded-2xl border border-sky-100 bg-white p-4">
        <div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={librarySearch} onChange={(event) => setLibrarySearch(event.target.value)} placeholder="제목, 카테고리, 메모 검색" className="h-10 w-full rounded-xl border border-border pl-9 pr-9 text-sm outline-none focus:border-sky-600" />{librarySearch && <button onClick={() => setLibrarySearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"><X size={15} /></button>}</div>
        <div className="mt-3 grid max-h-96 gap-3 overflow-y-auto md:grid-cols-2">{filteredResearchSources.length === 0 && <p className="col-span-full rounded-xl bg-muted p-4 text-center text-sm text-muted-foreground">‘일본’ 카테고리 영상이 없습니다.</p>}{filteredResearchSources.map((source) => <article key={source.id} className="flex flex-col rounded-xl border border-border p-4"><span className="w-fit rounded-full bg-sky-50 px-2 py-1 text-[11px] font-bold text-sky-700">{source.category}</span><h3 className="mt-2 line-clamp-2 font-bold">{source.title || "제목 없는 영상"}</h3>{source.memo && <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{source.memo}</p>}<div className="mt-3 flex items-center gap-2"><a href={source.url} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-xs font-bold"><ExternalLink size={13} /> 영상 보기</a><button onClick={() => importFromLibrary(source)} disabled={fetching} className="inline-flex h-9 flex-1 items-center justify-center gap-1 rounded-lg bg-brand-olive px-3 text-xs font-bold text-white disabled:opacity-50">{fetching ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />} 이 영상 가져오기</button></div></article>)}</div>
      </div>}
    </section>
    <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
      <section className="space-y-4 rounded-2xl border border-border bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between"><h2 className="font-bold">{draft.id ? "원문 수정" : "새 원문"}</h2>{draft.id && <button onClick={() => setDraft(emptyDraft)} className="inline-flex items-center gap-1 text-sm font-bold text-sky-700"><Plus size={15} /> 새로 작성</button>}</div>
        <label className="block text-sm font-semibold">YouTube 주소<input value={draft.sourceUrl} onChange={(event) => setDraft({ ...draft, sourceUrl: event.target.value })} placeholder="https://www.youtube.com/watch?v=..." className="mt-2 h-11 w-full rounded-xl border border-border px-3 outline-none focus:border-sky-600" /></label>
        <button onClick={() => fetchYoutube()} disabled={fetching} className="inline-flex h-10 items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 text-sm font-bold text-sky-700 disabled:opacity-50">{fetching ? <Loader2 size={16} className="animate-spin" /> : <Play size={17} />} YouTube 제목·자막 가져오기</button>
        <label className="block text-sm font-semibold">원문 제목<div className="mt-2 flex flex-col gap-2 sm:flex-row"><input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className="h-11 min-w-0 flex-1 rounded-xl border border-border px-3 outline-none focus:border-sky-600" /><button type="button" onClick={() => applyProjectTitle()} disabled={savingProjectTitle || !draft.title.trim()} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-brand-olive px-4 text-sm font-bold text-brand-olive disabled:opacity-40">{savingProjectTitle ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} 프로젝트 이름으로 적용</button></div></label>
        <label className="block text-sm font-semibold">한국어 원문<textarea value={draft.transcript} onChange={(event) => setDraft({ ...draft, transcript: event.target.value })} placeholder="자막을 가져오지 못한 경우 여기에 직접 붙여넣으세요." className="mt-2 min-h-80 w-full resize-y rounded-xl border border-border p-3 leading-7 outline-none focus:border-sky-600" /></label>
        <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">{draft.transcript.length.toLocaleString()}자</span><button onClick={saveSource} disabled={saving} className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-olive px-5 text-sm font-bold text-white disabled:opacity-50">{saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} 저장</button></div>
      </section>
      <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between"><h2 className="font-bold">저장된 원문</h2><span className="text-xs font-bold text-muted-foreground">{sources.length}개</span></div>
        <div className="mt-4 space-y-3">{sources.length === 0 && <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">아직 저장된 원문이 없습니다.</p>}{sources.map((source) => <article key={source.id} className="rounded-xl border border-border p-4"><button onClick={() => setDraft({ id: source.id, title: source.title, sourceUrl: source.source_url || "", transcript: source.korean_transcript })} className="w-full text-left"><p className="font-bold">{source.title}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{source.korean_transcript}</p></button><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><button type="button" onClick={() => applyProjectTitle(source.title)} disabled={savingProjectTitle || source.title === projectTitle} className="inline-flex items-center gap-1 text-xs font-bold text-brand-olive disabled:text-muted-foreground disabled:opacity-60">{savingProjectTitle ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} {source.title === projectTitle ? "현재 프로젝트 이름" : "프로젝트 이름으로 적용"}</button><button onClick={() => deleteSource(source.id)} className="inline-flex items-center gap-1 text-xs font-bold text-red-600"><Trash2 size={14} /> 삭제</button></div></article>)}</div>
        {sources.length > 0 && <Link href={`/studio/longform-japan/projects/${projectId}/adapt`} className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-sky-700 text-sm font-bold text-white">Claude 각색으로 <ArrowRight size={16} /></Link>}
      </section>
    </div>
  </div>;
}
