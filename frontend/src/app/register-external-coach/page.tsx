"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/apiClient";
import { useAuth, type AuthResponse } from "@/lib/auth";
import { useAction, useApi, useNow } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import type { SportDto } from "@/lib/types";
import { AsyncSection, Field, Feedback } from "@/components/ui";
import { OtpInput } from "@/features/identity/otp-input";
import {
  PasswordRequirements,
  passwordChecks,
} from "@/features/identity/password-requirements";
export default function ExternalRegistrationPage() {
  const { t } = useLanguage();
  const { acceptSession } = useAuth();
  const router = useRouter();
  const action = useAction();
  const now = useNow(1000);
  const sports = useApi(
    (signal) => api.get<SportDto[]>("/api/sports", { signal, anonymous: true }),
    [],
  );
  const [form, setForm] = useState({
    email: "",
    fullName: "",
    phone: "",
    bio: "",
    password: "",
    confirmPassword: "",
    otpCode: "",
  });
  const [sportIds, setSportIds] = useState<number[]>([]);
  const [sent, setSent] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  return (
    <main className="auth">
      <div className="auth__card">
        <h1>{t.identity.externalTitle}</h1>
        <p>{t.identity.externalDescription}</p>
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            if (
              !sent ||
              !sportIds.length ||
              form.password !== form.confirmPassword ||
              !passwordChecks(form.password, form.email).every(Boolean)
            ) {
              action.setError(t.identity.passwordInvalid);
              return;
            }
            void action.run(async () => {
              const response = await api.post<AuthResponse>(
                "/api/auth/external-coach/register",
                {
                  ...form,
                  email: form.email.trim(),
                  fullName: form.fullName.trim(),
                  phone: form.phone || null,
                  bio: form.bio || null,
                  sportIds,
                },
                { anonymous: true },
              );
              acceptSession(response);
              router.replace("/external-coach");
            });
          }}
        >
          <Field label={t.identity.email}>
            <input
              type="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={(e) => {
                setForm({ ...form, email: e.target.value, otpCode: "" });
                setSent(false);
              }}
            />
          </Field>
          <button
            type="button"
            className="btn btn--secondary"
            disabled={action.busy || now < retryAt || !form.email}
            onClick={() => {
              void action.run(async () => {
                await api.post(
                  "/api/auth/external-coach/otp",
                  { email: form.email.trim() },
                  { anonymous: true },
                );
                setSent(true);
                setRetryAt(Date.now() + 60000);
              });
            }}
          >
            {now < retryAt
              ? `${t.identity.resend} (${Math.ceil((retryAt - now) / 1000)}s)`
              : t.identity.sendCode}
          </button>
          {sent && <p role="status">{t.identity.neutralOtp}</p>}
          <OtpInput
            value={form.otpCode}
            onChange={(otpCode) => setForm({ ...form, otpCode })}
            disabled={action.busy}
          />
          <Field label={t.identity.fullName}>
            <input
              required
              autoComplete="name"
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            />
          </Field>
          <Field label={t.identity.phone}>
            <input
              autoComplete="tel"
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </Field>
          <Field label={t.identity.bio}>
            <textarea
              maxLength={1000}
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
            />
          </Field>
          <fieldset>
            <legend>{t.identity.sports}</legend>
            <AsyncSection state={sports}>
              {(data) =>
                data
                  .filter((s) => s.isActive)
                  .map((s) => (
                    <label key={s.sportId}>
                      <input
                        type="checkbox"
                        checked={sportIds.includes(s.sportId)}
                        onChange={(e) =>
                          setSportIds((ids) =>
                            e.target.checked
                              ? [...ids, s.sportId]
                              : ids.filter((id) => id !== s.sportId),
                          )
                        }
                      />
                      {s.name}
                    </label>
                  ))
              }
            </AsyncSection>
          </fieldset>
          <Field label={t.identity.newPassword}>
            <input
              required
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </Field>
          <PasswordRequirements password={form.password} email={form.email} />
          <Field label={t.identity.confirmPassword}>
            <input
              required
              type="password"
              autoComplete="new-password"
              value={form.confirmPassword}
              onChange={(e) =>
                setForm({ ...form, confirmPassword: e.target.value })
              }
            />
          </Field>
          <Feedback error={action.error} />
          <button
            className="btn"
            disabled={action.busy || !sent || !sportIds.length}
          >
            {t.identity.finishRegistration}
          </button>
        </form>
        <Link href="/login">{t.identity.login}</Link>
      </div>
    </main>
  );
}
