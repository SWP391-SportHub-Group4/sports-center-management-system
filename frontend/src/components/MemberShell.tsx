"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import QRCode from "qrcode";
import { HOME_BY_ROLE, useAuth, type Role } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
import { NotificationBell } from "./NotificationBell";
import {
  IconQrCode,
  IconSettings,
  IconHeartbeat,
  IconLogout,
  IconMenu,
  IconClose,
  IconClock,
  IconRefresh,
} from "./icons";
import styles from "./MemberShell.module.css";

export interface NavItem {
  href: string;
  label: string;
}

export interface MemberShellProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  allow?: Role[];
  children: ReactNode;
}

export function MemberShell({
  title,
  description,
  actions,
  allow = ["Member"],
  children,
}: MemberShellProps) {
  const { user, loading, logout } = useAuth();
  const { language, toggleLanguage, t } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>("");
  const [qrCountdown, setQrCountdown] = useState<number>(60);

  const menuRef = useRef<HTMLDivElement>(null);

  const memberNavItems: NavItem[] = [
    { href: "/member", label: t.nav.home },
    { href: "/member/class-schedule", label: t.nav.classSchedule },
    { href: "/member/my-registrations", label: t.nav.myRegistrations },
    { href: "/member/my-plans", label: t.nav.myPlans },
    { href: "/member/training", label: t.nav.training },
    { href: "/member/invoices", label: language === "en" ? "Invoices" : "Hóa đơn" },
  ];

  // Authentication & Role check
  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
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

  // Keyboard Escape listener for QR modal
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && qrModalOpen) {
        setQrModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [qrModalOpen]);

  // Generate dynamic QR pass with security nonce
  const generateQrPass = useCallback(async () => {
    if (!user) return;
    try {
      const payload = JSON.stringify({
        kind: "SPORTHUB_GATE_ACCESS",
        memberId: user.email,
        name: user.fullName,
        timestamp: Date.now(),
        nonce: Math.random().toString(36).substring(2, 10),
      });

      const url = await QRCode.toDataURL(payload, {
        width: 200,
        margin: 1,
        color: {
          dark: "#1a2b4c",
          light: "#ffffff",
        },
      });
      setQrCodeDataUrl(url);
      setQrCountdown(60);
    } catch {
      // Ignore generation error
    }
  }, [user]);

  const handleOpenQr = () => {
    setQrModalOpen(true);
    void generateQrPass();
  };

  // Countdown timer for active QR pass
  useEffect(() => {
    if (!qrModalOpen) return;

    const timer = setInterval(() => {
      setQrCountdown((prev) => {
        if (prev <= 1) {
          void generateQrPass();
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [qrModalOpen, generateQrPass]);

  if (loading || !user || !allow.includes(user.role)) {
    return (
      <div className={styles.authLoading}>
        <div className={styles.authCard}>
          <p>{t.common.preparingSpace}</p>
        </div>
      </div>
    );
  }

  const userInitial = user.fullName
    ? user.fullName.charAt(0).toUpperCase()
    : user.email.charAt(0).toUpperCase();

  return (
    <div className={styles.shell}>
      <a href="#main-content" className="skip-link">
        {language === "en" ? "Skip to main content" : "Chuyển tới nội dung chính"}
      </a>
      {/* Top Header */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          {/* Logo & Portal Badge */}
          <Link href="/member" className={styles.brandGroup}>
            <span className={styles.brandLogo}>
              Sport<span className={styles.brandLogoAccent}>Hub</span>
            </span>
            <span className={styles.portalBadge}>Member</span>
          </Link>

          {/* Desktop Navigation */}
          <nav className={styles.desktopNav} aria-label="Member Navigation">
            {memberNavItems.map((item) => {
              const active =
                item.href === "/member"
                  ? pathname === item.href
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Header Actions */}
          <div className={styles.headerActions}>
            {/* Quick QR Pass Button */}
            <button
              type="button"
              className={styles.qrButton}
              onClick={handleOpenQr}
              title={language === "en" ? "Open Center QR Gate Pass" : "Mở mã QR vào cửa trung tâm"}
            >
              <div className={styles.qrIconWrapper}>
                <IconQrCode size={15} className={styles.qrIcon} />
                <span className={styles.qrPulseDot} />
              </div>

              <span className={styles.qrTextTitle}>{t.nav.gatePassTitle}</span>
            </button>

            {/* Language Switcher */}
            <button
              type="button"
              className={styles.langToggleBtn}
              onClick={toggleLanguage}
              title={language === "en" ? "Chuyển sang Tiếng Việt" : "Switch to English"}
              aria-label="Toggle language"
            >
              <span className={styles.langFlag}>{language === "en" ? "🇺🇸" : "🇻🇳"}</span>
              <span className={styles.langText}>{language === "en" ? "EN" : "VI"}</span>
            </button>

            {/* Notification Bell */}
            <NotificationBell />

            {/* User Dropdown */}
            <div className={styles.userMenuWrapper} ref={menuRef}>
              <button
                type="button"
                className={styles.userButton}
                onClick={() => setUserMenuOpen((prev) => !prev)}
                aria-expanded={userMenuOpen}
              >
                <div className={styles.userAvatar}>{userInitial}</div>
                <span className={styles.userName}>
                  {user.fullName || user.email}
                </span>
                <span className={styles.dropdownArrow} aria-hidden="true">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
                      {language === "en" ? "SportHub Member" : "Hội viên SportHub"}
                    </div>
                  </div>

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
              aria-label="Mở menu điều hướng"
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
                aria-label="Đóng menu"
              >
                <IconClose size={20} />
              </button>
            </div>

            <button
              type="button"
              className={styles.mobileQrButton}
              onClick={() => {
                setMobileMenuOpen(false);
                handleOpenQr();
              }}
            >
              <div className={styles.qrIconWrapper}>
                <IconQrCode size={18} className={styles.qrIcon} />
              </div>
              <div className={styles.mobileQrTextGroup}>
                <span className={styles.mobileQrTitle}>{t.nav.gatePassTitle}</span>
                <span className={styles.mobileQrSub}>{t.nav.gatePassSub}</span>
              </div>
            </button>

            <div className={styles.mobileNavLinks}>
              {memberNavItems.map((item) => {
                const active =
                  item.href === "/member"
                    ? pathname === item.href
                    : pathname.startsWith(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`${styles.mobileNavLink} ${active ? styles.mobileNavLinkActive : ""}`}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {item.label}
                  </Link>
                );
              })}
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
              <button
                type="button"
                className={styles.langToggleBtn}
                style={{ marginTop: 12, width: "100%", justifyContent: "center" }}
                onClick={toggleLanguage}
              >
                <span className={styles.langFlag}>{language === "en" ? "🇺🇸" : "🇻🇳"}</span>
                <span className={styles.langText}>
                  {language === "en" ? "Language: English (Switch to VI)" : "Ngôn ngữ: Tiếng Việt (Chuyển EN)"}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global QR Check-in Modal */}
      {qrModalOpen && (
        <div
          className={styles.qrModalOverlay}
          onClick={() => setQrModalOpen(false)}
        >
          <div
            className={styles.qrModalCard}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className={styles.qrCloseButton}
              onClick={() => setQrModalOpen(false)}
            >
              <IconClose size={20} />
            </button>

            <h3 className={styles.qrModalTitle}>{t.gatePassModal.title}</h3>
            <p className={styles.qrModalSub}>
              {t.gatePassModal.subtitle}
            </p>

            <div className={styles.qrCodeContainer}>
              {qrCodeDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrCodeDataUrl}
                  alt={t.gatePassModal.title}
                  className={styles.qrCodeImg}
                />
              ) : (
                <div style={{ width: 200, height: 200, display: "grid", placeItems: "center" }}>
                  <span>{t.common.loading}</span>
                </div>
              )}
            </div>

            <div className={styles.qrTimerBadge}>
              <IconClock size={15} style={{ marginRight: 4 }} />
              <span>{t.gatePassModal.refreshesIn}:</span>
              <strong>0:{qrCountdown < 10 ? `0${qrCountdown}` : qrCountdown}</strong>
            </div>

            <button
              type="button"
              className={styles.qrRefreshBtn}
              onClick={() => void generateQrPass()}
            >
              <IconRefresh size={14} style={{ marginRight: 6 }} />
              {language === "en" ? "Refresh Pass Now" : "Làm mới mã ngay"}
            </button>
          </div>
        </div>
      )}

      {/* Main Page Content */}
      <main id="main-content" className={styles.main} tabIndex={-1}>
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
      </main>

      {/* Footer */}
      <footer className={styles.footer}>
        {language === "en"
          ? "SportHub · Multi-Sport Center · Gym · Yoga · GroupX · Personal Training"
          : "SportHub · Trung tâm Thể thao Đa năng · Gym · Yoga · GroupX · Huấn luyện cá nhân"}
      </footer>
    </div>
  );
}
