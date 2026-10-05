"use client";
import { useState } from "react";
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
  const { t } = useLanguage();
  const action = useAction();
  const now = useNow(1000);
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [retryAt, setRetryAt] = useState(0);

  const send = async () => {
    if (action.busy || now < retryAt) return;
    const target = email.trim();
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
      setRetryAt(Date.now() + 60000);
    }
  };

  const waiting = now < retryAt;
  const seconds = Math.ceil((retryAt - now) / 1000);

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
          <Button variant="ghost" block onClick={() => setSentTo("")}>
            {t.identity.useAnotherEmail}
          </Button>
        </div>
      ) : (
        <form
          className={styles.form}
          aria-busy={action.busy}
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <AuthField
            label={t.identity.email}
            icon={<IconMail size={20} />}
            type="email"
            autoComplete="email"
            required
            value={email}
            disabled={action.busy}
            onChange={(e) => setEmail(e.target.value)}
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
