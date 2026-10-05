"use client";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/apiClient";
import { Feedback, Field } from "@/components/ui";
import { useAction, useNow } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { IconClose } from "@/components/icons";
import styles from "./forgot-password.module.css";
import { OtpInput } from "@/features/identity/otp-input";
import {
  PasswordRequirements,
  passwordChecks,
} from "@/features/identity/password-requirements";
export default function ForgotPasswordPage() {
  const { t } = useLanguage();
  const action = useAction();
  const now = useNow(1000);
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [retryAt, setRetryAt] = useState(0);
  const [done, setDone] = useState(false);
  const send = async () => {
    if (action.busy || now < retryAt) return;
    const result = await action.run(async () => {
      await api.post(
        "/api/auth/password/forgot",
        { email: email.trim() },
        { anonymous: true },
      );
      return true;
    });
    if (result) {
      setSentTo(email.trim());
      setOtp("");
      setRetryAt(Date.now() + 60000);
    }
  };
  return (
    <main className="auth">
      <div className="auth__card">
        <div className={styles.head}>
          <h1>{t.identity.forgotTitle}</h1>
          <Link
            href="/login"
            className={styles.close}
            aria-label={t.common.close}
          >
            <IconClose size={18} />
          </Link>
        </div>
        {!done && <p className={styles.lead}>{t.identity.forgotDescription}</p>}
        {done ? (
          <p role="status">{t.identity.resetDone}</p>
        ) : (
          <>
            <form
              className="form"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <Field label={t.identity.email}>
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  disabled={action.busy}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setSentTo("");
                    setOtp("");
                  }}
                />
              </Field>
              <button className="btn" disabled={action.busy || now < retryAt}>
                {now < retryAt
                  ? `${t.identity.resend} (${Math.ceil((retryAt - now) / 1000)}s)`
                  : t.identity.sendCode}
              </button>
            </form>
            {sentTo && (
              <form
                className="form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (
                    password !== confirm ||
                    !passwordChecks(password, sentTo).every(Boolean)
                  ) {
                    action.setError(t.identity.passwordInvalid);
                    return;
                  }
                  void action.run(async () => {
                    await api.post(
                      "/api/auth/password/reset",
                      {
                        email: sentTo,
                        otpCode: otp,
                        newPassword: password,
                        confirmNewPassword: confirm,
                      },
                      { anonymous: true },
                    );
                    setDone(true);
                  });
                }}
              >
                <p role="status">{t.identity.neutralOtp}</p>
                <OtpInput
                  value={otp}
                  onChange={setOtp}
                  disabled={action.busy}
                />
                <Field label={t.identity.newPassword}>
                  <input
                    type="password"
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </Field>
                <PasswordRequirements password={password} email={sentTo} />
                <Field label={t.identity.confirmPassword}>
                  <input
                    type="password"
                    autoComplete="new-password"
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </Field>
                <button className="btn" disabled={action.busy}>
                  {t.identity.reset}
                </button>
              </form>
            )}
          </>
        )}
        <Feedback error={action.error} />
        <p className={styles.footer}>
          <span>{t.identity.rememberedPassword}</span>
          <Link href="/login">{t.identity.login}</Link>
        </p>
      </div>
    </main>
  );
}
