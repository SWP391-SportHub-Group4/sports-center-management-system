"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { AvatarImage } from "@/components/AvatarImage";
import { api } from "@/lib/apiClient";
import { useAuth } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/format";
import type {
  MemberPackageDto,
  MemberSupportRequestDto,
  UserAdminDto,
} from "@/lib/types";
import { supportCategoryLabel } from "@/lib/support-categories";
import { useApi } from "@/lib/useApi";
import { DAY_PASS_PACKAGE_ID } from "@/lib/day-pass";
import { BankRefundPanel } from "@/features/support-refund";
import type { SupportAssignee } from "./support-shared";
import { SupportAttachments } from "./support-attachments";
import {
  ROLE_LABELS,
  ROLE_RANK,
  STATUS_LABELS,
  assigneesByRole,
  eventText,
  roleKey,
  type RoleKey,
  type SupportEventDto,
} from "./support-shared";
import styles from "./support-center.module.css";

type Mode = "progress" | "done" | "reject";
type Feedback = { tone: "ok" | "error"; text: string } | null;

const TABS: { mode: Mode; label: string }[] = [
  { mode: "progress", label: "Update progress" },
  { mode: "done", label: "Mark as done" },
  { mode: "reject", label: "Reject" },
];

const MODE_COPY: Record<
  Mode,
  { field: string; placeholder: string; submit: string }
> = {
  progress: {
    field: "Progress note",
    placeholder: "What has been checked, and what happens next?",
    submit: "Update",
  },
  done: {
    field: "Resolution note",
    placeholder: "Describe how the request was resolved.",
    submit: "Mark as done",
  },
  reject: {
    field: "Rejection reason",
    placeholder: "Explain why this request cannot be handled.",
    submit: "Reject request",
  },
};

