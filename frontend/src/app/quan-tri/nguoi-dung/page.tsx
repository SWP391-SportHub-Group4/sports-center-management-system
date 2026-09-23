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
      "Đã tạo tài khoản nhân sự.",
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
      "Đã cập nhật trạng thái tài khoản.",
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
      "Đã đổi vai trò.",
    );

    if (done !== null) {
      setRoleTarget(null);
      setReason("");
      users.reload();
    }
  };

  return (
    <AppShell
      title="Tài khoản & vai trò"
      description="Tạo tài khoản nhân sự, gán vai trò, khóa và mở khóa (BR-2, BR-6, BR-7)"
      allow={["SystemAdministrator"]}
    >
      <Card
        title="Bộ lọc"
        actions={
          <button
            type="button"
            className="btn"
            onClick={() => {
              action.reset();
              setCreateOpen(true);
            }}
          >
            Tạo tài khoản nhân sự
          </button>
        }
      >
        <div className="form form--inline">
          <Field label="Tìm kiếm">
            <input
              value={keyword}
              placeholder="Email, họ tên hoặc số điện thoại"
              onChange={(event) => {
                setPage(1);
                setKeyword(event.target.value);
              }}
            />
          </Field>
          <Field label="Vai trò">
            <select
              value={roleFilter}
              onChange={(event) => {
                setPage(1);
                setRoleFilter(event.target.value);
              }}
            >
              <option value="">Tất cả</option>
              {ALL_ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABEL[role]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Trạng thái">
            <select
              value={statusFilter}
              onChange={(event) => {
                setPage(1);
                setStatusFilter(event.target.value);
              }}
            >
              <option value="">Tất cả</option>
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

      <Card title="Tài khoản" bodyless>
        <AsyncSection
          state={users}
          emptyMessage="Không có tài khoản nào khớp bộ lọc."
          isEmpty={(data) => data.items.length === 0}
        >
          {(data) => (
            <>
              <Table
                headers={["Tài khoản", "Vai trò", "Trạng thái", "Đăng nhập", "Tạo lúc", ""]}
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
                        {isSelf && <div className="small muted">Tài khoản của bạn</div>}
                      </td>
                      <td className="small">
                        {account.hasPassword ? "Mật khẩu" : "—"}
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
                            Đổi vai trò
                          </button>

                          {account.status === "Active" ? (
                            <button
                              type="button"
                              className="btn btn--danger btn--sm"
                              // BR-6: không tự khóa tài khoản của chính mình. Backend cũng
                              // từ chối bằng 403 nếu cố gọi thẳng API.
                              disabled={isSelf}
                              title={isSelf ? "Không được tự khóa tài khoản của mình (BR-6)" : undefined}
                              onClick={() => {
                                action.reset();
                                setReason("");
                                setStatusTarget({ account, action: "lock" });
                              }}
                            >
                              Khóa
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
                              Mở khóa
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
          title="Tạo tài khoản nhân sự"
          onClose={() => setCreateOpen(false)}
          footer={
            <>
              <button type="button" className="btn btn--ghost" onClick={() => setCreateOpen(false)}>
                Hủy
              </button>
              <button type="submit" form="create-staff-form" className="btn" disabled={action.busy}>
                Tạo tài khoản
              </button>
            </>
          }
        >
          <form id="create-staff-form" className="form" onSubmit={createStaff}>
            <div className="alert alert--info">
              Chỉ tạo được tài khoản Quản lý, Huấn luyện viên, Lễ tân và Quản trị hệ thống.
              Tài khoản Hội viên phải do chính họ đăng ký (BR-1).
            </div>

            <Field label="Họ và tên">
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

            <Field label="Mật khẩu ban đầu" hint="Tối thiểu 8 ký tự.">
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

            <Field label="Số điện thoại (không bắt buộc)">
              <input
                value={createForm.phone}
                onChange={(event) => setCreateForm({ ...createForm, phone: event.target.value })}
              />
            </Field>

            <Field label="Vai trò">
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
              ? `Khóa tài khoản — ${statusTarget.account.email}`
              : `Mở khóa tài khoản — ${statusTarget.account.email}`
          }
          onClose={() => setStatusTarget(null)}
          footer={
            <>
              <button type="button" className="btn btn--ghost" onClick={() => setStatusTarget(null)}>
                Hủy
              </button>
              <button
                type="submit"
                form="status-form"
                className={`btn ${statusTarget.action === "lock" ? "btn--danger" : ""}`}
                disabled={action.busy}
              >
                Xác nhận
              </button>
            </>
          }
        >
          <form id="status-form" className="form" onSubmit={changeStatus}>
            <div className="alert alert--warn">
              {statusTarget.action === "lock"
                ? "Tài khoản bị khóa sẽ không đăng nhập được và token đang dùng sẽ bị chặn ở request kế tiếp (BR-6)."
                : "Mở khóa cho phép tài khoản đăng nhập lại; token cũ còn hạn sẽ dùng lại được."}
            </div>

            <Field label="Lý do (bắt buộc — BR-7 yêu cầu ghi lý do khi khóa/mở khóa)">
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
          title={`Đổi vai trò — ${roleTarget.email}`}
          onClose={() => setRoleTarget(null)}
          footer={
            <>
              <button type="button" className="btn btn--ghost" onClick={() => setRoleTarget(null)}>
                Hủy
              </button>
              <button type="submit" form="role-form" className="btn" disabled={action.busy}>
                Đổi vai trò
              </button>
            </>
          }
        >
          <form id="role-form" className="form" onSubmit={changeRole}>
            <div className="alert alert--warn">
              Mỗi tài khoản có đúng một vai trò (BR-3). Token hiện tại của người dùng sẽ bị từ
              chối ngay ở request kế tiếp và họ phải đăng nhập lại để nhận quyền mới.
            </div>

            <Field label="Vai trò mới">
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

            <Field label="Lý do (bắt buộc, ghi vào nhật ký)">
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
