"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ShieldCheck, KeyRound } from "lucide-react";
import { AvatarImage } from "@/components/AvatarImage";
import { Card, Feedback } from "@/components/ui";
import { StateView, StatusChip } from "@/components/data";
import { ApiError, api } from "@/lib/apiClient";
import { formatDateTime } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { useAuth } from "@/lib/auth";
import { useUrlQuery } from "@/lib/useUrlQuery";
import type { SportDto, UserAdminDto } from "@/lib/types";
import { accountListReturnHref, EditUser } from "./users";
import { AccountStatusChip } from "./AccountStatusChip";
import { StaffActivationActions } from "./StaffActivationActions";
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
    <ul className={styles.specialtyNames}>
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
  const { user } = useAuth();
  const query = useUrlQuery({ returnTo: "" });
  const returnHref = accountListReturnHref(query.values.returnTo);
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

      return api.get<UserAdminDto>(`/api/users/admin/${userId}`, { signal });
    },
    [userId],
  );
  const back = (
    <Link className="btn btn--secondary" href={returnHref}>
      <ArrowLeft size={16} aria-hidden="true" />
      {l.backUsers}
    </Link>
  );
  const account = state.data;
  return (
    <div className={styles.profilePage}>
      <div className="btn-row">{back}</div>
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
          code={state.error.code}
          action={back}
        />
      ) : (
        account && (
          <>
            <Feedback success={saved ? t.operations.saved : ""} />
            <header className={styles.profileHeading}>
              <span className={styles.profileAvatar} aria-hidden="true">
                <AvatarImage
                  name={account.fullName || account.email}
                  avatarUrl={account.avatarUrl}
                  size={64}
                />
              </span>
              <div className={styles.profileIdentity}>
                <h2>{account.fullName || account.email}</h2>
                <p>{account.email}</p>
                <div className={styles.profileBadges}>
                  <StatusChip value={account.role} />
                  <AccountStatusChip account={account} />
                </div>
              </div>
              <div className={styles.profileControls}>
                <Link
                  className="btn btn--secondary"
                  href={`/admin/audit-log?targetEntity=UserAccount&targetId=${encodeURIComponent(userId)}`}
                >
                  {l.viewAccountActivity}
                </Link>
                {account.userId === user?.userId ? (
                  <Link href="/account" className="btn">
                    {l.personalAccount}
                  </Link>
                ) : (
                  <button className="btn" onClick={() => setEdit(true)}>
                    <ShieldCheck size={16} aria-hidden="true" />
                    {l.manageAccess}
                  </button>
                )}
              </div>
            </header>
            <div className={styles.profileGrid}>
              <section
                className={styles.profileColumn}
                aria-label="Personal information"
              >
                <Card
                  title="Personal information"
                  hint="Contact details and account registration."
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
                      <dt>{l.createdAt}</dt>
                      <dd>{formatDateTime(account.createdAt)}</dd>
                    </div>
                  </dl>
                  <details className={styles.accountReference}>
                    <summary>Account reference</summary>
                    <p className={styles.accountIdentifier}>
                      {l.accountId}: {userId}
                    </p>
                  </details>
                </Card>
                {account.role === "COACH" && (
                  <Card
                    title={t.staffWork.specialties}
                    hint="Sports this Coach is qualified to teach."
                  >
                    {account.sportIds.length ? (
                      <CoachSpecialties ids={account.sportIds} />
                    ) : (
                      <p>{l.noSports}</p>
                    )}
                  </Card>
                )}
              </section>
              <section
                className={styles.profileColumn}
                aria-label="Sign-in and activation"
              >
                <Card
                  title={l.signInTitle}
                  hint="Activation status and available sign-in methods."
                >
                  <StaffActivationActions
                    account={account}
                    onChanged={state.reload}
                  />
                  <dl className={styles.signInMethods}>
                    <div>
                      <dt>{l.passwordSet}</dt>
                      <dd>
                        <KeyRound size={16} aria-hidden="true" />
                        {account.hasPassword
                          ? "Password configured"
                          : "Not configured"}
                      </dd>
                    </div>
                    <div>
                      <dt>{l.googleLinked}</dt>
                      <dd>
                        <ShieldCheck size={16} aria-hidden="true" />
                        {account.hasGoogleLink
                          ? "Google connected"
                          : "Not connected"}
                      </dd>
                    </div>
                  </dl>
                </Card>
              </section>
            </div>
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
