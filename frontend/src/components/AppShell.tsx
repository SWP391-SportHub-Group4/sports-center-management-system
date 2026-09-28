"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  HOME_BY_ROLE,
  useAuth,
  type CoachCategory,
  type Role,
} from "@/lib/auth";
import { useLanguage } from "@/lib/language";
import type { Translations } from "@/locales/en";
import { NotificationBell } from "./NotificationBell";
import { IconKeyboard } from "@/components/icons";

type NavLabelKey = keyof Translations["navigation"]["items"];

export interface NavItem {
  href: string;
  labelKey: NavLabelKey;
}

/**
 * Phím tắt và route cố định theo mã; nội dung hiển thị (tiêu đề/mô tả song ngữ) lấy từ
 * t.navigation.receptionistShortcuts để không lặp chuỗi cứng ở đây.
 */
export const RECEPTIONIST_SHORTCUTS: Record<
  string,
  { key: string; label: string; contentKey: keyof Translations["navigation"]["receptionistShortcuts"] }
> = {
  "/receptionist": { key: "0", label: "Alt + 0", contentKey: "overview" },
  "/receptionist/gym-checkin": { key: "1", label: "Alt + 1", contentKey: "gymCheckin" },
  "/receptionist/sell-plans": { key: "2", label: "Alt + 2", contentKey: "sellPlans" },
  "/receptionist/attendance": { key: "3", label: "Alt + 3", contentKey: "attendance" },
  "/receptionist/invoices": { key: "4", label: "Alt + 4", contentKey: "invoices" },
  "/receptionist/registrations": { key: "5", label: "Alt + 5", contentKey: "registrations" },
};

/**
 * Điều hướng theo vai trò. Menu ẩn KHÔNG phải là cơ chế phân quyền — mọi endpoint đều có
 * [Authorize(Policy=…)] ở backend; đây chỉ là để người dùng không thấy những màn hình họ
 * không dùng được.
 */
export const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  // Member dùng MemberShell, không dùng AppShell — nhánh này giữ lại chỉ để Record đủ key.
  Member: [
    { href: "/member", labelKey: "overview" },
    { href: "/member/class-schedule", labelKey: "classSchedule" },
    { href: "/member/my-registrations", labelKey: "myRegistrations" },
    { href: "/member/my-plans", labelKey: "myMembershipPlans" },
    { href: "/member/invoices", labelKey: "invoices" },
    { href: "/member/training", labelKey: "plansAndResults" },
    { href: "/member/profile", labelKey: "trainingProfile" },
  ],
  Receptionist: [
    { href: "/receptionist", labelKey: "overview" },
    { href: "/receptionist/gym-checkin", labelKey: "gymCheckin" },
    { href: "/receptionist/sell-plans", labelKey: "sellPlansInvoices" },
    { href: "/receptionist/attendance", labelKey: "attendance" },
    { href: "/receptionist/invoices", labelKey: "invoiceLookup" },
    { href: "/receptionist/registrations", labelKey: "classRegistration" },
  ],
  // BR-96/BR-97, mới 28/09/2026: đây là menu đầy đủ, chỉ dành cho Coach loại PersonalTrainer.
  // ClassInstructor dùng CLASS_INSTRUCTOR_NAV bên dưới — xem getNavForUser().
  Coach: [
    { href: "/coach", labelKey: "overview" },
    { href: "/coach/schedule", labelKey: "teachingSchedule" },
    { href: "/coach/attendance", labelKey: "trainingResults" },
    { href: "/coach/members", labelKey: "assignedMembers" },
    { href: "/coach/training-plans", labelKey: "trainingPlans" },
    { href: "/coach/ai-suggestions", labelKey: "aiSuggestions" },
  ],
  CenterManager: [
    { href: "/manager", labelKey: "overview" },
    { href: "/manager/training-rooms", labelKey: "trainingRooms" },
    { href: "/manager/classes", labelKey: "classes" },
    { href: "/manager/class-schedule", labelKey: "classSchedule" },
    { href: "/manager/membership-plans", labelKey: "membershipPlans" },
    {
      href: "/manager/coaching-relationships",
      labelKey: "coachingRelationships",
    },
    { href: "/manager/payment-adjustments", labelKey: "paymentAdjustments" },
    { href: "/manager/reports", labelKey: "revenueReports" },
    { href: "/manager/settings", labelKey: "systemSettings" },
    { href: "/manager/audit-log", labelKey: "auditLog" },
  ],
  SystemAdministrator: [
    { href: "/admin", labelKey: "overview" },
    { href: "/admin/users", labelKey: "usersRoles" },
    { href: "/admin/audit-log", labelKey: "auditLog" },
  ],
};

/**
 * BR-96/BR-97/BR-98/BR-100, mới 28/09/2026 — ClassInstructor (Yoga/Group X) chỉ xem lịch được
 * Manager phân công và tự quản lý hồ sơ/mật khẩu (link "My account" chung được thêm bên dưới).
 * Không điểm danh, không hội viên, không kế hoạch tập, không AI — backend đã từ chối các action
 * này ở tầng API (SportHub.Training/AI/Scheduling), đây chỉ là UX không hiện món không dùng được.
 */
