"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { HOME_BY_ROLE, useAuth } from "@/lib/auth";

/**
 * Trang gốc chỉ điều hướng: mỗi vai trò có một trang chủ riêng, và người chưa đăng nhập
 * thì về trang đăng nhập.
 */
export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    router.replace(user ? HOME_BY_ROLE[user.role] : "/dang-nhap");
  }, [user, loading, router]);

  return (
    <div className="auth">
      <div className="auth__card">
        <div className="auth__brand">SportHub</div>
        <p className="auth__sub">Đang chuyển tới không gian làm việc của bạn…</p>
      </div>
    </div>
  );
}
