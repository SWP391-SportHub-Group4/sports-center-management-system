"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AsyncSection, Card, Feedback, Field, StatusChip } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { formatDate } from "@/lib/format";
import { useAction, useApi } from "@/lib/useApi";
import { ROLE_LABEL, useAuth, type Role } from "@/lib/auth";
import type { MyAccountDto } from "@/lib/types";

/**
 * Hồ sơ cá nhân, mật khẩu và liên kết Google.
 *
 * BR-60 — tài khoản tạo thuần qua Google chưa có mật khẩu: form đặt mật khẩu lần đầu không
 * hỏi mật khẩu cũ. Việc đặt mật khẩu luôn phải làm từ bên trong phiên đã đăng nhập.
 * BR-59 — liên kết Google chỉ thực hiện được bằng thao tác tường minh ở đây.
 */
export default function AccountPage() {
  const { refreshUser } = useAuth();

  const account = useApi(
    (signal) => api.get<MyAccountDto>("/api/users/me", { signal }),
    [],
  );

  const [profileForm, setProfileForm] = useState({ fullName: "", phone: "" });
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);
  const [passwordForm, setPasswordForm] = useState({ current: "", next: "", confirm: "" });

  const profileAction = useAction();
  const passwordAction = useAction();

  // Đổ dữ liệu vào form NGAY TRONG render khi hồ sơ vừa về (React cho phép setState ở giai
  // đoạn render và render lại ngay trước khi vẽ). Làm việc này trong useEffect sẽ tạo thêm
  // một vòng render thừa và bị quy tắc render dây chuyền chặn.
  if (account.data && hydratedFor !== account.data.userId) {
    setHydratedFor(account.data.userId);
    setProfileForm({ fullName: account.data.fullName, phone: account.data.phone ?? "" });
  }

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();

    const done = await profileAction.run(
      () =>
        api.put<MyAccountDto>("/api/users/me/profile", {
          fullName: profileForm.fullName.trim(),
          phone: profileForm.phone.trim() || null,
        }),
      "Đã cập nhật hồ sơ.",
    );

    if (done) {
      account.reload();
      await refreshUser();
    }
  };

  const savePassword = async (event: React.FormEvent) => {
    event.preventDefault();

    if (passwordForm.next !== passwordForm.confirm) {
      passwordAction.setError("Mật khẩu xác nhận không khớp.");

      return;
    }

    const done = await passwordAction.run(
      () =>
        api.post("/api/users/me/password", {
          currentPassword: account.data?.hasPassword ? passwordForm.current : null,
          newPassword: passwordForm.next,
        }),
      "Đã cập nhật mật khẩu.",
    );

    if (done !== null) {
      setPasswordForm({ current: "", next: "", confirm: "" });
      account.reload();
    }
  };

  return (
    <AppShell
      title="Tài khoản của tôi"
      description="Hồ sơ cá nhân, mật khẩu và phương thức đăng nhập"
      allow={["Member", "Receptionist", "Coach", "CenterManager", "SystemAdministrator"]}
    >
      <AsyncSection state={account} emptyMessage="Không đọc được hồ sơ.">
        {(data) => (
          <>
            <div className="grid grid--2">
              <Card title="Hồ sơ">
                <div className="stack">
                  <div className="row spread">
                    <div>
                      <strong>{data.email}</strong>
                      <div className="small muted">
                        {ROLE_LABEL[data.role as Role] ?? data.role} · tham gia{" "}
                        {formatDate(data.createdAt)}
                      </div>
                    </div>
                    <StatusChip value={data.status} />
                  </div>

                  <form className="form" onSubmit={saveProfile}>
                    <Field label="Họ và tên">
                      <input
                        value={profileForm.fullName}
                        required
                        onChange={(event) =>
                          setProfileForm({ ...profileForm, fullName: event.target.value })
                        }
                      />
                    </Field>

                    <Field
                      label="Số điện thoại"
                      hint="Mỗi số chỉ dùng cho một tài khoản (BR-62). Để trống nếu không muốn khai."
                    >
                      <input
                        value={profileForm.phone}
                        onChange={(event) =>
                          setProfileForm({ ...profileForm, phone: event.target.value })
                        }
                      />
                    </Field>

                    <Feedback error={profileAction.error} success={profileAction.success} />

                    <div>
                      <button type="submit" className="btn" disabled={profileAction.busy}>
                        Lưu hồ sơ
                      </button>
                    </div>
                  </form>
                </div>
              </Card>

              <Card title={data.hasPassword ? "Đổi mật khẩu" : "Đặt mật khẩu"}>
                <form className="form" onSubmit={savePassword}>
                  {!data.hasPassword && (
                    <div className="alert alert--info">
                      Tài khoản của bạn đang đăng nhập bằng Google và chưa có mật khẩu. Đặt mật
                      khẩu tại đây để đăng nhập được bằng email (BR-60).
                    </div>
                  )}

                  {data.hasPassword && (
                    <Field label="Mật khẩu hiện tại">
                      <input
                        type="password"
                        autoComplete="current-password"
                        value={passwordForm.current}
                        required
                        onChange={(event) =>
                          setPasswordForm({ ...passwordForm, current: event.target.value })
                        }
                      />
                    </Field>
                  )}

                  <Field label="Mật khẩu mới" hint="Tối thiểu 8 ký tự.">
                    <input
                      type="password"
                      autoComplete="new-password"
                      minLength={8}
                      value={passwordForm.next}
                      required
                      onChange={(event) =>
                        setPasswordForm({ ...passwordForm, next: event.target.value })
                      }
                    />
                  </Field>

                  <Field label="Xác nhận mật khẩu mới">
                    <input
                      type="password"
                      autoComplete="new-password"
                      minLength={8}
                      value={passwordForm.confirm}
                      required
                      onChange={(event) =>
                        setPasswordForm({ ...passwordForm, confirm: event.target.value })
                      }
                    />
                  </Field>

                  <Feedback error={passwordAction.error} success={passwordAction.success} />

                  <div>
                    <button type="submit" className="btn" disabled={passwordAction.busy}>
                      {data.hasPassword ? "Đổi mật khẩu" : "Đặt mật khẩu"}
                    </button>
                  </div>

                  <p className="small muted" style={{ margin: 0 }}>
                    Lưu ý: đổi mật khẩu <strong>không</strong> đăng xuất các thiết bị khác — cơ
                    chế thu hồi token toàn hệ thống chưa được triển khai (SSOT §5.6).
                  </p>
                </form>
              </Card>
            </div>

            <Card title="Đăng nhập bằng Google">
              <div className="stack">
                <div className="row spread">
                  <div>
                    <strong>Trạng thái liên kết</strong>
                    <div className="small muted">
                      {data.hasGoogleLink
                        ? "Tài khoản của bạn đã liên kết với một tài khoản Google."
                        : "Chưa liên kết tài khoản Google nào."}
                    </div>
                  </div>
                  <StatusChip value={data.hasGoogleLink ? "Active" : "Pending"} />
                </div>

                <div className="alert alert--info">
                  Liên kết Google phải được thực hiện từ bên trong phiên đăng nhập của chính tài
                  khoản này; hệ thống không bao giờ tự liên kết chỉ vì email Google trùng với
                  email tài khoản đã có (BR-59).
                  <br />
                  Để hoàn tất liên kết cần cấu hình <code>Google:ClientId</code> trên máy chủ và
                  nút đăng nhập Google của trình duyệt. Khi chưa cấu hình, API trả lỗi{" "}
                  <code>google_login_not_configured</code> thay vì im lặng bỏ qua.
                </div>
              </div>
            </Card>
          </>
        )}
      </AsyncSection>
    </AppShell>
  );
}
