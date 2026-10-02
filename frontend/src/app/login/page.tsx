"use client";

import {useLanguage} from "@/lib/language";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError } from "@/lib/apiClient";
import {
  GoogleOnboardingRequired,
  type GoogleOnboardingPending,
  safeReturnTo,
  HOME_BY_ROLE,
  useAuth,
} from "@/lib/auth";
import { Feedback, Field } from "@/components/ui";
import { GoogleOnboarding } from "@/features/identity/google-onboarding";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";

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
  { label: "External Coach", email: "coach.external.approved@sporthub.vn" },
  { label: "Member", email: "an.member@sporthub.vn" },
];

const DEMO_PASSWORD = "Sporthub@123";
const SHOW_DEMO_ACCOUNTS = process.env.NODE_ENV === "development";

function loginErrorMessage(cause: unknown, language: "en" | "vi") {
  if (language === "vi") return cause instanceof ApiError ? cause.message : "Không thể đăng nhập. Vui lòng thử lại.";
  if (!(cause instanceof ApiError)) {
    return "We could not sign you in. Please try again.";
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
    google_account_not_linked:
      "This Google account is not linked to SportHub. Sign in with your password first.",
    google_login_not_configured: "Google Sign-In is not configured yet.",
  };

  if (messages[cause.code]) return messages[cause.code];
  if (cause.status === 401) return "The email or password is incorrect.";

  return "We could not sign you in. Please try again.";
}

function LoginForm() {
  const {t,language} = useLanguage();
  const { login, loginWithGoogle } = useAuth();
  const router = useRouter();
  const [onboarding, setOnboarding] = useState<GoogleOnboardingPending | null>(
    null,
  );
  const params = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errorSource, setErrorSource] = useState<"credentials" | "form" | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const expired = params.get("reason") === "session-expired";
  const next = params.get("next");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
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
      setError(loginErrorMessage(cause,language));
      setErrorSource("credentials");
    } finally {
      setBusy(false);
    }
  };

  if (onboarding)
    return (
      <main className="auth">
        <div className="auth__card">
          <GoogleOnboarding
            pending={onboarding}
            onCancel={() => setOnboarding(null)}
          />
        </div>
      </main>
    );

  return (
    <div className="auth auth--login">
      <main className="auth__layout">
        <aside className="auth__visual" aria-label="SportHub community">
          <div className="auth__visual-copy">
            <h2 className="auth__statement">
              Pick up where your training left off.
            </h2>
            <p className="auth__visual-detail">
              Your schedules, membership, and coaching journey—all in one place.
            </p>
          </div>
        </aside>

        <section className="auth__card" aria-labelledby="login-title">
          <Link className="auth__home-link" href="/">
            <span aria-hidden="true">←</span> {t.refactor.backHome}
          </Link>
          <h1 id="login-title" className="auth__brand">
            {t.auth.signInTitle}
          </h1>
          <p className="auth__sub">
            {t.auth.signInSubtitle}
          </p>

          {expired && (
            <div
              className="alert alert--warn auth__session-alert"
              role="status"
            >
              {t.refactor.sessionExpired}
            </div>
          )}

          <GoogleSignInButton
            text="continue_with"
            disabled={busy}
            onError={(cause) => {
              setError(loginErrorMessage(cause,language));
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
                  if (cause instanceof GoogleOnboardingRequired) {
                    setOnboarding(cause.pending);
                  } else setError(loginErrorMessage(cause,language));
                  setErrorSource("form");
                } finally {
                  setBusy(false);
                }
              })();
            }}
          />

          <div className="auth__separator">
            <span>{t.refactor.emailSignIn}</span>
          </div>

          <form className="form" onSubmit={submit} aria-busy={busy}>
            <Field label={t.refactor.email}>
              <input
                type="email"
                value={email}
                autoComplete="username"
                required
                disabled={busy}
                suppressHydrationWarning
                aria-invalid={errorSource === "credentials"}
                aria-describedby={
                  errorSource === "credentials" ? "login-error" : undefined
                }
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (errorSource === "credentials") {
                    setError(null);
                    setErrorSource(null);
                  }
                }}
              />
            </Field>

            <Field label={t.refactor.password}>
              <span className="password-field">
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  autoComplete="current-password"
                  maxLength={256}
                  required
                  disabled={busy}
                  suppressHydrationWarning
                  aria-invalid={errorSource === "credentials"}
                  aria-describedby={
                    errorSource === "credentials" ? "login-error" : undefined
                  }
                  onChange={(event) => {
                    setPassword(event.target.value);
                    if (errorSource === "credentials") {
                      setError(null);
                      setErrorSource(null);
                    }
                  }}
                />
                <button
                  className="password-field__toggle"
                  type="button"
                  aria-controls="login-password"
                  aria-pressed={showPassword}
                  disabled={busy}
                  onClick={() => setShowPassword((visible) => !visible)}
                >
                  {showPassword ? t.refactor.hide : t.refactor.show}
                </button>
              </span>
            </Field>

            <div className="auth__feedback">
              <Feedback id="login-error" error={error} />
            </div>

            <button type="submit" className="btn" disabled={busy}>
              {busy ? (
                <span className="btn__busy">
                  <span className="spinner" aria-hidden="true" />
                  <span>Signing in…</span>
                </span>
              ) : (
                "Sign in"
              )}
            </button>
          </form>

          <nav className="auth__links" aria-label="Account help">
            <p className="small muted">
              Don&apos;t have a member account?{" "}
              <Link href="/register">Create an account</Link>.
            </p>
            <Link className="small" href="/forgot-password">
              Forgot password?
            </Link>
          </nav>

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
