"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import QRCode from "qrcode";
import { useLanguage } from "@/lib/language";
import { formatMoney, formatDateTime } from "@/lib/format";
import type { PaymentAttemptDto } from "@/lib/types";
export function PaymentAttemptPanel({
  attempt,
}: {
  attempt: PaymentAttemptDto;
}) {
  const { t } = useLanguage();
  const [qr, setQr] = useState("");
  const [error, setError] = useState("");
  const url =
    attempt.paymentUrl && /^https?:\/\//i.test(attempt.paymentUrl)
      ? attempt.paymentUrl
      : null;
  useEffect(() => {
    if (!url) return;
    let active = true;
    QRCode.toDataURL(url)
      .then((value) => {
        if (active) setQr(value);
      })
      .catch(() => {
        if (active) setError(t.refactor.uncertain);
      });
    return () => {
      active = false;
    };
  }, [url, t.refactor.uncertain]);
  return (
    <section aria-label={t.refactor.paymentLink}>
      {attempt.gatewayMode === "MOCK" && (
        <p role="status">{t.refactor.mockPayment}</p>
      )}
      {qr && (
        <Image
          unoptimized
          src={qr}
          width={200}
          height={200}
          alt={t.refactor.paymentLink}
        />
      )}
      <p>
        {formatMoney(attempt.cashAmount)} ·{" "}
        {formatDateTime(attempt.expiresAtUtc)}
      </p>
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer">
          {t.refactor.paymentLink}
        </a>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
