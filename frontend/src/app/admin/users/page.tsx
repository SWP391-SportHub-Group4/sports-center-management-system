"use client";
import { AppShell } from "@/components/AppShell";
import { Users } from "@/features/administration/users";
import { useLanguage } from "@/lib/language";
export default function Page() { const { t } = useLanguage(); return <AppShell title={t.staffWork.users} allow={["SystemAdministrator"]} operationalLayout><div className="stack"><Users/></div></AppShell>; }
