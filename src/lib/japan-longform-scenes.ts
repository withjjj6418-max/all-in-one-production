export const JAPAN_STORY_SCENE_RESOLUTION = "1920 x 1080 pixels, 16:9 widescreen composition.";

export function withJapanStorySceneResolution(prompt: string) {
  const value = prompt.trim();
  return /1920\s*(?:x|×|\*)\s*1080/i.test(value)
    ? value
    : `${JAPAN_STORY_SCENE_RESOLUTION}${value ? ` ${value}` : ""}`;
}

const LEGACY_JAPAN_HORROR_ILLUSTRATION_STYLE = `1920 x 1080 pixels, 16:9 widescreen composition.

A cinematic psychological horror animation illustration for a Japanese mystery storytelling YouTube channel.

Semi-realistic 2D anime and horror webtoon style, realistic adult human proportions, restrained facial stylization, hand-drawn black ink outlines, slightly uneven pencil lines, visible graphite cross-hatching on the face, neck, hands and clothing shadows.

Matte cel shading mixed with pencil and charcoal texture, pale grayish skin, muted desaturated colors, cold blue-gray shadows, subtle dark red accents, strong but natural light and shadow contrast.

The characters look ordinary and believable, not glamorous, with subtle asymmetry, tired eyes, restrained expressions and realistic wrinkles.

Eerie and unsettling rather than grotesque, cinematic framing, dramatic storytelling composition, soft depth of field, slightly blurred background, faint film grain, illustrated horror animation still.

Dark red accents may appear only in architecture, clothing, signs, curtains, lighting, or small environmental objects, never as blood or bodily fluids.`;

export const JAPAN_HORROR_ILLUSTRATION_STYLE = `1920 x 1080 pixels, 16:9 widescreen composition.

A cinematic psychological horror illustration for a Japanese horror storytelling YouTube channel.

Semi-realistic anime mixed with Korean horror webtoon style.

Realistic adult human proportions.

Realistic facial proportions.

Thin black ink outlines.

Hand-drawn pencil line art.

Visible graphite cross-hatching on the face, neck, hands, and clothing shadows.

Matte cel shading mixed with subtle pencil texture.

Pale desaturated skin.

Muted color palette.

Cold blue-gray color grading.

Natural cinematic lighting.

Soft cinematic depth of field.

Subtle film grain.

Quiet and unsettling atmosphere.

Psychological suspense rather than gore.

Looks like a still frame from a Japanese horror animation.

Natural posture.

Subtle realistic facial expressions.

High quality illustration.`;

export function normalizeJapanStorySceneStylePrompt(prompt: string) {
  const value = prompt.trim();
  const legacyWithoutResolution = LEGACY_JAPAN_HORROR_ILLUSTRATION_STYLE
    .replace(`${JAPAN_STORY_SCENE_RESOLUTION}\n\n`, "");
  return !value
    || value === LEGACY_JAPAN_HORROR_ILLUSTRATION_STYLE
    || value === legacyWithoutResolution
    ? JAPAN_HORROR_ILLUSTRATION_STYLE
    : value;
}

export const JAPAN_HORROR_SAFETY_PROMPT = `Psychological dread and implied supernatural horror only.
No blood, no gore, no open wounds, no mutilation, no exposed organs, no graphic corpse, no explicit physical attack, and no shock imagery.
Convey fear through shadows, silhouettes, reflections, negative space, restrained body language, obscured figures, and off-screen implication.
All human characters are adults.
No text, captions, logos, or watermarks in the image.`;

export type JapanStoryScene = {
  id: string;
  project_id: number;
  user_id: string;
  sort_order: number;
  scene_title: string;
  source_excerpt: string;
  insertion_seconds: number;
  characters: string[];
  location: string;
  scene_action: string;
  camera_direction: string;
  horror_level: 1 | 2 | 3;
  safety_status: "safe" | "review" | "replace";
  safety_note: string;
  scene_prompt: string;
  status: "draft" | "approved" | "generated";
  image_url: string | null;
  storage_path: string | null;
};

export type JapanStorySceneDraft = Omit<
  JapanStoryScene,
  "id" | "project_id" | "user_id" | "sort_order" | "image_url" | "storage_path"
>;

type TimedScriptSegment = {
  section_title: string;
  text: string;
  start_seconds: number;
  end_seconds: number;
};

function formatTimestamp(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const remaining = value % 60;
  return [hours, minutes, remaining].map((part) => String(part).padStart(2, "0")).join(":");
}

