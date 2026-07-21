import {
  japanLongformWorkflow,
  type JapanLongformWorkflowKey,
} from "@/features/studios/config";

export type JapanLongformWorkflowEvidence = Record<JapanLongformWorkflowKey, boolean>;

export function getJapanLongformWorkflowState(evidence: JapanLongformWorkflowEvidence) {
  const furthestCompletedStep = japanLongformWorkflow.reduce(
    (furthest, stage) => evidence[stage.key] ? Math.max(furthest, stage.step) : furthest,
    0,
  );
  const latestStage = japanLongformWorkflow.find((stage) => stage.step === furthestCompletedStep) ?? null;

  return {
    complete: evidence,
    furthestCompletedStep,
    progress: Math.round((furthestCompletedStep / japanLongformWorkflow.length) * 100),
    label: latestStage?.label ?? "시작 전",
  };
}
