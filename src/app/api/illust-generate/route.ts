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
  propImage?: string | null;
  propText?: string;
  propPosition?: "left" | "center" | "right";
  primaryPosition?: "left" | "center" | "right";
  sceneText?: string;
  secondCharacter?: {
    characterId: string;
    expressionId: string;
    poseText: string;
    position: "left" | "center" | "right";
  } | null;
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
    const actors = [
      { characterId, expressionId, poseText, position: body.primaryPosition || (body.secondCharacter ? "left" : "center") },
      ...(body.secondCharacter ? [body.secondCharacter] : []),
    ];
    if (actors.length === 2 && actors[0].characterId === actors[1].characterId) {
      return NextResponse.json({ error: "두 명 장면에서는 서로 다른 캐릭터를 선택해주세요." }, { status: 400 });
    }

    const positionLabels = { left: "화면 왼쪽", center: "화면 가운데", right: "화면 오른쪽" } as const;
    const referenceParts: Array<{ inlineData: { mimeType: string; data: string } }> = [];
    const actorReferencePairs: Array<Array<{ inlineData: { mimeType: string; data: string } }>> = [];
    const actorInstructions: string[] = [];
    for (const [index, actor] of actors.entries()) {
      let charBuffer: Buffer;
      let exprBuffer: Buffer;
      try {
        [charBuffer, exprBuffer] = await Promise.all([
          fs.readFile(path.join(imagesDir, `${actor.characterId}_full.png`)),
          fs.readFile(path.join(imagesDir, `${actor.expressionId}.png`)),
        ]);
      } catch {
        return NextResponse.json({ error: `${index + 1}번 인물의 캐릭터 또는 표정 그림을 찾을 수 없습니다.` }, { status: 400 });
      }
      const characterReferenceNumber = index * 2 + 1;
      const expressionReferenceNumber = characterReferenceNumber + 1;
      const expressionInstruction = exprMode === "image"
        ? `${expressionReferenceNumber}번 참고 이미지의 눈·눈썹·입 모양과 강도를 그대로 적용하세요.`
        : `${expressionReferenceNumber}번 참고 이미지의 ${EXPRESSION_LABELS[actor.expressionId] ?? "지정된 표정"}을 적용하세요.`;
      const position = positionLabels[actor.position as keyof typeof positionLabels] || "화면 가운데";
      actorInstructions.push(
        `${index + 1}번 인물은 ${characterReferenceNumber}번 참고 이미지의 캐릭터입니다. ` +
        `머리, 얼굴, 신체 비율과 그림체를 정확히 유지하고 ${position}에 배치하세요. ` +
        `${expressionInstruction} 표정 참고 이미지의 얼굴 생김새는 섞지 마세요. ` +
        "원본의 옷도 그대로 유지하세요. " +
        `포즈는 ${actor.poseText?.trim() || "정면을 보는 자연스러운 기본 자세"}로 하세요.`
      );
      const referencePair = [
        { inlineData: { mimeType: "image/png", data: charBuffer.toString("base64") } },
        { inlineData: { mimeType: "image/png", data: exprBuffer.toString("base64") } },
      ];
      referenceParts.push(...referencePair);
      actorReferencePairs.push(referencePair);
    }

    let propPart: { inlineData: { mimeType: string; data: string } } | null = null;
    if (body.propImage) {
      if (body.propImage.length > 10_000_000) return NextResponse.json({ error: "소품 이미지가 너무 큽니다." }, { status: 413 });
      const parsedProp = parseDataUrl(body.propImage);
      if (!parsedProp) return NextResponse.json({ error: "소품 이미지를 읽을 수 없습니다." }, { status: 400 });
      propPart = { inlineData: { mimeType: parsedProp.mimeType, data: parsedProp.data } };
    }

    const propReferenceNumber = actors.length * 2 + 1;
    const propPosition = positionLabels[body.propPosition || "center"];
    const propLine = propPart
      ? `${propReferenceNumber}번 참고 이미지는 사람이 아니라 장면에 넣을 소품입니다. 캐릭터의 얼굴이나 몸에 섞지 말고, 소품의 형태와 그림체를 유지해 ${propPosition}에 한 개만 배치하세요. ${body.propText?.trim() || "장면에 자연스럽게 배치하세요."}`
      : "";
    const poseReferenceNumber = actors.length * 2 + (propPart ? 2 : 1);
    const poseLine = poseImage
      ? `${poseReferenceNumber}번 참고 이미지는 전체 장면의 자세와 구도 참고용입니다. 인물 생김새나 옷은 가져오지 말고 배치와 동작만 참고하세요.`
      : "";
    const promptText =
      `${actors.length === 2 ? "서로 다른 두 캐릭터가 함께 나오는 한 장면" : "캐릭터 한 명이 나오는 장면"}을 그리세요. ` +
      `${actorInstructions.join(" ")} ` +
      `${body.sceneText?.trim() ? `두 인물의 상황과 행동은 다음과 같습니다: ${body.sceneText.trim()}. ` : ""}` +
      `${propLine} ` +
      `${poseLine} ` +
      (actors.length === 2
        ? "두 캐릭터의 얼굴, 머리, 옷, 신체를 서로 섞거나 바꾸지 말고 각각 독립적으로 정확히 유지하세요. 복제 인물이나 제3의 인물을 추가하지 마세요. "
        : "캐릭터를 복제하거나 다른 인물을 추가하지 마세요. ") +
      "배경은 완전한 순백색(#FFFFFF)으로, 그림자나 다른 요소 없이 그리세요.";

    const contents: Array<
      | { text: string }
      | { inlineData: { mimeType: string; data: string } }
    > = [
      { text: promptText },
      ...referenceParts,
    ];

    if (propPart) contents.push(propPart);

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
    const generateImage = async (imageContents: typeof contents) => {
      const response = await ai.models.generateContent({ model: modelName, contents: imageContents });
      const parts = response.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if (part.inlineData?.data) return `data:image/png;base64,${part.inlineData.data}`;
      }
      throw new Error("이미지가 생성되지 않았습니다.");
    };

    if (actors.length === 2) {
      const actorImages = await Promise.all(actors.map((actor, index) => {
        const expressionInstruction = exprMode === "image"
          ? "두 번째 참고 이미지의 눈, 눈썹, 입 모양과 표정 강도만 정확히 적용하세요."
          : `두 번째 참고 이미지의 ${EXPRESSION_LABELS[actor.expressionId] ?? "지정된 표정"}만 적용하세요.`;
        const individualPrompt =
          "첫 번째 참고 이미지의 캐릭터 한 명만 전신으로 그리세요. " +
          "원본 캐릭터의 얼굴형, 이목구비 위치, 머리 모양, 옷, 색상, 신체 비율과 그림체를 변경하지 말고 그대로 복제하세요. " +
          `${expressionInstruction} 두 번째 참고 이미지의 얼굴형이나 머리 모양은 절대 가져오지 마세요. ` +
          `포즈는 ${actor.poseText?.trim() || "정면을 보는 자연스러운 기본 자세"}로 하세요. ` +
          "나중에 다른 캐릭터와 합성할 수 있도록 머리부터 발끝까지 잘리지 않게 화면 가운데에 배치하세요. " +
          `${index === 0 && propPart ? `세 번째 참고 이미지는 사람이 아니라 소품입니다. 캐릭터의 외모에 섞지 말고 소품 한 개만 ${positionLabels[body.propPosition || "center"]}에 ${body.propText?.trim() || "자연스럽게 사용하거나 배치"}하세요. ` : "다른 소품을 추가하지 마세요. "}` +
          "다른 사람, 얼굴, 신체 일부를 추가하지 마세요. 배경은 완전한 순백색(#FFFFFF)이고 그림자는 없어야 합니다.";
        return generateImage([{ text: individualPrompt }, ...actorReferencePairs[index], ...(index === 0 && propPart ? [propPart] : [])]);
      }));
      return NextResponse.json({ actorImages });
    }

    const image = await generateImage(contents);
    return NextResponse.json({ image });

  } catch (err) {
    console.error("generate error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "알 수 없는 오류" },
      { status: 500 }
    );
  }
}
