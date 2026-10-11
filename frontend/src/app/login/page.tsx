"use client";

import { useLanguage } from "@/lib/language";
import { Suspense, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError } from "@/lib/apiClient";
import { safeReturnTo, HOME_BY_ROLE, useAuth } from "@/lib/auth";
import { Feedback } from "@/components/ui";
import { AuthField, AuthPasswordField } from "@/components/auth/AuthField";
import { AuthBrand } from "@/components/auth/AuthCinemaShell";
import { IconLock, IconMail } from "@/components/icons";
import { ForgotPasswordModal } from "@/components/auth/ForgotPasswordModal";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import styles from "./login.module.css";

/**
 * Demo accounts for development environment (see SportHub.API/Persistence/DemoDataSeeder.cs).
 *
 * Clicking autofills the form; authentication still proceeds through POST /api/auth/login
 * with BCrypt hashed passwords in DB (BR-5). No shortcuts bypass authentication.
 */
const DEMO_ACCOUNTS = [
  { label: "System Administrator", email: "admin@sporthub.vn" },
  { label: "Center Manager", email: "manager@sporthub.vn" },
  { label: "Receptionist", email: "letan@sporthub.vn" },
  {
    label: "Coach · PT",
    email: "coach.pt@sporthub.vn",
  },
  {
    label: "Coach · Cầu lông",
    email: "coach.caulong@sporthub.vn",
  },
  { label: "Member", email: "an.member@sporthub.vn" },
];

const DEMO_PASSWORD = "Sporthub@123";
const SHOW_DEMO_ACCOUNTS =
  process.env.NODE_ENV === "development" ||
  process.env.NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS === "true";

function loginErrorMessage(
  cause: unknown,
  language: "en" | "vi",
  method: "password" | "google" = "password",
) {
  if (language === "vi")
    return cause instanceof ApiError
      ? cause.message
      : "Không thể đăng nhập. Vui lòng thử lại.";
  if (!(cause instanceof ApiError)) {
    return method === "google"
      ? "Google sign-in could not start. Please try again."
      : "We could not sign you in. Please try again.";
  }

  const messages: Record<string, string> = {
    invalid_credentials: "The email or password is incorrect.",
    account_banned:
      "This account is locked. Contact an administrator for help.",
    account_deactivated:
      "This account is inactive. Contact an administrator for help.",
    too_many_requests: "Too many sign-in attempts. Please wait and try again.",
    network_error:
      "We could not reach SportHub. Check your connection and try again.",
    invalid_google_token: "Google could not verify this sign-in attempt.",
    google_login_not_configured: "Google Sign-In is not configured yet.",
    google_identity_mismatch:
      "This email is linked to a different Google account.",
    google_email_not_verified: "Verify your Google email before signing in.",
    google_login_conflict: "Google sign-in is busy. Please try again.",
    google_script_failed:
      "Google sign-in could not load. Check your connection or browser settings and try again.",
    google_script_loading:
      "Google sign-in is loading. Please try again shortly.",
  };

  if (messages[cause.code]) return messages[cause.code];
  if (cause.status === 401)
    return method === "google"
      ? "Google could not verify this sign-in attempt. Please try again."
      : "The email or password is incorrect.";

  return method === "google"
    ? "Google sign-in failed. Please try again."
    : "We could not sign you in. Please try again.";
}

