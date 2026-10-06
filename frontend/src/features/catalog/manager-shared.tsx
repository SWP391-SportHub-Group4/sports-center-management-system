"use client";

import { useId, type ReactNode, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Dialog, Feedback } from "@/components/ui";
import { FilterBar } from "@/components/data/FilterBar";
import { Table } from "@/components/data/Table";
import { StateView } from "@/components/data/StateView";
import type { FilterField, TableColumn } from "@/components/contracts/table";
import type { AsyncState } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import type { useMutation } from "@/features/operations";
import styles from "./manager-catalog.module.css";

export function useCatalogFilters() {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const values = {
    q: params.get("q") ?? "",
    status: params.get("status") ?? "",
    roomType: params.get("roomType") ?? "",
  };
  const rawPage = Number(params.get("page"));
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const update = (next: Record<string, string>) => {
    const query = new URLSearchParams(params.toString());
    Object.entries(next).forEach(([key, value]) =>
      value ? query.set(key, value) : query.delete(key),
    );
    router.replace(`${path}${query.size ? `?${query}` : ""}`, {
      scroll: false,
    });
  };
  return {
    values,
    page,
    set: (next: Record<string, string>) => update({ ...next, page: "" }),
    setPage: (next: number) => update({ page: String(next) }),
  };
}

export function CatalogFilters({
  filters,
  extra = [],
}: {
  filters: ReturnType<typeof useCatalogFilters>;
  extra?: FilterField[];
}) {
  const { t } = useLanguage();
  return (
    <FilterBar
      fields={[
        { id: "q", label: t.common.search, kind: "search" },
        {
          id: "status",
          label: t.operations.status,
          kind: "select",
          options: [
            { value: "", label: t.operations.all },
            { value: "active", label: t.wireStatus.ACTIVE },
            { value: "inactive", label: t.wireStatus.INACTIVE },
          ],
        },
        ...extra,
      ]}
      values={filters.values}
      onChange={filters.set}
      onReset={() => filters.set({ q: "", status: "", roomType: "" })}
    />
  );
}

export function matchesCatalog(
  row: { isActive: boolean },
  name: string,
  values: ReturnType<typeof useCatalogFilters>["values"],
) {
  return (
    name.toLocaleLowerCase().includes(values.q.trim().toLocaleLowerCase()) &&
    (!values.status || row.isActive === (values.status === "active"))
  );
}

export function CatalogTable<Row>({
  state,
  rows,
  columns,
  caption,
  getRowId,
  actions,
  filters,
}: {
  state: AsyncState<Row[]>;
  rows: Row[];
  columns: TableColumn<Row>[];
  caption: string;
  getRowId: (row: Row) => string;
  actions: (row: Row) => ReactNode;
  filters: ReturnType<typeof useCatalogFilters>;
}) {
  const { t } = useLanguage();
  if (state.error)
    return (
      <StateView
        kind={state.error.isForbidden ? "forbidden" : "error"}
        title={
          state.error.isForbidden
            ? t.dataTable.forbiddenTitle
            : t.dataTable.errorTitle
        }
        description={state.error.message}
        code={state.error.code}
        action={
          <button className="btn btn--secondary" onClick={state.reload}>
            {t.common.retry}
          </button>
        }
      />
    );
  const pageSize = 10;
  const page = Math.min(
    filters.page,
    Math.max(1, Math.ceil(rows.length / pageSize)),
  );
  return (
    <Table
      caption={caption}
      columns={columns}
      rows={rows.slice((page - 1) * pageSize, page * pageSize)}
      getRowId={getRowId}
      rowActions={actions}
      status={state.loading ? "loading" : "ready"}
      empty={{
        title: t.managerCatalog.empty,
        hint: t.managerCatalog.emptyHint,
      }}
      pagination={{
        page,
        pageSize,
        totalCount: rows.length,
        onChange: filters.setPage,
      }}
    />
  );
}

export function CatalogFeedback({
  mutation,
}: {
  mutation: ReturnType<typeof useMutation>;
}) {
  const { t } = useLanguage();
  const c = t.managerCatalog;
  const messages: Record<string, string> = {
    invalid_price: c.invalidPrice,
    membership_price_invalid: c.invalidPrice,
    court_rate_overlap: c.rateOverlap,
    invalid_rate_window: c.invalidWindow,
    invalid_days: c.daysRequired,
    invalid_room_type: c.invalidReference,
    sport_not_compatible: c.invalidReference,
    sport_name_taken: c.duplicateName,
    package_name_taken: c.duplicateName,
    invalid_setting_value: c.ptInvalid,
  };
  const error = mutation.error;
  const message = error
    ? error.isForbidden
      ? c.forbidden
      : error.status === 404
        ? c.notFound
        : (messages[error.code] ?? error.message)
    : undefined;
  return (
    <>
      <Feedback error={message} success={mutation.success} />
      {mutation.error && (
        <p className="small muted">
          {t.managerCatalog.errorCode}: <code>{mutation.error.code}</code>
        </p>
      )}
    </>
  );
}

export function CatalogFormDialog({
  title,
  busy,
  onClose,
  onSubmit,
  children,
  mutation,
  canSubmit = true,
}: {
  title: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
  mutation: ReturnType<typeof useMutation>;
  canSubmit?: boolean;
}) {
  const { t } = useLanguage();
  const formId = useId();
  return (
    <Dialog
      title={title}
      size="lg"
      onClose={() => {
        if (!busy) onClose();
      }}
      footer={
        <>
          <button
            className="btn btn--secondary"
            disabled={busy}
            onClick={onClose}
          >
            {t.operations.cancel}
          </button>
          <button
            className="btn"
            type="submit"
            form={formId}
            disabled={busy || !canSubmit}
          >
            {busy ? t.common.loading : t.operations.save}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="stack">
        <fieldset disabled={busy} className={`stack ${styles.formFields}`}>
          {children}
        </fieldset>
        {mutation.error && <CatalogFeedback mutation={mutation} />}
      </form>
    </Dialog>
  );
}

export function ActivityDialog({
  name,
  active,
  mutation,
  onClose,
  onConfirm,
}: {
  name: string;
  active: boolean;
  mutation: ReturnType<typeof useMutation>;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useLanguage();
  return (
    <Dialog
      title={active ? t.operations.deactivate : t.operations.activate}
      onClose={() => {
        if (!mutation.busy) onClose();
      }}
      footer={
        <>
          <button
            className="btn btn--secondary"
            disabled={mutation.busy}
            onClick={onClose}
          >
            {t.operations.cancel}
          </button>
          <button className="btn" disabled={mutation.busy} onClick={onConfirm}>
            {t.managerCatalog.confirm}
          </button>
        </>
      }
    >
      <p>
        <strong>{name}</strong>
      </p>
      <p>
        {active
          ? t.managerCatalog.deactivateHint
          : t.managerCatalog.activateHint}
      </p>
      {mutation.error && <CatalogFeedback mutation={mutation} />}
    </Dialog>
  );
}
