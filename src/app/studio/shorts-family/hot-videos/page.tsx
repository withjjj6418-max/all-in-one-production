"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowDownUp, ExternalLink, Flame, Loader2, RefreshCw, RotateCcw, Search, Sparkles, Trash2, TrendingUp } from "lucide-react";

type HotVideo = {
  id: string; video_id: string; url: string; title: string; channel_name: string; country: string; category: string; thumbnail_url: string;
  published_at: string; currentViews: number; viewDelta: number; speed: number; acceleration: number | null; speedEstimated: boolean;
  ageHours: number; ageDays: number; status: "tracking" | "detecting" | "verified"; badge: string; dismissed_at: string | null; saved_at: string | null;
};
type DashboardPayload = { success: boolean; error?: string; lastUpdatedAt: string | null; counts: { active: number; dismissed: number; detecting: number; verified: number }; videos: HotVideo[] };

const number = new Intl.NumberFormat("ko-KR", { notation: "compact", maximumFractionDigits: 1 });

function elapsed(value: string) {
  const hours = Math.max(0, (Date.now() - new Date(value).getTime()) / 3600000);
  return hours < 24 ? `${Math.max(1, Math.round(hours))}시간 전` : `${(hours / 24).toFixed(1)}일 전`;
}

export default function FamilyHotVideosPage() {
  const [videos, setVideos] = useState<HotVideo[]>([]);
  const [counts, setCounts] = useState({ active: 0, dismissed: 0, detecting: 0, verified: 0 });
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState<"load" | "discover" | "refresh" | string | null>("load");
  const [message, setMessage] = useState("");
  const [hours, setHours] = useState(3);
  const [country, setCountry] = useState("ALL");
  const [category, setCategory] = useState("전체");
  const [state, setState] = useState("tracking");
  const [sort, setSort] = useState("rising");
  const [query, setQuery] = useState("");
  const initialized = useRef(false);

  const load = useCallback(async () => {
    setBusy((current) => current || "load");
    const params = new URLSearchParams({ hours: String(hours), country, category, state, sort, q: query });
    try {
      const response = await fetch(`/api/shorts-family/hot-videos?${params}`, { cache: "no-store" });
      const payload = await response.json() as DashboardPayload;
      if (!response.ok || !payload.success) throw new Error(payload.error || "데이터를 불러오지 못했습니다.");
      setVideos(payload.videos || []); setCounts(payload.counts); setLastUpdatedAt(payload.lastUpdatedAt); setMessage("");
      return payload;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "데이터를 불러오지 못했습니다.");
      return null;
    } finally { setBusy((current) => current === "load" ? null : current); }
  }, [hours, country, category, state, sort, query]);

  const collect = useCallback(async (action: "discover" | "refresh", quiet = false) => {
    setBusy(action);
    if (!quiet) setMessage(action === "discover" ? "최근 7일의 한·일·미 가족 쇼츠를 새로 발굴하고 있습니다." : "추적 영상의 현재 조회수를 저장하고 있습니다.");
    try {
      const response = await fetch("/api/shorts-family/hot-videos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "수집에 실패했습니다.");
      await load();
      setMessage(action === "discover" ? `신규 검색 완료 · ${payload.discovered || 0}개를 추적 목록에 반영했습니다.` : `통계 갱신 완료 · ${payload.tracked || 0}개 영상의 스냅샷을 저장했습니다.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "수집에 실패했습니다."); }
    finally { setBusy(null); }
  }, [load]);

  useEffect(() => {
    const timer = window.setTimeout(() => { load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (initialized.current || busy === "load") return;
    initialized.current = true;
    const timer = window.setTimeout(() => {
      if (counts.active === 0) collect("discover", true);
      else if (!lastUpdatedAt || Date.now() - new Date(lastUpdatedAt).getTime() > 55 * 60000) collect("refresh", true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [busy, collect, counts.active, lastUpdatedAt]);

  useEffect(() => {
    const timer = window.setInterval(() => { collect("refresh", true); }, 60 * 60000);
    const poll = window.setInterval(() => { load(); }, 60 * 1000);
    return () => { window.clearInterval(timer); window.clearInterval(poll); };
  }, [collect, load]);

  async function changeState(videoId: string, action: "dismiss" | "restore" | "save") {
    setBusy(`${action}-${videoId}`);
    try {
      const response = await fetch("/api/shorts-family/hot-videos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, videoId }) });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "상태 변경에 실패했습니다.");
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "상태 변경에 실패했습니다."); }
    finally { setBusy(null); }
  }

  const currentLabel = useMemo(() => state === "verified" ? "300만 검증 완료" : state === "dismissed" ? "영구 제외" : state === "tracking" ? "전체 추적" : "급상승 감지", [state]);

  return <div className="mx-auto max-w-7xl space-y-5">
    <section className="overflow-hidden rounded-3xl border border-rose-200 bg-gradient-to-br from-rose-50 via-white to-amber-50 p-6 shadow-sm sm:p-8"><div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><div className="inline-flex items-center gap-2 rounded-full bg-rose-100 px-3 py-1.5 text-xs font-black text-rose-700"><Activity size={15} /> 나만 보는 실시간 급상승</div><h1 className="mt-4 text-3xl font-black tracking-tight">가족 쇼츠 레이더</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">최근 7일의 아기·어린이·가족 쇼츠를 추적합니다. 조회수 100만 이상은 속도와 관계없이 표시하고, 300만을 넘으면 검증 완료로 올립니다.</p></div><div className="flex flex-wrap gap-2"><button onClick={() => collect("refresh")} disabled={Boolean(busy)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 text-sm font-black text-rose-700 disabled:opacity-40">{busy === "refresh" ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} 조회수 갱신</button><button onClick={() => collect("discover")} disabled={Boolean(busy)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-black text-white disabled:opacity-40">{busy === "discover" ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} 신규 영상 발굴</button></div></div><div className="mt-5 flex flex-wrap items-center gap-2 text-xs"><span className="rounded-full bg-white px-3 py-1.5 font-bold text-emerald-700">● 1시간 자동 추적</span><span className="rounded-full bg-white px-3 py-1.5 font-bold text-muted-foreground">기준 {lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleString("ko-KR") : "첫 수집 전"}</span><span className="rounded-full bg-white px-3 py-1.5 font-bold text-muted-foreground">속도는 정렬·배지에만 반영</span></div></section>

    {message && <section className={`rounded-xl border px-4 py-3 text-sm font-semibold ${/relation|schema|table|column/i.test(message) ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>{message}{/relation|schema|table/i.test(message) && <p className="mt-1 text-xs">Supabase에 `20260815_shorts_family_hot_videos.sql` 마이그레이션을 적용해주세요.</p>}</section>}

    <section className="grid grid-cols-2 gap-3 md:grid-cols-4"><Stat label="추적 중" value={counts.active} color="zinc" /><Stat label="급상승 감지" value={counts.detecting} color="amber" /><Stat label="300만 검증" value={counts.verified} color="rose" /><Stat label="영구 제외" value={counts.dismissed} color="slate" /></section>

    <section className="rounded-2xl border border-border bg-white p-4 shadow-sm"><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6"><select value={country} onChange={(event) => setCountry(event.target.value)} className="h-10 rounded-lg border border-border bg-white px-3 text-xs font-bold"><option value="ALL">전체 국가</option><option value="KR">한국</option><option value="JP">일본</option><option value="US">미국</option></select><select value={category} onChange={(event) => setCategory(event.target.value)} className="h-10 rounded-lg border border-border bg-white px-3 text-xs font-bold"><option>전체</option><option>아기</option><option>어린이</option><option>가족</option><option>랭킹형</option></select><select value={hours} onChange={(event) => setHours(Number(event.target.value))} className="h-10 rounded-lg border border-border bg-white px-3 text-xs font-bold">{[1, 3, 6, 12, 24].map((value) => <option key={value} value={value}>{value}시간 속도</option>)}</select><select value={state} onChange={(event) => setState(event.target.value)} className="h-10 rounded-lg border border-border bg-white px-3 text-xs font-bold"><option value="active">급상승 감지</option><option value="verified">300만 검증 완료</option><option value="tracking">전체 추적</option><option value="dismissed">영구 제외</option></select><select value={sort} onChange={(event) => setSort(event.target.value)} className="h-10 rounded-lg border border-border bg-white px-3 text-xs font-bold"><option value="rising">급상승순</option><option value="views">조회수순</option><option value="latest">최신순</option></select><label className="relative"><Search size={14} className="absolute left-3 top-3 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="제목·채널 검색" className="h-10 w-full rounded-lg border border-border pl-9 pr-3 text-xs" /></label></div></section>

    <section className="rounded-2xl border border-border bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="font-black">{currentLabel}</h2><p className="mt-1 text-xs text-muted-foreground">속도는 실제 스냅샷 차이로 계산하며, 첫 수집 직후만 업로드 이후 평균 속도를 사용합니다. 이미 랭킹형 레퍼런스로 가져온 영상은 자동 제외됩니다.</p></div><span className="rounded-full bg-muted px-3 py-1 text-xs font-black">{videos.length}개</span></div>{busy === "load" ? <div className="flex min-h-64 items-center justify-center"><Loader2 className="animate-spin text-rose-600" /></div> : videos.length ? <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{videos.map((video, index) => <HotVideoCard key={video.id} video={video} rank={index + 1} busy={busy} dismiss={() => changeState(video.video_id, "dismiss")} restore={() => changeState(video.video_id, "restore")} />)}</div> : <div className="mt-4 rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">조건을 만족하는 영상이 없습니다. 첫 사용이라면 ‘신규 영상 발굴’을 눌러주세요.</div>}</section>
  </div>;
}

function Stat({ label, value, color }: { label: string; value: number; color: "zinc" | "amber" | "rose" | "slate" }) {
  const colors = { zinc: "border-zinc-200 bg-zinc-50 text-zinc-800", amber: "border-amber-200 bg-amber-50 text-amber-800", rose: "border-rose-200 bg-rose-50 text-rose-800", slate: "border-slate-200 bg-slate-50 text-slate-700" };
  return <div className={`rounded-2xl border p-4 ${colors[color]}`}><p className="text-xs font-bold opacity-70">{label}</p><p className="mt-1 text-2xl font-black">{value}</p></div>;
}

function HotVideoCard({ video, rank, busy, dismiss, restore }: { video: HotVideo; rank: number; busy: string | null; dismiss: () => void; restore: () => void }) {
  const transferHref = `/studio/shorts-family?stage=discover&reference_url=${encodeURIComponent(video.url)}&reference_title=${encodeURIComponent(video.title)}`;
  const statusStyle = video.status === "verified" ? "bg-rose-600 text-white" : video.status === "detecting" ? "bg-amber-500 text-white" : "bg-zinc-200 text-zinc-700";
  return <article className="overflow-hidden rounded-xl border border-border bg-white"><div className="relative aspect-video bg-zinc-100">{video.thumbnail_url && <Image unoptimized src={video.thumbnail_url} alt="" fill className="object-cover" />}<span className="absolute left-2 top-2 rounded-full bg-black/80 px-2 py-1 text-[10px] font-black text-white">#{rank}</span><span className={`absolute right-2 top-2 rounded-full px-2 py-1 text-[10px] font-black ${statusStyle}`}>{video.status === "verified" ? "300만 검증" : video.badge}</span></div><div className="p-3"><a href={video.url} target="_blank" rel="noreferrer" className="line-clamp-2 text-sm font-black hover:text-rose-700">{video.title}</a><p className="mt-1 text-[11px] text-muted-foreground">{video.channel_name} · {video.country} · {video.category} · {elapsed(video.published_at)}</p><div className="mt-3 grid grid-cols-3 gap-1.5"><Metric icon={<Flame size={12} />} label="조회" value={number.format(video.currentViews)} /><Metric icon={<TrendingUp size={12} />} label={`${video.speedEstimated ? "추정 " : ""}속도`} value={`+${number.format(video.speed)}/h`} /><Metric icon={<ArrowDownUp size={12} />} label={`${video.viewDelta ? `${number.format(video.viewDelta)} 증가` : "가속"}`} value={video.acceleration ? `${video.acceleration}x` : "측정 중"} /></div><div className="mt-3 flex flex-wrap gap-1.5">{video.dismissed_at ? <button onClick={restore} disabled={Boolean(busy)} className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 px-3 text-[10px] font-black text-slate-700 disabled:opacity-40"><RotateCcw size={11} /> 복구</button> : <><Link href={transferHref} className="inline-flex h-8 items-center gap-1 rounded-md bg-rose-600 px-3 text-[10px] font-black text-white"><Sparkles size={11} /> 랭킹형으로 가져오기</Link><button onClick={dismiss} disabled={Boolean(busy)} className="inline-flex h-8 items-center gap-1 rounded-md border border-red-300 px-3 text-[10px] font-black text-red-600 disabled:opacity-40"><Trash2 size={11} /> 영구 제외</button></>}<a href={video.url} target="_blank" rel="noreferrer" className="ml-auto inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-[10px] font-black text-muted-foreground"><ExternalLink size={11} /> 열기</a></div></div></article>;
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="rounded-lg bg-zinc-50 p-2"><p className="flex items-center gap-1 text-[9px] font-bold text-muted-foreground">{icon}{label}</p><p className="mt-1 truncate text-[11px] font-black text-zinc-900">{value}</p></div>;
}
