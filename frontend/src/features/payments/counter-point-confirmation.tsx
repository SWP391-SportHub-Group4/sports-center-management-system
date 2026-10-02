"use client";
import { useLanguage } from "@/lib/language";
import { formatDateTime } from "@/lib/format";
export interface CounterConfirmation {
  confirmationId: string;
  expiresAtUtc: string;
  revision: number;
  points?: number;
  failedAttempts?: number;
  status?: string;
  resendAtUtc?: string;
}
export function CounterPointConfirmation({
  confirmation,
  code,
  onCodeChange,
  busy,
  serverNow,
  resendAt,
  onVerify,
  onClear,
  onResend,
}: {
  confirmation: CounterConfirmation;
  code: string;
  onCodeChange: (value: string) => void;
  busy: boolean;
  serverNow: number;
  resendAt: number;
  onVerify: () => void;
  onClear: () => void;
  onResend: () => void;
}) {
  const { t } = useLanguage();
  const expired = serverNow >= Date.parse(confirmation.expiresAtUtc);
  const locked = (confirmation.failedAttempts ?? 0) >= 5;
  return (
    <section aria-label={t.refactor.otp}>
      <label>
        {t.refactor.otp}
        <input
          autoComplete="one-time-code"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          value={code}
          onChange={(e) => onCodeChange(e.target.value.replace(/\D/g, ""))}
          disabled={busy || expired || locked}
        />
      </label>
      <p>
        {t.refactor.expires}: {formatDateTime(confirmation.expiresAtUtc)} ·{" "}
        {Math.max(0, 5 - (confirmation.failedAttempts ?? 0))}/5
      </p>
      {expired && <p role="status">{t.refactor.codeExpired}</p>}
      {locked && <p role="status">{t.refactor.otpLocked}</p>}
      <button
        className="btn btn--secondary"
        disabled={busy || expired || locked || code.length !== 6}
        onClick={onVerify}
      >
        {t.refactor.verify}
      </button>
      <button
        className="btn btn--secondary"
        disabled={busy || serverNow < resendAt}
        onClick={onResend}
      >
        {t.refactor.resendCode}
      </button>
      <button className="btn btn--secondary" disabled={busy} onClick={onClear}>
        {t.refactor.clearPoints}
      </button>
    </section>
  );
}
