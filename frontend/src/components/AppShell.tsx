"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { HOME_BY_ROLE, useAuth, type Role } from "@/lib/auth";
import { canUsePtFeatures } from "@/lib/permissions";
import { useLanguage } from "@/lib/language";
import type { Translations } from "@/locales/en";
import { NotificationBell } from "./NotificationBell";
import {
  IconKeyboard,
  IconLogout,
  IconMenu,
  IconClose,
  IconSettings,
} from "@/components/icons";
import shell from "./MemberShell.module.css";
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
  "/receptionist/sales": {
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
  "/receptionist/members": {
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
    { href: "/receptionist", labelKey: "frontDesk" },
    { href: "/receptionist/members", labelKey: "members" },
    { href: "/receptionist/sales", labelKey: "sales" },
    { href: "/receptionist/attendance", labelKey: "attendance" },
    { href: "/receptionist/court-schedule", labelKey: "courtSchedule" },
    { href: "/receptionist/invoices", labelKey: "transactions" },
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
    { href: "/manager/facilities", labelKey: "trainingRooms" },
    { href: "/manager/court-rates", labelKey: "rates" },
    { href: "/manager/coaches", labelKey: "coaches" },
    { href: "/manager/schedule", labelKey: "courtSchedule" },
    { href: "/manager/incidents", labelKey: "incidents" },
    { href: "/manager/notices", labelKey: "notices" },
    { href: "/manager/classes", labelKey: "classes" },
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

export function getNavForUser(user: {
  role: Role;
  sportIds: number[];
  isPersonalTrainer?: boolean;
  approvalStatus?: string | null;
}): NavItem[] {
  if (user.role !== "Coach") return NAV_BY_ROLE[user.role];
  const base = [
    { href: "/coach", labelKey: "overview" as const },
    { href: "/coach/schedule", labelKey: "teachingSchedule" as const },
    { href: "/coach/members", labelKey: "assignedMembers" as const },
    { href: "/coach/attendance", labelKey: "attendance" as const },
  ];
  return user.isPersonalTrainer === true
    ? [
        ...base,
        ...NAV_BY_ROLE.Coach.filter((item) =>
          [
            "/coach/pt-sessions",
            "/coach/training-plans",
            "/coach/ai-suggestions",
            "/coach/progress",
            "/coach/homework",
          ].includes(item.href),
        ),
      ]
    : base;
}

type GroupKey = keyof Translations["navigation"]["groups"];
type NavEntry =
  | { kind: "link"; href: string; label: string }
  | {
      kind: "group";
      key: GroupKey;
      label: string;
      items: { href: string; label: string }[];
    };

/** Nhóm menu theo vai trò; mục không nằm trong cấu hình vẫn hiện (dạng link) để không mất lối vào. */
const GROUP_SPEC: Partial<Record<Role, (string | [GroupKey, string[]])[]>> = {
  CenterManager: [
    "/manager",
    [
      "catalog",
      [
        "/manager/sports",
        "/manager/room-types",
        "/manager/court-rates",
        "/manager/facilities",
        "/manager/membership-plans",
      ],
    ],
    [
      "operations",
      [
        "/manager/classes",
        "/manager/schedule",
        "/manager/pt-sessions",
        "/manager/incidents",
        "/manager/notices",
      ],
    ],
    [
      "people",
      [
        "/manager/coaches",
        "/manager/coaching-relationships",
        "/manager/pt-change-requests",
      ],
    ],
    [
      "finance",
      ["/manager/payment-adjustments", "/manager/points", "/manager/reports"],
    ],
    ["system", ["/manager/settings", "/manager/audit-log"]],
  ],
  Coach: [
    "/coach",
    "/coach/schedule",
    "/coach/members",
    "/coach/attendance",
    [
      "training",
      [
        "/coach/pt-sessions",
        "/coach/training-plans",
        "/coach/progress",
        "/coach/homework",
        "/coach/ai-suggestions",
      ],
    ],
  ],
};

function buildNav(items: NavItem[], role: Role, t: Translations): NavEntry[] {
  const label = (item: NavItem) => t.navigation.items[item.labelKey];
  const byHref = new Map(items.map((i) => [i.href, i]));
  const used = new Set<string>();
  const entries: NavEntry[] = [];
  for (const spec of GROUP_SPEC[role] ?? items.map((i) => i.href)) {
    if (typeof spec === "string") {
      const item = byHref.get(spec);
      if (!item) continue;
      used.add(spec);
      entries.push({ kind: "link", href: item.href, label: label(item) });
      continue;
    }
    const [key, hrefs] = spec;
    const present = hrefs.flatMap((h) => {
      const item = byHref.get(h);
      return item ? [{ href: item.href, label: label(item) }] : [];
    });
    hrefs.forEach((h) => used.add(h));
    if (present.length)
      entries.push({
        kind: "group",
        key,
        label: t.navigation.groups[key],
        items: present,
      });
  }
  for (const item of items)
    if (!used.has(item.href))
      entries.push({ kind: "link", href: item.href, label: label(item) });
  return entries;
}

/** Trang gốc của nhánh chỉ sáng ở đúng nó; các mục còn lại khớp theo tiền tố. */
function isActiveHref(pathname: string, href: string, root: string) {
  return href === root ? pathname === href : pathname.startsWith(href);
}

const FrameContext = createContext(false);

function NavGroup({
  entry,
  pathname,
  root,
}: {
  entry: Extract<NavEntry, { kind: "group" }>;
  pathname: string;
  root: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = entry.items.some((i) => isActiveHref(pathname, i.href, root));

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        ref.current?.querySelector("button")?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={styles.group} ref={ref}>
      <button
        type="button"
        className={`${shell.navLink} ${styles.groupButton} ${active ? shell.navLinkActive : ""}`}
        aria-expanded={open}
        aria-controls={`group-${entry.key}`}
        data-active={active || undefined}
        onClick={() => setOpen((o) => !o)}
      >
        {entry.label}
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <ul className={styles.groupMenu} id={`group-${entry.key}`}>
          {entry.items.map((item) => {
            const on = isActiveHref(pathname, item.href, root);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={on ? "page" : undefined}
                  className={`${styles.groupLink} ${on ? styles.groupLinkActive : ""}`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Khung điều hướng của nhân sự: thanh trên cùng cố định (sticky) thay cho sidebar. Đặt một lần ở layout
 * từng nhánh (/manager, /coach, ...) để chuyển trang không dựng lại thanh điều hướng.
 */
export function AppFrame({
  allow,
  children,
}: {
  allow: Role[];
  children: ReactNode;
}) {
  const { user, loading, logout } = useAuth();
  const { language, toggleLanguage, t } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(
        `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`,
      );
      return;
    }
    // Vào nhầm nhánh của vai trò khác thì đưa về trang chủ của chính mình, không hiện 403
    // trống trơn — người dùng thường tới đây do bookmark cũ chứ không phải cố tình.
    if (!allow.includes(user.role)) router.replace(HOME_BY_ROLE[user.role]);
  }, [user, loading, allow, router, pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!userMenu) return;
    const onDown = (e: MouseEvent) => {
      if (userRef.current && !userRef.current.contains(e.target as Node))
        setUserMenu(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [userMenu]);

  // Global Receptionist Keyboard Navigation Shortcuts (Alt + 0..5, Alt + /)
  useEffect(() => {
    if (user?.role !== "Receptionist") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const isInput =
        targetTag === "input" ||
        targetTag === "textarea" ||
        (e.target as HTMLElement)?.isContentEditable;

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
        const route =
          key === "d" || key === "h"
            ? "/receptionist"
            : Object.entries(RECEPTIONIST_SHORTCUTS).find(
                ([, sc]) => sc.key === key,
              )?.[0];
        if (route) {
          e.preventDefault();
          setShowShortcuts(false);
          router.push(route);
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
          <p className="muted">{t.navigation.loadingSession}</p>
        </div>
      </div>
    );
  }

  const items = getNavForUser(user);
  const root = items[0].href;
  const entries = buildNav(items, user.role, t);
  const roleDisplay = t.navigation.roleLabel[user.role];
  const initial = (user.fullName || user.email).charAt(0).toUpperCase();

  return (
    <div className={shell.shell}>
      <a href="#main-content" className="skip-link">
        {language === "en"
          ? "Skip to main content"
          : "Chuyển tới nội dung chính"}
      </a>
      <header className={shell.header} data-scrolled={scrolled || undefined}>
        <div className={shell.headerInner}>
          <Link href={root} className={shell.brandGroup}>
            <span className={shell.brandLogo}>
              Sport<span className={shell.brandLogoAccent}>Hub</span>
            </span>
            <span className={styles.roleBadge}>{roleDisplay}</span>
          </Link>

          <nav className={styles.staffNav} aria-label={roleDisplay}>
            {entries.map((entry) =>
              entry.kind === "link" ? (
                <Link
                  key={entry.href}
                  href={entry.href}
                  aria-current={
                    isActiveHref(pathname, entry.href, root)
                      ? "page"
                      : undefined
                  }
                  className={`${shell.navLink} ${isActiveHref(pathname, entry.href, root) ? shell.navLinkActive : ""}`}
                >
                  {entry.label}
                </Link>
              ) : (
                <NavGroup
                  key={`${entry.key}:${pathname}`}
                  entry={entry}
                  pathname={pathname}
                  root={root}
                />
              ),
            )}
          </nav>

          <div className={shell.headerActions}>
            {user.role === "Receptionist" && (
              <button
                type="button"
                className={styles.shortcutsButton}
                onClick={() => setShowShortcuts((prev) => !prev)}
                title={t.navigation.shortcutsButtonTitle}
              >
                <IconKeyboard size={16} aria-hidden="true" />
                <span>{t.navigation.shortcutsButton}</span>
              </button>
            )}
            <button
              type="button"
              className={shell.langToggleBtn}
              onClick={toggleLanguage}
              title={
                language === "en"
                  ? t.navigation.languageToggleToVi
                  : t.navigation.languageToggleToEn
              }
              aria-label={
                language === "en"
                  ? t.navigation.languageToggleToVi
                  : t.navigation.languageToggleToEn
              }
            >
              <span className={shell.langText}>
                {language === "en" ? "EN" : "VI"}
              </span>
            </button>
            <NotificationBell />
            <div className={shell.userMenuWrapper} ref={userRef}>
              <button
                type="button"
                className={shell.userButton}
                onClick={() => setUserMenu((p) => !p)}
                aria-expanded={userMenu}
                aria-label={user.fullName || user.email}
              >
                <div className={shell.userAvatar}>{initial}</div>
                <span className={shell.userName}>
                  {user.fullName || user.email}
                </span>
                <span className={shell.dropdownArrow} aria-hidden="true">
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </span>
              </button>
              {userMenu && (
                <div className={shell.userDropdown}>
                  <div className={shell.dropdownHeader}>
                    <div className={shell.dropdownName}>
                      {user.fullName || user.email}
                    </div>
                    <div className={shell.dropdownRole}>{roleDisplay}</div>
                  </div>
                  <Link
                    href="/account"
                    className={shell.dropdownItem}
                    onClick={() => setUserMenu(false)}
                  >
                    <IconSettings size={15} />
                    <span>{t.navigation.myAccount}</span>
                  </Link>
                  <div className={shell.dropdownDivider} />
                  <button
                    type="button"
                    className={`${shell.dropdownItem} ${shell.logoutItem}`}
                    onClick={() => {
                      setUserMenu(false);
                      logout();
                    }}
                  >
                    <IconLogout size={15} />
                    <span>{t.navigation.logOut}</span>
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              className={styles.menuButton}
              onClick={() => setDrawer(true)}
              aria-label={t.nav.openNav}
            >
              <IconMenu size={20} />
            </button>
          </div>
        </div>
      </header>

      {drawer && (
        <div
          className={shell.mobileDrawerOverlay}
          onClick={() => setDrawer(false)}
        >
          <div
            className={shell.mobileDrawer}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={shell.mobileDrawerHeader}>
              <span className={shell.brandLogo}>
                Sport<span className={shell.brandLogoAccent}>Hub</span>
              </span>
              <button
                type="button"
                className={shell.mobileDrawerClose}
                onClick={() => setDrawer(false)}
                aria-label={t.nav.closeNav}
              >
                <IconClose size={20} />
              </button>
            </div>
            <div className={shell.mobileNavLinks}>
              {entries.map((entry) =>
                entry.kind === "link" ? (
                  <Link
                    key={entry.href}
                    href={entry.href}
                    aria-current={
                      isActiveHref(pathname, entry.href, root)
                        ? "page"
                        : undefined
                    }
                    className={`${shell.mobileNavLink} ${isActiveHref(pathname, entry.href, root) ? shell.mobileNavLinkActive : ""}`}
                    onClick={() => setDrawer(false)}
                  >
                    {entry.label}
                  </Link>
                ) : (
                  <div key={entry.key} className={styles.drawerGroup}>
                    <p className={styles.drawerGroupLabel}>{entry.label}</p>
                    {entry.items.map((item) => {
                      const on = isActiveHref(pathname, item.href, root);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          aria-current={on ? "page" : undefined}
                          className={`${shell.mobileNavLink} ${on ? shell.mobileNavLinkActive : ""}`}
                          onClick={() => setDrawer(false)}
                        >
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                ),
              )}
              <button
                type="button"
                className={shell.langToggleBtn}
                style={{
                  marginTop: 12,
                  width: "100%",
                  justifyContent: "center",
                }}
                onClick={() => {
                  toggleLanguage();
                  setDrawer(false);
                }}
                title={
                  language === "en"
                    ? t.navigation.languageToggleToVi
                    : t.navigation.languageToggleToEn
                }
              >
                <span className={shell.langText}>
                  {language === "en"
                    ? "Language: English (Switch to VI)"
                    : "Ngôn ngữ: Tiếng Việt (Chuyển EN)"}
                </span>
              </button>
              <Link
                href="/account"
                className={shell.mobileNavLink}
                onClick={() => setDrawer(false)}
              >
                <IconSettings size={16} style={{ marginRight: 8 }} />
                <span>{t.navigation.myAccount}</span>
              </Link>
              <button
                type="button"
                className={`${shell.mobileNavLink} ${shell.logoutItem}`}
                onClick={() => {
                  setDrawer(false);
                  logout();
                }}
              >
                <IconLogout size={16} style={{ marginRight: 8 }} />
                <span>{t.navigation.logOut}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <main id="main-content" className={styles.main} tabIndex={-1}>
        <FrameContext.Provider value={true}>{children}</FrameContext.Provider>
      </main>

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

/** Tiêu đề trang + kiểm tra quyền PT; chạy bên trong khung. */
function PageBody({
  title,
  description,
  requirePtSpecialty,
  children,
}: {
  title: string;
  description?: string;
  requirePtSpecialty?: boolean;
  children: ReactNode;
}) {
  const { user } = useAuth();
  const router = useRouter();
  // Specialty checks are for display; the API enforces authorization.
  const mismatch =
    !!requirePtSpecialty && user?.role === "Coach" && !canUsePtFeatures(user);
  useEffect(() => {
    if (mismatch && user) router.replace(HOME_BY_ROLE[user.role]);
  }, [mismatch, user, router]);
  if (mismatch) return null;
  return (
    <>
      <div className={styles.pageHeader}>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="content">{children}</div>
    </>
  );
}

export function AppShell({
  title,
  description,
  allow,
  requirePtSpecialty,
  children,
}: {
  title: string;
  description?: string;
  /** Vai trò được phép xem nhánh này. Bảo vệ route ở client, không thay cho RBAC ở API. */
  allow: Role[];
  /** Show PT tools only for a coach with a current PT specialty. */
  requirePtSpecialty?: boolean;
  /** Giữ để không phải sửa nơi gọi; thanh điều hướng trên cùng không còn cần chế độ này. */
  operationalLayout?: boolean;
  children: ReactNode;
}) {
  const inFrame = useContext(FrameContext);
  const page = (
    <PageBody
      title={title}
      description={description}
      requirePtSpecialty={requirePtSpecialty}
    >
      {children}
    </PageBody>
  );
  return inFrame ? page : <AppFrame allow={allow}>{page}</AppFrame>;
}
