import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY 설정이 필요합니다." }, { status: 503 });
    const body = await request.json() as { description?: string };
    const description = String(body.description || "").trim();
    if (!description) return NextResponse.json({ error: "한국어 상황 설명을 먼저 입력해주세요." }, { status: 400 });
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `다음 가족 쇼츠 장면 설명을 바탕으로 한국 랭킹 쇼츠용 짧은 제목 3개와 일본 릴스·쇼츠용 짧고 구어적인 표현 3개를 추천해줘. 일본어 상황 번역도 작성해줘. 과장된 허위 사실은 만들지 마. 한국어 제목은 공백 없이 4글자 이내, 일본어 표현은 14자 안팎으로 쓰고 일본어마다 한국어 뜻을 붙여줘.\n\n한국어 설명: ${description}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            japanese_description: { type: "string" },
            korean_suggestions: {
              type: "array",
              items: {
                type: "object",
                properties: { korean: { type: "string" }, tone: { type: "string" } },
                required: ["korean", "tone"],
              },
            },
            suggestions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  japanese: { type: "string" },
                  korean: { type: "string" },
                  tone: { type: "string" },
                },
                required: ["japanese", "korean", "tone"],
              },
            },
          },
          required: ["japanese_description", "korean_suggestions", "suggestions"],
        },
        temperature: 0.35,
      },
    });
    const parsed = JSON.parse(response.text || "{}");
    return NextResponse.json({ success: true, japaneseDescription: parsed.japanese_description || "", koreanSuggestions: (parsed.korean_suggestions || []).slice(0, 3), suggestions: (parsed.suggestions || []).slice(0, 3) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "일본어 표현 생성에 실패했습니다." }, { status: 500 });
  }
}
