"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/apiClient";
import { Feedback } from "@/components/ui";
import { AuthField } from "@/components/auth/AuthField";
import { IconClose, IconMail } from "@/components/icons";
import { useAction, useNow } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import styles from "./ForgotPasswordModal.module.css";

/**
 * Quên mật khẩu dạng popup trên trang đăng nhập. Câu trả lời luôn trung tính để không lộ email nào đã
 * đăng ký; backend cũng trả 204 cho email không tồn tại/bị khóa/đang chờ gửi lại.
 */
export function ForgotPasswordModal({
  onClose,
  initialEmail = "",
}: {
  onClose: () => void;
  initialEmail?: string;
}) {
  const { t } = useLanguage();
  const action = useAction();
  const now = useNow(1000);
  const [email, setEmail] = useState(initialEmail);
  const [emailError, setEmailError] = useState<string>();
  const emailRef = useRef<HTMLInputElement>(null);
  const [sentTo, setSentTo] = useState("");
  // Thời gian chờ gắn với ĐỊA CHỈ đã gửi: sửa sang email khác thì không còn bị chặn.
  const [cooldown, setCooldown] = useState<{ email: string; until: number }>({
    email: "",
    until: 0,
  });
  const current = email.trim().toLowerCase();
  const validateEmail = (value: string) =>
    !value.trim()
      ? "Please fill out this field."
      : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
        ? t.refactor.emailInvalid
        : undefined;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const send = async () => {
    if (action.busy) return;
    const validationError = validateEmail(email);
    setEmailError(validationError);
    if (validationError) {
      emailRef.current?.focus();
      return;
    }
    const target = email.trim();
    if (cooldown.email === target.toLowerCase() && now < cooldown.until) return;
    const ok = await action.run(async () => {
      await api.post(
        "/api/auth/password/forgot",
        { email: target },
        { anonymous: true },
      );
      return true;
    });
    if (ok) {
      setSentTo(target);
      setCooldown({ email: target.toLowerCase(), until: Date.now() + 60000 });
    }
  };

  const waiting = cooldown.email === current && now < cooldown.until;
  const seconds = Math.ceil((cooldown.until - now) / 1000);

  return (
    <div
      className={styles.backdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="forgot-title"
      >
        <button
          type="button"
          className={styles.close}
          aria-label="Close"
          onClick={onClose}
        >
          <IconClose size={18} />
        </button>

        <h2 id="forgot-title" className={styles.title}>
          {t.identity.forgotTitle}
        </h2>

        {sentTo ? (
          <div className={styles.outcome} role="status">
            <span className={styles.outcomeIcon} aria-hidden="true">
              <IconMail size={28} />
            </span>
            <p className={styles.outcomeText}>{t.identity.linkSentNeutral}</p>
            <p className={styles.hint}>{t.identity.linkSentHint}</p>
            <button
              type="button"
              className={`btn ${styles.submit}`}
              disabled={waiting || action.busy}
              onClick={() => void send()}
            >
              {waiting
                ? `${t.identity.resendLink} (${seconds}s)`
                : t.identity.resendLink}
            </button>
            <button
              type="button"
              className={styles.textButton}
              onClick={() => {
                setSentTo("");
                setCooldown({ email: "", until: 0 });
                action.reset();
              }}
            >
              {t.identity.useAnotherEmail}
            </button>
          </div>
        ) : (
          <>
            <p className={styles.description}>Enter your email to recover your password.</p>
            <form
              className={styles.form}
              noValidate
              aria-busy={action.busy}
              onSubmit={(event) => {
                event.preventDefault();
                void send();
              }}
            >
              <AuthField
                ref={emailRef}
                label={t.identity.email}
                placeholder="example@gmail.com"
                icon={<IconMail size={20} />}
                type="email"
                autoComplete="email"
                required
                autoFocus
                error={emailError}
                disabled={action.busy}
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (emailError) setEmailError(validateEmail(event.target.value));
                  action.reset();
                }}
                onBlur={(event) =>
                  setEmailError(validateEmail(event.target.value))
                }
              />
              <Feedback error={action.error} />
              <button
                type="submit"
                className={`btn ${styles.submit}`}
                disabled={waiting || action.busy}
              >
                {action.busy ? (
                  <span className="btn__busy">
                    <span className="spinner" aria-hidden="true" />
                    <span>{t.identity.sendLink}</span>
                  </span>
                ) : (
                  t.identity.sendLink
                )}
              </button>
            </form>
          </>
        )}

        <p className={styles.footer}>
          <span>{t.identity.rememberedPassword}</span>
          <button type="button" onClick={onClose}>
            {t.identity.login}
          </button>
        </p>
      </div>
    </div>
  );
}
