"use client";

import { useState } from "react";
import { api } from "@/lib/apiClient";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";

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
  const [message, setMessage] = useState("");
  if (
    !user ||
    user.role === "Member" ||
    user.userId === targetUserId ||
    !avatarUrl
  )
    return null;
  return (
    <span>
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        onClick={() => setOpen(!open)}
      >
        {vi ? "Báo cáo ảnh" : "Report photo"}
      </button>
      {open && (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            setBusy(true);
            setMessage("");
            try {
              await api.post("/api/avatars/reports", {
                targetUserId,
                reason: reason.trim(),
              });
              setMessage(
                vi
                  ? "Đã gửi báo cáo cho Manager."
                  : "Report sent to the manager.",
              );
              setOpen(false);
              setReason("");
            } catch (cause) {
              setMessage(
                cause instanceof Error ? cause.message : String(cause),
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            {vi
              ? "Vì sao ảnh này không phù hợp?"
              : "Why is this photo inappropriate?"}
            <textarea
              value={reason}
              maxLength={500}
              minLength={10}
              required
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <button
            className="btn btn--sm"
            disabled={busy || reason.trim().length < 10}
            type="submit"
          >
            {vi ? "Gửi báo cáo" : "Send report"}
          </button>
        </form>
      )}
      {message && <span role="status">{message}</span>}
    </span>
  );
}
