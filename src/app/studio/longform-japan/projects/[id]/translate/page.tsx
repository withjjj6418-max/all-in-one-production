"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Copy, ExternalLink, Languages, Loader2, Save } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  japanLongformClaudeTranslationInstructions,
  japanLongformGptReviewPolicy,
} from "@/lib/japan-longform-translation-instructions";

type ScriptRecord = {
  source_id: string | null;
  adapted_korean: string;
  final_korean: string;
  claude_japanese: string;
  verified_japanese: string;
  verification_notes: string;
  verification_model: string;
  bilingual_review_text: string;
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
  const [bilingualReview, setBilingualReview] = useState("");
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
        supabase.from("japan_longform_scripts").select("source_id, adapted_korean, final_korean, claude_japanese, verified_japanese, verification_notes, verification_model, bilingual_review_text").eq("project_id", projectId).maybeSingle(),
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
        setBilingualReview(loaded.bilingual_review_text || "");
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

  async function copyClaudeInstructions() {
    try {
      await navigator.clipboard.writeText(japanLongformClaudeTranslationInstructions);
      setMessage({ kind: "notice", text: "자연스러움 우선 Claude 번역 지침을 복사했습니다. Claude 프로젝트 지침을 이 내용으로 교체해주세요." });
    } catch {
      setMessage({ kind: "error", text: "Claude 번역 지침 복사에 실패했습니다." });
    }
  }

  function values(next?: Partial<{ claude: string; verified: string; notes: string; model: string; bilingual: string }>) {
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
      bilingual_review_text: next?.bilingual ?? bilingualReview.trim(),
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

  async function copyPromptAndOpenChatGpt() {
    if (!record?.final_korean || !claudeJapanese.trim()) return setMessage({ kind: "error", text: "한국어 대본과 Claude 번역본이 모두 필요합니다." });
    const prompt = `너는 한국어 원문의 의미를 정확히 이해하는 일본어 원어민 공포 낭독 대본 편집자야.

다음 한국어 원문과 Claude의 일본어 번역을 비교 검수해줘.

${japanLongformGptReviewPolicy}

작업 순서:
1. 먼저 Claude 일본어 번역만 일본인 청자의 관점에서 읽고 번역투, 문법 오류, 부자연스러운 호흡과 호칭을 찾는다.
2. 한국어 원문과 대조하여 누락, 오역, 정보 추가, 인과관계와 단서의 변형을 찾는다.
3. 자연스러운 의역은 유지하고 실제로 필요한 부분만 최소한으로 수정한다.
4. 최종 대본을 다시 읽어 일본 공포 낭독으로 자연스럽게 이어지는지 확인한다.

출력 형식:
[최종 일본어 대본]
검수를 마친 일본어 전체 대본을 처음부터 끝까지 빠짐없이 출력한다.

[수정 내역]
실제로 수정한 부분마다 아래 형식으로 정리한다.
- 구분: 필수 수정 / 선택 표현 개선
- 수정 전: Claude 번역의 해당 표현
- 수정 후: 최종 대본에 반영한 표현
- 수정 이유: 일본어 청자에게 무엇이 잘못되거나 어색했는지, 또는 원문의 어떤 의미가 달라졌는지 한국어로 구체적으로 설명

필수 수정은 오역, 누락, 문법 오류, 부자연스러운 일본어, 인물·사건·단서의 불일치에만 사용한다.
선택 표현 개선은 둘 다 자연스럽지만 낭독 분위기상 더 나은 표현을 제안할 때만 사용한다.
단순한 문장부호 수정은 내역에서 생략한다. 수정한 내용이 없다면 [수정 내역] 아래에 "수정 없음"이라고 쓴다. 코드 블록이나 다른 머리말은 넣지 않는다.

[한국어 최종 대본]
${record.final_korean}

[Claude 1차 일본어 번역]
${claudeJapanese.trim()}`;
    const chatWindow = window.open("https://chatgpt.com/", "_blank", "noopener,noreferrer");
    try {
      await navigator.clipboard.writeText(prompt);
      setMessage({ kind: "notice", text: "검수 요청문을 복사하고 ChatGPT를 열었습니다. 최종 대본과 수정 내역을 각각 해당 칸에 붙여넣어주세요." });
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

  async function copyBilingualPromptAndOpenChatGpt() {
    if (!verifiedJapanese.trim()) return setMessage({ kind: "error", text: "최종 일본어 대본을 먼저 입력해주세요." });
    const prompt = `다음 최종 일본어 대본을 영상 편집 검수용 한일 대조 대본으로 만들어줘.

규칙:
- 일본어 내용을 처음부터 끝까지 빠짐없이 순서대로 처리한다.
- 일본어는 의미 단위의 한 문장 또는 짧은 한 줄로 나눈다.
- 일본어 원문은 글자, 인물명, 말투를 바꾸거나 요약하지 않는다.
- 각 일본어 줄 바로 아래에 자연스럽고 정확한 한국어 해석을 한 줄로 쓴다.
- 반드시 아래 형식만 반복하고, 번호·제목·설명·코드블록은 넣지 않는다.
JP｜일본어 원문
KO｜한국어 해석

[최종 일본어 대본]
${verifiedJapanese.trim()}

[기존 한국어 대본 참고]
${record?.final_korean || ""}`;
    const chatWindow = window.open("https://chatgpt.com/", "_blank", "noopener,noreferrer");
    try {
      await navigator.clipboard.writeText(prompt);
      setMessage({ kind: "notice", text: "한일 대조 대본 요청문을 복사하고 ChatGPT를 열었습니다. 결과를 아래 칸에 붙여넣어주세요." });
    } catch {
      chatWindow?.close();
      setMessage({ kind: "error", text: "한일 대조 대본 요청문 복사에 실패했습니다." });
    }
  }

  async function saveBilingualReview() {
    if (!userId || !bilingualReview.trim()) return setMessage({ kind: "error", text: "한일 대조 대본을 붙여넣어주세요." });
    setSaving(true);
    const { error } = await supabase.from("japan_longform_scripts").upsert(values({ bilingual: bilingualReview.trim() }), { onConflict: "project_id" });
    setSaving(false);
    setMessage(error
      ? { kind: "error", text: "한일 대조 대본 저장에 실패했습니다. 최신 SQL 적용 여부를 확인해주세요." }
      : { kind: "notice", text: "한일 대조 대본을 저장했습니다. 최종 SRT가 있으면 프리미어에서 타임코드와 함께 표시됩니다." });
  }

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="animate-spin text-sky-700" /></div>;

  return <div className="mx-auto max-w-7xl space-y-5">
    <Link href={`/studio/longform-japan/projects/${projectId}`} className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-sky-700"><ArrowLeft size={16} /> 워크벤치</Link>
    <header><p className="text-sm font-bold text-sky-700">{projectTitle}</p><h1 className="mt-1 flex items-center gap-2 text-3xl font-bold"><Languages className="text-sky-700" /> 일본어 번역 · 검수</h1><p className="mt-2 text-sm text-muted-foreground">Claude에서 1차 번역하고 GPT로 한국어 원문과 교차 검수한 뒤 TTS용 일본어 대본을 확정합니다.</p></header>
    {message && <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${message.kind === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{message.text}</div>}
    {!record?.final_korean ? <section className="rounded-2xl border border-border bg-white p-8 text-center shadow-sm"><p className="font-bold">저장된 한국어 최종 대본이 없습니다.</p><Link href={`/studio/longform-japan/projects/${projectId}/script`} className="mt-4 inline-flex h-10 items-center rounded-xl bg-sky-700 px-4 text-sm font-bold text-white">대본 수정으로 이동</Link></section> : <>
      <section className="grid items-start gap-5 xl:grid-cols-2">
        <article className="flex flex-col rounded-2xl border border-border bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><span className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-700">기준 대본</span><h2 className="mt-3 font-bold">한국어 최종 대본</h2></div><div className="flex flex-wrap gap-2"><button onClick={copyClaudeInstructions} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#D97757] px-3 text-xs font-bold text-[#B85F43]"><Copy size={14} /> 개정 Claude 지침 복사</button><button onClick={copyKoreanAndOpenClaude} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#D97757] px-4 text-sm font-bold text-white"><ExternalLink size={15} /> 대본 복사하고 Claude 열기</button></div></div><div className="mt-4 max-h-[620px] flex-1 overflow-y-auto whitespace-pre-wrap rounded-xl bg-muted/60 p-4 text-sm leading-7">{record.final_korean}</div><p className="mt-3 text-xs text-muted-foreground">{record.final_korean.length.toLocaleString()}자</p></article>
        <article className="flex flex-col rounded-2xl border border-border bg-white p-5 shadow-sm"><div><span className="rounded-full bg-orange-50 px-2.5 py-1 text-[11px] font-bold text-orange-700">1차 번역</span><h2 className="mt-3 font-bold">Claude 일본어 번역본</h2><p className="mt-1 text-xs text-muted-foreground">Claude에서 나온 일본어 대본 전체를 붙여넣으세요.</p></div><textarea value={claudeJapanese} onChange={(event) => setClaudeJapanese(event.target.value)} placeholder="Claude 1차 일본어 번역을 붙여넣으세요." rows={5} className="mt-4 h-40 resize-y rounded-xl border border-border p-4 text-sm leading-7 outline-none focus:border-sky-600" /><div className="mt-3 flex items-center justify-between gap-3"><span className="text-xs text-muted-foreground">{claudeJapanese.length.toLocaleString()}자</span><button onClick={saveClaudeTranslation} disabled={saving || !claudeJapanese.trim()} className="inline-flex h-10 items-center gap-2 rounded-xl border border-brand-olive px-4 text-sm font-bold text-brand-olive disabled:opacity-40">{saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} 1차 번역 저장</button></div></article>
      </section>

      <section className="rounded-2xl border border-sky-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-700">2차 검수</span><h2 className="mt-3 text-xl font-bold">GPT 교차 검수</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">검수 요청문을 복사하면 ChatGPT가 최종 일본어 대본과 수정한 부분·이유를 나누어 출력합니다.</p></div><button onClick={copyPromptAndOpenChatGpt} disabled={!claudeJapanese.trim()} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 text-sm font-bold text-white disabled:opacity-40"><Copy size={15} /> 검수 요청 복사하고 GPT 열기</button></div>
        <div className="mt-5 grid gap-5 xl:grid-cols-[1.6fr_1fr]"><label className="block text-sm font-semibold">최종 일본어 대본<textarea value={verifiedJapanese} onChange={(event) => setVerifiedJapanese(event.target.value)} placeholder="GPT 결과의 [최종 일본어 대본] 내용만 붙여넣으세요." rows={5} className="mt-2 h-40 w-full resize-y rounded-xl border border-border p-4 leading-7 outline-none focus:border-violet-500" /></label><label className="block text-sm font-semibold">수정 내역 · 이유<textarea value={reviewNotes} onChange={(event) => setReviewNotes(event.target.value)} placeholder="GPT 결과의 [수정 내역] 내용을 붙여넣으세요." rows={5} className="mt-2 h-40 w-full resize-y rounded-xl border border-border p-4 text-sm leading-6 outline-none focus:border-violet-500" />{verificationModel && <span className="mt-2 block text-xs text-muted-foreground">검수 방식: {verificationModel === "manual" ? "수동 GPT" : verificationModel}</span>}</label></div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><span className="text-xs text-muted-foreground">최종 일본어 {verifiedJapanese.length.toLocaleString()}자</span><button onClick={saveFinal} disabled={saving || !verifiedJapanese.trim()} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-olive px-5 text-sm font-bold text-white disabled:opacity-40">{saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} 최종 일본어 대본 확정</button></div>
        {verifiedJapanese.trim() && <Link href={`/studio/longform-japan/projects/${projectId}/voice`} className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-sky-700 text-sm font-bold text-white">ElevenLabs TTS로 <ArrowRight size={16} /></Link>}
      </section>

      <section className="rounded-2xl border border-violet-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-700">영상 편집 검수용</span><h2 className="mt-3 text-xl font-bold">한일 대조 대본</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">최종 일본어 한 줄과 한국어 해석 한 줄을 번갈아 저장합니다. 일본어 줄은 최종 대본 그대로 유지해야 SRT 시간과 정확히 연결됩니다.</p></div><button onClick={copyBilingualPromptAndOpenChatGpt} disabled={!verifiedJapanese.trim()} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 text-sm font-bold text-white disabled:opacity-40"><ExternalLink size={15} /> 요청 복사하고 GPT 열기</button></div>
        <textarea value={bilingualReview} onChange={(event) => setBilingualReview(event.target.value)} placeholder={"JP｜ようこそ、初めてお越しになったお客様。\nKO｜어서 오세요, 처음 찾아오신 손님.\n\nJP｜ここは、世界中から集められた不思議な話を収める、蒼白い書斎です。\nKO｜이곳은 세계 곳곳에서 모인 기묘한 이야기를 간직한 창백한 서재입니다."} className="mt-5 min-h-[480px] w-full resize-y rounded-xl border border-border bg-stone-50 p-4 text-sm leading-7 outline-none focus:border-violet-500" />
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-muted-foreground">형식: `JP｜일본어` 다음 줄에 `KO｜한국어` · {bilingualReview.length.toLocaleString()}자</p><button onClick={saveBilingualReview} disabled={saving || !bilingualReview.trim()} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-brand-olive px-4 text-sm font-bold text-white disabled:opacity-40">{saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} 대조 대본 저장</button></div>
      </section>
    </>}
  </div>;
}