function LoginForm() {
  const { t, language } = useLanguage();
  const { login, loginWithGoogle } = useAuth();
  const router = useRouter();
  const params = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
  }>({});
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorSource, setErrorSource] = useState<"credentials" | "form" | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(
    params.get("forgot") === "1",
  );

  const expired = params.get("reason") === "session-expired";
  const next = params.get("next");
  const requiredMessage =
    language === "vi"
      ? "Vui lòng điền thông tin này."
      : "Please fill out this field.";
  const validateEmail = (value: string) =>
    !value.trim()
      ? requiredMessage
      : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
        ? t.refactor.emailInvalid
        : undefined;
  const validatePassword = (value: string) =>
    !value.trim() ? requiredMessage : undefined;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const nextErrors = {
      email: validateEmail(email),
      password: validatePassword(password),
    };
    setFieldErrors(nextErrors);
    if (nextErrors.email || nextErrors.password) {
      (nextErrors.email ? emailRef : passwordRef).current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    setErrorSource(null);

    try {
      const user = await login(email.trim(), password);

      // Back to đúng trang user định into, but only when that là đường dẫn nội bộ —
      // nhận nguyên parameters will thành open redirect.
      const target = safeReturnTo(next, HOME_BY_ROLE[user.role]);

      router.replace(target);
    } catch (cause) {
      setError(loginErrorMessage(cause, language));
      setErrorSource("credentials");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth auth--login">
      <main className="auth__layout">
        <aside className="auth__visual" aria-label="SportHub community">
          <div className="auth__visual-copy">
            <h2 className="auth__statement">
              Pick up where your training left off.
            </h2>
            <p className="auth__visual-detail">
              Your classes, court bookings and coaching, together in one place.
            </p>
          </div>
        </aside>

        <section
          className={`auth__card ${styles.card}`}
          aria-labelledby="login-title"
        >
          <div className="auth__top-row">
            <AuthBrand />
            <Link className="auth__landing-link" href="/">
              ← Back to homepage
            </Link>
          </div>
          <h1 id="login-title" className={styles.title}>
            {t.auth.signInTitle}
          </h1>
          <div className={styles.introMessage}>
            {error && (
              <div className={styles.feedback}>
                <Feedback id="login-error" error={error} />
              </div>
            )}
          </div>

          {expired && (
            <div
              className="alert alert--warn auth__session-alert"
              role="status"
            >
              {t.refactor.sessionExpired}
            </div>
          )}

          <form
            className={styles.form}
            onSubmit={submit}
            aria-busy={busy}
            noValidate
          >
            <AuthField
              ref={emailRef}
              label={t.refactor.email}
              placeholder="example@gmail.com"
              icon={<IconMail size={20} />}
              type="email"
              value={email}
              autoComplete="username"
              required
              error={fieldErrors.email}
              disabled={busy}
              suppressHydrationWarning
              aria-invalid={
                errorSource === "credentials" || Boolean(fieldErrors.email)
              }
              aria-describedby={
                errorSource === "credentials" ? "login-error" : undefined
              }
              onChange={(event) => {
                setEmail(event.target.value);
                if (fieldErrors.email)
                  setFieldErrors((current) => ({
                    ...current,
                    email: validateEmail(event.target.value),
                  }));
                if (errorSource === "credentials") {
                  setError(null);
                  setErrorSource(null);
                }
              }}
              onBlur={(event) =>
                setFieldErrors((current) => ({
                  ...current,
                  email: validateEmail(event.target.value),
                }))
              }
            />

            <div className={styles.passwordGroup}>
              <AuthPasswordField
                ref={passwordRef}
                label={t.refactor.password}
                icon={<IconLock size={20} />}
                showLabel={t.refactor.show}
                hideLabel={t.refactor.hide}
                value={password}
                autoComplete="current-password"
                maxLength={256}
                required
                error={fieldErrors.password}
                disabled={busy}
                suppressHydrationWarning
                aria-invalid={
                  errorSource === "credentials" || Boolean(fieldErrors.password)
                }
                aria-describedby={
                  errorSource === "credentials" ? "login-error" : undefined
                }
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (fieldErrors.password)
                    setFieldErrors((current) => ({
                      ...current,
                      password: validatePassword(event.target.value),
                    }));
                  if (errorSource === "credentials") {
                    setError(null);
                    setErrorSource(null);
                  }
                }}
                onBlur={(event) =>
                  setFieldErrors((current) => ({
                    ...current,
                    password: validatePassword(event.target.value),
                  }))
                }
              />
              <button
                type="button"
                className={styles.forgot}
                onClick={() => setForgotOpen(true)}
              >
                {t.auth.forgotPassword}
              </button>
            </div>

            <button
              type="submit"
              className={`btn ${styles.submit}`}
              disabled={busy}
            >
              {busy ? (
                <span className="btn__busy">
                  <span className="spinner" aria-hidden="true" />
                  <span>Signing in…</span>
                </span>
              ) : (
                t.auth.signInBtn
              )}
            </button>
          </form>

          <div className={`auth__separator ${styles.separator}`}>
            <span>{t.refactor.emailSignIn}</span>
          </div>

          <GoogleSignInButton
            text="signin_with"
            disabled={busy}
            onError={(cause) => {
              setError(loginErrorMessage(cause, language, "google"));
              setErrorSource("form");
            }}
            onCredential={(idToken) => {
              void (async () => {
                if (busy) return;
                setBusy(true);
                setError(null);
                setErrorSource(null);
                try {
                  const user = await loginWithGoogle(idToken);
                  const target = safeReturnTo(next, HOME_BY_ROLE[user.role]);
                  router.replace(target);
                } catch (cause) {
                  console.error("Google sign-in failed", cause);
                  setError(loginErrorMessage(cause, language, "google"));
                  setErrorSource("form");
                } finally {
                  setBusy(false);
                }
              })();
            }}
          />

          <p className={styles.signup}>
            {t.auth.noAccount} <Link href="/register">{t.auth.createOne}</Link>
          </p>

          {SHOW_DEMO_ACCOUNTS && (
            <details className="demo-accounts">
              <summary className="demo-accounts__summary">
                <span className="demo-accounts__badge">DEV</span>
                <span>Quick Fill Demo Accounts</span>
                <span className="demo-accounts__hint">Click to toggle</span>
              </summary>
              <p className="small muted" style={{ margin: "8px 0 6px" }}>
                Select a role to autofill credentials (password:{" "}
                <code>{DEMO_PASSWORD}</code>). Authentication uses the real API.
              </p>
              <div className="demo-accounts__grid">
                {DEMO_ACCOUNTS.map((account) => (
                  <button
                    key={account.email}
                    type="button"
                    className="btn btn--ghost btn--sm"
                    disabled={busy}
                    onClick={() => {
                      setEmail(account.email);
                      setPassword(DEMO_PASSWORD);
                      setFieldErrors({});
                      setError(null);
                      setErrorSource(null);
                    }}
                  >
                    {account.label}
                  </button>
                ))}
              </div>
            </details>
          )}
        </section>
      </main>
      {forgotOpen && (
        <ForgotPasswordModal
          initialEmail={email}
          onClose={() => setForgotOpen(false)}
        />
      )}
    </div>
  );
}

export default function LoginPage() {
  // useSearchParams need Suspense boundary when build tĩnh (Next App Router).
  return (
    <Suspense
      fallback={
        <div className="auth auth--login">
          <div className="auth__card">Loading…</div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
