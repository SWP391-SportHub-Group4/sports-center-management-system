"use client";

import Link from "next/link";
import { ReceiptText } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { HOME_BY_ROLE, useAuth, type Role } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
import { NotificationBell } from "./NotificationBell";
import { MemberCodeButton } from "./MemberCodeCard";
import { AssistantButton } from "@/features/member/assistant";
import { walletApi } from "@/features/wallet/api";
import { useApi } from "@/lib/useApi";
import { formatPoints } from "@/lib/format";
import {
  IconSettings,
  IconHeartbeat,
  IconLogout,
  IconQrCode,
  IconMenu,
  IconClose,
} from "./icons";
import styles from "./MemberShell.module.css";
import { AvatarImage } from "./AvatarImage";

export interface NavItem {
  href: string;
  label: string;
  /** Tiền tố route khác cùng thuộc mục này (vd. chi tiết hóa đơn thuộc Tài chính). */
  also?: string[];
}

export interface MemberShellProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  allow?: Role[];
  children: ReactNode;
}

/** Có khung Member (header, drawer, footer) bao ngoài chưa; nếu rồi thì trang chỉ vẽ phần nội dung. */
const MemberFrameContext = createContext(false);

function MemberWalletHeader() {
  const { language } = useLanguage();
  const wallet = useApi((signal) => walletApi.balance(signal), []);
  return (
    <Link
      href="/member/finance?tab=wallet"
      className={styles.walletHeader}
      aria-label={
        wallet.data
          ? `${language === "vi" ? "Ví điểm" : "Point wallet"}: ${formatPoints(wallet.data.availablePoints)}`
          : language === "vi"
            ? "Mở ví điểm"
            : "Open point wallet"
      }
    >
      <span className={styles.walletHeaderLabel}>
        {language === "vi" ? "Ví điểm" : "Points"}
      </span>
      <strong>
        {wallet.data ? formatPoints(wallet.data.availablePoints) : "—"}
      </strong>
    </Link>
  );
}

function isActive(pathname: string, item: NavItem) {
  if (item.href === "/member") return pathname === item.href;
  return [item.href, ...(item.also ?? [])].some((prefix) =>
    pathname.startsWith(prefix),
  );
}

/**
 * Khung điều hướng của Member: đặt một lần ở `app/member/layout.tsx` để thanh điều hướng không bị
 * dựng lại (nhấp nháy) mỗi lần chuyển trang; header sticky luôn ở đầu màn hình khi cuộn.
 */
