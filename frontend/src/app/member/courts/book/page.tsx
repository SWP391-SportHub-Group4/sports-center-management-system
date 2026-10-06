"use client";
import { Suspense } from "react";
import { MemberShell } from "@/components/MemberShell";
import { Loading } from "@/components/ui";
import { AvailabilityPicker } from "@/features/rentals/availability-picker";
import { useLanguage } from "@/lib/language";

export default function Page() {
  const { t } = useLanguage();
  return (
    <MemberShell title={t.operations.book}>
      <Suspense fallback={<Loading />}>
        <AvailabilityPicker />
      </Suspense>
    </MemberShell>
  );
}
