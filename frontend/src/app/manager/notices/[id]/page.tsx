"use client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { OperationsPage } from "@/features/operations/ui";
import { DeliveryStatus } from "@/features/incidents/delivery-status";
import { useLanguage } from "@/lib/language";
import { validReceiptId } from "@/features/manager/receipt-lookup";
export default function Page() {
  const { id } = useParams<{ id: string }>();
  const { t } = useLanguage();
  return (
    <OperationsPage title="notices">
      <Link className="btn btn--ghost" href="/manager/notices">
        {t.managerOperations.backToList}
      </Link>
      <p>
        {t.managerOperations.receiptId}: {id}
      </p>
      {validReceiptId(id) ? (
        <DeliveryStatus path={`/api/manager/notices/${id}`} receipt />
      ) : (
        <p role="alert">{t.managerOperations.invalidId}</p>
      )}
    </OperationsPage>
  );
}
