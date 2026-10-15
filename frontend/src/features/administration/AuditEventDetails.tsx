"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Dialog } from "@/components/ui";
import { useLanguage } from "@/lib/language";
import { formatDateTime } from "@/lib/format";
import type { AuditLogDto, RoomTypeDto } from "@/lib/types";
import { auditEventModel } from "./audit-event-model";
import { auditDisplayText } from "./audit-display";
import styles from "./AuditEventDetails.module.css";

export function AuditEventDetails({
  row,
  roomTypes = [],
}: {
  row: AuditLogDto;
  roomTypes?: RoomTypeDto[];
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const model = auditEventModel(row, t, roomTypes);
  return (
    <div className={styles.root}>
      <button
        type="button"
        className={`btn btn--ghost ${styles.viewButton}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`View details: ${model.type} · ${model.subject}`}
        onClick={() => setOpen(true)}
      >
        View details
      </button>
      {open &&
        createPortal(
          <Dialog
            title="Audit event details"
            description={`${model.action} · ${formatDateTime(row.timestamp)}`}
            size="lg"
            onClose={() => setOpen(false)}
          >
            <div className={styles.content}>
              <div className={styles.identity}>
                <span className="small muted">{model.type}</span>
                <strong>{model.subject}</strong>
                {row.targetEntity === "UserAccount" &&
                  row.targetFullName &&
                  row.targetEmail && (
                    <span className="small muted">
                      {auditDisplayText(row.targetEmail)}
                    </span>
                  )}
              </div>
              <dl className={styles.context}>
                <div>
                  <dt>Actor</dt>
                  <dd>
                    {row.actorRole === "SYSTEM"
                      ? "System"
                      : auditDisplayText(
                          row.actorFullName || row.actorEmail || "Unavailable",
                        )}
                    {row.actorEmail && (
                      <span className="small muted">
                        {auditDisplayText(row.actorEmail)}
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Action</dt>
                  <dd>{model.action}</dd>
                </div>
              </dl>
              {model.deletion && (
                <p className={styles.notice}>
                  Record deleted. Values below were recorded before deletion.
                </p>
              )}
              {model.reason && (
                <div className={styles.reason}>
                  <strong>Reason</strong>
                  <p>{model.reason}</p>
                </div>
              )}
              {model.fields.length ? (
                <div className={styles.tableWrap}>
                  <table
                    className={styles.table}
                    aria-label="Recorded event values"
                  >
                    <thead>
                      <tr>
                        <th scope="col">Field</th>
                        {model.comparison ? (
                          <>
                            <th scope="col">Before</th>
                            <th scope="col">After</th>
                          </>
                        ) : (
                          <th scope="col">Value</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {model.fields.map((field) => (
                        <tr key={field.key}>
                          <th scope="row">{field.label}</th>
                          {model.comparison ? (
                            <>
                              <td>{field.before}</td>
                              <td className={styles.after}>{field.after}</td>
                            </>
                          ) : (
                            <td>{field.value}</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="small muted">
                  {row.oldValue || row.newValue
                    ? "No displayable field changes recorded."
                    : "No additional details recorded."}
                </p>
              )}
            </div>
          </Dialog>,
          document.body,
        )}
    </div>
  );
}
