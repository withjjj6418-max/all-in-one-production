import type { ReactNode } from "react";
import { StudioProjectSwitcher } from "@/components/studio/StudioProjectSwitcher";

export default function JapanLongformProjectLayout({ children }: { children: ReactNode }) {
  return <>
    <StudioProjectSwitcher productionType="longform_japan" studioLabel="롱폼(일본) 프로젝트" />
    {children}
  </>;
}
