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
import { memberEnrollments } from "@/features/member/api";
import { rentalApi } from "@/features/rentals";
import type { MemberPackageDto } from "@/lib/types";
import type { MemberCheckInCode } from "@/lib/member-code";
import styles from "./MemberShell.module.css";
import codeStyles from "./MemberCodeCard.module.css";

/**
 * Nút mã hội viên. Mã QR do server cấp chỉ để lễ tân nhận ra hội viên và là MỘT mã duy nhất cho
 * mỗi hội viên, dùng chung cho Gym, lớp và thuê sân. Chỉ hiện khi Member đang có ít nhất một
 * dịch vụ còn hiệu lực (gói Gym/vé ngày, lớp đang học hoặc lượt thuê sân chưa kết thúc).
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
        const nowMs = Date.now();
        const none = async <T,>(work: Promise<T[]>) =>
          work.catch(() => [] as T[]);
        const controller = new AbortController();
        const [packages, enrollments, rentals] = await Promise.all([
          none(api.get<MemberPackageDto[]>("/api/members/me/packages")),
          none(memberEnrollments(controller.signal)),
          none(
            rentalApi.mine(
              new Date(nowMs - 86_400_000).toISOString(),
              new Date(nowMs + 31 * 86_400_000).toISOString(),
            ),
          ),
        ]);
        const hasGym = packages.some(
          (p) =>
            p.status.toUpperCase() === "ACTIVE" &&
            p.isUsable &&
            p.startDate.slice(0, 10) <= today &&
            p.endDate.slice(0, 10) >= today,
        );
        const hasClass = enrollments.some(
          (e) =>
            e.status === "CONFIRMED" &&
            !e.endedAt &&
            (!e.lastSessionEndUtc || Date.parse(e.lastSessionEndUtc) >= nowMs),
        );
        const hasRental = rentals.some(
          (x) => x.status === "CONFIRMED" && Date.parse(x.endAtUtc) >= nowMs,
        );
        const ok = hasGym || hasClass || hasRental;
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
                    ? "No member code yet: you don't have an active Gym plan, class or court rental."
                    : "Chưa có mã hội viên vì bạn chưa có gói Gym, lớp học hoặc lượt thuê sân còn hiệu lực."}
                </p>
                <Link
                  className="btn"
                  href="/member/services"
                  onClick={() => setOpen(false)}
                >
                  {en ? "Explore services" : "Xem dịch vụ"}
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
