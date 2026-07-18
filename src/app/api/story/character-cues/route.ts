import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type AnalyzeBody = { projectId?: number; script?: string };
type Cue = { characterName: string; dialogueExcerpt: string; emotion: string; pose: string; insertNote: string };

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    const body = await request.json() as AnalyzeBody;
    const projectId = Number(body.projectId);
    const script = body.script?.trim() ?? "";
    if (!Number.isInteger(projectId) || !script) return NextResponse.json({ error: "프로젝트와 대본이 필요합니다." }, { status: 400 });
    if (script.length > 40_000) return NextResponse.json({ error: "분석할 대본이 너무 깁니다." }, { status: 413 });

    const { data: project } = await supabase.from("projects").select("id").eq("id", projectId).eq("user_id", user.id).maybeSingle();
    if (!project) return NextResponse.json({ error: "프로젝트 접근 권한이 없습니다." }, { status: 403 });
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY가 설정되지 않았습니다." }, { status: 503 });

    const ai = new GoogleGenAI({ apiKey });
    const prompt = `다음 한국어 숏폼 사연 대본에서 캐릭터 이미지가 화면에 들어가면 좋은 핵심 장면을 최대 20개 골라라.
너무 촘촘하게 고르지 말고 인물의 등장, 감정 변화, 갈등이 분명한 장면 위주로 선정한다.
반드시 JSON 배열만 출력한다. 각 항목 형식:
{"characterName":"인물 역할","dialogueExcerpt":"대본의 짧은 원문 구절","emotion":"감정","pose":"추천 포즈","insertNote":"삽입 이유 또는 위치"}

[대본]
${script}`;
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: { responseMimeType: "application/json" },
    });
    const raw = response.text?.trim() ?? "";
    const parsed = JSON.parse(raw.replace(/^```json\s*/i, "").replace(/\s*```$/, "")) as unknown;
    if (!Array.isArray(parsed)) throw new Error("Invalid cue response");
    const cues: Cue[] = parsed.slice(0, 20).map((item) => {
      const value = item as Partial<Cue>;
      return {
        characterName: String(value.characterName || "등장인물").slice(0, 80),
        dialogueExcerpt: String(value.dialogueExcerpt || "").slice(0, 500),
        emotion: String(value.emotion || "무표정").slice(0, 80),
        pose: String(value.pose || "정면 기본 자세").slice(0, 300),
        insertNote: String(value.insertNote || "").slice(0, 300),
      };
    });
    return NextResponse.json({ cues });
  } catch (error) {
    console.error("Character cue analysis failed:", error);
    return NextResponse.json({ error: "대본의 캐릭터 장면을 분석하지 못했습니다." }, { status: 500 });
  }
}
