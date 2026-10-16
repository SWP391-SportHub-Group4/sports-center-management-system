"use client";

import { useRef, useState, type FormEvent } from "react";
import { Dialog, Feedback } from "@/components/ui";
import { useAction, useNow } from "@/lib/useApi";
import { ApiError } from "@/lib/apiClient";
import { formatDateTime } from "@/lib/format";
import { vietnamLocal, vietnamUtc } from "@/lib/vietnam-time";
import {
  classChangeApi,
  changeTypeLabel,
  type ClassChangeRequest,
  type ClassChangeType,
} from "./class-change-api";
import styles from "./class-change.module.css";

export function PendingRequestEditor({
  request,
  onClose,
  onSaved,
  onUnavailable,
}: {
  request: ClassChangeRequest;
  onClose: () => void;
  onSaved: () => void;
  onUnavailable: (message: string) => void;
}) {
  const [type, setType] = useState(request.type);
  const [reason, setReason] = useState(request.reason);
  const initialStart = request.proposedStartAtUtc
    ? vietnamLocal(request.proposedStartAtUtc)
    : "";
  const [start, setStart] = useState(initialStart);
  const action = useAction();
  const lock = useRef(false);
  const now = useNow(1000);
  const future =
    request.status === "PENDING" &&
    Date.parse(request.originalStartAtUtc) > now;
  const cancellationOpen =
    Date.parse(request.originalStartAtUtc) - now >= 6 * 3600000;
  const allowed = future && (type !== "CANCEL_WITH_MAKEUP" || cancellationOpen);
  const dirty =
    type !== request.type ||
    reason !== request.reason ||
    start !== initialStart;

  function close() {
    if (action.busy) return;
    if (!dirty || window.confirm("Discard your unsaved changes?")) onClose();
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!allowed || lock.current) return;
    lock.current = true;
    try {
      const saved = await action.run(async () => {
        const proposedStartAtUtc =
          type !== "SUBSTITUTE" && start ? vietnamUtc(start) : null;
        const proposedEndAtUtc = proposedStartAtUtc
          ? new Date(
              Date.parse(proposedStartAtUtc) +
                Date.parse(request.originalEndAtUtc) -
                Date.parse(request.originalStartAtUtc),
            ).toISOString()
          : null;
        try {
          return await classChangeApi.update(request.requestId, {
            requestId: request.requestId,
            type,
            reason: reason.trim(),
            proposedStartAtUtc,
            proposedEndAtUtc,
          });
        } catch (error) {
          if (
            error instanceof ApiError &&
            ([403, 404].includes(error.status) ||
              [
                "class_change_not_pending",
                "class_change_stale",
                "session_not_assigned",
                "session_not_editable",
              ].includes(error.code))
          )
            onUnavailable(
              "This request can no longer be edited. The latest status has been loaded.",
            );
          throw error;
        }
      });
      if (saved) onSaved();
    } finally {
      lock.current = false;
    }
  }

  return (
    <Dialog
      title="Edit pending request"
      description="Update the request sent to your Manager. Your teaching schedule changes only after approval."
      onClose={close}
      footer={
        <div className={styles.actions}>
          <button
            className="btn btn--quiet"
            type="button"
            disabled={action.busy}
            onClick={close}
          >
            Cancel
          </button>
          <button
            className="btn"
            type="submit"
            form="pending-request-edit"
            disabled={action.busy || !allowed || !dirty}
          >
            {action.busy ? "Saving changes…" : "Save changes"}
          </button>
        </div>
      }
    >
      <p>
        <strong>
          {request.className} · Session {request.sessionNo}
        </strong>
        <br />
        {formatDateTime(request.originalStartAtUtc)}
      </p>
      <form id="pending-request-edit" className={styles.form} onSubmit={save}>
        <label>
          Requested change
          <select
            value={type}
            disabled={action.busy || !future}
            onChange={(e) => setType(e.target.value as ClassChangeType)}
          >
            {(["SUBSTITUTE", "RESCHEDULE", "CANCEL_WITH_MAKEUP"] as const).map(
              (option) => (
                <option
                  key={option}
                  value={option}
                  disabled={
                    option === "CANCEL_WITH_MAKEUP" && !cancellationOpen
                  }
                >
                  {changeTypeLabel(option, false)}
                </option>
              ),
            )}
          </select>
        </label>
        <label>
          Reason
          <textarea
            required
            minLength={3}
            maxLength={500}
            rows={4}
            value={reason}
            disabled={action.busy || !future}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        {type !== "SUBSTITUTE" && (
          <label>
            Suggested start (optional)
            <input
              type="datetime-local"
              value={start}
              disabled={action.busy || !future}
              onChange={(e) => setStart(e.target.value)}
            />
            <small>Vietnam time. Session duration stays unchanged.</small>
          </label>
        )}
        {!future && (
          <p role="status">
            This session has started. Its request can no longer be edited.
          </p>
        )}
        {future && !allowed && (
          <p role="status">
            Cancellation requires at least 6 hours’ notice. You can request a
            reschedule or substitute.
          </p>
        )}
        <Feedback error={action.error} />
      </form>
    </Dialog>
  );
}
