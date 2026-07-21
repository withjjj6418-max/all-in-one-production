"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Construction, Languages } from "lucide-react";
import { japanLongformWorkflow } from "@/features/studios/config";

export default function LongformJapanStagePlaceholderPage() {
  const params = useParams<{ id: string; stage: string }>();
  const stage = japanLongformWorkflow.find((item) => item.key === params.stage);

  return <div className="mx-auto max-w-3xl space-y-5">
    <Link href={`/studio/longform-japan/projects/${params.id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-sky-700"><ArrowLeft size={15} /> 워크벤치</Link>
    <section className="rounded-3xl border border-border bg-white p-8 text-center shadow-sm sm:p-12"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">{stage ? <Languages size={26} /> : <Construction size={26} />}</div><h1 className="mt-5 text-2xl font-bold">{stage?.label || "준비 중인 단계"}</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">일본 롱폼 전용 제작 화면을 순서대로 연결하고 있습니다.<br />현재는 프로젝트 기반과 단계별 데이터 저장 구조가 준비된 상태입니다.</p></section>
  </div>;
}
