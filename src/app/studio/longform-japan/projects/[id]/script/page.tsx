"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2, RotateCcw, Save } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function JapanLongformScriptPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);
  const supabase = useMemo(() => createClient(), []);
  const [projectTitle, setProjectTitle] = useState("");
  const [userId, setUserId] = useState("");
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [adapted, setAdapted] = useState("");
  const [script, setScript] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "notice"; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;
      if (!user) { setMessage({ kind: "error", text: "로그인이 필요합니다." }); setLoading(false); return; }
      setUserId(user.id);
      const [projectRes, scriptRes] = await Promise.all([
        supabase.from("projects").select("title").eq("id", projectId).maybeSingle(),
        supabase.from("japan_longform_scripts").select("source_id, adapted_korean, final_korean").eq("project_id", projectId).maybeSingle(),
      ]);
      if (!active) return;
      setProjectTitle(projectRes.data?.title || "일본 롱폼 프로젝트");
      if (scriptRes.error) setMessage({ kind: "error", text: "대본을 불러오지 못했습니다." });
      else if (!scriptRes.data?.adapted_korean) setMessage({ kind: "error", text: "먼저 Claude 각색본을 저장해주세요." });
      const adaptedKorean = scriptRes.data?.adapted_korean || "";
      setSourceId(scriptRes.data?.source_id || null);
      setAdapted(adaptedKorean);
      setScript(scriptRes.data?.final_korean || adaptedKorean);
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [projectId, supabase]);

  async function save() {
    if (!userId || !script.trim()) return setMessage({ kind: "error", text: "저장할 한국어 대본이 없습니다." });
    setSaving(true);
    const { error } = await supabase.from("japan_longform_scripts").upsert({
      project_id: projectId,
      user_id: userId,
      source_id: sourceId,
      adapted_korean: adapted,
      final_korean: script.trim(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "project_id" });
    setSaving(false);
    setMessage(error ? { kind: "error", text: "최종 한국어 대본 저장에 실패했습니다." } : { kind: "notice", text: "최종 한국어 대본을 저장했습니다." });
  }

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="animate-spin text-sky-700" /></div>;

  return <div className="mx-auto max-w-5xl space-y-5">
    <Link href={`/studio/longform-japan/projects/${projectId}`} className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-sky-700"><ArrowLeft size={16} /> 워크벤치</Link>
    <header><p className="text-sm font-bold text-sky-700">{projectTitle}</p><h1 className="mt-1 text-3xl font-bold">한국어 대본 수정</h1><p className="mt-2 text-sm text-muted-foreground">일본어 번역 전에 내용, 호흡, 문장 흐름을 최종 확정합니다.</p></header>
    {message && <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${message.kind === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{message.text}</div>}
    {!adapted ? <section className="rounded-2xl border border-border bg-white p-8 text-center shadow-sm"><p className="font-bold">저장된 Claude 각색본이 없습니다.</p><Link href={`/studio/longform-japan/projects/${projectId}/adapt`} className="mt-4 inline-flex h-10 items-center rounded-xl bg-sky-700 px-4 text-sm font-bold text-white">Claude 각색으로 이동</Link></section> : <section className="space-y-4 rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-bold">최종 한국어 대본</h2><p className="mt-1 text-xs text-muted-foreground">수정본을 저장하면 다음 번역 단계는 이 대본을 기준으로 시작합니다.</p></div><button onClick={() => setScript(adapted)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs font-bold"><RotateCcw size={14} /> 각색본으로 되돌리기</button></div>
      <textarea value={script} onChange={(event) => setScript(event.target.value)} className="min-h-[620px] w-full resize-y rounded-xl border border-border p-4 text-base leading-8 outline-none focus:border-sky-600" />
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="text-xs text-muted-foreground"><span>{script.length.toLocaleString()}자</span><span className="mx-2">·</span><span>문단 {script.trim() ? script.trim().split(/\n\s*\n/).length : 0}개</span></div><button onClick={save} disabled={saving} className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-olive px-5 text-sm font-bold text-white disabled:opacity-50">{saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} 최종 대본 저장</button></div>
      <Link href={`/studio/longform-japan/projects/${projectId}/translate`} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-sky-700 text-sm font-bold text-white">일본어 번역으로 <ArrowRight size={16} /></Link>
    </section>}
  </div>;
}
