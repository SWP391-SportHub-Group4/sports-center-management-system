"use client";

import type { StatusChipProps, StatusTone } from "@/components/contracts/table";
import { chipTone, label as defaultLabel } from "@/lib/format";
import { useLanguage } from "@/lib/language";
import styles from "./StatusChip.module.css";

// All consumers share this module; semantic colors come from existing design tokens.
const toneClasses: Record<StatusTone, string> = {
  neutral: "chip--neutral",
  success: "chip--ok",
  warning: "chip--warn",
  danger: "chip--danger",
  info: "chip--info",
};

/** API value supplies the default label/color; pages may override either independently. */
export function StatusChip({ value, tone, label }: StatusChipProps) {
  const { t } = useLanguage();
  if (!value && label === undefined) return <span className="muted">—</span>;

  const text =
    label ??
    t.wireStatus[value as keyof typeof t.wireStatus] ??
    defaultLabel(value);
  const colorClass = tone === undefined ? chipTone(value) : toneClasses[tone];

  return <span className={`chip ${colorClass} ${styles.root}`}>{text}</span>;
}
