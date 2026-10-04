import Link from "next/link";
import type { ReactNode } from "react";

export interface PageHeaderProps {
  /** Tiêu đề trang — mỗi trang đúng một <h1>. Khi trang nằm trong AppShell/MemberShell, shell đã in title; dùng PageHeader cho tiêu đề của trang con / chi tiết. */
  title: ReactNode;
  description?: ReactNode;
  /** Liên kết quay lại cấp cha (trang chi tiết). */
  back?: { href: string; label: string };
  /** Chip trạng thái, mã tham chiếu… hiện dưới tiêu đề. */
  meta?: ReactNode;
  /** Nút hành động của trang; để <Button variant="primary"> cho hành động chính duy nhất. */
  actions?: ReactNode;
  as?: "h1" | "h2";
}

/** Đầu trang: tiêu đề, mô tả, quay lại, trạng thái và hành động. Thay cho từng trang tự viết `.page-header`. */
export function PageHeader({
  title,
  description,
  back,
  meta,
  actions,
  as: Heading = "h1",
}: PageHeaderProps) {
  return (
    <header className="page-header">
      <div>
        {back && (
          <Link href={back.href} className="page-header__back">
            {back.label}
          </Link>
        )}
        <Heading className="page-header__title">{title}</Heading>
        {description && <p className="page-header__desc">{description}</p>}
        {meta && <div className="page-header__meta">{meta}</div>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  );
}
