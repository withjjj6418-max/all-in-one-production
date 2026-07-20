"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft, ArrowRight, BookOpenText, Check, Circle, Download, ExternalLink,
  FileAudio, FilePenLine, Film, ImageIcon, Loader2, ScanText, Sparkles,
  Upload, WandSparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { storyWorkflow, type StoryWorkflowKey } from "@/features/studios/config";
import { getStoryWorkflowState } from "@/lib/project-workflows";

type Project = {
  id: number;
  title: string;
  status: string | null;
  progress: number | null;
  memo: string | null;
  category: string | null;
  uploaded?: boolean | null;
};

type Script = { id: string; content: string | null; edit_points: string | null };
type Asset = { id: string; title?: string | null; status?: string | null };
type WorkbenchData = { project: Project; script: Script | null; sources: Asset[]; adaptations: Asset[]; sounds: Asset[]; images: Asset[]; edits: Asset[]; editPackage: { status: string } | null; voiceRun: { id: string } | null };
type StageCard = {
  key: StoryWorkflowKey;
  title: string;
  description: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  href?: string;
  action: string;
  note: string;
};

const stageCards: StageCard[] = [
  { key: "source", title: "원문 수집함", description: "유튜브 URL, 게시물 링크, 복사한 글과 캡처 이미지를 한곳에 보관합니다.", icon: ScanText, href: "/research", action: "소스 수집하기", note: "프로젝트 연결형 수집함 구현 예정" },
  { key: "adapt", title: "Claude 사연 각색", description: "원문을 복사해 지침이 설정된 Claude 프로젝트에서 각색한 뒤 결과를 다시 보관합니다.", icon: WandSparkles, action: "수동 각색 열기", note: "원문 복사 후 Claude 프로젝트로 바로 이동" },
  { key: "script", title: "대본 수정", description: "각색한 대본을 다듬고 편집점과 캐릭터 등장 구간을 표시합니다.", icon: FilePenLine, action: "대본 열기", note: "기존 대본과 자동 연결됨" },
  { key: "voice", title: "캐릭터별 TTS · 자동 자막", description: "배역별 목소리로 대사 구간을 생성하고 전체 음성과 SRT를 준비합니다.", icon: FileAudio, action: "음성 제작 열기", note: "구간 수정·재생성·순서 편집 지원" },
  { key: "character", title: "캐릭터 제작", description: "등장인물과 감정에 맞는 캐릭터 이미지를 생성하고 장면에 연결합니다.", icon: ImageIcon, action: "이미지 만들기", note: "Gemini 이미지 편집 연결 예정" },
  { key: "premiere", title: "Premiere 전달", description: "음성, 자막, 캐릭터와 배경영상을 프로젝트별 편집 패키지로 정리합니다.", icon: Film, action: "편집 패키지 열기", note: "파일 다운로드와 편집 메모를 한곳에서 관리" },
  { key: "upload", title: "검수 · 업로드", description: "YouTube에 직접 업로드한 뒤 최종 제목, 게시 링크와 날짜를 프로젝트에 보관합니다.", icon: Upload, action: "업로드 결과 등록", note: "수동 업로드 후 링크만 등록" },
];

