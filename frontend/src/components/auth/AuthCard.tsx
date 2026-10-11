"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { IconClose } from "@/components/icons";
import { useLanguage } from "@/lib/language";
import styles from "./AuthCard.module.css";

export interface AuthCardProps {
  title: string;
  subtitle?: ReactNode;
  /** Nơi nút đóng (×) dẫn tới; mặc định về trang đăng nhập. */
  closeHref?: string;
  children: ReactNode;
}

/**
 * Thẻ xác thực đứng giữa nền teal (quên/đặt lại mật khẩu): tiêu đề, nút đóng, một câu mô tả, nội dung.
 * Nhẹ hơn khung hai nửa của login vì đây là bước phụ, người dùng chỉ cần làm xong rồi quay lại đăng nhập.
 */
export function AuthCard({
  title,
  subtitle,
  closeHref = "/login",
  children,
}: AuthCardProps) {
  const { t } = useLanguage();
  return (
    <main className="auth">
      <section
        className={`auth__card ${styles.card}`}
        aria-labelledby="auth-card-title"
      >
        <div className={styles.head}>
          <h1 id="auth-card-title" className={styles.title}>
            {title}
          </h1>
          <Link
            href={closeHref}
            className={styles.close}
            aria-label={t.common.close}
          >
            <IconClose size={18} />
          </Link>
        </div>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        {children}
      </section>
    </main>
  );
}
