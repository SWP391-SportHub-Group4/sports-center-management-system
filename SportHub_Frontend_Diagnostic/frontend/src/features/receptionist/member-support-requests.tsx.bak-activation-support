"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import { useAuth } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { supportCategoryLabel } from "@/lib/support-categories";
import { useApi } from "@/lib/useApi";
import type { MemberSupportRequestDto } from "@/lib/types";
import { SupportStatus } from "@/components/support-status";
import { useDeskMember } from "./desk-context";
import { SupportCreateDialog } from "./support-create-dialog";
import type { SupportAssignee } from "./support-request-actions";
import styles from "./support.module.css";

export function MemberSupportRequests({ memberId }: { memberId: string }) {
  const { user } = useAuth();
  const { member } = useDeskMember();
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState("");
  const requests = useApi(
    (signal) => api.get<MemberSupportRequestDto[]>("/api/member-support-requests", { signal, query: { memberId } }),
    [memberId],
  );
  const assignees = useApi(
    (signal) => api.get<SupportAssignee[]>("/api/member-support-requests/assignees", { signal }),
    [],
  );
  const [shown, setShown] = useState<MemberSupportRequestDto[] | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (requests.data) setShown(requests.data);
  }, [requests.data]);
  const recent = [...(shown ?? [])].sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0,3);
  const base = user?.role === "CenterManager" ? "/manager/requests?type=support&" : "/receptionist/support?";

  return (
    <section className={styles.panel} aria-label="Member support">
      <div className={styles.head}>
        <h3>Member support</h3>
        <p>Use the same request form as Support requests, prefilled with the selected member.</p>
      </div>
      <div className={styles.form}>
        <button type="button" className="btn" onClick={() => setCreating(true)}>
          Record a request for member
        </button>
        {notice && <p role="status">{notice}</p>}
        {assignees.error && <p role="alert">Unable to load staff: {assignees.error.message}</p>}
      </div>
      {creating && (
        <SupportCreateDialog
          assignees={assignees.data ?? []}
          initialMember={member?.userId === memberId ? member : null}
          onClose={() => setCreating(false)}
          onCreated={(message) => {
            setCreating(false);
            setNotice(message);
            requests.reload();
          }}
        />
      )}
      <div className={styles.recent}>
        <div className={styles.recentHead}><h4>Recent requests</h4></div>
        {requests.loading && !shown && <p>Loading requests…</p>}
        {requests.error && <p role="alert">{requests.error.message}</p>}
        {recent.length === 0 && !requests.loading && <p>No support requests yet.</p>}
        <ul className={styles.requests}>
          {recent.map((request) => (
            <li key={request.requestId} className={styles.request}>
              <div className={styles.badges}>
                <span className={styles.pill}>{supportCategoryLabel(request.category)}</span>
                <SupportStatus status={request.status} />
                <span className={styles.badgeDate}>{formatDateTime(request.createdAt)}</span>
              </div>
              <strong className={styles.requestTitle}>{request.subject}</strong>
              <p className={styles.meta}>{request.assignedToName ? `Handled by: ${request.assignedToName}` : "Waiting in the queue"}</p>
              <Link className={styles.viewLink} href={`${base}request=${request.requestId}`}>View details &amp; handle</Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
