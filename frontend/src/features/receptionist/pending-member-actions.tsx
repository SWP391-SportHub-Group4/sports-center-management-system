"use client";
import { useState } from "react";
import { api } from "@/lib/apiClient";
import { useNow } from "@/lib/useApi";
import { Dialog, Field } from "@/components/ui";
import { useLanguage } from "@/lib/language";
import type { UserAdminDto } from "@/lib/types";

export function PendingMemberActions({
  member,
  onChanged,
}: {
  member: UserAdminDto;
  onChanged: () => void;
}) {
  const { t } = useLanguage();
  const l = t.frontDesk;
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState(member.email);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [failed, setFailed] = useState(false);
  const now = useNow(1000);
  const seconds = Math.max(
    0,
    Math.ceil(
      ((member.activationResendAvailableAtUtc
        ? Date.parse(member.activationResendAvailableAtUtc)
        : 0) -
        now) /
        1000,
    ),
  );
  async function send(change: boolean) {
    if (busy) return;
    setBusy(true);
    setFeedback("");
    setFailed(false);
    try {
      if (change)
        await api.put(`/api/members/front-desk/${member.userId}/email`, {
          email: email.trim(),
          reason: reason.trim(),
        });
      else
        await api.post(
          `/api/members/front-desk/${member.userId}/resend-activation`,
        );
      setEditing(false);
      setFeedback("Activation email sent.");
      onChanged();
    } catch (cause) {
      setFailed(true);
      setFeedback(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }
  if (!member.activationPending) return null;
  return (
    <>
      <button
        type="button"
        className="btn btn--secondary btn--sm"
        disabled={busy || seconds > 0}
        onClick={() => void send(false)}
      >
        {l.resendActivation}
        {seconds > 0 ? ` (${seconds}s)` : ""}
      </button>
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        disabled={busy}
        onClick={() => {
          setFeedback("");
          setEditing(true);
        }}
      >
        {l.changeEmail}
      </button>
      {feedback && !editing && (
        <p role={failed ? "alert" : "status"}>{feedback}</p>
      )}
      {editing && (
        <Dialog
          title={l.changeEmail}
          onClose={() => {
            if (!busy) setEditing(false);
          }}
        >
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void send(true);
            }}
          >
            <Field label={l.newEmail} required>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label={t.staffWork.reason} required>
              <textarea
                required
                minLength={3}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            {failed && feedback && <p role="alert">{feedback}</p>}
            <button
              className="btn"
              disabled={
                busy ||
                reason.trim().length < 3 ||
                email.trim() === member.email
              }
            >
              {busy ? "Sending…" : l.saveNewEmail}
            </button>
          </form>
        </Dialog>
      )}
    </>
  );
}
