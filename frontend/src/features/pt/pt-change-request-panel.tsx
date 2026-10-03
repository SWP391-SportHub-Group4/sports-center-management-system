"use client";
import { useState } from "react";
import { AsyncSection, Card, Field, StatusChip } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime } from "@/lib/format";
import { MutationFeedback, useMutation } from "@/features/operations";
import type { PtReviewRequestDto } from "@/lib/types";
import { ptApi } from "./api";
import { ListPager } from "./ui";
function RequestCard({ r, coach, reload, onMoved }: { r: PtReviewRequestDto; coach: boolean; reload: () => void; onMoved: (v: { movedSessionIds: string[]; unmovedSessionIds: string[] }) => void }) {
 const { t } = useLanguage(); const l = t.staffWork; const [reason, setReason] = useState(""); const mutation = useMutation();
 async function review(approve: boolean) { if (await mutation.run(async () => { const result = await api.post<{ movedSessionIds: string[]; unmovedSessionIds: string[] }>(`/api/manager/pt-${coach ? "coach" : "session"}-change-requests/${r.requestId}/${approve ? "approve" : "reject"}`, { reviewNote: reason.trim() }); if (coach && approve) onMoved(result); })) reload(); }
 return <Card title={r.memberName ?? r.memberId}><p><StatusChip value={r.status}/> · {coach ? `${r.currentCoachName} → ${r.requestedCoachName}` : <><StatusChip value={r.requestType}/> · <StatusChip value={r.timingClassification}/></>}</p><p>{r.reason}</p>{r.sessionStartAtUtc && <p>{formatDateTime(r.sessionStartAtUtc)} → {r.requestedStartAtUtc ? formatDateTime(r.requestedStartAtUtc) : "—"}</p>}{r.requestsException && <p>{l.exception}</p>}<p>{coach ? l.coachImpact : l.quotaImpact}</p>{r.reviewNote && <p>{r.reviewNote}</p>}{r.status === "PENDING" && <><Field label={l.reviewNote}><textarea required minLength={3} maxLength={500} value={reason} onChange={e => setReason(e.target.value)}/></Field><div className="btn-row"><button className="btn" disabled={mutation.busy || reason.trim().length < 3} onClick={() => review(true)}>{l.approve}</button><button className="btn btn--danger" disabled={mutation.busy || reason.trim().length < 3} onClick={() => review(false)}>{l.reject}</button></div></>}<MutationFeedback mutation={mutation}/></Card>;
}
function Requests({ coach }: { coach: boolean }) { const { t } = useLanguage(); const [page, setPage] = useState(1); const [moved, setMoved] = useState<{ movedSessionIds: string[]; unmovedSessionIds: string[] } | null>(null); const state = useApi(signal => ptApi.requests(coach, page, signal), [coach, page]); return <>{moved && <Card><p>{t.staffWork.moved}: {moved.movedSessionIds.length}</p><p>{t.staffWork.unmoved}: {moved.unmovedSessionIds.join(", ") || "0"}</p></Card>}<button className="btn btn--secondary" onClick={state.reload}>{t.staffWork.refresh}</button><AsyncSection state={state}>{rows => <>{rows.map(r => <RequestCard key={`${r.requestId}-${r.status}`} r={r} coach={coach} reload={state.reload} onMoved={setMoved}/>)}{!rows.length && <p>{t.common.noData}</p>}<ListPager page={page} count={rows.length} onChange={setPage}/></>}</AsyncSection></>; }
export function PtChangeRequestPanel() { const { t } = useLanguage(); const [coach, setCoach] = useState(false); return <><div className="btn-row"><button className="btn btn--secondary" aria-pressed={!coach} onClick={() => setCoach(false)}>{t.staffWork.sessionChanges}</button><button className="btn btn--secondary" aria-pressed={coach} onClick={() => setCoach(true)}>{t.staffWork.coachChanges}</button></div><Requests key={String(coach)} coach={coach}/></>; }
