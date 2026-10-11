"use client";

import { useId, useRef, useSyncExternalStore, type ReactNode } from "react";
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
  /** AI can leave the calendar interactive on desktop; mobile keeps modal behavior. */
  nonModalDesktop?: boolean;
}

const desktopQuery = "(min-width: 1024px)";
const subscribeDesktop = (listener: () => void) => {
  const query = window.matchMedia(desktopQuery);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
};
const isDesktop = () => window.matchMedia(desktopQuery).matches;
const serverDesktop = () => false;

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
  nonModalDesktop = false,
}: DrawerProps) {
  const { t } = useLanguage();
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const desktop = useSyncExternalStore(
    subscribeDesktop,
    isDesktop,
    serverDesktop,
  );
  const modal = !(nonModalDesktop && desktop);
  useModalBehavior(ref, onClose, modal);

  return (
    <div
      className={`backdrop backdrop--drawer${!modal ? " backdrop--nonmodal" : ""}`}
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={`drawer drawer--${size}`}
        role="dialog"
        aria-modal={modal ? true : undefined}
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
