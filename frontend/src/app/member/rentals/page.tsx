"use client";
import { Suspense } from "react";
import { MemberShell } from "@/components/MemberShell";
import { Loading } from "@/components/ui";
import { RentalList } from "@/features/rentals/rental-list";
import { useLanguage } from "@/lib/language";

export default function Page() {
  const { t } = useLanguage();
  return (
    <MemberShell title={t.operations.rentals}>
      <Suspense fallback={<Loading />}>
        <RentalList />
      </Suspense>
    </MemberShell>
  );
}
