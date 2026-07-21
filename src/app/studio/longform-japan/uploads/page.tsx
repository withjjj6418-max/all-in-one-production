import Link from "next/link";
import { ArrowLeft, Upload } from "lucide-react";

export default function LongformJapanUploadsPage() {
  return <div className="mx-auto max-w-5xl space-y-5"><Link href="/studio/longform-japan" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-sky-700"><ArrowLeft size={15} /> 일본 롱폼 스튜디오</Link><section className="rounded-3xl border border-border bg-white p-10 text-center shadow-sm"><Upload className="mx-auto text-sky-700" size={32} /><h1 className="mt-4 text-2xl font-bold">일본 롱폼 업로드 목록</h1><p className="mt-2 text-sm text-muted-foreground">업로드 결과 기능 단계에서 YouTube 링크와 최종 제목을 모아 보여줄 예정입니다.</p></section></div>;
}
