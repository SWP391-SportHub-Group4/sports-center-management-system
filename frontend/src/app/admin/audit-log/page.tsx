"use client";
import { AppShell } from "@/components/AppShell";
import { AuditLogView } from "@/components/AuditLogView";
import { useLanguage } from "@/lib/language";
export default function Page() { const { t } = useLanguage(); return <AppShell title={t.staffWork.adminAudit} allow={["SystemAdministrator"]} operationalLayout><AuditLogView accountsOnly/></AppShell>; }
