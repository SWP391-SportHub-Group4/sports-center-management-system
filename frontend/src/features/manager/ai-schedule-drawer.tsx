"use client";
import { Drawer } from "@/components/primitives";
import { useLanguage } from "@/lib/language";
import { ApiGap } from "./api-gap";
export function AiScheduleDrawer({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage();
  const l = t.managerOperations;
  return (
    <Drawer title={l.aiTitle} description={l.aiWorkflow} onClose={onClose}>
      <ApiGap code="G03" message={l.aiGap} />
      <p>{l.draftHint}</p>
    </Drawer>
  );
}
