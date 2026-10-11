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
import { useAction, useApi, useNow } from "@/lib/useApi";
import { useAuth, type Role } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
import {
  PasswordRequirements,
  passwordChecks,
} from "@/features/identity/password-requirements";
import type { MyAccountDto } from "@/lib/types";
import { CoachAvatarUpload } from "@/features/identity/coach-avatar-upload";

export default function AccountPage() {
  const { user, refreshUser, updateToken } = useAuth();
  const { t, language } = useLanguage();

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
  const [profileErrors, setProfileErrors] = useState<{ fullName?: string }>({});
  const [passwordErrors, setPasswordErrors] = useState<{
    otp?: string;
    current?: string;
    next?: string;
    confirm?: string;
  }>({});

  const profileAction = useAction();
  const passwordAction = useAction();
  // Luồng A: tài khoản chưa có mật khẩu (đăng ký bằng Google) xác nhận bằng mã 6 số gửi về email.
  const otpAction = useAction();
  const [otp, setOtp] = useState("");
  const [otpResendAt, setOtpResendAt] = useState(0);
  const otpRef = useRef<HTMLInputElement>(null);
  const now = useNow(1000);
  const resendSeconds = Math.max(0, Math.ceil((otpResendAt - now) / 1000));
  const fullNameRef = useRef<HTMLInputElement>(null);
  const currentPasswordRef = useRef<HTMLInputElement>(null);
  const nextPasswordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);
  const [currentPasswordError, setCurrentPasswordError] = useState(false);
  const Shell = user?.role === "Member" ? MemberShell : AppShell;
  const requiredMessage =
    language === "vi"
      ? "Vui lòng điền thông tin này."
      : "Please fill out this field.";
  const validateNewPassword = (value: string) =>
    !value.trim()
      ? requiredMessage
      : !passwordChecks(value, account.data?.email ?? "").every(Boolean)
        ? t.identity.passwordInvalid
        : undefined;
  const validateConfirmPassword = (value: string) =>
    !value.trim()
      ? requiredMessage
      : value !== passwordForm.next
        ? t.account.passwordMismatch
        : undefined;

  if (account.data && hydratedFor !== account.data.userId) {
    setHydratedFor(account.data.userId);
    setProfileForm({
      fullName: account.data.fullName,
      phone: account.data.phone ?? "",
    });
  }

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    const fullNameError = profileForm.fullName.trim()
      ? undefined
      : requiredMessage;
    setProfileErrors({ fullName: fullNameError });
    if (fullNameError) {
      fullNameRef.current?.focus();
      return;
    }

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

  const sendOtp = async () => {
    if (otpAction.busy || resendSeconds > 0) return;
    otpAction.reset();
    const sent = await otpAction.run(
      async () => {
        try {
          await api.post<void>("/api/users/me/password/otp");
          return true;
        } catch (error) {
          if (error instanceof ApiError && error.code === "otp_resend_too_soon")
            setOtpResendAt(Date.now() + 60_000);
          throw error;
        }
      },
      t.account.otpSent.replace("{email}", account.data?.email ?? ""),
    );
    if (sent) {
      setOtpResendAt(Date.now() + 60_000);
      otpRef.current?.focus();
    }
  };

  const savePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (passwordAction.busy) return;
    setCurrentPasswordError(false);
    passwordAction.reset();
    const needsOtp = account.data?.hasPassword === false;
    const errors = {
      otp:
        needsOtp && !/^[0-9]{6}$/.test(otp.trim())
          ? t.account.otpInvalid
          : undefined,
      current:
        account.data?.hasPassword && !passwordForm.current.trim()
          ? requiredMessage
          : undefined,
      next: validateNewPassword(passwordForm.next),
      confirm: validateConfirmPassword(passwordForm.confirm),
    };
    setPasswordErrors(errors);
    if (errors.otp) {
      otpRef.current?.focus();
      return;
    }
    if (errors.current) {
      currentPasswordRef.current?.focus();
      return;
    }
    if (errors.next) {
      nextPasswordRef.current?.focus();
      return;
    }
    if (errors.confirm) {
      confirmPasswordRef.current?.focus();
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
            otpCode: account.data?.hasPassword ? null : otp.trim(),
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
      setPasswordErrors({});
      setOtp("");
      otpAction.reset();
      account.reload();
    }
  };

  return (
    <Shell
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
          <div
            className={
              user?.role === "Member" ? styles.content : "grid grid--2"
            }
          >
            <Card title={t.account.profileTitle}>
              <div className="stack">
                {user?.role === "Coach" && (
                  <CoachAvatarUpload
                    name={data.fullName || data.email}
                    avatarUrl={data.avatarUrl}
                  />
                )}
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

                <form
                  className={`form ${styles.form}`}
                  onSubmit={saveProfile}
                  noValidate
                >
                  <Field
                    label={t.account.fullName}
                    required
                    error={profileErrors.fullName}
                    reserveErrorSpace
                  >
                    <input
                      ref={fullNameRef}
                      value={profileForm.fullName}
                      required
                      onChange={(event) => {
                        setProfileErrors({});
                        setProfileForm({
                          ...profileForm,
                          fullName: event.target.value,
                        });
                      }}
                      onBlur={(event) =>
                        setProfileErrors({
                          fullName: event.target.value.trim()
                            ? undefined
                            : requiredMessage,
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
              <form
                className={`form ${styles.form}`}
                onSubmit={savePassword}
                noValidate
              >
                {!data.hasPassword && (
                  <>
                    <div className="alert alert--info">
                      {t.account.noPasswordNotice}
                    </div>
                    <div>
                      <button
                        type="button"
                        className="btn btn--secondary"
                        onClick={() => void sendOtp()}
                        disabled={otpAction.busy || resendSeconds > 0}
                      >
                        {resendSeconds > 0
                          ? t.account.resendCodeIn.replace(
                              "{seconds}",
                              String(resendSeconds),
                            )
                          : otpResendAt > 0
                            ? t.account.resendCode
                            : t.account.sendCode}
                      </button>
                    </div>
                    <Feedback
                      error={otpAction.error}
                      success={otpAction.success}
                    />
                    <Field
                      label={t.account.otpLabel}
                      required
                      error={passwordErrors.otp}
                      reserveErrorSpace
                    >
                      <input
                        ref={otpRef}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        value={otp}
                        required
                        onChange={(event) => {
                          passwordAction.reset();
                          setPasswordErrors((current) => ({
                            ...current,
                            otp: undefined,
                          }));
                          setOtp(event.target.value.replace(/[^0-9]/g, ""));
                        }}
                      />
                    </Field>
                  </>
                )}

                {data.hasPassword && (
                  <Field
                    label={t.account.currentPassword}
                    required
                    error={
                      currentPasswordError
                        ? t.account.currentPasswordIncorrect
                        : passwordErrors.current
                    }
                    reserveErrorSpace
                  >
                    <PasswordInput
                      ref={currentPasswordRef}
                      autoComplete="current-password"
                      value={passwordForm.current}
                      required
                      onChange={(event) => {
                        setCurrentPasswordError(false);
                        setPasswordErrors((current) => ({
                          ...current,
                          current: undefined,
                        }));
                        passwordAction.reset();
                        setPasswordForm({
                          ...passwordForm,
                          current: event.target.value,
                        });
                      }}
                      onBlur={(event) =>
                        setPasswordErrors((current) => ({
                          ...current,
                          current: event.target.value.trim()
                            ? undefined
                            : requiredMessage,
                        }))
                      }
                    />
                  </Field>
                )}

                <Field
                  label={t.account.newPassword}
                  required
                  error={passwordErrors.next}
                  reserveErrorSpace
                >
                  <PasswordInput
                    ref={nextPasswordRef}
                    autoComplete="new-password"
                    value={passwordForm.next}
                    required
                    onChange={(event) => {
                      setPasswordErrors((current) => ({
                        ...current,
                        next: undefined,
                      }));
                      setPasswordForm({
                        ...passwordForm,
                        next: event.target.value,
                      });
                    }}
                    onBlur={(event) =>
                      setPasswordErrors((current) => ({
                        ...current,
                        next: validateNewPassword(event.target.value),
                      }))
                    }
                  />
                </Field>

                <PasswordRequirements
                  password={passwordForm.next}
                  email={data.email}
                />

                <Field
                  label={t.account.confirmPassword}
                  required
                  error={passwordErrors.confirm}
                  reserveErrorSpace
                >
                  <PasswordInput
                    ref={confirmPasswordRef}
                    autoComplete="new-password"
                    value={passwordForm.confirm}
                    required
                    onChange={(event) => {
                      setPasswordErrors((current) => ({
                        ...current,
                        confirm: undefined,
                      }));
                      setPasswordForm({
                        ...passwordForm,
                        confirm: event.target.value,
                      });
                    }}
                    onBlur={(event) =>
                      setPasswordErrors((current) => ({
                        ...current,
                        confirm: validateConfirmPassword(event.target.value),
                      }))
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
