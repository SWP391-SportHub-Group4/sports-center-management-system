"use client";
import { StaffActivationActions } from "./StaffActivationActions";
import Link from "next/link";
import { useState } from "react";
import { Card, Dialog, Feedback, Field } from "@/components/ui";
import {
  ApiTable,
  FilterBar,
  StatusChip,
  type FilterField,
  type TableColumn,
} from "@/components/data";
import type { SortDirection } from "@/components/contracts/table";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { choiceQuery, pageQuery, useUrlQuery } from "@/lib/useUrlQuery";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
import { MutationFeedback, useMutation } from "@/features/operations";
import type { SportDto, Paged, UserAdminDto } from "@/lib/types";
import { SportOptions } from "./SportOptions";
import {
  AccountStatusChip,
  requiresStaffActivation,
} from "./AccountStatusChip";
import styles from "./users.module.css";
const staffRoles = [
  "CENTER_MANAGER",
  "COACH",
  "RECEPTIONIST",
  "SYSTEM_ADMINISTRATOR",
];
const creationRoles = staffRoles;
const staffRoleIds: Record<string, number> = {
  CENTER_MANAGER: 1,
  COACH: 2,
  RECEPTIONIST: 4,
  SYSTEM_ADMINISTRATOR: 5,
};
const accountRoles = [...staffRoles, "MEMBER"];
const accountStatuses = [
  "ACTIVE",
  "ACTIVATION_REQUIRED",
  "BANNED",
  "DEACTIVATED",
];
const userQueryDefaults = {
  keyword: "",
  role: "",
  status: "",
  page: "1",
  sortBy: "email",
  sortDirection: "asc",
  create: "",
};
const userQueryValidators = {
  create: choiceQuery(["", "1"], ""),
  page: pageQuery,
  role: choiceQuery(["", ...accountRoles], ""),
  status: choiceQuery(["", ...accountStatuses], ""),
  sortBy: choiceQuery(["fullName", "email", "role", "status"], "email"),
  sortDirection: choiceQuery(["asc", "desc"], "asc"),
};
function RoleSelect({
  value,
  onChange,
  member = false,
}: {
  value: string;
  onChange: (value: string) => void;
  member?: boolean;
}) {
  const { t } = useLanguage();
  const labels: Record<string, string> = {
    CENTER_MANAGER: t.navigation.roleLabel.CenterManager,
    COACH: t.navigation.roleLabel.Coach,
    RECEPTIONIST: t.navigation.roleLabel.Receptionist,
    SYSTEM_ADMINISTRATOR: t.navigation.roleLabel.SystemAdministrator,
    MEMBER: t.navigation.roleLabel.Member,
  };
  return (
    <Field label={t.staffWork.role}>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {(member ? accountRoles : creationRoles).map((r) => (
          <option key={r} value={r}>
            {labels[r] ?? r}
          </option>
        ))}
      </select>
    </Field>
  );
}
function SportSelect({
  value,
  onChange,
}: {
  value: number[];
  onChange: (value: number[]) => void;
}) {
  const state = useApi(
    (signal) => api.get<SportDto[]>("/api/sports", { signal }),
    [],
  );
  return <SportOptions state={state} value={value} onChange={onChange} />;
}
function CreateStaff({
  reload,
  onClose,
}: {
  reload: () => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const l = t.staffWork;
  const mutation = useMutation();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("RECEPTIONIST");
  const [specialties, setSpecialties] = useState<number[]>([]);
  const [review, setReview] = useState(false);
  const fieldClass = `form-grid__row ${styles.halfField}`;
  const canSubmit =
    !!name.trim() &&
    !!email.trim() &&
    (role !== "COACH" || specialties.length > 0);

  return (
    <Dialog
      title={review ? t.adminWork.reviewCreate : l.staffCreate}
      description={t.adminWork.createHint}
      size="lg"
      onClose={() => {
        if (!mutation.busy) onClose();
      }}
    >
      <form
        className={`form ${styles.createForm}`}
        onSubmit={async (event) => {
          event.preventDefault();
          if (mutation.busy || !canSubmit) return;
          if (!review) {
            setReview(true);
            return;
          }
          if (
            await mutation.run(() =>
              api.post("/api/users/admin/staff", {
                email: email.trim(),
                fullName: name.trim(),
                phone: phone.trim() || null,
                roleId: staffRoleIds[role],
                specialties: role === "COACH" ? specialties : [],
              }),
            )
          ) {
            reload();
          }
        }}
      >
        <div hidden={review}>
          <div className="form-grid">
            <div className={fieldClass}>
              <Field label={l.email} required>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </Field>
            </div>
            <div className={fieldClass}>
              <Field label={l.fullName} required>
                <input
                  required
                  pattern=".*\S.*"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
            </div>
            <div className={fieldClass}>
              <Field label={l.phone} hint={t.adminWork.optionalPhoneHint}>
                <input
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                />
              </Field>
            </div>
            <div className={fieldClass}>
              <RoleSelect value={role} onChange={setRole} />
            </div>
            {role === "COACH" && (
              <div className="form-grid__row">
                <SportSelect value={specialties} onChange={setSpecialties} />
              </div>
            )}
          </div>
          <p className={styles.activationNote}>{t.adminWork.activationHint}</p>
        </div>
        {review && (
          <dl className={styles.details}>
            <div>
              <dt>{l.fullName}</dt>
              <dd>{name.trim()}</dd>
            </div>
            <div>
              <dt>{l.email}</dt>
              <dd>{email.trim()}</dd>
            </div>
            <div>
              <dt>{l.phone}</dt>
              <dd>{phone.trim() || "—"}</dd>
            </div>
            <div>
              <dt>{l.role}</dt>
              <dd>
                <StatusChip value={role} />
              </dd>
            </div>
            {role === "COACH" && (
              <div>
                <dt>{l.specialties}</dt>
                <dd>
                  {t.adminWork.specialtyCount.replace(
                    "{count}",
                    String(specialties.length),
                  )}
                </dd>
              </div>
            )}
          </dl>
        )}
        <MutationFeedback mutation={mutation} />
        <div className={styles.createActions}>
          {review && (
            <button
              type="button"
              className="btn btn--secondary"
              disabled={mutation.busy}
              onClick={() => {
                setReview(false);
                mutation.reset();
              }}
            >
              {t.adminWork.editChange}
            </button>
          )}
          <button
            type="button"
            className="btn btn--secondary"
            disabled={mutation.busy}
            onClick={onClose}
          >
            {l.cancel}
          </button>
          <button
            type="submit"
            className="btn"
            disabled={mutation.busy || !canSubmit}
          >
            {review ? l.confirm : t.adminWork.reviewCreate}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
type AccountAction = "role" | "lock" | "unlock" | "deactivate";

export function EditUser({
  account: a,
  reload,
  onClose,
}: {
  account: UserAdminDto;
  reload: () => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const l = t.staffWork;
  const d = t.adminWork;
  const { user } = useAuth();
  const [role, setRole] = useState(a.role);
  const [sports, setSports] = useState(a.sportIds);
  const sportOptions = useApi(
    (signal) =>
      role === "COACH"
        ? api.get<SportDto[]>("/api/sports", { signal })
        : Promise.resolve([] as SportDto[]),
    [role],
  );
  const roleChanged = role !== a.role;
  const addedSports = sports.filter((id) => !a.sportIds.includes(id));
  const removedSports = a.sportIds.filter((id) => !sports.includes(id));
  const specialtiesChanged =
    role === "COACH" && (addedSports.length > 0 || removedSports.length > 0);
  const sportNames = (ids: number[]) =>
    ids
      .map(
        (id) =>
          sportOptions.data?.find((sport) => sport.sportId === id)?.name ??
          `#${id}`,
      )
      .join(", ");
  const [reason, setReason] = useState("");
  const [review, setReview] = useState<AccountAction | null>(null);
  const [copiedLink, setCopiedLink] = useState<
    "manager" | "receptionist" | "failed" | null
  >(null);
  const mutation = useMutation();
  const roleBlockReasons =
    review === "role" && mutation.error?.code === "role_change_blocked"
      ? mutation.error.details.reasons
      : null;
  const blockedReasons = Array.isArray(roleBlockReasons)
    ? roleBlockReasons.filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  async function copyMemberLink(audience: "manager" | "receptionist") {
    const path = `/${audience}/members/${a.userId}`;
    try {
      await navigator.clipboard.writeText(
        new URL(path, window.location.origin).toString(),
      );
      setCopiedLink(audience);
    } catch {
      setCopiedLink("failed");
    }
  }
  const validReason = reason.trim().length >= 3 && reason.trim().length <= 500;
  const statusLabels: Record<string, string> = {
    ACTIVE: l.accountActive,
    BANNED: l.accountLocked,
    DEACTIVATED: l.accountDeactivated,
  };
  const nextStatus =
    review === "unlock"
      ? "ACTIVE"
      : review === "lock"
        ? "BANNED"
        : "DEACTIVATED";
  const impact =
    review === "role"
      ? roleChanged
        ? d.roleImpact
        : d.specialtyImpact
      : review === "lock"
        ? d.lockImpact
        : review === "unlock"
          ? d.unlockImpact
          : d.deactivateImpact;
  async function confirmAction() {
    if (!review || !validReason) return;
    if (review === "role" && a.role === "SYSTEM_ADMINISTRATOR") return;
    const ok = await mutation.run(() =>
      review === "role"
        ? api.put(`/api/users/${a.userId}/role`, {
            role,
            reason: reason.trim(),
            sportIds: role === "COACH" ? sports : [],
          })
        : api.post(`/api/users/${a.userId}/${review}`, {
            reason: reason.trim(),
          }),
    );
    if (ok) {
      reload();
    }
  }
  return (
    <Dialog
      title={review ? d.reviewTitle : l.edit}
      description={review ? d.reviewHint : d.guardHint}
      size="lg"
      onClose={() => {
        if (!mutation.busy) onClose();
      }}
    >
      <div className="stack">
        <div className={styles.target}>
          <strong>{a.fullName}</strong>
          <span>{a.email}</span>
          <div className="btn-row">
            <StatusChip value={a.role} />
            <AccountStatusChip account={a} />
          </div>
        </div>
        {!review ? (
          <>
            <Field label={l.reason} required>
              <textarea
                required
                minLength={3}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <>
              {a.role === "MEMBER" ? (
                <p>{d.memberRoleLocked}</p>
              ) : a.role === "SYSTEM_ADMINISTRATOR" ? null : (
                <>
                  <RoleSelect
                    value={role}
                    onChange={(r) => {
                      setRole(r);
                      setSports(r === a.role ? a.sportIds : []);
                    }}
                  />
                  {role === "COACH" && (
                    <SportOptions
                      state={sportOptions}
                      value={sports}
                      onChange={setSports}
                    />
                  )}
                  <button
                    type="button"
                    className="btn"
                    disabled={
                      !validReason ||
                      (!roleChanged && !specialtiesChanged) ||
                      (role === "COACH" &&
                        (!sports.length ||
                          sportOptions.loading ||
                          !!sportOptions.error))
                    }
                    onClick={() => setReview("role")}
                  >
                    {d.saveChanges}
                  </button>
                </>
              )}
            </>
            {a.userId !== user?.userId && (
              <div className={`btn-row ${styles.accountActions}`}>
                {a.status !== "BANNED" && (
                  <button
                    type="button"
                    className="btn btn--danger"
                    disabled={!validReason}
                    onClick={() => setReview("lock")}
                  >
                    {l.lock}
                  </button>
                )}
                {a.status !== "ACTIVE" && (
                  <button
                    type="button"
                    className="btn btn--secondary"
                    disabled={!validReason}
                    onClick={() => setReview("unlock")}
                  >
                    {l.unlock}
                  </button>
                )}
                {a.status !== "DEACTIVATED" && (
                  <button
                    type="button"
                    className="btn btn--secondary"
                    disabled={!validReason}
                    onClick={() => setReview("deactivate")}
                  >
                    {l.deactivate}
                  </button>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <dl className={styles.details}>
              <div>
                <dt>{d.requestedAction}</dt>
                <dd>
                  {review === "role"
                    ? roleChanged
                      ? l.changeRole
                      : d.updateSpecialties
                    : review === "lock"
                      ? l.lock
                      : review === "unlock"
                        ? l.unlock
                        : l.deactivate}
                </dd>
              </div>
              {review === "role" ? (
                <>
                  {roleChanged && (
                    <>
                      <div>
                        <dt>{d.currentRole}</dt>
                        <dd>
                          <StatusChip value={a.role} />
                        </dd>
                      </div>
                      <div>
                        <dt>{d.newRole}</dt>
                        <dd>
                          <StatusChip value={role} />
                        </dd>
                      </div>
                    </>
                  )}
                  {role === "COACH" && (
                    <>
                      {(roleChanged || addedSports.length > 0) && (
                        <div>
                          <dt>{d.specialtiesAdded}</dt>
                          <dd>
                            {sportNames(roleChanged ? sports : addedSports)}
                          </dd>
                        </div>
                      )}
                      {!roleChanged && removedSports.length > 0 && (
                        <div>
                          <dt>{d.specialtiesRemoved}</dt>
                          <dd>{sportNames(removedSports)}</dd>
                        </div>
                      )}
                    </>
                  )}
                </>
              ) : (
                <>
                  <div>
                    <dt>{d.currentStatus}</dt>
                    <dd>{statusLabels[a.status]}</dd>
                  </div>
                  <div>
                    <dt>{d.newStatus}</dt>
                    <dd>{statusLabels[nextStatus]}</dd>
                  </div>
                </>
              )}
              <div>
                <dt>{l.reason}</dt>
                <dd className={styles.reason}>{reason.trim()}</dd>
              </div>
            </dl>
            <p>{impact}</p>
            {blockedReasons.length > 0 ? (
              <section
                className={styles.roleBlockers}
                aria-labelledby="role-blockers-title"
              >
                <h3 id="role-blockers-title">{d.roleBlockTitle}</h3>
                <ul>
                  {blockedReasons.map((blocker, index) => (
                    <li key={`${index}-${blocker}`}>
                      <span aria-hidden="true">✕</span>
                      <span>{blocker}</span>
                    </li>
                  ))}
                </ul>
                <p>{d.roleBlockGuidance}</p>
                <div className="btn-row">
                  <Link
                    className="btn btn--secondary"
                    href={`/admin/users/${a.userId}`}
                  >
                    {d.roleBlockAccountLink}
                  </Link>
                  <button
                    type="button"
                    className="btn btn--secondary"
                    onClick={() => copyMemberLink("manager")}
                  >
                    {d.roleBlockCopyManager}
                  </button>
                  <button
                    type="button"
                    className="btn btn--secondary"
                    onClick={() => copyMemberLink("receptionist")}
                  >
                    {d.roleBlockCopyReceptionist}
                  </button>
                </div>
                {copiedLink && (
                  <p role="status">
                    {copiedLink === "failed"
                      ? d.roleBlockCopyFailed
                      : d.roleBlockCopied}
                  </p>
                )}
              </section>
            ) : (
              <MutationFeedback mutation={mutation} />
            )}
            <div className="btn-row">
              <button
                type="button"
                className="btn btn--secondary"
                disabled={mutation.busy}
                onClick={() => {
                  setReview(null);
                  mutation.reset();
                }}
              >
                {d.editChange}
              </button>
              <button
                type="button"
                className={
                  review === "lock" || review === "deactivate"
                    ? "btn btn--danger"
                    : "btn"
                }
                disabled={mutation.busy}
                onClick={confirmAction}
              >
                {mutation.busy
                  ? t.common.loading
                  : review === "role"
                    ? d.confirmUpdate
                    : l.confirm}
              </button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
export function Users() {
  const { t } = useLanguage();
  const { user: currentUser } = useAuth();
  const l = t.staffWork;
  const query = useUrlQuery(userQueryDefaults, userQueryValidators);
  const { keyword, role, status } = query.values;
  const page = Number(query.values.page);
  const sort = {
    columnId: query.values.sortBy,
    direction: query.values.sortDirection as SortDirection,
  };
  const [selected, setSelected] = useState<UserAdminDto | null>(null);
  const [activationAccount, setActivationAccount] =
    useState<UserAdminDto | null>(null);
  const [activationBusy, setActivationBusy] = useState(false);
  const closeActivation = () => {
    if (activationBusy) return;
    const accountId = activationAccount?.userId;
    setActivationAccount(null);
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLButtonElement>(
          `button[data-activation-account-id="${accountId}"]`,
        )
        ?.focus(),
    );
  };
  const create = query.values.create === "1";
  const [notice, setNotice] = useState<"created" | "changed" | null>(null);
  const state = useApi(
    (signal) =>
      api.get<Paged<UserAdminDto>>("/api/users/admin", {
        signal,
        query: {
          page,
          pageSize: 20,
          keyword,
          role,
          status,
          sortBy: sort.columnId,
          sortDirection: sort.direction,
        },
      }),
    [page, keyword, role, status, sort.columnId, sort.direction],
  );
  const roleLabels: Record<string, string> = {
    CENTER_MANAGER: t.navigation.roleLabel.CenterManager,
    COACH: t.navigation.roleLabel.Coach,
    RECEPTIONIST: t.navigation.roleLabel.Receptionist,
    SYSTEM_ADMINISTRATOR: t.navigation.roleLabel.SystemAdministrator,
    MEMBER: t.navigation.roleLabel.Member,
  };
  const statusLabels: Record<string, string> = {
    ACTIVE: l.accountActive,
    BANNED: l.accountLocked,
    DEACTIVATED: l.accountDeactivated,
  };
  const fields: FilterField[] = [
    { id: "keyword", label: l.keyword, kind: "search" },
    {
      id: "role",
      label: l.role,
      kind: "select",
      options: [
        { value: "", label: l.all },
        ...accountRoles.map((value) => ({ value, label: roleLabels[value] })),
      ],
    },
    {
      id: "status",
      label: l.accountState,
      kind: "select",
      options: [
        { value: "", label: l.all },
        ...accountStatuses.map((value) => ({
          value,
          label:
            value === "ACTIVATION_REQUIRED"
              ? t.adminWork.pendingActivation
              : statusLabels[value],
        })),
      ],
    },
  ];
  const activeCount = [keyword, role, status].filter(Boolean).length;
  const clearFilters = () => {
    query.setValues({ keyword: "", role: "", status: "", page: "1" });
    setSelected(null);
  };
  const columns: TableColumn<UserAdminDto>[] = [
    { id: "fullName", header: l.fullName, sortable: true, rowHeader: true },
    { id: "email", header: l.email, sortable: true },
    {
      id: "role",
      header: l.role,
      sortable: true,
      cell: (account) => <StatusChip value={account.role} />,
    },
    {
      id: "status",
      header: l.status,
      sortable: true,
      cell: (account) => <AccountStatusChip account={account} />,
    },
  ];
  const reload = () => {
    setSelected(null);
    state.reload();
    setNotice("changed");
  };
  return (
    <>
      <Feedback
        success={
          notice === "created"
            ? t.adminWork.staffCreated
            : notice === "changed"
              ? t.adminWork.changeSaved
              : ""
        }
      />
      <Card title={l.users}>
        <FilterBar
          fields={fields}
          values={{ keyword, role, status }}
          activeCount={activeCount}
          onChange={(next) => {
            query.setValues(
              { ...next, page: "1" },
              { replace: next.keyword !== keyword },
            );
            setSelected(null);
          }}
          onReset={clearFilters}
          actions={
            <button
              type="button"
              className="btn"
              onClick={() => {
                setNotice(null);
                query.setValues({ create: "1" });
              }}
            >
              {l.staffCreate}
            </button>
          }
        />
        <ApiTable
          caption={l.users}
          columns={columns}
          state={state}
          getRowId={(account) => account.userId}
          page={page}
          pageSize={20}
          onPageChange={(next) => {
            query.setValues({ page: String(next) });
            setSelected(null);
          }}
          sort={sort}
          onSortChange={(next) => {
            query.setValues({
              sortBy: next.columnId,
              sortDirection: next.direction,
              page: "1",
            });
            setSelected(null);
          }}
          rowActions={(account) => (
            <div className={styles.accountActions}>
              <Link
                className="btn btn--secondary"
                href={`/admin/users/${account.userId}`}
              >
                {t.adminWork.viewDetail}
              </Link>
              {currentUser && account.userId !== currentUser.userId && (
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => {
                    setNotice(null);
                    setSelected(account);
                  }}
                >
                  {l.edit}
                </button>
              )}
              {requiresStaffActivation(account) && (
                <button
                  type="button"
                  className={`btn btn--secondary ${styles.moreButton}`}
                  aria-label={`More activation actions for ${account.fullName || account.email}`}
                  aria-haspopup="dialog"
                  aria-expanded={activationAccount?.userId === account.userId}
                  data-activation-account-id={account.userId}
                  onClick={() => {
                    setActivationBusy(false);
                    setActivationAccount(account);
                  }}
                >
                  More
                </button>
              )}
            </div>
          )}
          empty={{
            title: t.common.noData,
            hint: activeCount ? t.dataTable.emptyHint : l.accountHint,
          }}
        />
      </Card>
      {activationAccount && (
        <Dialog
          title="Staff account activation"
          size="md"
          description="Resend the activation link or correct the recipient's email."
          className={styles.activationDialog}
          onClose={closeActivation}
        >
          <div className={styles.activationIdentity}>
            <div>
              <strong>
                {activationAccount.fullName || activationAccount.email}
              </strong>
              <p>{activationAccount.email}</p>
            </div>
            <AccountStatusChip account={activationAccount} />
          </div>
          {activationAccount.activationExpiresAtUtc ? (
            <StaffActivationActions
              account={activationAccount}
              embedded
              onBusyChange={setActivationBusy}
              onChanged={(updated) => {
                setActivationAccount(updated);
                state.reload();
              }}
            />
          ) : (
            <p>
              This account has no active staff invitation. Refresh the account
              details to check its activation status.
            </p>
          )}
        </Dialog>
      )}
      {create && (
        <CreateStaff
          onClose={() => query.setValues({ create: "" })}
          reload={() => {
            query.setValues({ create: "" });
            state.reload();
            setNotice("created");
          }}
        />
      )}
      {selected && (
        <EditUser
          key={selected.userId}
          account={selected}
          reload={reload}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
