"use client";

import { use } from "react";
import { MemberShell } from "@/components/MemberShell";
import { CoachProfile } from "@/features/training/coach-profile";
import { useLanguage } from "@/lib/language";

export default function Page({
  params,
}: {
  params: Promise<{ coachId: string }>;
}) {
  const { coachId } = use(params);
  const { language } = useLanguage();
  return (
    <MemberShell
      title={language === "vi" ? "Hồ sơ huấn luyện viên" : "Coach profile"}
    >
      <CoachProfile coachId={coachId} />
    </MemberShell>
  );
}
