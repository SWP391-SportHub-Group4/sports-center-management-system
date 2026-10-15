"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Dialog, Feedback, Field } from "@/components/ui";
import { api, ApiError } from "@/lib/apiClient";
import { formatDateTime } from "@/lib/format";
import { useAction, useNow } from "@/lib/useApi";
import type { UserAdminDto } from "@/lib/types";
import styles from "./StaffActivationActions.module.css";

function CorrectionPanel({
  embedded,
  title,
  description,
  onClose,
  children,
}: {
  embedded: boolean;
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (embedded)
      panel.current?.querySelector<HTMLElement>("input, button")?.focus();
  }, [embedded, title]);
  return embedded ? (
    <section className={styles.correction} ref={panel}>
      <h3>{title}</h3>
      <p className={styles.hint}>{description}</p>
      {children}
    </section>
  ) : (
    <Dialog title={title} description={description} onClose={onClose}>
      {children}
    </Dialog>
  );
}

export function StaffActivationActions({
  account,
  onChanged,
  embedded = false,
  onBusyChange,
}: {
  account: UserAdminDto;
  onChanged: (updated: UserAdminDto) => void;
  embedded?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const now = useNow(1000);
  const action = useAction();
  useEffect(() => {
    onBusyChange?.(action.busy);
  }, [action.busy, onBusyChange]);
  const [editing, setEditing] = useState(false);
  const [review, setReview] = useState(false);
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [retryAt, setRetryAt] = useState(0);
  const controls = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (embedded && !editing && !action.busy)
      controls.current
        ?.querySelector<HTMLElement>("button:not(:disabled)")
        ?.focus();
  }, [embedded, editing, action.busy]);
  const deadline = account.activationExpiresAtUtc;
  const remaining = Math.max(
    0,
    Math.ceil(
      (Math.max(
        retryAt,
        Date.parse(account.activationResendAvailableAtUtc ?? "") || 0,
      ) -
        now) /
        1000,
    ),
  );
  const pending =
    account.role !== "MEMBER" &&
    (account.activationPending ??
      (!account.hasPassword && !account.hasGoogleLink));
  if (!pending || !deadline) return null;
  const expired = Date.parse(deadline) <= now;

  async function resend() {
    if (action.busy || expired || remaining) return;
    const updated = await action.run(async () => {
      try {
        return await api.post<UserAdminDto>(
          `/api/users/${account.userId}/resend-activation`,
        );
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 429)
          setRetryAt(Date.now() + 60_000);
        throw cause;
      }
    }, "Activation email sent.");
    if (updated) {
      setRetryAt(
        Date.parse(updated.activationResendAvailableAtUtc ?? "") ||
          Date.now() + 60_000,
      );
      onChanged(updated);
    }
  }

  return (
    <div className={`stack ${styles.root}`} ref={controls}>
      {(!embedded || !editing) && (
        <>
          <p className="small muted">
            {expired ? "Activation expired" : "Activation expires"}:{" "}
            {formatDateTime(deadline)}
          </p>
          <div className="btn-row">
            <button
              className={embedded ? "btn" : "btn btn--secondary"}
              type="button"
              disabled={action.busy || expired || remaining > 0}
              onClick={resend}
            >
              {action.busy && !editing
                ? "Sending…"
                : remaining
                  ? `Resend in ${remaining}s`
                  : "Resend activation email"}
            </button>
            <button
              className="btn btn--secondary"
              type="button"
              disabled={action.busy || expired}
              onClick={() => {
                setEmail(account.email);
                setReason("");
                setReview(false);
                action.reset();
                setEditing(true);
              }}
            >
              Edit email
            </button>
          </div>
          {!editing && (
            <Feedback error={action.error} success={action.success} />
          )}
        </>
      )}
      {editing && (
        <CorrectionPanel
          embedded={embedded}
          title={
            review ? "Confirm email correction" : "Correct pending staff email"
          }
          description="The recipient must activate the account. Correcting the email does not extend the 24-hour deadline."
          onClose={() => {
            if (!action.busy) setEditing(false);
          }}
        >
          <form
            className="form"
            onSubmit={async (event) => {
              event.preventDefault();
              if (action.busy || expired) return;
              if (email.trim().toLowerCase() === account.email.toLowerCase()) {
                action.setError("Enter a different email address.");
                return;
              }
              if (reason.trim().length < 3) {
                action.setError("Enter a reason with at least 3 characters.");
                return;
              }
              if (!review) {
                action.reset();
                setReview(true);
                return;
              }
              const updated = await action.run(
                () =>
                  api.put<UserAdminDto>(`/api/users/${account.userId}/email`, {
                    email: email.trim(),
                    reason: reason.trim(),
                  }),
                "Email corrected and activation email queued.",
              );
              if (updated) {
                setEditing(false);
                onChanged(updated);
              }
            }}
          >
            {review ? (
              <div className={styles.review}>
                <p>
                  Current email: <strong>{account.email}</strong>
                </p>
                <p>
                  New email: <strong>{email.trim()}</strong>
                </p>
                <p>Reason: {reason.trim()}</p>
                <p>Activation expires: {formatDateTime(deadline)}</p>
                <p>
                  The old link will stop working. A new activation link will be
                  sent to the new email.
                </p>
              </div>
            ) : (
              <>
                <Field label="New email" required>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    maxLength={254}
                  />
                </Field>
                <Field label="Reason" required>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    required
                    minLength={3}
                    maxLength={500}
                  />
                </Field>
              </>
            )}
            <Feedback error={action.error} />
            <div className="btn-row">
              <button
                className="btn btn--secondary"
                type="button"
                disabled={action.busy}
                onClick={() => (review ? setReview(false) : setEditing(false))}
              >
                {review ? "Back" : "Cancel"}
              </button>
              <button
                className="btn"
                type="submit"
                disabled={action.busy || expired}
              >
                {action.busy
                  ? "Saving…"
                  : review
                    ? "Confirm and send activation email"
                    : "Review correction"}
              </button>
            </div>
          </form>
        </CorrectionPanel>
      )}
    </div>
  );
}
