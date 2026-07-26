import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { buildBilingualTimeline, formatYoutubeTimestamp } from "@/lib/japan-longform-bilingual";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120;

type MetadataResult = {
  title_candidates?: Array<{ japanese?: string; korean?: string }>;
  introduction?: string;
  call_to_action?: string;
  tags?: string[];
  chapters?: Array<{ entry_index?: number; title?: string }>;
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    const body = await request.json() as { projectId?: number };
    const projectId = Number(body.projectId);
    if (!Number.isInteger(projectId)) return NextResponse.json({ error: "올바른 프로젝트가 필요합니다." }, { status: 400 });

    const [{ data: project }, { data: script }, { data: voiceRun }] = await Promise.all([
      supabase.from("projects").select("title").eq("id", projectId).eq("user_id", user.id).eq("production_type", "longform_japan").maybeSingle(),
      supabase.from("japan_longform_scripts").select("verified_japanese, bilingual_review_text").eq("project_id", projectId).eq("user_id", user.id).maybeSingle(),
      supabase.from("japan_longform_voice_runs").select("combined_subtitle_srt").eq("project_id", projectId).eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (!project) return NextResponse.json({ error: "프로젝트 접근 권한이 없습니다." }, { status: 403 });
    const japaneseScript = script?.verified_japanese?.trim() || "";
    if (!japaneseScript) return NextResponse.json({ error: "최종 일본어 대본을 먼저 저장해주세요." }, { status: 400 });
    const bilingualReview = script?.bilingual_review_text?.trim() || "";
    if (!bilingualReview) return NextResponse.json({ error: "대본번역에서 편집용 한일 대조 대본을 먼저 저장해주세요." }, { status: 400 });
    const combinedSrt = voiceRun?.combined_subtitle_srt?.trim() || "";
    if (!combinedSrt) return NextResponse.json({ error: "실제 시간을 맞추려면 TTS에서 최종 일본어 SRT를 먼저 생성해주세요." }, { status: 400 });
    const timelineEntries = buildBilingualTimeline(bilingualReview, combinedSrt)
      .filter((entry): entry is typeof entry & { startSeconds: number } => entry.startSeconds !== null);
    if (timelineEntries.length < 3) return NextResponse.json({ error: "한일 대조 대본과 최종 SRT의 일본어 문장이 충분히 일치하지 않습니다. 대조 대본을 다시 저장해주세요." }, { status: 400 });

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY가 설정되지 않았습니다." }, { status: 503 });
    const prompt = `You are the Japanese YouTube editor for a late-night supernatural narration channel whose identity is "a pale, silent study where forbidden records are opened after midnight."
Create upload metadata and chapter choices from the time-aligned bilingual editing script below.

Requirements:
- Write all upload-facing content in natural Japanese for a Japanese audience.
- Return exactly 3 title_candidates. Each item must contain a compelling but truthful Japanese title and its natural Korean editor-reference translation.
- The introduction should be 2–3 short paragraphs that introduce this specific story while evoking the pale-study archive concept. Do not spoil the ending.
- Write one restrained call-to-action asking viewers to subscribe and like the video, matching the quiet eerie channel voice.
- Return exactly 15 unique YouTube search tags highly relevant to Japanese horror, kaidan, mystery narration, and this specific story. Tags must not contain # symbols and must not claim guaranteed ranking.
- Choose 5–10 meaningful chapters from the numbered bilingual entries. Use major setting changes, discoveries, reversals, and the ending.
- chapters must use existing 1-based entry_index values, be strictly increasing, and include entry_index 1 as the first chapter.
- Chapter titles must be short natural Japanese without timestamps. The server will attach the exact SRT time.
- Do not include the timeline inside introduction or call_to_action.

Return JSON only:
{"title_candidates":[{"japanese":"...","korean":"..."},{"japanese":"...","korean":"..."},{"japanese":"...","korean":"..."}],"introduction":"...","call_to_action":"...","tags":["...15 items..."],"chapters":[{"entry_index":1,"title":"導入"},{"entry_index":12,"title":"異変の始まり"}]}

Current project title: ${project.title}
Time-aligned bilingual editing entries:
${timelineEntries.map((entry, index) => `[${index + 1}] ${formatYoutubeTimestamp(entry.startSeconds)}\n日本語: ${entry.japanese}\n한국어: ${entry.korean}`).join("\n\n")}`;

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: prompt, config: { responseMimeType: "application/json", temperature: 0.55 } });
    let result: MetadataResult;
    try { result = JSON.parse(response.text || "") as MetadataResult; }
    catch { return NextResponse.json({ error: "AI 업로드 정보 결과를 읽지 못했습니다." }, { status: 502 }); }
    const titleCandidates = (result.title_candidates || []).map((item) => ({
      japanese: String(item.japanese || "").trim(),
      korean: String(item.korean || "").trim(),
    })).filter((item) => item.japanese && item.korean).slice(0, 3);
    const tags = [...new Set((result.tags || []).map((item) => String(item).replace(/^#+/, "").trim()).filter(Boolean))].slice(0, 15);
    const introduction = result.introduction?.trim() || "";
    const callToAction = result.call_to_action?.trim() || "";
    const seenChapterIndexes = new Set<number>();
    const chapters = (result.chapters || []).map((chapter) => ({
      entryIndex: Math.round(Number(chapter.entry_index)),
      title: String(chapter.title || "").trim(),
    })).filter((chapter) => chapter.title
      && chapter.entryIndex >= 1
      && chapter.entryIndex <= timelineEntries.length
      && !seenChapterIndexes.has(chapter.entryIndex)
      && seenChapterIndexes.add(chapter.entryIndex))
      .sort((a, b) => a.entryIndex - b.entryIndex)
      .slice(0, 10);
    if (titleCandidates.length !== 3 || tags.length !== 15 || !introduction || !callToAction || chapters.length < 3 || chapters[0]?.entryIndex !== 1) return NextResponse.json({ error: "AI가 제목·한국어 번역·설명·태그·타임라인을 모두 만들지 못했습니다. 다시 시도해주세요." }, { status: 502 });
    const titles = titleCandidates.map((item) => item.japanese);
    const titleTranslations = titleCandidates.map((item) => item.korean);
    const timeline = chapters.map((chapter) => {
      const entry = timelineEntries[chapter.entryIndex - 1];
      return `${formatYoutubeTimestamp(entry.startSeconds)} ${chapter.title}`;
    }).join("\n");
    const description = `${introduction}\n\n${callToAction}\n\n【目次】\n${timeline}`;
    return NextResponse.json({ titles, titleTranslations, description, tags, timeline });
  } catch (error) {
    console.error("Japan longform YouTube metadata error:", error);
    return NextResponse.json({ error: "YouTube 업로드 정보 생성 중 오류가 발생했습니다." }, { status: 500 });
  }
}
