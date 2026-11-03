"use client";
import { useLanguage } from "@/lib/language";
import styles from "./ActivitySwitch.module.css";

export function ActivitySwitch({
  checked,
  onChange,
  disabled,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  hint?: string;
}) {
  const { t, language } = useLanguage();
  return (
    <label className={styles.root}>
      <span className={styles.copy}>
        <strong>{label ?? t.operations.active}</strong>
        <small>
          {hint ??
            (language === "vi"
              ? "Tắt để ngừng sử dụng cho các đăng ký mới."
              : "Turn off to stop availability for new bookings.")}
        </small>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className={styles.track} aria-hidden="true">
        <span />
      </span>
    </label>
  );
}
