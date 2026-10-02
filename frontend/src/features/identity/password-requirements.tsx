"use client";
import { useLanguage } from "@/lib/language";
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
    <ul aria-label={t.identity.passwordPolicy}>
      {t.identity.passwordRules.map((rule, i) => (
        <li key={rule}>
          {checks[i] ? "✓" : "○"} {rule}
        </li>
      ))}
    </ul>
  );
}
