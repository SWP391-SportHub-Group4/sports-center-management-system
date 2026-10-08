"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE =
  'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]';

/**
 * Hành vi chung của mọi lớp phủ chiếm focus (Dialog, Drawer):
 *  - đưa focus vào bên trong khi mở, trả lại phần tử đã focus trước đó khi đóng;
 *  - giữ Tab/Shift+Tab trong lớp phủ;
 *  - Escape đóng — chỉ lớp trên cùng xử lý (Dialog mở từ Drawer không làm đóng cả hai);
 *  - khóa cuộn trang nền khi còn lớp phủ.
 */
const stack: symbol[] = [];

export function useModalBehavior(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  modal = true,
) {
  // Giữ onClose mới nhất mà không phải gắn lại listener (và không làm mất focus) mỗi lần render.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const node = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    const token = Symbol("modal");
    stack.push(token);

    node?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const previousOverflow = document.body.style.overflow;
    if (modal) document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (stack[stack.length - 1] !== token) return;

      if (event.key === "Escape") {
        if (!modal && !node?.contains(document.activeElement)) return;
        event.stopPropagation();
        closeRef.current();
        return;
      }

      if (event.key !== "Tab" || !node || !modal) return;

      const targets = Array.from(
        node.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => el.getClientRects().length);
      const first = targets[0];
      const last = targets[targets.length - 1];

      if (!first) {
        event.preventDefault();
        node.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const index = stack.indexOf(token);
      if (index >= 0) stack.splice(index, 1);
      if (modal) document.body.style.overflow = previousOverflow;
      if (modal || node?.contains(document.activeElement)) previous?.focus();
    };
  }, [ref, modal]);
}
