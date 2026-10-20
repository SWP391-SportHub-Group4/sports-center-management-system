"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { Dialog } from "@/components/ui";
import { IconQrCode } from "@/components/icons";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
import { api } from "@/lib/apiClient";
import { todayIso } from "@/lib/format";
import type { MemberPackageDto } from "@/lib/types";
import type { MemberCheckInCode } from "@/lib/member-code";
import styles from "./MemberShell.module.css";
import codeStyles from "./MemberCodeCard.module.css";

/**
 * Nút mã hội viên. Mã QR do server cấp chỉ để lễ tân nhận ra hội viên; chỉ hiện khi Member
 * đang có gói Gym còn hiệu lực (Membership hoặc vé ngày hôm nay), còn không thì gợi ý mua gói.
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
  const [dataUrl, setDataUrl] = useState("");
  const [eligible, setEligible] = useState<boolean | null>(null);
  const userId = user?.userId;

  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const today = todayIso();
        const packages = await api.get<MemberPackageDto[]>(
          "/api/members/me/packages",
        );
        const ok = packages.some(
          (p) =>
            p.status.toUpperCase() === "ACTIVE" &&
            p.isUsable &&
            p.startDate.slice(0, 10) <= today &&
            p.endDate.slice(0, 10) >= today,
        );
        if (cancelled) return;
        setEligible(ok);
        if (!ok) return setDataUrl("");
        const issued = await api.get<MemberCheckInCode>(
          "/api/members/me/checkin-code",
        );
        const url = await QRCode.toDataURL(issued.code, {
          width: 240,
          margin: 1,
        });
        if (!cancelled) setDataUrl(url);
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
          onClick={() => setOpen(true)}
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
          onClose={() => setOpen(false)}
        >
          <div className={codeStyles.content}>
            {eligible === false ? (
              <>
                <p>
                  {en
                    ? "No check-in code yet: you don't have an active Gym membership or day pass."
                    : "Chưa có mã check-in vì bạn chưa có gói Membership Gym hoặc vé ngày còn hiệu lực."}
                </p>
                <Link
                  className="btn"
                  href="/member/services?section=gym&view=explore"
                  onClick={() => setOpen(false)}
                >
                  {en ? "Buy a Gym plan" : "Mua gói Gym"}
                </Link>
              </>
            ) : (
              <>
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
                <p className="small muted">
                  {en ? "Valid today only" : "Chỉ có hiệu lực hôm nay"}
                </p>
                <p className="small">
                  {en
                    ? "Show this code to the receptionist to check in."
                    : "Đưa mã này cho lễ tân để check-in."}
                </p>
              </>
            )}
          </div>
        </Dialog>
      )}
    </>
  );
}
