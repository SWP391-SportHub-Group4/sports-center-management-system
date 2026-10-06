"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { HOME_BY_ROLE, useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
import styles from "./public-header.module.css";
import { CourtIcon } from "@/components/brand/CourtIcon";
import { AccountMenu } from "@/components/brand/AccountMenu";

export function PublicHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const { user, loading, logout } = useAuth();
  const { language, toggleLanguage, t } = useLanguage();
  const accountHref = user ? HOME_BY_ROLE[user.role] : "/login";
  const accountLabel = loading
    ? t.publicNav.account
    : user?.fullName || t.publicNav.signIn;
  const menuLabel = menuOpen
    ? language === "vi"
      ? "Đóng điều hướng"
      : "Close navigation"
    : t.refactor.menu;

  return (
    <header
      className={styles.header}
      onKeyDown={(event) => {
        if (event.key === "Escape" && menuOpen) {
          setMenuOpen(false);
          menuTrigger.current?.focus();
        }
      }}
    >
      <Link
        className={styles.logo}
        href="/"
        aria-label={
          language === "vi" ? "SportHub, trang chủ" : "SportHub, homepage"
        }
      >
        <span className={styles.logoWord}>
          Sport<span className={styles.logoAccent}>Hub</span>
        </span>
      </Link>
      <button
        ref={menuTrigger}
        className={styles.menuToggle}
        aria-expanded={menuOpen}
        aria-controls="public-nav"
        aria-label={menuLabel}
        onClick={() => setMenuOpen((v) => !v)}
      >
        <CourtIcon name={menuOpen ? "close" : "menu"} size={20} />
        {menuLabel}
      </button>
      <nav
        id="public-nav"
        className={`${styles.nav} ${menuOpen ? styles.navOpen : ""}`}
        aria-label={language === "vi" ? "Điều hướng chính" : "Main navigation"}
      >
        <Link href="/#activities" onClick={() => setMenuOpen(false)}>
          {t.refactor.sports}
        </Link>
        <Link href="/#training" onClick={() => setMenuOpen(false)}>
          {t.refactor.pt}
        </Link>
        <Link href="/#programs" onClick={() => setMenuOpen(false)}>
          {language === "vi" ? "Các môn tập" : "Sports & programs"}
        </Link>
      </nav>
      <div className={styles.headerActions}>
        <button
          type="button"
          className={styles.langToggle}
          onClick={toggleLanguage}
          title={t.publicNav.toggleLang}
          aria-label={t.publicNav.toggleLang}
        >
          <span className={language === "en" ? styles.langActive : ""}>EN</span>
          <span className={styles.langDivider}>/</span>
          <span className={language === "vi" ? styles.langActive : ""}>VI</span>
        </button>

        {user ? (
          <AccountMenu
            name={user.fullName}
            subtitle={
              language === "vi" ? "Tài khoản SportHub" : "SportHub account"
            }
            logoutLabel={t.common.logout}
            onSignOut={logout}
            tone="default"
            links={[
              {
                href: accountHref,
                label:
                  language === "vi" ? "Không gian của tôi" : "My dashboard",
                icon: "calendar",
              },
              {
                href: "/account",
                label:
                  language === "vi"
                    ? "Tài khoản & bảo mật"
                    : "Account & security",
                icon: "shield",
              },
              ...(user.role === "Member"
                ? [
                    {
                      href: "/member/finance?tab=wallet",
                      label: language === "vi" ? "Ví điểm" : "Point wallet",
                      icon: "wallet" as const,
                    },
                  ]
                : []),
            ]}
          />
        ) : (
          <Link className={styles.memberLink} href={accountHref}>
            <span className={styles.accountName}>{accountLabel}</span>
            <CourtIcon name="diagonal" size={18} />
          </Link>
        )}
      </div>
    </header>
  );
}
