"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { HOME_BY_ROLE, ROLE_LABEL, useAuth, type Role } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
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
    { href: "/member", label: "Overview" },
    { href: "/member/class-schedule", label: "Class schedule" },
    { href: "/member/my-registrations", label: "My registrations" },
    { href: "/member/my-plans", label: "My membership plans" },
    { href: "/member/invoices", label: "Invoices" },
    { href: "/member/training", label: "Plans & results" },
    { href: "/member/profile", label: "Training profile" },
  ],
  Receptionist: [
    { href: "/receptionist", label: "Overview" },
    { href: "/receptionist/gym-checkin", label: "Gym check-in" },
    { href: "/receptionist/sell-plans", label: "Sell plans & invoices" },
    { href: "/receptionist/invoices", label: "Invoice lookup" },
    { href: "/receptionist/registrations", label: "Class registration" },
    { href: "/receptionist/attendance", label: "Attendance" },
  ],
  Coach: [
    { href: "/coach", label: "Overview" },
    { href: "/coach/schedule", label: "Teaching schedule" },
    { href: "/coach/attendance", label: "Attendance & results" },
    { href: "/coach/members", label: "Assigned members" },
    { href: "/coach/training-plans", label: "Training plans" },
    { href: "/coach/ai-suggestions", label: "AI suggestions" },
  ],
  CenterManager: [
    { href: "/manager", label: "Overview" },
    { href: "/manager/training-rooms", label: "Training rooms" },
    { href: "/manager/classes", label: "Classes" },
    { href: "/manager/class-schedule", label: "Class schedule" },
    { href: "/manager/membership-plans", label: "Membership plans" },
    {
      href: "/manager/coaching-relationships",
      label: "Coaching relationships",
    },
    { href: "/manager/payment-adjustments", label: "Payment adjustments" },
    { href: "/manager/reports", label: "Revenue reports" },
    { href: "/manager/settings", label: "System settings" },
    { href: "/manager/audit-log", label: "Audit log" },
  ],
  SystemAdministrator: [
    { href: "/admin", label: "Overview" },
    { href: "/admin/users", label: "Users & roles" },
    { href: "/admin/audit-log", label: "Audit log" },
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
  const { language, toggleLanguage } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);

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
          <p className="muted">Loading session...</p>
        </div>
      </div>
    );
  }

  const nav = NAV_BY_ROLE[user.role];

  const getNavLabel = (labelStr: string) => {
    if (language !== "vi") return labelStr;
    const viLabels: Record<string, string> = {
      Overview: "Tổng quan",
      "Gym check-in": "Điểm danh Gym",
      "Sell plans & invoices": "Bán gói & Hóa đơn",
      "Invoice lookup": "Tra cứu hóa đơn",
      "Class registration": "Đăng ký lớp hộ",
      Attendance: "Điểm danh ca học",
      "My account": "Tài khoản của tôi",
      "Teaching schedule": "Lịch giảng dạy",
      "Attendance & results": "Điểm danh & Kết quả",
      "Assigned members": "Hội viên phụ trách",
      "Training plans": "Giáo án bài tập",
      "AI suggestions": "Gợi ý thông minh AI",
      "Training rooms": "Phòng tập luyện",
      Classes: "Danh mục lớp học",
      "Class schedule": "Lịch toàn bộ lớp",
      "Membership plans": "Gói hội viên",
      "Coaching relationships": "Phân công HLV",
      "Payment adjustments": "Điều chỉnh hóa đơn",
      "Revenue reports": "Báo cáo doanh thu",
      "System settings": "Cài đặt hệ thống",
      "Audit log": "Nhật ký hệ thống",
      "Users & roles": "Người dùng & Vai trò",
    };
    return viLabels[labelStr] ?? labelStr;
  };

  const roleDisplay =
    language === "vi"
      ? {
          Receptionist: "Nhân viên Lễ tân",
          Coach: "Huấn luyện viên",
          CenterManager: "Quản lý Trung tâm",
          SystemAdministrator: "Quản trị viên",
          Member: "Hội viên",
        }[user.role] || ROLE_LABEL[user.role]
      : ROLE_LABEL[user.role];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar__brand">SportHub</div>
        <div className="sidebar__role">{roleDisplay}</div>
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
                {getNavLabel(item.label)}
              </Link>
            );
          })}
          <Link
            href="/account"
            className={`sidebar__link ${pathname.startsWith("/account") ? "sidebar__link--active" : ""}`}
          >
            {language === "en" ? "My account" : "Tài khoản của tôi"}
          </Link>
        </nav>
        <div className="sidebar__footer">
          Multidisciplinary Sports Centre
          <br />
          Gym · Personal Training · Yoga · Group X
        </div>
      </aside>

      <div className="main">
        <header className="header">
          <div className="header__title">
            <h1>{title}</h1>
            {description && (
              <span className="header__crumb">{description}</span>
            )}
          </div>
          <div className="header__actions">
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={toggleLanguage}
              title={language === "en" ? "Chuyển sang Tiếng Việt" : "Switch to English"}
              style={{ fontWeight: 700 }}
            >
              {language === "en" ? "🇺🇸 EN" : "🇻🇳 VI"}
            </button>
            <NotificationBell />
            <div className="header__user">
              <strong>{user.fullName || user.email}</strong>
              <span>{ROLE_LABEL[user.role]}</span>
            </div>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={logout}
            >
              Log Out
            </button>
          </div>
        </header>

        <main className="content">{children}</main>
      </div>
    </div>
  );
}
