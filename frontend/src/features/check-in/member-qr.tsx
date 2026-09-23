"use client";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import Image from "next/image";
import { Card, Button } from "@/shared/ui";

export interface QrPass {
  value: string;
  expiresAt: number;
}
export interface QrPassIssuer {
  issue(): Promise<QrPass>;
}
export function MemberQr({
  name,
  issuer,
}: {
  name: string;
  issuer: QrPassIssuer;
}) {
  const [pass, setPass] = useState<QrPass | null>(null);
  const [image, setImage] = useState("");
  const [seconds, setSeconds] = useState(60);
  const [error, setError] = useState(false);
  const expires = useRef(0);
  const refreshRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    let mounted = true;
    let refreshing = false;
    async function refresh() {
      if (refreshing) return;
      refreshing = true;
      try {
        const next = await issuer.issue();
        const png = await QRCode.toDataURL(next.value, {
          width: 232,
          margin: 4,
          errorCorrectionLevel: "M",
          color: { dark: "#1A2B4C", light: "#FFFFFF" },
        });
        if (mounted) {
          expires.current = next.expiresAt;
          setPass(next);
          setImage(png);
          setSeconds(
            Math.max(0, Math.ceil((next.expiresAt - Date.now()) / 1000)),
          );
          setError(false);
        }
      } catch {
        if (mounted) {
          setError(true);
          setImage("");
        }
      } finally {
        refreshing = false;
      }
    }
    refreshRef.current = () => {
      void refresh();
    };
    void refresh();
    const tick = () => {
      const left = Math.max(
        0,
        Math.ceil((expires.current - Date.now()) / 1000),
      );
      setSeconds(left);
      if (left === 0) {
        setImage("");
        void refresh();
      }
    };
    const timer = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      mounted = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [issuer]);
  return (
    <Card className="qr-card">
      <h2>QR của tôi</h2>
      {image && seconds > 0 ? (
        <Image
          unoptimized
          className="qr-image"
          src={image}
          alt={`Mã QR cá nhân của ${name}. Mã thử nghiệm, không dùng check-in thực tế.`}
          width={232}
          height={232}
          data-testid="member-qr"
          data-expires={pass?.expiresAt}
        />
      ) : (
        <div className="qr-placeholder" role="status">
          {error ? "Chưa tạo được mã QR." : "Đang làm mới mã…"}
        </div>
      )}
      <strong>{name} · Hội viên</strong>
      <p className="muted" aria-live="off">
        Tự động làm mới sau{" "}
        <span data-testid="qr-countdown">
          00:{String(seconds).padStart(2, "0")}
        </span>
      </p>
      <p className="muted">Mã thử nghiệm · không có hiệu lực tại quầy.</p>
      {error && <Button onClick={() => refreshRef.current()}>Thử lại</Button>}
    </Card>
  );
}
