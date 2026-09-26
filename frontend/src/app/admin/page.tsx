"use client";

import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Card, Stat } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import type { Paged, UserAdminDto } from "@/lib/types";

/**
 * Trang chủ của Quản trị hệ thống.
 *
 * Phạm vi quyền của vai trò này ngoài BR-2 (tạo tài khoản nhân sự, gán vai trò) và BR-6
 * (khóa/mở khóa) CHƯA được Business Rules chốt — SSOT §7 để ngỏ, và ma trận RBAC hiện hành
 * để không có quyền cho báo cáo doanh thu và cấu hình hệ thống. Vì vậy trang này cố tình không có số liệu
 * doanh thu hay nghiệp vụ nào khác.
 */
export default function AdminDashboardPage() {
  const all = useApi(
    (signal) =>
      api.get<Paged<UserAdminDto>>("/api/users/admin", {
        signal,
        query: { pageSize: 1 },
      }),
    [],
  );

  const locked = useApi(
    (signal) =>
      api.get<Paged<UserAdminDto>>("/api/users/admin", {
        signal,
        query: { status: "Banned", pageSize: 1 },
      }),
    [],
  );

  const deactivated = useApi(
    (signal) =>
      api.get<Paged<UserAdminDto>>("/api/users/admin", {
        signal,
        query: { status: "Deactivated", pageSize: 1 },
      }),
    [],
  );

  return (
    <AppShell
      title="System administrator"
      description="Accounts, Roles, and Operation Diaries"
      allow={["SystemAdministrator"]}
    >
      <div className="grid grid--stats">
        <Stat label="Account Total" value={all.data?.totalCount ?? 0} />
        <Stat
          label="The account is locked"
          value={locked.data?.totalCount ?? 0}
        />
        <Stat
          label="Disabled Accounts"
          value={deactivated.data?.totalCount ?? 0}
        />
      </div>

      <div className="row">
        <Link className="btn" href="/admin/users">
          Manage accounts & roles
        </Link>
        <Link className="btn btn--ghost" href="/admin/audit-log">
          Operations Register
        </Link>
      </div>

      <Card title="The Range of the Role">
        <div className="alert alert--info">
          According to BR-2 and BR-6, system administrator is the only role
          created by personnel account, attach or change roles, and lock or
          unlock accounts. All operations are included in the reason logs
          (BR-7).
        </div>
        <p className="small muted">
          Other rights of occupation — see sales reports, system configurations,
          class management —
          <strong> Not yet Business Rules key for this role</strong>{" "}
          (SSOTCREAD7, Open Questions) This is not available at the moment. This
          is the option to maintain the status of the decision, not the
          development defect.
        </p>
      </Card>
    </AppShell>
  );
}
