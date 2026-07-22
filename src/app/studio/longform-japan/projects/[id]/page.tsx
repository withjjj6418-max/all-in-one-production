"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft, ArrowRight, Check, Circle, FileAudio, FilePenLine, Film,
  ImageIcon, Languages, Loader2, ScanText, Sparkles, Upload, Video,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { productionTypes } from "@/lib/project-workflows";
import { japanLongformWorkflow, type JapanLongformWorkflowKey } from "@/features/studios/config";
import { getJapanLongformWorkflowState } from "@/features/studios/longform-japan";

type Project = { id: number; title: string; category: string | null; memo: string | null; uploaded: boolean | null };
type ScriptData = { adapted_korean: string; final_korean: string; verified_japanese: string };
type StageCard = {
  key: JapanLongformWorkflowKey;
  title: string;
  description: string;
  action: string;
  icon: ComponentType<{ size?: number; className?: string }>;
};

const stageCards: StageCard[] = [
  { key: "source", title: "한국 원문 수집", description: "한국 YouTube 주소에서 자막을 가져오거나 원문을 직접 붙여넣습니다.", action: "원문 수집 열기", icon: ScanText },
  { key: "adapt", title: "Claude 한국어 각색", description: "15~20분 분량의 한국어 이야기로 각색하고 결과를 보관합니다.", action: "각색 열기", icon: Sparkles },
  { key: "script", title: "한국어 대본 수정", description: "번역 전에 사건 흐름과 문장을 최종 확정합니다.", action: "대본 수정 열기", icon: FilePenLine },
  { key: "translate", title: "일본어 번역 · 검수", description: "Claude 1차 번역과 GPT 2차 검수 결과를 비교하고 확정합니다.", action: "번역 열기", icon: Languages },
  { key: "voice", title: "ElevenLabs TTS · SRT", description: "한 명의 일본어 목소리로 구간을 생성하고 전체 음성과 자막을 만듭니다.", action: "음성 제작 열기", icon: FileAudio },
  { key: "image", title: "썸네일 · 어두운 배경", description: "Flow용 프롬프트와 생성한 두 이미지를 프로젝트에 보관합니다.", action: "이미지 작업 열기", icon: ImageIcon },
  { key: "motion", title: "무한 루프 영상", description: "배경 이미지에 미세한 움직임을 더한 Gemini 영상을 준비합니다.", action: "루프 영상 열기", icon: Video },
  { key: "premiere", title: "Premiere 편집 패키지", description: "일본어 음성·SRT·이미지·루프 영상을 한곳에 모읍니다.", action: "편집 패키지 열기", icon: Film },
  { key: "upload", title: "업로드 결과", description: "직접 업로드한 YouTube 링크와 최종 제목을 기록합니다.", action: "업로드 결과 열기", icon: Upload },
];

