"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { HOME_BY_ROLE, useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
import styles from "./home.module.css";

export function PublicHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, loading } = useAuth();
  const { language, toggleLanguage, t } = useLanguage();
  const accountHref = user ? HOME_BY_ROLE[user.role] : "/login";
  const accountLabel = loading
    ? t.publicNav.account
    : user?.fullName || t.publicNav.signIn;

  return (
    <header className={styles.header}>
      <Link className={styles.logo} href="/" aria-label="SportHub, homepage">
        <Image src="/sporthub/brand.svg" alt="" width={36} height={36} />
        <span>SportHub.</span>
      </Link>
      <button
        className="public-menu-toggle"
        aria-expanded={menuOpen}
        aria-controls="public-nav"
        onClick={() => setMenuOpen((v) => !v)}
      >
        {t.refactor.menu}
      </button>
      <nav
        id="public-nav"
        className={`${styles.nav} ${menuOpen ? "public-nav-open" : ""}`}
        aria-label="Main navigation"
      >
        <Link href="/#activities">{t.refactor.sports}</Link>
        <Link href="/#pricing">{t.refactor.gym}</Link>
        <Link href="/courses">{t.refactor.courses}</Link>
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

        <Link className={styles.memberLink} href={accountHref}>
          <span className={styles.accountName}>{accountLabel}</span>
          <span aria-hidden="true">↗</span>
        </Link>
      </div>
    </header>
  );
}
