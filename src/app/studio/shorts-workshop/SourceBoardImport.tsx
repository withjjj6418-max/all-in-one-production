"use client";

import { useEffect, useState, type RefObject } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { sourceBoardImportKey, type SourceBoardTransfer } from "@/lib/source-board-import";

export default function SourceBoardImport({ studio, frame, ready, connectionAttempt }: {
  studio: string; frame: RefObject<HTMLIFrameElement | null>; ready: boolean; connectionAttempt: number;
}) {
  const token = useSearchParams().get("sourceImport");
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<{ phase: "waiting" | "sending" | "complete" | "error"; title: string; message: string }>({ phase: "waiting", title: "", message: "제작실에 연결되면 소스를 가져옵니다." });

  useEffect(() => {
    if (!token || !/^[a-f0-9-]{36}$/.test(token)) return;
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    let receive: ((event: MessageEvent) => void) | undefined;
    // Read the browser-only transfer after mounting; keep it until acknowledged.
    const start = window.setTimeout(() => {
      let data: SourceBoardTransfer;
      try {
        const raw = sessionStorage.getItem(sourceBoardImportKey(token));
        if (!raw) throw new Error("전달할 소스가 없습니다. 소스 게시판에서 다시 연결해 주세요.");
        data = JSON.parse(raw);
        if (typeof data.url !== "string" || !data.source_board || typeof data.source_board.title !== "string") throw new Error("소스 정보를 읽지 못했습니다. 게시판에서 다시 연결해 주세요.");
      } catch (error) {
        setState({ phase: "error", title: "", message: error instanceof Error ? error.message : "소스 정보를 읽지 못했습니다." });
        return;
      }
      const title = data.source_board.title || "선택한 영상";
      if (data.complete) { setState({ phase: "complete", title, message: "원본으로 연결됐습니다. 원본찾기 없이 원본으로 시작을 누르세요." }); return; }
      if (!ready || !frame.current?.contentWindow) { setState({ phase: "waiting", title, message: "제작실에 연결되면 소스를 가져옵니다." }); return; }
      setState({ phase: "sending", title, message: "선택한 원본을 제작실에 연결하는 중…" });
      receive = (event: MessageEvent) => {
        if (cancelled || event.origin !== studio || event.source !== frame.current?.contentWindow || event.data?.type !== "shorts-studio:reference-result" || event.data.id !== token) return;
        clearTimeout(timer);
        if (event.data.error) { setState({ phase: "error", title, message: event.data.error }); return; }
        try { sessionStorage.setItem(sourceBoardImportKey(token), JSON.stringify({ ...data, complete: true })); } catch { /* The local studio already saved the video; URL deduplication makes retries safe. */ }
        setState({ phase: "complete", title, message: "원본으로 연결됐습니다. 원본으로 시작 → 영상 저장·댓글 수집 → 기획하기 순서로 진행하세요." });
      };
      window.addEventListener("message", receive);
      timer = setTimeout(() => {
        if (!cancelled) setState({ phase: "error", title, message: "연결 결과를 아직 받지 못했습니다. 다시 시도해도 영상은 중복으로 추가되지 않습니다." });
      }, 60000);
      frame.current.contentWindow.postMessage({ type: "shorts-studio:reference", id: token, url: data.url, source_board: data.source_board }, studio);
    }, 0);
    return () => { cancelled = true; clearTimeout(start); clearTimeout(timer); if (receive) window.removeEventListener("message", receive); };
  }, [token, ready, connectionAttempt, retry, frame, studio]);

  if (!token) return null;
  return (
    <div role={state.phase === "error" ? "alert" : "status"} className="rounded-xl border border-brand-olive/20 bg-white px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-brand-olive-dark">소스 게시판{state.title ? ` · ${state.title}` : ""}</p>
        <Link href="/research" className="text-xs text-brand-olive underline">소스 게시판으로</Link>
      </div>
      <p className="mt-1 text-muted-foreground">{state.message}</p>
      {state.phase === "error" && <button type="button" disabled={!ready} onClick={() => setRetry(value => value + 1)} className="mt-2 rounded-lg bg-brand-olive px-3 py-2 text-white disabled:opacity-50">다시 연결하기</button>}
    </div>
  );
}