export default function StoryProjectWorkbenchPage() {
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id);
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<WorkbenchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadWorkbench() {
      if (!Number.isFinite(projectId)) {
        setError("잘못된 프로젝트 주소입니다.");
        setLoading(false);
        return;
      }
      const [projectRes, scriptRes, sourcesRes, adaptationsRes, soundsRes, imagesRes, editsRes, editPackageRes, voiceRunRes] = await Promise.all([
        supabase.from("projects").select("id, title, status, progress, memo, category, uploaded").eq("id", projectId).single(),
        supabase.from("scripts").select("id, content, edit_points").eq("project_id", projectId).maybeSingle(),
        supabase.from("story_sources").select("id").eq("project_id", projectId),
        supabase.from("story_adaptations").select("id").eq("project_id", projectId),
        supabase.from("post_sounds").select("id, title").eq("project_id", projectId),
        supabase.from("post_images").select("id, title").eq("project_id", projectId),
        supabase.from("post_edits").select("id, title, status").eq("project_id", projectId),
        supabase.from("story_edit_packages").select("status").eq("project_id", projectId).maybeSingle(),
        supabase.from("story_voice_runs").select("id").eq("project_id", projectId).not("combined_audio_url", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (!active) return;
      if (projectRes.error || !projectRes.data) {
        setError("프로젝트를 불러오지 못했습니다.");
      } else {
        setData({
          project: projectRes.data,
          script: scriptRes.data ?? null,
          sources: sourcesRes.data ?? [],
          adaptations: adaptationsRes.data ?? [],
          sounds: soundsRes.data ?? [],
          images: imagesRes.data ?? [],
          edits: editsRes.data ?? [],
          editPackage: editPackageRes.data ?? null,
          voiceRun: voiceRunRes.data ?? null,
        });
      }
      setLoading(false);
    }
    loadWorkbench();
    return () => { active = false; };
  }, [projectId, supabase]);

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 size={30} className="animate-spin text-brand-olive" /></div>;
  if (error || !data) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-border bg-white p-8 text-center shadow-sm">
        <p className="font-bold">{error || "프로젝트가 없습니다."}</p>
        <Link href="/studio/shorts-story" className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-brand-olive"><ArrowLeft size={15} /> 스튜디오로 돌아가기</Link>
      </div>
    );
  }

  const workflowState = getStoryWorkflowState({
    source: data.sources.length > 0,
    adapt: data.adaptations.length > 0,
    script: Boolean(data.script?.content),
    voice: data.sounds.length > 0 || Boolean(data.voiceRun),
    character: data.images.length > 0,
    premiere: data.editPackage?.status === "ready" || data.editPackage?.status === "done",
    upload: data.project.uploaded === true,
  });
  const { complete, furthestCompletedStep, progress } = workflowState;
  const hrefFor = (key: StoryWorkflowKey, fallback?: string) => {
    if (key === "source" || key === "adapt") return `/studio/shorts-story/projects/${projectId}/story`;
    if (key === "script") return `/scripts?project_id=${projectId}`;
    if (key === "voice") return `/studio/shorts-story/projects/${projectId}/voice/cast`;
    if (key === "character") return `/studio/shorts-story/projects/${projectId}/characters`;
    if (key === "premiere") return `/studio/shorts-story/projects/${projectId}/editing`;
    if (key === "upload") return `/studio/shorts-story/projects/${projectId}/publish`;
    return fallback;
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Link href="/studio/shorts-story" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-brand-olive"><ArrowLeft size={16} /> 사연 스튜디오</Link>
      <section className="rounded-3xl border border-border bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700"><BookOpenText size={13} /> 숏폼(사연)</span>
              <span className="rounded-full bg-brand-cream px-3 py-1.5 text-xs font-bold text-brand-olive-dark">{data.project.category || "미분류"}</span>
            </div>
            <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">{data.project.title}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{data.project.memo || "원문을 수집하고 사연 제작을 시작해보세요."}</p>
          </div>
          <div className="w-full shrink-0 rounded-2xl bg-brand-cream p-4 lg:w-72">
            <div className="flex items-center justify-between text-xs"><span className="font-bold text-muted-foreground">워크플로 진행률</span><span className="font-extrabold text-brand-olive-dark">{progress}%</span></div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-brand-olive transition-all" style={{ width: `${progress}%` }} /></div>
            <p className="mt-2 text-[11px] text-muted-foreground">마지막 도달 단계 기준 · {furthestCompletedStep > 0 ? `${furthestCompletedStep}단계` : "시작 전"}</p>
          </div>
        </div>
      </section>

      <section className="overflow-x-auto rounded-2xl border border-border bg-white p-4 shadow-sm">
        <div className="flex min-w-[760px] items-center">
          {storyWorkflow.map((stage, index) => (
            <div key={stage.key} className="contents">
              <div className="flex min-w-20 flex-1 flex-col items-center text-center">
                <div className={`flex h-9 w-9 items-center justify-center rounded-full border-2 ${complete[stage.key] ? "border-brand-olive bg-brand-olive text-white" : "border-border bg-white text-muted-foreground"}`}>
                  {complete[stage.key] ? <Check size={16} /> : <span className="text-xs font-bold">{stage.step}</span>}
                </div>
                <span className={`mt-2 text-xs font-bold ${complete[stage.key] ? "text-brand-olive-dark" : "text-muted-foreground"}`}>{stage.shortLabel}</span>
              </div>
              {index < storyWorkflow.length - 1 && <div className={`mb-5 h-0.5 min-w-7 flex-1 ${complete[stage.key] ? "bg-brand-olive" : "bg-border"}`} />}
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {stageCards.map((stage) => {
          const Icon = stage.icon;
          const href = hrefFor(stage.key, stage.href);
          const done = complete[stage.key];
          return (
            <article key={stage.key} className={`flex min-h-64 flex-col rounded-2xl border bg-white p-5 shadow-sm ${done ? "border-brand-olive/30" : "border-border"}`}>
              <div className="flex items-start justify-between">
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${done ? "bg-brand-olive text-white" : "bg-brand-cream text-brand-olive"}`}><Icon size={21} /></div>
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${done ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}`}>{done ? <Check size={12} /> : <Circle size={10} />}{done ? "작업 있음" : "시작 전"}</span>
              </div>
              <h2 className="mt-4 text-lg font-bold">{stage.title}</h2>
              <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">{stage.description}</p>
              <p className="mb-3 text-[11px] font-medium text-muted-foreground/80">{stage.note}</p>
              {href ? (
                <Link href={href} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-brand-olive px-4 text-sm font-bold text-white hover:bg-brand-olive-dark">{stage.action}<ArrowRight size={15} /></Link>
              ) : (
                <button disabled className="inline-flex h-10 cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-muted px-4 text-sm font-bold text-muted-foreground"><Sparkles size={15} />{stage.action}</button>
              )}
            </article>
          );
        })}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-white p-5"><div className="flex items-center gap-2 font-bold"><FilePenLine size={17} className="text-brand-olive" />대본</div><p className="mt-3 text-2xl font-extrabold">{data.script?.content?.length.toLocaleString() ?? 0}<span className="ml-1 text-sm font-medium text-muted-foreground">자</span></p></div>
        <div className="rounded-2xl border border-border bg-white p-5"><div className="flex items-center gap-2 font-bold"><FileAudio size={17} className="text-brand-olive" />음성 파일</div><p className="mt-3 text-2xl font-extrabold">{data.sounds.length}<span className="ml-1 text-sm font-medium text-muted-foreground">개</span></p></div>
        <div className="rounded-2xl border border-border bg-white p-5"><div className="flex items-center gap-2 font-bold"><ImageIcon size={17} className="text-brand-olive" />캐릭터 이미지</div><p className="mt-3 text-2xl font-extrabold">{data.images.length}<span className="ml-1 text-sm font-medium text-muted-foreground">개</span></p></div>
      </section>
      <div className="flex flex-wrap gap-3 rounded-2xl border border-dashed border-border bg-white/60 p-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><Download size={13} /> Premiere 패키지에서 음성·자막·캐릭터·배경영상을 한 번에 확인할 수 있습니다.</span>
        <span className="inline-flex items-center gap-1.5"><ExternalLink size={13} /> 기존 제작 화면은 그대로 사용할 수 있습니다.</span>
      </div>
    </div>
  );
}
