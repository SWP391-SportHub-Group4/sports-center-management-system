"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Dialog } from "@/components/ui";
import { IconQrCode } from "@/components/icons";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
import { api } from "@/lib/apiClient";
import { todayIso } from "@/lib/format";
import type { MemberPackageDto } from "@/lib/types";
import { dayPassCodePayload, memberCodePayload } from "@/lib/member-code";
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
  const [dayPassDate, setDayPassDate] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const userId = user?.userId;

  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    const refresh = async () => {
      const today = todayIso();
      let hasDayPass = false;
      try {
        const packages = await api.get<MemberPackageDto[]>("/api/members/me/packages");
        hasDayPass = packages.some((p) => p.packageId === 50000 && p.status.toUpperCase() === "ACTIVE"
          && p.isUsable && p.startDate.slice(0, 10) === today && p.endDate.slice(0, 10) === today);
      } catch { /* Keep the ordinary member ID available if package lookup fails. */ }
      if (cancelled) return;
      setDayPassDate(hasDayPass ? today : null);
      const payload = hasDayPass ? dayPassCodePayload(userId, today) : memberCodePayload(userId);
      QRCode.toDataURL(payload, { width: 240, margin: 1 })
        .then((url) => !cancelled && setDataUrl(url))
        .catch(() => !cancelled && setDataUrl(""));
    };
    void refresh();
    const timer = window.setInterval(refresh, 60_000);
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
              ? "Show this code to reception for check-in. Entry requires an active Gym package. A day pass works only on its payment day (Vietnam time)."
              : "Đưa mã cho lễ tân để check-in. Cần gói Gym còn hiệu lực. Vé 1 ngày chỉ dùng trong ngày thanh toán (giờ Việt Nam)."
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
            {dayPassDate && <p>{en ? "Day-pass check-in code: valid only today" : "Mã check-in vé ngày: chỉ có hiệu lực hôm nay"} ({dayPassDate}, GMT+7).</p>}
            <button className="btn" onClick={async () => {
              try {
                await api.post("/api/gym-checkins/self", {});
                setNotice(en ? "Checked in successfully." : "Đã check-in thành công.");
              } catch (error) {
                setNotice(error instanceof Error ? error.message : (en ? "Check-in failed." : "Check-in thất bại."));
              }
            }}>{en ? "Check in now" : "Tự check-in"}</button>
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
