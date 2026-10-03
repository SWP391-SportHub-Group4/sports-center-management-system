"use client";
import { useState } from "react";
import { AsyncSection, Card, StatusChip, Table } from "@/components/ui";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDate } from "@/lib/format";
import { ptApi } from "./api";
import { ListPager } from "./ui";
import type { PtEntitlementDto } from "@/lib/types";
export function PtQuotaSummary({ manager = false, onSelect }: { manager?: boolean; onSelect?: (row: PtEntitlementDto) => void }) {
  const { t } = useLanguage(); const l = t.staffWork;
  const [page, setPage] = useState(1);
  const state = useApi(signal => ptApi.entitlements(manager, page, signal), [manager, page]);
  return <Card title={l.quota}><AsyncSection state={state}>{rows => <><Table headers={[l.member, l.coach, l.validity, l.quota, l.status, l.actions]}>{rows.map(r => <tr key={r.entitlementId}><td>{r.memberName}</td><td>{r.coachName}</td><td>{formatDate(r.validityStartDate)} – {formatDate(r.validityEndDate)}{r.carryOverUntilDate && <p>{l.carryOver}: {formatDate(r.carryOverUntilDate)}</p>}</td><td>{l.total}: {r.totalQuota}<br/>{l.reserved}: {r.reservedSessions}<br/>{l.consumed}: {r.consumedSessions}<br/>{l.remaining}: {r.remainingQuota}</td><td><StatusChip value={r.status}/></td><td>{onSelect && r.status === "ACTIVE" && r.remainingQuota > 0 && <button className="btn btn--secondary" onClick={() => onSelect(r)}>{l.schedule}</button>}</td></tr>)}</Table>{!rows.length && <p>{t.common.noData}</p>}<ListPager page={page} count={rows.length} onChange={setPage}/></>}</AsyncSection></Card>;
}
