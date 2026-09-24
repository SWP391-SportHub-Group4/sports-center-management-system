"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError } from "@/lib/apiClient";
import { HOME_BY_ROLE, useAuth } from "@/lib/auth";
import { Feedback, Field } from "@/components/ui";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";

/**
 * Account demo of môi trường Development (view SportHub.API/Persistence/DemoDataSeeder.cs).
 *
 * Nút bấm only ĐIỀN FORM; việc đăng nhập still đi qua POST /api/auth/login như user real,
 * with mật khẩu băm BCrypt in DB (BR-5). Unable to đường tắt nào bỏ qua xác thực.
 */
const DEMO_ACCOUNTS = [
  { label: "System Administrator", email: "admin@sporthub.vn" },
  { label: "Center Manager", email: "manager@sporthub.vn" },
  { label: "Receptionist", email: "letan@sporthub.vn" },
  { label: "Yoga Coach", email: "coach.yoga@sporthub.vn" },
  { label: "Personal Trainer", email: "coach.pt@sporthub.vn" },
  { label: "Member", email: "an.member@sporthub.vn" },
];

const DEMO_PASSWORD = "Sporthub@123";
const SHOW_DEMO_ACCOUNTS = process.env.NODE_ENV === "development";

function loginErrorMessage(cause: unknown) {
  if (!(cause instanceof ApiError)) {
    return "We could not sign you in. Please try again.";
  }

  const messages: Record<string, string> = {
    invalid_credentials: "The email or password is incorrect.",
    account_banned: "This account is locked. Contact an administrator for help.",
    account_deactivated: "This account is inactive. Contact an administrator for help.",
    too_many_requests: "Too many sign-in attempts. Please wait and try again.",
    network_error: "We could not reach SportHub. Check your connection and try again.",
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
  const { login, loginWithGoogle } = useAuth();
  const router = useRouter();
  const params = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errorSource, setErrorSource] = useState<"credentials" | "form" | null>(null);
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
      const target =
        next && next.startsWith("/") && !next.startsWith("//")
          ? next
          : HOME_BY_ROLE[user.role];

      router.replace(target);
    } catch (cause) {
      setError(loginErrorMessage(cause));
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
            <p className="auth__eyebrow">Sport · Community · Progress</p>
            <p className="auth__statement">
              Pick up where your training left off.
            </p>
            <p className="auth__visual-detail">
              Your schedules, membership, and coaching journey—all in one place.
            </p>
          </div>
        </aside>

        <section className="auth__card" aria-labelledby="login-title">
          <Link className="auth__home-link" href="/">
            <span aria-hidden="true">←</span> Back to SportHub
          </Link>
          <h1 id="login-title" className="auth__brand">
            Sign in to SportHub
          </h1>
          <p className="auth__sub">
            Sign in to access your SportHub workspace.
          </p>

        {expired && (
          <div className="alert alert--warn auth__session-alert" role="status">
            Your session expired. Please sign in again.
          </div>
        )}

        <GoogleSignInButton
          text="continue_with"
          disabled={busy}
          onError={(cause) => {
            setError(loginErrorMessage(cause));
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
                const target =
                  next && next.startsWith("/") && !next.startsWith("//")
                    ? next
                    : HOME_BY_ROLE[user.role];
                router.replace(target);
              } catch (cause) {
                setError(loginErrorMessage(cause));
                setErrorSource("form");
              } finally {
                setBusy(false);
              }
            })();
          }}
        />

        <div className="auth__separator">
          <span>or sign in with email</span>
        </div>

        <form className="form" onSubmit={submit} aria-busy={busy}>
          <Field label="Email">
            <input
              type="email"
              value={email}
              autoComplete="username"
              required
              disabled={busy}
              suppressHydrationWarning
              aria-invalid={errorSource === "credentials"}
              aria-describedby={errorSource === "credentials" ? "login-error" : undefined}
              onChange={(event) => {
                setEmail(event.target.value);
                if (errorSource === "credentials") {
                  setError(null);
                  setErrorSource(null);
                }
              }}
            />
          </Field>

          <Field label="Password">
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
                aria-describedby={errorSource === "credentials" ? "login-error" : undefined}
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
                {showPassword ? "Hide" : "Show"}
              </button>
            </span>
          </Field>

          <div className="auth__feedback">
            <Feedback id="login-error" error={error} />
          </div>

          <button type="submit" className="btn" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
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

        {SHOW_DEMO_ACCOUNTS && <div className="demo-accounts">
          <strong className="small">
            Account demo (development environment)
          </strong>
          <p className="small muted" style={{ margin: "2px 0 0" }}>
            Select an account to fill in its email and the demo password <code>{DEMO_PASSWORD}</code>. Authentication still uses the real API.
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
        </div>}
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
