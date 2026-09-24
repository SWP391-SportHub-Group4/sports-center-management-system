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
    { href: "/member-dashboard", label: "Overview" },
    { href: "/member-dashboard/class-schedule", label: "Class schedule" },
    { href: "/member-dashboard/my-registrations", label: "My registrations" },
    { href: "/member-dashboard/my-plans", label: "My membership plans" },
    { href: "/member-dashboard/invoices", label: "Invoices" },
    { href: "/member-dashboard/training", label: "Plans & results" },
    { href: "/member-dashboard/profile", label: "Training profile" },
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
    { href: "/manager/coaching-relationships", label: "Coaching relationships" },
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
            href="/account"
            className={`sidebar__link ${pathname.startsWith("/account") ? "sidebar__link--active" : ""}`}
          >
            My account
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
            {description && <span className="header__crumb">{description}</span>}
          </div>
          <div className="header__actions">
            <NotificationBell />
            <div className="header__user">
              <strong>{user.fullName || user.email}</strong>
              <span>{ROLE_LABEL[user.role]}</span>
            </div>
            <button type="button" className="btn btn--ghost btn--sm" onClick={logout}>
              Log Out
            </button>
          </div>
        </header>

        <main className="content">{children}</main>
      </div>
    </div>
  );
}
