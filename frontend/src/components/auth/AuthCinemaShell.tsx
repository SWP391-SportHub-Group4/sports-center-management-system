"use client";

import Link from "next/link";
import { CourtIcon } from "@/components/brand/CourtIcon";
import theme from "@/components/brand/cinema-theme.module.css";
import styles from "./auth-cinema-shell.module.css";

export function AuthCinemaShell({ children }: { children: React.ReactNode }) {
  return <div className={`${theme.theme} ${styles.shell}`}>{children}</div>;
}

export function AuthBrand() {
  return (
    <Link className={styles.logo} href="/" aria-label="SportHub, homepage">
      <span className={styles.mark}>
        <CourtIcon name="gym" size={19} />
      </span>
      <span>
        Sport<span className={styles.accent}>Hub</span>
      </span>
    </Link>
  );
}
