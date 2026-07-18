import Link from "next/link";
import { ArrowRight, Layers3, LockKeyhole } from "lucide-react";
import { studios } from "@/features/studios/config";

export default function StudioHubPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <section className="overflow-hidden rounded-3xl border border-border bg-white p-7 shadow-sm sm:p-10">
        <div className="max-w-2xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-brand-cream px-3 py-1.5 text-xs font-bold text-brand-olive-dark">
            <Layers3 size={14} /> 제작 스튜디오
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            제작 방식별로 작업 공간을 분리합니다
          </h1>
          <p className="mt-3 text-sm leading-7 text-muted-foreground sm:text-base">
            프로젝트와 자료가 서로 섞이지 않도록 각 콘텐츠 유형에 맞는 제작 흐름만 보여줍니다.
          </p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {studios.map((studio) => {
          const Icon = studio.icon;
          const content = (
            <div className="group flex h-full min-h-56 flex-col rounded-2xl border border-border bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex items-start justify-between">
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${studio.accent}`}>
                  <Icon size={23} />
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${studio.available ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                  {studio.available ? "사용 가능" : "준비 중"}
                </span>
              </div>
              <h2 className="mt-6 text-xl font-bold text-foreground">{studio.label}</h2>
              <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">{studio.description}</p>
              <div className="mt-5 flex items-center gap-1.5 text-sm font-bold text-brand-olive">
                {studio.available ? <><span>스튜디오 열기</span><ArrowRight size={15} className="transition group-hover:translate-x-1" /></> : <><LockKeyhole size={14} /><span>제작 방식 정의 후 오픈</span></>}
              </div>
            </div>
          );

          return studio.available ? (
            <Link key={studio.type} href={`/studio/${studio.slug}`}>{content}</Link>
          ) : (
            <div key={studio.type} aria-disabled="true" className="opacity-70">{content}</div>
          );
        })}
      </section>
    </div>
  );
}
