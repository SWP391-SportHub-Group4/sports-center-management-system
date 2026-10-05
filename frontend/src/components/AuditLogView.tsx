"use client";
import { useState } from "react";
import { Card } from "@/components/ui";
import {
  ApiTable,
  FilterBar,
  type FilterField,
  type TableColumn,
} from "@/components/data";
import type { SortDirection } from "@/components/contracts/table";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { choiceQuery, pageQuery, useUrlQuery } from "@/lib/useUrlQuery";
import { useLanguage } from "@/lib/language";
import { formatDateTime } from "@/lib/format";
import type { AuditLogDto, Paged } from "@/lib/types";
import { auditMetadata } from "@/features/administration/audit-metadata";

const auditQueryDefaults = {
  action: "",
  targetEntity: "",
  actorId: "",
  page: "1",
  sortBy: "timestamp",
  sortDirection: "desc",
};
const auditQueryValidators = {
  page: pageQuery,
  sortBy: choiceQuery(
    ["timestamp", "actorEmail", "action", "targetEntity"],
    "timestamp",
  ),
  sortDirection: choiceQuery(["asc", "desc"], "desc"),
};
type AuditFilters = { action: string; targetEntity: string; actorId: string };

function AuditFilterForm({
  values,
  accountsOnly,
  onApply,
  onReset,
}: {
  values: AuditFilters;
  accountsOnly: boolean;
  onApply: (values: AuditFilters) => void;
  onReset: () => void;
}) {
  const { t } = useLanguage();
  const l = t.staffWork;
  const [draft, setDraft] = useState<Record<string, string>>(values);
  const [invalidActor, setInvalidActor] = useState(false);
  const fields: FilterField[] = [
    { id: "action", label: l.action, kind: "search" },
    ...(!accountsOnly
      ? [{ id: "targetEntity", label: l.entity, kind: "search" as const }]
      : []),
    { id: "actorId", label: l.actor, kind: "search" },
  ];
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const actorId = (draft.actorId ?? "").trim();
        if (
          actorId &&
          !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
            actorId,
          )
        ) {
          setInvalidActor(true);
          return;
        }
        setInvalidActor(false);
        onApply({
          action: (draft.action ?? "").trim(),
          targetEntity: accountsOnly ? "" : (draft.targetEntity ?? "").trim(),
          actorId,
        });
      }}
    >
      <FilterBar
        fields={fields}
        values={draft}
        onChange={(next) => {
          setDraft(next);
          setInvalidActor(false);
        }}
        activeCount={
          [
            values.action,
            !accountsOnly && values.targetEntity,
            values.actorId,
          ].filter(Boolean).length
        }
        onReset={() => {
          setDraft({ action: "", targetEntity: "", actorId: "" });
          setInvalidActor(false);
          onReset();
        }}
        actions={
          <button type="submit" className="btn">
            {l.apply}
          </button>
        }
      />
      {invalidActor && (
        <p className="field-error" role="alert">
          {t.filterBar.invalidActor}
        </p>
      )}
    </form>
  );
}

export function AuditLogView({
  accountsOnly = false,
}: {
  accountsOnly?: boolean;
}) {
  const { t } = useLanguage();
  const l = t.staffWork;
  const query = useUrlQuery(auditQueryDefaults, auditQueryValidators);
  const page = Number(query.values.page);
  const sort = {
    columnId: query.values.sortBy,
    direction: query.values.sortDirection as SortDirection,
  };
  const filters = {
    action: query.values.action,
    targetEntity: accountsOnly ? "" : query.values.targetEntity,
    actorId: query.values.actorId,
  };
  const state = useApi(
    (signal) =>
      api.get<Paged<AuditLogDto>>("/api/audit-logs", {
        signal,
        query: {
          page,
          pageSize: 25,
          action: filters.action || undefined,
          targetEntity: accountsOnly
            ? "UserAccount"
            : filters.targetEntity || undefined,
          actorId: filters.actorId || undefined,
          sortBy: sort.columnId,
          sortDirection: sort.direction,
        },
      }),
    [
      page,
      filters.action,
      filters.targetEntity,
      filters.actorId,
      accountsOnly,
      sort.columnId,
      sort.direction,
    ],
  );
  const columns: TableColumn<AuditLogDto>[] = [
    {
      id: "timestamp",
      header: l.time,
      sortable: true,
      cell: (row) => formatDateTime(row.timestamp),
    },
    {
      id: "actorEmail",
      header: l.actor,
      sortable: true,
      rowHeader: true,
      cell: (row) => (
        <>
          {row.actorEmail}
          <br />
          <span className="small muted">{row.userId}</span>
        </>
      ),
    },
    { id: "action", header: l.action, sortable: true },
    {
      id: "targetEntity",
      header: l.entity,
      sortable: true,
      cell: (row) => (
        <>
          {row.targetEntity}
          <br />
          <span className="small muted">{row.targetId}</span>
        </>
      ),
    },
    {
      id: "metadata",
      header: l.metadata,
      cell: (row) => (
        <>
          {auditMetadata(row.oldValue).map(([key, value]) => (
            <p key={`old-${key}`}>
              <del>
                {key}: {value}
              </del>
            </p>
          ))}
          {auditMetadata(row.newValue).map(([key, value]) => (
            <p key={`new-${key}`}>
              {key}: {value}
            </p>
          ))}
        </>
      ),
    },
  ];
  const clearFilters = () =>
    query.setValues({ action: "", targetEntity: "", actorId: "", page: "1" });
  return (
    <>
      <Card title={l.audit} hint={accountsOnly ? l.accountScope : l.auditHint}>
        <AuditFilterForm
          key={JSON.stringify(filters)}
          values={filters}
          accountsOnly={accountsOnly}
          onApply={(next) => {
            query.setValues({ ...next, page: "1" });
            state.reload();
          }}
          onReset={clearFilters}
        />
      </Card>
      <Card>
        <ApiTable
          caption={l.audit}
          columns={columns}
          state={state}
          getRowId={(row) => row.auditId}
          page={page}
          pageSize={25}
          onPageChange={(next) => query.setValues({ page: String(next) })}
          sort={sort}
          onSortChange={(next) =>
            query.setValues({
              sortBy: next.columnId,
              sortDirection: next.direction,
              page: "1",
            })
          }
          empty={{ title: t.common.noData, hint: t.dataTable.emptyHint }}
        />
      </Card>
    </>
  );
}
