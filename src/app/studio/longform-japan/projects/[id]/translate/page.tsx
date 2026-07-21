"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Copy, ExternalLink, Languages, Loader2, Save, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type ScriptRecord = {
  source_id: string | null;
  adapted_korean: string;
  final_korean: string;
  claude_japanese: string;
  verified_japanese: string;
  verification_notes: string;
  verification_model: string;
};

type VerificationPayload = {
  pending?: boolean;
  responseId?: string;
  finalJapanese?: string;
  reviewNotes?: string;
  model?: string;
  error?: string;
};

export default function JapanLongformTranslatePage() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);
  const supabase = useMemo(() => createClient(), []);
  const [projectTitle, setProjectTitle] = useState("");
  const [userId, setUserId] = useState("");
  const [record, setRecord] = useState<ScriptRecord | null>(null);
  const [claudeJapanese, setClaudeJapanese] = useState("");
  const [verifiedJapanese, setVerifiedJapanese] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [verificationModel, setVerificationModel] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verificationSeconds, setVerificationSeconds] = useState(0);
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
        supabase.from("japan_longform_scripts").select("source_id, adapted_korean, final_korean, claude_japanese, verified_japanese, verification_notes, verification_model").eq("project_id", projectId).maybeSingle(),
      ]);
      if (!active) return;
      setProjectTitle(projectRes.data?.title || "일본 롱폼 프로젝트");
      if (scriptRes.error) setMessage({ kind: "error", text: "번역 데이터를 불러오지 못했습니다." });
      else if (!scriptRes.data?.final_korean) setMessage({ kind: "error", text: "먼저 한국어 최종 대본을 저장해주세요." });
      if (scriptRes.data) {
        const loaded = scriptRes.data as ScriptRecord;
        setRecord(loaded);
        setClaudeJapanese(loaded.claude_japanese || "");
        setVerifiedJapanese(loaded.verified_japanese || "");
        setReviewNotes(loaded.verification_notes || "");
        setVerificationModel(loaded.verification_model || "");
      }
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [projectId, supabase]);

  async function copyKoreanAndOpenClaude() {
    if (!record?.final_korean) return;
    const claudeWindow = window.open("https://claude.ai/projects", "_blank", "noopener,noreferrer");
    try {
      await navigator.clipboard.writeText(record.final_korean);
      setMessage({ kind: "notice", text: "한국어 최종 대본을 복사하고 Claude 프로젝트를 열었습니다." });
    } catch {
      claudeWindow?.close();
      setMessage({ kind: "error", text: "대본 복사에 실패했습니다." });
    }
  }

  function values(next?: Partial<{ claude: string; verified: string; notes: string; model: string }>) {
    return {
      project_id: projectId,
      user_id: userId,
      source_id: record?.source_id || null,
      adapted_korean: record?.adapted_korean || "",
      final_korean: record?.final_korean || "",
      claude_japanese: next?.claude ?? claudeJapanese.trim(),
      verified_japanese: next?.verified ?? verifiedJapanese.trim(),
      verification_notes: next?.notes ?? reviewNotes.trim(),
      verification_model: next?.model ?? verificationModel,
      updated_at: new Date().toISOString(),
    };
  }

  async function saveClaudeTranslation() {
    if (!userId || !claudeJapanese.trim()) return setMessage({ kind: "error", text: "Claude 일본어 번역본을 붙여넣어주세요." });
    setSaving(true);
    const { error } = await supabase.from("japan_longform_scripts").upsert(values({ claude: claudeJapanese.trim() }), { onConflict: "project_id" });
    setSaving(false);
    setMessage(error ? { kind: "error", text: "1차 번역본 저장에 실패했습니다." } : { kind: "notice", text: "Claude 1차 일본어 번역본을 저장했습니다." });
  }

  async function verifyWithGpt() {
    if (!record?.final_korean || !claudeJapanese.trim()) return setMessage({ kind: "error", text: "한국어 최종 대본과 Claude 번역본이 모두 필요합니다." });
    setVerifying(true);
    setVerificationSeconds(0);
    setMessage(null);
    try {
      const response = await fetch("/api/longform-japan/verify-translation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, koreanScript: record.final_korean, japaneseTranslation: claudeJapanese.trim() }),
      });
      const payload = await readPayload(response);
      if (!response.ok) throw new Error(payload.error || `GPT 요청에 실패했습니다. (${response.status})`);
      let completed = payload;
      if (payload.pending && payload.responseId) {
        setMessage({ kind: "notice", text: "GPT가 긴 대본을 백그라운드에서 검수하고 있습니다. 이 화면을 열어두세요." });
        completed = await pollVerification(payload.responseId);
      }
      if (!completed.finalJapanese) throw new Error(completed.error || "GPT 최종 대본을 받지 못했습니다.");
      await applyVerificationResult(completed);
    } catch (reason) {
      setMessage({ kind: "error", text: reason instanceof Error ? reason.message : "GPT 번역 검수에 실패했습니다." });
    } finally {
      setVerifying(false);
    }
  }

  async function readPayload(response: Response) {
    const raw = await response.text();
    try {
      return JSON.parse(raw) as VerificationPayload;
    } catch {
      throw new Error(`서버 응답을 읽지 못했습니다. (${response.status}) Vercel 함수 로그를 확인해주세요.`);
    }
  }

  async function pollVerification(responseId: string) {
    for (let attempt = 1; attempt <= 200; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 3_000));
      setVerificationSeconds(attempt * 3);
      const response = await fetch(`/api/longform-japan/verify-translation?projectId=${projectId}&responseId=${encodeURIComponent(responseId)}`, { cache: "no-store" });
      const payload = await readPayload(response);
      if (!response.ok) throw new Error(payload.error || `GPT 상태 확인에 실패했습니다. (${response.status})`);
      if (!payload.pending) return payload;
    }
    throw new Error("GPT 검수가 10분 안에 완료되지 않았습니다. 잠시 후 다시 시도해주세요.");
  }

  async function applyVerificationResult(payload: VerificationPayload) {
      const nextVerified = payload.finalJapanese!;
      const nextNotes = payload.reviewNotes || "";
      const nextModel = payload.model || "gpt";
      setVerifiedJapanese(nextVerified);
      setReviewNotes(nextNotes);
      setVerificationModel(nextModel);
      const { error: saveError } = await supabase.from("japan_longform_scripts").upsert(values({
        claude: claudeJapanese.trim(), verified: nextVerified, notes: nextNotes, model: nextModel,
      }), { onConflict: "project_id" });
      if (saveError) throw new Error("검수는 완료됐지만 결과 저장에 실패했습니다.");
      setMessage({ kind: "notice", text: "GPT 2차 검수와 최종 일본어 대본 저장을 완료했습니다." });
  }

  async function copyPromptAndOpenChatGpt() {
    if (!record?.final_korean || !claudeJapanese.trim()) return setMessage({ kind: "error", text: "한국어 대본과 Claude 번역본이 모두 필요합니다." });
    const prompt = `다음 한국어 원문과 Claude의 일본어 번역을 비교 검수해줘. 누락, 오역, 어색한 직역, 존칭과 시점 불일치를 고치고 일본 시청자가 듣기 자연스러운 TTS용 일본어 최종 대본만 출력해줘. 사건과 문단 순서는 임의로 바꾸지 마.\n\n[한국어 최종 대본]\n${record.final_korean}\n\n[Claude 1차 일본어 번역]\n${claudeJapanese.trim()}`;
    const chatWindow = window.open("https://chatgpt.com/", "_blank", "noopener,noreferrer");
    try {
      await navigator.clipboard.writeText(prompt);
      setMessage({ kind: "notice", text: "검수 요청문을 복사하고 ChatGPT를 열었습니다. API 키가 없을 때 사용할 수 있습니다." });
    } catch {
      chatWindow?.close();
      setMessage({ kind: "error", text: "검수 요청문 복사에 실패했습니다." });
    }
  }

  async function saveFinal() {
    if (!userId || !verifiedJapanese.trim()) return setMessage({ kind: "error", text: "최종 일본어 대본을 입력해주세요." });
    setSaving(true);
    const { error } = await supabase.from("japan_longform_scripts").upsert(values({
      claude: claudeJapanese.trim(), verified: verifiedJapanese.trim(), notes: reviewNotes.trim(), model: verificationModel || "manual",
    }), { onConflict: "project_id" });
    setSaving(false);
    setMessage(error ? { kind: "error", text: "최종 일본어 대본 저장에 실패했습니다." } : { kind: "notice", text: "최종 일본어 대본을 저장했습니다. 이제 TTS 제작으로 이동할 수 있습니다." });
  }

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="animate-spin text-sky-700" /></div>;

  return <div className="mx-auto max-w-7xl space-y-5">
    <Link href={`/studio/longform-japan/projects/${projectId}`} className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-sky-700"><ArrowLeft size={16} /> 워크벤치</Link>
    <header><p className="text-sm font-bold text-sky-700">{projectTitle}</p><h1 className="mt-1 flex items-center gap-2 text-3xl font-bold"><Languages className="text-sky-700" /> 일본어 번역 · 검수</h1><p className="mt-2 text-sm text-muted-foreground">Claude에서 1차 번역하고 GPT로 한국어 원문과 교차 검수한 뒤 TTS용 일본어 대본을 확정합니다.</p></header>
    {message && <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${message.kind === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{message.text}</div>}
    {!record?.final_korean ? <section className="rounded-2xl border border-border bg-white p-8 text-center shadow-sm"><p className="font-bold">저장된 한국어 최종 대본이 없습니다.</p><Link href={`/studio/longform-japan/projects/${projectId}/script`} className="mt-4 inline-flex h-10 items-center rounded-xl bg-sky-700 px-4 text-sm font-bold text-white">대본 수정으로 이동</Link></section> : <>
      <section className="grid gap-5 xl:grid-cols-2">
        <article className="flex flex-col rounded-2xl border border-border bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><span className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-700">기준 대본</span><h2 className="mt-3 font-bold">한국어 최종 대본</h2></div><button onClick={copyKoreanAndOpenClaude} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#D97757] px-4 text-sm font-bold text-white"><ExternalLink size={15} /> 복사하고 Claude 열기</button></div><div className="mt-4 max-h-[620px] flex-1 overflow-y-auto whitespace-pre-wrap rounded-xl bg-muted/60 p-4 text-sm leading-7">{record.final_korean}</div><p className="mt-3 text-xs text-muted-foreground">{record.final_korean.length.toLocaleString()}자</p></article>
        <article className="flex flex-col rounded-2xl border border-border bg-white p-5 shadow-sm"><div><span className="rounded-full bg-orange-50 px-2.5 py-1 text-[11px] font-bold text-orange-700">1차 번역</span><h2 className="mt-3 font-bold">Claude 일본어 번역본</h2><p className="mt-1 text-xs text-muted-foreground">Claude에서 나온 일본어 대본 전체를 붙여넣으세요.</p></div><textarea value={claudeJapanese} onChange={(event) => setClaudeJapanese(event.target.value)} placeholder="Claude 1차 일본어 번역을 붙여넣으세요." className="mt-4 min-h-[560px] flex-1 resize-y rounded-xl border border-border p-4 text-sm leading-7 outline-none focus:border-sky-600" /><div className="mt-3 flex items-center justify-between gap-3"><span className="text-xs text-muted-foreground">{claudeJapanese.length.toLocaleString()}자</span><button onClick={saveClaudeTranslation} disabled={saving || !claudeJapanese.trim()} className="inline-flex h-10 items-center gap-2 rounded-xl border border-brand-olive px-4 text-sm font-bold text-brand-olive disabled:opacity-40">{saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} 1차 번역 저장</button></div></article>
      </section>

      <section className="rounded-2xl border border-sky-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-700">2차 검수</span><h2 className="mt-3 text-xl font-bold">GPT 교차 검수</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">한국어 원문과 Claude 번역을 비교해 누락·오역·부자연스러운 표현을 수정합니다.</p></div><div className="flex flex-wrap gap-2"><button onClick={copyPromptAndOpenChatGpt} disabled={!claudeJapanese.trim()} className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-bold disabled:opacity-40"><Copy size={15} /> 수동 GPT 열기</button><button onClick={verifyWithGpt} disabled={verifying || !claudeJapanese.trim()} className="inline-flex h-10 min-w-40 items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 text-sm font-bold text-white disabled:opacity-40">{verifying ? <><Loader2 size={15} className="animate-spin" /> 검수 중</> : <><Sparkles size={15} /> GPT API로 검수</>}</button></div></div>
        {verifying && <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-700"><Loader2 size={15} className="mr-2 inline animate-spin" />긴 대본을 검수하고 있습니다 · {verificationSeconds}초 경과 · 완료될 때까지 화면을 열어두세요.</div>}
        <div className="mt-5 grid gap-5 xl:grid-cols-[1.6fr_1fr]"><label className="block text-sm font-semibold">최종 일본어 대본<textarea value={verifiedJapanese} onChange={(event) => setVerifiedJapanese(event.target.value)} placeholder="GPT API 결과가 여기에 표시됩니다. 수동 GPT 결과를 직접 붙여넣어도 됩니다." className="mt-2 min-h-[520px] w-full resize-y rounded-xl border border-border p-4 leading-7 outline-none focus:border-violet-500" /></label><label className="block text-sm font-semibold">검수 메모<textarea value={reviewNotes} onChange={(event) => setReviewNotes(event.target.value)} placeholder="주요 교정 내용 또는 작업 메모" className="mt-2 min-h-48 w-full resize-y rounded-xl border border-border p-4 text-sm leading-6 outline-none focus:border-violet-500" />{verificationModel && <span className="mt-2 block text-xs text-muted-foreground">검수 모델: {verificationModel}</span>}</label></div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><span className="text-xs text-muted-foreground">최종 일본어 {verifiedJapanese.length.toLocaleString()}자</span><button onClick={saveFinal} disabled={saving || !verifiedJapanese.trim()} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-olive px-5 text-sm font-bold text-white disabled:opacity-40">{saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} 최종 일본어 대본 확정</button></div>
        {verifiedJapanese.trim() && <Link href={`/studio/longform-japan/projects/${projectId}/voice`} className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-sky-700 text-sm font-bold text-white">ElevenLabs TTS로 <ArrowRight size={16} /></Link>}
      </section>
    </>}
  </div>;
}
