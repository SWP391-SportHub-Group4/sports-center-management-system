"use client";

import {
  Children,
  Fragment,
  isValidElement,
  useId,
  type MouseEvent,
  type ReactNode,
} from "react";
import type { TableColumn, TableProps } from "@/components/contracts/table";
import { StateView } from "./StateView";
import { useLanguage } from "@/lib/language";
import styles from "./Table.module.css";

const interactiveSelector =
  "a,button,input,select,textarea,summary,[role='button']";

function actionNodes(children: ReactNode): ReactNode[] {
  return Children.toArray(children).flatMap((child) =>
    isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment
      ? actionNodes(child.props.children)
      : [child],
  );
}

/** Controlled data table: sorting and pagination are delegated to the owning page/API. */
export function Table<Row>({
  caption,
  columns,
  rows,
  getRowId,
  sort,
  onSortChange,
  pagination,
  rowActions,
  onRowOpen,
  status = "ready",
  empty,
  mobile = "cards",
  density = "comfortable",
}: TableProps<Row>) {
  const { t } = useLanguage();
  const id = useId();
  const labels = t.dataTable;
  const kind = status === "ready" && rows.length === 0 ? "empty" : status;
  const hiddenClass = (column: TableColumn<Row>) =>
    column.hideBelow ? styles[`hide${column.hideBelow}`] : "";
  const cell = (column: TableColumn<Row>, row: Row): ReactNode => {
    if (column.cell) return column.cell(row);
    const value = (row as Record<string, unknown>)[column.id];
    return value == null ? "—" : String(value);
  };
  const actions = (row: Row) => {
    const nodes = actionNodes(rowActions?.(row));
    const open = onRowOpen && (
      <button
        key="open-details"
        type="button"
        className="btn btn--ghost btn--sm"
        onClick={() => onRowOpen(row)}
      >
        {labels.openDetails}
      </button>
    );
    const all = open ? [open, ...nodes] : nodes;
    return (
      <div className={styles.actions}>
        {all.slice(0, 2)}
        {all.length > 2 && (
          <details className={styles.more}>
            <summary>{labels.more}</summary>
            <div className={styles.moreItems}>{all.slice(2)}</div>
          </details>
        )}
      </div>
    );
  };
  const openRow = (event: MouseEvent, row: Row) => {
    if (!(event.target as HTMLElement).closest(interactiveSelector))
      onRowOpen?.(row);
  };
  const lastPage = pagination
    ? Math.max(1, Math.ceil(pagination.totalCount / pagination.pageSize))
    : 1;
  const titles = {
    loading: t.common.loading,
    empty: t.common.noData,
    error: labels.errorTitle,
    forbidden: labels.forbiddenTitle,
    conflict: labels.conflictTitle,
  };
  const hasActions = !!rowActions || !!onRowOpen;
  const sortControls = columns.filter(
    (column) => column.sortable && onSortChange,
  );
  const changeSort = (columnId: string) =>
    onSortChange?.({
      columnId,
      direction:
        sort?.columnId === columnId && sort.direction === "asc"
          ? "desc"
          : "asc",
    });
  return (
    <div
      className={`${styles.root} ${density === "compact" ? styles.compact : ""}`}
    >
      {kind !== "ready" && kind !== "loading" ? (
        <StateView
          kind={kind}
          title={
            kind === "empty" ? (empty?.title ?? titles.empty) : titles[kind]
          }
          description={kind === "empty" ? empty?.hint : labels[`${kind}Hint`]}
          action={kind === "empty" ? empty?.action : undefined}
        />
      ) : (
        <>
          {mobile === "cards" && sortControls.length > 0 && (
            <div className={styles.mobileSort}>
              <label htmlFor={`${id}-sort`}>{labels.sortBy}</label>
              <select
                id={`${id}-sort`}
                value={sort?.columnId ?? ""}
                onChange={(e) =>
                  onSortChange?.({
                    columnId: e.target.value,
                    direction: sort?.direction ?? "asc",
                  })
                }
              >
                {!sort && (
                  <option value="" disabled>
                    {labels.sortBy}
                  </option>
                )}
                {sortControls.map((column) => (
                  <option key={column.id} value={column.id}>
                    {column.header}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                disabled={!sort}
                onClick={() =>
                  sort &&
                  onSortChange?.({
                    ...sort,
                    direction: sort.direction === "asc" ? "desc" : "asc",
                  })
                }
              >
                {sort?.direction === "desc"
                  ? labels.descending
                  : labels.ascending}
              </button>
            </div>
          )}
          <div
            className={`${styles.viewport} ${mobile === "cards" ? styles.cardTable : ""}`}
            role="region"
            aria-label={caption}
            tabIndex={mobile === "scroll" ? 0 : undefined}
            aria-busy={kind === "loading" || undefined}
          >
            <table>
              <caption className="sr-only">{caption}</caption>
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th
                      key={column.id}
                      scope="col"
                      className={`${hiddenClass(column)} ${column.numeric ? styles.numeric : ""}`}
                      aria-sort={
                        column.sortable && sort?.columnId === column.id
                          ? sort.direction === "asc"
                            ? "ascending"
                            : "descending"
                          : undefined
                      }
                    >
                      {column.sortable && onSortChange ? (
                        <button
                          type="button"
                          className={styles.sortButton}
                          onClick={() => changeSort(column.id)}
                        >
                          {column.header}
                          <span aria-hidden="true">
                            {sort?.columnId === column.id
                              ? sort.direction === "asc"
                                ? "↑"
                                : "↓"
                              : "↕"}
                          </span>
                        </button>
                      ) : (
                        column.header
                      )}
                    </th>
                  ))}
                  {hasActions && <th scope="col">{t.common.actions}</th>}
                </tr>
              </thead>
              <tbody>
                {kind === "loading"
                  ? [0, 1, 2].map((index) => (
                      <tr key={index} aria-hidden="true">
                        {columns.map((column) => (
                          <td
                            key={column.id}
                            data-label={column.header}
                            className={hiddenClass(column)}
                          >
                            <div className="skeleton" />
                          </td>
                        ))}
                        {hasActions && (
                          <td data-label={t.common.actions}>
                            <div className="skeleton" />
                          </td>
                        )}
                      </tr>
                    ))
                  : rows.map((row) => (
                      <tr
                        key={getRowId(row)}
                        onClick={
                          onRowOpen ? (event) => openRow(event, row) : undefined
                        }
                      >
                        {columns.map((column) => {
                          const Cell = column.rowHeader ? "th" : "td";
                          return (
                            <Cell
                              key={column.id}
                              scope={column.rowHeader ? "row" : undefined}
                              data-label={column.header}
                              className={`${hiddenClass(column)} ${column.numeric ? styles.numeric : ""}`}
                            >
                              <div className={styles.cell}>
                                {cell(column, row)}
                              </div>
                            </Cell>
                          );
                        })}
                        {hasActions && (
                          <td data-label={t.common.actions}>{actions(row)}</td>
                        )}
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
          {kind === "loading" && (
            <span className="sr-only" role="status">
              {t.common.loading}
            </span>
          )}
        </>
      )}
      {pagination &&
        pagination.totalCount > 0 &&
        (kind === "ready" || kind === "empty") && (
          <nav
            className={styles.pager}
            aria-label={`${caption} — ${labels.pagination}`}
          >
            <span className="small muted">
              {t.common.pageLabel} {pagination.page}/{lastPage} ·{" "}
              {pagination.totalCount} {t.common.items}
            </span>
            <div className={styles.actions}>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                disabled={pagination.page <= 1}
                onClick={() => pagination.onChange(pagination.page - 1)}
              >
                {t.common.previousPage}
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                disabled={pagination.page >= lastPage}
                onClick={() => pagination.onChange(pagination.page + 1)}
              >
                {t.common.nextPage}
              </button>
            </div>
          </nav>
        )}
    </div>
  );
}
