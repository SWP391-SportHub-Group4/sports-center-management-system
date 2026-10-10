"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { api } from "@/lib/apiClient";
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
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [dataUrl, setDataUrl] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);
  const userId = user?.userId;

  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    api.get<{ code: string; expiresAtUtc: string }>("/api/member-codes/me")
      .then(async ({ code: issued }) => {
        const url = await QRCode.toDataURL(memberCodePayload(issued), { width: 240, margin: 1 });
        if (!cancelled) {
          setCode(issued);
          setDataUrl(url);
        }
      })
      .catch(() => { if (!cancelled) setError(true); });
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
        onClick={() => {
          setOpen(true);
          setCopied(false);
          setCopyError(false);
          setCode("");
          setDataUrl("");
          setError(false);
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
            {error && <p role="alert">{en ? "Could not load member code. Please reopen this dialog." : "Chưa tải được mã hội viên. Hãy mở lại cửa sổ này."}</p>}
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
            <p className={`small muted ${codeStyles.memberId}`}>{en ? "Code expires in 5 minutes" : "Mã hết hạn sau 5 phút"}</p>
            <button
              className="btn btn--secondary"
              disabled={!code}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(memberCodePayload(code));
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
