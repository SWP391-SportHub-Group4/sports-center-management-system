"use client";
import { useState } from "react";
import Link from "next/link";
import { ApiError, api } from "@/lib/apiClient";
import { Feedback, Field } from "@/components/ui";

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<"email" | "otp" | "password" | "done">(
    "email",
  );
  const [form, setForm] = useState({
    email: "",
    otp: "",
    password: "",
    confirm: "",
  });
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Unable to refund all request.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="auth">
      <div className="auth__card">
        <div className="auth__brand">Forgot password</div>
        <p className="auth__sub">Gmail authentication to set new password.</p>
        {step === "email" && (
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await api.post(
                  "/api/auth/email-otp/request",
                  { email: form.email, purpose: "PasswordReset" },
                  { anonymous: true },
                );
                setStep("otp");
              });
            }}
          >
            <Field label="Gmail">
              <input
                type="email"
                pattern=".+@gmail\.com$"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
            <Feedback error={error} />
            <button className="btn" disabled={busy}>
              Send OTP code
            </button>
          </form>
        )}
        {step === "otp" && (
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const r = await api.post<{ verificationToken: string }>(
                  "/api/auth/email-otp/verify",
                  {
                    email: form.email,
                    code: form.otp,
                    purpose: "PasswordReset",
                  },
                  { anonymous: true },
                );
                setToken(r.verificationToken);
                setStep("password");
              });
            }}
          >
            <Field label="Code OTP">
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                required
                value={form.otp}
                onChange={(e) =>
                  setForm({ ...form, otp: e.target.value.replace(/\D/g, "") })
                }
              />
            </Field>
            <Feedback error={error} />
            <button className="btn" disabled={busy}>
              OTP authentication
            </button>
          </form>
        )}
        {step === "password" && (
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              if (form.password !== form.confirm) {
                setError("Password confirmed no match.");
                return;
              }
              void run(async () => {
                await api.post(
                  "/api/auth/password/reset",
                  {
                    email: form.email,
                    verificationToken: token,
                    newPassword: form.password,
                  },
                  { anonymous: true },
                );
                setStep("done");
              });
            }}
          >
            <Field label="New password">
              <input
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </Field>
            <Field label="Confirm password">
              <input
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={form.confirm}
                onChange={(e) => setForm({ ...form, confirm: e.target.value })}
              />
            </Field>
            <Feedback error={error} />
            <button className="btn" disabled={busy}>
              Set a new password
            </button>
          </form>
        )}
        {step === "done" && (
          <div className="stack">
            <div className="alert alert--success">Password update.</div>
            <Link className="btn" href="/login">
              Sign in
            </Link>
          </div>
        )}
        {step !== "done" && (
          <p className="small muted" style={{ marginTop: 12 }}>
            <Link href="/login">‹ Return to Logon</Link>
          </p>
        )}
      </div>
    </div>
  );
}
