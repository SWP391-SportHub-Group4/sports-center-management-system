"use client";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui";
import { useLanguage } from "@/lib/language";
export default function Page() { const { t } = useLanguage(); const l = t.staffWork; return <AppShell title={l.admin} description={l.accountHint} allow={["SystemAdministrator"]}><Card><div className="btn-row"><Link className="btn" href="/admin/users">{l.users}</Link><Link className="btn btn--secondary" href="/admin/audit-log">{l.adminAudit}</Link></div></Card></AppShell>; }
