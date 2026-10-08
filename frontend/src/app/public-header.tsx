"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AccountMenu } from "@/components/brand/AccountMenu";
import { CourtIcon } from "@/components/brand/CourtIcon";
import { HOME_BY_ROLE, useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
import styles from "./public-header.module.css";

export function PublicHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const { user, loading, logout } = useAuth();
  const { language, toggleLanguage, t } = useLanguage();
  const vi = language === "vi";
  const copy = vi
    ? {
        menu: "Mở điều hướng",
        closeMenu: "Đóng điều hướng",
        home: "SportHub, trang chủ",
        activities: "Các bộ môn",
        training: "Không khí luyện tập",
        signIn: "Đăng nhập",
        mySpace: "Không gian của tôi",
        account: "Tài khoản & bảo mật",
        subtitle: "Tài khoản SportHub",
      }
    : {
        menu: "Open navigation",
        closeMenu: "Close navigation",
        home: "SportHub, homepage",
        activities: "Sports",
        training: "Training life",
        signIn: "Sign in",
        mySpace: "My space",
        account: "Account & security",
        subtitle: "SportHub account",
      };

  useEffect(() => {
    if (!menuOpen) return;
    const dismissOutside = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node))
        setMenuOpen(false);
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuTrigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header ref={headerRef} className={styles.header}>
      <Link className={styles.logo} href="/#top" aria-label={copy.home}>
        <span className={styles.logoMark} aria-hidden="true">
          <CourtIcon name="gym" size={19} />
        </span>
        <span className={styles.logoWord}>
          Sport<span className={styles.logoAccent}>Hub</span>
        </span>
      </Link>

      <button
        ref={menuTrigger}
        className={styles.menuToggle}
        type="button"
        aria-expanded={menuOpen}
        aria-controls="public-navigation"
        aria-label={menuOpen ? copy.closeMenu : copy.menu}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <CourtIcon name={menuOpen ? "close" : "menu"} size={20} />
      </button>

      <nav
        id="public-navigation"
        className={`${styles.navigation} ${menuOpen ? styles.navigationOpen : ""}`}
        aria-label={vi ? "Điều hướng chính" : "Main navigation"}
      >
        <div className={styles.navLinks}>
          <Link href="/#activities" onClick={closeMenu}>
            {copy.activities}
          </Link>
          <Link href="/#training-gallery-title" onClick={closeMenu}>
            {copy.training}
          </Link>
        </div>

        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.langToggle}
            onClick={toggleLanguage}
            title={t.publicNav.toggleLang}
            aria-label={t.publicNav.toggleLang}
          >
            <span className={language === "en" ? styles.langActive : ""}>
              EN
            </span>
            <span className={styles.langDivider}>/</span>
            <span className={language === "vi" ? styles.langActive : ""}>
              VI
            </span>
          </button>

          {loading ? (
            <span
              className={styles.accountLoading}
              aria-label={vi ? "Đang tải tài khoản" : "Loading account"}
              aria-busy="true"
            />
          ) : user ? (
            <AccountMenu
              name={user.fullName}
              subtitle={copy.subtitle}
              logoutLabel={t.common.logout}
              onSignOut={logout}
              links={[
                {
                  href: HOME_BY_ROLE[user.role],
                  label: copy.mySpace,
                  icon: "calendar",
                },
                {
                  href: "/account",
                  label: copy.account,
                  icon: "shield",
                },
                ...(user.role === "Member"
                  ? [
                      {
                        href: "/member/finance?tab=wallet",
                        label: vi ? "Ví điểm" : "Point wallet",
                        icon: "wallet" as const,
                      },
                    ]
                  : []),
              ]}
            />
          ) : (
            <Link className={styles.signIn} href="/login" onClick={closeMenu}>
              {copy.signIn}
              <CourtIcon name="arrow" size={17} />
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
