"use client";
import { MemberShell } from "@/components/MemberShell";
import { PtBooking } from "@/features/training/pt-booking";
import { useLanguage } from "@/lib/language";

export default function Page() {
  const { t } = useLanguage();
  return (
    <MemberShell title={t.ptBook.title}>
      <PtBooking />
    </MemberShell>
  );
}
