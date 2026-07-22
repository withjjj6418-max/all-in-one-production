import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120;

type Segment = { section_title: string; audio_duration: number | null };
type MetadataResult = { titles?: string[]; introduction?: string; call_to_action?: string; tags?: string[] };

function timestamp(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function buildTimeline(segments: Segment[]) {
  let offset = 0;
  return segments.map((segment, index) => {
    const line = `${timestamp(offset)} ${segment.section_title?.trim() || `第${index + 1}章`}`;
    offset += Number(segment.audio_duration) || 0;
    return line;
  }).join("\n");
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    const body = await request.json() as { projectId?: number };
    const projectId = Number(body.projectId);
    if (!Number.isInteger(projectId)) return NextResponse.json({ error: "올바른 프로젝트가 필요합니다." }, { status: 400 });

    const [{ data: project }, { data: script }, { data: segmentRows }] = await Promise.all([
      supabase.from("projects").select("title").eq("id", projectId).eq("user_id", user.id).eq("production_type", "longform_japan").maybeSingle(),
      supabase.from("japan_longform_scripts").select("verified_japanese").eq("project_id", projectId).eq("user_id", user.id).maybeSingle(),
      supabase.from("japan_longform_voice_segments").select("section_title, audio_duration").eq("project_id", projectId).eq("user_id", user.id).eq("status", "generated").order("sort_order"),
    ]);
    if (!project) return NextResponse.json({ error: "프로젝트 접근 권한이 없습니다." }, { status: 403 });
    const japaneseScript = script?.verified_japanese?.trim() || "";
    if (!japaneseScript) return NextResponse.json({ error: "최종 일본어 대본을 먼저 저장해주세요." }, { status: 400 });
    const segments = (segmentRows || []) as Segment[];
    if (!segments.length || segments.some((segment) => !Number(segment.audio_duration))) return NextResponse.json({ error: "타임라인을 만들 수 있도록 TTS 구간 생성을 먼저 완료해주세요." }, { status: 400 });

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY가 설정되지 않았습니다." }, { status: 503 });
    const timeline = buildTimeline(segments);
    const prompt = `You are the Japanese YouTube editor for a late-night supernatural narration channel whose identity is "a pale, silent study where forbidden records are opened after midnight."
Create upload metadata from the Japanese script below.

Requirements:
- Write everything in natural Japanese for a Japanese audience.
- Return exactly 3 compelling but truthful title candidates. Each title should be concise, distinct, searchable, and avoid unsupported clickbait.
- The introduction should be 2–3 short paragraphs that introduce this specific story while evoking the pale-study archive concept. Do not spoil the ending.
- Write one restrained call-to-action asking viewers to subscribe and like the video, matching the quiet eerie channel voice.
- Return exactly 15 unique YouTube search tags highly relevant to Japanese horror, kaidan, mystery narration, and this specific story. Tags must not contain # symbols and must not claim guaranteed ranking.
- Do not include the timeline inside introduction or call_to_action; the server will append exact timestamps.

Return JSON only:
{"titles":["...","...","..."],"introduction":"...","call_to_action":"...","tags":["...15 items..."]}

Current project title: ${project.title}
Exact timeline section names:
${timeline}

Japanese script:
${japaneseScript.slice(0, 26000)}`;

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: prompt, config: { responseMimeType: "application/json", temperature: 0.55 } });
    let result: MetadataResult;
    try { result = JSON.parse(response.text || "") as MetadataResult; }
    catch { return NextResponse.json({ error: "AI 업로드 정보 결과를 읽지 못했습니다." }, { status: 502 }); }
    const titles = (result.titles || []).map((item) => String(item).trim()).filter(Boolean).slice(0, 3);
    const tags = [...new Set((result.tags || []).map((item) => String(item).replace(/^#+/, "").trim()).filter(Boolean))].slice(0, 15);
    const introduction = result.introduction?.trim() || "";
    const callToAction = result.call_to_action?.trim() || "";
    if (titles.length !== 3 || tags.length !== 15 || !introduction || !callToAction) return NextResponse.json({ error: "AI가 제목·설명·태그를 모두 만들지 못했습니다. 다시 시도해주세요." }, { status: 502 });
    const description = `${introduction}\n\n${callToAction}\n\n【目次】\n${timeline}`;
    return NextResponse.json({ titles, description, tags, timeline });
  } catch (error) {
    console.error("Japan longform YouTube metadata error:", error);
    return NextResponse.json({ error: "YouTube 업로드 정보 생성 중 오류가 발생했습니다." }, { status: 500 });
  }
}
