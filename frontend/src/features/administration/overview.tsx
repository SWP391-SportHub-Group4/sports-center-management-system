"use client";

import Link from "next/link";
import { ArrowRight, Check, Clock3, ShieldCheck, Users } from "lucide-react";
import { StateView, Table, type TableColumn } from "@/components/data";
import { stateKindFromStatus } from "@/components/contracts/state";
import { api, type ApiError } from "@/lib/apiClient";
import { formatDateTime, formatNumber, formatTime } from "@/lib/format";
import { pagedItems } from "@/lib/paged";
import { useApi, useNow } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import type { AuditLogDto, Paged, UserAdminDto } from "@/lib/types";
import { AuditTargetAccount } from "./AuditTargetAccount";
import { AuditTargetEntity } from "./AuditTargetEntity";
import { AuditEventDetails } from "./AuditEventDetails";
import { readableAuditLabel } from "./audit-event-model";
import { auditActionLabel } from "./audit-action-label";
import styles from "./overview.module.css";
import { AvatarImage } from "@/components/AvatarImage";

const accountQueues = [
  "ACTIVE",
  "DEACTIVATED",
  "ACTIVATION_REQUIRED",
  "ACTIVATION_EXPIRING",
] as const;
const accountRoles = [
  { value: "SYSTEM_ADMINISTRATOR", label: "Administrators" },
  { value: "CENTER_MANAGER", label: "Center Managers" },
  { value: "RECEPTIONIST", label: "Receptionists" },
  { value: "COACH", label: "Coaches" },
  { value: "MEMBER", label: "Members" },
] as const;

function DashboardError({
  error,
  retry,
}: {
  error: ApiError;
  retry: () => void;
}) {
  const { t } = useLanguage();
  const kind = stateKindFromStatus(error.status);
  return (
    <StateView
      kind={kind}
      title={t.dataTable[`${kind}Title`]}
      description={
        kind === "error" ? error.message : t.dataTable[`${kind}Hint`]
      }
      code={error.code}
      action={
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          onClick={retry}
        >
          {t.common.retry}
        </button>
      }
    />
  );
}

