import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { productionTypes } from "@/lib/project-workflows";

export const runtime = "nodejs";

type VerifyRequest = {
  projectId?: number;
  koreanScript?: string;
  japaneseTranslation?: string;
};

type OpenAIResponse = {
  status?: string;
  model?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  error?: { message?: string };
};

const MAX_SCRIPT_LENGTH = 100_000;

function extractOutputText(payload: OpenAIResponse) {
  return (payload.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text")
    .map((item) => item.text ?? "")
    .join("")
    .trim();
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

    const body = await request.json() as VerifyRequest;
    const projectId = Number(body.projectId);
    const koreanScript = body.koreanScript?.trim() ?? "";
    const japaneseTranslation = body.japaneseTranslation?.trim() ?? "";
    if (!Number.isInteger(projectId) || projectId <= 0) return NextResponse.json({ error: "프로젝트 정보가 올바르지 않습니다." }, { status: 400 });
    if (!koreanScript || !japaneseTranslation) return NextResponse.json({ error: "한국어 최종 대본과 Claude 일본어 번역본이 모두 필요합니다." }, { status: 400 });
    if (koreanScript.length > MAX_SCRIPT_LENGTH || japaneseTranslation.length > MAX_SCRIPT_LENGTH) return NextResponse.json({ error: "검수 가능한 대본 길이를 초과했습니다." }, { status: 413 });

    const { data: project } = await supabase.from("projects").select("id").eq("id", projectId).eq("user_id", user.id).eq("production_type", productionTypes.longformJapan).maybeSingle();
    if (!project) return NextResponse.json({ error: "프로젝트 접근 권한이 없습니다." }, { status: 403 });

    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY가 설정되지 않았습니다. Vercel과 .env.local에 키를 추가해주세요.", code: "KEY_MISSING" }, { status: 503 });

    const model = process.env.OPENAI_TRANSLATION_MODEL?.trim() || "gpt-5.6-sol";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180_000);
    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          reasoning: { effort: "low" },
          max_output_tokens: 24_000,
          instructions: [
            "당신은 한국어 원문과 일본어 번역을 교차 검수하는 전문 일본어 영상 대본 편집자입니다.",
            "Claude의 1차 번역을 기준으로 누락, 오역, 부자연스러운 직역, 인물·시점·존칭 불일치를 고치세요.",
            "일본 시청자가 듣기에 자연스러운 구어체로 다듬되 원문의 사건, 사실, 감정, 문단 순서를 임의로 삭제하거나 추가하지 마세요.",
            "TTS가 읽을 최종본이므로 설명, 마크다운, 교정 기호를 최종 대본에 넣지 마세요.",
          ].join("\n"),
          input: `아래 한국어 최종 대본과 Claude 1차 일본어 번역을 비교하여 검수하세요.\n\n[한국어 최종 대본]\n${koreanScript}\n\n[Claude 1차 일본어 번역]\n${japaneseTranslation}`,
          text: {
            format: {
              type: "json_schema",
              name: "japanese_translation_review",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  final_japanese: { type: "string", description: "TTS에 바로 사용할 수 있는 최종 일본어 대본" },
                  review_notes: { type: "string", description: "주요 수정 사항을 한국어로 간단히 정리한 검수 메모" },
                },
                required: ["final_japanese", "review_notes"],
                additionalProperties: false,
              },
            },
          },
        }),
        signal: controller.signal,
        cache: "no-store",
      });
    } finally {
      clearTimeout(timeout);
    }

    const payload = await response.json() as OpenAIResponse;
    if (!response.ok) {
      console.error("OpenAI translation verification failed:", response.status, payload.error?.message);
      return NextResponse.json({ error: payload.error?.message || "GPT 번역 검수에 실패했습니다." }, { status: 502 });
    }
    const outputText = extractOutputText(payload);
    if (!outputText) return NextResponse.json({ error: "GPT가 빈 검수 결과를 반환했습니다." }, { status: 502 });
    let parsed: { final_japanese?: string; review_notes?: string };
    try {
      parsed = JSON.parse(outputText) as typeof parsed;
    } catch {
      return NextResponse.json({ error: "GPT 검수 결과를 읽을 수 없습니다. 다시 시도해주세요." }, { status: 502 });
    }
    if (!parsed.final_japanese?.trim()) return NextResponse.json({ error: "GPT 최종 일본어 대본이 비어 있습니다." }, { status: 502 });
    return NextResponse.json({
      finalJapanese: parsed.final_japanese.trim(),
      reviewNotes: parsed.review_notes?.trim() || "",
      model: payload.model || model,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return NextResponse.json({ error: "GPT 검수 시간이 초과되었습니다. 다시 시도해주세요." }, { status: 504 });
    console.error("Japan longform translation verification error:", error);
    return NextResponse.json({ error: "번역 검수 중 오류가 발생했습니다." }, { status: 500 });
  }
}
