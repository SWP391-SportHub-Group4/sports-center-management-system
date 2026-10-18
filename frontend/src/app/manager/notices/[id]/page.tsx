"use client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { OperationsPage } from "@/features/operations/ui";
import { NoticeDetailsView } from "@/features/incidents/notice-history";
import { useLanguage } from "@/lib/language";
import { validReceiptId } from "@/features/manager/receipt-lookup";
export default function Page() {
  const { id } = useParams<{ id: string }>();
  const { t } = useLanguage();
  return (
    <OperationsPage title="notices">
      <Link className="btn btn--ghost" href="/manager/notices?view=history">
        {t.managerOperations.backToList}
      </Link>
      {validReceiptId(id) ? (
        <NoticeDetailsView id={id} />
      ) : (
        <p role="alert">{t.managerOperations.invalidId}</p>
      )}
    </OperationsPage>
  );
}
