"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "quiet"
  | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary = hành động chính của vùng (mỗi vùng tối đa một); danger = thao tác phá hủy. */
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Đang gửi: khóa nút, hiện spinner, đặt aria-busy. Nhãn giữ nguyên để nút không đổi độ rộng. */
  loading?: boolean;
  /** Nhãn trình đọc màn hình đọc khi loading (đã i18n ở nơi gọi). */
  loadingLabel?: string;
  /** Icon đứng trước nhãn — truyền phần tử từ components/icons, không dùng emoji. */
  icon?: ReactNode;
  block?: boolean;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "",
  secondary: "btn--secondary",
  ghost: "btn--ghost",
  quiet: "btn--quiet",
  danger: "btn--danger",
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: "btn--sm",
  md: "",
  lg: "btn--lg",
};

/** Lớp CSS của Button — dùng cho <Link> trông như nút: className={buttonClass({ variant: "ghost" })}. */
export function buttonClass({
  variant = "primary",
  size = "md",
  block,
  className,
}: Pick<ButtonProps, "variant" | "size" | "block" | "className"> = {}) {
  return [
    "btn",
    VARIANT_CLASS[variant],
    SIZE_CLASS[size],
    block ? "btn--block" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "primary",
      size = "md",
      loading = false,
      loadingLabel,
      icon,
      block,
      className,
      disabled,
      type = "button",
      children,
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={buttonClass({ variant, size, block, className })}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...rest}
      >
        {loading ? (
          <>
            <span className="spinner" aria-hidden="true" />
            {loadingLabel && <span className="sr-only">{loadingLabel}</span>}
          </>
        ) : (
          icon
        )}
        {children}
      </button>
    );
  },
);
