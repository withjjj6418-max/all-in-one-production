import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type TranscribeRequest = {
  audio?: string;
  mimeType?: string;
  chunkIndex?: number;
  totalChunks?: number;
};

const base64Audio = /^[A-Za-z0-9+/=]+$/;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

    const body = await request.json() as TranscribeRequest;
    const audio = body.audio?.trim() || "";
    if (!audio || audio.length > 3_600_000 || !base64Audio.test(audio)) {
      return NextResponse.json({ error: "음성 조각의 형식이나 용량이 올바르지 않습니다." }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "음성 받아쓰기에는 GEMINI_API_KEY 설정이 필요합니다." }, { status: 503 });

    const chunkNumber = Math.max(1, Number(body.chunkIndex || 0) + 1);
    const totalChunks = Math.max(chunkNumber, Number(body.totalChunks || 1));
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        { inlineData: { mimeType: body.mimeType || "audio/wav", data: audio } },
        { text: [
          `이 음성은 전체 파일을 순서대로 나눈 ${totalChunks}개 중 ${chunkNumber}번째 조각입니다.`,
          "들리는 말을 원래 언어 그대로 정확하게 받아쓰세요.",
          "한국어 음성은 자연스러운 맞춤법과 문장부호만 정리하되 내용을 요약하거나 각색하지 마세요.",
          "화자 이름, 타임코드, 설명, 마크다운, 코드 블록을 붙이지 말고 실제 발화문만 출력하세요.",
          "음악이나 무음뿐이라면 아무 글자도 출력하지 마세요.",
        ].join("\n") },
      ],
    });
    const content = response.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("\n")
      .replace(/^```(?:text)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim() || "";

    return NextResponse.json({ content });
  } catch (error) {
    console.error("Story audio transcription error:", error);
    return NextResponse.json({ error: "음성을 글자로 바꾸는 중 오류가 발생했습니다." }, { status: 500 });
  }
}
