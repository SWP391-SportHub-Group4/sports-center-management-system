"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Dialog } from "@/components/ui";
import { IconQrCode } from "@/components/icons";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
import { memberCodePayload } from "@/lib/member-code";
import styles from "./MemberShell.module.css";
import codeStyles from "./MemberCodeCard.module.css";

/**
 * Nút mã hội viên trên thanh đầu dashboard. Bấm vào mở popup nhỏ chứa QR để lễ tân quét.
 * Mã chỉ định danh hội viên, không phải vé vào cửa.
 */
export function MemberCodeButton() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const [open, setOpen] = useState(false);
  const [dataUrl, setDataUrl] = useState("");
  const userId = user?.userId;

  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    QRCode.toDataURL(memberCodePayload(userId), { width: 240, margin: 1 })
      .then((url) => !cancelled && setDataUrl(url))
      .catch(() => !cancelled && setDataUrl(""));
    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  if (!userId) return null;
  const en = language === "en";
  const label = en ? "Member code" : "Mã hội viên";

  return (
    <>
      <button
        type="button"
        className={styles.qrButton}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={label}
        title={label}
      >
        <span className={styles.qrIconWrapper}>
          <IconQrCode size={14} />
        </span>
        <span className={styles.qrTextTitle}>{label}</span>
      </button>
      {open && (
        <Dialog
          title={label}
          size="sm"
          className={codeStyles.dialog}
          description={
            en
              ? "Show this code to the front desk so they can find your account. It does not grant entry by itself."
              : "Đưa mã này cho lễ tân để tìm tài khoản của bạn. Mã không tự cấp quyền vào cửa."
          }
          onClose={() => setOpen(false)}
        >
          <div className={codeStyles.content}>
            {dataUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={dataUrl}
                width={240}
                height={240}
                className={codeStyles.qr}
                alt={en ? "Member code QR" : "Mã QR hội viên"}
              />
            )}
            <p className={`small muted ${codeStyles.memberId}`}>
              {userId}
            </p>
          </div>
        </Dialog>
      )}
    </>
  );
}
