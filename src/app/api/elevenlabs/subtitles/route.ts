import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildJapaneseCombinedSrtFromLines, refineJapaneseOneLineSubtitles, type SpeechAlignment } from "@/lib/japan-longform-srt";

export const runtime = "nodejs";
export const maxDuration = 120;

type Segment = { id: string; sort_order: number; text: string; audio_duration: number | null; alignment: SpeechAlignment };
type AiResult = { sections?: Array<{ id?: string; lines?: string[] }> };

function compact(value: string) {
  return value.replace(/\s/g, "");
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    const body = await request.json() as { projectId?: number };
    const projectId = Number(body.projectId);
    if (!Number.isInteger(projectId)) return NextResponse.json({ error: "올바른 프로젝트가 필요합니다." }, { status: 400 });
    const [{ data: project }, { data, error }] = await Promise.all([
      supabase.from("projects").select("id").eq("id", projectId).eq("user_id", user.id).eq("production_type", "longform_japan").maybeSingle(),
      supabase.from("japan_longform_voice_segments").select("id, sort_order, text, audio_duration, alignment").eq("project_id", projectId).eq("user_id", user.id).eq("status", "generated").order("sort_order"),
    ]);
    if (!project) return NextResponse.json({ error: "프로젝트 접근 권한이 없습니다." }, { status: 403 });
    const segments = (data || []) as Segment[];
    if (error || !segments.length) return NextResponse.json({ error: "생성된 TTS 구간이 없습니다." }, { status: 400 });
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY가 설정되지 않았습니다." }, { status: 503 });

    const prompt = `You are a professional Japanese subtitle line editor.
Insert line breaks into every supplied Japanese narration section.

Rules:
- Every array item is one complete single-line subtitle cue. Never put a line break inside an item.
- Normally use 10–20 Japanese characters per cue and aim near 20.
- A cue may be shorter than 10 characters when it ends at a full stop, comma, question mark, exclamation mark, or another natural punctuation boundary.
- Keep quoted dialogue together as one cue whenever reasonably possible. A complete quoted line may be longer than 20 characters when splitting it would damage the dialogue.
- Prefer natural semantic boundaries: Japanese full stops, commas, clause endings, particles, and complete phrases.
- Never split a personal name, place name, fixed expression, number, or closely connected noun phrase.
- Preserve every original non-whitespace character exactly and in the same order. Never translate, rewrite, correct, summarize, add, or delete anything.
- Remove existing line breaks only to place better ones.
- Return every section ID exactly once.

Return JSON only:
{"sections":[{"id":"segment-id","lines":["意味のまとまり。","次の字幕行です。"]}]}

Sections:
${segments.map((segment) => `<section id="${segment.id}">\n${segment.text}\n</section>`).join("\n\n")}`;

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: prompt, config: { responseMimeType: "application/json", temperature: 0.1 } });
    let parsed: AiResult;
    try { parsed = JSON.parse(response.text || "") as AiResult; }
    catch { return NextResponse.json({ error: "AI 자막 줄바꿈 결과를 읽지 못했습니다." }, { status: 502 }); }
    const byId = new Map((parsed.sections || []).map((section) => [section.id, section.lines]));
    const linesBySegment = segments.map((segment) => {
      const semanticLines = (byId.get(segment.id) || [])
        .flatMap((value) => String(value).split(/\r?\n/))
        .map((line) => line.trim())
        .filter(Boolean);
      if (!semanticLines.length || compact(semanticLines.join("")) !== compact(segment.text)) throw new Error(`${segment.sort_order + 1}번 구간에서 AI가 원문을 변경했습니다. 다시 시도해주세요.`);
      return refineJapaneseOneLineSubtitles(segment.text, segment.alignment, semanticLines);
    });
    const combinedSrt = buildJapaneseCombinedSrtFromLines(segments, linesBySegment);
    const segmentUpdates = segments.map((segment, index) => {
      const localSrt = buildJapaneseCombinedSrtFromLines([segment], [linesBySegment[index]]);
      return supabase.from("japan_longform_voice_segments").update({ subtitle_srt: localSrt, updated_at: new Date().toISOString() }).eq("id", segment.id).eq("user_id", user.id);
    });
    await Promise.all(segmentUpdates);
    const { data: run } = await supabase.from("japan_longform_voice_runs").select("id").eq("project_id", projectId).eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (run) await supabase.from("japan_longform_voice_runs").update({ combined_subtitle_srt: combinedSrt }).eq("id", run.id).eq("user_id", user.id);
    return NextResponse.json({ srt: combinedSrt, linesBySegment });
  } catch (error) {
    console.error("Japan longform subtitle formatting error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI 일본어 자막 생성 중 오류가 발생했습니다." }, { status: 500 });
  }
}
