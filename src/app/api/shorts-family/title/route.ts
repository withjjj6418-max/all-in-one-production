import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type EntryInput = { korean_rank?: number; korean_label?: string; japanese_label?: string; material?: string; emotion?: string; cause?: string };

const koreanEndingOptions = [
  "(힐링 그 잡채인 마지막 🥰)",
  "(광대 승천하게 만드는 마지막 😊)",
  "(심쿵 유발하는 마지막 💘)",
  "(입틀막하게 귀여운 마지막 😍)",
  "(웃음 터지는 마지막 🤣)",
  "(눈물샘 자극하는 마지막 🥹)",
];

const japaneseEndingOptions = [
  "(癒やし確定のラスト🥰)",
  "(ニヤけ注意のラスト😊)",
  "(キュン死確定のラスト💘)",
  "(可愛すぎるラスト😍)",
  "(爆笑必至のラスト🤣)",
  "(涙腺崩壊のラスト🥹)",
];

function chooseKoreanEnding(value: string) {
  if (/입틀막|귀여/u.test(value)) return koreanEndingOptions[3];
  if (/심쿵|설렘|사랑/u.test(value)) return koreanEndingOptions[2];
  if (/광대|미소|웃게/u.test(value)) return koreanEndingOptions[1];
  if (/폭소|웃음|웃긴|코믹/u.test(value)) return koreanEndingOptions[4];
  if (/눈물|감동|뭉클/u.test(value)) return koreanEndingOptions[5];
  return koreanEndingOptions[0];
}

function chooseJapaneseEnding(value: string) {
  if (/可愛|かわい/u.test(value)) return japaneseEndingOptions[3];
  if (/キュン|恋|愛/u.test(value)) return japaneseEndingOptions[2];
  if (/ニヤ|笑顔/u.test(value)) return japaneseEndingOptions[1];
  if (/爆笑|笑い|おもしろ/u.test(value)) return japaneseEndingOptions[4];
  if (/涙|感動|泣/u.test(value)) return japaneseEndingOptions[5];
  return japaneseEndingOptions[0];
}

function normalizeKoreanTitle(value: string) {
  const normalized = value.trim()
    .replace(/역대급/g, "레전드")
    .replace(/영상\s*랭킹/g, "영상 순위")
    .replace(/\s*[|｜]\s*/g, "｜");
  const parts = normalized.split("｜");
  if (parts.length < 2) return normalized;
  const materialWords = parts[0].replace(/^레전드\s*/u, "").trim().split(/\s+/).filter(Boolean);
  const selectedWords: string[] = [];
  let materialLength = 0;
  for (const word of materialWords) {
    const wordLength = Array.from(word).length;
    if (materialLength + wordLength > 8) break;
    selectedWords.push(word);
    materialLength += wordLength;
  }
  const material = selectedWords.length > 0
    ? selectedWords.join(" ")
    : Array.from(materialWords[0] || "가족 순간").slice(0, 8).join("");
  parts[0] = `레전드 ${material}`;
  parts[1] = "영상 순위 TOP5";
  parts[2] = koreanEndingOptions.find((ending) => parts[2]?.includes(ending.slice(1, -1))) || chooseKoreanEnding(parts[2] || normalized);
  return parts.slice(0, 3).join("｜");
}

