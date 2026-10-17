"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { formatDateTime } from "@/lib/format";
import type { MemberSupportRequestDto, Paged } from "@/lib/types";
import styles from "./ops.module.css";
import { SupportRequestActions, type SupportAssignee } from "./support-request-actions";

export function SupportQueue() {
  const assignees = useApi((signal) =>
    api.get<SupportAssignee[]>("/api/member-support-requests/assignees", { signal }), []);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const queue = useApi((signal) => api.get<Paged<MemberSupportRequestDto>>(
    "/api/member-support-requests/queue", { signal, query: { status, page, pageSize: 20 } }),
  [status, page]);
  return <section className={`card ${styles.panel}`}>
    <h2>Support requests</h2>
    <label className={styles.field}>Status <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
      <option value="">All</option><option value="OPEN">Open</option>
      <option value="ASSIGNED">Assigned</option><option value="IN_PROGRESS">In progress</option>
      <option value="CLOSED">Closed</option>
    </select></label>
    {queue.loading && <p>Loading…</p>}
    {queue.error && <p role="alert">{queue.error.message}</p>}
    {queue.data?.items.map(request => <article key={request.requestId} className={styles.item}>
      <h3>{request.subject} <span className={styles.status}>{request.status.replace("_", " ")}</span></h3>
      <p className="small muted">{request.category} · {formatDateTime(request.createdAt)} · <Link href={`/receptionist/members/${request.memberId}`}>Member profile</Link></p>
      <p>{request.description}</p>
      <SupportRequestActions request={request} assignees={assignees.data ?? []}
        onChanged={queue.reload} />
    </article>)}
    {queue.data && <div className={styles.row}>
      <button type="button" className="btn btn--secondary btn--sm" disabled={page <= 1}
        onClick={() => setPage(page - 1)}>Previous</button>
      <span>Page {page} · {queue.data.totalCount} requests</span>
      <button type="button" className="btn btn--secondary btn--sm"
        disabled={page * 20 >= queue.data.totalCount} onClick={() => setPage(page + 1)}>Next</button>
    </div>}
  </section>;
}
