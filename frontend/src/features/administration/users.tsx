"use client";
import { StaffActivationActions } from "./StaffActivationActions";
import Link from "next/link";
import { useState } from "react";
import { Plus, Search, Trash2, X } from "lucide-react";
import { AvatarImage } from "@/components/AvatarImage";
import { Card, Dialog, Feedback, Field } from "@/components/ui";
import { ApiTable, type TableColumn } from "@/components/data";
import { Input, Select } from "@/components/primitives/Controls";
import type { SortDirection } from "@/components/contracts/table";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { choiceQuery, pageQuery, useUrlQuery } from "@/lib/useUrlQuery";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
import { MutationFeedback, useMutation } from "@/features/operations";
import type { SportDto, Paged, UserAdminDto } from "@/lib/types";
import { SportOptions } from "./SportOptions";
import { RoleChip } from "./RoleChip";
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
const accountStatuses = ["ACTIVE", "DEACTIVATED"];
const invitationFilters = ["ACTIVATION_REQUIRED", "ACTIVATION_EXPIRING"];
const accountStatusQuery = (value: string) =>
  value === "BANNED" || value === "LOCKED"
    ? "DEACTIVATED"
    : choiceQuery(["", ...accountStatuses, ...invitationFilters], "")(value);
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
  status: accountStatusQuery,
  sortBy: choiceQuery(["fullName", "email", "role", "status"], "email"),
  sortDirection: choiceQuery(["asc", "desc"], "asc"),
};

/** Rebuild only supported account-list state; never follow an arbitrary return URL. */
export function accountListReturnHref(value: string): string {
  try {
    const url = new URL(value, "https://sporthub.invalid");
    if (
      !value.startsWith("/") ||
      url.origin !== "https://sporthub.invalid" ||
      url.pathname !== "/admin/users"
    )
      return "/admin/users";
    const params = new URLSearchParams();
    for (const key of [
      "keyword",
      "role",
      "status",
      "page",
      "sortBy",
      "sortDirection",
    ] as const) {
      const raw = url.searchParams.get(key);
      if (!raw) continue;
      const validated =
        key === "keyword" ? raw.slice(0, 256) : userQueryValidators[key](raw);
      if (validated !== userQueryDefaults[key]) params.set(key, validated);
    }
    return `/admin/users${params.size ? `?${params}` : ""}`;
  } catch {
    return "/admin/users";
  }
}
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
function useCoachSports(enabled: boolean) {
  return useApi(
    (signal) =>
      enabled
        ? api.get<SportDto[]>("/api/sports", { signal })
        : Promise.resolve<SportDto[]>([]),
    [enabled],
  );
}

