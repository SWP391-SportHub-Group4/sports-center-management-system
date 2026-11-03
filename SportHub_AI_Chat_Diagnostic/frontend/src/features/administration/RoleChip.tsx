"use client";

import { StatusChip } from "@/components/data";
import styles from "./users.module.css";

/** Role colours are independent from account status colours. */
export function RoleChip({ role }: { role: string }) {
  return (
    <span className={styles.roleBadge} data-role={role}>
      <StatusChip value={role} />
    </span>
  );
}
