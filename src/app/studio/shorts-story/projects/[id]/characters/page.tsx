"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ImageIcon, Loader2, Plus, Search, Sparkles, Trash2, WandSparkles, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { storyCharacters, storyExpressions } from "@/features/story/character-options";

type Cue = {
  id: string;
  sort_order: number;
  character_name: string;
  dialogue_excerpt: string;
  emotion: string;
  pose: string;
  insert_note: string;
  built_in_character_id: string | null;
  expression_id: string | null;
  image_url: string | null;
  status: "todo" | "ready" | "done";
};
type AnalyzedCue = { characterName: string; dialogueExcerpt: string; emotion: string; pose: string; insertNote: string };

function splitScriptIntoExcerpts(script: string) {
  return script
    .split(/\n+/)
    .flatMap((paragraph) => paragraph.match(/[^.!?。！？]+[.!?。！？]?/g) ?? [paragraph])
    .map((excerpt) => excerpt.trim())
    .filter((excerpt) => excerpt.length >= 2);
}

export default function StoryCharactersPage() {
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id);
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [projectTitle, setProjectTitle] = useState("사연 프로젝트");
  const [script, setScript] = useState("");
  const [cues, setCues] = useState<Cue[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [schemaReady, setSchemaReady] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [scriptPickerCueId, setScriptPickerCueId] = useState<string | null>(null);
  const [scriptSearch, setScriptSearch] = useState("");

  const scriptExcerpts = useMemo(() => splitScriptIntoExcerpts(script), [script]);
  const filteredExcerpts = useMemo(() => {
    const query = scriptSearch.trim().toLocaleLowerCase("ko-KR");
    const matches = query
      ? scriptExcerpts.filter((excerpt) => excerpt.toLocaleLowerCase("ko-KR").includes(query))
      : scriptExcerpts;
    return matches.slice(0, 50);
  }, [scriptExcerpts, scriptSearch]);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active || !user) return;
      setUserId(user.id);
      const [projectRes, scriptRes, cuesRes] = await Promise.all([
        supabase.from("projects").select("title").eq("id", projectId).single(),
        supabase.from("scripts").select("content").eq("project_id", projectId).maybeSingle(),
        supabase.from("story_character_cues").select("*").eq("project_id", projectId).order("sort_order").order("created_at"),
      ]);
      if (!active) return;
      setProjectTitle(projectRes.data?.title || "사연 프로젝트");
      setScript(scriptRes.data?.content || "");
      if (cuesRes.error?.code === "42P01" || cuesRes.error?.code === "PGRST205") setSchemaReady(false);
      else if (cuesRes.error) setError("캐릭터 작업 목록을 불러오지 못했습니다.");
      else setCues((cuesRes.data ?? []) as Cue[]);
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [projectId, supabase]);

  const analyzeScript = async () => {
    setError(null); setNotice(null);
    if (!userId || !script.trim()) return setError("먼저 대본을 작성해주세요.");
    if (cues.length && !window.confirm("기존 작업 목록에 새 분석 결과를 추가할까요?")) return;
    setAnalyzing(true);
    try {
      const response = await fetch("/api/story/character-cues", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId, script }) });
      const payload = await response.json() as { cues?: AnalyzedCue[]; error?: string };
      if (!response.ok || !payload.cues) throw new Error(payload.error || "대본 분석에 실패했습니다.");
      const rows = payload.cues.map((cue, index) => ({
        project_id: projectId, user_id: userId, sort_order: cues.length + index,
        character_name: cue.characterName, dialogue_excerpt: cue.dialogueExcerpt, emotion: cue.emotion,
        pose: cue.pose, insert_note: cue.insertNote, status: "todo",
      }));
      const { data, error: insertError } = await supabase.from("story_character_cues").insert(rows).select("*");
      if (insertError) throw new Error("분석 결과 저장에 실패했습니다.");
      setCues((current) => [...current, ...((data ?? []) as Cue[])]);
      setNotice(`${data?.length ?? 0}개의 캐릭터 장면을 찾았습니다.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "대본 분석 중 오류가 발생했습니다.");
    } finally {
      setAnalyzing(false);
    }
  };

  const addCue = async () => {
    if (!userId) return;
    const { data, error: insertError } = await supabase.from("story_character_cues").insert({ project_id: projectId, user_id: userId, sort_order: cues.length, character_name: "등장인물", emotion: "무표정", pose: "정면 기본 자세" }).select("*").single();
    if (insertError || !data) return setError("작업 추가에 실패했습니다.");
    setCues((current) => [...current, data as Cue]);
    setScriptSearch("");
    setScriptPickerCueId(data.id);
  };

  const updateCue = async (cue: Cue, changes: Partial<Cue>) => {
    const next = { ...cue, ...changes };
    setCues((current) => current.map((item) => item.id === cue.id ? next : item));
    const ready = Boolean(next.built_in_character_id && next.expression_id);
    const { error: updateError } = await supabase.from("story_character_cues").update({ ...changes, status: next.image_url ? "done" : ready ? "ready" : "todo", updated_at: new Date().toISOString() }).eq("id", cue.id);
    if (updateError) setError("작업 수정에 실패했습니다.");
  };

  const deleteCue = async (id: string) => {
    if (!window.confirm("이 캐릭터 작업을 삭제할까요?")) return;
    const { error: deleteError } = await supabase.from("story_character_cues").delete().eq("id", id);
    if (deleteError) return setError("삭제에 실패했습니다.");
    setCues((current) => current.filter((item) => item.id !== id));
  };

  const openScriptPicker = (cueId: string) => {
    setScriptSearch("");
    setScriptPickerCueId(cueId);
  };

  const selectScriptExcerpt = async (excerpt: string) => {
    const cue = cues.find((item) => item.id === scriptPickerCueId);
    if (!cue) return;
    await updateCue(cue, { dialogue_excerpt: excerpt });
    setScriptPickerCueId(null);
    setScriptSearch("");
    setNotice("대본 구절을 작업에 연결했습니다.");
  };

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="animate-spin text-brand-olive" /></div>;
  if (!schemaReady) return <div className="mx-auto max-w-xl rounded-2xl border border-amber-200 bg-white p-7 shadow-sm"><h1 className="text-lg font-bold">캐릭터 테이블 설정이 필요합니다</h1><p className="mt-3 text-sm text-muted-foreground">Supabase에서 `20260718_story_characters.sql`을 실행해주세요.</p><Link href={`/studio/shorts-story/projects/${projectId}`} className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-brand-olive"><ArrowLeft size={15} /> 워크벤치</Link></div>;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><Link href={`/studio/shorts-story/projects/${projectId}`} className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-brand-olive"><ArrowLeft size={15} /> 워크벤치</Link><h1 className="mt-3 text-2xl font-bold sm:text-3xl">캐릭터 작업 목록</h1><p className="mt-1 text-sm text-muted-foreground">{projectTitle} · 대본 {script.length.toLocaleString()}자</p></div><div className="flex gap-2"><button onClick={addCue} className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-bold"><Plus size={15} /> 직접 추가</button><button onClick={analyzeScript} disabled={analyzing || !script} className="inline-flex items-center gap-2 rounded-xl bg-brand-olive px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{analyzing ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} 대본에서 찾기</button></div></div>
      {(error || notice) && <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{error || notice}</div>}
      {cues.length === 0 ? <div className="rounded-2xl border border-dashed border-border bg-white p-12 text-center"><WandSparkles size={34} className="mx-auto text-muted-foreground/40" /><p className="mt-3 font-bold">아직 캐릭터 작업이 없습니다</p><p className="mt-1 text-sm text-muted-foreground">대본에서 필요한 장면을 자동으로 찾거나 직접 추가하세요.</p></div> : <div className="grid gap-4 lg:grid-cols-2">{cues.map((cue, index) => {
        const generatorParams = new URLSearchParams({ project_id: String(projectId), cue_id: cue.id, character: cue.built_in_character_id || "", expression: cue.expression_id || "", pose: cue.pose });
        return <article key={cue.id} className={`rounded-2xl border bg-white p-5 shadow-sm ${cue.image_url ? "border-emerald-200" : "border-border"}`}>
          <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-cream text-xs font-extrabold text-brand-olive-dark">{index + 1}</span><input value={cue.character_name} onChange={(event) => setCues((current) => current.map((item) => item.id === cue.id ? { ...item, character_name: event.target.value } : item))} onBlur={(event) => updateCue(cue, { character_name: event.target.value })} className="min-w-0 flex-1 border-0 text-sm font-bold outline-none" /></div><button onClick={() => deleteCue(cue.id)} className="rounded-lg p-2 text-muted-foreground hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button></div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {cue.image_url && <img src={cue.image_url} alt={cue.character_name} className="mt-3 aspect-video w-full rounded-xl bg-stone-50 object-contain" />}
          <div className="mt-3 flex items-center justify-between gap-2"><span className="text-xs font-bold text-muted-foreground">이미지가 들어갈 대본 구절</span><button type="button" onClick={() => openScriptPicker(cue.id)} disabled={!script} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-2.5 py-1.5 text-[11px] font-bold text-brand-olive hover:border-brand-olive disabled:cursor-not-allowed disabled:opacity-40"><Search size={12} /> 대본에서 구절 찾기</button></div>
          <textarea value={cue.dialogue_excerpt} onChange={(event) => setCues((current) => current.map((item) => item.id === cue.id ? { ...item, dialogue_excerpt: event.target.value } : item))} onBlur={(event) => updateCue(cue, { dialogue_excerpt: event.target.value })} placeholder="대본에서 구절을 찾거나 직접 입력하세요" className="mt-2 min-h-20 w-full rounded-lg border border-border bg-stone-50 p-3 text-xs leading-5 outline-none focus:border-brand-olive" />
          <div className="mt-3 grid grid-cols-2 gap-2"><select value={cue.built_in_character_id || ""} onChange={(event) => updateCue(cue, { built_in_character_id: event.target.value || null })} className="h-10 rounded-lg border border-border bg-white px-2 text-xs"><option value="">캐릭터 선택</option>{storyCharacters.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select value={cue.expression_id || ""} onChange={(event) => updateCue(cue, { expression_id: event.target.value || null })} className="h-10 rounded-lg border border-border bg-white px-2 text-xs"><option value="">표정 선택</option>{storyExpressions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
          <input value={cue.pose} onChange={(event) => setCues((current) => current.map((item) => item.id === cue.id ? { ...item, pose: event.target.value } : item))} onBlur={(event) => updateCue(cue, { pose: event.target.value })} placeholder="포즈 설명" className="mt-2 h-10 w-full rounded-lg border border-border px-3 text-xs outline-none focus:border-brand-olive" />
          <div className="mt-3 flex items-center justify-between"><span className="text-[11px] font-semibold text-muted-foreground">감정: {cue.emotion}</span><Link href={`/post/image?${generatorParams.toString()}`} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold ${cue.built_in_character_id && cue.expression_id ? "bg-brand-olive text-white" : "pointer-events-none bg-muted text-muted-foreground"}`}><ImageIcon size={13} /> {cue.image_url ? "다시 만들기" : "이미지 만들기"}</Link></div>
        </article>;
      })}</div>}
      {scriptPickerCueId && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setScriptPickerCueId(null); }}>
        <div role="dialog" aria-modal="true" aria-labelledby="script-picker-title" className="flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-4 border-b border-border p-5"><div><h2 id="script-picker-title" className="text-lg font-bold">대본에서 구절 찾기</h2><p className="mt-1 text-xs text-muted-foreground">이미지가 들어갈 문장을 선택하세요. 선택 즉시 작업에 저장됩니다.</p></div><button type="button" onClick={() => setScriptPickerCueId(null)} aria-label="닫기" className="rounded-lg p-2 text-muted-foreground hover:bg-muted"><X size={18} /></button></div>
          <div className="border-b border-border p-4"><label className="flex h-11 items-center gap-2 rounded-xl border border-border bg-stone-50 px-3 focus-within:border-brand-olive"><Search size={16} className="text-muted-foreground" /><input autoFocus value={scriptSearch} onChange={(event) => setScriptSearch(event.target.value)} placeholder="대본 내용 검색" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /><span className="text-[11px] font-semibold text-muted-foreground">{filteredExcerpts.length}개</span></label></div>
          <div className="flex-1 overflow-y-auto p-3">{filteredExcerpts.length > 0 ? <div className="space-y-2">{filteredExcerpts.map((excerpt, index) => <button type="button" key={`${excerpt}-${index}`} onClick={() => selectScriptExcerpt(excerpt)} className="group flex w-full items-start gap-3 rounded-xl border border-transparent p-3 text-left hover:border-brand-olive/30 hover:bg-brand-cream/50"><span className="mt-0.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground group-hover:bg-brand-olive group-hover:text-white">{index + 1}</span><span className="text-sm leading-6 text-foreground">{excerpt}</span></button>)}</div> : <div className="py-14 text-center"><Search size={28} className="mx-auto text-muted-foreground/40" /><p className="mt-3 text-sm font-bold">검색 결과가 없습니다</p><p className="mt-1 text-xs text-muted-foreground">다른 단어로 검색해보세요.</p></div>}</div>
        </div>
      </div>}
    </div>
  );
}
