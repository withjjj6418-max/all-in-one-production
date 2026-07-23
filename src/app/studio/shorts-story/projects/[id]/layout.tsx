import type { ReactNode } from "react";
import { StudioProjectSwitcher } from "@/components/studio/StudioProjectSwitcher";

export default function StoryProjectLayout({ children }: { children: ReactNode }) {
  return <>
    <StudioProjectSwitcher productionType="shorts_story" studioLabel="숏폼(사연) 프로젝트" />
    {children}
  </>;
}
