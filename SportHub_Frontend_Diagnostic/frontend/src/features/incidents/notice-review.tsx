"use client";

import { BellRing, Mail, Send } from "lucide-react";
import { AvatarImage } from "@/components/AvatarImage";
import { useLanguage } from "@/lib/language";
import { useOperationsCopy } from "@/features/manager";
import {
  noticeRoles,
  type NoticeRecipient,
  type NoticeRole,
} from "./notice-recipient-picker";
import styles from "./notice-review.module.css";

export function NoticeReview({
  recipients,
  sendToAll,
  sendToRoles,
  subject,
  message,
  sendInApp,
  sendEmail,
  disabled,
  onSend,
}: {
  recipients: NoticeRecipient[];
  sendToAll: boolean;
  sendToRoles: NoticeRole[];
  subject: string;
  message: string;
  sendInApp: boolean;
  sendEmail: boolean;
  disabled: boolean;
  onSend: () => void;
}) {
  const { t } = useLanguage();
  const l = t.manualNotices;
  const c = useOperationsCopy();
  const audience = sendToAll
    ? l.allActiveAccounts
    : sendToRoles.length
      ? l.selectedRoleAudience +
        (recipients.length
          ? ` + ${l.selectedIndividuals.replace("{n}", String(recipients.length))}`
          : "")
      : l.selectedCount.replace("{n}", String(recipients.length));
  const scope = sendToAll
    ? l.sendToAllHint
    : noticeRoles
        .map((role) => ({
          role,
          all: sendToRoles.includes(role),
          count: recipients.filter((account) => account.role === role).length,
        }))
        .filter(({ all, count }) => all || count > 0)
        .map(
          ({ role, all, count }) =>
            `${l.roles[role]}: ${all ? l.allActiveAccounts : count}`,
        )
        .join(", ");
  return (
    <section className={styles.review} aria-label={l.reviewNotice}>
      <header className={styles.heading}>
        <h3>{l.reviewNotice}</h3>
        <p role="note">{c.localReview}</p>
      </header>
      <dl className={styles.details}>
        <div className={styles.row}>
          <dt>{c.recipientCount}</dt>
          <dd>
            <strong className={styles.audience}>{audience}</strong>
            <p className={styles.scope}>{scope}</p>
            {!sendToAll && recipients.length > 0 && (
              <ul
                className={styles.recipients}
                tabIndex={0}
                aria-label={c.recipientCount}
              >
                {recipients.map((account) => (
                  <li key={account.userId}>
                    <AvatarImage
                      name={account.name}
                      avatarUrl={account.avatarUrl}
                      size={32}
                    />
                    <span className={styles.identity}>
                      <strong>{account.name}</strong>
                      <span>{account.email}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>
        <div className={styles.row}>
          <dt>{c.channels}</dt>
          <dd className={styles.channels}>
            {sendInApp && (
              <span>
                <BellRing size={16} aria-hidden="true" />
                {t.operations.sendInApp}
              </span>
            )}
            {sendInApp && sendEmail && (
              <span className={styles.separator} aria-hidden="true">
                ·
              </span>
            )}
            {sendEmail && (
              <span>
                <Mail size={16} aria-hidden="true" />
                {t.operations.sendEmail}
              </span>
            )}
          </dd>
        </div>
        <div className={styles.row}>
          <dt>{t.operations.subject}</dt>
          <dd className={styles.subject}>{subject}</dd>
        </div>
        <div className={styles.row}>
          <dt>{t.operations.message}</dt>
          <dd className={styles.message}>{message}</dd>
        </div>
      </dl>
      <footer className={styles.footer}>
        <button
          type="button"
          className={`btn ${styles.send}`}
          disabled={disabled}
          onClick={onSend}
        >
          <Send size={16} aria-hidden="true" />
          {t.operations.send}
        </button>
      </footer>
    </section>
  );
}