export default function LongformJapanWorkbenchPage() {
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id);
  const supabase = useMemo(() => createClient(), []);
  const [project, setProject] = useState<Project | null>(null);
  const [workflow, setWorkflow] = useState(() => getJapanLongformWorkflowState({ source: false, adapt: false, script: false, translate: false, voice: false, image: false, motion: false, premiere: false, upload: false }));
  const [loading, setLoading] = useState(true);
  const [schemaReady, setSchemaReady] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadWorkbench() {
      if (!Number.isInteger(projectId)) {
        setError("잘못된 프로젝트 주소입니다.");
        setLoading(false);
        return;
      }
      const projectRes = await supabase.from("projects").select("id, title, category, memo, uploaded").eq("id", projectId).eq("production_type", productionTypes.longformJapan).maybeSingle();
      if (!active) return;
      if (projectRes.error || !projectRes.data) {
        setError("일본 롱폼 프로젝트를 찾을 수 없습니다.");
        setLoading(false);
        return;
      }

      const [sourcesRes, scriptRes, voiceRunRes, visualsRes, editRes] = await Promise.all([
        supabase.from("japan_longform_sources").select("id").eq("project_id", projectId),
        supabase.from("japan_longform_scripts").select("adapted_korean, final_korean, verified_japanese").eq("project_id", projectId).maybeSingle(),
        supabase.from("japan_longform_voice_runs").select("id").eq("project_id", projectId).limit(1).maybeSingle(),
        supabase.from("japan_longform_visual_assets").select("asset_kind").eq("project_id", projectId),
        supabase.from("japan_longform_edit_packages").select("status").eq("project_id", projectId).maybeSingle(),
      ]);
      if (!active) return;
      const results = [sourcesRes, scriptRes, voiceRunRes, visualsRes, editRes];
      setSchemaReady(results.every((result) => !result.error));
      const script = scriptRes.data as ScriptData | null;
      const assetKinds = new Set((visualsRes.data ?? []).map((asset) => asset.asset_kind));
      setProject(projectRes.data as Project);
      setWorkflow(getJapanLongformWorkflowState({
        source: Boolean(sourcesRes.data?.length),
        adapt: Boolean(script?.adapted_korean),
        script: Boolean(script?.final_korean),
        translate: Boolean(script?.verified_japanese),
        voice: Boolean(voiceRunRes.data),
        image: assetKinds.has("thumbnail") || assetKinds.has("background"),
        motion: assetKinds.has("loop_video"),
        premiere: editRes.data?.status === "ready" || editRes.data?.status === "done",
        upload: projectRes.data.uploaded === true,
      }));
      setLoading(false);
    }
    loadWorkbench();
    return () => { active = false; };
  }, [projectId, supabase]);

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 size={30} className="animate-spin text-sky-700" /></div>;
  if (error || !project) return <div className="mx-auto max-w-xl rounded-2xl border border-border bg-white p-8 text-center shadow-sm"><p className="font-bold">{error || "프로젝트가 없습니다."}</p><Link href="/studio/longform-japan" className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-brand-olive"><ArrowLeft size={15} /> 일본 롱폼 스튜디오</Link></div>;

  return <div className="mx-auto max-w-7xl space-y-6">
    <Link href="/studio/longform-japan" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-sky-700"><ArrowLeft size={16} /> 일본 롱폼 스튜디오</Link>
    <section className="rounded-3xl border border-border bg-white p-6 shadow-sm sm:p-8"><div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between"><div className="min-w-0"><div className="mb-3 flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-700"><Languages size={13} /> 롱폼(일본)</span><span className="rounded-full bg-brand-cream px-3 py-1.5 text-xs font-bold text-brand-olive-dark">{project.category || "미분류"}</span></div><h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">{project.title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{project.memo || "한국 원문을 수집하고 일본 롱폼 제작을 시작해보세요."}</p></div><div className="w-full shrink-0 rounded-2xl bg-sky-50 p-4 lg:w-72"><div className="flex items-center justify-between text-xs"><span className="font-bold text-muted-foreground">워크플로 진행률</span><span className="font-extrabold text-sky-700">{workflow.progress}%</span></div><div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-sky-700" style={{ width: `${workflow.progress}%` }} /></div><p className="mt-2 text-[11px] text-muted-foreground">마지막 도달 단계 기준 · {workflow.furthestCompletedStep ? `${workflow.furthestCompletedStep}단계` : "시작 전"}</p></div></div></section>

    {!schemaReady && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">단계별 데이터를 사용하려면 Supabase에서 `20260721_longform_japan_foundation.sql`을 실행해주세요.</div>}

    <section className="overflow-x-auto rounded-2xl border border-border bg-white p-4 shadow-sm"><div className="flex min-w-[900px] items-center">{japanLongformWorkflow.map((stage, index) => <div key={stage.key} className="contents"><div className="flex min-w-20 flex-1 flex-col items-center text-center"><div className={`flex h-9 w-9 items-center justify-center rounded-full border-2 ${workflow.complete[stage.key] ? "border-sky-700 bg-sky-700 text-white" : "border-border bg-white text-muted-foreground"}`}>{workflow.complete[stage.key] ? <Check size={16} /> : <span className="text-xs font-bold">{stage.step}</span>}</div><span className={`mt-2 text-xs font-bold ${workflow.complete[stage.key] ? "text-sky-700" : "text-muted-foreground"}`}>{stage.shortLabel}</span></div>{index < japanLongformWorkflow.length - 1 && <div className={`mb-5 h-0.5 min-w-5 flex-1 ${workflow.complete[stage.key] ? "bg-sky-700" : "bg-border"}`} />}</div>)}</div></section>

    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{stageCards.map((stage) => { const Icon = stage.icon; const done = workflow.complete[stage.key]; return <article key={stage.key} className={`flex min-h-60 flex-col rounded-2xl border bg-white p-5 shadow-sm ${done ? "border-sky-300" : "border-border"}`}><div className="flex items-start justify-between"><div className={`flex h-11 w-11 items-center justify-center rounded-xl ${done ? "bg-sky-700 text-white" : "bg-sky-50 text-sky-700"}`}><Icon size={21} /></div><span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${done ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}`}>{done ? <Check size={12} /> : <Circle size={10} />}{done ? "작업 있음" : "시작 전"}</span></div><h2 className="mt-4 text-lg font-bold">{stage.title}</h2><p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">{stage.description}</p><Link href={`/studio/longform-japan/projects/${projectId}/${stage.key}`} className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-brand-olive px-4 text-sm font-bold text-white">{stage.action}<ArrowRight size={15} /></Link></article>; })}</section>
  </div>;
}
