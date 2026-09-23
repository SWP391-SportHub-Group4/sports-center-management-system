"use client";

import Image from "next/image";
import Link from "next/link";
import { HOME_BY_ROLE, useAuth } from "@/lib/auth";
import styles from "./home.module.css";

export function PublicHeader() {
  const { user, loading } = useAuth();
  const accountHref = user ? HOME_BY_ROLE[user.role] : "/dang-nhap";
  const accountLabel = loading ? "Tài khoản" : user?.fullName || "Đăng nhập";

  return (
    <header className={styles.header}>
      <Link className={styles.logo} href="/" aria-label="SportHub, trang chủ">
        <Image src="/sporthub/brand.svg" alt="" width={36} height={36} />
        <span>SportHub.</span>
      </Link>
      <nav className={styles.nav} aria-label="Điều hướng chính">
        <a href="#cau-chuyen">Trung tâm</a>
        <a href="#hoat-dong">Lớp tập</a>
        <a href="#su-kien">Sự kiện</a>
      </nav>
      <Link className={styles.memberLink} href={accountHref}>
        <span className={styles.accountName}>{accountLabel}</span>
        <span aria-hidden="true">↗</span>
      </Link>
    </header>
  );
}
