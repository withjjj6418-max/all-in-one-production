import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120;

type PromptResult = { prompt?: string };

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

    const body = await request.json() as { projectId?: number; backgroundAssetId?: string };
    const projectId = Number(body.projectId);
    if (!Number.isInteger(projectId) || !body.backgroundAssetId) return NextResponse.json({ error: "프로젝트와 배경 이미지가 필요합니다." }, { status: 400 });

    const [{ data: project }, { data: script }, { data: background }] = await Promise.all([
      supabase.from("projects").select("title").eq("id", projectId).eq("user_id", user.id).eq("production_type", "longform_japan").maybeSingle(),
      supabase.from("japan_longform_scripts").select("verified_japanese").eq("project_id", projectId).eq("user_id", user.id).maybeSingle(),
      supabase.from("japan_longform_visual_assets").select("prompt").eq("id", body.backgroundAssetId).eq("project_id", projectId).eq("user_id", user.id).eq("asset_kind", "background").maybeSingle(),
    ]);
    if (!project || !background) return NextResponse.json({ error: "프로젝트 또는 배경 이미지에 접근할 수 없습니다." }, { status: 403 });

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY가 설정되지 않았습니다." }, { status: 503 });

    const prompt = `You are preparing an image-to-video prompt for Google Gemini video generation.
The uploaded reference is an extremely dark exterior establishing shot used behind a 15–20 minute Japanese supernatural narration.
Write ONE concise English animation prompt that preserves the reference image and creates a calm seamless loop.

Rules:
- Keep the original composition, architecture, landscape, darkness, color, and camera position unchanged.
- Locked-off tripod camera. No pan, tilt, zoom, dolly, orbit, reframing, cuts, transitions, or camera shake.
- No new people, faces, creatures, objects, lights, text, logos, or events.
- Choose only one or two subtle movements already supported by the scene and story: rain falling, faint fog drift, slight tree or grass movement, tiny distant window-light flicker, weak analog noise, or a barely moving door only if a door is central to the scene.
- Movement must be slow, minimal, atmospheric, and non-distracting.
- The final frame should visually match the first frame for a seamless infinite loop.
- Do not animate everything at once.

Return JSON only: {"prompt":"..."}

Project title: ${project.title}
Background image prompt: ${background.prompt || "No saved prompt"}
Japanese story excerpt: ${(script?.verified_japanese || "").slice(0, 12000)}`;

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: { responseMimeType: "application/json", temperature: 0.25 },
    });
    let result: PromptResult;
    try { result = JSON.parse(response.text || "") as PromptResult; }
    catch { return NextResponse.json({ error: "AI 모션 프롬프트 결과를 읽지 못했습니다." }, { status: 502 }); }
    const generatedPrompt = result.prompt?.trim();
    if (!generatedPrompt) return NextResponse.json({ error: "AI가 모션 프롬프트를 만들지 못했습니다." }, { status: 502 });
    return NextResponse.json({ prompt: generatedPrompt });
  } catch (error) {
    console.error("Japan longform motion prompt error:", error);
    return NextResponse.json({ error: "모션 프롬프트 생성 중 오류가 발생했습니다." }, { status: 500 });
  }
}
