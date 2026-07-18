import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ExtractRequest = { projectId?: number; images?: string[] };

const supportedImage = /^data:(image\/(?:jpeg|png|gif|webp));base64,([A-Za-z0-9+/=]+)$/;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

    const body = await request.json() as ExtractRequest;
    const projectId = Number(body.projectId);
    const images = body.images ?? [];
    if (!Number.isInteger(projectId) || projectId <= 0 || images.length < 1 || images.length > 10) {
      return NextResponse.json({ error: "프로젝트와 1~10장의 캡처 이미지가 필요합니다." }, { status: 400 });
    }

    const parsed = images.map((image) => image.match(supportedImage));
    if (parsed.some((item) => !item)) {
      return NextResponse.json({ error: "JPG, PNG, GIF, WEBP 이미지만 사용할 수 있습니다." }, { status: 400 });
    }
    const totalBase64Length = parsed.reduce((sum, item) => sum + (item?.[2].length ?? 0), 0);
    if (totalBase64Length > 24_000_000) {
      return NextResponse.json({ error: "캡처 이미지 전체 용량이 너무 큽니다." }, { status: 413 });
    }

    const { data: project } = await supabase.from("projects").select("id").eq("id", projectId).eq("user_id", user.id).maybeSingle();
    if (!project) return NextResponse.json({ error: "프로젝트 접근 권한이 없습니다." }, { status: 403 });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "캡처 글자 추출에는 GEMINI_API_KEY 설정이 필요합니다." }, { status: 503 });

    const contents: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = parsed.map((item) => ({
      inlineData: { mimeType: item?.[1] || "image/png", data: item?.[2] || "" },
    }));
    contents.push({ text: "이미지들을 순서대로 읽어 게시글 본문을 추출하세요. 중복 캡처 구간은 한 번만 남기고, 버튼·광고·상태바·댓글 UI는 제외하세요. 설명 없이 정리된 원문 텍스트만 출력하세요." });

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({ model: "gemini-2.5-flash", contents });
    const content = response.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n").trim();
    if (!content) return NextResponse.json({ error: "캡처에서 읽을 수 있는 글자를 찾지 못했습니다." }, { status: 422 });
    return NextResponse.json({ content });
  } catch (error) {
    console.error("Story text extraction error:", error);
    return NextResponse.json({ error: "캡처 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
