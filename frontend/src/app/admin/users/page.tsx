"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AsyncSection, Card, Dialog, Feedback, Field, Pager, StatusChip, Table } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { formatDate, label } from "@/lib/format";
import { useAction, useApi } from "@/lib/useApi";
import { ROLE_LABEL, useAuth, type Role } from "@/lib/auth";
import type { Paged, UserAdminDto } from "@/lib/types";

const STAFF_ROLES: Role[] = ["CenterManager", "Coach", "Receptionist", "SystemAdministrator"];
const ALL_ROLES: Role[] = [...STAFF_ROLES, "Member"];

/**
 * Quản trị tài khoản — BR-2 (chỉ Quản trị hệ thống tạo tài khoản nhân sự và gán/đổi vai trò),
 * BR-6 (chỉ vai trò này khóa/mở khóa; không tự khóa mình; không khóa Quản trị hệ thống hoạt
 * động cuối cùng), BR-7 (mọi thao tác ghi nhật ký kèm lý do).
 *
 * Tài khoản Hội viên KHÔNG tạo được ở đây: BR-1 quy định hội viên tự đăng ký.
 */
export default function UserAdminPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    email: "",
    password: "",
    fullName: "",
    phone: "",
    role: "Receptionist" as Role,
  });

  const [statusTarget, setStatusTarget] = useState<{
    account: UserAdminDto;
    action: "lock" | "unlock" | "deactivate";
  } | null>(null);
  const [roleTarget, setRoleTarget] = useState<UserAdminDto | null>(null);
  const [reason, setReason] = useState("");
  const [nextRole, setNextRole] = useState<Role>("Coach");

  const action = useAction();

  const users = useApi(
    (signal) =>
      api.get<Paged<UserAdminDto>>("/api/users/admin", {
        signal,
        query: {
          page,
          pageSize: 20,
          keyword: keyword || undefined,
          role: roleFilter || undefined,
          status: statusFilter || undefined,
        },
      }),
    [page, keyword, roleFilter, statusFilter],
  );

  const createStaff = async (event: React.FormEvent) => {
    event.preventDefault();

    const done = await action.run(
      () =>
        api.post("/api/users", {
          email: createForm.email.trim(),
          password: createForm.password,
          fullName: createForm.fullName.trim(),
          phone: createForm.phone.trim() || null,
          role: createForm.role,
        }),
      "The personnel account has been created.",
    );

    if (done !== null) {
      setCreateOpen(false);
      setCreateForm({ email: "", password: "", fullName: "", phone: "", role: "Receptionist" });
      users.reload();
    }
  };

  const changeStatus = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!statusTarget) return;

    const done = await action.run(
      () =>
        api.post(`/api/users/${statusTarget.account.userId}/${statusTarget.action}`, {
          reason: reason.trim(),
        }),
      "Synchronising \"%s\"",
    );

    if (done !== null) {
      setStatusTarget(null);
      setReason("");
      users.reload();
    }
  };

  const changeRole = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!roleTarget) return;

    const done = await action.run(
      () =>
        api.put(`/api/users/${roleTarget.userId}/role`, {
          role: nextRole,
          reason: reason.trim(),
        }),
      "The role has been changed.",
    );

    if (done !== null) {
      setRoleTarget(null);
      setReason("");
      users.reload();
    }
  };

  return (
    <AppShell
      title="& Role Accounts"
      description="Create personnel accounts, assign roles, lock and unlock (BR-2, BR-6, BR-7)"
      allow={["SystemAdministrator"]}
    >
      <Card
        title="Filter"
        actions={
          <button
            type="button"
            className="btn"
            onClick={() => {
              action.reset();
              setCreateOpen(true);
            }}
          >
            Create personnel account
          </button>
        }
      >
        <div className="form form--inline">
          <Field label="Schedule">
            <input
              value={keyword}
              placeholder="Email, surname or phone number"
              onChange={(event) => {
                setPage(1);
                setKeyword(event.target.value);
              }}
            />
          </Field>
          <Field label="Role">
            <select
              value={roleFilter}
              onChange={(event) => {
                setPage(1);
                setRoleFilter(event.target.value);
              }}
            >
              <option value="">All</option>
              {ALL_ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABEL[role]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select
              value={statusFilter}
              onChange={(event) => {
                setPage(1);
                setStatusFilter(event.target.value);
              }}
            >
              <option value="">All</option>
              {["Active", "Banned", "Deactivated"].map((value) => (
                <option key={value} value={value}>
                  {label(value)}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div style={{ marginTop: 12 }}>
          <Feedback error={action.error} success={action.success} />
        </div>
      </Card>

      <Card title="Accounts" bodyless>
        <AsyncSection
          state={users}
          emptyMessage="No account matches the filter."
          isEmpty={(data) => data.items.length === 0}
        >
          {(data) => (
            <>
              <Table
                headers={["Accounts", "Role", "Status", "Logon", "Create Time", ""]}
              >
                {data.items.map((account) => {
                  const isSelf = account.userId === user?.userId;

                  return (
                    <tr key={account.userId}>
                      <td>
                        <strong>{account.fullName || account.email}</strong>
                        <div className="small muted">
                          {account.email}
                          {account.phone ? ` · ${account.phone}` : ""}
                        </div>
                      </td>
                      <td>{ROLE_LABEL[account.role as Role] ?? account.role}</td>
                      <td>
                        <StatusChip value={account.status} />
                        {isSelf && <div className="small muted">Your Account</div>}
                      </td>
                      <td className="small">
                        {account.hasPassword ? "Password" : "—"}
                        {account.hasGoogleLink ? " · Google" : ""}
                      </td>
                      <td className="nowrap small">{formatDate(account.createdAt)}</td>
                      <td className="right">
                        <div className="btn-row" style={{ justifyContent: "flex-end" }}>
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => {
                              action.reset();
                              setReason("");
                              setNextRole(account.role as Role);
                              setRoleTarget(account);
                            }}
                          >
                            Change of Role
                          </button>

                          {account.status === "Active" ? (
                            <button
                              type="button"
                              className="btn btn--danger btn--sm"
                              // BR-6: không tự khóa tài khoản của chính mình. Backend cũng
                              // từ chối bằng 403 nếu cố gọi thẳng API.
                              disabled={isSelf}
                              title={isSelf ? "Don't lock your own account (BR-6)" : undefined}
                              onClick={() => {
                                action.reset();
                                setReason("");
                                setStatusTarget({ account, action: "lock" });
                              }}
                            >
                              Lock
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn--sm"
                              onClick={() => {
                                action.reset();
                                setReason("");
                                setStatusTarget({ account, action: "unlock" });
                              }}
                            >
                              Open
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </Table>

              <div style={{ padding: "0 18px 14px" }}>
                <Pager
                  page={data.page}
                  pageSize={data.pageSize}
                  totalCount={data.totalCount}
                  onChange={setPage}
                />
              </div>
            </>
          )}
        </AsyncSection>
      </Card>

      {createOpen && (
        <Dialog
          title="Create personnel account"
          onClose={() => setCreateOpen(false)}
          footer={
            <>
              <button type="button" className="btn btn--ghost" onClick={() => setCreateOpen(false)}>
                Abort
              </button>
              <button type="submit" form="create-staff-form" className="btn" disabled={action.busy}>
                Create Account
              </button>
            </>
          }
        >
          <form id="create-staff-form" className="form" onSubmit={createStaff}>
            <div className="alert alert--info">
              Only manages management accounts, coaches, receptions and system administrators. The Fellow Accounts Must be Registered by themselves (BR-1).
            </div>

            <Field label="First name">
              <input
                value={createForm.fullName}
                required
                onChange={(event) =>
                  setCreateForm({ ...createForm, fullName: event.target.value })
                }
              />
            </Field>

            <Field label="Email">
              <input
                type="email"
                value={createForm.email}
                required
                onChange={(event) => setCreateForm({ ...createForm, email: event.target.value })}
              />
            </Field>

            <Field label="Initial Password" hint="Eight characters minimum.">
              <input
                type="password"
                value={createForm.password}
                minLength={8}
                required
                onChange={(event) =>
                  setCreateForm({ ...createForm, password: event.target.value })
                }
              />
            </Field>

            <Field label="Phone number (non-commissioned)">
              <input
                value={createForm.phone}
                onChange={(event) => setCreateForm({ ...createForm, phone: event.target.value })}
              />
            </Field>

            <Field label="Role">
              <select
                value={createForm.role}
                onChange={(event) =>
                  setCreateForm({ ...createForm, role: event.target.value as Role })
                }
              >
                {STAFF_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABEL[role]}
                  </option>
                ))}
              </select>
            </Field>

            <Feedback error={action.error} success={null} />
          </form>
        </Dialog>
      )}

      {statusTarget && (
        <Dialog
          title={
            statusTarget.action === "lock"
              ? `Lock account — ${statusTarget.account.email}`
              : `Unlock account — ${statusTarget.account.email}`
          }
          onClose={() => setStatusTarget(null)}
          footer={
            <>
              <button type="button" className="btn btn--ghost" onClick={() => setStatusTarget(null)}>
                Abort
              </button>
              <button
                type="submit"
                form="status-form"
                className={`btn ${statusTarget.action === "lock" ? "btn--danger" : ""}`}
                disabled={action.busy}
              >
                Confirmation
              </button>
            </>
          }
        >
          <form id="status-form" className="form" onSubmit={changeStatus}>
            <div className="alert alert--warn">
              {statusTarget.action === "lock"
                ? "The locked account will not be able to log in and the used token will be blocked in the next refust (BR-6)."
                : "Opening allows re-listing accounts; old-term Token will be reuseable."}
            </div>

            <Field label="Reasons (requiring — BR-7 requires writing reasons when locking/opening locks)">
              <input
                value={reason}
                required
                minLength={3}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>

            <Feedback error={action.error} success={null} />
          </form>
        </Dialog>
      )}

      {roleTarget && (
        <Dialog
          title={`Change role — ${roleTarget.email}`}
          onClose={() => setRoleTarget(null)}
          footer={
            <>
              <button type="button" className="btn btn--ghost" onClick={() => setRoleTarget(null)}>
                Abort
              </button>
              <button type="submit" form="role-form" className="btn" disabled={action.busy}>
                Change of Role
              </button>
            </>
          }
        >
          <form id="role-form" className="form" onSubmit={changeRole}>
            <div className="alert alert--warn">
              Each account has the right role (BR-3). Token The current user will be rejected in the next refust and they must log in for new rights.
            </div>

            <Field label="New Role">
              <select
                value={nextRole}
                onChange={(event) => setNextRole(event.target.value as Role)}
              >
                {ALL_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABEL[role]}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Reasons (recommended, written in journals)">
              <input
                value={reason}
                required
                minLength={3}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>

            <Feedback error={action.error} success={null} />
          </form>
        </Dialog>
      )}
    </AppShell>
  );
}