function normalizeJapaneseTitle(value: string) {
  const normalized = value.trim().replace(/\s*[|｜]\s*/g, "｜");
  const parts = normalized.split("｜");
  const currentEnding = parts[2] || parts.at(-1) || normalized;
  const ending = japaneseEndingOptions.find((option) => currentEnding.includes(option.slice(1, -1))) || chooseJapaneseEnding(currentEnding);
  if (parts.length >= 2) {
    parts[2] = ending;
    return parts.slice(0, 3).join("｜");
  }
  return `${normalized}｜${ending}`;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY 설정이 필요합니다." }, { status: 503 });
    const body = await request.json() as { entries?: EntryInput[]; direction?: string; previousKoreanTitle?: string; previousJapaneseTitle?: string; previousJapaneseTranslation?: string };
    const entries = (body.entries || [])
      .filter((entry) => Number(entry.korean_rank) >= 1 && Number(entry.korean_rank) <= 5)
      .sort((a, b) => Number(a.korean_rank) - Number(b.korean_rank));
    if (entries.length !== 5) return NextResponse.json({ error: "제목을 추천하려면 STEP 4에서 한국 1~5위 순위 문구를 모두 정해주세요." }, { status: 400 });
    const summary = entries.map((entry) => `${entry.korean_rank}위 · 소재:${entry.material || "-"} · 감정:${entry.emotion || "-"} · 조회원인:${entry.cause || "-"} · 한국문구:${entry.korean_label || "-"} · 일본문구:${entry.japanese_label || "-"}`).join("\n");
    const direction = String(body.direction || "").trim();
    const revisionBlock = `${direction
      ? `\n\n이전 제목(사용자가 고르거나 직접 수정한 상태): 한국어 "${body.previousKoreanTitle || ""}" / 일본어 "${body.previousJapaneseTitle || ""}"(${body.previousJapaneseTranslation || ""}).\n사용자가 요청한 수정 방향: "${direction}"\n이 방향을 최대한 반영해서 다시 만들어줘. 이전 제목을 그대로 복사하지 말고 방향에 맞게 발전시켜줘.`
      : ""}\n\n중요: 한국어 제목 첫 줄에서 "레전드" 뒤의 [영상 소재]는 공백 제외 최대 8글자의 짧고 자연스러운 명사구로 써. 긴 설명문이나 여러 가족 관계를 나열하지 마.\n한국어 세 번째 줄은 장면 감정에 맞춰 다음 중 정확히 하나만 사용해: ${koreanEndingOptions.join(", ")}.\n일본어 제목도 반드시 "첫 훅｜소재와 5選｜하단 문구"의 3줄 구조로 만들고, 세 번째 줄은 다음 일본식 표현 중 정확히 하나만 사용해: ${japaneseEndingOptions.join(", ")}. 직역투로 새 문구를 만들지 마.`;
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `다음은 완성된 가족 랭킹 쇼츠의 한국 1~5위 장면 정보다. 이 내용만 근거로 영상 전체 제목 후보를 만들어줘. 새로운 사실을 지어내지 마.\n\n${summary}${revisionBlock}\n\n한국어 전체 제목 3개, 일본어 전체 제목 3개를 만들어줘.\n- 한국어 제목은 반드시 썸네일 3줄 구조로 작성하고 줄 구분은 "｜"를 사용해 한 문자열로 반환해. 정확한 형식: "레전드 [영상들의 공통 소재·행동]｜영상 순위 TOP5｜([마지막/1위 장면의 감정 예고 + 어울리는 이모지])".\n- 첫 줄은 위 5개 영상의 실제 소재를 종합해 구체적으로 써. 예: "레전드 아기 반응", "레전드 엄마의 실수", "레전드 별별 훈육법", "레전드 예측불가 아이들". 소재가 가족이면 무조건 예시를 복사하지 말고 장면 정보에 맞게 바꿔.\n- "역대급"이라는 단어는 사용하지 말고 반드시 "레전드"를 사용해. "영상 랭킹"도 사용하지 말고 반드시 "영상 순위"라고 써. 두 번째 줄은 정확히 "영상 순위 TOP5"로 고정해.\n- 세 번째 줄은 1위 장면을 거짓 없이 기대하게 만드는 짧은 괄호 문구로 작성해. 예: "(너무 사랑스러운 마지막🥰)", "(너무 안타까운 마지막🤣)". 감정과 이모지는 실제 장면에 맞춰.\n- 한국어 후보 3개는 첫 줄의 관점을 서로 다르게 만들되 모두 위 형식을 지켜.\n- 일본어 제목: 직역 금지. 일본 랭킹형 쇼츠 채널(예: @buzrino)의 실제 썸네일 상단 문구 공식을 따라줘 — "선택 질문 + 좁은 소재 + 이미 검증됐다는 표현 + 유한한 개수" 구조. 자주 쓰는 단어: どれが1番好き？, どれが優勝？, バズった, 最高, 感動, 5選. 예시 형태: "どれが1番好き？家族のバズった5選". 3개는 서로 다른 훅(선택 질문형/우승 판정형/감정 예고형 등)으로 만들고 25자 이내. 일본어 후보마다 자연스러운 한국어 뜻을 붙여줘.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            korean_title_candidates: { type: "array", items: { type: "string" } },
            japanese_title_candidates: {
              type: "array",
              items: {
                type: "object",
                properties: { japanese: { type: "string" }, korean: { type: "string" } },
                required: ["japanese", "korean"],
              },
            },
          },
          required: ["korean_title_candidates", "japanese_title_candidates"],
        },
        temperature: 0.4,
      },
    });
    const parsed = JSON.parse(response.text || "{}");
    const koreanTitleCandidates = ((parsed.korean_title_candidates || []) as string[]).filter(Boolean).map(normalizeKoreanTitle).slice(0, 3);
    const japaneseTitleCandidates = ((parsed.japanese_title_candidates || []) as Array<{ japanese?: string; korean?: string }>).filter((item) => item?.japanese)
      .map((item) => ({ japanese: normalizeJapaneseTitle(String(item.japanese)), korean: String(item.korean || "") })).slice(0, 3);
    if (koreanTitleCandidates.length < 3 || japaneseTitleCandidates.length < 3) {
      return NextResponse.json({ error: "한·일 제목 후보 3개를 만들지 못했습니다. 다시 시도해주세요." }, { status: 502 });
    }
    return NextResponse.json({ success: true, koreanTitleCandidates, japaneseTitleCandidates });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "제목 추천 생성에 실패했습니다." }, { status: 500 });
  }
}
