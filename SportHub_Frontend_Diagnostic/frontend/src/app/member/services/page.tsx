"use client";
import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { MemberServiceHub } from "@/features/member/service-hub";

/** Keep the hub's URL store in sync with same-page Next links and notification navigation. */
function ServicesQuerySync() {
  const search = useSearchParams().toString();
  useEffect(() => {
    window.dispatchEvent(new Event("sporthub:query-change"));
  }, [search]);
  return null;
}

export default function Page() {
  return (
    <>
      <Suspense fallback={null}>
        <ServicesQuerySync />
      </Suspense>
      <MemberServiceHub />
    </>
  );
}
