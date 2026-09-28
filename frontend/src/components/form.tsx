"use client";

import type { ReactNode } from "react";
import { Field } from "./ui";

/**
 * Tiêu đề trang căn trái, dùng thay cho heading tự viết tay trong từng page — đảm bảo mọi
 * trang cùng khoảng cách/typography theo mục 5.1 của kế hoạch UX.
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <h1 className="page-header__title">{title}</h1>
        {description && <p className="page-header__desc">{description}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </div>
  );
}

/**
 * Nhóm field liên quan trong một `<fieldset>` có `<legend>` — tương đương fieldset pattern
 * của GOV.UK Design System, tránh nhồi mọi input vào một card không phân nhóm.
 */
export function FormSection({
  title,
  hint,
  children,
}: {
  title?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <fieldset className="form-section">
      {title && (
        <legend className="form-section__legend">
          {title}
          {hint && <span className="form-section__hint">{hint}</span>}
        </legend>
      )}
      {children}
    </fieldset>
  );
}

/**
 * Lưới 12 cột ở desktop, tự xuống 1 cột ở mobile (mục 5.1). Đặt `FormRow` bên trong với
 * `span` để quyết định độ rộng field theo dữ liệu, thay vì mọi input rộng bằng nhau.
 */
export function FormGrid({ children }: { children: ReactNode }) {
  return <div className="form-grid">{children}</div>;
}

export function FormRow({
  span = 12,
  children,
}: {
  /** Số cột chiếm trong lưới 12 cột ở desktop (1-12). Mobile luôn xuống hàng riêng. */
  span?: number;
  children: ReactNode;
}) {
  return (
    <div
      className="form-grid__row"
      style={{ "--span": span } as React.CSSProperties}
    >
      {children}
    </div>
  );
}

/**
 * Hàng action dưới form: nhóm primary/secondary bên trái, destructive tách riêng bên phải
 * để không bấm nhầm (mục 5.1 — "destructive action tách xa và cần confirm").
 */
export function FormActions({
  children,
  destructive,
}: {
  children: ReactNode;
  destructive?: ReactNode;
}) {
  return (
    <div className="form-actions">
      <div className="form-actions__primary">{children}</div>
      {destructive && (
        <div className="form-actions__destructive">{destructive}</div>
      )}
    </div>
  );
}

/**
 * Toolbar cho trang danh sách: search/filter/sort bên trái, action cấp trang bên phải
 * (mục 5.4). Dùng chung cho mọi bảng thay vì mỗi page tự bố trí toolbar riêng.
 */
export function FilterToolbar({
  children,
  actions,
}: {
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="filter-toolbar">
      <div className="filter-toolbar__query">{children}</div>
      {actions && <div className="filter-toolbar__actions">{actions}</div>}
    </div>
  );
}

/** Alias ngữ nghĩa của FilterToolbar cho toolbar phía trên data table (mục 5.4/6.2). */
export const DataTableToolbar = FilterToolbar;

/**
 * Cặp "Từ ngày | Đến ngày" cùng một hàng (mục 5.2/6.2). `error` hiện khi from > to —
 * validate ở page gọi, component chỉ chịu trách nhiệm hiển thị.
 */
export function DateRangeField({
  fromLabel,
  toLabel,
  fromValue,
  toValue,
  onFromChange,
  onToChange,
  error,
  required,
  min,
  max,
}: {
  fromLabel: string;
  toLabel: string;
  fromValue: string;
  toValue: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  error?: ReactNode;
  required?: boolean;
  min?: string;
  max?: string;
}) {
  return (
    <div>
      <div className="date-range-field">
        <Field label={fromLabel} required={required}>
          <input
            type="date"
            value={fromValue}
            min={min}
            max={max}
            onChange={(event) => onFromChange(event.target.value)}
          />
        </Field>
        <Field label={toLabel} required={required}>
          <input
            type="date"
            value={toValue}
            min={min}
            max={max}
            onChange={(event) => onToChange(event.target.value)}
          />
        </Field>
      </div>
      {error && (
        <span className="field__error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
