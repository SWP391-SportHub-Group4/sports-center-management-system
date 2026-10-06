"use client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { OperationsPage } from "@/features/operations/ui";
import { DeliveryStatus } from "@/features/incidents/delivery-status";
import { useLanguage } from "@/lib/language";
import { validReceiptId } from "@/features/manager/receipt-lookup";
import { ApiGap } from "@/features/manager/api-gap";
export default function Page() {
  const { id } = useParams<{ id: string }>();
  const { t } = useLanguage();
  return (
    <OperationsPage title="incidents">
      <Link className="btn btn--ghost" href="/manager/incidents">
        {t.managerOperations.backToList}
      </Link>
      <p>
        {t.managerOperations.receiptId}: {id}
      </p>
      <ApiGap code="G06" message={t.managerOperations.incidentGap} />
      {validReceiptId(id) ? (
        <DeliveryStatus path={`/api/manager/incidents/${id}/notifications`} />
      ) : (
        <p role="alert">{t.managerOperations.invalidId}</p>
      )}
    </OperationsPage>
  );
}
