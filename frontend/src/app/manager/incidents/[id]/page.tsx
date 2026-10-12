"use client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { OperationsPage } from "@/features/operations/ui";
import { IncidentDetailsView } from "@/features/incidents/incident-details";
import { useLanguage } from "@/lib/language";
import { validReceiptId } from "@/features/manager/receipt-lookup";
export default function Page() {
  const { id } = useParams<{ id: string }>();
  const { t } = useLanguage();
  return (
    <OperationsPage title="incidents">
      <Link className="btn btn--ghost" href="/manager/incidents">
        {t.managerOperations.backToList}
      </Link>
      {validReceiptId(id) ? (
        <IncidentDetailsView id={id} />
      ) : (
        <p role="alert">{t.managerOperations.invalidId}</p>
      )}
    </OperationsPage>
  );
}
