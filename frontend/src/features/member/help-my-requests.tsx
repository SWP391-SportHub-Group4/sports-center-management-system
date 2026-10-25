"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, BellRing, CheckCircle2, Clock } from "lucide-react";
import { SupportStatus } from "@/components/support-status";
import { AsyncSection, Dialog } from "@/components/ui";
import { api, ApiError, fetchBlob } from "@/lib/apiClient";
import { formatDateTime, formatMoney } from "@/lib/format";
import { paymentSupportErrorCodes } from "@/lib/payment-support-errors";
import { supportCategoryLabel } from "@/lib/support-categories";
import { useKeepPrevious } from "@/lib/keep-previous";
import { useNow, type AsyncState } from "@/lib/useApi";
import {
  isRequestOpen,
  needsMemberConfirmation,
  requestStage,
  type RequestStageKey,
  type SupportRequestDto,
} from "./support-api";
import styles from "./help-center.module.css";

const AUTO_CONFIRM_DAYS = 3;

function reference(row: SupportRequestDto) {
  return row.requestId.replace(/-/g, "").slice(0, 8).toUpperCase();
}

export function StagePill({ row }: { row: SupportRequestDto }) {
  return <SupportStatus status={row.status} />;
}

/** Image behind the authenticated attachment endpoint, loaded as a blob. */
function ProofImage({
  attachmentId,
  index,
  onZoom,
}: {
  attachmentId: string;
  index: number;
  onZoom: (url: string, name: string) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let revoked: string | null = null;
    let alive = true;
    fetchBlob(`/api/support/attachments/${attachmentId}`)
      .then((blob) => {
        if (!alive) return;
        revoked = URL.createObjectURL(blob);
        setUrl(revoked);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [attachmentId]);
  const name = `Transfer proof ${index + 1}`;
  if (failed)
    return <span className={styles.proofMissing}>Image unavailable</span>;
  if (!url) return <span className={styles.proofLoading} aria-busy="true" />;
  return (
    <button
      type="button"
      className={styles.proof}
      onClick={() => onZoom(url, name)}
      aria-label={`View ${name}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={name} />
    </button>
  );
}

const STEPS_PAYMENT = ["Received", "Under review", "Transfer sent", "Confirmed"];
const STEPS_DEFAULT = ["Received", "Assigned", "In progress", "Resolved"];

function progressIndex(row: SupportRequestDto, key: RequestStageKey) {
  if (row.category === "PAYMENT") {
    if (key === "paidOut") return 3;
    if (key === "confirmReceipt") return 2;
    if (key === "notReceived") return 1;
    if (key === "assigned" || key === "inProgress") return 1;
    if (key === "resolved" || key === "closed") return 3;
    return 0;
  }
  if (key === "assigned") return 1;
  if (key === "inProgress") return 2;
  if (key === "resolved") return 3;
  return 0;
}

function Stepper({ row }: { row: SupportRequestDto }) {
  const { key } = requestStage(row);
  if (key === "rejected" || (key === "closed" && row.category !== "PAYMENT")) return null;
  const steps = row.category === "PAYMENT" ? STEPS_PAYMENT : STEPS_DEFAULT;
  const current = progressIndex(row, key);
  const completed = key === "resolved" || key === "paidOut";
  return (
    <ol className={styles.stepper} aria-label="Progress">
      {steps.map((label, i) => (
        <li
          key={label}
          data-state={i < current ? "done" : i === current ? completed ? "complete" : "current" : "todo"}
          aria-current={i === current && !completed ? "step" : undefined}
        >
          <span className={styles.stepDot} aria-hidden="true">
            {i < current ? "✓" : i + 1}
          </span>
          <span>{label}</span>
        </li>
      ))}
    </ol>
  );
}

function RequestDetail({
  row,
  now,
  onChanged,
  onBack,
}: {
  row: SupportRequestDto;
  now: number;
  onChanged: () => void;
  onBack: () => void;
}) {
  const stage = requestStage(row);
  const open = isRequestOpen(row);
  const [busy, setBusy] = useState<"remind" | "confirm" | "report" | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [remindAt, setRemindAt] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState<{ url: string; name: string } | null>(
    null,
  );
  const [confirmReport, setConfirmReport] = useState(false);
  const allowedAt = remindAt ?? row.canRemindAtUtc;
  const canRemind = open && allowedAt !== null && Date.parse(allowedAt) <= now;
  const confirmNeeded = needsMemberConfirmation(row);

  async function remind() {
    setBusy("remind");
    setNotice(null);
    try {
      await api.post(`/api/support/requests/${row.requestId}/remind`);
      setNotice({
        ok: true,
        text: "Reminder sent. Our team has been notified.",
      });
      setRemindAt(null);
      onChanged();
    } catch (e) {
      if (
        e instanceof ApiError &&
        e.code === paymentSupportErrorCodes.supportRemindTooEarly
      ) {
        const next = e.details.canRemindAtUtc;
        if (typeof next === "string") setRemindAt(next);
        setNotice({
          ok: false,
          text: `You can remind us again from ${formatDateTime(typeof next === "string" ? next : allowedAt)}.`,
        });
      } else
        setNotice({
          ok: false,
          text:
            e instanceof Error ? e.message : "We could not send the reminder.",
        });
    } finally {
      setBusy(null);
    }
  }

  async function confirm(received: boolean) {
    setBusy(received ? "confirm" : "report");
    setNotice(null);
    try {
      await api.post(
        `/api/support/requests/${row.requestId}/${received ? "confirm-received" : "report-not-received"}`,
      );
      setConfirmReport(false);
      setNotice({
        ok: true,
        text: received
          ? "Thank you. This request is complete."
          : "We reopened your request and told our manager that the money did not arrive.",
      });
      onChanged();
    } catch (e) {
      setConfirmReport(false);
      setNotice({
        ok: false,
        text:
          e instanceof Error ? e.message : "We could not save your answer.",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className={styles.detail} aria-label="Request details">
      <button type="button" className={styles.back} onClick={onBack}>
        <ArrowLeft size={16} aria-hidden="true" /> All requests
      </button>
      <header className={styles.detailHead}>
        <div>
          <h3>{supportCategoryLabel(row.category)} request</h3>
          <span className={styles.meta}>
            Ref {reference(row)} · Sent {formatDateTime(row.createdAt)}
          </span>
        </div>
        <StagePill row={row} />
      </header>
      <p className={styles.stageHint}>{stage.hint}</p>
      <Stepper row={row} />

      {confirmNeeded && row.payout && (
        <section className={styles.payout} aria-label="Transfer confirmation">
          <h4>
            <CheckCircle2 size={18} aria-hidden="true" /> We sent{" "}
            {formatMoney(row.payout.amount)}
          </h4>
          <p>
            Recorded on {formatDateTime(row.payout.recordedAtUtc)}
.
            Check your bank app and the proof below, then tell us.
          </p>
          {row.payout.proofAttachmentIds.length > 0 && (
            <div className={styles.proofs}>
              {row.payout.proofAttachmentIds.map((id, i) => (
                <ProofImage
                  key={id}
                  attachmentId={id}
                  index={i}
                  onZoom={(url, name) => setZoomed({ url, name })}
                />
              ))}
            </div>
          )}
          <div className={styles.payoutActions}>
            <button
              type="button"
              className="btn"
              disabled={busy !== null}
              onClick={() => void confirm(true)}
            >
              {busy === "confirm" ? "Saving…" : "I received it"}
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              disabled={busy !== null}
              onClick={() => setConfirmReport(true)}
            >
              Not received
            </button>
          </div>
          <p className={styles.hint}>
            If you do nothing, we mark it as received {AUTO_CONFIRM_DAYS} days
            after {formatDateTime(row.payout.recordedAtUtc)}.
          </p>
        </section>
      )}

      {!confirmNeeded && row.payout && (
        <section className={styles.payoutDone} aria-label="Transfer">
          <h4>Transfer of {formatMoney(row.payout.amount)}</h4>
          <p>
            Recorded on {formatDateTime(row.payout.recordedAtUtc)}
            .
            {row.payout.memberConfirmedAtUtc
              ? ` ${row.payout.memberConfirmedBy === "SYSTEM" ? "Marked as received automatically" : "You confirmed receipt"} on ${formatDateTime(row.payout.memberConfirmedAtUtc)}.`
              : ""}
          </p>
          {row.payout.proofAttachmentIds.length > 0 && (
            <div className={styles.proofs}>
              {row.payout.proofAttachmentIds.map((id, i) => (
                <ProofImage
                  key={id}
                  attachmentId={id}
                  index={i}
                  onZoom={(url, name) => setZoomed({ url, name })}
                />
              ))}
            </div>
          )}
        </section>
      )}

      <dl className={styles.facts}>
        <div>
          <dt>Your message</dt>
          <dd>{row.description}</dd>
        </div>
        {row.response && (
          <div>
            <dt>Reply from SportHub</dt>
            <dd>{row.response}</dd>
          </div>
        )}
        {row.category === "PAYMENT" && row.invoiceId && (
          <div>
            <dt>Invoice</dt>
            <dd>
              <Link
                href={`/member/finance?tab=invoices&invoice=${row.invoiceId}`}
              >
                Open invoice
              </Link>
            </dd>
          </div>
        )}
      </dl>

      {open && (
        <section className={styles.sla} aria-label="Response time">
          <p className={row.isOverdue ? styles.slaLate : undefined}>
            <Clock size={16} aria-hidden="true" />{" "}
            {row.isOverdue
              ? `This is taking longer than usual. We aimed to reply by ${formatDateTime(row.slaDueAtUtc)}.`
              : `We aim to reply by ${formatDateTime(row.slaDueAtUtc)}.`}
          </p>
          <div className={styles.remindRow}>
            <button
              type="button"
              className="btn btn--secondary"
              disabled={!canRemind || busy !== null}
              onClick={() => void remind()}
            >
              <BellRing size={16} aria-hidden="true" />{" "}
              {busy === "remind" ? "Sending…" : "Remind us"}
            </button>
            {!canRemind && allowedAt && (
              <span className={styles.hint}>
                You can remind us from {formatDateTime(allowedAt)}.
              </span>
            )}
          </div>
        </section>
      )}

      {notice && (
        <p
          className={notice.ok ? "alert alert--success" : "alert alert--error"}
          role={notice.ok ? "status" : "alert"}
        >
          {notice.text}
        </p>
      )}

      {zoomed && (
        <Dialog
          title="Transfer proof"
          size="lg"
          closeIconOnly
          onClose={() => setZoomed(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.zoomed} src={zoomed.url} alt={zoomed.name} />
        </Dialog>
      )}
      {confirmReport && (
        <Dialog
          title="The money did not arrive?"
          onClose={() => setConfirmReport(false)}
        >
          <p>
            We will reopen this request and tell our manager. You can only
            report this once, so please check your bank app first.
          </p>
          <div className={styles.payoutActions}>
            <button
              type="button"
              className="btn"
              disabled={busy !== null}
              onClick={() => void confirm(false)}
            >
              {busy === "report" ? "Saving…" : "Yes, not received"}
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => setConfirmReport(false)}
            >
              Cancel
            </button>
          </div>
        </Dialog>
      )}
    </article>
  );
}

/** List of the member's requests with a detail panel; requests that need a confirmation are flagged. */
export function MyRequests({
  state,
  selectedId,
  onSelect,
}: {
  state: AsyncState<SupportRequestDto[]>;
  selectedId: string;
  onSelect: (requestId: string) => void;
}) {
  const now = useNow();
  // Keep showing the list while it reloads after an action, so the open request and its notice stay put.
  const view = useKeepPrevious(state);
  return (
    <AsyncSection
      state={view}
      isEmpty={(rows) => rows.length === 0}
      emptyMessage={
        <section className={styles.card}>
          <p className={styles.intro}>
            You have not sent any request yet. Use “Send a request” to contact
            us.
          </p>
        </section>
      }
    >
      {(rows) => {
        const selected = rows.find((r) => r.requestId === selectedId) ?? null;
        return (
          <div className={styles.requests} data-detail={selected ? "open" : "closed"}>
            <section className={styles.card} aria-label="My requests">
              <h2 className={styles.listTitle}>My requests</h2>
              <ul className={styles.history}>
                {rows.map((row) => {
                  const action = needsMemberConfirmation(row);
                  return (
                    <li key={row.requestId}>
                      <button
                        type="button"
                        className={styles.requestItem}
                        data-selected={row.requestId === selectedId}
                        data-action={action}
                        aria-current={
                          row.requestId === selectedId ? "true" : undefined
                        }
                        onClick={() => onSelect(row.requestId)}
                      >
                        <span className={styles.historyHead}>
                          <strong>{supportCategoryLabel(row.category)}</strong>
                          <StagePill row={row} />
                        </span>
                        <span className={styles.meta}>
                          {formatDateTime(row.createdAt)}
                        </span>
                        <span className={styles.snippet}>{row.description}</span>
                        {action && (
                          <span className={styles.actionFlag}>
                            Action needed: confirm you received the money
                          </span>
                        )}
                        {!action && isRequestOpen(row) && row.isOverdue && (
                          <span className={styles.lateFlag}>
                            Taking longer than usual
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
            {selected ? (
              <section className={styles.card}>
                <RequestDetail
                  key={selected.requestId}
                  row={selected}
                  now={now}
                  onChanged={state.reload}
                  onBack={() => onSelect("")}
                />
              </section>
            ) : (
              <section className={`${styles.card} ${styles.detailEmpty}`}>
                <p className={styles.intro}>
                  Select a request to see its progress, our reply and any
                  transfer proof.
                </p>
              </section>
            )}
          </div>
        );
      }}
    </AsyncSection>
  );
}
