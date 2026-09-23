"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError } from "@/lib/apiClient";
import { HOME_BY_ROLE, useAuth } from "@/lib/auth";
import { Feedback, Field } from "@/components/ui";

/**
 * Tài khoản demo của môi trường Development (xem SportHub.API/Persistence/DemoDataSeeder.cs).
 *
 * Nút bấm chỉ ĐIỀN FORM; việc đăng nhập vẫn đi qua POST /api/auth/login như người dùng thật,
 * với mật khẩu băm BCrypt trong DB (BR-5). Không có đường tắt nào bỏ qua xác thực.
 */
const DEMO_ACCOUNTS = [
  { label: "Quản trị hệ thống", email: "admin@sporthub.vn" },
  { label: "Quản lý trung tâm", email: "manager@sporthub.vn" },
  { label: "Lễ tân", email: "letan@sporthub.vn" },
  { label: "HLV Yoga", email: "coach.yoga@sporthub.vn" },
  { label: "HLV Personal Training", email: "coach.pt@sporthub.vn" },
  { label: "Hội viên", email: "an.member@sporthub.vn" },
];

const DEMO_PASSWORD = "Sporthub@123";

function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const params = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const expired = params.get("ly-do") === "het-phien";
  const next = params.get("tiep-tuc");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const user = await login(email.trim(), password);

      // Quay lại đúng trang người dùng định vào, nhưng chỉ khi đó là đường dẫn nội bộ —
      // nhận nguyên tham số sẽ thành open redirect.
      const target =
        next && next.startsWith("/") && !next.startsWith("//")
          ? next
          : HOME_BY_ROLE[user.role];

      router.replace(target);
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "Không đăng nhập được, vui lòng thử lại.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth__card">
        <div className="auth__brand">SportHub</div>
        <p className="auth__sub">
          Đăng nhập để vào không gian làm việc của bạn.
        </p>

        {expired && (
          <div className="alert alert--warn" style={{ marginBottom: 12 }}>
            Phiên đăng nhập đã kết thúc. Vui lòng đăng nhập lại.
          </div>
        )}

        <form className="form" onSubmit={submit}>
          <Field label="Email">
            <input
              type="email"
              value={email}
              autoComplete="username"
              required
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>

          <Field label="Mật khẩu">
            <span className="password-field">
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                value={password}
                autoComplete="current-password"
                required
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                className="password-field__toggle"
                type="button"
                aria-controls="login-password"
                aria-pressed={showPassword}
                onClick={() => setShowPassword((visible) => !visible)}
              >
                {showPassword ? "Ẩn" : "Hiện"}
              </button>
            </span>
          </Field>

          <div className="auth__feedback" aria-live="polite">
            <Feedback error={error} />
          </div>

          <button type="submit" className="btn" disabled={busy}>
            {busy ? "Đang đăng nhập…" : "Đăng nhập"}
          </button>
        </form>

        <p className="small muted" style={{ marginTop: 12 }}>
          Chưa có tài khoản hội viên?{" "}
          <Link href="/dang-ky">Đăng ký tại đây</Link>.
        </p>

        <div className="demo-accounts">
          <strong className="small">
            Tài khoản demo (môi trường phát triển)
          </strong>
          <p className="small muted" style={{ margin: "2px 0 0" }}>
            Bấm để điền sẵn email và mật khẩu <code>{DEMO_PASSWORD}</code>. Đăng
            nhập vẫn chạy qua API thật.
          </p>
          <div className="demo-accounts__grid">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  setEmail(account.email);
                  setPassword(DEMO_PASSWORD);
                }}
              >
                {account.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  // useSearchParams cần Suspense boundary khi build tĩnh (Next App Router).
  return (
    <Suspense
      fallback={
        <div className="auth">
          <div className="auth__card">Đang tải…</div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
