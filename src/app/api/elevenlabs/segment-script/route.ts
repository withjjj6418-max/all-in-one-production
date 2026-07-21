import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120;

type SectionKind = "opening" | "body" | "outro";
type AiSection = { kind?: string; title?: string; end_index?: number };

function splitLongText(text: string, maximum: number) {
  const pieces: string[] = [];
  let remaining = text.trim();
  while (remaining.length > maximum) {
    const sample = remaining.slice(0, maximum + 1);
    const boundaries = [sample.lastIndexOf("。"), sample.lastIndexOf("！"), sample.lastIndexOf("？"), sample.lastIndexOf("!"), sample.lastIndexOf("?")];
    const best = Math.max(...boundaries);
    const cut = best >= Math.floor(maximum * 0.45) ? best + 1 : maximum;
    pieces.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) pieces.push(remaining);
  return pieces;
}

function createUnits(script: string) {
  const paragraphs = script.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  const texts = paragraphs.flatMap((paragraph) => splitLongText(paragraph, 700));
  return texts.map((text, index) => ({ index: index + 1, text }));
}

function hardSplitSection(text: string, maximum = 4500) {
  return splitLongText(text, maximum);
}

function normalizeKind(value: string | undefined, position: number, total: number): SectionKind {
  if (position === 0) return "opening";
  if (position === total - 1) return "outro";
  return value === "opening" || value === "outro" ? value : "body";
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

    const body = await request.json() as { projectId?: number };
    const projectId = Number(body.projectId);
    if (!Number.isInteger(projectId)) return NextResponse.json({ error: "올바른 프로젝트가 필요합니다." }, { status: 400 });

    const [{ data: project }, { data: scriptRow }] = await Promise.all([
      supabase.from("projects").select("id").eq("id", projectId).eq("user_id", user.id).eq("production_type", "longform_japan").maybeSingle(),
      supabase.from("japan_longform_scripts").select("verified_japanese").eq("project_id", projectId).eq("user_id", user.id).maybeSingle(),
    ]);
    if (!project) return NextResponse.json({ error: "프로젝트 접근 권한이 없습니다." }, { status: 403 });
    const script = scriptRow?.verified_japanese?.trim() || "";
    if (!script) return NextResponse.json({ error: "최종 일본어 대본이 없습니다." }, { status: 400 });

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY가 설정되지 않았습니다." }, { status: 503 });
    const units = createUnits(script);
    if (!units.length) return NextResponse.json({ error: "분석할 대본 내용이 없습니다." }, { status: 400 });

    const prompt = `당신은 일본어 공포·괴담 롱폼 영상의 내레이션 편집자입니다.
아래에는 원문을 절대 수정하지 않도록 번호가 매겨진 블록이 있습니다.
당신은 블록의 내용 경계만 분석해야 하며, 새 문장을 쓰거나 블록 내용을 출력하지 마세요.

분할 규칙:
- 첫 구간은 opening, 마지막 구간은 outro, 나머지는 body입니다.
- 본문은 장소 변화, 시간 변화, 새로운 사건, 인물 등장, 단서 발견, 반전 같은 큰 이야기 전환점에서 나눕니다.
- 한 구간은 대체로 800~2,000자 분량을 목표로 하되, 의미가 이어지면 더 길어도 됩니다.
- 어떤 경우에도 한 구간이 4,500자를 넘지 않게 합니다.
- 모든 블록은 원래 순서대로 정확히 한 번 포함되어야 합니다.
- title은 일본어로 5~18자 정도의 짧은 장면 제목을 작성합니다.
- 각 항목에는 해당 구간의 마지막 블록 번호인 end_index만 작성합니다.

JSON 형식:
{"sections":[{"kind":"opening","title":"導入","end_index":2},{"kind":"body","title":"廃病院への到着","end_index":5},{"kind":"outro","title":"残された謎","end_index":8}]}

[원문 블록]
${units.map((unit) => `[${unit.index}] ${unit.text}`).join("\n\n")}`;

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: { responseMimeType: "application/json", temperature: 0.1 },
    });
    const raw = response.text || "";
    let parsed: { sections?: AiSection[] };
    try { parsed = JSON.parse(raw) as { sections?: AiSection[] }; }
    catch { return NextResponse.json({ error: "AI 구간 분석 결과를 읽지 못했습니다." }, { status: 502 }); }

    const suggestions = (parsed.sections || [])
      .map((section) => ({ ...section, end_index: Math.round(Number(section.end_index)) }))
      .filter((section) => Number.isInteger(section.end_index) && Number(section.end_index) > 0)
      .sort((a, b) => Number(a.end_index) - Number(b.end_index));
    if (!suggestions.length) return NextResponse.json({ error: "AI가 구간 경계를 만들지 못했습니다." }, { status: 502 });

    const built: Array<{ kind: SectionKind; title: string; text: string }> = [];
    let startIndex = 1;
    for (const suggestion of suggestions) {
      if (startIndex > units.length) break;
      const endIndex = Math.min(units.length, Math.max(startIndex, Number(suggestion.end_index)));
      const text = units.slice(startIndex - 1, endIndex).map((unit) => unit.text).join("\n\n").trim();
      if (text) built.push({ kind: "body", title: suggestion.title?.trim().slice(0, 40) || `本文 ${built.length}`, text });
      startIndex = endIndex + 1;
    }
    if (startIndex <= units.length) {
      built.push({ kind: "body", title: "物語の続き", text: units.slice(startIndex - 1).map((unit) => unit.text).join("\n\n") });
    }

    const limited = built.flatMap((section) => {
      const pieces = hardSplitSection(section.text);
      return pieces.map((text, index) => ({ ...section, title: pieces.length > 1 ? `${section.title} ${index + 1}` : section.title, text }));
    });
    const sections = limited.map((section, index) => ({
      sort_order: index,
      section_kind: normalizeKind(section.kind, index, limited.length),
      section_title: section.title,
      text: section.text,
    }));
    if (sections.length === 1) {
      sections[0].section_kind = "opening";
      sections[0].section_title = sections[0].section_title || "導入と結末";
    }
    return NextResponse.json({ sections });
  } catch (error) {
    console.error("Japan longform script segmentation error:", error);
    return NextResponse.json({ error: "AI 구간 분석 중 오류가 발생했습니다." }, { status: 500 });
  }
}
