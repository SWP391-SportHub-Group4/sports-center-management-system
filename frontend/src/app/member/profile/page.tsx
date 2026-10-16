"use client";

import { MemberShell } from "@/components/MemberShell";
import { TrainingProfile } from "@/features/training/training-profile";
import { useLanguage } from "@/lib/language";

export default function Page() {
  const { t } = useLanguage();
  return (
    <MemberShell title={t.common.fitnessProfile}>
      <TrainingProfile />
    </MemberShell>
  );
}
