import { storyWorkflow, type StoryWorkflowKey } from "@/features/studios/config";

export const productionTypes = {
  shortsStory: "shorts_story",
  shortsHaejja: "shorts_haejja",
  longformJapan: "longform_japan",
  longformMovie: "longform_movie",
} as const;

export type ProductionType = (typeof productionTypes)[keyof typeof productionTypes];

export const storyWorkflowStages = [
  { status: "시작 전", progress: 0 },
  { status: "원문 수집", progress: 15 },
  { status: "Claude 각색", progress: 30 },
  { status: "대본 수정", progress: 45 },
  { status: "TTS · 자막", progress: 60 },
  { status: "캐릭터 제작", progress: 75 },
  { status: "Premiere 편집", progress: 85 },
  { status: "작업 완료", progress: 90 },
  { status: "업로드 완료", progress: 100 },
] as const;

export type StoryWorkflowStatus = (typeof storyWorkflowStages)[number]["status"];

export const storyStatusProgressMap: Record<string, number> = Object.fromEntries(
  storyWorkflowStages.map((stage) => [stage.status, stage.progress]),
);

export function getStoryProjectProgress(project: {
  status?: string | null;
  progress?: number | null;
  uploaded?: boolean | null;
}) {
  if (project.uploaded === true || project.status === "업로드 완료") return 100;
  return storyStatusProgressMap[project.status || "시작 전"] ?? project.progress ?? 0;
}

export type StoryWorkflowEvidence = Record<StoryWorkflowKey, boolean>;

export function getStoryWorkflowState(evidence: StoryWorkflowEvidence) {
  const furthestCompletedStep = storyWorkflow.reduce(
    (furthest, stage) => evidence[stage.key] ? Math.max(furthest, stage.step) : furthest,
    0,
  );
  const latestStage = storyWorkflow.find((stage) => stage.step === furthestCompletedStep) ?? null;

  return {
    complete: evidence,
    furthestCompletedStep,
    progress: Math.round((furthestCompletedStep / storyWorkflow.length) * 100),
    label: latestStage?.label ?? "시작 전",
  };
}
