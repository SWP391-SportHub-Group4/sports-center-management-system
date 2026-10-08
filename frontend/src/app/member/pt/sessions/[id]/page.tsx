"use client";
import { useParams } from "next/navigation";
import { MemberShell } from "@/components/MemberShell";
import { PtSessionDetail } from "@/features/training/pt-session-detail";
import { useLanguage } from "@/lib/language";

export default function Page() {
  const { t } = useLanguage();
  const { id } = useParams<{ id: string }>();
  return (
    <MemberShell title={t.ptOps.sessionTitle}>
      <PtSessionDetail sessionId={id} />
    </MemberShell>
  );
}
