"use client";

import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { api } from "@/lib/apiClient";
import { useLanguage } from "@/lib/language";
import { Dialog } from "@/components/ui";
import { publishUserAvatar, type UserAvatarResponse } from "@/lib/user-avatar";

export function RemoveMemberAvatarButton({
  memberId,
  memberName,
  onRemoved,
  administrator = false,
}: {
  memberId: string;
  memberName: string;
  onRemoved: () => void;
  administrator?: boolean;
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const removing = useRef(false);

  async function remove() {
    if (removing.current) return;
    removing.current = true;
    setBusy(true);
    setError("");
    try {
      const photo = await api.del<UserAvatarResponse>(
        administrator
          ? `/api/admin/users/${memberId}/avatar`
          : `/api/manager/members/${memberId}/avatar`,
      );
      publishUserAvatar(photo);
      setOpen(false);
      onRemoved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      removing.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={
          administrator ? "btn btn--danger" : "btn btn--secondary btn--sm"
        }
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        {administrator && <Trash2 size={16} aria-hidden="true" />}
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
              className={administrator ? "btn btn--danger" : "btn"}
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
