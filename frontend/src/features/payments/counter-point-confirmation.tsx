"use client";
import { Field } from "@/components/ui";
import { Button, Input } from "@/components/primitives";
import { useLanguage } from "@/lib/language";
import { formatDateTime } from "@/lib/format";
import styles from "./checkout-panel.module.css";
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
    <section className={styles.otp} aria-label={t.refactor.otp}>
      <Field
        label={t.refactor.otp}
        hint={`${t.refactor.expires}: ${formatDateTime(confirmation.expiresAtUtc)} · ${Math.max(0, 5 - (confirmation.failedAttempts ?? 0))}/5`}
      >
        <Input
          className={styles.otpInput}
          autoComplete="one-time-code"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          value={code}
          onChange={(e) => onCodeChange(e.target.value.replace(/\D/g, ""))}
          disabled={busy || expired || locked}
        />
      </Field>
      {expired && <p role="status">{t.refactor.codeExpired}</p>}
      {locked && <p role="status">{t.refactor.otpLocked}</p>}
      <div className={styles.actions}>
        <Button
          disabled={busy || expired || locked || code.length !== 6}
          onClick={onVerify}
        >
          {t.refactor.verify}
        </Button>
        <Button
          variant="secondary"
          disabled={busy || serverNow < resendAt}
          onClick={onResend}
        >
          {t.refactor.resendCode}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={onClear}>
          {t.refactor.clearPoints}
        </Button>
      </div>
    </section>
  );
}
