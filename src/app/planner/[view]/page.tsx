import { notFound } from 'next/navigation';

const views = { board: '작업 보드', routines: '루틴 보드', gantt: '간트차트' };

export function generateStaticParams() {
  return Object.keys(views).map(view => ({ view }));
}

export default async function PlannerPage({ params }: { params: Promise<{ view: string }> }) {
  const { view } = await params;
  if (!Object.hasOwn(views, view)) notFound();
  return <iframe
    key={view}
    src={`/personal-planner/index.html?embed=1&view=${encodeURIComponent(view)}`}
    title={`개인 일정 · ${views[view as keyof typeof views]}`}
    className="block w-full rounded-xl border-0 bg-[#11141e]"
    style={{ height: 'calc(100dvh - 130px)', minHeight: 600 }}
  />;
}
