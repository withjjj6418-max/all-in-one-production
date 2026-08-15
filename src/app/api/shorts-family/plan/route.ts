import { spawnSync } from "child_process";
import fs from "fs/promises";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 180;

type InputCandidate = { localPath?: string; sourceTitle?: string; clipStart?: number; clipEnd?: number | null };
type PlanResult = {
  korean_title?: string;
  japanese_title?: string;
  japanese_title_korean?: string;
  korean_title_candidates?: string[];
  japanese_title_candidates?: Array<{ japanese?: string; korean?: string }>;
  concept?: string;
  overall_emotion?: string;
  entries?: Array<{ index?: number; korean_label?: string; japanese_label?: string; japanese_korean?: string; material?: string; emotion?: string; cause?: string; korean_rank?: number; japanese_rank?: number }>;
};

function allowedMediaPath(value: string) {
  const root = path.resolve(/* turbopackIgnore: true */ process.env.SHORTS_FAMILY_SOURCE_ROOT || "C:\\Users\\withj\\Dropbox\\해짜_소스모음");
  const resolved = path.resolve(/* turbopackIgnore: true */ value);
  const relative = path.relative(root, resolved);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative) ? resolved : null;
}

export async function POST(request: Request) {
  const tempRoot = path.resolve(".shorts-family-plan");
  let jobDir = "";
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY가 설정되지 않았습니다." }, { status: 503 });
    const body = await request.json() as { referenceTitle?: string; candidates?: InputCandidate[] };
    const candidates = (body.candidates || []).slice(0, 7);
    if (candidates.length < 5) return NextResponse.json({ error: "기획하려면 후보 영상이 최소 5개 필요합니다." }, { status: 400 });
    const ffmpeg = path.resolve("source-finder", "bin", "ffmpeg.exe");
    jobDir = path.join(tempRoot, `${Date.now()}-${crypto.randomUUID()}`);
    await fs.mkdir(jobDir, { recursive: true });
    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [{ text: `You are planning a Korean and Japanese family ranking Shorts channel. Analyze each numbered candidate frame and create a faithful, dialogue-light ranking concept inspired by the proven reference, without inventing events.

Reference ranking video title: ${body.referenceTitle || "unknown"}

Rules:
- Return Korean JSON only, except Japanese display text.
- Create exactly 3 Korean overall-title candidates and exactly 3 natural Japanese overall-title candidates. Add a Korean translation to every Japanese candidate. Put the strongest candidate in korean_title/japanese_title too.
- For every candidate, describe 소재(material), 핵심감정(emotion), 조회를 부르는 원인(cause).
- Korean rank labels must be natural and at most 4 Korean characters excluding spaces.
- Japanese labels (japanese_label) are NOT a title or an objective description — they are the short reaction caption that sits under each rank number on screen, like a friend commenting beside the viewer. Do not translate the Korean label literally. Pick whichever fits the scene: exaggerated praise/admiration, naming the situation in a witty way, exaggerating relatable embarrassment/pain, a paradox punchline (e.g. "lost the match but won the moment"), a meme-style "confirmed" verdict, intensifying with "〜すぎる", or slipping in a personal-taste aside with "個人的に". Common evaluative words: 〜すぎる, さすが, 確定, まさか, 個人的に, これはずるい, 神, 伝説級, 最高すぎる. Length 7-18 Japanese characters. "w"/"ww"/"www" works like Korean "ㅋ/ㅋㅋㅋ" — only add it to genuinely funny/surprising entries, never force it onto all 5. Each needs a Korean translation.
- japanese_title_candidates (the overall video title, different from japanese_label) should follow the reference channel's real title formula, e.g. "どれが1番好き？〜のバズった5選" or "〜のバズった5選" style, not a plain descriptive sentence. Vary the 3 candidates in phrasing/tone.
- Select exactly 5 candidates. Japanese rank MUST always be the exact inverse of Korean rank: Korean 1 = Japanese 5, Korean 2 = Japanese 4, Korean 3 = Japanese 3, Korean 4 = Japanese 2, Korean 5 = Japanese 1.
- Rank 1 should have the clearest payoff/reversal; rank 5 should hook immediately.
- Do not assume nationality or identify minors.

Return JSON only:
{"korean_title":"...","japanese_title":"...","japanese_title_korean":"...","korean_title_candidates":["...","...","..."],"japanese_title_candidates":[{"japanese":"...","korean":"..."},{"japanese":"...","korean":"..."},{"japanese":"...","korean":"..."}],"concept":"...","overall_emotion":"...","entries":[{"index":1,"korean_label":"4글자","japanese_label":"...","japanese_korean":"...","material":"...","emotion":"...","cause":"...","korean_rank":5,"japanese_rank":1}]}` }];
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      const input = allowedMediaPath(String(candidate.localPath || ""));
      if (!input) return NextResponse.json({ error: `${index + 1}번 후보 경로가 허용된 폴더 밖에 있습니다.` }, { status: 400 });
      const framePath = path.join(jobDir, `candidate-${index + 1}.jpg`);
      const duration = Math.max(0.1, Number(candidate.clipEnd || 0) - Number(candidate.clipStart || 0));
      const result = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-ss", String(Math.min(2, duration * 0.35)), "-i", input, "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "3", "-y", framePath], { windowsHide: true, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
      if (result.status !== 0) return NextResponse.json({ error: `${index + 1}번 후보 프레임을 읽지 못했습니다.` }, { status: 422 });
      parts.push({ text: `CANDIDATE ${index + 1}: ${candidate.sourceTitle || "제목 없음"}` });
      parts.push({ inlineData: { mimeType: "image/jpeg", data: (await fs.readFile(framePath)).toString("base64") } });
    }
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: parts, config: { responseMimeType: "application/json", temperature: 0.35 } });
    const plan = JSON.parse(response.text || "{}") as PlanResult;
    const entries = (plan.entries || []).filter((entry) => Number(entry.index) >= 1 && Number(entry.index) <= candidates.length).slice(0, 7);
    const selected = entries.filter((entry) => Number(entry.korean_rank) >= 1 && Number(entry.korean_rank) <= 5);
    if (!plan.korean_title || !plan.japanese_title || (plan.korean_title_candidates || []).length < 3 || (plan.japanese_title_candidates || []).length < 3 || selected.length !== 5 || new Set(selected.map((entry) => entry.korean_rank)).size !== 5) {
      return NextResponse.json({ error: "AI 기획안에 한·일 제목 후보 3개 또는 5개 순위가 빠졌습니다. 다시 실행해주세요." }, { status: 502 });
    }
    selected.forEach((entry) => { entry.japanese_rank = 6 - Number(entry.korean_rank); });
    const koreanTitleCandidates = (plan.korean_title_candidates || [plan.korean_title]).filter(Boolean).slice(0, 3);
    const japaneseTitleCandidates = (plan.japanese_title_candidates || [{ japanese: plan.japanese_title, korean: plan.japanese_title_korean }])
      .filter((item) => item?.japanese).slice(0, 3);
    return NextResponse.json({ success: true, plan: { ...plan, korean_title_candidates: koreanTitleCandidates, japanese_title_candidates: japaneseTitleCandidates, entries } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "기획안 생성에 실패했습니다." }, { status: 500 });
  } finally {
    if (jobDir.startsWith(`${tempRoot}${path.sep}`)) await fs.rm(jobDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
