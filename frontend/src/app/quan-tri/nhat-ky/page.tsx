"use client";

import { AppShell } from "@/components/AppShell";
import { AuditLogView } from "@/components/AuditLogView";

export default function AdminAuditPage() {
  return (
    <AppShell
      title="Nhật ký thao tác"
      description="Đối chiếu các thao tác quản trị, gồm khóa và mở khóa tài khoản (BR-6, BR-7)"
      allow={["SystemAdministrator"]}
    >
      <AuditLogView />
    </AppShell>
  );
}
