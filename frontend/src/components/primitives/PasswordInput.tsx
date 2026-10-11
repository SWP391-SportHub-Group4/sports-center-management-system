"use client";
import { forwardRef, useId, useState, type InputHTMLAttributes } from "react";
import { Input } from "./Controls";
import { IconEye, IconEyeOff } from "@/components/icons";
import { useLanguage } from "@/lib/language";
import styles from "./PasswordInput.module.css";

/** Standard Field-compatible password control for account and staff forms. */
export const PasswordInput = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, "type">
>(function PasswordInput({ id, ...props }, ref) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [visible, setVisible] = useState(false);
  const { t } = useLanguage();
  return (
    <div className={styles.control}>
      <Input
        {...props}
        id={inputId}
        ref={ref}
        type={visible ? "text" : "password"}
      />
      <button
        type="button"
        className={styles.toggle}
        aria-label={visible ? t.account.hidePassword : t.account.showPassword}
        aria-pressed={visible}
        aria-controls={inputId}
        disabled={props.disabled}
        onClick={() => setVisible((value) => !value)}
        onMouseDown={(event) => event.preventDefault()}
      >
        {visible ? (
          <IconEyeOff size={20} aria-hidden="true" />
        ) : (
          <IconEye size={20} aria-hidden="true" />
        )}
      </button>
    </div>
  );
});
