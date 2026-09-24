"use client";

import Image from "next/image";
import Link from "next/link";
import { HOME_BY_ROLE, useAuth } from "@/lib/auth";
import styles from "./home.module.css";

export function PublicHeader() {
  const { user, loading } = useAuth();
  const accountHref = user ? HOME_BY_ROLE[user.role] : "/login";
  const accountLabel = loading ? "Account" : user?.fullName || "Sign in";

  return (
    <header className={styles.header}>
      <Link className={styles.logo} href="/" aria-label="SportHub, homepage">
        <Image src="/sporthub/brand.svg" alt="" width={36} height={36} />
        <span>SportHub.</span>
      </Link>
      <nav className={styles.nav} aria-label="Main navigation">
        <a href="#cau-chuyen">About</a>
        <a href="#hoat-dong">Activities</a>
        <a href="#su-kien">Events</a>
      </nav>
      <Link className={styles.memberLink} href={accountHref}>
        <span className={styles.accountName}>{accountLabel}</span>
        <span aria-hidden="true">↗</span>
      </Link>
    </header>
  );
}
