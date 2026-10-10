"use client";

import Link from "next/link";
import { useState } from "react";
import { Card, Feedback } from "@/components/ui";
import { StateView, StatusChip } from "@/components/data";
import { ApiError, api } from "@/lib/apiClient";
import { formatDateTime } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import type { SportDto, UserAdminDto } from "@/lib/types";
import { EditUser } from "./users";
import styles from "./users.module.css";

function CoachSpecialties({ ids }: { ids: number[] }) {
  const { t } = useLanguage();
  const state = useApi(
    (signal) => api.get<SportDto[]>("/api/sports", { signal }),
    [],
  );
  if (state.loading)
    return <StateView kind="loading" title={t.common.loading} />;
  if (state.error)
    return (
      <StateView
        kind="error"
        title={t.dataTable.errorTitle}
        description={state.error.message}
        action={
          <button className="btn btn--secondary" onClick={state.reload}>
            {t.common.retry}
          </button>
        }
      />
    );
  return (
    <ul>
      {ids.map((id) => (
        <li key={id}>
          {state.data?.find((sport) => sport.sportId === id)?.name ?? `#${id}`}
        </li>
      ))}
    </ul>
  );
}

export function UserDetail({ userId }: { userId: string }) {
  const { t } = useLanguage();
  const l = t.adminWork;
  const [edit, setEdit] = useState(false);
  const [saved, setSaved] = useState(false);
  const state = useApi(
    async (signal) => {
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          userId,
        )
      ) {
        throw new ApiError(400, "invalid_account_id", l.invalidId);
      }
      // Dedicated administrative account detail; no staff data policy is widened.
      return api.get<UserAdminDto>(`/api/users/admin/${userId}`, { signal });
    },
    [userId],
  );
  const back = (
    <Link className="btn btn--secondary" href="/admin/users">
      {l.backUsers}
    </Link>
  );
  const account = state.data;
  const statusLabels: Record<string, string> = {
    ACTIVE: t.staffWork.accountActive,
    BANNED: t.staffWork.accountLocked,
    DEACTIVATED: t.staffWork.accountDeactivated,
  };
  return (
    <div className="stack">
      <div className="btn-row">
        {back}
        <button
          type="button"
          className="btn btn--secondary"
          disabled={state.loading}
          onClick={state.reload}
        >
          {t.staffWork.refresh}
        </button>
      </div>
      <p className={`small muted ${styles.accountIdentifier}`}>
        {l.accountId}: {userId}
      </p>
      {state.loading ? (
        <StateView kind="loading" title={t.common.loading} />
      ) : state.error ? (
        <StateView
          kind={state.error.status === 403 ? "forbidden" : "error"}
          title={
            state.error.status === 403
              ? l.detailBlockedTitle
              : state.error.status === 404
                ? l.notFoundTitle
                : t.dataTable.errorTitle
          }
          description={
            state.error.status === 403
              ? l.detailBlockedHint
              : state.error.status === 404
                ? l.notFoundHint
                : state.error.message
          }
          code={
            state.error.status === 403 ? "BLOCKED API — G10" : state.error.code
          }
          action={back}
        />
      ) : (
        account && (
          <>
            <Feedback success={saved ? t.operations.saved : ""} />
            <Card
              title={l.identityTitle}
              actions={
                <button className="btn" onClick={() => setEdit(true)}>
                  {t.staffWork.edit}
                </button>
              }
            >
              <dl className={styles.details}>
                <div>
                  <dt>{t.staffWork.fullName}</dt>
                  <dd>{account.fullName || "—"}</dd>
                </div>
                <div>
                  <dt>{t.staffWork.email}</dt>
                  <dd>{account.email}</dd>
                </div>
                <div>
                  <dt>{t.staffWork.phone}</dt>
                  <dd>{account.phone || "—"}</dd>
                </div>
                <div>
                  <dt>{t.staffWork.role}</dt>
                  <dd>
                    <StatusChip value={account.role} />
                  </dd>
                </div>
                <div>
                  <dt>{t.staffWork.accountState}</dt>
                  <dd>
                    <StatusChip
                      value={account.status}
                      tone={
                        account.status === "BANNED"
                          ? "danger"
                          : account.status === "ACTIVE"
                            ? "success"
                            : "neutral"
                      }
                      label={statusLabels[account.status]}
                    />
                  </dd>
                </div>
                <div>
                  <dt>{l.createdAt}</dt>
                  <dd>{formatDateTime(account.createdAt)}</dd>
                </div>
              </dl>
            </Card>
            <Card title={l.signInTitle}>
              <dl className={styles.details}>
                <div>
                  <dt>{l.passwordSet}</dt>
                  <dd>{account.hasPassword ? l.yes : l.no}</dd>
                </div>
                <div>
                  <dt>{l.googleLinked}</dt>
                  <dd>{account.hasGoogleLink ? l.yes : l.no}</dd>
                </div>
              </dl>
            </Card>
            {account.role === "COACH" && (
              <Card title={t.staffWork.specialties}>
                {account.sportIds.length ? (
                  <CoachSpecialties ids={account.sportIds} />
                ) : (
                  <p>{l.noSports}</p>
                )}
              </Card>
            )}
            {edit && (
              <EditUser
                account={account}
                onClose={() => setEdit(false)}
                reload={() => {
                  setEdit(false);
                  setSaved(true);
                  state.reload();
                }}
              />
            )}
          </>
        )
      )}
    </div>
  );
}
