"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { HOME_BY_ROLE, ROLE_LABEL, useAuth, type Role } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
import { NotificationBell } from "./NotificationBell";
import { IconKeyboard } from "@/components/icons";

export interface NavItem {
  href: string;
  label: string;
}

export const RECEPTIONIST_SHORTCUTS: Record<
  string,
  { key: string; label: string; en: string; vi: string; descEn: string; descVi: string }
> = {
  "/receptionist": {
    key: "0",
    label: "Alt + 0",
    en: "Overview Dashboard",
    vi: "Tổng quan Lễ tân",
    descEn: "Front desk activity overview and occupancy stats",
    descVi: "Tổng quan bàn lễ tân và số liệu mở lớp",
  },
  "/receptionist/gym-checkin": {
    key: "1",
    label: "Alt + 1",
    en: "Gym Turnstile Check-in",
    vi: "Điểm danh Cổng Gym",
    descEn: "Barcode/QR terminal with instant active pass clearance (BR-64)",
    descVi: "Quét thẻ/QR kiểm tra gói tập hợp lệ cửa quay (BR-64)",
  },
  "/receptionist/sell-plans": {
    key: "2",
    label: "Alt + 2",
    en: "Sell Membership Packages",
    vi: "Bán Gói Tập POS",
    descEn: "Point of sale packages, immediate activation and cash/card receipt",
    descVi: "Bán gói tập, thanh toán nhanh và in hóa đơn tại quầy",
  },
  "/receptionist/attendance": {
    key: "3",
    label: "Alt + 3",
    en: "Class Attendance Desk",
    vi: "Điểm Danh Lớp Học",
    descEn: "Mark Present or Absent for daily class sessions (BR-22)",
    descVi: "Điểm danh có mặt hoặc vắng mặt cho các ca học",
  },
  "/receptionist/invoices": {
    key: "4",
    label: "Alt + 4",
    en: "Invoices & Cashier",
    vi: "Tra Cứu & Thu Tiền",
    descEn: "Collect outstanding balances and manage payout adjustments",
    descVi: "Thu nợ hóa đơn quá hạn và xử lý hoàn tiền",
  },
  "/receptionist/registrations": {
    key: "5",
    label: "Alt + 5",
    en: "Class Registration",
    vi: "Đăng Ký Lớp Hộ",
    descEn: "Enroll members into class sessions and manage bookings",
    descVi: "Đăng ký ca học hộ hội viên và quản lý danh sách đặt chỗ",
  },
};

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
    { href: "/receptionist/attendance", label: "Attendance" },
    { href: "/receptionist/invoices", label: "Invoice lookup" },
    { href: "/receptionist/registrations", label: "Class registration" },
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
  const [showShortcuts, setShowShortcuts] = useState(false);

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

  // Global Receptionist Keyboard Navigation Shortcuts (Alt + 0..5, Alt + /)
  useEffect(() => {
    if (user?.role !== "Receptionist") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const isInput =
        targetTag === "input" ||
        targetTag === "textarea" ||
        (e.target as HTMLElement)?.isContentEditable;

      // Toggle shortcuts modal with Alt + / or '?' when not inside an input
      if (e.altKey && e.key === "/") {
        e.preventDefault();
        setShowShortcuts((prev) => !prev);
        return;
      }

      if (e.key === "?" && !isInput && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setShowShortcuts((prev) => !prev);
        return;
      }

      if (e.key === "Escape" && showShortcuts) {
        e.preventDefault();
        setShowShortcuts(false);
        return;
      }

      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const key = e.key.toLowerCase();
        let targetRoute: string | undefined;

        if (key === "0" || key === "d" || key === "h") {
          targetRoute = "/receptionist";
        } else if (key === "1") {
          targetRoute = "/receptionist/gym-checkin";
        } else if (key === "2") {
          targetRoute = "/receptionist/sell-plans";
        } else if (key === "3") {
          targetRoute = "/receptionist/attendance";
        } else if (key === "4") {
          targetRoute = "/receptionist/invoices";
        } else if (key === "5") {
          targetRoute = "/receptionist/registrations";
        }

        if (targetRoute) {
          e.preventDefault();
          setShowShortcuts(false);
          router.push(targetRoute);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [user?.role, router, showShortcuts]);

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
            {user.role === "Receptionist" && (
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() => setShowShortcuts((prev) => !prev)}
                title={
                  language === "en"
                    ? "Front Desk Shortcuts (Alt + /)"
                    : "Phím tắt bàn lễ tân (Alt + /)"
                }
                style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                <IconKeyboard size={16} aria-hidden="true" />
                <span>{language === "en" ? "Shortcuts" : "Phím tắt"}</span>
              </button>
            )}
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

      {showShortcuts && user.role === "Receptionist" && (
        <div
          className="shortcut-modal__backdrop"
          onClick={() => setShowShortcuts(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Keyboard Shortcuts"
        >
          <div
            className="shortcut-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shortcut-modal__header">
              <h3 className="shortcut-modal__title">
                <IconKeyboard size={18} aria-hidden="true" />
                <span>
                  {language === "en"
                    ? "Receptionist Desk Shortcuts"
                    : "Phím Tắt Bàn Lễ Tân"}
                </span>
              </h3>
              <button
                type="button"
                className="shortcut-modal__close"
                onClick={() => setShowShortcuts(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="shortcut-modal__body">
              {Object.entries(RECEPTIONIST_SHORTCUTS).map(([route, sc]) => (
                <Link
                  key={route}
                  href={route}
                  className="shortcut-row"
                  onClick={() => setShowShortcuts(false)}
                >
                  <div>
                    <div className="shortcut-row__action">
                      {language === "en" ? sc.en : sc.vi}
                    </div>
                    <div className="shortcut-row__desc">
                      {language === "en" ? sc.descEn : sc.descVi}
                    </div>
                  </div>
                  <kbd className="shortcut-row__kbd">{sc.label}</kbd>
                </Link>
              ))}
            </div>
            <div className="shortcut-modal__footer">
              <span>
                {language === "en"
                  ? "Press Escape to close"
                  : "Bấm Escape để đóng"}
              </span>
              <kbd className="sidebar__kbd">Alt + /</kbd>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
