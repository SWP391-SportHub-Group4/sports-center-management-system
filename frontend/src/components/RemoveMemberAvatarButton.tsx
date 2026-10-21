"use client";

import { useState } from "react";
import { api } from "@/lib/apiClient";
import { useLanguage } from "@/lib/language";
import { Dialog } from "@/components/ui";

export function RemoveMemberAvatarButton({
  memberId,
  memberName,
  onRemoved,
}: {
  memberId: string;
  memberName: string;
  onRemoved: () => void;
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api.del(`/api/manager/users/${memberId}/avatar`);
      setOpen(false);
      onRemoved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn btn--secondary btn--sm"
        onClick={() => setOpen(true)}
      >
        {vi ? "Gỡ ảnh" : "Remove photo"}
      </button>
      {open && (
        <Dialog
          title={vi ? "Gỡ ảnh đại diện" : "Remove profile photo"}
          description={
            vi
              ? `Gỡ ảnh hiện tại của ${memberName} nếu không phù hợp. Người dùng có thể tải ảnh mới sau đó.`
              : `Remove ${memberName}'s current photo if it is inappropriate. They can upload a new one later.`
          }
          onClose={() => {
            if (!busy) setOpen(false);
          }}
          showCloseButton={false}
        >
          {error && <p role="alert">{error}</p>}
          <div className="row">
            <button
              type="button"
              className="btn btn--secondary"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              {vi ? "Hủy" : "Cancel"}
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => void remove()}
            >
              {busy
                ? vi
                  ? "Đang gỡ…"
                  : "Removing…"
                : vi
                  ? "Gỡ ảnh"
                  : "Remove photo"}
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
