import {
  BookOpenText,
  Clapperboard,
  Film,
  Languages,
  type LucideIcon,
} from "lucide-react";

export const productionTypes = [
  "shorts_story",
  "shorts_haejja",
  "longform_japan",
  "longform_movie",
] as const;

export type ProductionType = (typeof productionTypes)[number];

export type StudioConfig = {
  type: ProductionType;
  slug: string;
  label: string;
  description: string;
  icon: LucideIcon;
  available: boolean;
  accent: string;
};

export const studios: StudioConfig[] = [
  {
    type: "shorts_story",
    slug: "shorts-story",
    label: "숏폼(사연)",
    description: "사연 수집부터 각색, TTS, 캐릭터 제작까지 한 흐름으로 관리합니다.",
    icon: BookOpenText,
    available: true,
    accent: "bg-rose-100 text-rose-600",
  },
  {
    type: "shorts_haejja",
    slug: "shorts-haejja",
    label: "숏폼(해짜)",
    description: "해짜 콘텐츠에 맞는 전용 제작 방식을 구성할 예정입니다.",
    icon: Clapperboard,
    available: false,
    accent: "bg-amber-100 text-amber-700",
  },
  {
    type: "longform_japan",
    slug: "longform-japan",
    label: "롱폼(일본)",
    description: "일본 롱폼 리서치와 번역, 내레이션 흐름을 구성할 예정입니다.",
    icon: Languages,
    available: true,
    accent: "bg-sky-100 text-sky-700",
  },
  {
    type: "longform_movie",
    slug: "longform-movie",
    label: "롱폼(영화)",
    description: "영화 소재 분석과 장문 대본 제작 흐름을 구성할 예정입니다.",
    icon: Film,
    available: false,
    accent: "bg-violet-100 text-violet-700",
  },
];

export const storyWorkflow = [
  { key: "source", step: 1, label: "원문 수집", shortLabel: "수집" },
  { key: "adapt", step: 2, label: "AI 각색", shortLabel: "각색" },
  { key: "script", step: 3, label: "대본 수정", shortLabel: "대본" },
  { key: "voice", step: 4, label: "TTS · 자막", shortLabel: "음성" },
  { key: "character", step: 5, label: "캐릭터", shortLabel: "이미지" },
  { key: "premiere", step: 6, label: "Premiere", shortLabel: "편집" },
  { key: "upload", step: 7, label: "업로드", shortLabel: "완료" },
] as const;

export type StoryWorkflowKey = (typeof storyWorkflow)[number]["key"];

export const japanLongformWorkflow = [
  { key: "source", step: 1, label: "원문 수집", shortLabel: "원문" },
  { key: "adapt", step: 2, label: "한국어 각색", shortLabel: "각색" },
  { key: "script", step: 3, label: "한국어 대본", shortLabel: "대본" },
  { key: "translate", step: 4, label: "일본어 번역", shortLabel: "번역" },
  { key: "voice", step: 5, label: "TTS · SRT", shortLabel: "음성" },
  { key: "image", step: 6, label: "썸네일 · 배경", shortLabel: "이미지" },
  { key: "scenes", step: 7, label: "장면 일러스트", shortLabel: "장면" },
  { key: "motion", step: 8, label: "루프 영상", shortLabel: "영상" },
  { key: "premiere", step: 9, label: "Premiere", shortLabel: "편집" },
  { key: "upload", step: 10, label: "업로드", shortLabel: "완료" },
] as const;

export type JapanLongformWorkflowKey = (typeof japanLongformWorkflow)[number]["key"];

export function getStudioBySlug(slug: string) {
  return studios.find((studio) => studio.slug === slug);
}
