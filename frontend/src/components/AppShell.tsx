"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { HOME_BY_ROLE, useAuth, type Role } from "@/lib/auth";
import { canUsePtFeatures } from "@/lib/permissions";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import type { SportDto } from "@/lib/types";
import { useLanguage } from "@/lib/language";
import type { Translations } from "@/locales/en";
import { NotificationBell } from "./NotificationBell";
import { IconKeyboard } from "@/components/icons";
import styles from "./AppShell.module.css";

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
  {
    key: string;
    label: string;
    contentKey: keyof Translations["navigation"]["receptionistShortcuts"];
  }
> = {
  "/receptionist": { key: "0", label: "Alt + 0", contentKey: "overview" },
  "/receptionist/gym-checkin": {
    key: "1",
    label: "Alt + 1",
    contentKey: "gymCheckin",
  },
  "/receptionist/sell-plans": {
    key: "2",
    label: "Alt + 2",
    contentKey: "sellPlans",
  },
  "/receptionist/attendance": {
    key: "3",
    label: "Alt + 3",
    contentKey: "attendance",
  },
  "/receptionist/invoices": {
    key: "4",
    label: "Alt + 4",
    contentKey: "invoices",
  },
  "/receptionist/registrations": {
    key: "5",
    label: "Alt + 5",
    contentKey: "registrations",
  },
};

/**
 * Điều hướng theo vai trò. Menu ẩn KHÔNG phải là cơ chế phân quyền — mọi endpoint đều có
 * [Authorize(Policy=…)] ở backend; đây chỉ là để người dùng không thấy những màn hình họ
 * không dùng được.
 */
