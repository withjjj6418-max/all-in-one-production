import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120;

type PromptResult = {
  prompt?: string;
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

    const body = await request.json() as { projectId?: number; kind?: "thumbnail" | "background" };
    const projectId = Number(body.projectId);
    if (!Number.isInteger(projectId)) return NextResponse.json({ error: "올바른 프로젝트가 필요합니다." }, { status: 400 });
    if (body.kind !== "thumbnail" && body.kind !== "background") return NextResponse.json({ error: "생성할 이미지 종류를 선택해주세요." }, { status: 400 });

    const [{ data: project }, { data: script }] = await Promise.all([
      supabase.from("projects").select("title").eq("id", projectId).eq("user_id", user.id).eq("production_type", "longform_japan").maybeSingle(),
      supabase.from("japan_longform_scripts").select("verified_japanese").eq("project_id", projectId).eq("user_id", user.id).maybeSingle(),
    ]);
    if (!project) return NextResponse.json({ error: "프로젝트 접근 권한이 없습니다." }, { status: 403 });
    const japaneseScript = script?.verified_japanese?.trim() || "";
    if (!japaneseScript) return NextResponse.json({ error: "최종 일본어 대본을 먼저 저장해주세요." }, { status: 400 });

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY가 설정되지 않았습니다." }, { status: 503 });

    const imageDirection = body.kind === "thumbnail" ? `Create ONE THUMBNAIL image prompt.
- Identify one visually memorable location, person, or story-relevant object from the script.
- Build one unmistakable focal subject with a strong silhouette and a composition readable at small size.
- The scene should feel tense and intriguing while remaining predominantly dark.
- Preserve the previous thumbnail approach: prioritize the most compelling visual moment, not necessarily a wide view of the primary setting.
- Do not ask the model to render a YouTube title.` : `Create ONE BACKGROUND image prompt.
- First identify the primary physical setting where most of the story takes place. If locations vary, choose the place of the central incident, discovery, or twist.
- Show an EXTERIOR WIDE ESTABLISHING SHOT of that setting, not its interior and not a close-up.
- If it is a building, show the complete exterior and its surroundings. If it is a mansion in the mountains, show the mansion within the mountain landscape. If the story happens on a rainy day, show the exterior in rain. Preserve important weather, season, terrain, and time-of-day details from the script.
- If most scenes occur indoors, infer only the immediate exterior of that same building or place; do not invent an unrelated haunted house, shrine, forest, or corridor.
- Make it an extremely dark, nearly still environmental plate for a 15–20 minute narration.
- Use a distant or wide view with broad calm negative space, minimal detail, no prominent person or face, no bright light, and no distracting focal point.
- Allow subtle rain, fog, window light, tree movement, or atmospheric noise that can later become a gentle loop animation.`;

    const prompt = `You are an art director for a Japanese supernatural and mystery narration YouTube channel.
Read the title and entire script, then write one production-ready English prompt for Google Flow image generation.

Art direction:
- cinematic Japanese supernatural mystery, restrained and realistic rather than graphic horror
- 16:9 landscape, nighttime, muted blue-black and charcoal palette, subtle film grain
- no words, letters, captions, logos, watermarks, borders, or split screen

${imageDirection}

Return JSON only:
{"prompt":"..."}

Project title: ${project.title}

Japanese script:
${japaneseScript.slice(0, 24000)}`;

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: { responseMimeType: "application/json", temperature: 0.35 },
    });
    const raw = response.text || "";
    let result: PromptResult;
    try { result = JSON.parse(raw) as PromptResult; }
    catch { return NextResponse.json({ error: "AI 프롬프트 결과를 읽지 못했습니다." }, { status: 502 }); }

    const generatedPrompt = result.prompt?.trim();
    if (!generatedPrompt) return NextResponse.json({ error: "AI가 프롬프트를 만들지 못했습니다." }, { status: 502 });
    return NextResponse.json({ prompt: generatedPrompt });
  } catch (error) {
    console.error("Japan longform visual prompt error:", error);
    return NextResponse.json({ error: "이미지 프롬프트 생성 중 오류가 발생했습니다." }, { status: 500 });
  }
}
