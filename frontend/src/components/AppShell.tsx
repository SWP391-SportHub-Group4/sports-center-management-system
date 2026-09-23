"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { HOME_BY_ROLE, ROLE_LABEL, useAuth, type Role } from "@/lib/auth";
import { NotificationBell } from "./NotificationBell";

export interface NavItem {
  href: string;
  label: string;
}

/**
 * Điều hướng theo vai trò. Menu ẩn KHÔNG phải là cơ chế phân quyền — mọi endpoint đều có
 * [Authorize(Policy=…)] ở backend; đây chỉ là để người dùng không thấy những màn hình họ
 * không dùng được.
 */
export const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  Member: [
    { href: "/hoi-vien", label: "Tổng quan" },
    { href: "/hoi-vien/lich-lop", label: "Lịch lớp & đặt chỗ" },
    { href: "/hoi-vien/dang-ky-cua-toi", label: "Đăng ký của tôi" },
    { href: "/hoi-vien/goi-cua-toi", label: "Gói thành viên" },
    { href: "/hoi-vien/hoa-don", label: "Hóa đơn" },
    { href: "/hoi-vien/tap-luyen", label: "Kế hoạch & kết quả" },
    { href: "/hoi-vien/ho-so", label: "Hồ sơ tập luyện" },
  ],
  Receptionist: [
    { href: "/le-tan", label: "Tổng quan" },
    { href: "/le-tan/gym-checkin", label: "Gym check-in" },
    { href: "/le-tan/ban-goi", label: "Bán gói & hóa đơn" },
    { href: "/le-tan/hoa-don", label: "Tra cứu hóa đơn" },
    { href: "/le-tan/dang-ky", label: "Đăng ký lớp hộ" },
    { href: "/le-tan/diem-danh", label: "Điểm danh" },
  ],
  Coach: [
    { href: "/hlv", label: "Tổng quan" },
    { href: "/hlv/lich-day", label: "Lịch dạy" },
    { href: "/hlv/diem-danh", label: "Điểm danh & kết quả" },
    { href: "/hlv/hoi-vien", label: "Hội viên phụ trách" },
    { href: "/hlv/ke-hoach", label: "Kế hoạch tập" },
    { href: "/hlv/goi-y-ai", label: "Gợi ý AI" },
  ],
  CenterManager: [
    { href: "/quan-ly", label: "Tổng quan" },
    { href: "/quan-ly/phong-tap", label: "Phòng tập" },
    { href: "/quan-ly/lop-hoc", label: "Lớp học" },
    { href: "/quan-ly/lich-hoc", label: "Lịch học" },
    { href: "/quan-ly/goi-tap", label: "Gói thành viên" },
    { href: "/quan-ly/quan-he-hlv", label: "Phân công HLV" },
    { href: "/quan-ly/dieu-chinh", label: "Duyệt điều chỉnh" },
    { href: "/quan-ly/bao-cao", label: "Báo cáo doanh thu" },
    { href: "/quan-ly/cau-hinh", label: "Cấu hình hệ thống" },
    { href: "/quan-ly/nhat-ky", label: "Nhật ký thao tác" },
  ],
  SystemAdministrator: [
    { href: "/quan-tri", label: "Tổng quan" },
    { href: "/quan-tri/nguoi-dung", label: "Tài khoản & vai trò" },
    { href: "/quan-tri/nhat-ky", label: "Nhật ký thao tác" },
  ],
};

export function AppShell({
  title,
  description,
  allow,
  children,
}: {
  title: string;
  description?: string;
  /** Vai trò được phép xem nhánh này. Bảo vệ route ở client, không thay cho RBAC ở API. */
  allow: Role[];
  children: ReactNode;
}) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace(`/dang-nhap?tiep-tuc=${encodeURIComponent(pathname)}`);

      return;
    }

    // Vào nhầm nhánh của vai trò khác thì đưa về trang chủ của chính mình, không hiện 403
    // trống trơn — người dùng thường tới đây do bookmark cũ chứ không phải cố tình.
    if (!allow.includes(user.role)) {
      router.replace(HOME_BY_ROLE[user.role]);
    }
  }, [user, loading, allow, router, pathname]);

  if (loading || !user || !allow.includes(user.role)) {
    return (
      <div className="auth">
        <div className="auth__card">
          <p className="muted">Đang tải phiên làm việc…</p>
        </div>
      </div>
    );
  }

  const nav = NAV_BY_ROLE[user.role];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar__brand">SportHub</div>
        <div className="sidebar__role">{ROLE_LABEL[user.role]}</div>
        <nav className="sidebar__nav">
          {nav.map((item) => {
            // So khớp chính xác cho trang gốc của nhánh, còn lại theo tiền tố — nếu không,
            // mục "Tổng quan" sẽ luôn sáng ở mọi trang con.
            const active =
              item.href === nav[0].href
                ? pathname === item.href
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar__link ${active ? "sidebar__link--active" : ""}`}
              >
                {item.label}
              </Link>
            );
          })}
          <Link
            href="/tai-khoan"
            className={`sidebar__link ${pathname.startsWith("/tai-khoan") ? "sidebar__link--active" : ""}`}
          >
            Tài khoản của tôi
          </Link>
        </nav>
        <div className="sidebar__footer">
          Trung tâm thể thao đa bộ môn
          <br />
          Gym · Personal Training · Yoga · Group X
        </div>
      </aside>

      <div className="main">
        <header className="header">
          <div className="header__title">
            <h1>{title}</h1>
            {description && <span className="header__crumb">{description}</span>}
          </div>
          <div className="header__actions">
            <NotificationBell />
            <div className="header__user">
              <strong>{user.fullName || user.email}</strong>
              <span>{ROLE_LABEL[user.role]}</span>
            </div>
            <button type="button" className="btn btn--ghost btn--sm" onClick={logout}>
              Đăng xuất
            </button>
          </div>
        </header>

        <main className="content">{children}</main>
      </div>
    </div>
  );
}
