"use client";
import { useState } from "react";
import { api } from "@/lib/apiClient";
import {
  HOME_BY_ROLE,
  useAuth,
  type AuthResponse,
  type GoogleOnboardingPending,
} from "@/lib/auth";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/language";
import { useAction } from "@/lib/useApi";
import { Field, Feedback } from "@/components/ui";
import { PasswordRequirements, passwordChecks } from "./password-requirements";
export function GoogleOnboarding({
  pending,
  onCancel,
}: {
  pending: GoogleOnboardingPending;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  const { acceptSession } = useAuth();
  const router = useRouter();
  const action = useAction();
  const [name, setName] = useState(pending.fullName);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        if (
          !passwordChecks(password, pending.email).every(Boolean) ||
          password !== confirm
        ) {
          action.setError(t.identity.passwordInvalid);
          return;
        }
        void action.run(async () => {
          const response = await api.post<AuthResponse>(
            "/api/auth/google/onboarding",
            {
              onboardingToken: pending.onboardingToken,
              fullName: name.trim(),
              password,
              confirmPassword: confirm,
            },
            { anonymous: true },
          );
          const user = acceptSession(response);
          router.replace(HOME_BY_ROLE[user.role]);
        });
      }}
    >
      <p>{pending.email}</p>
      <Field label={t.identity.fullName}>
        <input
          required
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label={t.identity.newPassword}>
        <input
          required
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <PasswordRequirements password={password} email={pending.email} />
      <Field label={t.identity.confirmPassword}>
        <input
          required
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </Field>
      <Feedback error={action.error} />
      <button className="btn" disabled={action.busy}>
        {t.identity.finishRegistration}
      </button>
      <button
        className="btn btn--secondary"
        type="button"
        disabled={action.busy}
        onClick={onCancel}
      >
        {t.identity.cancel}
      </button>
    </form>
  );
}
