"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/language";
import type { AuditLogDto } from "@/lib/types";
import styles from "./AuditTargetAccount.module.css";
import { auditDisplayText } from "./audit-display";

/** Use the audit response directly; no per-row detail requests or G10 workaround. */
export function AuditTargetAccount({
  row,
  linkToAccount = false,
}: {
  row: AuditLogDto;
  linkToAccount?: boolean;
}) {
  const { t } = useLanguage();
  const l = t.adminWork;
  const name = row.targetFullName?.trim()
    ? auditDisplayText(row.targetFullName.trim())
    : undefined;
  const email = row.targetEmail?.trim()
    ? auditDisplayText(row.targetEmail.trim())
    : undefined;
  if (row.targetAccountExists === false || (!name && !email)) {
    return (
      <div className={styles.root}>
        <span>
          {row.targetAccountExists === false
            ? l.targetAccountDeleted
            : l.targetAccountUnavailable}
        </span>
      </div>
    );
  }
  return (
    <div className={styles.root}>
      <strong>
        {linkToAccount ? (
          <Link href={`/admin/users/${row.targetId}`}>{name || email}</Link>
        ) : (
          name || email
        )}
      </strong>
      {name && email && <span className="small muted">{email}</span>}
    </div>
  );
}
