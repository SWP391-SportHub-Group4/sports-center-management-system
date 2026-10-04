"use client";

import { useId, useRef, type ReactNode } from "react";
import { useLanguage } from "@/lib/language";
import { Button } from "./Button";
import { useModalBehavior } from "./useModalBehavior";

export interface DrawerProps {
  title: string;
  /** Một dòng mô tả dưới tiêu đề (tùy chọn). */
  description?: ReactNode;
  onClose: () => void;
  /** Vùng nút cố định ở đáy. */
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}

/**
 * Ngăn kéo cạnh phải (bottom sheet trên mobile) cho tác vụ cần xem nền phía sau:
 * chi tiết buổi trên Calendar, AI Assistant, bộ lọc nâng cao.
 * Cần ngắt hẳn người dùng để xác nhận một quyết định → dùng <Dialog>.
 * Hào dùng cho CalendarEventDrawer và AI Drawer; không tạo bản Drawer thứ hai.
 */
export function Drawer({
  title,
  description,
  onClose,
  footer,
  size = "md",
  children,
}: DrawerProps) {
  const { t } = useLanguage();
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModalBehavior(ref, onClose);

  return (
    <div
      className="backdrop backdrop--drawer"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={`drawer drawer--${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="drawer__head">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p className="drawer__desc">{description}</p>}
          </div>
          <Button variant="quiet" size="sm" onClick={onClose}>
            {t.common.close}
          </Button>
        </header>
        <div className="drawer__body">{children}</div>
        {footer && <footer className="drawer__foot">{footer}</footer>}
      </div>
    </div>
  );
}
