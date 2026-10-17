"use client";

import { useRef, useState, type FormEvent } from "react";
import { Dialog, Feedback } from "@/components/ui";
import { useAction, useNow } from "@/lib/useApi";
import { ApiError } from "@/lib/apiClient";
import { formatDateTime } from "@/lib/format";
import { classChangeApi, type ClassChangeRequest } from "./class-change-api";
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
  const [reason, setReason] = useState(request.reason);
  const action = useAction();
  const lock = useRef(false);
  const now = useNow(1000);
  const future =
    request.status === "PENDING" &&
    Date.parse(request.originalStartAtUtc) > now;
  const absenceOpen =
    Date.parse(request.originalStartAtUtc) - now >= 6 * 3600000;
  const allowed = future && absenceOpen;
  const dirty = reason !== request.reason;
  const changed = dirty || request.type !== "ABSENCE";

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
        try {
          return await classChangeApi.update(request.requestId, {
            requestId: request.requestId,
            type: "ABSENCE",
            reason: reason.trim(),
            proposedStartAtUtc: null,
            proposedEndAtUtc: null,
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
      description="Update your reason for absence. Your Manager decides on a substitute, reschedule or makeup."
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
            disabled={
              action.busy || !allowed || !changed || reason.trim().length < 3
            }
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
        {request.type !== "ABSENCE" && (
          <p className={styles.hint}>
            Saving converts this earlier request to an absence request. Your
            Manager will choose the resolution.
          </p>
        )}
        <label>
          Reason
          <textarea
            required
            minLength={3}
            maxLength={500}
            rows={4}
            value={reason}
            disabled={action.busy || !allowed}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        {!future && (
          <p role="status">
            This request is no longer pending or its session has started. It can
            no longer be edited.
          </p>
        )}
        {future && !allowed && (
          <p role="status">
            Absence requests must be sent or edited at least 6 hours before
            class. Contact your Manager directly for urgent absences.
          </p>
        )}
        <Feedback error={action.error} />
      </form>
    </Dialog>
  );
}
