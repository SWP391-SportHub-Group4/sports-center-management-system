"use client";

import { useRef, useState } from "react";
import Image from "next/image";
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
      <Link className={styles.logo} href="/" aria-label="SportHub, homepage">
        <Image src="/sporthub/brand.svg" alt="" width={36} height={36} />
        <span>SportHub.</span>
      </Link>
      <button
        ref={menuTrigger}
        className={styles.menuToggle}
        aria-expanded={menuOpen}
        aria-controls="public-nav"
        onClick={() => setMenuOpen((v) => !v)}
      >
        <CourtIcon name={menuOpen ? "close" : "menu"} size={20} />
        {t.refactor.menu}
      </button>
      <nav
        id="public-nav"
        className={`${styles.nav} ${menuOpen ? styles.navOpen : ""}`}
        aria-label="Main navigation"
      >
        <Link href="/#activities" onClick={() => setMenuOpen(false)}>
          {t.refactor.sports}
        </Link>
        <Link href="/#pricing" onClick={() => setMenuOpen(false)}>
          {t.refactor.gym}
        </Link>
        <Link href="/courses" onClick={() => setMenuOpen(false)}>
          {t.refactor.courses}
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
              ...(user.role === "Member" || user.role === "ExternalCoach"
                ? [
                    {
                      href:
                        user.role === "Member"
                          ? "/member/wallet"
                          : "/external-coach/wallet",
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
