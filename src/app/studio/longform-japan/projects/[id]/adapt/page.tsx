"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Copy, ExternalLink, Loader2, Save } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Source = { id: string; title: string; korean_transcript: string };

export default function JapanLongformAdaptPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);
  const supabase = useMemo(() => createClient(), []);
  const [projectTitle, setProjectTitle] = useState("");
  const [userId, setUserId] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [adapted, setAdapted] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "notice"; text: string } | null>(null);
  const selected = sources.find((source) => source.id === sourceId);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;
      if (!user) { setMessage({ kind: "error", text: "로그인이 필요합니다." }); setLoading(false); return; }
      setUserId(user.id);
      const [projectRes, sourcesRes, scriptRes] = await Promise.all([
        supabase.from("projects").select("title").eq("id", projectId).maybeSingle(),
        supabase.from("japan_longform_sources").select("id, title, korean_transcript").eq("project_id", projectId).order("created_at", { ascending: false }),
        supabase.from("japan_longform_scripts").select("source_id, adapted_korean").eq("project_id", projectId).maybeSingle(),
      ]);
      if (!active) return;
      setProjectTitle(projectRes.data?.title || "일본 롱폼 프로젝트");
      if (sourcesRes.error || scriptRes.error) setMessage({ kind: "error", text: "각색 데이터를 불러오지 못했습니다." });
      const loaded = (sourcesRes.data ?? []) as Source[];
      setSources(loaded);
      setSourceId(scriptRes.data?.source_id || loaded[0]?.id || "");
      setAdapted(scriptRes.data?.adapted_korean || "");
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [projectId, supabase]);

  async function copySource() {
    if (!selected) return setMessage({ kind: "error", text: "먼저 원문을 선택해주세요." });
    try {
      await navigator.clipboard.writeText(selected.korean_transcript);
      setMessage({ kind: "notice", text: "원문을 복사했습니다. Claude 프로젝트에 붙여넣어 각색해주세요." });
    } catch {
      setMessage({ kind: "error", text: "클립보드 복사에 실패했습니다." });
    }
  }

  async function copyAndOpenClaude() {
    if (!selected) return setMessage({ kind: "error", text: "먼저 원문을 선택해주세요." });
    const claudeWindow = window.open("https://claude.ai/projects", "_blank", "noopener,noreferrer");
    try {
      await navigator.clipboard.writeText(selected.korean_transcript);
      setMessage({ kind: "notice", text: "원문을 복사하고 Claude 프로젝트를 열었습니다." });
    } catch {
      claudeWindow?.close();
      setMessage({ kind: "error", text: "원문 복사에 실패했습니다." });
    }
  }

  async function save() {
    if (!userId || !sourceId || !adapted.trim()) return setMessage({ kind: "error", text: "원문을 선택하고 Claude 각색 결과를 붙여넣어주세요." });
    setSaving(true);
    const { error } = await supabase.from("japan_longform_scripts").upsert({
      project_id: projectId,
      user_id: userId,
      source_id: sourceId,
      adapted_korean: adapted.trim(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "project_id" });
    setSaving(false);
    setMessage(error ? { kind: "error", text: "각색본 저장에 실패했습니다." } : { kind: "notice", text: "한국어 각색본을 저장했습니다." });
  }

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="animate-spin text-sky-700" /></div>;

  return <div className="mx-auto max-w-6xl space-y-5">
    <Link href={`/studio/longform-japan/projects/${projectId}`} className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-sky-700"><ArrowLeft size={16} /> 워크벤치</Link>
    <header><p className="text-sm font-bold text-sky-700">{projectTitle}</p><h1 className="mt-1 text-3xl font-bold">Claude 한국어 각색</h1><p className="mt-2 text-sm text-muted-foreground">원문을 복사해 기존 Claude 프로젝트 지침으로 15~20분 분량을 각색한 뒤 결과를 붙여넣습니다.</p></header>
    {message && <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${message.kind === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{message.text}</div>}
    {sources.length === 0 ? <section className="rounded-2xl border border-border bg-white p-8 text-center shadow-sm"><p className="font-bold">저장된 원문이 없습니다.</p><Link href={`/studio/longform-japan/projects/${projectId}/source`} className="mt-4 inline-flex h-10 items-center rounded-xl bg-sky-700 px-4 text-sm font-bold text-white">원문 수집으로 이동</Link></section> : <div className="grid gap-5 lg:grid-cols-2">
      <section className="space-y-4 rounded-2xl border border-border bg-white p-5 shadow-sm">
        <label className="block text-sm font-semibold">각색할 원문<select value={sourceId} onChange={(event) => setSourceId(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-border bg-white px-3">{sources.map((source) => <option key={source.id} value={source.id}>{source.title}</option>)}</select></label>
        <div className="max-h-[520px] overflow-y-auto whitespace-pre-wrap rounded-xl bg-muted p-4 text-sm leading-7">{selected?.korean_transcript}</div>
        <div className="flex flex-wrap gap-2"><button onClick={copySource} className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-bold"><Copy size={16} /> 원문 복사</button><button onClick={copyAndOpenClaude} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#D97757] px-4 text-sm font-bold text-white"><ExternalLink size={16} /> 복사하고 Claude 열기</button></div>
      </section>
      <section className="space-y-4 rounded-2xl border border-border bg-white p-5 shadow-sm">
        <div><h2 className="font-bold">Claude 각색 결과</h2><p className="mt-1 text-xs text-muted-foreground">Claude에서 완성된 한국어 대본 전체를 붙여넣으세요.</p></div>
        <textarea value={adapted} onChange={(event) => setAdapted(event.target.value)} placeholder="여기에 Claude 각색 결과를 붙여넣으세요." className="min-h-[500px] w-full resize-y rounded-xl border border-border p-4 leading-7 outline-none focus:border-sky-600" />
        <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">{adapted.length.toLocaleString()}자</span><button onClick={save} disabled={saving} className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-olive px-5 text-sm font-bold text-white disabled:opacity-50">{saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} 각색본 저장</button></div>
        {adapted.trim() && <Link href={`/studio/longform-japan/projects/${projectId}/script`} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-sky-700 text-sm font-bold text-white">대본 수정으로 <ArrowRight size={16} /></Link>}
      </section>
    </div>}
  </div>;
}
