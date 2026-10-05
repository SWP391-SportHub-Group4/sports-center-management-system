"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/apiClient";
import { Feedback } from "@/components/ui";
import { Button } from "@/components/primitives";
import { AuthPasswordField } from "@/components/auth/AuthField";
import { PasswordRequirements, passwordChecks } from "@/features/identity";
import { useAction } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import styles from "../forgot-password/forgot-password.module.css";

const BAD_LINK_CODES = [
  "otp_invalid",
  "otp_expired",
  "otp_already_used",
  "otp_attempts_exceeded",
];

/** Trang đích của link trong email: `/reset-password?email=…&token=…`. */
function ResetPasswordForm() {
  const { t } = useLanguage();
  const params = useSearchParams();
  const email = params.get("email") ?? "";
  const token = params.get("token") ?? "";
  const action = useAction();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [badLink, setBadLink] = useState(!email || !token);
  const [problem, setProblem] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setProblem("");
    if (!passwordChecks(password, email).every(Boolean)) {
      setProblem(t.identity.passwordInvalid);
      return;
    }
    if (password !== confirm) {
      setProblem(t.refactor.mismatch);
      return;
    }
    await action.run(async () => {
      try {
        await api.post(
          "/api/auth/password/reset",
          {
            email,
            token,
            newPassword: password,
            confirmNewPassword: confirm,
          },
          { anonymous: true },
        );
        setDone(true);
      } catch (cause) {
        if (cause instanceof ApiError && BAD_LINK_CODES.includes(cause.code))
          setBadLink(true);
        else
          setProblem(
            cause instanceof Error ? cause.message : t.apiErrors.generic,
          );
      }
    });
  };

  return (
    <main className="auth">
      <div className="auth__card">
        <div className={styles.head}>
          <h1>{t.identity.resetTitle}</h1>
        </div>
        {done ? (
          <>
            <p role="status" className={styles.lead}>
              {t.identity.resetDone}
            </p>
            <Link className="btn btn--block" href="/login">
              {t.identity.login}
            </Link>
          </>
        ) : badLink ? (
          <>
            <p role="alert" className={styles.lead}>
              {t.identity.linkInvalid}
            </p>
            <Link className="btn btn--block" href="/forgot-password">
              {t.identity.requestNewLink}
            </Link>
          </>
        ) : (
          <>
            <p className={styles.lead}>
              {t.identity.resetDescription} <strong>{email}</strong>
            </p>
            <form className="form" onSubmit={submit}>
              <AuthPasswordField
                label={t.identity.newPassword}
                autoComplete="new-password"
                required
                value={password}
                showLabel={t.refactor.show}
                hideLabel={t.refactor.hide}
                onChange={(e) => setPassword(e.target.value)}
              />
              <PasswordRequirements password={password} email={email} />
              <AuthPasswordField
                label={t.identity.confirmPassword}
                autoComplete="new-password"
                required
                value={confirm}
                showLabel={t.refactor.show}
                hideLabel={t.refactor.hide}
                onChange={(e) => setConfirm(e.target.value)}
              />
              {problem && <p role="alert">{problem}</p>}
              <Button type="submit" block loading={action.busy}>
                {t.identity.reset}
              </Button>
            </form>
            <Feedback error={action.error} />
          </>
        )}
        <p className={styles.footer}>
          <span>{t.identity.rememberedPassword}</span>
          <Link href="/login">{t.identity.login}</Link>
        </p>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
