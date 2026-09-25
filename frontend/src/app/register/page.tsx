"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, api } from "@/lib/apiClient";
import { HOME_BY_ROLE, useAuth } from "@/lib/auth";
import { Feedback, Field } from "@/components/ui";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";

const OTP_EXPIRY_SECONDS = 300; // 5 minutes
const RESEND_COOLDOWN_SECONDS = 60; // 1 minute

export default function RegisterPage() {
  const { register, loginWithGoogle } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState({
    email: "",
    otp: "",
    fullName: "",
    password: "",
    confirmPassword: "",
  });

  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [busy, setBusy] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [otpSecondsLeft, setOtpSecondsLeft] = useState(0);
  const [resendCooldown, setResendCooldown] = useState(0);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const otpInputRef = useRef<HTMLInputElement>(null);

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
    if (!(cause instanceof ApiError)) {
      return "We couldn't complete your request.";
    }
    const messages: Record<string, string> = {
      gmail_required: "Enter a valid Gmail address.",
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
        "This Gmail address already has a SportHub account. Sign in with your password, then link Google from Account settings.",
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
    if (!trimmedEmail.toLowerCase().endsWith("@gmail.com")) {
      setError("Enter a valid Gmail address (ending with @gmail.com).");
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
        "A 6-digit verification code has been sent to your Gmail inbox.",
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
      setError("Please enter the complete 6-digit code.");
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
    if (form.otp.length !== 6) {
      setError("Verification code is missing or invalid. Please check Step 1.");
      setStep(1);
      return;
    }
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const user = await register({
        email: form.email.trim(),
        otpCode: form.otp.trim(),
        fullName: form.fullName.trim(),
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
            <p className="auth__eyebrow">Sport · Community · Progress</p>
            <p className="auth__statement">Start your athletic journey.</p>
            <p className="auth__visual-detail">
              Join SportHub today to access high-performance gym floors, connect
              with top coaches, and elevate your fitness routine with our
              vibrant community.
            </p>
          </div>
        </aside>

        {/* Right Form Card */}
        <section className="auth__card" aria-labelledby="register-title">
          <Link className="auth__home-link" href="/">
            <span aria-hidden="true">←</span> Back to SportHub
          </Link>

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
              <span>Verify Gmail</span>
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
                <span>or sign up with Gmail</span>
              </div>

              <div className="form">
                <Field
                  label="Gmail"
                  hint="Only @gmail.com addresses are accepted."
                >
                  <div className="otp-request-row">
                    <input
                      type="email"
                      autoComplete="email"
                      pattern=".+@gmail\.com$"
                      required
                      disabled={otpSent || sendingOtp}
                      value={form.email}
                      placeholder="your.email@gmail.com"
                      suppressHydrationWarning
                      onChange={(event) => {
                        setForm({ ...form, email: event.target.value });
                        setError(null);
                      }}
                    />
                    {!otpSent ? (
                      <button
                        type="button"
                        className="btn btn--secondary"
                        disabled={sendingOtp || !form.email.trim()}
                        onClick={() => void sendOtp()}
                      >
                        {sendingOtp ? "Sending…" : "Send code"}
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
                </Field>

                {/* OTP Verification Card: Revealed once code is sent */}
                {otpSent && (
                  <form
                    onSubmit={(e) => void verifyOtpAndContinue(e)}
                    className="otp-box"
                  >
                    <div className="otp-box__header">
                      <span>Enter the 6-digit verification code:</span>
                      <span className="otp-box__timer" aria-live="polite">
                        {otpSecondsLeft > 0
                          ? `Expires in ${formatTimer(otpSecondsLeft)}`
                          : "Code expired"}
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
                      placeholder="••••••"
                      disabled={otpSecondsLeft === 0}
                      value={form.otp}
                      suppressHydrationWarning
                      onChange={(event) => {
                        const code = event.target.value.replace(/\D/g, "");
                        setForm({ ...form, otp: code });
                        setError(null);
                      }}
                    />

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
                            : "Resend code"}
                      </button>

                      <button
                        type="submit"
                        className="btn btn--sm"
                        disabled={form.otp.length !== 6 || otpSecondsLeft === 0}
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
            <form className="form" onSubmit={submitFinal}>
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

              <Field label="Full name">
                <input
                  autoComplete="name"
                  maxLength={100}
                  required
                  placeholder="e.g. Alex Johnson"
                  disabled={busy}
                  value={form.fullName}
                  suppressHydrationWarning
                  onChange={(event) => {
                    setForm({ ...form, fullName: event.target.value });
                    setError(null);
                  }}
                />
              </Field>

              <Field label="Password" hint="Use at least 8 characters.">
                <span className="password-field">
                  <input
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={128}
                    required
                    disabled={busy}
                    placeholder="Create a strong password"
                    value={form.password}
                    suppressHydrationWarning
                    onChange={(event) => {
                      setForm({ ...form, password: event.target.value });
                      setError(null);
                    }}
                  />
                  <button
                    type="button"
                    className="password-field__toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    title={showPassword ? "Hide password" : "Show password"}
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </span>
              </Field>

              <Field label="Confirm password">
                <span className="password-field">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={128}
                    required
                    disabled={busy}
                    placeholder="Repeat your password"
                    value={form.confirmPassword}
                    suppressHydrationWarning
                    onChange={(event) => {
                      setForm({ ...form, confirmPassword: event.target.value });
                      setError(null);
                    }}
                  />
                  <button
                    type="button"
                    className="password-field__toggle"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    title={
                      showConfirmPassword ? "Hide password" : "Show password"
                    }
                    aria-label={
                      showConfirmPassword ? "Hide password" : "Show password"
                    }
                  >
                    {showConfirmPassword ? "Hide" : "Show"}
                  </button>
                </span>
                {passwordMatch === true && (
                  <span
                    className="match-hint match-hint--ok"
                    aria-live="polite"
                  >
                    ✓ Passwords match
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
              </Field>

              <div className="auth__feedback">
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
                {busy ? "Creating account…" : "Create account"}
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
