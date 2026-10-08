"use client";

import Link from "next/link";
import { Card } from "@/components/ui";
import {
  Metric,
  MetricGrid,
  StateView,
  Table,
  type TableColumn,
} from "@/components/data";
import { stateKindFromStatus } from "@/components/contracts/state";
import { api } from "@/lib/apiClient";
import { formatDateTime } from "@/lib/format";
import { pagedItems } from "@/lib/paged";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import type { AuditLogDto, Paged, UserAdminDto } from "@/lib/types";
import { AuditTargetAccount } from "./AuditTargetAccount";

const statuses = ["ACTIVE", "BANNED", "DEACTIVATED"] as const;

export function AdminOverview() {
  const { t } = useLanguage();
  const l = t.adminWork;
  const totals = useApi(async (signal) => {
    const pages = await Promise.all(
      statuses.map((status) =>
        api.get<Paged<UserAdminDto>>("/api/users/admin", {
          signal,
          query: { status, page: 1, pageSize: 1 },
        }),
      ),
    );
    // Use server totals, never the number of rows in the first page.
    return pages.map((page) => page.totalCount);
  }, []);
  const activity = useApi(
    (signal) =>
      api.get<Paged<AuditLogDto>>("/api/audit-logs", {
        signal,
        query: {
          page: 1,
          pageSize: 5,
          targetEntity: "UserAccount",
          sortBy: "timestamp",
          sortDirection: "desc",
        },
      }),
    [],
  );
  const labels = [
    t.staffWork.accountActive,
    t.staffWork.accountLocked,
    t.staffWork.accountDeactivated,
  ];
  const actionLabels: Record<string, string> = {
    CREATE_STAFF_ACCOUNT: l.createAction,
    CHANGE_USER_ROLE: l.roleAction,
    LOCK_USER_ACCOUNT: l.lockAction,
    UNLOCK_USER_ACCOUNT: l.unlockAction,
  };
  const columns: TableColumn<AuditLogDto>[] = [
    {
      id: "timestamp",
      header: t.staffWork.time,
      cell: (row) => formatDateTime(row.timestamp),
    },
    { id: "actorEmail", header: l.actor, rowHeader: true },
    {
      id: "action",
      header: t.staffWork.action,
      cell: (row) => actionLabels[row.action] ?? row.action,
    },
    {
      id: "targetId",
      header: l.target,
      cell: (row) => <AuditTargetAccount row={row} linkToAccount />,
    },
  ];
  function errorView(state: typeof activity | typeof totals) {
    if (!state.error) return null;
    const kind = stateKindFromStatus(state.error.status);
    return (
      <StateView
        kind={kind}
        title={t.dataTable[`${kind}Title`]}
        description={
          kind === "error" ? state.error.message : t.dataTable[`${kind}Hint`]
        }
        code={state.error.code}
        action={
          <button
            type="button"
            className="btn btn--secondary"
            onClick={state.reload}
          >
            {t.common.retry}
          </button>
        }
      />
    );
  }
  return (
    <div className="stack">
      <Card title={l.shortcuts} hint={t.staffWork.accountHint}>
        <div className="btn-row">
          <Link className="btn" href="/admin/users?create=1">
            {t.staffWork.staffCreate}
          </Link>
          <Link className="btn btn--secondary" href="/admin/users">
            {t.staffWork.users}
          </Link>
          <Link className="btn btn--secondary" href="/admin/audit-log">
            {t.staffWork.adminAudit}
          </Link>
        </div>
      </Card>
      <Card
        title={l.statusTitle}
        hint={l.statusHint}
        actions={
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={totals.loading}
            onClick={totals.reload}
          >
            {t.staffWork.refresh}
          </button>
        }
      >
        {totals.error ? (
          errorView(totals)
        ) : totals.loading ? (
          <StateView kind="loading" title={t.common.loading} />
        ) : (
          <MetricGrid columns={3}>
            {statuses.map((status, index) => (
              <Metric
                key={status}
                label={labels[index]}
                value={totals.data?.[index] ?? "—"}
                href={`/admin/users?status=${status}`}
              />
            ))}
          </MetricGrid>
        )}
      </Card>
      <Card
        title={l.recentTitle}
        hint={`${l.recentHint} ${l.targetAccountHint}`}
        actions={
          <Link className="btn btn--secondary btn--sm" href="/admin/audit-log">
            {t.staffWork.adminAudit}
          </Link>
        }
      >
        {activity.error ? (
          errorView(activity)
        ) : (
          <Table
            caption={l.recentTitle}
            columns={columns}
            rows={pagedItems(activity.data)}
            getRowId={(row) => row.auditId}
            status={activity.loading ? "loading" : "ready"}
            empty={{ title: l.recentEmpty }}
          />
        )}
      </Card>
    </div>
  );
}
