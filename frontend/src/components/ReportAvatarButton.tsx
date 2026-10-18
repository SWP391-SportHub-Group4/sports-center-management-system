"use client";

import { useState } from "react";
import { api } from "@/lib/apiClient";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
import { Dialog } from "@/components/ui";
import styles from "./ReportAvatarButton.module.css";

export function ReportAvatarButton({
  targetUserId,
  avatarUrl,
}: {
  targetUserId: string;
  avatarUrl?: string | null;
}) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const vi = language === "vi";
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  if (
    !user ||
    user.role === "Member" ||
    user.userId === targetUserId ||
    !avatarUrl
  )
    return null;

  function close() {
    if (busy) return;
    setOpen(false);
    setError("");
  }

  return (
    <>
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        onClick={() => {
          setSent(false);
          setOpen(true);
        }}
      >
        {vi ? "Báo cáo ảnh" : "Report photo"}
      </button>
      {sent && (
        <span className={styles.sent} role="status">
          {vi ? "Đã gửi báo cáo cho Manager." : "Report sent to the manager."}
        </span>
      )}
      {open && (
        <Dialog
          title={vi ? "Báo cáo ảnh đại diện" : "Report profile photo"}
          description={
            vi
              ? "Manager sẽ xem xét ảnh này. Hãy nêu rõ lý do."
              : "A manager will review this photo. Say what is wrong with it."
          }
          onClose={close}
        >
          <form
            className={styles.form}
            onSubmit={async (event) => {
              event.preventDefault();
              if (busy) return;
              setBusy(true);
              setError("");
              try {
                await api.post("/api/avatars/reports", {
                  targetUserId,
                  reason: reason.trim(),
                });
                setSent(true);
                setOpen(false);
                setReason("");
              } catch (cause) {
                setError(
                  cause instanceof Error ? cause.message : String(cause),
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className={styles.label}>
              {vi
                ? "Vì sao ảnh này không phù hợp?"
                : "Why is this photo inappropriate?"}
              <textarea
                value={reason}
                rows={4}
                maxLength={500}
                minLength={10}
                required
                onChange={(event) => setReason(event.target.value)}
              />
              <span className={styles.count}>{reason.trim().length}/500</span>
            </label>
            {error && <p role="alert">{error}</p>}
            <div className={styles.actions}>
              <button
                type="button"
                className="btn btn--secondary"
                disabled={busy}
                onClick={close}
              >
                {vi ? "Hủy" : "Cancel"}
              </button>
              <button
                className="btn"
                disabled={busy || reason.trim().length < 10}
                type="submit"
              >
                {vi ? "Gửi báo cáo" : "Send report"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
