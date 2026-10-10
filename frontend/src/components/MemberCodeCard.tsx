"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { api, ApiError } from "@/lib/apiClient";
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
  const [error, setError] = useState<
    "network" | "forbidden" | "missing" | "generic" | null
  >(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const userId = user?.userId;

  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    api
      .get<{ code: string; expiresAtUtc: string }>("/api/member-codes/me")
      .then(async ({ code: issued }) => {
        const url = await QRCode.toDataURL(memberCodePayload(issued), {
          width: 240,
          margin: 1,
        });
        if (!cancelled) {
          setCode(issued);
          setDataUrl(url);
          setError(null);
          // Refresh before the server's five-minute expiry while the dialog stays open.
          refreshTimer = setTimeout(
            () => {
              setCode("");
              setDataUrl("");
              setRefreshVersion((version) => version + 1);
            },
            4 * 60 * 1000,
          );
        }
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setCode("");
        setDataUrl("");
        setError(
          reason instanceof ApiError
            ? reason.status === 0
              ? "network"
              : reason.status === 403
                ? "forbidden"
                : reason.status === 404
                  ? "missing"
                  : "generic"
            : "generic",
        );
      });
    return () => {
      cancelled = true;
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, [open, userId, refreshVersion]);

  if (!userId) return null;
  const en = language === "en";
  const label = en ? "Member QR code" : "Mã QR hội viên";
  const actionLabel = en ? "Show member QR code" : "Hiển thị mã QR hội viên";

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
          setError(null);
        }}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={actionLabel}
        title={actionLabel}
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
            {!dataUrl && !error && (
              <p role="status">
                {en ? "Loading member code..." : "Đang tạo mã hội viên..."}
              </p>
            )}
            {error && (
              <>
                <p role="alert">
                  {error === "network"
                    ? en
                      ? "Cannot connect to the server."
                      : "Không kết nối được máy chủ."
                    : error === "forbidden"
                      ? en
                        ? "Your member account is not active."
                        : "Tài khoản hội viên chưa hoạt động."
                      : error === "missing"
                        ? en
                          ? "Member codes are not available on this server yet."
                          : "Máy chủ chưa được cập nhật chức năng mã hội viên."
                        : en
                          ? "Could not load member code."
                          : "Chưa tải được mã hội viên."}
                </p>
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => {
                    setError(null);
                    setRefreshVersion((version) => version + 1);
                  }}
                >
                  {en ? "Try again" : "Thử lại"}
                </button>
              </>
            )}
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
            <p className={`small muted ${codeStyles.memberId}`}>
              {en ? "Code expires in 5 minutes" : "Mã hết hạn sau 5 phút"}
            </p>
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
                  ? "Copy is unavailable. Show the QR code to the front desk instead."
                  : "Chưa sao chép được. Hãy đưa mã QR cho lễ tân quét."}
              </p>
            )}
          </div>
        </Dialog>
      )}
    </>
  );
}
