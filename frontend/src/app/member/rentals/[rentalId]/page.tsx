"use client";
import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { MemberShell } from "@/components/MemberShell";
import { Loading } from "@/components/ui";
import { RentalList } from "@/features/rentals/rental-list";
import { useLanguage } from "@/lib/language";

function Content() {
  const { rentalId } = useParams<{ rentalId: string }>();
  const query = useSearchParams();
  const date = query.get("date");
  return (
    <RentalList
      rentalId={rentalId}
      initialDate={date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined}
    />
  );
}

export default function Page() {
  const { t } = useLanguage();
  return (
    <MemberShell title={t.operations.rentals}>
      <Suspense fallback={<Loading />}>
        <Content />
      </Suspense>
    </MemberShell>
  );
}
