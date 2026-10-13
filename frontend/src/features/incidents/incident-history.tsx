"use client";
import Link from "next/link";
import { useState } from "react";
import { Card } from "@/components/ui";
import { ApiTable } from "@/components/data";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime } from "@/lib/format";
import { incidentApi } from "./incident-api";
import styles from "./incident-history.module.css";

export function IncidentHistory({ refreshKey }: { refreshKey: string }) {
  const { t } = useLanguage();
  const l = t.managerOperations;
  const [page, setPage] = useState(1);
  const state = useApi(
    (signal) => incidentApi.list(page, signal),
    [page, refreshKey],
  );
  return (
    <Card
      title={l.incidentHistory}
      actions={
        <button
          type="button"
          className="btn btn--secondary"
          disabled={state.loading}
          onClick={state.reload}
        >
          {t.operations.refresh}
        </button>
      }
    >
      <div className={styles.history}>
        <ApiTable
          caption={l.incidentHistory}
          state={state}
          page={page}
          pageSize={20}
          onPageChange={setPage}
          getRowId={(incident) => incident.incidentId}
          mobile="scroll"
          columns={[
            {
              id: "reason",
              header: t.operations.reason,
              rowHeader: true,
              cell: (incident) => (
                <span className={styles.reason}>{incident.reason}</span>
              ),
            },
            {
              id: "scope",
              header: l.incidentScope,
              cell: (incident) =>
                incident.scope === "CENTER"
                  ? t.operations.center
                  : (incident.roomName ?? t.operations.room),
            },
            {
              id: "startAtUtc",
              header: t.operations.start,
              cell: (incident) => formatDateTime(incident.startAtUtc),
            },
            {
              id: "endAtUtc",
              header: t.operations.end,
              cell: (incident) => formatDateTime(incident.endAtUtc),
            },
            {
              id: "createdAtUtc",
              header: l.incidentRecordedAt,
              cell: (incident) => formatDateTime(incident.createdAtUtc),
            },
          ]}
          rowActions={(incident) => (
            <Link
              className="btn btn--secondary btn--sm"
              href={`/manager/incidents/${incident.incidentId}`}
            >
              {t.operations.details}
            </Link>
          )}
          empty={{ title: l.noIncidents }}
        />
      </div>
    </Card>
  );
}