export function buildJapanStorySceneAnalysisPrompt({
  projectTitle,
  sceneCount,
  segments,
}: {
  projectTitle: string;
  sceneCount: number;
  segments: TimedScriptSegment[];
}) {
  const timedScript = segments
    .map((segment, index) => `[구간 ${index + 1} · ${segment.section_title || "제목 없음"} · ${formatTimestamp(segment.start_seconds)}~${formatTimestamp(segment.end_seconds)}]\n${segment.text}`)
    .join("\n\n");

  return `당신은 일본 미스터리·심리 공포 유튜브 영상의 스토리보드 감독입니다.
아래 일본어 대본에서 영상 중간에 삽입할 핵심 장면 일러스트 ${sceneCount}개를 골라주세요.

[선정 원칙]
- 오프닝이나 단순 설명보다 이야기의 전환점, 불길한 발견, 긴장 고조, 결말의 여운을 우선합니다.
- 한 편의 이야기처럼 보이도록 같은 인물의 나이, 성별, 머리 모양, 옷, 체형을 모든 장면에서 일관되게 설명합니다.
- 직접적인 유혈, 상처, 훼손, 시신, 공격 장면은 선택하지 않습니다.
- 공포는 그림자, 실루엣, 반사, 비어 있는 공간, 문틈, 시선, 절제된 표정과 자세로 암시합니다.
- 등장인물은 모두 성인으로 설정합니다.
- insertion_seconds는 제공된 구간 시간을 참고해 해당 장면이 처음 언급되는 시각을 초 단위 정수로 작성합니다.
- source_excerpt는 대본에서 실제 일본어 문장 1~3개를 그대로 가져옵니다.
- scene_prompt는 이미지 생성용 영어 문장입니다. 모든 scene_prompt는 반드시 "1920 x 1080 pixels, 16:9 widescreen composition."으로 시작해야 합니다.
- 장면의 인물 외형·복장, 장소, 행동, 구도, 조명만 구체적으로 쓰고 공통 화풍은 넣지 않습니다.
- safety_status는 safe, review, replace 중 하나입니다. 직접적이거나 위험한 장면이면 review 또는 replace로 표시하고 더 안전한 대체 연출을 safety_note에 적습니다.
- horror_level은 1(은은함), 2(긴장감), 3(강한 암시) 중 하나입니다.

[출력 규칙]
설명이나 마크다운 없이 아래 구조의 유효한 JSON 하나만 출력하세요.
{
  "scenes": [
    {
      "scene_title": "한국어 장면 제목",
      "source_excerpt": "대본의 실제 일본어 구절",
      "insertion_seconds": 0,
      "characters": ["인물 이름 또는 역할"],
      "location": "한국어 장소 설명",
      "scene_action": "한국어 장면 행동과 상황",
      "camera_direction": "한국어 구도와 카메라 방향",
      "horror_level": 2,
      "safety_status": "safe",
      "safety_note": "한국어 안전 연출 메모",
      "scene_prompt": "1920 x 1080 pixels, 16:9 widescreen composition. English scene-specific image prompt",
      "status": "draft"
    }
  ]
}

[프로젝트]
${projectTitle}

[시간 정보가 포함된 최종 일본어 대본]
${timedScript}`;
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function parseJapanStorySceneResult(raw: string): JapanStorySceneDraft[] {
  const cleaned = raw.trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const parsed = JSON.parse(cleaned) as { scenes?: unknown };
  if (!Array.isArray(parsed.scenes) || !parsed.scenes.length) {
    throw new Error("scenes 배열이 있는 GPT JSON 결과를 붙여넣어주세요.");
  }

  return parsed.scenes.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error(`${index + 1}번 장면 형식이 올바르지 않습니다.`);
    const row = item as Record<string, unknown>;
    const horrorLevel = Number(row.horror_level);
    const safetyStatus = row.safety_status;
    const status = row.status;
    return {
      scene_title: asString(row.scene_title) || `장면 ${index + 1}`,
      source_excerpt: asString(row.source_excerpt),
      insertion_seconds: Math.max(0, Math.round(Number(row.insertion_seconds) || 0)),
      characters: Array.isArray(row.characters) ? row.characters.map(asString).filter(Boolean) : [],
      location: asString(row.location),
      scene_action: asString(row.scene_action),
      camera_direction: asString(row.camera_direction),
      horror_level: ([1, 2, 3].includes(horrorLevel) ? horrorLevel : 2) as 1 | 2 | 3,
      safety_status: (["safe", "review", "replace"].includes(String(safetyStatus)) ? safetyStatus : "review") as JapanStorySceneDraft["safety_status"],
      safety_note: asString(row.safety_note),
      scene_prompt: withJapanStorySceneResolution(asString(row.scene_prompt)),
      status: (["draft", "approved", "generated"].includes(String(status)) ? status : "draft") as JapanStorySceneDraft["status"],
    };
  });
}
