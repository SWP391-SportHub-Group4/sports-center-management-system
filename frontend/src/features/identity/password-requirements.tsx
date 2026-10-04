"use client";
import { useLanguage } from "@/lib/language";
import { IconCheck } from "@/components/icons";
export function passwordChecks(password: string, email: string) {
  const local = email.trim().split("@")[0];
  return [
    Array.from(password).length >= 8 && Array.from(password).length <= 64,
    /\p{Ll}/u.test(password) || /[\p{Lo}\p{Lm}]/u.test(password),
    /\p{Lu}/u.test(password),
    /\p{Nd}/u.test(password),
    /[^\p{L}\p{N}]/u.test(password),
    !!local && !password.toLowerCase().includes(local.toLowerCase()),
  ];
}
export function PasswordRequirements({
  password,
  email,
}: {
  password: string;
  email: string;
}) {
  const { t } = useLanguage();
  const checks = passwordChecks(password, email);
  return (
    <ul className="pw-rules" aria-label={t.identity.passwordPolicy}>
      {t.identity.passwordRules.map((rule, i) => (
        <li
          key={rule}
          className={checks[i] ? "pw-rules__item pw-rules__item--ok" : "pw-rules__item"}
        >
          <span className="pw-rules__mark" aria-hidden="true">
            {checks[i] ? <IconCheck size={14} strokeWidth={2.6} /> : null}
          </span>
          <span>{rule}</span>
          <span className="sr-only">{checks[i] ? " (ok)" : ""}</span>
        </li>
      ))}
    </ul>
  );
}
