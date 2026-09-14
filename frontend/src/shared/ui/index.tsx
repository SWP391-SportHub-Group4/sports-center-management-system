"use client";
import Image from "next/image";

import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type ButtonHTMLAttributes,
} from "react";

export type IconName =
  "home" | "calendar" | "coach" | "search" | "bell" | "brand";
export function Icon({
  name,
  className = "",
}: {
  name: IconName;
  className?: string;
}) {
  // Exact exported Figma assets, kept local so their source links cannot expire.
  return (
    <Image
      unoptimized
      src={`/sporthub/${name}.svg`}
      alt=""
      width={24}
      height={24}
      className={`icon ${className}`}
    />
  );
}
export function Card({
  children,
  className = "",
  ...props
}: {
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <section className={`card ${className}`} {...props}>
      {children}
    </section>
  );
}
export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet";
}) {
  return (
    <button
      type="button"
      {...props}
      className={`button ${variant} ${className}`}
    >
      {children}
    </button>
  );
}
export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      {children && <div className="muted">{children}</div>}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const heading = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = original;
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={heading}
      className="modal"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="row between">
        <h2 id={heading}>{title}</h2>
        <Button variant="quiet" onClick={onClose} aria-label="Đóng hộp thoại">
          Đóng
        </Button>
      </div>
      {children}
    </dialog>
  );
}
