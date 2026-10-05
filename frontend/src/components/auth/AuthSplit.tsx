"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useLanguage } from "@/lib/language";
import styles from "./AuthSplit.module.css";

export interface AuthSplitProps {
  title: string;
  subtitle?: ReactNode;
  /** Câu lớn trên ảnh (chỉ hiện từ 56rem trở lên, như trang đăng nhập). */
  statement: string;
  statementDetail: string;
  /** Đường quay lại trên cùng thẻ; mặc định về trang chủ như login/register. */
  back?: { href: string; label: string };
  children: ReactNode;
}

/**
 * Khung hai nửa dùng chung cho các trang xác thực phụ (quên/đặt lại mật khẩu): ảnh bên trái, thẻ form
 * bên phải — cùng bố cục với login/register nên người dùng không thấy "trang lạ". Dùng lại các lớp
 * `.auth*` toàn cục của login để ảnh/animation/viền không bị nhân đôi.
 */
export function AuthSplit({
  title,
  subtitle,
  statement,
  statementDetail,
  back,
  children,
}: AuthSplitProps) {
  const { t } = useLanguage();
  const link = back ?? { href: "/", label: t.refactor.backHome };
  return (
    <div className="auth auth--login">
      <main className="auth__layout">
        <aside className="auth__visual" aria-label="SportHub community">
          <div className="auth__visual-copy">
            <h2 className="auth__statement">{statement}</h2>
            <p className="auth__visual-detail">{statementDetail}</p>
          </div>
        </aside>
        <section
          className={`auth__card ${styles.card}`}
          aria-labelledby="auth-split-title"
        >
          <Link className="auth__home-link" href={link.href}>
            <span aria-hidden="true">←</span> {link.label}
          </Link>
          <h1 id="auth-split-title" className={styles.title}>
            {title}
          </h1>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          {children}
        </section>
      </main>
    </div>
  );
}
