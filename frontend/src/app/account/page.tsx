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
import { ROLE_LABEL, useAuth, type Role } from "@/lib/auth";
import type { MyAccountDto } from "@/lib/types";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";

/**
 * Profile cá nhân, mật khẩu and link Google.
 *
 * BR-60 — account create thuần qua Google not yet has mật khẩu: form đặt mật khẩu times đầu không
 * hỏi mật khẩu old. Việc đặt mật khẩu luôn must làm from bên in phiên đăng nhập.
 * BR-59 — link Google only perform bằng action tường minh ở đây.
 */
export default function AccountPage() {
  const { refreshUser } = useAuth();

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
  const googleAction = useAction();
  const [confirmUnlink, setConfirmUnlink] = useState(false);

  // Đổ data into form NGAY TRONG render when profile vừa về (React for phép setState ở giai
  // đoạn render and render again immediately before vẽ). Làm việc this in useEffect will create thêm
  // a vòng render thừa and bị quy tắc render dây chuyền chặn.
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
      "Profile updated.",
    );

    if (done) {
      account.reload();
      await refreshUser();
    }
  };

  const savePassword = async (event: React.FormEvent) => {
    event.preventDefault();

    if (passwordForm.next !== passwordForm.confirm) {
      passwordAction.setError("The password confirmation does not match.");

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
      "Password updated.",
    );

    if (done !== null) {
      setPasswordForm({ current: "", next: "", confirm: "" });
      account.reload();
    }
  };

  return (
    <AppShell
      title="My account"
      description="Profile, password, and sign-in methods"
      allow={[
        "Member",
        "Receptionist",
        "Coach",
        "CenterManager",
        "SystemAdministrator",
      ]}
    >
      <AsyncSection state={account} emptyMessage="Unable to read profile.">
        {(data) => (
          <>
            <div className="grid grid--2">
              <Card title="Profile">
                <div className="stack">
                  <div className="row spread">
                    <div>
                      <strong>{data.email}</strong>
                      <div className="small muted">
                        {ROLE_LABEL[data.role as Role] ?? data.role} · joined{" "}
                        {formatDate(data.createdAt)}
                      </div>
                    </div>
                    <StatusChip value={data.status} />
                  </div>

                  <form className="form" onSubmit={saveProfile}>
                    <Field label="Full name">
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
                      label="Phone number"
                      hint="Each phone number can belong to only one account (BR-62). Leave it blank if you prefer not to provide one."
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
                        Save profile
                      </button>
                    </div>
                  </form>
                </div>
              </Card>

              <Card title={data.hasPassword ? "Change password" : "Set password"}>
                <form className="form" onSubmit={savePassword}>
                  {!data.hasPassword && (
                    <div className="alert alert--info">
                      This account uses Google sign-in and does not have a password yet. Set one here to enable email sign-in (BR-60).
                    </div>
                  )}

                  {data.hasPassword && (
                    <Field label="Current password">
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

                  <Field label="New password" hint="Eight characters minimum.">
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

                  <Field label="Confirm new password">
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
                      {data.hasPassword ? "Change password" : "Set password"}
                    </button>
                  </div>

                  <p className="small muted" style={{ margin: 0 }}>
                    Changing your password does <strong>not</strong> sign out other devices because global token revocation is not implemented yet (SSOT §5.6).
                  </p>
                </form>
              </Card>
            </div>

            <Card title="Sign in with Google">
              <div className="stack">
                <div className="row spread">
                  <div>
                    <strong>Link status</strong>
                    <div className="small muted">
                      {data.hasGoogleLink
                        ? "Your account is linked to Google."
                        : "No Google account is linked yet."}
                    </div>
                  </div>
                  <StatusChip
                    value={data.hasGoogleLink ? "Active" : "Pending"}
                  />
                </div>

                <div className="alert alert--info">
                  Google must be linked from inside an authenticated session. SportHub never links accounts automatically just because the Google email matches an existing account (BR-59).
                  <br />
                  To enable account linking, configure <code>
                    Google:ClientId
                  </code>{" "}
                  on the server and Google login button of the browser. When not set, API returned an error <code>google_login_not_configured</code>{" "}
                  instead of silently skipping the action.
                </div>
                <Feedback
                  error={googleAction.error}
                  success={googleAction.success}
                />
                {!data.hasGoogleLink && (
                  <div className="google-link-action">
                    <GoogleSignInButton
                      onCredential={(idToken) => {
                        void (async () => {
                          const done = await googleAction.run(
                            () =>
                              api.post("/api/auth/google/link", { idToken }),
                            "Google account linked.",
                          );
                          if (done !== null) account.reload();
                        })();
                      }}
                    />
                  </div>
                )}
                {data.hasGoogleLink && !confirmUnlink && (
                  <div>
                    <button
                      className="btn btn--ghost"
                      onClick={() => setConfirmUnlink(true)}
                    >
                      Unlink Google
                    </button>
                  </div>
                )}
                {data.hasGoogleLink && confirmUnlink && (
                  <div className="alert alert--warn stack">
                    <strong>Confirm unlink Google?</strong>
                    <span>
                      You must have a password to sign in after unlinking Google.
                    </span>
                    <div className="row">
                      <button
                        className="btn btn--danger"
                        disabled={googleAction.busy}
                        onClick={() => {
                          void (async () => {
                            const done = await googleAction.run(
                              () => api.del("/api/auth/google/link"),
                              "Google account unlinked.",
                            );
                            if (done !== null) {
                              setConfirmUnlink(false);
                              account.reload();
                            }
                          })();
                        }}
                      >
                        Confirm unlink
                      </button>
                      <button
                        className="btn btn--ghost"
                        onClick={() => setConfirmUnlink(false)}
                      >
                        Keep linked
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </>
        )}
      </AsyncSection>
    </AppShell>
  );
}
