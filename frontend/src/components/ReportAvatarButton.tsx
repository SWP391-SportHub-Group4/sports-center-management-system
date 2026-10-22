"use client";
import { useState } from "react";
import { Flag } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/apiClient";
import { useAction } from "@/lib/useApi";
import { Dialog, Field } from "./ui";

export function ReportAvatarButton({
  userId,
  avatarUrl,
  name,
}: {
  userId: string;
  avatarUrl?: string | null;
  name: string;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const action = useAction();
  if (
    !user ||
    user.userId === userId ||
    !avatarUrl ||
    user.role === "CenterManager"
  )
    return null;
  return (
    <>
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        aria-label={`Report ${name}'s profile photo`}
        onClick={() => {
          action.reset();
          setOpen(true);
        }}
      >
        <Flag size={15} aria-hidden="true" />
        Report photo
      </button>
      {open && (
        <Dialog
          title="Report profile photo"
          onClose={() => {
            if (!action.busy) setOpen(false);
          }}
        >
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void action.run(async () => {
                await api.post("/api/avatars/reports", {
                  targetUserId: userId,
                  avatarUrl,
                  reason: reason.trim(),
                });
              }, "Report sent to the center manager.");
            }}
          >
            {action.success ? (
              <>
                <p role="status">{action.success}</p>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setOpen(false)}
                >
                  Done
                </button>
              </>
            ) : (
              <>
                <p>{name}</p>
                <Field label="Reason" required>
                  <textarea
                    required
                    minLength={3}
                    maxLength={500}
                    rows={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </Field>
                {action.error && <p role="alert">{action.error}</p>}
                <button
                  className="btn"
                  disabled={action.busy || reason.trim().length < 3}
                >
                  {action.busy ? "Sending…" : "Send report"}
                </button>
              </>
            )}
          </form>
        </Dialog>
      )}
    </>
  );
}
