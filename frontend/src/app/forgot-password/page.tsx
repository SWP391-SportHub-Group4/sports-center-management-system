"use client";
import { useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/apiClient";
import { Feedback, Field } from "@/components/ui";
import { Button } from "@/components/primitives";
import { IconClose } from "@/components/icons";
import { useAction, useNow } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import styles from "./forgot-password.module.css";

/**
 * Quên mật khẩu bằng LINK gửi qua email (không còn OTP). Backend báo rõ khi email không có tài khoản,
 * tài khoản bị khóa hoặc link vừa được gửi; trang này đổi các mã lỗi đó thành thông báo tiếng Anh.
 */
export default function ForgotPasswordPage() {
  const { t } = useLanguage();
  const action = useAction();
  const now = useNow(1000);
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [retryAt, setRetryAt] = useState(0);
  const [problem, setProblem] = useState("");

  const explain = (cause: unknown) => {
    if (cause instanceof ApiError) {
      if (cause.code === "account_not_found") return t.identity.accountNotFound;
      if (cause.code === "account_not_active") return t.identity.accountLocked;
      if (cause.code === "reset_link_recently_sent")
        return t.identity.linkRecentlySent;
    }
    return cause instanceof Error ? cause.message : t.apiErrors.generic;
  };

  const send = async () => {
    if (action.busy || now < retryAt) return;
    setProblem("");
    const target = email.trim();
    const result = await action.run(async () => {
      try {
        await api.post(
          "/api/auth/password/forgot",
          { email: target },
          { anonymous: true },
        );
        return true;
      } catch (cause) {
        setProblem(explain(cause));
        if (
          cause instanceof ApiError &&
          cause.code === "reset_link_recently_sent"
        )
          setRetryAt(Date.now() + 60000);
        return null;
      }
    });
    if (result) {
      setSentTo(target);
      setRetryAt(Date.now() + 60000);
    }
  };

  const waiting = now < retryAt;
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
        <p className={styles.lead}>{t.identity.forgotDescription}</p>
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <Field label={t.identity.email} error={problem || undefined}>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              disabled={action.busy}
              onChange={(e) => {
                setEmail(e.target.value);
                setProblem("");
                setSentTo("");
              }}
            />
          </Field>
          <Button type="submit" block loading={action.busy} disabled={waiting}>
            {waiting
              ? `${sentTo ? t.identity.resendLink : t.identity.sendLink} (${Math.ceil((retryAt - now) / 1000)}s)`
              : sentTo
                ? t.identity.resendLink
                : t.identity.sendLink}
          </Button>
        </form>
        {sentTo && (
          <div role="status" className={styles.sent}>
            <p>
              {t.identity.linkSent} <strong>{sentTo}</strong>.
            </p>
            <p>{t.identity.linkSentHint}</p>
          </div>
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
