"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Card } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
import { memberCodePayload } from "@/lib/member-code";

/** Member identifier QR for the front desk to look up the account. Not an entry pass. */
export function MemberCodeCard() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const [dataUrl, setDataUrl] = useState("");
  const userId = user?.userId;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    QRCode.toDataURL(memberCodePayload(userId), { width: 192, margin: 1 })
      .then((url) => !cancelled && setDataUrl(url))
      .catch(() => !cancelled && setDataUrl(""));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!userId) return null;
  const en = language === "en";
  return (
    <Card title={en ? "Member code" : "Mã hội viên"}>
      {dataUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={dataUrl}
          width={192}
          height={192}
          alt={en ? "Member code QR" : "Mã QR hội viên"}
        />
      )}
      <p className="small muted">
        {en
          ? "Show this code to the front desk so they can find your account. It does not grant entry by itself."
          : "Đưa mã này cho lễ tân để tìm tài khoản của bạn. Mã không tự cấp quyền vào cửa."}
      </p>
      <p className="small muted">{userId}</p>
    </Card>
  );
}