export const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  // Member dùng MemberShell, không dùng AppShell — nhánh này giữ lại chỉ để Record đủ key.
  ExternalCoach: [
    { href: "/external-coach", labelKey: "overview" },
    { href: "/external-coach/book", labelKey: "book" },
    { href: "/external-coach/rentals", labelKey: "rentals" },
    { href: "/external-coach/wallet", labelKey: "wallet" },
    { href: "/external-coach/invoices", labelKey: "invoices" },
    { href: "/external-coach/profile", labelKey: "profile" },
  ],
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
    { href: "/receptionist/court-schedule", labelKey: "courtSchedule" },
    { href: "/receptionist/member-points", labelKey: "wallet" },
  ],
  // PT actions are filtered by current specialties in getNavForUser().
  Coach: [
    { href: "/coach", labelKey: "overview" },
    { href: "/coach/schedule", labelKey: "ptSchedule" },
    { href: "/coach/members", labelKey: "assignedMembers" },
    { href: "/coach/attendance", labelKey: "attendance" },
    { href: "/coach/pt-sessions", labelKey: "ptSchedule" },
    { href: "/coach/training-plans", labelKey: "trainingPlans" },
    { href: "/coach/progress", labelKey: "progress" },
    { href: "/coach/homework", labelKey: "homework" },
    { href: "/coach/ai-suggestions", labelKey: "aiSuggestions" },
  ],
  CenterManager: [
    { href: "/manager", labelKey: "overview" },
    { href: "/manager/sports", labelKey: "sports" },
    { href: "/manager/room-types", labelKey: "roomTypes" },
    { href: "/manager/court-rates", labelKey: "rates" },
    { href: "/manager/coaches", labelKey: "coaches" },
    { href: "/manager/external-coaches", labelKey: "externalCoaches" },
    { href: "/manager/court-schedule", labelKey: "courtSchedule" },
    { href: "/manager/incidents", labelKey: "incidents" },
    { href: "/manager/notices", labelKey: "notices" },
    { href: "/manager/training-rooms", labelKey: "trainingRooms" },
    { href: "/manager/classes", labelKey: "classes" },
    { href: "/manager/class-schedule", labelKey: "classSchedule" },
    { href: "/manager/membership-plans", labelKey: "membershipPlans" },
    {
      href: "/manager/coaching-relationships",
      labelKey: "coachingRelationships",
    },
    { href: "/manager/payment-adjustments", labelKey: "paymentAdjustments" },
    { href: "/manager/pt-sessions", labelKey: "ptSchedule" },
    { href: "/manager/pt-change-requests", labelKey: "ptChangeRequests" },
    { href: "/manager/points", labelKey: "wallet" },
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

export function getNavForUser(
  user: { role: Role; sportIds: number[]; approvalStatus?: string | null },
  ptSportId?: number | number[],
): NavItem[] {
  if (user.role === "ExternalCoach")
    return NAV_BY_ROLE.ExternalCoach.filter(
      (item) =>
        item.href !== "/external-coach/book" ||
        user.approvalStatus === "APPROVED",
    );
  if (user.role !== "Coach") return NAV_BY_ROLE[user.role];
  const base = [
    { href: "/coach", labelKey: "overview" as const },
    { href: "/coach/schedule", labelKey: "teachingSchedule" as const },
    { href: "/coach/members", labelKey: "assignedMembers" as const },
    { href: "/coach/attendance", labelKey: "attendance" as const },
  ];
  const ptIds = Array.isArray(ptSportId) ? ptSportId : ptSportId === undefined ? [] : [ptSportId];
  return ptIds.some(id => user.sportIds.includes(id))
    ? [
        ...base,
        ...NAV_BY_ROLE.Coach.filter((item) =>
          ["/coach/pt-sessions", "/coach/training-plans", "/coach/ai-suggestions", "/coach/progress", "/coach/homework"].includes(
            item.href,
          ),
        ),
      ]
    : base;
}

export function AppShell({
  title,
  description,
  allow,
  requirePtSpecialty,
  operationalLayout = false,
  children,
}: {
  title: string;
  description?: string;
  /** Vai trò được phép xem nhánh này. Bảo vệ route ở client, không thay cho RBAC ở API. */
  allow: Role[];
  /** Show PT tools only for a coach with a current PT specialty. */
  requirePtSpecialty?: boolean;
  operationalLayout?: boolean;
  children: ReactNode;
}) {
  const { user, loading, logout } = useAuth();
  const { language, toggleLanguage, t } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const [showShortcuts, setShowShortcuts] = useState(false);
  const sports = useApi(
    (signal) => api.get<SportDto[]>("/api/sports", { signal, anonymous: true }),
    [],
  );
  const ptSportId = sports.data?.find(
    (sport) => sport.operationType === "ONE_ON_ONE",
  )?.sportId;

  useEffect(() => {
    if (loading || (requirePtSpecialty && sports.loading)) return;

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

    // Specialty checks are for display; the API enforces authorization.
    if (
      requirePtSpecialty &&
      user.role === "Coach" &&
      !canUsePtFeatures(user, ptSportId ?? -1)
    ) {
      router.replace(HOME_BY_ROLE[user.role]);
    }
  }, [
    user,
    loading,
    allow,
    requirePtSpecialty,
    ptSportId,
    sports.loading,
    router,
    pathname,
  ]);

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

  const ptSpecialtyMismatch =
    requirePtSpecialty &&
    user?.role === "Coach" &&
    !canUsePtFeatures(user, ptSportId ?? -1);

  if (loading || !user || !allow.includes(user.role) || ptSpecialtyMismatch) {
    return (
      <div className="auth">
        <div className="auth__card">
          <p className="muted">{t.navigation.loadingSession}</p>
        </div>
      </div>
    );
  }

  const nav = getNavForUser(user, ptSportId);
  const roleDisplay = t.navigation.roleLabel[user.role];

  return (
    <div className={`shell ${operationalLayout ? styles.operations : ""}`}>
      <a href="#main-content" className="skip-link">
        {language === "en"
          ? "Skip to main content"
          : "Chuyển tới nội dung chính"}
      </a>
      <aside className="sidebar" data-surface="inverse">
        <div className="sidebar__brand">
          Sport<span className="sidebar__brand-accent">Hub</span>
        </div>
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
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <IconKeyboard size={16} aria-hidden="true" />
                <span>{t.navigation.shortcutsButton}</span>
              </button>
            )}
            <button
              type="button"
              className="btn btn--secondary btn--sm lang-toggle"
              onClick={toggleLanguage}
              title={
                language === "en"
                  ? t.navigation.languageToggleToVi
                  : t.navigation.languageToggleToEn
              }
            >
              {language === "en" ? "EN" : "VI"}
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

        <main id="main-content" className="content" tabIndex={-1}>{children}</main>
      </div>

      {showShortcuts && user.role === "Receptionist" && (
        <div
          className="shortcut-modal__backdrop"
          onClick={() => setShowShortcuts(false)}
          role="dialog"
          aria-modal="true"
          aria-label={t.navigation.shortcutsModalTitle}
        >
          <div className="shortcut-modal" onClick={(e) => e.stopPropagation()}>
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
                const content =
                  t.navigation.receptionistShortcuts[sc.contentKey];

                return (
                  <Link
                    key={route}
                    href={route}
                    className="shortcut-row"
                    onClick={() => setShowShortcuts(false)}
                  >
                    <div>
                      <div className="shortcut-row__action">
                        {content.title}
                      </div>
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
