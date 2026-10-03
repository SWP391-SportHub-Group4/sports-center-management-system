"use client";
import { useState } from "react";
import { AsyncSection, Card, Field, Pager, Table } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime } from "@/lib/format";
import type { AuditLogDto, Paged } from "@/lib/types";
import { auditMetadata } from "@/features/administration/audit-metadata";
export function AuditLogView({ accountsOnly = false }: { accountsOnly?: boolean }) {
 const { t } = useLanguage(); const l = t.staffWork; const [page, setPage] = useState(1); const [action, setAction] = useState(""); const [entity, setEntity] = useState(""); const [actor, setActor] = useState(""); const [filters, setFilters] = useState({ action: "", targetEntity: "", actorId: "" });
 const state = useApi(signal => api.get<Paged<AuditLogDto>>("/api/audit-logs", { signal, query: { page, pageSize: 25, action: filters.action || undefined, targetEntity: accountsOnly ? "UserAccount" : filters.targetEntity || undefined, actorId: filters.actorId || undefined } }), [page, filters, accountsOnly]);
 return <><Card title={l.audit} hint={accountsOnly ? l.accountScope : l.auditHint}><form className="form" onSubmit={e => { e.preventDefault(); setFilters({ action, targetEntity: entity, actorId: actor }); setPage(1); }}><div className="form-grid"><Field label={l.action}><input value={action} onChange={e => setAction(e.target.value)}/></Field>{!accountsOnly && <Field label={l.entity}><input value={entity} onChange={e => setEntity(e.target.value)}/></Field>}<Field label={l.actor}><input value={actor} pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}" onChange={e => setActor(e.target.value)}/></Field></div><button className="btn">{l.apply}</button></form></Card><Card><AsyncSection state={state}>{data => <><Table headers={[l.time, l.actor, l.action, l.entity, l.metadata]}>{data.items.map(r => <tr key={r.auditId}><td>{formatDateTime(r.timestamp)}</td><td>{r.actorEmail}<br/>{r.userId}</td><td>{r.action}</td><td>{r.targetEntity}<br/>{r.targetId}</td><td>{auditMetadata(r.oldValue).map(([k,v]) => <p key={k}><del>{k}: {v}</del></p>)}{auditMetadata(r.newValue).map(([k,v]) => <p key={k}>{k}: {v}</p>)}</td></tr>)}</Table>{!data.items.length && <p>{t.common.noData}</p>}<Pager page={data.page} pageSize={data.pageSize} totalCount={data.totalCount} onChange={setPage}/></>}</AsyncSection></Card></>;
}
