import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import type { ComponentProps } from "react";

type Direction = "forward" | "back" | "external";

const ICONS = {
  forward: ArrowRight,
  back: ArrowLeft,
  external: ArrowUpRight,
} as const;

/**
 * Liên kết văn bản dùng chung cho khu Member: một kiểu gạch chân, một kiểu focus, mũi tên là icon vẽ sẵn
 * thay cho ký tự → ← ↗. `back` đặt icon trước chữ, các hướng còn lại đặt sau.
 */
export function TextLink({
  direction,
  standalone = false,
  className,
  children,
  ...rest
}: ComponentProps<typeof Link> & {
  direction?: Direction;
  /** Liên kết đứng riêng một dòng: đủ vùng chạm 44px. Liên kết giữa đoạn văn thì để mặc định. */
  standalone?: boolean;
}) {
  const Icon = direction ? ICONS[direction] : null;
  const icon = Icon && (
    <Icon className="text-link__icon" size={16} strokeWidth={2} aria-hidden="true" />
  );
  return (
    <Link
      {...rest}
      className={["text-link", standalone && "text-link--standalone", className]
        .filter(Boolean)
        .join(" ")}
      data-direction={direction}
    >
      {direction === "back" && icon}
      {children}
      {direction && direction !== "back" && icon}
    </Link>
  );
}
