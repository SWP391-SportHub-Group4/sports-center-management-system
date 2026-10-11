"use client";
import { PasswordInput } from "@/components/primitives";
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
import type { SortDirection, StatusTone } from "@/components/contracts/table";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { choiceQuery, pageQuery, useUrlQuery } from "@/lib/useUrlQuery";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
import { MutationFeedback, useMutation } from "@/features/operations";
import { PasswordRequirements, passwordChecks } from "@/features/identity";
import type { SportDto, Paged, UserAdminDto } from "@/lib/types";
import { SportOptions } from "./SportOptions";
import styles from "./users.module.css";
const staffRoles = [
  "CENTER_MANAGER",
  "COACH",
  "RECEPTIONIST",
  "SYSTEM_ADMINISTRATOR",
];
const creationRoles = staffRoles.filter((role) => role !== "COACH");
const accountRoles = [...staffRoles, "MEMBER"];
const accountStatuses = ["ACTIVE", "BANNED", "DEACTIVATED"];
const accountStatusTones: Partial<Record<string, StatusTone>> = {
  ACTIVE: "success",
  BANNED: "danger",
  DEACTIVATED: "neutral",
};
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
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("RECEPTIONIST");
  const [review, setReview] = useState(false);
  const fieldClass = `form-grid__row ${styles.halfField}`;

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
          if (!review) {
            setReview(true);
            return;
          }
          if (
            await mutation.run(() =>
              api.post("/api/users", {
                email: email.trim(),
                password,
                fullName: name.trim(),
                phone: phone.trim() || null,
                role,
                sportIds: [],
              }),
            )
          ) {
            setPassword("");
            setConfirm("");
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
              <Field label={l.phone}>
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
            <div className={fieldClass}>
              <Field label={l.password} required>
                <PasswordInput
                  required
                  autoComplete="new-password"
                  maxLength={64}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </Field>
            </div>
            <div className={fieldClass}>
              <Field
                label={l.confirmPassword}
                required
                error={confirm && confirm !== password ? l.mismatch : undefined}
              >
                <PasswordInput
                  required
                  autoComplete="new-password"
                  maxLength={64}
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                />
              </Field>
            </div>
          </div>
          <PasswordRequirements email={email} password={password} />
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
            disabled={
              mutation.busy ||
              !passwordChecks(password, email).every(Boolean) ||
              password !== confirm
            }
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
  const { user, logout } = useAuth();
  const [role, setRole] = useState(a.role);
  const [sports, setSports] = useState(a.sportIds);
  const [reason, setReason] = useState("");
  const [review, setReview] = useState<AccountAction | null>(null);
  const mutation = useMutation();
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
      ? a.userId === user?.userId
        ? d.selfRoleImpact
        : d.roleImpact
      : review === "lock"
        ? d.lockImpact
        : review === "unlock"
          ? d.unlockImpact
          : d.deactivateImpact;
  async function confirmAction() {
    if (!review || !validReason) return;
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
      if (review === "role" && a.userId === user?.userId) logout();
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
            <StatusChip
              value={a.status}
              tone={accountStatusTones[a.status]}
              label={statusLabels[a.status]}
            />
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
              <RoleSelect
                member
                value={role}
                onChange={(r) => {
                  setRole(r);
                  setSports([]);
                }}
              />
              {role === "COACH" && (
                <SportSelect value={sports} onChange={setSports} />
              )}
              <button
                type="button"
                className="btn"
                disabled={
                  !validReason ||
                  role === a.role ||
                  (role === "COACH" && !sports.length)
                }
                onClick={() => setReview("role")}
              >
                {l.changeRole}
              </button>
            </>
            {a.userId !== user?.userId && (
              <div className="btn-row">
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
                    ? l.changeRole
                    : review === "lock"
                      ? l.lock
                      : review === "unlock"
                        ? l.unlock
                        : l.deactivate}
                </dd>
              </div>
              {review === "role" ? (
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
                  {role === "COACH" && (
                    <div>
                      <dt>{l.specialties}</dt>
                      <dd>
                        {d.specialtyCount.replace(
                          "{count}",
                          String(sports.length),
                        )}
                      </dd>
                    </div>
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
            <MutationFeedback mutation={mutation} />
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
                {mutation.busy ? t.common.loading : l.confirm}
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
  const l = t.staffWork;
  const query = useUrlQuery(userQueryDefaults, userQueryValidators);
  const { keyword, role, status } = query.values;
  const page = Number(query.values.page);
  const sort = {
    columnId: query.values.sortBy,
    direction: query.values.sortDirection as SortDirection,
  };
  const [selected, setSelected] = useState<UserAdminDto | null>(null);
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
          label: statusLabels[value],
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
      cell: (account) => (
        <StatusChip
          value={account.status}
          tone={accountStatusTones[account.status]}
          label={statusLabels[account.status]}
        />
      ),
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
            <>
              <Link
                className="btn btn--secondary"
                href={`/admin/users/${account.userId}`}
              >
                {t.adminWork.viewDetail}
              </Link>
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
            </>
          )}
          empty={{
            title: t.common.noData,
            hint: activeCount ? t.dataTable.emptyHint : l.accountHint,
          }}
        />
      </Card>
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