/** Detail side of the master-detail view: member banner, routing, handling tabs and the activity timeline. */
export function SupportDetail({
  request,
  assignees,
  workspace,
  onChanged,
}: {
  request: MemberSupportRequestDto;
  assignees: SupportAssignee[];
  workspace: "manager" | "receptionist" | "coach";
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const isCoach = workspace === "coach";
  const closed = ["DONE", "REJECTED", "CLOSED"].includes(request.status);
  const myRank = ROLE_RANK[roleKey(user?.role)];
  // Payment tickets are manager-only work: the front desk creates and follows them but cannot assign, approve or close.
  const isPayment = request.category === "PAYMENT";
  const isManagerUser = roleKey(user?.role) === "manager";
  const refundTicket = isPayment && !!request.requiresPayout;
  const paymentLocked = isPayment && !isManagerUser;
  const evidence = (request.attachments ?? []).filter(
    (a) => a.kind !== "PAYOUT_PROOF",
  );
  const proofs = (request.attachments ?? []).filter(
    (a) => a.kind === "PAYOUT_PROOF",
  );

  const member = useApi(
    (signal) =>
      isCoach
        ? Promise.resolve(null)
        : api.get<UserAdminDto>(`/api/users/${request.memberId}`, { signal }),
    [request.memberId, isCoach],
  );
  const packages = useApi(
    (signal) =>
      isCoach
        ? Promise.resolve([] as MemberPackageDto[])
        : api.get<MemberPackageDto[]>(
            `/api/members/${request.memberId}/packages`,
            {
              signal,
            },
          ),
    [request.memberId, isCoach],
  );
  const events = useApi(
    (signal) =>
      api.get<SupportEventDto[]>(
        `/api/member-support-requests/${request.requestId}/events`,
        { signal },
      ),
    [request.requestId],
  );

  const usable = (packages.data ?? []).filter(
    (p) => p.status === "ACTIVE" && p.isUsable,
  );
  const plan =
    usable.find((p) => p.packageId !== DAY_PASS_PACKAGE_ID) ?? usable[0];
  const planText = packages.loading
    ? "…"
    : plan
      ? plan.packageId === DAY_PASS_PACKAGE_ID
        ? "Day pass"
        : plan.packageName
      : "No active plan";

  // ---- routing ----
  const currentRole = request.assignedToUserId
    ? roleKey(
        assignees.find((x) => x.userId === request.assignedToUserId)?.role,
      )
    : null;
  const availableRoles = (Object.keys(ROLE_LABELS) as RoleKey[]).filter(
    (role) =>
      assigneesByRole(assignees, role).length > 0 &&
      (!isPayment || role === "manager"),
  );
  const [targetRole, setTargetRole] = useState<RoleKey | "">("");
  const [targetUser, setTargetUser] = useState("");
  const [transferNote, setTransferNote] = useState("");
  const staff = targetRole ? assigneesByRole(assignees, targetRole) : [];
  const escalating = !!targetRole && ROLE_RANK[targetRole] > myRank;
  const sameAssignee = targetUser === request.assignedToUserId;
  const noteMissing = escalating && transferNote.trim().length < 3;
  const transferBlock = !targetRole
    ? "Choose a department first."
    : !targetUser
      ? "Choose a staff member."
      : sameAssignee
        ? "This request is already assigned to that person."
        : noteMissing
          ? "Add a transfer note to escalate to a higher role."
          : null;

  // ---- handling ----
  const [mode, setMode] = useState<Mode>("progress");
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const lock = useRef(false);

  async function run(
    kind: "assign" | "progress" | "done" | "reject",
    body: Record<string, string>,
    success: string,
  ) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      await api.post(
        `/api/member-support-requests/${request.requestId}/${kind}`,
        body,
      );
      setFeedback({ tone: "ok", text: success });
      setNote("");
      setConfirming(false);
      if (kind === "assign") {
        setTransferNote("");
        setTargetUser("");
      }
      events.reload();
      onChanged();
    } catch (e) {
      setFeedback({
        tone: "error",
        text: e instanceof Error ? e.message : "Could not update this request.",
      });
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  const copy = MODE_COPY[mode];
  const noteReady = note.trim().length >= 3;
  const unassigned = !request.assignedToUserId;
  const isMine = !!user && request.assignedToUserId === user.userId;
  // A request whose handler left or cannot work requests can be taken over by any staff member.
  const takeover = !unassigned && request.assigneeCanAct === false;
  const claimable = unassigned || takeover;
  const actionBlock = unassigned
    ? "Assign this request to someone before updating it."
    : takeover
      ? "Assign this request to yourself before updating it."
      : !noteReady
        ? "Write at least 3 characters."
        : null;

  const assignedAt = [...(events.data ?? [])]
    .reverse()
    .find((e) => e.type === "ASSIGNED")?.createdAt;

  const timeline: SupportEventDto[] =
    events.data && events.data.length > 0
      ? events.data
      : [
          {
            eventId: "created",
            type: "CREATED",
            note: null,
            createdAt: request.createdAt,
            actorName: request.memberName ?? "Member",
            actorRole: null,
            targetName: null,
          },
        ];

  return (
    <div className={styles.detail}>
      <header className={styles.detailHead}>
        <div className={styles.detailHeadMeta}>
          <span className={styles.badge}>
            <span className={styles.dot} data-status={request.status} />
            {STATUS_LABELS[request.status] ?? request.status}
          </span>
          <time className={styles.createdAt} dateTime={request.createdAt}>
            Created {formatDateTime(request.createdAt)}
          </time>
        </div>
      </header>

      <div className={styles.banner}>
        <AvatarImage
          name={request.memberName || request.memberEmail || "Member"}
          avatarUrl={member.data?.avatarUrl}
          size={44}
        />
        <div className={styles.bannerText}>
          <strong>{request.memberName || "Member"}</strong>
          <span className={styles.muted}>
            {[member.data?.phone, request.memberEmail]
              .filter(Boolean)
              .join(" · ")}
          </span>
          {!isCoach && (
            <span className={styles.muted}>
              Plan: {planText}
              {plan && plan.packageId !== DAY_PASS_PACKAGE_ID
                ? ` · until ${formatDate(plan.endDate)}`
                : ""}
            </span>
          )}
        </div>
        {!isCoach && (
          <Link
            className={styles.bannerLink}
            href={`/${workspace}/members/${request.memberId}`}
          >
            View profile
          </Link>
        )}
      </div>

      <section className={styles.section} aria-label="Request message">
        <h4>Request</h4>
        <dl className={styles.requestMetadata}>
          <div>
            <dt>Request type</dt>
            <dd>
              <span
                className={styles.categoryBadge}
                data-category={request.category}
              >
                {supportCategoryLabel(request.category)}
              </span>
            </dd>
          </div>
          <div>
            <dt>Subject</dt>
            <dd>{request.subject}</dd>
          </div>
          <div>
            <dt>Details</dt>
            <dd className={styles.message}>
              {request.description?.trim() || "No details provided."}
            </dd>
          </div>
        </dl>
        <SupportAttachments attachments={evidence} />
      </section>

      {refundTicket && (
        <BankRefundPanel
          key={`${request.requestId}-${request.status}`}
          requestId={request.requestId}
          role={isManagerUser ? "manager" : "receptionist"}
          proofs={proofs}
          onChanged={() => {
            events.reload();
            onChanged();
          }}
        />
      )}

      {closed ? (
        refundTicket ? null : (
          <section className={styles.section} aria-label="Final note">
            <h4>
              {request.status === "REJECTED"
                ? "Rejection reason"
                : "Resolution"}
            </h4>
            <p className={styles.message}>
              {request.progressNote ?? "No final note."}
            </p>
          </section>
        )
      ) : paymentLocked ? (
        <section className={styles.section} aria-label="Payment request">
          <h4>Handled by the manager</h4>
          <p className={styles.helper}>
            Payment requests are reviewed by the center manager. You can follow
            the progress and the result here, but you cannot assign, approve or
            close them.
          </p>
        </section>
      ) : (
        <>
          {!claimable && !isMine ? (
            <section className={styles.section} aria-label="Current handler">
              <h4>Handler</h4>
              <dl className={styles.requestMetadata}>
                <div>
                  <dt>Handled by</dt>
                  <dd>
                    {request.assignedToName ?? "Former staff member"}
                    {currentRole ? ` (${ROLE_LABELS[currentRole]})` : ""}
                  </dd>
                </div>
                {assignedAt && (
                  <div>
                    <dt>Assigned on</dt>
                    <dd>{formatDateTime(assignedAt)}</dd>
                  </div>
                )}
              </dl>
              <p className={styles.helper}>
                Only the assigned handler can update or transfer this request.
              </p>
            </section>
          ) : (
            <>
              <section
                className={styles.box}
                aria-label="Routing and escalation"
              >
                <h4 className={styles.muted} style={{ margin: 0 }}>
                  Assignment · currently{" "}
                  <strong>
                    {request.assignedToName ??
                      (request.assignedToUserId
                        ? "former staff"
                        : "unassigned")}
                    {currentRole ? ` (${ROLE_LABELS[currentRole]})` : ""}
                  </strong>
                </h4>
                <div className={styles.grid2}>
                  <label className={styles.field}>
                    Department
                    <select
                      value={targetRole}
                      disabled={busy}
                      onChange={(e) => {
                        setTargetRole(e.target.value as RoleKey | "");
                        setTargetUser("");
                      }}
                    >
                      <option value="">Select a department</option>
                      {availableRoles.map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.field}>
                    Staff member
                    <select
                      value={targetUser}
                      disabled={busy || !targetRole}
                      onChange={(e) => setTargetUser(e.target.value)}
                    >
                      <option value="">Select a staff member</option>
                      {staff.map((x) => (
                        <option key={x.userId} value={x.userId}>
                          {x.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {escalating && (
                  <label className={styles.field}>
                    Transfer note (required)
                    <textarea
                      value={transferNote}
                      maxLength={1000}
                      disabled={busy}
                      placeholder={`Why are you escalating this to the ${ROLE_LABELS[targetRole as RoleKey]}?`}
                      onChange={(e) => setTransferNote(e.target.value)}
                    />
                  </label>
                )}
                <div className={styles.actions}>
                  <button
                    type="button"
                    className="btn"
                    disabled={busy || transferBlock !== null}
                    onClick={() =>
                      run(
                        "assign",
                        {
                          assigneeUserId: targetUser,
                          note: transferNote.trim(),
                        },
                        "Request transferred.",
                      )
                    }
                  >
                    Transfer request
                  </button>
                  {user && claimable && (
                    <button
                      type="button"
                      className="btn btn--secondary"
                      disabled={busy}
                      onClick={() =>
                        run(
                          "assign",
                          { assigneeUserId: user.userId },
                          "You are now handling this request.",
                        )
                      }
                    >
                      Assign to me
                    </button>
                  )}
                </div>
                {transferBlock && (
                  <p className={`${styles.helper} ${styles.helperWarn}`}>
                    {transferBlock}
                  </p>
                )}
              </section>

              {!refundTicket && (
                <section className={styles.section} aria-label="Handle request">
                  <div
                    className={styles.tabs}
                    role="tablist"
                    aria-label="Action"
                  >
                    {TABS.map((tab) => (
                      <button
                        key={tab.mode}
                        type="button"
                        role="tab"
                        className={styles.tab}
                        aria-selected={mode === tab.mode}
                        disabled={busy}
                        onClick={() => {
                          setMode(tab.mode);
                          setConfirming(false);
                        }}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  <label className={styles.field}>
                    {copy.field}
                    <textarea
                      value={note}
                      maxLength={1000}
                      disabled={busy}
                      placeholder={copy.placeholder}
                      onChange={(e) => {
                        setNote(e.target.value);
                        setConfirming(false);
                      }}
                    />
                  </label>
                  <div className={styles.actions}>
                    {mode !== "progress" && confirming ? (
                      <>
                        <button
                          type="button"
                          className="btn"
                          disabled={busy || actionBlock !== null}
                          onClick={() =>
                            run(
                              mode,
                              { reason: note.trim() },
                              mode === "done"
                                ? "Request marked as done."
                                : "Request rejected.",
                            )
                          }
                        >
                          {mode === "done"
                            ? "Confirm done"
                            : "Confirm rejection"}
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost"
                          disabled={busy}
                          onClick={() => setConfirming(false)}
                        >
                          Back
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="btn"
                        disabled={busy || actionBlock !== null}
                        onClick={() =>
                          mode === "progress"
                            ? run(
                                "progress",
                                { note: note.trim() },
                                "Progress updated.",
                              )
                            : setConfirming(true)
                        }
                      >
                        {copy.submit}
                      </button>
                    )}
                  </div>
                  {actionBlock && (
                    <p className={`${styles.helper} ${styles.helperWarn}`}>
                      {actionBlock}
                    </p>
                  )}
                </section>
              )}
            </>
          )}
        </>
      )}

      {feedback && (
        <p
          className={`${styles.feedback} ${feedback.tone === "error" ? styles.feedbackError : ""}`}
          role={feedback.tone === "error" ? "alert" : "status"}
        >
          {feedback.text}
        </p>
      )}

      <section className={styles.section} aria-label="Activity timeline">
        <h4>Activity</h4>
        <ol className={styles.timeline}>
          {timeline.map((event) => (
            <li key={event.eventId} className={styles.event}>
              <strong>{eventText(event)}</strong>
              <span className={styles.muted}>
                {formatDateTime(event.createdAt)}
                {event.actorRole
                  ? ` · ${ROLE_LABELS[roleKey(event.actorRole)]}`
                  : ""}
              </span>
              {event.note && <p className={styles.eventNote}>{event.note}</p>}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
