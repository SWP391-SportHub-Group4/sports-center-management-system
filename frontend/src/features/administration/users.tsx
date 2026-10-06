"use client";
import { PasswordInput } from "@/components/primitives";
import { useState } from "react";
import { Card, Field } from "@/components/ui";
import { ApiTable, FilterBar, StatusChip, type FilterField, type TableColumn } from "@/components/data";
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
const staffRoles = ["CENTER_MANAGER", "COACH", "RECEPTIONIST", "SYSTEM_ADMINISTRATOR"];
const accountRoles = [...staffRoles, "MEMBER", "EXTERNAL_COACH"];
const accountStatuses = ["ACTIVE", "BANNED", "DEACTIVATED"];
const accountStatusTones: Partial<Record<string, StatusTone>> = {
  ACTIVE: "success",
  BANNED: "danger",
  DEACTIVATED: "neutral",
};
const userQueryDefaults = { keyword: "", role: "", status: "", page: "1", sortBy: "email", sortDirection: "asc" };
const userQueryValidators = {
  page: pageQuery,
  role: choiceQuery(["", ...accountRoles], ""),
  status: choiceQuery(["", ...accountStatuses], ""),
  sortBy: choiceQuery(["fullName", "email", "role", "status"], "email"),
  sortDirection: choiceQuery(["asc", "desc"], "asc"),
};
function RoleSelect({ value, onChange, member = false }: { value: string; onChange: (value: string) => void; member?: boolean }) { const { t } = useLanguage(); return <Field label={t.staffWork.role}><select value={value} onChange={e => onChange(e.target.value)}>{[...staffRoles, ...(member ? ["MEMBER"] : [])].map(r => <option key={r} value={r}>{t.wireStatus[r as keyof typeof t.wireStatus] ?? r}</option>)}</select></Field>; }
function SportSelect({ value, onChange }: { value: number[]; onChange: (value: number[]) => void }) {
  const state = useApi(signal => api.get<SportDto[]>("/api/sports", { signal }), []);
  return <SportOptions state={state} value={value} onChange={onChange} />;
}
function CreateStaff({ reload }: { reload: () => void }) {
  const { t } = useLanguage();
  const l = t.staffWork;
  const mutation = useMutation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("RECEPTIONIST");
  const [sports, setSports] = useState<number[]>([]);
  const fieldClass = `form-grid__row ${styles.halfField}`;

  return (
    <Card title={l.staffCreate}>
      <form className={`form ${styles.createForm}`} onSubmit={async event => {
        event.preventDefault();
        if (await mutation.run(() => api.post("/api/users", {
          email: email.trim(), password, fullName: name.trim(), phone: phone.trim() || null,
          role, sportIds: role === "COACH" ? sports : [],
        }))) {
          setPassword("");
          setConfirm("");
          reload();
        }
      }}>
        <div className="form-grid">
          <div className={fieldClass}>
            <Field label={l.email} required>
              <input type="email" required autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} />
            </Field>
          </div>
          <div className={fieldClass}>
            <Field label={l.fullName} required>
              <input required autoComplete="name" value={name} onChange={event => setName(event.target.value)} />
            </Field>
          </div>
          <div className={fieldClass}>
            <Field label={l.phone}>
              <input type="tel" autoComplete="tel" value={phone} onChange={event => setPhone(event.target.value)} />
            </Field>
          </div>
          <div className={fieldClass}>
            <RoleSelect value={role} onChange={next => { setRole(next); setSports([]); }} />
          </div>
          <div className={fieldClass}>
            <Field label={l.password} required>
              <PasswordInput required autoComplete="new-password" maxLength={64} value={password} onChange={event => setPassword(event.target.value)} />
            </Field>
          </div>
          <div className={fieldClass}>
            <Field label={l.confirmPassword} required error={confirm && confirm !== password ? l.mismatch : undefined}>
              <PasswordInput required autoComplete="new-password" maxLength={64} value={confirm} onChange={event => setConfirm(event.target.value)} />
            </Field>
          </div>
        </div>
        <PasswordRequirements email={email} password={password} />
        {role === "COACH" && <SportSelect value={sports} onChange={setSports} />}
        <MutationFeedback mutation={mutation} />
        <div className={styles.createActions}>
          <button type="submit" className="btn" disabled={mutation.busy || !passwordChecks(password, email).every(Boolean) || password !== confirm || (role === "COACH" && !sports.length)}>
            {l.staffCreate}
          </button>
        </div>
      </form>
    </Card>
  );
}
function EditUser({ account: a, reload }: { account: UserAdminDto; reload: () => void }) { const { t } = useLanguage(); const l = t.staffWork; const { user, logout } = useAuth(); const [role, setRole] = useState(a.role); const [sports, setSports] = useState(a.sportIds); const [reason, setReason] = useState(""); const mutation = useMutation(); async function action(name: string) { const ok = await mutation.run(() => name === "role" ? api.put(`/api/users/${a.userId}/role`, { role, reason: reason.trim(), sportIds: role === "COACH" ? sports : [] }) : api.post(`/api/users/${a.userId}/${name}`, { reason: reason.trim() })); if (ok) { if (name === "role" && a.userId === user?.userId) logout(); reload(); } }
 return <Card title={`${a.fullName} · ${a.email}`}><Field label={l.reason}><textarea required minLength={3} maxLength={500} value={reason} onChange={e => setReason(e.target.value)}/></Field>{a.role !== "EXTERNAL_COACH" && <><RoleSelect member value={role} onChange={r => { setRole(r); setSports([]); }}/>{role === "COACH" && <SportSelect value={sports} onChange={setSports}/>}<button className="btn" disabled={mutation.busy || reason.trim().length < 3 || (role === "COACH" && !sports.length) || role === a.role} onClick={() => action("role")}>{l.changeRole}</button></>}<div className="btn-row">{a.userId !== user?.userId && <>{a.status !== "BANNED" && <button className="btn btn--danger" disabled={mutation.busy || reason.trim().length < 3} onClick={() => action("lock")}>{l.lock}</button>}{a.status !== "ACTIVE" && <button className="btn btn--secondary" disabled={mutation.busy || reason.trim().length < 3} onClick={() => action("unlock")}>{l.unlock}</button>}{a.status !== "DEACTIVATED" && <button className="btn btn--secondary" disabled={mutation.busy || reason.trim().length < 3} onClick={() => action("deactivate")}>{l.deactivate}</button>}</>}</div><MutationFeedback mutation={mutation}/></Card>;
}
export function Users() {
  const { t } = useLanguage();
  const l = t.staffWork;
  const query = useUrlQuery(userQueryDefaults, userQueryValidators);
  const { keyword, role, status } = query.values;
  const page = Number(query.values.page);
  const sort = { columnId: query.values.sortBy, direction: query.values.sortDirection as SortDirection };
  const [selected, setSelected] = useState<UserAdminDto | null>(null);
  const [create, setCreate] = useState(false);
  const state = useApi(signal => api.get<Paged<UserAdminDto>>("/api/users/admin", {
    signal, query: { page, pageSize: 20, keyword, role, status, sortBy: sort.columnId, sortDirection: sort.direction },
  }), [page, keyword, role, status, sort.columnId, sort.direction]);
  const roleLabels: Record<string, string> = {
    CENTER_MANAGER: t.navigation.roleLabel.CenterManager, COACH: t.navigation.roleLabel.Coach,
    RECEPTIONIST: t.navigation.roleLabel.Receptionist, SYSTEM_ADMINISTRATOR: t.navigation.roleLabel.SystemAdministrator,
    MEMBER: t.navigation.roleLabel.Member, EXTERNAL_COACH: t.navigation.roleLabel.ExternalCoach,
  };
  const statusLabels: Record<string, string> = {
    ACTIVE: l.accountActive,
    BANNED: l.accountLocked,
    DEACTIVATED: l.accountDeactivated,
  };
  const fields: FilterField[] = [
    { id: "keyword", label: l.keyword, kind: "search" },
    { id: "role", label: l.role, kind: "select", options: [{ value: "", label: l.all }, ...accountRoles.map(value => ({ value, label: roleLabels[value] }))] },
    { id: "status", label: l.accountState, kind: "select", options: [{ value: "", label: l.all }, ...accountStatuses.map(value => ({ value, label: statusLabels[value] }))] },
  ];
  const activeCount = [keyword, role, status].filter(Boolean).length;
  const clearFilters = () => { query.setValues({ keyword: "", role: "", status: "", page: "1" }); setSelected(null); };
  const columns: TableColumn<UserAdminDto>[] = [
    { id: "fullName", header: l.fullName, sortable: true, rowHeader: true },
    { id: "email", header: l.email, sortable: true },
    { id: "role", header: l.role, sortable: true, cell: account => <StatusChip value={account.role} /> },
    { id: "status", header: l.status, sortable: true, cell: account => <StatusChip value={account.status} tone={accountStatusTones[account.status]} label={statusLabels[account.status]} /> },
  ];
  const reload = () => { setSelected(null); state.reload(); };
  return <>
    <Card title={l.users}>
      <FilterBar fields={fields} values={{ keyword, role, status }} activeCount={activeCount}
        onChange={next => { query.setValues({ ...next, page: "1" }, { replace: next.keyword !== keyword }); setSelected(null); }}
        onReset={clearFilters}
        actions={<button type="button" className="btn" onClick={() => setCreate(!create)}>{l.staffCreate}</button>}
      />
      <ApiTable
        caption={l.users} columns={columns} state={state} getRowId={account => account.userId}
        page={page} pageSize={20} onPageChange={next => { query.setValues({ page: String(next) }); setSelected(null); }}
        sort={sort} onSortChange={next => { query.setValues({ sortBy: next.columnId, sortDirection: next.direction, page: "1" }); setSelected(null); }}
        rowActions={account => <button type="button" className="btn btn--secondary" onClick={() => setSelected(account)}>{l.edit}</button>}
        empty={{ title: t.common.noData, hint: activeCount ? t.dataTable.emptyHint : l.accountHint }}
      />
    </Card>
    {create && <CreateStaff reload={reload} />}
    {selected && <EditUser key={selected.userId} account={selected} reload={reload} />}
  </>;
}
