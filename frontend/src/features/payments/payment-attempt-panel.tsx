"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import QRCode from "qrcode";
import { useLanguage } from "@/lib/language";
import { api } from "@/lib/apiClient";
import { Button } from "@/components/primitives";
import { formatMoney, formatDateTime } from "@/lib/format";
import type { PaymentAttemptDto } from "@/lib/types";
export function PaymentAttemptPanel({
  attempt,
  onSimulated,
}: {
  attempt: PaymentAttemptDto;
  onSimulated?: () => void;
}) {
  const { t, language } = useLanguage();
  const vi = language === "vi";
  const [simulating, setSimulating] = useState(false);
  const [simError, setSimError] = useState("");
  async function simulate(success: boolean) {
    if (simulating) return;
    setSimulating(true);
    setSimError("");
    try {
      await api.post(
        `/api/dev/payments/${encodeURIComponent(attempt.transactionReference)}/simulate?success=${success}`,
      );
      onSimulated?.();
    } catch (e) {
      setSimError(e instanceof Error ? e.message : String(e));
    } finally {
      setSimulating(false);
    }
  }
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
      {attempt.gatewayMode === "MOCK" && (
        <div>
          <Button
            variant="primary"
            loading={simulating}
            onClick={() => void simulate(true)}
          >
            {vi
              ? "Mô phỏng thanh toán thành công"
              : "Simulate successful payment"}
          </Button>{" "}
          <Button
            variant="secondary"
            disabled={simulating}
            onClick={() => void simulate(false)}
          >
            {vi ? "Mô phỏng thanh toán thất bại" : "Simulate failed payment"}
          </Button>
          {simError && <p role="alert">{simError}</p>}
        </div>
      )}
    </section>
  );
}