export function MemberFrame({
  allow = ["Member"],
  children,
}: {
  allow?: Role[];
  children: ReactNode;
}) {
  const { user, loading, logout } = useAuth();
  const { language, t } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const memberNavItems: NavItem[] = [
    { href: "/member", label: language === "vi" ? "Tổng quan" : "Overview" },
    {
      href: "/member/services",
      label: t.memberPages.services,
      also: [
        "/member/discover",
        "/member/courses",
        "/member/courts",
        "/member/rentals",
      ],
    },
    { href: "/member/schedule", label: t.memberPages.schedule },
    {
      href: "/member/training",
      label: language === "vi" ? "Tập luyện" : "Training",
    },
  ];
  const billingActive = isActive(pathname, {
    href: "/member/finance",
    label: t.finance.title,
    also: ["/member/invoices", "/member/wallet"],
  });

  // Authentication & Role check
  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace(
        `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`,
      );
      return;
    }

    if (!allow.includes(user.role)) {
      router.replace(HOME_BY_ROLE[user.role]);
    }
  }, [user, loading, allow, router, pathname]);

  // Click outside listener for user menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (loading || !user || !allow.includes(user.role)) {
    return (
      <div className={styles.authLoading}>
        <div className={styles.authCard}>
          <p>{t.common.preparingSpace}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <a href="#main-content" className="skip-link">
        {language === "en"
          ? "Skip to main content"
          : "Chuyển tới nội dung chính"}
      </a>
      {/* Top Header */}
      <header className={`${styles.header} ${styles.memberHeader}`}>
        <div className={styles.headerInner}>
          {/* Logo & Portal Badge */}
          <Link href="/member" className={styles.brandGroup}>
            <span className={styles.brandLogo}>
              Sport<span className={styles.brandLogoAccent}>Hub</span>
            </span>
            <span className={styles.roleBadge}>
              {t.navigation.roleLabel.Member}
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className={styles.desktopNav} aria-label="Member Navigation">
            {memberNavItems.map((item) => {
              const active = isActive(pathname, item);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Header Actions */}
          <div className={styles.headerActions}>
            {/* Notification Bell */}
            <MemberWalletHeader />
            <NotificationBell />

            {/* User Dropdown */}
            <div
              className={styles.userMenuWrapper}
              ref={menuRef}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setUserMenuOpen(false);
                  menuRef.current
                    ?.querySelector<HTMLButtonElement>("button")
                    ?.focus();
                }
              }}
            >
              <button
                type="button"
                className={styles.userButton}
                onClick={() => setUserMenuOpen((prev) => !prev)}
                aria-expanded={userMenuOpen}
                data-testid="user-profile-button"
                aria-label={user.fullName || user.email}
              >
                <AvatarImage
                  name={user.fullName || user.email}
                  avatarUrl={user.avatarUrl}
                  size={36}
                  className={styles.userAvatar}
                />
                <span className={styles.userName}>
                  {user.fullName || user.email}
                </span>
                <span className={styles.dropdownArrow} aria-hidden="true">
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

              {userMenuOpen && (
                <div className={styles.userDropdown}>
                  <div className={styles.dropdownHeader}>
                    <div className={styles.dropdownName}>
                      {user.fullName || user.email}
                    </div>
                    <div className={styles.dropdownRole}>
                      {language === "en"
                        ? "SportHub Member"
                        : "Hội viên SportHub"}
                    </div>
                  </div>

                  <button
                    type="button"
                    className={styles.dropdownItem}
                    onClick={() => {
                      setUserMenuOpen(false);
                      setCodeOpen(true);
                    }}
                  >
                    <IconQrCode size={15} />
                    <span>
                      {language === "en" ? "Member code" : "Mã hội viên"}
                    </span>
                  </button>
                  <Link
                    href="/account"
                    className={styles.dropdownItem}
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <IconSettings size={15} />
                    <span>{t.common.myAccount}</span>
                  </Link>
                  <Link
                    href="/member/profile"
                    className={styles.dropdownItem}
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <IconHeartbeat size={15} />
                    <span>{t.common.fitnessProfile}</span>
                  </Link>

                  <Link
                    href="/member/finance"
                    className={styles.dropdownItem}
                    aria-current={billingActive ? "page" : undefined}
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <ReceiptText size={15} aria-hidden="true" />
                    <span>{t.finance.title}</span>
                  </Link>

                  <div className={styles.dropdownDivider} />

                  <button
                    type="button"
                    className={`${styles.dropdownItem} ${styles.logoutItem}`}
                    onClick={() => {
                      setUserMenuOpen(false);
                      logout();
                    }}
                  >
                    <IconLogout size={15} />
                    <span>{t.common.logout}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Mobile Menu Toggle Button */}
            <button
              type="button"
              className={styles.mobileMenuBtn}
              onClick={() => setMobileMenuOpen(true)}
              aria-label={t.nav.openNav}
            >
              <IconMenu size={20} />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div
          className={styles.mobileDrawerOverlay}
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className={styles.mobileDrawer}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.mobileDrawerHeader}>
              <span className={styles.brandLogo}>
                Sport<span className={styles.brandLogoAccent}>Hub</span>
              </span>
              <button
                type="button"
                className={styles.mobileDrawerClose}
                onClick={() => setMobileMenuOpen(false)}
                aria-label={t.nav.closeNav}
              >
                <IconClose size={20} />
              </button>
            </div>

            <div className={styles.mobileNavLinks}>
              {memberNavItems.map((item) => {
                const active = isActive(pathname, item);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`${styles.mobileNavLink} ${active ? styles.mobileNavLinkActive : ""}`}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {item.label}
                  </Link>
                );
              })}
              <button
                type="button"
                className={styles.mobileNavLink}
                onClick={() => {
                  setMobileMenuOpen(false);
                  setCodeOpen(true);
                }}
              >
                <IconQrCode size={16} style={{ marginRight: 8 }} />
                <span>{language === "en" ? "Member code" : "Mã hội viên"}</span>
              </button>
              <Link
                href="/member/profile"
                className={styles.mobileNavLink}
                onClick={() => setMobileMenuOpen(false)}
              >
                <IconHeartbeat size={16} style={{ marginRight: 8 }} />
                <span>{t.common.fitnessProfile}</span>
              </Link>
              <Link
                href="/account"
                className={styles.mobileNavLink}
                onClick={() => setMobileMenuOpen(false)}
              >
                <IconSettings size={16} style={{ marginRight: 8 }} />
                <span>{t.common.myAccount}</span>
              </Link>
              <Link
                href="/member/finance"
                className={`${styles.mobileNavLink} ${billingActive ? styles.mobileNavLinkActive : ""}`}
                aria-current={billingActive ? "page" : undefined}
                onClick={() => setMobileMenuOpen(false)}
              >
                <ReceiptText size={16} style={{ marginRight: 8 }} aria-hidden="true" />
                <span>{t.finance.title}</span>
              </Link>
              <button
                type="button"
                className={`${styles.mobileNavLink} ${styles.logoutItem}`}
                onClick={() => {
                  setMobileMenuOpen(false);
                  logout();
                }}
              >
                <IconLogout size={16} style={{ marginRight: 8 }} />
                <span>{t.common.logout}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Page Content */}
      <main id="main-content" className={styles.main} tabIndex={-1}>
        <MemberFrameContext.Provider value={true}>
          {children}
        </MemberFrameContext.Provider>
      </main>

      <MemberCodeButton
        hideTrigger
        open={codeOpen}
        onOpenChange={setCodeOpen}
      />
      <AssistantButton />
    </div>
  );
}

/** Trang của Member: tiêu đề + nội dung. Dùng trong layout `/member` thì khung đã có sẵn; ngoài đó (vd. /account) tự bọc khung. */
export function MemberShell({
  title,
  description,
  actions,
  allow = ["Member"],
  children,
}: MemberShellProps) {
  const inFrame = useContext(MemberFrameContext);
  const page = (
    <>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitleGroup}>
          <h1 className={styles.pageTitle}>{title}</h1>
          {description && (
            <p className={styles.pageDescription}>{description}</p>
          )}
        </div>
        {actions && <div>{actions}</div>}
      </div>
      {children}
    </>
  );
  return inFrame ? page : <MemberFrame allow={allow}>{page}</MemberFrame>;
}
