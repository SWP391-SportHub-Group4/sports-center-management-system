"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/apiClient";
import { HOME_BY_ROLE, useAuth } from "@/lib/auth";
import { Feedback, Field } from "@/components/ui";

/**
 * BR-1 — Hội viên TỰ đăng ký bằng email duy nhất và mật khẩu đủ mạnh.
 * Tài khoản nhân sự (Manager/Coach/Receptionist/Admin) không đi qua đây: BR-2 quy định chỉ
 * System Administrator tạo, từ màn hình quản trị.
 */
export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();

  const [form, setForm] = useState({ email: "", password: "", fullName: "", phone: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const update = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const user = await register({
        email: form.email.trim(),
        password: form.password,
        fullName: form.fullName.trim(),
        phone: form.phone.trim() || undefined,
      });

      router.replace(HOME_BY_ROLE[user.role]);
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : "Không đăng ký được, vui lòng thử lại.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth__card">
        <div className="auth__brand">Đăng ký hội viên</div>
        <p className="auth__sub">
          Tạo tài khoản để đặt lịch lớp, theo dõi gói tập và kết quả luyện tập.
        </p>

        <form className="form" onSubmit={submit}>
          <Field label="Họ và tên">
            <input value={form.fullName} required onChange={update("fullName")} />
          </Field>

          <Field label="Email">
            <input
              type="email"
              value={form.email}
              autoComplete="username"
              required
              onChange={update("email")}
            />
          </Field>

          <Field
            label="Mật khẩu"
            hint="Tối thiểu 8 ký tự."
          >
            <input
              type="password"
              value={form.password}
              autoComplete="new-password"
              minLength={8}
              required
              onChange={update("password")}
            />
          </Field>

          <Field
            label="Số điện thoại (không bắt buộc)"
            hint="Ví dụ 0912345678. Mỗi số chỉ dùng cho một tài khoản."
          >
            <input value={form.phone} onChange={update("phone")} />
          </Field>

          <Feedback error={error} />

          <button type="submit" className="btn" disabled={busy}>
            {busy ? "Đang tạo tài khoản…" : "Đăng ký"}
          </button>
        </form>

        <p className="small muted" style={{ marginTop: 12 }}>
          Đã có tài khoản? <Link href="/dang-nhap">Đăng nhập</Link>.
        </p>
      </div>
    </div>
  );
}
