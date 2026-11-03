"use client";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { InvoiceList } from "@/features/payments";
export function ManagerFinance() {
  const params = useSearchParams();
  const router = useRouter();
  const oldRefundLink = params.get("tab") === "refunds";
  useEffect(() => {
    if (oldRefundLink) router.replace("/manager/requests?type=refunds");
  }, [oldRefundLink, router]);
  return oldRefundLink ? null : <InvoiceList staff />;
}
