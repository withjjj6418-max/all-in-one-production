"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  Link2,
  Loader2,
  Save,
  Upload,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Project = {
  id: number;
  title: string;
  uploaded: boolean | null;
  status: string | null;
};

type PublishRecord = {
  final_title: string;
  youtube_url: string;
  uploaded_at: string | null;
  memo: string;
};

function today() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function isYoutubeUrl(value: string) {
  try {
    const url = new URL(value.trim());
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtu.be") return url.pathname.length > 1;
    if (host !== "youtube.com" && host !== "m.youtube.com") return false;
    return Boolean(url.searchParams.get("v")) || /^\/(shorts|live)\/[A-Za-z0-9_-]+/.test(url.pathname);
  } catch {
    return false;
  }
}

export default function StoryPublishPage() {
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [finalTitle, setFinalTitle] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [uploadedAt, setUploadedAt] = useState(today());
  const [memo, setMemo] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"draft" | "complete" | null>(null);
  const [schemaReady, setSchemaReady] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!Number.isFinite(projectId)) {
        setError("잘못된 프로젝트 주소입니다.");
        setLoading(false);
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;
      if (!user) {
        setError("로그인이 필요합니다.");
        setLoading(false);
        return;
      }
      setUserId(user.id);
      const [projectRes, recordRes] = await Promise.all([
        supabase.from("projects").select("id, title, uploaded, status").eq("id", projectId).single(),
        supabase.from("story_publish_records").select("final_title, youtube_url, uploaded_at, memo").eq("project_id", projectId).maybeSingle(),
      ]);
      if (!active) return;
      if (projectRes.error || !projectRes.data) {
        setError("프로젝트를 불러오지 못했습니다.");
      } else {
        const loadedProject = projectRes.data as Project;
        const record = recordRes.data as PublishRecord | null;
        setProject(loadedProject);
        setFinalTitle(record?.final_title || loadedProject.title);
        setYoutubeUrl(record?.youtube_url || "");
        setUploadedAt(record?.uploaded_at || today());
        setMemo(record?.memo || "");
      }
      if (recordRes.error?.code === "42P01" || recordRes.error?.code === "PGRST205") {
        setSchemaReady(false);
      } else if (recordRes.error) {
        setError("업로드 기록을 불러오지 못했습니다.");
      }
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [projectId, supabase]);

  const saveRecord = async (mode: "draft" | "complete") => {
    setError(null);
    setNotice(null);
    if (!userId || !project) return;
    if (!finalTitle.trim()) return setError("최종 영상 제목을 입력해주세요.");
    if (youtubeUrl.trim() && !isYoutubeUrl(youtubeUrl)) return setError("올바른 YouTube 영상 또는 Shorts 링크를 입력해주세요.");
    if (mode === "complete" && !youtubeUrl.trim()) return setError("업로드 완료 처리에는 YouTube 링크가 필요합니다.");
    if (mode === "complete" && !uploadedAt) return setError("업로드 날짜를 선택해주세요.");
    if (mode === "complete" && !window.confirm("YouTube 업로드를 완료한 프로젝트로 처리할까요?")) return;

    setSaving(mode);
    const { error: recordError } = await supabase.from("story_publish_records").upsert({
      project_id: projectId,
      user_id: userId,
      final_title: finalTitle.trim(),
      youtube_url: youtubeUrl.trim(),
      uploaded_at: uploadedAt || null,
      memo: memo.trim(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "project_id" });

    if (recordError) {
      setError("업로드 기록 저장에 실패했습니다.");
      setSaving(null);
      return;
    }

    if (mode === "complete") {
      const { error: projectError } = await supabase.from("projects").update({
        uploaded: true,
        status: "업로드 완료",
        progress: 100,
      }).eq("id", projectId);
      if (projectError) {
        setError("기록은 저장했지만 프로젝트 완료 처리에 실패했습니다.");
        setSaving(null);
        return;
      }
      setProject((current) => current ? { ...current, uploaded: true, status: "업로드 완료" } : current);
      setNotice("업로드 완료로 처리했습니다. 이제 사연 스튜디오의 완료 목록에서 확인할 수 있습니다.");
      router.refresh();
    } else {
      setNotice("업로드 정보를 임시 저장했습니다.");
    }
    setSaving(null);
  };

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 size={30} className="animate-spin text-brand-olive" /></div>;

  if (!schemaReady) return (
    <div className="mx-auto max-w-xl rounded-2xl border border-amber-200 bg-white p-7 shadow-sm">
      <h1 className="text-lg font-bold">업로드 기록 테이블 설정이 필요합니다</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">Supabase SQL Editor에서 `20260718_story_publish.sql`을 실행한 뒤 새로고침해주세요.</p>
      <Link href={`/studio/shorts-story/projects/${projectId}`} className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-brand-olive"><ArrowLeft size={15} /> 워크벤치</Link>
    </div>
  );

  if (error && !project) return (
    <div className="mx-auto max-w-xl rounded-2xl border border-border bg-white p-8 text-center shadow-sm">
      <p className="font-bold">{error}</p>
      <Link href="/studio/shorts-story" className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-brand-olive"><ArrowLeft size={15} /> 사연 스튜디오</Link>
    </div>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <Link href={`/studio/shorts-story/projects/${projectId}`} className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-brand-olive"><ArrowLeft size={15} /> 워크벤치</Link>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><h1 className="text-2xl font-bold sm:text-3xl">검수 · 업로드 완료</h1><p className="mt-1 text-sm text-muted-foreground">{project?.title} · YouTube에는 직접 업로드하고 결과만 기록합니다.</p></div>
          {project?.uploaded && <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700"><CheckCircle2 size={14} /> 업로드 완료</span>}
        </div>
      </div>

      {(error || notice) && <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{error || notice}</div>}

      <section className="rounded-2xl border border-border bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-start gap-3 rounded-xl bg-brand-cream p-4"><Upload size={20} className="mt-0.5 shrink-0 text-brand-olive" /><div><p className="text-sm font-bold">수동 업로드 방식</p><p className="mt-1 text-xs leading-5 text-muted-foreground">완성된 영상을 평소처럼 YouTube Studio에서 업로드한 뒤, 공개된 영상 링크와 최종 정보를 아래에 남겨주세요.</p></div></div>

        <div className="mt-6 space-y-5">
          <label className="block"><span className="text-sm font-bold">최종 영상 제목</span><input value={finalTitle} onChange={(event) => setFinalTitle(event.target.value)} placeholder="YouTube에 사용한 최종 제목" className="mt-2 h-12 w-full rounded-xl border border-border px-4 text-sm outline-none focus:border-brand-olive" /></label>
          <label className="block"><span className="flex items-center gap-1.5 text-sm font-bold"><Link2 size={15} className="text-brand-olive" /> YouTube 링크</span><div className="mt-2 flex gap-2"><input value={youtubeUrl} onChange={(event) => setYoutubeUrl(event.target.value)} placeholder="https://youtube.com/shorts/..." inputMode="url" className="h-12 min-w-0 flex-1 rounded-xl border border-border px-4 text-sm outline-none focus:border-brand-olive" />{isYoutubeUrl(youtubeUrl) && <a href={youtubeUrl} target="_blank" rel="noreferrer" className="inline-flex h-12 items-center justify-center gap-1.5 rounded-xl border border-border px-4 text-sm font-bold hover:border-brand-olive"><ExternalLink size={15} /><span className="hidden sm:inline">열기</span></a>}</div></label>
          <label className="block"><span className="flex items-center gap-1.5 text-sm font-bold"><CalendarDays size={15} className="text-brand-olive" /> 업로드 날짜</span><input type="date" value={uploadedAt} onChange={(event) => setUploadedAt(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-border px-4 text-sm outline-none focus:border-brand-olive sm:w-64" /></label>
          <label className="block"><span className="text-sm font-bold">간단 메모</span><textarea value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="수정 사항, 업로드 설정, 다음 영상에서 참고할 내용 등" className="mt-2 min-h-28 w-full rounded-xl border border-border p-4 text-sm leading-6 outline-none focus:border-brand-olive" /></label>
        </div>

        <div className="mt-7 flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => saveRecord("draft")} disabled={Boolean(saving)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-white px-5 text-sm font-bold disabled:opacity-50">{saving === "draft" ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} 임시 저장</button>
          <button type="button" onClick={() => saveRecord("complete")} disabled={Boolean(saving)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-olive px-5 text-sm font-bold text-white hover:bg-brand-olive-dark disabled:opacity-50">{saving === "complete" ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={16} />} {project?.uploaded ? "업로드 정보 저장" : "업로드 완료 처리"}</button>
        </div>
      </section>

      {project?.uploaded && <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-sm font-semibold text-emerald-800">이 프로젝트는 완료 목록으로 이동했습니다.</p><Link href="/studio/shorts-story" className="text-sm font-bold text-emerald-800 underline underline-offset-4">사연 스튜디오에서 확인</Link></div>}
    </div>
  );
}
