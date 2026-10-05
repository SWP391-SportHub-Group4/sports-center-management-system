"use client";
import { PasswordInput } from "@/components/primitives";

import { useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { MemberShell } from "@/components/MemberShell";
import styles from "./account.module.css";
import {
  AsyncSection,
  Card,
  Feedback,
  Field,
  StatusChip,
} from "@/components/ui";
import { api, ApiError } from "@/lib/apiClient";
import { formatDate } from "@/lib/format";
import { useAction, useApi } from "@/lib/useApi";
import { useAuth, type Role } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
import {
  PasswordRequirements,
  passwordChecks,
} from "@/features/identity/password-requirements";
import type { MyAccountDto } from "@/lib/types";

export default function AccountPage() {
  const { user, refreshUser, updateToken } = useAuth();
  const { t } = useLanguage();

  const account = useApi(
    (signal) => api.get<MyAccountDto>("/api/users/me", { signal }),
    [],
  );

  const [profileForm, setProfileForm] = useState({ fullName: "", phone: "" });
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);
  const [passwordForm, setPasswordForm] = useState({
    current: "",
    next: "",
    confirm: "",
  });

  const profileAction = useAction();
  const passwordAction = useAction();
  const currentPasswordRef = useRef<HTMLInputElement>(null);
  const [currentPasswordError, setCurrentPasswordError] = useState(false);
  const Shell = user?.role === "Member" ? MemberShell : AppShell;

  if (account.data && hydratedFor !== account.data.userId) {
    setHydratedFor(account.data.userId);
    setProfileForm({
      fullName: account.data.fullName,
      phone: account.data.phone ?? "",
    });
  }

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();

    const done = await profileAction.run(
      () =>
        api.put<MyAccountDto>("/api/users/me/profile", {
          fullName: profileForm.fullName.trim(),
          phone: profileForm.phone.trim() || null,
        }),
      t.account.profileSuccess,
    );

    if (done) {
      account.reload();
      await refreshUser();
    }
  };

  const savePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (passwordAction.busy) return;
    setCurrentPasswordError(false);
    passwordAction.reset();

    if (
      !passwordChecks(passwordForm.next, account.data?.email ?? "").every(
        Boolean,
      )
    ) {
      passwordAction.setError(t.identity.passwordInvalid);
      return;
    }
    if (passwordForm.next !== passwordForm.confirm) {
      passwordAction.setError(t.account.passwordMismatch);
      return;
    }

    const done = await passwordAction.run(async () => {
      try {
        return await api.post<{ accessToken: string }>(
          "/api/users/me/password",
          {
            currentPassword: account.data?.hasPassword
              ? passwordForm.current
              : null,
            newPassword: passwordForm.next,
            confirmNewPassword: passwordForm.confirm,
          },
        );
      } catch (error) {
        if (
          error instanceof ApiError &&
          ((error.status === 400 &&
            error.code === "current_password_incorrect") ||
            (error.status === 401 && error.code === "invalid_credentials"))
        ) {
          setCurrentPasswordError(true);
          currentPasswordRef.current?.focus();
          throw new ApiError(
            error.status,
            error.code,
            t.account.currentPasswordIncorrect,
          );
        }
        throw error;
      }
    }, t.account.passwordSuccess);

    if (done !== null) {
      updateToken(done.accessToken);
      await refreshUser();
      setPasswordForm({ current: "", next: "", confirm: "" });
      account.reload();
    }
  };

  return (
    <Shell
      title={t.account.title}
      description={t.account.description}
      allow={[
        "ExternalCoach",
        "Member",
        "Receptionist",
        "Coach",
        "CenterManager",
        "SystemAdministrator",
      ]}
    >
      <AsyncSection state={account} emptyMessage={t.apiErrors.notFound}>
        {(data) => (
          <div
            className={
              user?.role === "Member" ? styles.content : "grid grid--2"
            }
          >
            <Card title={t.account.profileTitle}>
              <div className="stack">
                <div className="row spread">
                  <div>
                    <strong>{data.email}</strong>
                    <div className="small muted">
                      {t.navigation.roleLabel[data.role as Role] ?? data.role} ·{" "}
                      {t.account.joinedOn} {formatDate(data.createdAt)}
                    </div>
                  </div>
                  <StatusChip value={data.status} />
                </div>

                <form className="form" onSubmit={saveProfile}>
                  <Field label={t.account.fullName} required>
                    <input
                      value={profileForm.fullName}
                      required
                      onChange={(event) =>
                        setProfileForm({
                          ...profileForm,
                          fullName: event.target.value,
                        })
                      }
                    />
                  </Field>

                  <Field label={t.account.phone} hint={t.account.phoneHint}>
                    <input
                      value={profileForm.phone}
                      onChange={(event) =>
                        setProfileForm({
                          ...profileForm,
                          phone: event.target.value,
                        })
                      }
                    />
                  </Field>

                  <Feedback
                    error={profileAction.error}
                    success={profileAction.success}
                  />

                  <div>
                    <button
                      type="submit"
                      className="btn"
                      disabled={profileAction.busy}
                    >
                      {t.account.saveProfile}
                    </button>
                  </div>
                </form>
              </div>
            </Card>

            <Card
              title={
                data.hasPassword
                  ? t.account.savePassword
                  : t.account.setPassword
              }
            >
              <form className="form" onSubmit={savePassword}>
                {!data.hasPassword && (
                  <div className="alert alert--info">
                    {t.account.noPasswordNotice}
                  </div>
                )}

                {data.hasPassword && (
                  <Field
                    label={t.account.currentPassword}
                    required
                    error={
                      currentPasswordError
                        ? t.account.currentPasswordIncorrect
                        : undefined
                    }
                  >
                    <PasswordInput
                      ref={currentPasswordRef}
                      autoComplete="current-password"
                      value={passwordForm.current}
                      required
                      onChange={(event) => {
                        setCurrentPasswordError(false);
                        passwordAction.reset();
                        setPasswordForm({
                          ...passwordForm,
                          current: event.target.value,
                        });
                      }}
                    />
                  </Field>
                )}

                <Field label={t.account.newPassword} required>
                  <PasswordInput
                    autoComplete="new-password"
                    minLength={8}
                    value={passwordForm.next}
                    required
                    onChange={(event) =>
                      setPasswordForm({
                        ...passwordForm,
                        next: event.target.value,
                      })
                    }
                  />
                </Field>

                <PasswordRequirements
                  password={passwordForm.next}
                  email={data.email}
                />

                <Field label={t.account.confirmPassword} required>
                  <PasswordInput
                    autoComplete="new-password"
                    minLength={8}
                    value={passwordForm.confirm}
                    required
                    onChange={(event) =>
                      setPasswordForm({
                        ...passwordForm,
                        confirm: event.target.value,
                      })
                    }
                  />
                </Field>
                <Feedback
                  error={currentPasswordError ? null : passwordAction.error}
                  success={passwordAction.success}
                />

                <div>
                  <button
                    type="submit"
                    className="btn"
                    disabled={passwordAction.busy}
                  >
                    {data.hasPassword
                      ? t.account.savePassword
                      : t.account.setPassword}
                  </button>
                </div>
              </form>
            </Card>
          </div>
        )}
      </AsyncSection>
    </Shell>
  );
}
