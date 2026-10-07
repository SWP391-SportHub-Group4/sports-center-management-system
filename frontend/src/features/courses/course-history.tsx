"use client";
import { useState } from "react";
import { Dialog } from "@/components/ui";
import styles from "./course-history.module.css";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { pageQuery, useUrlQuery } from "@/lib/useUrlQuery";
import { formatDate, formatMoney, formatDateTime } from "@/lib/format";
import { ApiTable } from "@/components/data";
import type { AuditLogDto, CoachAdminDto, Paged } from "@/lib/types";
export function CourseHistory({ classId }: { classId: number }) {
  const { t } = useLanguage();
  const [selected, setSelected] = useState<AuditLogDto | null>(null);
  const coaches = useApi(
    async (signal) => {
      const ids = new Set<string>();
      for (const raw of [selected?.oldValue, selected?.newValue]) {
        try {
          const parsed = JSON.parse(raw ?? "null");
          const snapshot = parsed?.value ?? parsed;
          const id = snapshot?.coachId ?? snapshot?.CoachId;
          if (typeof id === "string" && id) ids.add(id);
        } catch {
          /* An older entry may lack structured values. */
        }
      }
      const results = await Promise.all(
        [...ids].map(async (id) => {
          try {
            const coach = await api.get<CoachAdminDto>(
              `/api/manager/coaches/${encodeURIComponent(id)}`,
              { signal },
            );
            return [id.toLowerCase(), coach.fullName] as const;
          } catch {
            return [id.toLowerCase(), null] as const;
          }
        }),
      );
      return Object.fromEntries(results);
    },
    [selected?.oldValue, selected?.newValue],
  );
  const h = t.courseHistory;
  const actionName = (action: string) =>
    h[action as keyof typeof h] ?? action.replaceAll("_", " ");
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
            cell: (r) => (
              <span className={styles.nowrap}>
                {formatDateTime(r.timestamp)}
              </span>
            ),
          },
          {
            id: "actorEmail",
            header: h.actor,
            cell: (r) => (
              <span className={styles.nowrap}>{r.actorEmail ?? "—"}</span>
            ),
          },
          {
            id: "action",
            header: t.staffWork.action,
            cell: (r) => (
              <span className={styles.nowrap}>{actionName(r.action)}</span>
            ),
          },
          {
            id: "targetId",
            header: t.staffWork.entity,
            cell: (r) => (
              <span className={styles.nowrap}>
                {h.class} #{r.targetId}
              </span>
            ),
          },
          {
            id: "newValue",
            header: t.operations.details,
            cell: (r) => (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setSelected(r)}
              >
                {t.operations.details}
              </button>
            ),
          },
        ]}
      />
      {selected && (
        <Dialog
          title={actionName(selected.action)}
          size="lg"
          onClose={() => setSelected(null)}
        >
          <p className={styles.event}>
            {selected.actorEmail ?? "\u2014"}{" "}
            <span>{formatDateTime(selected.timestamp)}</span>
          </p>
          <div className={styles.snapshots}>
            <Snapshot
              title={h.before}
              raw={selected.oldValue}
              coachNames={coaches.data ?? {}}
              coachesLoading={coaches.loading}
            />
            <Snapshot
              title={h.after}
              raw={selected.newValue}
              coachNames={coaches.data ?? {}}
              coachesLoading={coaches.loading}
            />
          </div>
        </Dialog>
      )}
    </>
  );
}

function Snapshot({
  title,
  raw,
  coachNames,
  coachesLoading,
}: {
  title: string;
  raw: string | null;
  coachNames: Record<string, string | null>;
  coachesLoading: boolean;
}) {
  const { t } = useLanguage();
  const l = t.operations;
  const h = t.courseHistory;
  const labels: Record<string, string> = {
    reason: h.reason,
    code: l.code,
    name: l.name,
    sportId: `${l.sports} (ID)`,
    coachId: l.coach,
    roomId: `${l.room} (ID)`,
    startDate: l.startDate,
    numSessions: l.numSessions,
    capacity: l.capacity,
    price: l.price,
    costAmount: l.cost,
    status: l.status,
    thresholdStatus: h.thresholdStatus,
    breakEvenThreshold: h.breakEvenThreshold,
    confirmedCount: h.confirmedCount,
    activeHoldCount: h.activeHoldCount,
    refundPoints: h.refundPoints,
    sessionsNotProvided: h.sessionsNotProvided,
  };
  let entries: [string, unknown][] = [];
  try {
    const data: unknown = JSON.parse(raw ?? "null");
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const wrapper = data as Record<string, unknown>;
      const value =
        wrapper.value &&
        typeof wrapper.value === "object" &&
        !Array.isArray(wrapper.value)
          ? wrapper.value
          : wrapper;
      entries = Object.entries(value)
        .concat(
          value !== wrapper && typeof wrapper.reason === "string"
            ? [["reason", wrapper.reason]]
            : [],
        )
        .map(
          ([key, value]) =>
            [key.charAt(0).toLowerCase() + key.slice(1), value] as [
              string,
              unknown,
            ],
        )
        .filter(
          ([key, value]) =>
            key in labels &&
            (value === null ||
              ["string", "number", "boolean"].includes(typeof value)),
        );
    }
  } catch {
    /* Historical entries can lack structured values. */
  }
  const display = (key: string, value: unknown) => {
    if (value === null) return "\u2014";
    if (key === "coachId" && typeof value === "string") {
      if (!value) return "\u2014";
      return (
        coachNames[value.toLowerCase()] ||
        (coachesLoading ? t.common.loading : `${h.coachUnavailable} (${value})`)
      );
    }
    if ((key === "price" || key === "costAmount") && typeof value === "number")
      return formatMoney(value);
    if (key === "startDate" && typeof value === "string")
      return formatDate(value);
    if (
      (key === "status" || key === "thresholdStatus") &&
      typeof value === "string"
    ) {
      const wire = value.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase();
      return t.wireStatus[wire as keyof typeof t.wireStatus] ?? value;
    }
    return String(value);
  };
  return (
    <section>
      <h3>{title}</h3>
      {entries.length ? (
        <dl className={styles.values}>
          {entries.map(([key, value]) => (
            <div key={key}>
              <dt>{labels[key]}</dt>
              <dd>{display(key, value)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="muted">{h.empty}</p>
      )}
    </section>
  );
}
