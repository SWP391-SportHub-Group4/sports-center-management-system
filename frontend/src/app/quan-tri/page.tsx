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
 * để ❌ cho báo cáo doanh thu và cấu hình hệ thống. Vì vậy trang này cố tình không có số liệu
 * doanh thu hay nghiệp vụ nào khác.
 */
export default function AdminDashboardPage() {
  const all = useApi(
    (signal) => api.get<Paged<UserAdminDto>>("/api/users/admin", { signal, query: { pageSize: 1 } }),
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
      title="Quản trị hệ thống"
      description="Tài khoản, vai trò và nhật ký thao tác"
      allow={["SystemAdministrator"]}
    >
      <div className="grid grid--stats">
        <Stat label="Tổng tài khoản" value={all.data?.totalCount ?? 0} />
        <Stat label="Tài khoản bị khóa" value={locked.data?.totalCount ?? 0} />
        <Stat label="Tài khoản ngừng hoạt động" value={deactivated.data?.totalCount ?? 0} />
      </div>

      <div className="row">
        <Link className="btn" href="/quan-tri/nguoi-dung">
          Quản lý tài khoản & vai trò
        </Link>
        <Link className="btn btn--ghost" href="/quan-tri/nhat-ky">
          Nhật ký thao tác
        </Link>
      </div>

      <Card title="Phạm vi quyền của vai trò này">
        <div className="alert alert--info">
          Theo BR-2 và BR-6, Quản trị hệ thống là vai trò duy nhất được tạo tài khoản nhân sự,
          gán hoặc đổi vai trò, và khóa hoặc mở khóa tài khoản. Mọi thao tác đều được ghi nhật
          ký kèm lý do (BR-7).
        </div>
        <p className="small muted">
          Các quyền nghiệp vụ khác — xem báo cáo doanh thu, cấu hình hệ thống, quản lý lớp học —
          <strong> chưa được Business Rules chốt cho vai trò này</strong> (SSOT §7, Open
          Questions) nên hiện không được cấp. Đây là lựa chọn giữ nguyên hiện trạng chờ quyết
          định, không phải thiếu sót triển khai.
        </p>
      </Card>
    </AppShell>
  );
}
