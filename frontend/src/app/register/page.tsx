"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, api } from "@/lib/apiClient";
import { HOME_BY_ROLE, useAuth } from "@/lib/auth";
import { Feedback } from "@/components/ui";
import { AuthField, AuthPasswordField } from "@/components/auth/AuthField";
import { AuthBrand } from "@/components/auth/AuthCinemaShell";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import {
  PasswordRequirements,
  passwordChecks,
} from "@/features/identity/password-requirements";
import { useLanguage } from "@/lib/language";
import {
  IconCheck,
  IconLock,
  IconMail,
  IconPhone,
  IconUser,
} from "@/components/icons";

const OTP_EXPIRY_SECONDS = 600; // Member registration OTP: 10 minutes
const RESEND_COOLDOWN_SECONDS = 60; // 1 minute

export default function RegisterPage() {
  const { register, loginWithGoogle } = useAuth();
  const router = useRouter();
  const { t, language } = useLanguage();

  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState({
    email: "",
    otp: "",
    fullName: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });

  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [busy, setBusy] = useState(false);

  const [otpSecondsLeft, setOtpSecondsLeft] = useState(0);
  const [resendCooldown, setResendCooldown] = useState(0);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<
      Record<
        "email" | "otp" | "fullName" | "password" | "confirmPassword",
        string
      >
    >
  >({});

  const emailInputRef = useRef<HTMLInputElement>(null);
  const otpInputRef = useRef<HTMLInputElement>(null);
  const fullNameInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const confirmInputRef = useRef<HTMLInputElement>(null);
  const requiredMessage =
    language === "vi"
      ? "Vui lòng điền thông tin này."
      : "Please fill out this field.";
  const requiredError = (value: string) =>
    !value.trim() ? requiredMessage : undefined;
  const emailError = (value: string) =>
    requiredError(value) ??
    (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
      ? t.refactor.emailInvalid
      : undefined);

  // Timers for OTP expiration and resend cooldown
  useEffect(() => {
    if (otpSecondsLeft <= 0) return;
    const timer = setInterval(() => {
      setOtpSecondsLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [otpSecondsLeft]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const message = (cause: unknown) => {
    if (language === "vi")
      return cause instanceof ApiError ? cause.message : t.refactor.loginFailed;
    if (!(cause instanceof ApiError)) {
      return "We couldn't complete your request.";
    }
    const messages: Record<string, string> = {
      gmail_required: "Enter a valid email address.",
      email_already_exists: "This email address is already registered.",
      phone_already_exists: "This phone number is already registered.",
      otp_not_found: "No verification code was requested for this email.",
      otp_already_used:
        "This verification code has already been used. Please request a new code.",
      otp_expired:
        "The verification code is missing or has expired. Please request a new code.",
      otp_attempts_exceeded:
        "Too many incorrect attempts. Please request a new code.",
      otp_invalid:
        "The verification code is incorrect. Please check and try again.",
      invalid_otp: "The verification code is incorrect.",
      otp_resend_too_soon: "Please wait before requesting another code.",
      google_account_not_linked:
        "This email address already has a SportHub account. Sign in with your password, then link Google from Account settings.",
      invalid_google_token: "Google couldn't verify this sign-up attempt.",
      google_login_not_configured: "Google sign-up is not configured yet.",
      network_error: "We couldn't connect to the server. Try again shortly.",
    };
    return (
      messages[cause.code] ??
      "We couldn't create your account. Please try again."
    );
  };

  const sendOtp = async () => {
    if (sendingOtp) return;
    const trimmedEmail = form.email.trim();
    const validationError = emailError(trimmedEmail);
    setFieldErrors((current) => ({ ...current, email: validationError }));
    if (validationError) {
      emailInputRef.current?.focus();
      return;
    }
    setSendingOtp(true);
    setError(null);
    setNotice(null);
    try {
      await api.post(
        "/api/auth/register/otp",
        { email: trimmedEmail },
        { anonymous: true },
      );
      setOtpSent(true);
      setOtpSecondsLeft(OTP_EXPIRY_SECONDS);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      setNotice(
        "If registration is available, a 6-digit verification code has been sent to your email.",
      );
      setTimeout(() => {
        otpInputRef.current?.focus();
      }, 100);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setSendingOtp(false);
    }
  };

  const verifyOtpAndContinue = (event?: React.FormEvent) => {
    if (event) event.preventDefault();
    if (form.otp.length !== 6) {
      setFieldErrors((current) => ({
        ...current,
        otp:
          requiredError(form.otp) ?? "Please enter the complete 6-digit code.",
      }));
      otpInputRef.current?.focus();
      return;
    }
    if (otpSecondsLeft === 0) {
      setError("The verification code has expired. Please request a new code.");
      return;
    }

    setError(null);
    setNotice(null);
    setStep(2);
  };

  const submitFinal = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const nextErrors = {
      fullName: requiredError(form.fullName),
      password: requiredError(form.password),
      confirmPassword: requiredError(form.confirmPassword),
    };
    setFieldErrors((current) => ({ ...current, ...nextErrors }));
    if (
      nextErrors.fullName ||
      nextErrors.password ||
      nextErrors.confirmPassword
    ) {
      (nextErrors.fullName
        ? fullNameInputRef
        : nextErrors.password
          ? passwordInputRef
          : confirmInputRef
      ).current?.focus();
      return;
    }
    if (form.otp.length !== 6) {
      setError("Verification code is missing or invalid. Please check Step 1.");
      setStep(1);
      return;
    }
    if (!passwordChecks(form.password, form.email).every(Boolean)) {
      setFieldErrors((current) => ({
        ...current,
        password: t.identity.passwordInvalid,
      }));
      passwordInputRef.current?.focus();
      return;
    }
    if (form.password !== form.confirmPassword) {
      setFieldErrors((current) => ({
        ...current,
        confirmPassword: t.refactor.mismatch,
      }));
      confirmInputRef.current?.focus();
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    setFieldErrors({});

    try {
      const user = await register({
        email: form.email.trim(),
        otpCode: form.otp.trim(),
        fullName: form.fullName.trim(),
        phone: form.phone.trim() || undefined,
        password: form.password,
      });
      router.replace(HOME_BY_ROLE[user.role]);
    } catch (cause) {
      setError(message(cause));
      if (
        cause instanceof ApiError &&
        (cause.code.startsWith("otp_") || cause.code === "invalid_otp")
      ) {
        setStep(1);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleResetEmail = () => {
    setOtpSent(false);
    setOtpSecondsLeft(0);
    setResendCooldown(0);
    setForm((prev) => ({ ...prev, otp: "" }));
    setError(null);
    setNotice(null);
    setFieldErrors({});
    setStep(1);
  };

  const passwordMatch =
    form.confirmPassword.length > 0
      ? form.password === form.confirmPassword
      : null;

  return (
    <div className="auth auth--register">
      <main className="auth__layout">
        {/* Left Branded Visual Panel */}
        <aside className="auth__visual" aria-label="SportHub Member Community">
          <div className="auth__visual-copy">
            <p className="auth__statement">Start your athletic journey.</p>
            <p className="auth__visual-detail">
              Find your court, join a class and train with the SportHub
              community.
            </p>
          </div>
        </aside>

        {/* Right Form Card */}
        <section className="auth__card" aria-labelledby="register-title">
          <AuthBrand />

          <h1 id="register-title" className="auth__brand">
            Create your member account
          </h1>
          <p className="auth__sub">
            Join SportHub in 2 quick steps and start training today.
          </p>

          {/* 2-Step Progress Indicator */}
          <nav className="auth__steps" aria-label="Registration steps">
            <div
              className={`auth__step ${step === 1 ? "auth__step--active" : "auth__step--done"}`}
            >
              <span className="auth__step-badge">1</span>
              <span>Verify email</span>
            </div>
            <div
              className={`auth__step-line ${step === 2 ? "auth__step-line--done" : ""}`}
            />
            <div
              className={`auth__step ${step === 2 ? "auth__step--active" : ""}`}
            >
              <span className="auth__step-badge">2</span>
              <span>Account details</span>
            </div>
          </nav>

          {/* Step 1: Email & OTP Verification */}
          {step === 1 && (
            <>
              {/* Quick Google Sign-Up */}
              <GoogleSignInButton
                text="signup_with"
                disabled={busy || sendingOtp}
                onError={(cause) => setError(message(cause))}
                onCredential={(idToken) => {
                  void (async () => {
                    setBusy(true);
                    setError(null);
                    try {
                      const user = await loginWithGoogle(idToken);
                      router.replace(HOME_BY_ROLE[user.role]);
                    } catch (cause) {
                      setError(message(cause));
                    } finally {
                      setBusy(false);
                    }
                  })();
                }}
              />

              <div className="auth__separator">
                <span>or sign up with email</span>
              </div>

              <div className="form">
                <div className="otp-request-row">
                  <AuthField
                    ref={emailInputRef}
                    type="email"
                    label={t.refactor.email}
                    icon={<IconMail size={20} />}
                    autoComplete="email"
                    required
                    error={fieldErrors.email}
                    reserveErrorSpace
                    disabled={otpSent || sendingOtp}
                    value={form.email}
                    suppressHydrationWarning
                    onChange={(event) => {
                      setForm({ ...form, email: event.target.value });
                      if (fieldErrors.email)
                        setFieldErrors((current) => ({
                          ...current,
                          email: emailError(event.target.value),
                        }));
                      setError(null);
                    }}
                    onBlur={(event) =>
                      setFieldErrors((current) => ({
                        ...current,
                        email: emailError(event.target.value),
                      }))
                    }
                  />
                  {!otpSent ? (
                    <button
                      type="button"
                      className="btn btn--secondary"
                      disabled={sendingOtp}
                      onClick={() => void sendOtp()}
                    >
                      {sendingOtp ? t.refactor.sending : t.refactor.sendCode}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn--quiet"
                      onClick={handleResetEmail}
                    >
                      Change
                    </button>
                  )}
                </div>

                {/* OTP Verification Card: Revealed once code is sent */}
                {otpSent && (
                  <form
                    noValidate
                    onSubmit={(e) => void verifyOtpAndContinue(e)}
                    className="otp-box"
                  >
                    <div className="otp-box__header">
                      <span>Enter the 6-digit verification code:</span>
                      <span className="otp-box__timer" aria-live="polite">
                        {otpSecondsLeft > 0
                          ? `Expires in ${formatTimer(otpSecondsLeft)}`
                          : t.refactor.codeExpired}
                      </span>
                    </div>

                    <input
                      ref={otpInputRef}
                      className="otp-input"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="\d{6}"
                      maxLength={6}
                      required
                      aria-invalid={Boolean(fieldErrors.otp)}
                      aria-describedby={
                        fieldErrors.otp ? "register-otp-error" : undefined
                      }
                      aria-label="Verification code"
                      placeholder="••••••"
                      disabled={otpSecondsLeft === 0}
                      value={form.otp}
                      suppressHydrationWarning
                      onChange={(event) => {
                        const code = event.target.value.replace(/\D/g, "");
                        setForm({ ...form, otp: code });
                        if (fieldErrors.otp)
                          setFieldErrors((current) => ({
                            ...current,
                            otp:
                              code.length === 6
                                ? undefined
                                : (requiredError(code) ??
                                  "Please enter the complete 6-digit code."),
                          }));
                        setError(null);
                      }}
                      onBlur={(event) =>
                        setFieldErrors((current) => ({
                          ...current,
                          otp:
                            event.target.value.length === 6
                              ? undefined
                              : (requiredError(event.target.value) ??
                                "Please enter the complete 6-digit code."),
                        }))
                      }
                    />
                    <div className="otp-error-slot">
                      {fieldErrors.otp && (
                        <p id="register-otp-error" role="alert">
                          {fieldErrors.otp}
                        </p>
                      )}
                    </div>

                    <div className="otp-box__actions">
                      <button
                        type="button"
                        className="btn btn--quiet btn--sm"
                        disabled={resendCooldown > 0 || sendingOtp}
                        onClick={() => void sendOtp()}
                      >
                        {resendCooldown > 0
                          ? `Resend in ${resendCooldown}s`
                          : sendingOtp
                            ? "Sending…"
                            : t.refactor.resendCode}
                      </button>

                      <button
                        type="submit"
                        className="btn btn--sm"
                        disabled={otpSecondsLeft === 0}
                      >
                        Continue to Step 2 →
                      </button>
                    </div>
                  </form>
                )}

                <div className="auth__feedback">
                  <Feedback error={error} success={notice} />
                </div>
              </div>
            </>
          )}

          {/* Step 2: Name & Password Setup */}
          {step === 2 && (
            <form className="form" onSubmit={submitFinal} noValidate>
              <div className="verified-chip">
                <span>
                  Verified:{" "}
                  <strong className="verified-chip__email">{form.email}</strong>
                </span>
                <button
                  type="button"
                  className="verified-chip__change"
                  onClick={handleResetEmail}
                >
                  Change email
                </button>
              </div>

              <AuthField
                ref={fullNameInputRef}
                label={t.refactor.fullName}
                icon={<IconUser size={20} />}
                autoComplete="name"
                maxLength={100}
                required
                error={fieldErrors.fullName}
                reserveErrorSpace
                disabled={busy}
                value={form.fullName}
                suppressHydrationWarning
                onChange={(event) => {
                  setForm({ ...form, fullName: event.target.value });
                  if (fieldErrors.fullName)
                    setFieldErrors((current) => ({
                      ...current,
                      fullName: requiredError(event.target.value),
                    }));
                  setError(null);
                }}
                onBlur={(event) =>
                  setFieldErrors((current) => ({
                    ...current,
                    fullName: requiredError(event.target.value),
                  }))
                }
              />

              <AuthField
                type="tel"
                label={t.auth.phoneLabel}
                icon={<IconPhone size={20} />}
                autoComplete="tel"
                disabled={busy}
                value={form.phone}
                onChange={(event) =>
                  setForm({ ...form, phone: event.target.value })
                }
              />

              <AuthPasswordField
                ref={passwordInputRef}
                label={t.refactor.password}
                icon={<IconLock size={20} />}
                showLabel={t.refactor.show}
                hideLabel={t.refactor.hide}
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                required
                error={fieldErrors.password}
                reserveErrorSpace
                disabled={busy}
                value={form.password}
                suppressHydrationWarning
                onChange={(event) => {
                  setForm({ ...form, password: event.target.value });
                  if (fieldErrors.password)
                    setFieldErrors((current) => ({
                      ...current,
                      password: requiredError(event.target.value),
                    }));
                  setError(null);
                }}
                onBlur={(event) =>
                  setFieldErrors((current) => ({
                    ...current,
                    password: requiredError(event.target.value),
                  }))
                }
              />

              <div>
                <AuthPasswordField
                  ref={confirmInputRef}
                  label={t.refactor.confirmPassword}
                  icon={<IconLock size={20} />}
                  showLabel={t.refactor.show}
                  hideLabel={t.refactor.hide}
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  required
                  error={fieldErrors.confirmPassword}
                  reserveErrorSpace
                  disabled={busy}
                  value={form.confirmPassword}
                  suppressHydrationWarning
                  onChange={(event) => {
                    setForm({ ...form, confirmPassword: event.target.value });
                    if (fieldErrors.confirmPassword)
                      setFieldErrors((current) => ({
                        ...current,
                        confirmPassword: requiredError(event.target.value),
                      }));
                    setError(null);
                  }}
                  onBlur={(event) =>
                    setFieldErrors((current) => ({
                      ...current,
                      confirmPassword: requiredError(event.target.value),
                    }))
                  }
                />
                {passwordMatch === true && (
                  <span
                    className="match-hint match-hint--ok"
                    aria-live="polite"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <IconCheck size={14} strokeWidth={2.4} /> Passwords match
                  </span>
                )}
                {passwordMatch === false && (
                  <span
                    className="match-hint match-hint--warn"
                    aria-live="polite"
                  >
                    Passwords do not match yet
                  </span>
                )}
              </div>

              <div className="auth__feedback">
                <PasswordRequirements
                  password={form.password}
                  email={form.email}
                />
                <Feedback error={error} success={notice} />
              </div>

              <button
                type="submit"
                className="btn"
                disabled={
                  busy ||
                  !form.fullName.trim() ||
                  form.password.length < 8 ||
                  form.password !== form.confirmPassword
                }
              >
                {busy ? t.refactor.creating : t.refactor.createAccount}
              </button>

              <button
                type="button"
                className="auth__back-step"
                onClick={() => setStep(1)}
              >
                ← Back to email step
              </button>
            </form>
          )}

          <p className="small muted" style={{ marginTop: 16 }}>
            Already have an account? <Link href="/login">Sign in</Link>.
          </p>
        </section>
      </main>
    </div>
  );
}
