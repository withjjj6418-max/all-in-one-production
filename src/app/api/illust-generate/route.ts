import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

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
  poseImage: string | null;
  // 표정 충실도: "image" = 그림 그대로(단어 뺌), "word" = 단어 설명 포함
  exprMode: "image" | "word";
  // 모델 품질: "flash" = 빠름/저렴, "pro" = 고품질
  quality: "flash" | "pro";
}

function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

export async function POST(req: NextRequest) {
  try {
    const body: GenerateBody = await req.json();
    const { characterId, expressionId, poseText, poseImage, exprMode, quality } = body;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "서버에 GEMINI_API_KEY가 설정되지 않았습니다. .env.local 을 확인하세요." },
        { status: 500 }
      );
    }

    const imagesDir = path.join(process.cwd(), "public", "images");
    let charBuffer: Buffer;
    let exprBuffer: Buffer;
    try {
      charBuffer = await fs.readFile(path.join(imagesDir, `${characterId}_full.png`));
    } catch {
      return NextResponse.json(
        { error: `캐릭터 전신 그림(${characterId}_full.png)을 찾을 수 없습니다.` },
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

    const hasPoseImage = !!poseImage;

    // ===== 표정 지시: 선택에 따라 문구를 바꾼다 =====
    let exprLine: string;
    if (exprMode === "image") {
      // 그림 그대로 모드: 단어 설명을 빼고, 그림을 정확히 따르라고 강조
      exprLine =
        "두 번째 이미지는 표정 참고용입니다. 그 그림의 눈, 눈썹, 입 모양을 있는 그대로 정확히 캐릭터 얼굴에 옮기세요. " +
        "표정을 과장하거나 임의로 해석하지 말고, 참고 그림의 표정 강도와 모양을 그대로 유지하세요. " +
        "두 번째 이미지의 얼굴형이나 이목구비 자체는 캐릭터에 섞지 마세요.";
    } else {
      // 단어 설명 모드: 기존 방식 (표정 이름도 함께 알려줌)
      const exprLabel = EXPRESSION_LABELS[expressionId] ?? "지정된 표정";
      exprLine =
        `두 번째 이미지는 표정 참고용입니다. 그 표정(${exprLabel})을 캐릭터 얼굴에 적용하고, ` +
        "두 번째 이미지의 얼굴형이나 이목구비 자체는 캐릭터에 섞지 마세요.";
    }

    // ===== 포즈 지시 =====
    let poseLine: string;
    if (hasPoseImage) {
      poseLine =
        "세 번째 이미지는 포즈 참고용입니다. 그 포즈(자세, 팔다리 방향, 몸의 각도)만 캐릭터에 적용하고, " +
        "세 번째 이미지의 인물 생김새나 옷은 캐릭터에 섞지 마세요.";
      if (poseText) poseLine += ` 추가로 다음도 반영: ${poseText}.`;
    } else if (poseText) {
      poseLine = `포즈는 다음과 같이: ${poseText}.`;
    } else {
      poseLine = "포즈는 정면을 보고 서 있는 기본 자세로.";
    }

    const promptText =
      "첫 번째 이미지의 캐릭터를 그대로 사용하세요. " +
      "캐릭터의 정체성, 그림체, 머리 모양, 옷, 신체 비율을 정확히 유지하세요. " +
      `${exprLine} ` +
      `${poseLine} ` +
      "배경은 완전한 순백색(#FFFFFF)으로, 그림자나 다른 요소 없이. " +
      "캐릭터 한 명만 그리세요.";

    const contents: Array<
      | { text: string }
      | { inlineData: { mimeType: string; data: string } }
    > = [
      { text: promptText },
      { inlineData: { mimeType: "image/png", data: charBuffer.toString("base64") } },
      { inlineData: { mimeType: "image/png", data: exprBuffer.toString("base64") } },
    ];

    if (poseImage) {
      const parsed = parseDataUrl(poseImage);
      if (parsed) {
        contents.push({ inlineData: { mimeType: parsed.mimeType, data: parsed.data } });
      }
    }

    // ===== 모델 선택: 품질에 따라 =====
    const modelName =
      quality === "pro" ? "gemini-3-pro-image-preview" : "gemini-2.5-flash-image";

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: modelName,
      contents,
    });

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        const dataUrl = `data:image/png;base64,${part.inlineData.data}`;
        return NextResponse.json({ image: dataUrl });
      }
    }

    return NextResponse.json(
      { error: "이미지가 생성되지 않았습니다. 포즈나 표정을 바꿔서 다시 시도해 보세요." },
      { status: 502 }
    );
  } catch (err) {
    console.error("generate error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "알 수 없는 오류" },
      { status: 500 }
    );
  }
}
