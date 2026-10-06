"use client";
import { Suspense, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/apiClient";
import { Feedback } from "@/components/ui";
import { Button, buttonClass } from "@/components/primitives";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthPasswordField } from "@/components/auth/AuthField";
import { IconAlert, IconCheck, IconLock } from "@/components/icons";
import { PasswordRequirements, passwordChecks } from "@/features/identity";
import { useAction } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import styles from "@/components/auth/AuthCard.module.css";

const BAD_LINK_CODES = [
  "otp_invalid",
  "otp_expired",
  "otp_already_used",
  "otp_attempts_exceeded",
];

/** Trang đích của link trong email: `/reset-password?email=…&token=…`. */
function ResetPasswordForm() {
  const { t, language } = useLanguage();
  const params = useSearchParams();
  const email = params.get("email") ?? "";
  const token = params.get("token") ?? "";
  const action = useAction();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    password?: string;
    confirm?: string;
  }>({});
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const [done, setDone] = useState(false);
  const [badLink, setBadLink] = useState(!email || !token);
  const [problem, setProblem] = useState("");
  const requiredMessage =
    language === "vi"
      ? "Vui lòng điền thông tin này."
      : "Please fill out this field.";
  const validateRequired = (value: string) =>
    !value.trim() ? requiredMessage : undefined;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setProblem("");
    const nextErrors = {
      password: validateRequired(password),
      confirm: validateRequired(confirm),
    };
    setFieldErrors(nextErrors);
    if (nextErrors.password || nextErrors.confirm) {
      (nextErrors.password ? passwordRef : confirmRef).current?.focus();
      return;
    }
    if (!passwordChecks(password, email).every(Boolean)) {
      setFieldErrors((current) => ({
        ...current,
        password: t.identity.passwordInvalid,
      }));
      passwordRef.current?.focus();
      return;
    }
    if (password !== confirm) {
      setFieldErrors((current) => ({
        ...current,
        confirm: t.refactor.mismatch,
      }));
      confirmRef.current?.focus();
      return;
    }
    await action.run(async () => {
      try {
        await api.post(
          "/api/auth/password/reset",
          { email, token, newPassword: password, confirmNewPassword: confirm },
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

  if (done)
    return (
      <AuthCard title={t.identity.resetDoneTitle}>
        <div className={styles.outcome}>
          <span className={styles.outcomeIcon} aria-hidden="true">
            <IconCheck size={28} />
          </span>
          <p className={styles.outcomeText} role="status">
            {t.identity.resetDone}
          </p>
          <Link
            className={`${buttonClass({ variant: "primary", size: "lg", block: true })} ${styles.link}`}
            href="/login"
          >
            {t.identity.login}
          </Link>
        </div>
      </AuthCard>
    );

  if (badLink)
    return (
      <AuthCard title={t.identity.linkInvalidTitle}>
        <div className={styles.outcome}>
          <span
            className={`${styles.outcomeIcon} ${styles.outcomeIconWarn}`}
            aria-hidden="true"
          >
            <IconAlert size={28} />
          </span>
          <p className={styles.outcomeText} role="alert">
            {t.identity.linkInvalid}
          </p>
          <Link
            className={`${buttonClass({ variant: "primary", size: "lg", block: true })} ${styles.link}`}
            href="/forgot-password"
          >
            {t.identity.requestNewLink}
          </Link>
        </div>
      </AuthCard>
    );

  return (
    <AuthCard
      title={t.identity.resetTitle}
      subtitle={
        <>
          {t.identity.resetDescription} <strong>{email}</strong>
        </>
      }
    >
      <form
        className={styles.form}
        aria-busy={action.busy}
        onSubmit={submit}
        noValidate
      >
        <AuthPasswordField
          ref={passwordRef}
          label={t.identity.newPassword}
          icon={<IconLock size={20} />}
          autoComplete="new-password"
          required
          error={fieldErrors.password}
          reserveErrorSpace
          value={password}
          showLabel={t.refactor.show}
          hideLabel={t.refactor.hide}
          onChange={(e) => {
            setPassword(e.target.value);
            if (fieldErrors.password)
              setFieldErrors((current) => ({
                ...current,
                password: validateRequired(e.target.value),
              }));
          }}
          onBlur={(e) =>
            setFieldErrors((current) => ({
              ...current,
              password: validateRequired(e.target.value),
            }))
          }
        />
        <PasswordRequirements password={password} email={email} />
        <AuthPasswordField
          ref={confirmRef}
          label={t.identity.confirmPassword}
          icon={<IconLock size={20} />}
          autoComplete="new-password"
          required
          error={fieldErrors.confirm}
          reserveErrorSpace
          value={confirm}
          showLabel={t.refactor.show}
          hideLabel={t.refactor.hide}
          onChange={(e) => {
            setConfirm(e.target.value);
            if (fieldErrors.confirm)
              setFieldErrors((current) => ({
                ...current,
                confirm: validateRequired(e.target.value),
              }));
          }}
          onBlur={(e) =>
            setFieldErrors((current) => ({
              ...current,
              confirm: validateRequired(e.target.value),
            }))
          }
        />
        {problem && (
          <p role="alert" className={styles.problem}>
            {problem}
          </p>
        )}
        <Feedback error={action.error} />
        <Button type="submit" className={styles.submit} loading={action.busy}>
          {t.identity.reset}
        </Button>
      </form>
      <p className={styles.footer}>
        <span>{t.identity.rememberedPassword}</span>
        <Link href="/login">{t.identity.login}</Link>
      </p>
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
