import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

// 서버는 Node.js 환경에서 돈다 (파일 읽기 + 키 사용 때문에 필요)
export const runtime = "nodejs";

// 표정 id를 한글 설명으로 (프롬프트에 보조로 넣어 정확도를 높인다)
const EXPRESSION_LABELS: Record<string, string> = {
  expr01: "곤란한 표정", expr02: "곤란한 표정", expr03: "곤란한 표정", expr04: "곤란한 표정",
  expr05: "놀란 표정", expr06: "놀란 표정",
  expr07: "눈물 흘리는 표정", expr08: "눈물 흘리는 표정",
  expr09: "못마땅한 표정", expr10: "무표정", expr11: "미소 짓는 표정",
  expr12: "화난 표정", expr13: "화난 표정", expr14: "화난 표정", expr15: "화난 표정", expr16: "화난 표정",
  expr17: "활짝 웃는 표정", expr18: "정색한 표정",
};

interface GenerateBody {
  characterId: string;
  expressionId: string;
  poseText: string;
}

export async function POST(req: NextRequest) {
  try {
    // 1. 화면에서 보낸 선택 정보 받기
    const body: GenerateBody = await req.json();
    const { characterId, expressionId, poseText } = body;

    // 2. 키 확인 (.env.local 에서 가져옴, 화면에는 절대 노출 안 됨)
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "서버에 GEMINI_API_KEY가 설정되지 않았습니다. .env.local 을 확인하세요." },
        { status: 500 }
      );
    }

    // 3. 캐릭터 전신 그림과 표정 그림을 디스크에서 읽기
    //    public/images/ 안의 char01_full.png, expr01.png 형식
    const imagesDir = path.join(process.cwd(), "public", "images");

    let charBuffer: Buffer;
    let exprBuffer: Buffer;
    try {
      charBuffer = await fs.readFile(path.join(imagesDir, `${characterId}_full.png`));
    } catch {
      return NextResponse.json(
        { error: `캐릭터 전신 그림(${characterId}_full.png)을 찾을 수 없습니다. public/images 폴더를 확인하세요.` },
        { status: 400 }
      );
    }
    try {
      exprBuffer = await fs.readFile(path.join(imagesDir, `${expressionId}.png`));
    } catch {
      return NextResponse.json(
        { error: `표정 그림(${expressionId}.png)을 찾을 수 없습니다.` },
        { status: 400 }
      );
    }

    // 4. 프롬프트 구성: 첫 그림=캐릭터, 둘째 그림=표정. 얼굴은 캐릭터 유지, 표정만 가져오기.
    const exprLabel = EXPRESSION_LABELS[expressionId] ?? "지정된 표정";
    const poseLine = poseText
      ? `포즈는 다음과 같이: ${poseText}.`
      : "포즈는 정면을 보고 서 있는 기본 자세로.";

    const promptText =
      "첫 번째 이미지의 캐릭터를 그대로 사용하세요. " +
      "캐릭터의 정체성, 그림체, 머리 모양, 옷, 신체 비율을 정확히 유지하세요. " +
      `두 번째 이미지는 표정 참고용입니다. 그 표정(${exprLabel})만 캐릭터 얼굴에 적용하고, ` +
      "두 번째 이미지의 얼굴형이나 이목구비 자체는 캐릭터에 섞지 마세요. " +
      `${poseLine} ` +
      "배경은 완전한 순백색(#FFFFFF)으로, 그림자나 다른 요소 없이. " +
      "캐릭터 한 명만 그리세요.";

    // 5. Gemini 호출
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      // 처음엔 2.5 Flash Image(Nano Banana). 품질을 더 원하면 gemini-3-pro-image-preview 로 변경.
      model: "gemini-2.5-flash-image",
      contents: [
        { text: promptText },
        { inlineData: { mimeType: "image/png", data: charBuffer.toString("base64") } },
        { inlineData: { mimeType: "image/png", data: exprBuffer.toString("base64") } },
      ],
    });

    // 6. 응답에서 이미지 부분을 찾아서 화면으로 돌려주기
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        const dataUrl = `data:image/png;base64,${part.inlineData.data}`;
        return NextResponse.json({ image: dataUrl });
      }
    }

    // 이미지가 없으면 (안전필터에 걸렸거나 텍스트만 온 경우)
    return NextResponse.json(
      { error: "이미지가 생성되지 않았습니다. 프롬프트나 표정/포즈를 바꿔서 다시 시도해 보세요." },
      { status: 502 }
    );
  } catch (err) {
    console.error("generate error:", err);
    // 결제 미설정, 키 오류 등은 보통 여기로 온다
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "알 수 없는 오류" },
      { status: 500 }
    );
  }
}
