"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  AsyncSection,
  Card,
  Feedback,
  Field,
  StatusChip,
} from "@/components/ui";
import { api } from "@/lib/apiClient";
import { formatDate } from "@/lib/format";
import { useAction, useApi } from "@/lib/useApi";
import { useAuth, type Role } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
import type { MyAccountDto } from "@/lib/types";

export default function AccountPage() {
  const { refreshUser } = useAuth();
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

    if (passwordForm.next !== passwordForm.confirm) {
      passwordAction.setError(t.account.passwordMismatch);
      return;
    }

    const done = await passwordAction.run(
      () =>
        api.post("/api/users/me/password", {
          currentPassword: account.data?.hasPassword
            ? passwordForm.current
            : null,
          newPassword: passwordForm.next,
        }),
      t.account.passwordSuccess,
    );

    if (done !== null) {
      setPasswordForm({ current: "", next: "", confirm: "" });
      account.reload();
    }
  };

  return (
    <AppShell
      title={t.account.title}
      description={t.account.description}
      allow={[
        "Member",
        "Receptionist",
        "Coach",
        "CenterManager",
        "SystemAdministrator",
      ]}
    >
      <AsyncSection state={account} emptyMessage={t.apiErrors.notFound}>
        {(data) => (
          <div className="grid grid--2">
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

                  <Field
                    label={t.account.phone}
                    hint={t.account.phoneHint}
                  >
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
                  <Field label={t.account.currentPassword} required>
                    <input
                      type="password"
                      autoComplete="current-password"
                      value={passwordForm.current}
                      required
                      onChange={(event) =>
                        setPasswordForm({
                          ...passwordForm,
                          current: event.target.value,
                        })
                      }
                    />
                  </Field>
                )}

                <Field
                  label={t.account.newPassword}
                  hint={t.account.passwordMinHint}
                  required
                >
                  <input
                    type="password"
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

                <Field label={t.account.confirmPassword} required>
                  <input
                    type="password"
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
                  error={passwordAction.error}
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
    </AppShell>
  );
}