const CLASS_INSTRUCTOR_NAV: NavItem[] = [
  { href: "/coach", labelKey: "overview" },
  { href: "/coach/schedule", labelKey: "teachingSchedule" },
];

/** Menu Coach phụ thuộc CoachCategory — NAV_BY_ROLE.Coach chỉ đúng cho PersonalTrainer. */
export function getNavForUser(user: {
  role: Role;
  coachCategory?: CoachCategory | null;
}): NavItem[] {
  if (user.role === "Coach" && user.coachCategory === "ClassInstructor") {
    return CLASS_INSTRUCTOR_NAV;
  }

  return NAV_BY_ROLE[user.role];
}

export function AppShell({
  title,
  description,
  allow,
  requireCoachCategory,
  children,
}: {
  title: string;
  description?: string;
  /** Vai trò được phép xem nhánh này. Bảo vệ route ở client, không thay cho RBAC ở API. */
  allow: Role[];
  /**
   * BR-96, mới 28/09/2026 — chỉ áp dụng khi allow gồm "Coach": thêm điều kiện CoachCategory,
   * vd trang kế hoạch tập/AI chỉ dành PersonalTrainer. ClassInstructor vào nhầm URL bị đưa về
   * /coach — đây là UX, backend vẫn là lớp chặn thật (403) nếu client cũ chưa cập nhật.
   */
  requireCoachCategory?: CoachCategory;
  children: ReactNode;
}) {
  const { user, loading, logout } = useAuth();
  const { language, toggleLanguage, t } = useLanguage();
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

      return;
    }

    // BR-96, mới 28/09/2026 — cùng lý do trên nhưng theo category trong role Coach.
    if (
      requireCoachCategory &&
      user.role === "Coach" &&
      user.coachCategory !== requireCoachCategory
    ) {
      router.replace(HOME_BY_ROLE[user.role]);
    }
  }, [user, loading, allow, requireCoachCategory, router, pathname]);

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

  const coachCategoryMismatch =
    requireCoachCategory &&
    user?.role === "Coach" &&
    user.coachCategory !== requireCoachCategory;

  if (loading || !user || !allow.includes(user.role) || coachCategoryMismatch) {
    return (
      <div className="auth">
        <div className="auth__card">
          <p className="muted">{t.navigation.loadingSession}</p>
        </div>
      </div>
    );
  }

  const nav = getNavForUser(user);
  const roleDisplay = t.navigation.roleLabel[user.role];

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
                {t.navigation.items[item.labelKey]}
              </Link>
            );
          })}
          <Link
            href="/account"
            className={`sidebar__link ${pathname.startsWith("/account") ? "sidebar__link--active" : ""}`}
          >
            {t.navigation.myAccount}
          </Link>
        </nav>
        <div className="sidebar__footer">
          {t.navigation.footerTagline}
          <br />
          {t.navigation.footerSub}
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
                title={t.navigation.shortcutsButtonTitle}
                style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                <IconKeyboard size={16} aria-hidden="true" />
                <span>{t.navigation.shortcutsButton}</span>
              </button>
            )}
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={toggleLanguage}
              title={
                language === "en"
                  ? t.navigation.languageToggleToVi
                  : t.navigation.languageToggleToEn
              }
              style={{ fontWeight: 700 }}
            >
              {language === "en" ? "🇺🇸 EN" : "🇻🇳 VI"}
            </button>
            <NotificationBell />
            <div className="header__user">
              <strong>{user.fullName || user.email}</strong>
              <span>{roleDisplay}</span>
            </div>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={logout}
            >
              {t.navigation.logOut}
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
          aria-label={t.navigation.shortcutsModalTitle}
        >
          <div
            className="shortcut-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shortcut-modal__header">
              <h3 className="shortcut-modal__title">
                <IconKeyboard size={18} aria-hidden="true" />
                <span>{t.navigation.shortcutsModalTitle}</span>
              </h3>
              <button
                type="button"
                className="shortcut-modal__close"
                onClick={() => setShowShortcuts(false)}
                aria-label={t.navigation.shortcutsCloseLabel}
              >
                ✕
              </button>
            </div>
            <div className="shortcut-modal__body">
              {Object.entries(RECEPTIONIST_SHORTCUTS).map(([route, sc]) => {
                const content = t.navigation.receptionistShortcuts[sc.contentKey];

                return (
                  <Link
                    key={route}
                    href={route}
                    className="shortcut-row"
                    onClick={() => setShowShortcuts(false)}
                  >
                    <div>
                      <div className="shortcut-row__action">{content.title}</div>
                      <div className="shortcut-row__desc">{content.desc}</div>
                    </div>
                    <kbd className="shortcut-row__kbd">{sc.label}</kbd>
                  </Link>
                );
              })}
            </div>
            <div className="shortcut-modal__footer">
              <span>{t.navigation.shortcutsEscapeHint}</span>
              <kbd className="sidebar__kbd">Alt + /</kbd>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