export function AdminOverview() {
  const { t } = useLanguage();
  const l = t.adminWork;
  const now = useNow();
  const totals = useApi(async (signal) => {
    const pages = await Promise.all(
      accountQueues.map((status) =>
        api.get<Paged<UserAdminDto>>("/api/users/admin", {
          signal,
          query: {
            status,
            page: 1,
            pageSize: status === "ACTIVATION_REQUIRED" ? 4 : 1,
          },
        }),
      ),
    );
    return {
      counts: Object.fromEntries(
        pages.map((page, index) => [accountQueues[index], page.totalCount]),
      ),
      invitations: pagedItems(pages[2]),
      fetchedAt: new Date().toISOString(),
    };
  }, []);
  const roles = useApi(async (signal) => {
    const pages = await Promise.all(
      accountRoles.map(({ value: role }) =>
        api.get<Paged<UserAdminDto>>("/api/users/admin", {
          signal,
          query: { role, page: 1, pageSize: 1 },
        }),
      ),
    );
    return pages.map((page, index) => ({
      ...accountRoles[index],
      count: page.totalCount,
    }));
  }, []);
  const activity = useApi(
    (signal) =>
      api.get<Paged<AuditLogDto>>("/api/audit-logs", {
        signal,
        query: {
          page: 1,
          pageSize: 5,
          sortBy: "timestamp",
          sortDirection: "desc",
        },
      }),
    [],
  );
  const loading = totals.loading || roles.loading || activity.loading;
  const pending = totals.data?.counts.ACTIVATION_REQUIRED ?? 0;
  const expiring = totals.data?.counts.ACTIVATION_EXPIRING ?? 0;
  const roleTotal = roles.data?.reduce((sum, role) => sum + role.count, 0) ?? 0;
  const metrics = [
    {
      status: "ACTIVE",
      label: "Active accounts",
      hint: "Includes staff awaiting activation",
      tone: "active",
    },
    {
      status: "DEACTIVATED",
      label: "Deactivated accounts",
      hint: "Account access is disabled",
      tone: "inactive",
    },
  ];
  const columns: TableColumn<AuditLogDto>[] = [
    {
      id: "actorEmail",
      header: l.actor,
      rowHeader: true,
      cell: (row) => (
        <div className={styles.actor}>
          <span className={styles.avatar} aria-hidden="true">
            {row.actorRole === "SYSTEM" ? (
              <ShieldCheck size={17} />
            ) : (
              <AvatarImage
                userId={row.userId}
                name={row.actorFullName?.trim() || row.actorEmail || "Account"}
                size={32}
              />
            )}
          </span>
          <span className={styles.identity}>
            <strong>
              {row.actorRole === "SYSTEM"
                ? l.systemActor
                : row.actorFullName?.trim() || row.actorEmail}
            </strong>
            <small>
              {row.actorRole === "SYSTEM"
                ? "Automatic activity"
                : readableAuditLabel(row.actorRole || "User")}
            </small>
          </span>
        </div>
      ),
    },
    {
      id: "action",
      header: "Activity",
      cell: (row) => (
        <div className={styles.event}>
          <strong>{auditActionLabel(row.action, row.newValue)}</strong>
          <div className={styles.eventTarget}>
            {row.targetEntity === "UserAccount" ? (
              <AuditTargetAccount row={row} />
            ) : (
              <AuditTargetEntity row={row} linkToManager={false} />
            )}
          </div>
        </div>
      ),
    },
    {
      id: "timestamp",
      header: "When",
      cell: (row) => (
        <time dateTime={row.timestamp} className={styles.timestamp}>
          {formatDateTime(row.timestamp)}
        </time>
      ),
    },
    {
      id: "details",
      header: "Details",
      cell: (row) => <AuditEventDetails row={row} />,
    },
  ];

  return (
    <div className={styles.dashboard}>
      <div className={styles.toolbar}>
        <div
          className={styles.sync}
          role="status"
          data-error={!!(totals.error || roles.error || activity.error)}
        >
          <span className={styles.syncDot} aria-hidden="true" />
          <span>
            {loading
              ? "Updating dashboard…"
              : totals.error || roles.error || activity.error
                ? "Some dashboard data is unavailable"
                : totals.data
                  ? `Account snapshot · updated ${formatTime(totals.data.fetchedAt)} (UTC+7)`
                  : "Account snapshot"}
          </span>
        </div>
      </div>

      <section
        className={`${styles.panel} ${styles.invitationPanel}`}
        aria-labelledby="admin-invitations-title"
      >
        <header className={styles.panelHeader}>
          <div>
            <h2 id="admin-invitations-title">Staff activation</h2>
            <p>
              Invitations have a fixed 24-hour window from account creation.
            </p>
          </div>
        </header>
        {totals.error ? (
          <DashboardError error={totals.error} retry={totals.reload} />
        ) : totals.loading ? (
          <StateView kind="loading" title="Loading invitations" />
        ) : pending === 0 ? (
          <div className={styles.allClear}>
            <span className={styles.clearIcon}>
              <Check size={20} aria-hidden="true" />
            </span>
            <div>
              <strong>No pending activations</strong>
              <p>No active staff accounts are awaiting activation.</p>
            </div>
          </div>
        ) : (
          <div className={styles.invitationGrid}>
            <div className={styles.attention} data-urgent={expiring > 0}>
              <Clock3 size={21} aria-hidden="true" />
              <div>
                <strong>
                  {expiring > 0
                    ? `${formatNumber(expiring)} ${expiring === 1 ? "invitation expires" : "invitations expire"} within 6 hours`
                    : "No invitations expiring within 6 hours"}
                </strong>
                <p>
                  {formatNumber(pending)} staff{" "}
                  {pending === 1 ? "account is" : "accounts are"} awaiting
                  activation. Staff can activate their accounts using the
                  invitation email before the deadline.
                </p>
              </div>
            </div>
            <div>
              <ul className={styles.invitationList}>
                {totals.data?.invitations.map((account) => {
                  const deadline = account.activationExpiresAtUtc;
                  const expired = !!deadline && Date.parse(deadline) <= now;
                  return (
                    <li key={account.userId}>
                      <div className={styles.invitationRow}>
                        <span className={styles.identity}>
                          <strong>{account.fullName || account.email}</strong>
                          <small>{account.email}</small>
                        </span>
                        <span
                          className={styles.deadline}
                          data-expired={expired}
                        >
                          {deadline
                            ? `${expired ? "Expired" : "Expires"} ${formatDateTime(deadline)}`
                            : "Awaiting activation"}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {pending > 4 && (
                <p className={styles.queueNote}>
                  Showing 4 of {formatNumber(pending)} pending staff accounts.
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      <section aria-label="Account overview" aria-busy={totals.loading}>
        <div className={styles.metrics}>
          {metrics.map((metric) => (
            <div
              className={styles.metric}
              data-tone={metric.tone}
              key={metric.status}
            >
              <span className={styles.metricLabel}>
                <span className={styles.statusDot} aria-hidden="true" />
                {metric.label}
              </span>
              <strong className={styles.metricValue}>
                {totals.loading ? (
                  <span
                    className={styles.numberSkeleton}
                    aria-label="Loading"
                  />
                ) : totals.data ? (
                  formatNumber(totals.data.counts[metric.status])
                ) : (
                  "—"
                )}
              </strong>
              <span className={styles.metricHint}>{metric.hint}</span>
            </div>
          ))}
        </div>
        {totals.error && (
          <DashboardError error={totals.error} retry={totals.reload} />
        )}
      </section>

      <div className={styles.mainGrid}>
        <section
          className={`${styles.panel} ${styles.activityPanel}`}
          aria-labelledby="admin-activity-title"
        >
          <header className={styles.panelHeader}>
            <div>
              <h2 id="admin-activity-title">{l.recentTitle}</h2>
              <p>The latest five events in your audit scope.</p>
            </div>
            <Link className={styles.textLink} href="/admin/audit-log">
              View all
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </header>
          <div className={styles.activityBody}>
            {activity.error ? (
              <DashboardError error={activity.error} retry={activity.reload} />
            ) : (
              <Table
                caption={l.recentTitle}
                columns={columns}
                rows={pagedItems(activity.data)}
                getRowId={(row) => row.auditId}
                status={activity.loading ? "loading" : "ready"}
                density="compact"
                empty={{ title: l.recentEmpty }}
              />
            )}
          </div>
          <p className={styles.panelNote}>
            Manager, Administrator, Coach and system events. Select View details
            to inspect a change.
          </p>
        </section>

        <section
          className={`${styles.panel} ${styles.rolesPanel}`}
          aria-labelledby="admin-roles-title"
        >
          <header className={styles.panelHeader}>
            <div>
              <h2 id="admin-roles-title">Accounts by role</h2>
              <p>All account statuses</p>
            </div>
            <Users size={20} className={styles.panelIcon} aria-hidden="true" />
          </header>
          {roles.error ? (
            <DashboardError error={roles.error} retry={roles.reload} />
          ) : roles.loading ? (
            <StateView kind="loading" title="Loading account distribution" />
          ) : roleTotal === 0 ? (
            <StateView
              kind="empty"
              title="No accounts yet"
              description="Account roles will appear here when accounts are available."
            />
          ) : (
            <>
              <div className={styles.roleTotal}>
                <strong>{formatNumber(roleTotal)}</strong>
                <span>total accounts</span>
              </div>
              <ul
                className={styles.roleList}
                aria-label="Account distribution by role"
              >
                {roles.data?.map((role) => (
                  <li key={role.value}>
                    <div className={styles.roleItem}>
                      <span className={styles.roleLabel}>
                        <span>{role.label}</span>
                        <strong>{formatNumber(role.count)}</strong>
                      </span>
                      <span className={styles.barTrack} aria-hidden="true">
                        <span
                          className={styles.barFill}
                          style={{
                            width: `${(role.count / roleTotal) * 100}%`,
                          }}
                        />
                      </span>
                      <span className={styles.roleShare}>
                        {new Intl.NumberFormat("en-GB", {
                          maximumFractionDigits: 1,
                        }).format((role.count / roleTotal) * 100)}
                        % of accounts
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
