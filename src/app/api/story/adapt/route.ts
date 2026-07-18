import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type AdaptRequest = {
  projectId?: number;
  sourceText?: string;
  instruction?: string;
};

type AnthropicResponse = {
  content?: Array<{ type: string; text?: string }>;
  model?: string;
  error?: { message?: string };
};

const MAX_SOURCE_LENGTH = 120_000;
const MAX_INSTRUCTION_LENGTH = 30_000;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

    const body = await request.json() as AdaptRequest;
    const projectId = Number(body.projectId);
    const sourceText = body.sourceText?.trim() ?? "";
    const instruction = body.instruction?.trim() ?? "";

    if (!Number.isInteger(projectId) || projectId <= 0) {
      return NextResponse.json({ error: "프로젝트 정보가 올바르지 않습니다." }, { status: 400 });
    }
    if (!sourceText) return NextResponse.json({ error: "각색할 원문을 입력해주세요." }, { status: 400 });
    if (!instruction) return NextResponse.json({ error: "각색 지침을 입력해주세요." }, { status: 400 });
    if (sourceText.length > MAX_SOURCE_LENGTH || instruction.length > MAX_INSTRUCTION_LENGTH) {
      return NextResponse.json({ error: "원문 또는 지침이 허용 길이를 초과했습니다." }, { status: 413 });
    }

    const { data: project } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!project) return NextResponse.json({ error: "프로젝트 접근 권한이 없습니다." }, { status: 403 });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY가 설정되지 않았습니다. .env.local에 키를 추가해주세요.", code: "KEY_MISSING" },
        { status: 503 },
      );
    }

    const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);
    let response: Response;
    try {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 8_000,
          system: `${instruction}\n\n출력 규칙: 설명이나 인사말 없이, 바로 수정 가능한 완성 대본 본문만 출력하세요.`,
          messages: [{ role: "user", content: `다음 원문을 지침에 맞는 숏폼 사연 대본으로 각색하세요.\n\n[원문]\n${sourceText}` }],
        }),
        signal: controller.signal,
        cache: "no-store",
      });
    } finally {
      clearTimeout(timeout);
    }

    const payload = await response.json() as AnthropicResponse;
    if (!response.ok) {
      console.error("Anthropic adaptation failed:", response.status, payload.error?.message);
      return NextResponse.json({ error: "Claude 각색 요청에 실패했습니다. API 키와 사용량을 확인해주세요." }, { status: 502 });
    }

    const content = payload.content?.filter((block) => block.type === "text").map((block) => block.text ?? "").join("\n").trim();
    if (!content) return NextResponse.json({ error: "Claude가 빈 결과를 반환했습니다." }, { status: 502 });

    return NextResponse.json({ content, model: payload.model || model });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json({ error: "Claude 응답 시간이 초과되었습니다. 다시 시도해주세요." }, { status: 504 });
    }
    console.error("Story adaptation error:", error);
    return NextResponse.json({ error: "각색 중 오류가 발생했습니다." }, { status: 500 });
  }
}
