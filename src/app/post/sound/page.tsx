"use client";

export default function SoundStudioPage() {
  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          🎵 사운드
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          오디오 에셋 관리 및 음성 생성
        </p>
      </div>

      {/* Placeholder */}
      <div className="flex flex-col items-center justify-center py-32 text-center rounded-xl border border-border bg-white shadow-sm mt-8">
        <div className="text-4xl mb-4">🚧</div>
        <h3 className="text-lg font-bold text-foreground mb-2">외부 도구 허브로 다시 만들 예정입니다</h3>
        <p className="text-sm text-muted-foreground">이곳에 다양한 사운드 생성 및 관리 도구 연동 기능을 준비 중입니다.</p>
      </div>
    </div>
  );
}