function SpecialtySummary({
  ids,
  sports,
}: {
  ids: number[];
  sports: SportDto[];
}) {
  return (
    <ul className={styles.specialtyNames}>
      {ids.map((id) => (
        <li key={id}>
          {sports.find((sport) => sport.sportId === id)?.name ?? `Sport #${id}`}
        </li>
      ))}
    </ul>
  );
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
  const sports = useCoachSports(role === "COACH");
  const [review, setReview] = useState(false);
  const fieldClass = `form-grid__row ${styles.halfField}`;
  const canSubmit =
    !!name.trim() &&
    !!email.trim() &&
    (role !== "COACH" ||
      (specialties.length > 0 && !sports.loading && !sports.error));

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
                <SportOptions
                  state={sports}
                  value={specialties}
                  onChange={setSpecialties}
                />
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
                <RoleChip role={role} />
              </dd>
            </div>
            {role === "COACH" && (
              <div>
                <dt>{l.specialties}</dt>
                <dd>
                  <SpecialtySummary
                    ids={specialties}
                    sports={sports.data ?? []}
                  />
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
type AccountAction = "role" | "activate" | "deactivate";

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
  const role = a.role;
  const [sports, setSports] = useState(a.sportIds);
  const sportOptions = useCoachSports(role === "COACH");
  const roleChanged = false;
  const addedSports = sports.filter((id) => !a.sportIds.includes(id));
  const removedSports = a.sportIds.filter((id) => !sports.includes(id));
  const specialtiesChanged =
    role === "COACH" && (addedSports.length > 0 || removedSports.length > 0);
  const sportNames = (ids: number[]) =>
    ids
      .map(
        (id) =>
          sportOptions.data?.find((sport) => sport.sportId === id)?.name ??
          `Sport #${id}`,
      )
      .join(", ");
  const [reason, setReason] = useState("");
  const [review, setReview] = useState<AccountAction | null>(null);
  const [copiedLink, setCopiedLink] = useState<"manager" | "failed" | null>(
    null,
  );
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
  async function copyCoachLink() {
    const path = `/manager/coaches/${a.userId}`;
    try {
      await navigator.clipboard.writeText(
        new URL(path, window.location.origin).toString(),
      );
      setCopiedLink("manager");
    } catch {
      setCopiedLink("failed");
    }
  }
  const validReason = reason.trim().length >= 3 && reason.trim().length <= 500;
  const statusLabels: Record<string, string> = {
    ACTIVE: l.accountActive,
    DEACTIVATED: l.accountDeactivated,
  };
  const currentStatus = a.status === "ACTIVE" ? "ACTIVE" : "DEACTIVATED";
  const nextStatus = review === "activate" ? "ACTIVE" : "DEACTIVATED";
  const impact =
    review === "role"
      ? roleChanged
        ? d.roleImpact
        : d.specialtyImpact
      : review === "activate"
        ? d.activateImpact
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
      title={review ? d.reviewTitle : d.manageAccess}
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
            <RoleChip role={a.role} />
            <AccountStatusChip account={a} />
          </div>
        </div>
        {!review ? (
          <>
            {a.role === "COACH" && (
              <section
                className={styles.accessSection}
                aria-label="Coach specialties"
              >
                <div className={styles.sectionHeading}>
                  <h3>Specialties</h3>
                  <p>Assign sport specialties for this coach.</p>
                </div>
                <SportOptions
                  state={sportOptions}
                  value={sports}
                  onChange={setSports}
                />
                <button
                  type="button"
                  className="btn"
                  disabled={
                    !validReason ||
                    !specialtiesChanged ||
                    !sports.length ||
                    sportOptions.loading ||
                    !!sportOptions.error
                  }
                  onClick={() => setReview("role")}
                >
                  {d.saveChanges}
                </button>
              </section>
            )}
            {a.role === "MEMBER" && (
              <section
                className={styles.accessSection}
                aria-label="Role and specialties"
              >
                <p>{d.memberRoleLocked}</p>
              </section>
            )}
            {a.userId === user?.userId && (
              <Field
                label={l.reason}
                required
                hint="Required for every access change. Your reason is recorded in the audit log."
              >
                <textarea
                  required
                  minLength={3}
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
            )}
            {a.userId !== user?.userId && (
              <section
                className={styles.accessSection}
                aria-label="Account status"
              >
                <div className={styles.sectionHeading}>
                  <h3>Account status</h3>
                  <p>
                    Restrict or restore sign-in access. You will review the
                    change before confirming.
                  </p>
                </div>
                <Field
                  label={l.reason}
                  required
                  hint="Required for every access change. Your reason is recorded in the audit log."
                >
                  <textarea
                    required
                    minLength={3}
                    maxLength={500}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </Field>
                <button
                  type="button"
                  className={
                    currentStatus === "ACTIVE" ? "btn btn--danger" : "btn"
                  }
                  disabled={!validReason}
                  onClick={() =>
                    setReview(
                      currentStatus === "ACTIVE" ? "deactivate" : "activate",
                    )
                  }
                >
                  {currentStatus === "ACTIVE" ? l.deactivate : l.activate}
                </button>
              </section>
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
                    : review === "activate"
                      ? l.activate
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
                          <RoleChip role={a.role} />
                        </dd>
                      </div>
                      <div>
                        <dt>{d.newRole}</dt>
                        <dd>
                          <RoleChip role={role} />
                        </dd>
                      </div>
                    </>
                  )}
                  {role === "COACH" && (
                    <>
                      {roleChanged ? (
                        <div>
                          <dt>{l.specialties}</dt>
                          <dd>
                            <SpecialtySummary
                              ids={sports}
                              sports={sportOptions.data ?? []}
                            />
                          </dd>
                        </div>
                      ) : (
                        <>
                          {addedSports.length > 0 && (
                            <div>
                              <dt>{d.specialtiesAdded}</dt>
                              <dd>{sportNames(addedSports)}</dd>
                            </div>
                          )}
                          {removedSports.length > 0 && (
                            <div>
                              <dt>{d.specialtiesRemoved}</dt>
                              <dd>{sportNames(removedSports)}</dd>
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )}
                </>
              ) : (
                <>
                  <div>
                    <dt>{d.currentStatus}</dt>
                    <dd>{statusLabels[currentStatus]}</dd>
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
                  {a.role === "COACH" && (
                    <button
                      type="button"
                      className="btn btn--secondary"
                      onClick={copyCoachLink}
                    >
                      {d.roleBlockCopyManager}
                    </button>
                  )}
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
                  review === "deactivate"
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
  const listParams = new URLSearchParams(query.values);
  const returnHref = accountListReturnHref(`/admin/users?${listParams}`);
  const accountHref = (id: string) =>
    `/admin/users/${id}?returnTo=${encodeURIComponent(returnHref)}`;
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
    DEACTIVATED: l.accountDeactivated,
  };
  const invitationFilter = invitationFilters.includes(status);
  const activeCount = [keyword, role, status].filter(Boolean).length;
  const updateFilters = (
    next: Partial<Record<"keyword" | "role" | "status", string>>,
  ) => {
    query.setValues(
      { ...next, page: "1" },
      { replace: next.keyword !== undefined && next.keyword !== keyword },
    );
    setSelected(null);
  };
  const clearFilters = () => {
    query.setValues({ keyword: "", role: "", status: "", page: "1" });
    setSelected(null);
  };
  const columns: TableColumn<UserAdminDto>[] = [
    {
      id: "fullName",
      header: l.fullName,
      sortable: true,
      rowHeader: true,
      cell: (account) => (
        <div className={styles.person}>
          <span className={styles.personIcon} aria-hidden="true">
            <AvatarImage
              name={account.fullName || account.email}
              avatarUrl={account.avatarUrl}
              size={36}
            />
          </span>
          <Link
            className={styles.personName}
            href={accountHref(account.userId)}
          >
            {account.fullName || account.email}
            {account.userId === currentUser?.userId && (
              <span className={styles.selfLabel}>You</span>
            )}
          </Link>
        </div>
      ),
    },
    { id: "email", header: l.email, sortable: true },
    {
      id: "role",
      header: l.role,
      sortable: true,
      cell: (account) => <RoleChip role={account.role} />,
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
      <div className={styles.directory}>
        <Card
          title={l.users}
          hint="Find an account, review its status, or manage staff access."
          actions={
            <button
              type="button"
              className="btn"
              onClick={() => {
                setNotice(null);
                query.setValues({ create: "1" });
              }}
            >
              <Plus size={16} aria-hidden="true" />
              {l.staffCreate}
            </button>
          }
        >
          <div
            className={styles.directoryFilters}
            role="search"
            aria-label="Filter accounts"
          >
            <Field label="Search name or email">
              <span className={styles.filterSearch}>
                <Search size={18} aria-hidden="true" />
                <Input
                  name="keyword"
                  type="search"
                  placeholder="Name or email"
                  autoComplete="off"
                  value={keyword}
                  onChange={(event) =>
                    updateFilters({ keyword: event.target.value })
                  }
                />
              </span>
            </Field>
            <Field label={l.role}>
              <Select
                name="role"
                value={role}
                options={[
                  { value: "", label: "All roles" },
                  ...accountRoles.map((value) => ({
                    value,
                    label: roleLabels[value],
                  })),
                ]}
                onChange={(event) =>
                  updateFilters({ role: event.target.value })
                }
              />
            </Field>
            <Field label={l.accountState}>
              <Select
                name="status"
                value={invitationFilter ? "ACTIVE" : status}
                options={[
                  { value: "", label: "All statuses" },
                  ...accountStatuses.map((value) => ({
                    value,
                    label: statusLabels[value],
                  })),
                ]}
                onChange={(event) =>
                  updateFilters({ status: event.target.value })
                }
              />
            </Field>
            <button
              type="button"
              className={styles.filterClear}
              aria-label={`${t.dataTable.clearFilters}${activeCount ? ` (${activeCount})` : ""}`}
              title={t.dataTable.clearFilters}
              disabled={activeCount === 0}
              onClick={clearFilters}
            >
              <Trash2 size={18} aria-hidden="true" />
              <span className={styles.filterClearLabel}>
                {t.dataTable.clearFilters}
              </span>
            </button>
            {invitationFilter && (
              <div className={styles.invitationFilter}>
                <span>
                  Invitations:{" "}
                  {status === "ACTIVATION_EXPIRING"
                    ? t.adminWork.expiringActivation
                    : t.adminWork.pendingActivation}
                </span>
                <button
                  type="button"
                  aria-label="Clear invitation filter"
                  title="Clear invitation filter"
                  onClick={() => updateFilters({ status: "ACTIVE" })}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
          <div
            className={styles.resultsHeading}
            aria-live="polite"
            aria-atomic="true"
          >
            <span>
              {state.loading
                ? "Loading accounts…"
                : state.data
                  ? `${state.data.totalCount.toLocaleString()} accounts${activeCount ? " matching your filters" : " in the directory"}`
                  : "Account directory"}
            </span>
            <span>Manage access controls coach specialties and account status.</span>
          </div>
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
              <div className={styles.rowActions}>
                <Link
                  className="btn btn--secondary"
                  href={accountHref(account.userId)}
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
                    {t.adminWork.manageAccess}
                  </button>
                )}
                {requiresStaffActivation(account) && (
                  <button
                    type="button"
                    className={`btn btn--secondary ${styles.moreButton}`}
                    aria-label={`Manage invitation for ${account.fullName || account.email}`}
                    aria-haspopup="dialog"
                    aria-expanded={activationAccount?.userId === account.userId}
                    data-activation-account-id={account.userId}
                    onClick={() => {
                      setActivationBusy(false);
                      setActivationAccount(account);
                    }}
                  >
                    {t.adminWork.manageInvitation}
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
      </div>
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
