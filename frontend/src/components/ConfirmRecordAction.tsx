"use client";

import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Dialog, Field } from "@/components/ui";
import { ApiError } from "@/lib/apiClient";
import { useLanguage } from "@/lib/language";
import styles from "./confirm-record-action.module.css";

export function ConfirmRecordAction({
  label,
  triggerIcon,
  title,
  description,
  recordName,
  requireReason = false,
  disabled = false,
  onConfirm,
  onCompleted,
}: {
  label: string;
  triggerIcon?: ReactNode;
  title: string;
  description: string;
  recordName: string;
  requireReason?: boolean;
  disabled?: boolean;
  onConfirm: (reason: string) => Promise<unknown>;
  onCompleted: () => void;
}) {
  const { t } = useLanguage();
  const l = t.recordActions;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [unknown, setUnknown] = useState(false);
  const lock = useRef(false);
  const close = () => {
    if (lock.current) return;
    setOpen(false);
    if (unknown) onCompleted();
  };
  return (
    <>
      <button
        type="button"
        className={`btn btn--secondary ${styles.trigger} ${triggerIcon ? styles.iconOnly : ""}`}
        aria-label={triggerIcon ? label : undefined}
        title={triggerIcon ? label : undefined}
        disabled={disabled}
        onClick={() => {
          setReason("");
          setError("");
          setUnknown(false);
          setOpen(true);
        }}
      >
        {triggerIcon ?? label}
      </button>
      {open &&
        createPortal(
          <Dialog
            title={title}
            description={description}
            size="sm"
            onClose={close}
          >
            <form
              className={styles.form}
              aria-busy={busy}
              onSubmit={async (event) => {
                event.preventDefault();
                const trimmed = reason.trim();
                if (
                  lock.current ||
                  unknown ||
                  (requireReason &&
                    (trimmed.length < 3 || trimmed.length > 500))
                )
                  return;
                lock.current = true;
                setBusy(true);
                setError("");
                let completed = false;
                try {
                  await onConfirm(trimmed);
                  completed = true;
                } catch (cause) {
                  const uncertain =
                    !(cause instanceof ApiError) ||
                    cause.status === 0 ||
                    cause.status >= 500;
                  setUnknown(uncertain);
                  const code = cause instanceof ApiError ? cause.code : "";
                  setError(
                    uncertain
                      ? l.unknownResult
                      : code === "room_in_use"
                        ? l.roomInUse
                        : code === "room_type_in_use"
                          ? l.roomTypeInUse
                          : code === "rental_not_cancellable"
                            ? l.rentalNotCancellable
                            : cause instanceof Error
                              ? cause.message
                              : l.failed,
                  );
                } finally {
                  lock.current = false;
                  setBusy(false);
                }
                if (completed) {
                  setOpen(false);
                  onCompleted();
                }
              }}
            >
              <strong className={styles.record}>{recordName}</strong>
              {requireReason && (
                <Field label={l.reason} required>
                  <textarea
                    required
                    minLength={3}
                    maxLength={500}
                    rows={3}
                    disabled={busy || unknown}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </Field>
              )}
              {error && (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              )}
              <div className={styles.actions}>
                <button
                  type="button"
                  className={`btn btn--secondary ${styles.neutral}`}
                  disabled={busy}
                  onClick={close}
                >
                  {unknown ? l.closeAndRefresh : t.operations.cancel}
                </button>
                <button
                  type="submit"
                  className={`btn ${styles.confirm}`}
                  disabled={
                    busy ||
                    unknown ||
                    (requireReason && reason.trim().length < 3)
                  }
                >
                  {busy ? l.processing : label}
                </button>
              </div>
            </form>
          </Dialog>,
          document.body,
        )}
    </>
  );
}
