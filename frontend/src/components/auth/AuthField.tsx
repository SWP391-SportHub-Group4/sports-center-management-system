"use client";

import {
  forwardRef,
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { IconEye, IconEyeOff } from "@/components/icons";
import styles from "./AuthField.module.css";

export interface AuthFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "placeholder"
> {
  /** Nhãn bay: nằm trong ô khi trống, thu nhỏ lên trên khi focus hoặc đã có giá trị. */
  label: string;
  /** Icon đầu ô (từ components/icons). Chỉ trang trí nên luôn aria-hidden. */
  icon?: ReactNode;
  /** Phần tử cuối ô (vd. nút con mắt). Ô tự chừa chỗ để chữ không chạy dưới nó. */
  trailing?: ReactNode;
}

/**
 * Ô nhập cho các trang xác thực: icon đầu ô + nhãn bay.
 * Nhãn là <label> thật gắn bằng htmlFor nên trình đọc màn hình đọc đúng; trình duyệt tự điền
 * (autofill) cũng đẩy nhãn lên để không đè chữ.
 */
export const AuthField = forwardRef<HTMLInputElement, AuthFieldProps>(
  function AuthField({ label, icon, trailing, id, className, ...rest }, ref) {
    const generatedId = useId();
    const inputId = id ?? generatedId;

    return (
      <div
        className={[
          styles.field,
          icon ? styles.hasIcon : "",
          trailing ? styles.hasTrailing : "",
          className ?? "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {icon && <span className={styles.icon}>{icon}</span>}
        <input
          ref={ref}
          id={inputId}
          className={styles.input}
          placeholder=" "
          {...rest}
        />
        <label htmlFor={inputId} className={styles.label}>
          {label}
        </label>
        {trailing && <span className={styles.trailing}>{trailing}</span>}
      </div>
    );
  },
);

export interface AuthPasswordFieldProps extends Omit<
  AuthFieldProps,
  "type" | "trailing"
> {
  /** Nhãn nút khi mật khẩu đang ẩn (đã i18n), vd. "Hiện mật khẩu". */
  showLabel: string;
  /** Nhãn nút khi mật khẩu đang hiện, vd. "Ẩn mật khẩu". */
  hideLabel: string;
}

/** Ô mật khẩu với nút con mắt ở cuối ô. Nút giữ focus bàn phím, không làm mất caret của ô nhập. */
export const AuthPasswordField = forwardRef<
  HTMLInputElement,
  AuthPasswordFieldProps
>(function AuthPasswordField({ showLabel, hideLabel, id, ...rest }, ref) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [visible, setVisible] = useState(false);

  return (
    <AuthField
      ref={ref}
      id={inputId}
      type={visible ? "text" : "password"}
      trailing={
        <button
          type="button"
          className={styles.toggle}
          aria-label={visible ? hideLabel : showLabel}
          aria-pressed={visible}
          aria-controls={inputId}
          disabled={rest.disabled}
          onClick={() => setVisible((value) => !value)}
          // Giữ focus ở ô nhập khi bấm bằng chuột/chạm, người dùng gõ tiếp được ngay.
          onMouseDown={(event) => event.preventDefault()}
        >
          {visible ? <IconEyeOff size={20} /> : <IconEye size={20} />}
        </button>
      }
      {...rest}
    />
  );
});
