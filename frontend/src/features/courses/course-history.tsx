"use client";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { pageQuery, useUrlQuery } from "@/lib/useUrlQuery";
import { formatDateTime } from "@/lib/format";
import { ApiTable } from "@/components/data";
import type { AuditLogDto, Paged } from "@/lib/types";
export function CourseHistory({ classId }: { classId: number }) {
  const { t } = useLanguage();
  const { values, setValues } = useUrlQuery(
    { historyPage: "1" },
    { historyPage: pageQuery },
  );
  const page = Number(values.historyPage);
  const state = useApi(
    (signal) =>
      api.get<Paged<AuditLogDto>>("/api/audit-logs", {
        signal,
        query: {
          targetEntity: "Class",
          targetId: String(classId),
          page,
          pageSize: 20,
          sortBy: "timestamp",
          sortDirection: "desc",
        },
      }),
    [classId, page],
  );
  return (
    <>
      <p>{t.managerOperations.historyHint}</p>
      <ApiTable
        state={state}
        caption={t.managerOperations.history}
        page={page}
        pageSize={20}
        onPageChange={(page) => setValues({ historyPage: String(page) })}
        getRowId={(r) => r.auditId}
        columns={[
          {
            id: "timestamp",
            header: t.staffWork.time,
            cell: (r) => formatDateTime(r.timestamp),
          },
          { id: "actorEmail", header: t.staffWork.actor },
          { id: "action", header: t.staffWork.action },
          { id: "targetId", header: t.staffWork.entity },
          {
            id: "newValue",
            header: t.operations.details,
            cell: (r) => (
              <details>
                <summary>{t.operations.details}</summary>
                <pre
                  style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                >
                  {r.oldValue ?? "—"}
                  {"\n→\n"}
                  {r.newValue ?? "—"}
                </pre>
              </details>
            ),
          },
        ]}
      />
    </>
  );
}
