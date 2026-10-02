"use client";
import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { OperationsPage } from "@/features/operations/ui";
import { RentalList } from "@/features/rentals/rental-list";
import { Loading } from "@/components/ui";
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
  return (
    <OperationsPage title="rentals" roles={["ExternalCoach"]}>
      <Suspense fallback={<Loading />}>
        <Content />
      </Suspense>
    </OperationsPage>
  );
}
