"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Dialog } from "@/components/ui";
import { IconQrCode } from "@/components/icons";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
import { api } from "@/lib/apiClient";
import type { MemberCheckInCode } from "@/lib/member-code";
import styles from "./MemberShell.module.css";
import codeStyles from "./MemberCodeCard.module.css";

/**
 * Nút mã hội viên trên thanh đầu dashboard. Bấm vào mở popup nhỏ chứa QR để lễ tân quét.
 * Mã chỉ định danh hội viên, không phải vé vào cửa.
 */
export function MemberCodeButton({
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
}: {
  /** Điều khiển từ ngoài (vd. mục trong menu tài khoản); bỏ trống thì tự giữ trạng thái. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
} = {}) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const [ownOpen, setOwnOpen] = useState(false);
  const open = controlledOpen ?? ownOpen;
  const setOpen = (next: boolean) => {
    setOwnOpen(next);
    onOpenChange?.(next);
  };
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [dataUrl, setDataUrl] = useState("");
  const [validUntil, setValidUntil] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const userId = user?.userId;

  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const issued = await api.get<MemberCheckInCode>(
          "/api/members/me/checkin-code",
        );
        if (cancelled) return;
        setValidUntil(issued.expiresAtUtc);
        setDataUrl(
          await QRCode.toDataURL(issued.code, { width: 240, margin: 1 }),
        );
      } catch {
        if (!cancelled) setDataUrl("");
      }
    };
    void refresh();
    // Mã hết hạn cuối ngày giờ VN; lấy lại mỗi 5 phút để qua nửa đêm vẫn có mã mới.
    const timer = window.setInterval(refresh, 300_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [open, userId]);

  if (!userId) return null;
  const en = language === "en";
  const label = en ? "Member code" : "Mã hội viên";

  return (
    <>
      {!hideTrigger && (
        <button
          type="button"
          className={styles.qrButton}
          onClick={() => {
            setOpen(true);
            setCopied(false);
            setCopyError(false);
          }}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={label}
          title={label}
        >
          <span className={styles.qrIconWrapper}>
            <IconQrCode size={14} />
          </span>
          <span className={styles.qrTextTitle}>{label}</span>
        </button>
      )}
      {open && (
        <Dialog
          title={label}
          size="sm"
          className={codeStyles.dialog}
          description={
            en
              ? "Show this code to reception for check-in. Entry requires an active Gym package or a day pass bought today."
              : "Đưa mã cho lễ tân để check-in. Cần gói Gym còn hiệu lực hoặc vé 1 ngày mua trong hôm nay."
          }
          onClose={() => setOpen(false)}
        >
          <div className={codeStyles.content}>
            {dataUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className={codeStyles.qr}
                src={dataUrl}
                width={240}
                height={240}
                alt={en ? "Member code QR" : "Mã QR hội viên"}
              />
            )}
            <strong>{user.fullName}</strong>
            <p>{user.email}</p>
            {validUntil && (
              <p>
                {en
                  ? "This check-in code is valid only today (Vietnam time, GMT+7)."
                  : "Mã check-in chỉ có hiệu lực trong hôm nay (giờ Việt Nam, GMT+7)."}
              </p>
            )}
            <button
              className="btn"
              onClick={async () => {
                try {
                  await api.post("/api/gym-checkins/self", {});
                  setNotice(
                    en ? "Checked in successfully." : "Đã check-in thành công.",
                  );
                } catch (error) {
                  setNotice(
                    error instanceof Error
                      ? error.message
                      : en
                        ? "Check-in failed."
                        : "Check-in thất bại.",
                  );
                }
              }}
            >
              {en ? "Check in now" : "Tự check-in"}
            </button>
            {notice && <p role="status">{notice}</p>}
            <p className={`small muted ${codeStyles.memberId}`}>{userId}</p>
            <button
              className="btn btn--secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(userId);
                  setCopied(true);
                  setCopyError(false);
                } catch {
                  setCopyError(true);
                }
              }}
            >
              {copied
                ? en
                  ? "Copied"
                  : "Đã sao chép"
                : en
                  ? "Copy member code"
                  : "Sao chép mã hội viên"}
            </button>
            {copyError && (
              <p role="alert">
                {en
                  ? "Copy is unavailable. Select the code above to copy it manually."
                  : "Chưa sao chép được. Bạn có thể chọn mã ở trên để sao chép thủ công."}
              </p>
            )}
          </div>
        </Dialog>
      )}
    </>
  );
}
