"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/apiClient";
import { useAuth } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { supportCategoryLabel } from "@/lib/support-categories";
import { useApi } from "@/lib/useApi";
import type { UserAdminDto, MemberSupportRequestDto } from "@/lib/types";
import { SupportStatus } from "@/components/support-status";
import { useDeskMember } from "./desk-context";
import { SupportCreateDialog } from "./support-create-dialog";
import type { SupportAssignee } from "./support-request-actions";
import styles from "./support.module.css";

const RECENT_LIMIT = 3;

export function MemberSupportRequests({ memberId }: { memberId: string }) {
  const { user } = useAuth();
  const { member } = useDeskMember();
  const memberDetails = useApi(
    (signal) =>
      member?.userId === memberId
        ? Promise.resolve(member)
        : api.get<UserAdminDto>(`/api/users/${memberId}`, { signal }),
    [memberId, member],
  );
  const selectedMember =
    member?.userId === memberId
      ? member
      : memberDetails.data?.userId === memberId
        ? memberDetails.data
        : null;
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState("");
  const requests = useApi(
    (signal) =>
      api.get<MemberSupportRequestDto[]>("/api/member-support-requests", {
        signal,
        query: { memberId },
      }),
    [memberId],
  );
  const assignees = useApi(
    (signal) =>
      api.get<SupportAssignee[]>("/api/member-support-requests/assignees", {
        signal,
      }),
    [],
  );
  const shown = requests.data;
  const recent = [...(shown ?? [])]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, RECENT_LIMIT);
  const base =
    user?.role === "CenterManager"
      ? "/manager/requests?type=support"
      : "/receptionist/support";

  return (
    <section className={styles.panel} aria-label="Member support">
      <div className={styles.head}>
        <h3>Member support</h3>
        <p>
          Use the same request form as Support requests, prefilled with the
          selected member.
        </p>
      </div>
      <div className={styles.form}>
        <button
          type="button"
          className="btn"
          disabled={
            !selectedMember || selectedMember.activationPending === true
          }
          onClick={() => {
            if (selectedMember && !selectedMember.activationPending)
              setCreating(true);
          }}
        >
          Record a request for member
        </button>
        {notice && <p role="status">{notice}</p>}
        {memberDetails.error && (
          <div role="alert">
            {memberDetails.error.message}
            <button
              type="button"
              className="btn btn--secondary"
              onClick={memberDetails.reload}
            >
              Retry member
            </button>
          </div>
        )}
        {assignees.error && (
          <p role="alert">Unable to load staff: {assignees.error.message}</p>
        )}
      </div>
      {creating && selectedMember && !selectedMember.activationPending && (
        <SupportCreateDialog
          assignees={assignees.data ?? []}
          key={memberId}
          workspace={
            user?.role === "CenterManager" ? "manager" : "receptionist"
          }
          initialMember={selectedMember}
          onClose={() => setCreating(false)}
          onCreated={(message) => {
            setCreating(false);
            setNotice(message);
            requests.reload();
          }}
        />
      )}
      <div className={styles.recent}>
        <div className={styles.recentHead}>
          <h4>Recent requests</h4>
          {(shown?.length ?? 0) > RECENT_LIMIT && (
            <span>
              Latest {RECENT_LIMIT} of {shown?.length}
            </span>
          )}
        </div>

        {requests.loading && !shown ? (
          <p className={styles.empty}>Loading…</p>
        ) : requests.error ? (
          <div role="alert">
            <p>{requests.error.message}</p>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={requests.reload}
            >
              Retry
            </button>
          </div>
        ) : !recent.length ? (
          <p className={styles.empty}>No support requests yet.</p>
        ) : (
          <ul className={styles.requests}>
            {recent.map((request) => {
              return (
                <li key={request.requestId} className={styles.request}>
                  <div className={styles.badges}>
                    <span className={styles.pill}>
                      {supportCategoryLabel(request.category)}
                    </span>
                    <SupportStatus status={request.status} />
                    <span className={styles.badgeDate}>
                      {formatDateTime(request.createdAt)}
                    </span>
                  </div>
                  <strong className={styles.requestTitle}>
                    {request.subject}
                  </strong>
                  <p className={styles.meta}>
                    {request.assignedToUserId
                      ? `Handled by: ${request.assignedToName ?? "Former staff member"}`
                      : "Waiting in the queue"}
                  </p>
                  <Link
                    className={styles.viewLink}
                    href={`${base}${base.includes("?") ? "&" : "?"}request=${request.requestId}`}
                  >
                    View details &amp; handle →
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
