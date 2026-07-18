"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { 
  ArrowLeft, 
  Clock, 
  Loader2, 
  Music, 
  Scissors, 
  Video, 
  Image as ImageIcon, 
  FileText,
  BookOpenText,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// DB 타입 정의
type Project = {
  id: number;
  title: string;
  status: string | null;
  progress: number;
  memo: string | null;
  updated_at?: string | null;
};

type Script = {
  id: string;
  title: string;
  content: string | null;
  edit_points: string | null;
};

type PostSound = {
  id: string;
  title: string;
  url: string | null;
  source: string | null;
  duration_seconds: number | null;
};

type PostImage = {
  id: string;
  title: string;
};

type PostEdit = {
  id: string;
  title: string;
  status: string | null;
  duration_seconds: number | null;
};

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = React.use(params);
  const router = useRouter();
  
  // 데이터 상태
  const [project, setProject] = useState<Project | null>(null);
  const [script, setScript] = useState<Script | null>(null);
  const [sounds, setSounds] = useState<PostSound[]>([]);
  const [images, setImages] = useState<PostImage[]>([]);
  const [edits, setEdits] = useState<PostEdit[]>([]);

  // UI 상태
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const supabase = createClient();

  useEffect(() => {
    async function fetchProjectData() {
      if (!projectId) return;
      
      try {
        setLoading(true);
        // 병렬로 프로젝트와 관련된 모든 에셋 조회
        const [projectRes, scriptRes, soundsRes, imagesRes, editsRes] = await Promise.all([
          supabase.from("projects").select("*").eq("id", Number(projectId)).single(),
          supabase.from("scripts").select("*").eq("project_id", Number(projectId)).maybeSingle(),
          supabase.from("post_sounds").select("*").eq("project_id", Number(projectId)).order("created_at", { ascending: false }),
          supabase.from("post_images").select("*").eq("project_id", Number(projectId)).order("created_at", { ascending: false }),
          supabase.from("post_edits").select("*").eq("project_id", Number(projectId)).order("created_at", { ascending: false }),
        ]);

        if (projectRes.error) {
          throw projectRes.error;
        }

        if (!projectRes.data) {
          throw new Error("Project not found");
        }

        setProject(projectRes.data);
        if (scriptRes.data) setScript(scriptRes.data);
        if (soundsRes.data) setSounds(soundsRes.data);
        if (imagesRes.data) setImages(imagesRes.data);
        if (editsRes.data) setEdits(editsRes.data);

        // 진행률 자동 계산
        let calculatedProgress = 0;
        const hasDoneEdit = editsRes.data?.some((edit: any) => edit.status === 'done');

        if (hasDoneEdit) {
          calculatedProgress = 100;
        } else {
          if (scriptRes.data?.content) calculatedProgress += 20;
          if (scriptRes.data?.edit_points) calculatedProgress += 20;
          if (soundsRes.data && soundsRes.data.length > 0) calculatedProgress += 20;
          if (imagesRes.data && imagesRes.data.length > 0) calculatedProgress += 20;
          if (editsRes.data && editsRes.data.length > 0) calculatedProgress += 20;
        }

        // UI에 즉시 반영
        setProject({
          ...projectRes.data,
          progress: calculatedProgress,
        });

        // DB와 다르면 UPDATE (불필요한 호출 방지)
        const currentProgress = projectRes.data.progress || 0;
        if (currentProgress !== calculatedProgress) {
          await supabase
            .from("projects")
            .update({ progress: calculatedProgress })
            .eq("id", Number(projectId));
        }
      } catch (err: any) {
        console.error("Error fetching project data:", err);
        setError("프로젝트를 찾을 수 없어요.");
      } finally {
        setLoading(false);
      }
    }

    fetchProjectData();
  }, [projectId, supabase]);

  // 날짜 형식 변환 헬퍼
  const timeAgo = (dateStr: string | null) => {
    if (!dateStr) return "방금 전";
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "방금 전";
    if (mins < 60) return `${mins}분 전`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}시간 전`;
    return `${Math.floor(hours / 24)}일 전`;
  };

  // 상태별 뱃지 색상 헬퍼
  const getStatusColor = (status: string | null) => {
    switch (status) {
      case "시작 전":
        return "bg-gray-100 text-gray-700";
      case "리서치":
      case "대본 작성":
      case "대본 완성":
        return "bg-blue-100 text-blue-700";
      case "녹음 중":
      case "편집 중":
        return "bg-amber-100 text-amber-700";
      case "검토 중":
        return "bg-purple-100 text-purple-700";
      case "업로드 완료":
        return "bg-green-100 text-green-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-60px)] flex-col items-center justify-center">
        <Loader2 size={32} className="animate-spin text-brand-olive" />
        <p className="mt-4 text-sm text-muted-foreground">프로젝트 정보를 불러오는 중...</p>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex min-h-[calc(100vh-60px)] flex-col items-center justify-center space-y-4">
        <p className="text-lg font-medium text-foreground">{error || "프로젝트를 찾을 수 없어요."}</p>
        <button 
          onClick={() => router.push("/projects")}
          className="rounded-lg bg-brand-olive px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-olive-dark"
        >
          목록으로 돌아가기
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-12 p-6">
      {/* A. 상단 헤더: 목록으로 돌아가기 */}
      <div>
        <Link 
          href="/projects" 
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft size={16} />
          프로젝트 목록으로
        </Link>
      </div>

      {/* B. 프로젝트 정보 카드 */}
      <div className="rounded-2xl border border-border bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <span className={`rounded-md px-2.5 py-1 text-xs font-semibold ${getStatusColor(project.status)}`}>
                {project.status || "상태 없음"}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock size={13} />
                {timeAgo(project.updated_at || null)} 업데이트됨
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {project.title}
            </h1>
          </div>
          <Link
            href={`/studio/shorts-story/projects/${projectId}`}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-brand-olive px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-olive-dark"
          >
            <BookOpenText size={16} />
            사연 워크벤치 열기
          </Link>
        </div>

        {/* 진행률 표시 */}
        <div className="mb-6 space-y-2">
          <div className="flex justify-between text-sm font-medium">
            <span className="text-muted-foreground">전체 진행률</span>
            <span className="font-bold text-brand-olive-dark">{project.progress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-brand-cream/60">
            <div 
              className="h-full bg-brand-olive transition-all duration-700 ease-out" 
              style={{ width: `${project.progress}%` }}
            />
          </div>
        </div>

        {/* 메모 표시 */}
        {project.memo && (
          <div className="mt-4 rounded-xl bg-gray-50 p-4 border border-gray-100">
            <h3 className="mb-2 text-xs font-semibold text-gray-500">메모</h3>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
              {project.memo}
            </p>
          </div>
        )}
      </div>

      {/* C. 본문 영역 (각종 에셋 표시) */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {/* 대본 */}
        <div className={`group rounded-2xl border bg-white p-5 shadow-sm transition-all hover:shadow-md ${script?.content ? 'border-blue-200' : 'border-border'}`}>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${script?.content ? 'bg-blue-100 text-blue-700' : 'bg-blue-50 text-blue-600'}`}>
                <FileText size={20} />
              </div>
              <h2 className="text-base font-bold text-foreground">📝 대본</h2>
            </div>
            {script?.content && (
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-600">✅ 작성됨</span>
            )}
          </div>
          
          <div className="min-h-[6rem]">
            {!script?.content ? (
              <div className="flex h-32 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-gray-50/50">
                <p className="mb-2 text-sm font-medium text-muted-foreground">아직 대본이 없어요</p>
                <Link href={`/scripts?project_id=${projectId}`} className="text-xs font-semibold text-brand-olive hover:text-brand-olive-dark">
                  ✏️ 대본 작성하러 가기
                </Link>
              </div>
            ) : (
              <div className="flex h-full flex-col justify-between">
                <div>
                  <p className="text-sm text-gray-600 line-clamp-3">
                    {script.content.substring(0, 200)}
                    {script.content.length > 200 ? "..." : ""}
                  </p>
                  <p className="mt-2 text-xs font-medium text-gray-400">총 {script.content.length}자</p>
                </div>
                <div className="mt-4 flex justify-end">
                  <Link href={`/scripts?project_id=${projectId}`} className="text-xs font-semibold text-brand-olive hover:text-brand-olive-dark">
                    ✏️ 편집하러 가기
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 편집점 */}
        <div className={`group rounded-2xl border bg-white p-5 shadow-sm transition-all hover:shadow-md ${script?.edit_points ? 'border-orange-200' : 'border-border'}`}>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${script?.edit_points ? 'bg-orange-100 text-orange-700' : 'bg-orange-50 text-orange-600'}`}>
                <Scissors size={20} />
              </div>
              <h2 className="text-base font-bold text-foreground">✂️ 편집점</h2>
            </div>
            {script?.edit_points && (
              <span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-600">✅ 작성됨</span>
            )}
          </div>
          
          <div className="min-h-[6rem]">
            {!script?.edit_points ? (
              <div className="flex h-32 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-gray-50/50">
                <p className="mb-1 text-sm font-medium text-muted-foreground">아직 편집점이 없어요</p>
                <p className="mb-2 text-[10px] text-gray-400">대본이 먼저 필요합니다</p>
                <Link href={`/scripts?project_id=${projectId}`} className="text-xs font-semibold text-brand-olive hover:text-brand-olive-dark">
                  ✏️ 대본 작성하러 가기
                </Link>
              </div>
            ) : (
              <div className="flex h-full flex-col justify-between">
                <div>
                  <p className="text-sm text-gray-600 line-clamp-3">
                    {script.edit_points.substring(0, 150)}
                    {script.edit_points.length > 150 ? "..." : ""}
                  </p>
                </div>
                <div className="mt-4 flex justify-end">
                  <Link href={`/scripts?project_id=${projectId}`} className="text-xs font-semibold text-brand-olive hover:text-brand-olive-dark">
                    ✏️ 편집하러 가기
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 사운드 */}
        <div className={`group rounded-2xl border bg-white p-5 shadow-sm transition-all hover:shadow-md ${sounds.length > 0 ? 'border-purple-200' : 'border-border'}`}>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${sounds.length > 0 ? 'bg-purple-100 text-purple-700' : 'bg-purple-50 text-purple-600'}`}>
                <Music size={20} />
              </div>
              <h2 className="text-base font-bold text-foreground">🎵 사운드</h2>
            </div>
            {sounds.length > 0 && (
              <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-600">사운드 {sounds.length}개</span>
            )}
          </div>
          
          <div className="min-h-[6rem]">
            {sounds.length === 0 ? (
              <div className="flex h-32 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-gray-50/50">
                <p className="mb-2 text-sm font-medium text-muted-foreground">아직 사운드가 없어요</p>
                <Link href={`/post/sound?project_id=${projectId}`} className="text-xs font-semibold text-brand-olive hover:text-brand-olive-dark">
                  + 추가하러 가기
                </Link>
              </div>
            ) : (
              <div className="flex h-full flex-col justify-between">
                <ul className="space-y-2">
                  {sounds.slice(0, 3).map((sound) => (
                    <li key={sound.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-xs">
                      <span className="font-medium text-gray-700 truncate mr-2">🎤 {sound.title}</span>
                      <span className="text-gray-400 shrink-0">
                        {sound.duration_seconds ? `${sound.duration_seconds}초` : ""} {sound.source ? `· ${sound.source}` : ""}
                      </span>
                    </li>
                  ))}
                  {sounds.length > 3 && (
                    <li className="text-center text-xs font-medium text-gray-400">+{sounds.length - 3}개 더</li>
                  )}
                </ul>
                <div className="mt-4 flex justify-end">
                  <Link href={`/post/sound?project_id=${projectId}`} className="text-xs font-semibold text-brand-olive hover:text-brand-olive-dark">
                    + 추가하러 가기
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 이미지 */}
        <div className={`group rounded-2xl border bg-white p-5 shadow-sm transition-all hover:shadow-md ${images.length > 0 ? 'border-green-200' : 'border-border'}`}>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${images.length > 0 ? 'bg-green-100 text-green-700' : 'bg-green-50 text-green-600'}`}>
                <ImageIcon size={20} />
              </div>
              <h2 className="text-base font-bold text-foreground">🖼️ 이미지</h2>
            </div>
            {images.length > 0 && (
              <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-600">이미지 {images.length}개</span>
            )}
          </div>
          
          <div className="min-h-[6rem]">
            {images.length === 0 ? (
              <div className="flex h-32 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-gray-50/50">
                <p className="mb-2 text-sm font-medium text-muted-foreground">아직 이미지가 없어요</p>
                <p className="text-[10px] text-gray-400">🚧 이미지 페이지는 곧 만들 예정입니다</p>
              </div>
            ) : (
              <div className="flex h-full flex-col justify-between">
                <ul className="space-y-2">
                  {images.slice(0, 3).map((img) => (
                    <li key={img.id} className="rounded-lg bg-gray-50 px-3 py-2 text-xs">
                      <span className="font-medium text-gray-700 truncate">🖼️ {img.title}</span>
                    </li>
                  ))}
                  {images.length > 3 && (
                    <li className="text-center text-xs font-medium text-gray-400">+{images.length - 3}개 더</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* 완성 영상 */}
        <div className={`group rounded-2xl border bg-white p-5 shadow-sm transition-all hover:shadow-md md:col-span-2 lg:col-span-2 ${edits.length > 0 ? 'border-rose-200' : 'border-border'}`}>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${edits.length > 0 ? 'bg-rose-100 text-rose-700' : 'bg-rose-50 text-rose-600'}`}>
                <Video size={20} />
              </div>
              <h2 className="text-base font-bold text-foreground">🎬 완성 영상</h2>
            </div>
            {edits.length > 0 && (
              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-600">영상 {edits.length}개</span>
            )}
          </div>
          
          <div className="min-h-[6rem]">
            {edits.length === 0 ? (
              <div className="flex h-32 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-gray-50/50">
                <p className="mb-2 text-sm font-medium text-muted-foreground">아직 완성 영상이 없어요</p>
                <Link href={`/post/edit?project_id=${projectId}`} className="text-xs font-semibold text-brand-olive hover:text-brand-olive-dark">
                  + 추가하러 가기
                </Link>
              </div>
            ) : (
              <div className="flex h-full flex-col justify-between">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {edits.slice(0, 3).map((edit) => (
                    <div key={edit.id} className="flex flex-col justify-between rounded-xl border border-gray-100 bg-gray-50 p-3">
                      <div className="mb-2 flex items-start justify-between">
                        <span className="font-semibold text-gray-800 line-clamp-1 text-sm">🎬 {edit.title}</span>
                        {edit.status && (
                          <span className="shrink-0 rounded-md bg-white px-1.5 py-0.5 text-[10px] font-medium border border-gray-200 text-gray-500">
                            {edit.status}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400">
                        {edit.duration_seconds ? `길이: ${Math.floor(edit.duration_seconds / 60)}:${String(edit.duration_seconds % 60).padStart(2, '0')}` : "길이 미상"}
                      </div>
                    </div>
                  ))}
                </div>
                {edits.length > 3 && (
                  <div className="mt-3 text-center text-xs font-medium text-gray-400">+{edits.length - 3}개의 영상이 더 있습니다</div>
                )}
                <div className="mt-4 flex justify-end">
                  <Link href={`/post/edit?project_id=${projectId}`} className="text-xs font-semibold text-brand-olive hover:text-brand-olive-dark">
                    + 추가하러 가기
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
