"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import ProjectDashboard, { type WorkshopProject, type ProjectCommand } from "./ProjectDashboard";
import { ExternalLink, RefreshCw } from "lucide-react";

const STUDIO = "http://127.0.0.1:8791";

const steps = [
  ["discover", "독백형 발굴"], ["source", "원본 선택"], ["script", "기획"],
  ["captions", "자막·효과음"], ["premiere", "영상 출력"],
] as const;

export default function ShortsWorkshopPage() {
  const pathname = usePathname();
  const router = useRouter();
  const home = pathname === "/studio/shorts-workshop";
  const [projects, setProjects] = useState<WorkshopProject[]>([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(new Map<string, {resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout>}>());
  const command = (value: ProjectCommand) => new Promise<void>((resolve, reject) => {
    const id = crypto.randomUUID();
    setSaving(true); setError("");
    const timer = setTimeout(() => { pending.current.delete(id); setSaving(false); setError("제작실 응답이 없습니다. 다시 연결한 뒤 확인해 주세요."); reject(new Error("timeout")); }, 15000);
    pending.current.set(id, {resolve, reject, timer});
    frame.current?.contentWindow?.postMessage({type: "shorts-studio:project", id, ...value}, STUDIO);
  });
  const stage = pathname.endsWith("/voice") ? "script" : pathname.endsWith("/outputs") ? "premiere" : steps.find(([key]) => pathname.endsWith(`/${key}`))?.[0] ?? "discover";
  const stageRef = useRef(stage);
  useEffect(() => { stageRef.current = stage; frame.current?.contentWindow?.postMessage({type: "shorts-studio:stage", stage}, STUDIO); }, [stage]);
  const frame = useRef<HTMLIFrameElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<"connecting" | "ready" | "offline">("connecting");

  useEffect(() => {
    let lastReady = 0;
    const started = Date.now();
    const receive = (event: MessageEvent) => {
      if (event.origin !== STUDIO || event.source !== frame.current?.contentWindow) return;
      // The hidden editor may change its selection while the dashboard is open.
      // Only explicit open/new command results may leave the project list.
      if (event.data?.type === "shorts-studio:navigate") {
        if (!home && steps.some(([key]) => key === event.data.stage)) router.push(`/studio/shorts-workshop/${event.data.stage}`);
        return;
      }
      if (event.data?.type === "shorts-studio:state") { setProjects(event.data.projects); setBusy(event.data.busy); return; }
      if (event.data?.type === "shorts-studio:result") {
        const request = pending.current.get(event.data.id);
        if (!request) return;
        clearTimeout(request.timer); pending.current.delete(event.data.id); setSaving(false);
        if (event.data.error) { setError(event.data.error); request.reject(new Error(event.data.error)); }
        else { request.resolve(); if (event.data.stage) router.push(`/studio/shorts-workshop/${event.data.stage}`); }
        return;
      }
      if (event.data?.type !== "shorts-studio:ready") return;
      lastReady = Date.now();
      setStatus("ready");
    };
    const ping = () => {
      frame.current?.contentWindow?.postMessage({ type: "shorts-studio:ping", stage: stageRef.current }, STUDIO);
      if (Date.now() - (lastReady || started) > 10000) setStatus("offline");
    };
    window.addEventListener("message", receive);
    const timer = window.setInterval(ping, 2000);
    ping();
    return () => {
      window.removeEventListener("message", receive);
      window.clearInterval(timer);
    };
  }, [attempt, router, home]);

  return (
    <div className="space-y-4">
      {home && <ProjectDashboard projects={projects} ready={status === "ready"} busy={busy} saving={saving} error={error} command={command} />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div hidden={home}>
          <h1 className="text-2xl font-bold text-brand-olive-dark">독백(가족)</h1>
          <p className="mt-1 text-sm text-muted-foreground">레퍼런스 발굴 → 원본 선택 → 기획·TTS → 자막·효과음 → 영상 출력</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span role="status" className={status === "ready" ? "text-emerald-700" : "text-muted-foreground"}>
            {status === "ready" ? "제작실 연결됨" : status === "offline" ? "제작실 연결 확인 필요" : "제작실 연결 중…"}
          </span>
          <button type="button" className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2" onClick={() => { setStatus("connecting"); setAttempt(value => value + 1); }}>
            <RefreshCw size={15} /> 다시 연결
          </button>
          <a href={STUDIO} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-olive">
            별도 창 <ExternalLink size={15} />
          </a>
        </div>
      </div>
      <nav hidden={home} aria-label="독백 가족 제작 단계" className={home ? "hidden" : "flex flex-wrap gap-2"}>
        <Link href="/studio/shorts-workshop" className="rounded-lg border border-border bg-white px-3 py-2 text-sm">프로젝트 목록</Link>
        {steps.map(([key, label], index) => <Link key={key} href={`/studio/shorts-workshop/${key}`} aria-current={stage === key ? "step" : undefined} className={`rounded-lg border px-3 py-2 text-sm ${stage === key ? "border-brand-olive bg-brand-olive text-white" : "border-border bg-white text-muted-foreground"}`}>{index + 1}. {label}</Link>)}
      </nav>
      {status === "offline" && (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm leading-7 text-amber-950">
          <p className="font-bold">이 컴퓨터의 쇼츠제작실을 먼저 실행해 주세요.</p>
          <p>Dropbox의 ‘03.해짜-자동생성’ 폴더에서 ‘쇼츠제작실_실행.cmd’를 두 번 클릭한 다음 ‘다시 연결’을 누르세요.</p>
          <p>브라우저에서 로컬 네트워크 접근을 물으면 허용해 주세요. 연결이 계속 막히면 ‘별도 창’으로 열 수 있어요.</p>
          <p>기존 프로젝트와 결과물은 제작 컴퓨터에 저장됩니다. 해당 제작실이 설치된 컴퓨터에서 이용해 주세요.</p>
        </div>
      )}
      <iframe hidden={home} key={attempt} ref={frame} src={`${STUDIO}/?embed=all-in-one&workflow=4`} title="독백 가족 편집 화면" allow="local-network-access" className="w-full rounded-2xl border border-border bg-[#f4f6f2]" style={{ height: "calc(100dvh - 200px)", minHeight: 650 }} />
    </div>
  );
}
