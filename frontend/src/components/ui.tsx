"use client";

import {
  Children,
  useRef,
  useId,
  cloneElement,
  isValidElement,
  type ReactNode,
  type ReactElement,
} from "react";
import type { ApiError } from "@/lib/apiClient";
import { useLanguage } from "@/lib/language";
import { FieldContext } from "@/components/primitives/FieldContext";
import { useModalBehavior } from "@/components/primitives/useModalBehavior";

export function Card({
  title,
  hint,
  actions,
  children,
  bodyless,
}: {
  title?: ReactNode;
  hint?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  /** Bảng tự có đường kẻ nên không cần padding của card__body. */
  bodyless?: boolean;
}) {
  return (
    <section className="card">
      {(title || actions) && (
        <header className="card__head">
          <div>
            {typeof title === "string" ? <h2>{title}</h2> : title}
            {hint && <p className="card__hint">{hint}</p>}
          </div>
          {actions && <div className="btn-row">{actions}</div>}
        </header>
      )}
      {bodyless ? children : <div className="card__body">{children}</div>}
    </section>
  );
}

export function Stat({
  label: statLabel,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="stat">
      <div className="stat__label">{statLabel}</div>
      <div className="stat__value">{value}</div>
      {hint && <div className="stat__hint">{hint}</div>}
    </div>
  );
}

// Keep existing imports working while pages move to components/data.
export { StatusChip } from "@/components/data/StatusChip";

export function Loading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="stack" aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="skeleton"
          style={{ width: `${100 - index * 12}%` }}
        />
      ))}
    </div>
  );
}

export function EmptyState({ message }: { message?: ReactNode }) {
  if (!message) return null;
  if (typeof message === "string") {
    return <p className="state">{message}</p>;
  }
  return <div className="state-custom">{message}</div>;
}

