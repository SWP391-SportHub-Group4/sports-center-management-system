"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/apiClient";
import { Feedback } from "@/components/ui";
import { Button } from "@/components/primitives";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthField } from "@/components/auth/AuthField";
import { IconMail } from "@/components/icons";
import { useAction, useNow } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import styles from "@/components/auth/AuthCard.module.css";

/**
 * Quên mật khẩu bằng LINK gửi qua email. Câu trả lời luôn trung tính ("nếu tài khoản tồn tại…") để không
 * lộ email nào đã đăng ký; backend cũng trả 204 cho email không tồn tại/bị khóa/đang chờ gửi lại.
 */
export default function ForgotPasswordPage() {
  const { t, language } = useLanguage();
  const action = useAction();
  const now = useNow(1000);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string>();
  const emailRef = useRef<HTMLInputElement>(null);
  const [sentTo, setSentTo] = useState("");
  // Thời gian chờ gắn với ĐỊA CHỈ đã gửi: sửa sang email khác thì không còn bị chặn.
  const [cooldown, setCooldown] = useState<{ email: string; until: number }>({
    email: "",
    until: 0,
  });
  const current = email.trim().toLowerCase();
  const requiredMessage =
    language === "vi"
      ? "Vui lòng điền thông tin này."
      : "Please fill out this field.";
  const validateEmail = (value: string) =>
    !value.trim()
      ? requiredMessage
      : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
        ? t.refactor.emailInvalid
        : undefined;

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

  // Chỉ chờ khi gửi lại cho cùng một email; email khác gửi được ngay.
  const waiting = cooldown.email === current && now < cooldown.until;
  const seconds = Math.ceil((cooldown.until - now) / 1000);

  return (
    <AuthCard
      title={t.identity.forgotTitle}
      subtitle={sentTo ? undefined : t.identity.forgotDescription}
    >
      {sentTo ? (
        <div className={styles.outcome} role="status">
          <span className={styles.outcomeIcon} aria-hidden="true">
            <IconMail size={28} />
          </span>
          <p className={styles.outcomeText}>{t.identity.linkSentNeutral}</p>
          <p className={styles.hint}>{t.identity.linkSentHint}</p>
          <Button
            variant="secondary"
            block
            loading={action.busy}
            disabled={waiting}
            onClick={() => void send()}
          >
            {waiting
              ? `${t.identity.resendLink} (${seconds}s)`
              : t.identity.resendLink}
          </Button>
          <Button
            variant="ghost"
            block
            onClick={() => {
              setSentTo("");
              setCooldown({ email: "", until: 0 });
              action.reset();
            }}
          >
            {t.identity.useAnotherEmail}
          </Button>
        </div>
      ) : (
        <form
          className={styles.form}
          noValidate
          aria-busy={action.busy}
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <AuthField
            ref={emailRef}
            label={t.identity.email}
            icon={<IconMail size={20} />}
            type="email"
            autoComplete="email"
            required
            error={emailError}
            reserveErrorSpace
            autoFocus
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (emailError) setEmailError(validateEmail(e.target.value));
              action.reset();
            }}
            onBlur={(e) => setEmailError(validateEmail(e.target.value))}
          />
          <Feedback error={action.error} />
          <Button
            type="submit"
            className={styles.submit}
            loading={action.busy}
            disabled={waiting}
          >
            {t.identity.sendLink}
          </Button>
        </form>
      )}
      <p className={styles.footer}>
        <span>{t.identity.rememberedPassword}</span>
        <Link href="/login">{t.identity.login}</Link>
      </p>
    </AuthCard>
  );
}
