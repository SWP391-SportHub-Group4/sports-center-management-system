"use client";

import { useEffect, type ReactNode } from "react";
import { chipTone, label } from "@/lib/format";
import type { ApiError } from "@/lib/apiClient";

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

/** Chip trạng thái — nhãn tiếng Việt và màu lấy chung từ lib/format. */
export function StatusChip({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="muted">—</span>;

  return <span className={`chip ${chipTone(value)}`}>{label(value)}</span>;
}

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

export function EmptyState({ message }: { message: string }) {
  return <p className="state">{message}</p>;
}

export function ErrorState({
  error,
  onRetry,
}: {
  error: ApiError;
  onRetry?: () => void;
}) {
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
            Retry
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
  emptyMessage = "No data yet.",
  isEmpty,
  children,
}: {
  state: {
    data: T | null;
    loading: boolean;
    error: ApiError | null;
    reload: () => void;
  };
  emptyMessage?: string;
  isEmpty?: (data: T) => boolean;
  children: (data: T) => ReactNode;
}) {
  if (state.loading && state.data === null) return <Loading />;
  if (state.error)
    return <ErrorState error={state.error} onRetry={state.reload} />;
  if (state.data === null) return <EmptyState message={emptyMessage} />;
  if (isEmpty?.(state.data)) return <EmptyState message={emptyMessage} />;

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
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{fieldLabel}</span>
      {children}
      {hint && <span className="field__hint">{hint}</span>}
    </label>
  );
}

export function Dialog({
  title,
  onClose,
  footer,
  children,
}: {
  title: string;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  // Escape để đóng: hộp thoại phủ kín thao tác phía sau, phải luôn có đường thoát bằng bàn phím.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handler);

    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="dialog"
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
            Close
          </button>
        </header>
        <div className="dialog__body">{children}</div>
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
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {headers.map((header, index) => {
              const text = typeof header === "string" ? header : header.text;
              const numeric =
                typeof header === "string" ? false : header.numeric;

              return (
                <th key={index} className={numeric ? "num" : undefined}>
                  {text}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Pager({
  page,
  pageSize,
  totalCount,
  onChange,
}: {
  page: number;
  pageSize: number;
  totalCount: number;
  onChange: (page: number) => void;
}) {
  const lastPage = Math.max(1, Math.ceil(totalCount / pageSize));

  if (totalCount === 0) return null;

  return (
    <div className="row spread" style={{ marginTop: 12 }}>
      <span className="small muted">
        Trang {page}/{lastPage} · {totalCount} log
      </span>
      <div className="btn-row">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          Previous Page
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          disabled={page >= lastPage}
          onClick={() => onChange(page + 1)}
        >
          Trang sau
        </button>
      </div>
    </div>
  );
}