export function ErrorState({
  error,
  onRetry,
}: {
  error: ApiError;
  onRetry?: () => void;
}) {
  const { t } = useLanguage();

  return (
    <div className="stack">
      <div className="alert alert--error" role="alert">
        {error.message}
        {error.code && (
          <span className="small muted"> (Code: {error.code})</span>
        )}
      </div>
      {onRetry && (
        <div>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={onRetry}
          >
            {t.common.retry}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Bọc bốn trạng thái của một vùng dữ liệu: đang tải / lỗi / rỗng / có dữ liệu.
 * Dùng chung để mọi màn hình xử lý chúng giống nhau, không màn hình nào quên trạng thái rỗng.
 */
export function AsyncSection<T>({
  state,
  emptyMessage,
  isEmpty,
  children,
}: {
  state: {
    data: T | null;
    loading: boolean;
    error: ApiError | null;
    reload: () => void;
  };
  emptyMessage?: ReactNode;
  isEmpty?: (data: T) => boolean;
  children: (data: T) => ReactNode;
}) {
  const { t } = useLanguage();
  const resolvedEmptyMessage = emptyMessage ?? t.common.noData;

  if (state.loading && state.data === null) return <Loading />;
  if (state.error)
    return <ErrorState error={state.error} onRetry={state.reload} />;
  if (state.data === null) return <EmptyState message={resolvedEmptyMessage} />;
  if (isEmpty?.(state.data))
    return <EmptyState message={resolvedEmptyMessage} />;

  return <>{children(state.data)}</>;
}

export function Feedback({
  error,
  success,
  id,
}: {
  error?: string | null;
  success?: string | null;
  id?: string;
}) {
  if (!error && !success) return null;

  return (
    <div
      id={id}
      className={`alert ${error ? "alert--error" : "alert--success"}`}
      role={error ? "alert" : "status"}
    >
      {error ?? success}
    </div>
  );
}

export function Field({
  label: fieldLabel,
  hint,
  required,
  error,
  reserveErrorSpace,
  children,
}: {
  label: string;
  hint?: ReactNode;
  /** Hiện dấu `*` sau nhãn — quy ước bắt buộc theo design system (mục 5.1). */
  required?: boolean;
  /** Thông báo lỗi hiện ngay dưới control, gắn `role="alert"` để trình đọc màn hình báo ngay. */
  error?: ReactNode;
  /** Giữ một dòng dưới control để thông báo lỗi không đẩy các trường khác khi xuất hiện. */
  reserveErrorSpace?: boolean;
  children: ReactNode;
}) {
  const { t } = useLanguage();
  const labelId = useId();
  const messageId = useId();
  const describedBy = error || hint ? messageId : undefined;
  // Control gốc (input/select/textarea) được nối ARIA trực tiếp; control của design system
  // (Input/Select/Textarea trong components/primitives) đọc cùng thông tin qua FieldContext.
  const control =
    isValidElement(children) &&
    typeof children.type === "string" &&
    ["input", "select", "textarea"].includes(children.type)
      ? cloneElement(children as ReactElement<Record<string, unknown>>, {
          "aria-labelledby": labelId,
          "aria-describedby": describedBy,
          "aria-invalid": error ? true : undefined,
        })
      : children;
  return (
    <label className="field">
      <span>
        <span id={labelId}>{fieldLabel}</span>
        {required && (
          <>
            <span aria-hidden="true"> *</span>
            <span className="sr-only"> {t.common.requiredSuffix}</span>
          </>
        )}
      </span>
      <FieldContext.Provider
        value={{
          labelId,
          describedBy,
          invalid: Boolean(error),
          required: Boolean(required),
        }}
      >
        {control}
      </FieldContext.Provider>
      {hint && !error && (
        <span id={messageId} className="field__hint">
          {hint}
        </span>
      )}
      {(error || reserveErrorSpace) && (
        <span
          id={error ? messageId : undefined}
          className={`field__error${reserveErrorSpace ? " field__error--reserved" : ""}`}
          role={error ? "alert" : undefined}
          aria-hidden={!error}
        >
          {error}
        </span>
      )}
    </label>
  );
}

export function Dialog({
  title,
  description,
  onClose,
  footer,
  size = "md",
  className = "",
  children,
}: {
  title: string;
  /** Một câu giải thích hệ quả của hành động (đặc biệt với thao tác không hoàn tác). */
  description?: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
  children: ReactNode;
}) {
  const { t } = useLanguage();
  const dialogRef = useRef<HTMLDivElement>(null);
  // Focus trap + Escape + trả focus + khóa cuộn: dùng chung với Drawer.
  useModalBehavior(dialogRef, onClose);

  return (
    <div
      className="backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`dialog ${size === "md" ? "" : `dialog--${size}`} ${className}`}
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="dialog__head">
          <h2>{title}</h2>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={onClose}
          >
            {t.common.close}
          </button>
        </header>
        <div className="dialog__body">
          {description && <p className="dialog__desc">{description}</p>}
          {children}
        </div>
        {footer && <footer className="dialog__foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function Table({
  headers,
  children,
}: {
  headers: (string | { text: string; numeric?: boolean })[];
  children: ReactNode;
}) {
  const { t } = useLanguage();
  const rows = Children.toArray(children);
  return (
    <div
      className="table-wrap"
      tabIndex={0}
      role="region"
      aria-label={headers
        .map((header) => (typeof header === "string" ? header : header.text))
        .filter(Boolean)
        .join(", ")}
    >
      <table>
        <thead>
          <tr>
            {headers.map((header, index) => {
              const text = typeof header === "string" ? header : header.text;
              const numeric =
                typeof header === "string" ? false : header.numeric;

              return (
                <th
                  key={index}
                  scope="col"
                  className={numeric ? "num" : undefined}
                >
                  {text}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows
          ) : (
            <tr>
              <td colSpan={headers.length}>{t.operations.empty}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Pager({
  page,
  pageSize,
  totalCount,
  onChange,
  noun,
}: {
  page: number;
  pageSize: number;
  totalCount: number;
  onChange: (page: number) => void;
  noun?: string;
}) {
  const { t } = useLanguage();
  const resolvedNoun = noun ?? t.common.items;
  const lastPage = Math.max(1, Math.ceil(totalCount / pageSize));

  if (totalCount === 0) return null;

  return (
    <div className="row spread" style={{ marginTop: 12 }}>
      <span className="small muted">
        {t.common.pageLabel} {page}/{lastPage} · {totalCount} {resolvedNoun}
      </span>
      <div className="btn-row">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          {t.common.previousPage}
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          disabled={page >= lastPage}
          onClick={() => onChange(page + 1)}
        >
          {t.common.nextPage}
        </button>
      </div>
    </div>
  );
}
