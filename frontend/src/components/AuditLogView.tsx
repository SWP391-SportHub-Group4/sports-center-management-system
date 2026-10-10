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
import type { AuditLogDto, Paged, RoomTypeDto } from "@/lib/types";
import type { UserAdminDto } from "@/lib/types";
import { pagedItems } from "@/lib/paged";
import { AuditTargetAccount } from "@/features/administration/AuditTargetAccount";
import { AuditTargetEntity } from "@/features/administration/AuditTargetEntity";
import { ManagerAuditChanges } from "@/features/administration/ManagerAuditChanges";
import { ReportExportAuditDetails } from "@/features/administration/ReportExportAuditDetails";
import { MembershipAuditChanges } from "@/features/administration/MembershipAuditChanges";
import {
  CourtRateAuditChanges,
  needsCourtRateRoomNames,
} from "@/features/administration/CourtRateAuditChanges";
import styles from "./AuditLogView.module.css";

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
  const actors = useApi(
    (signal) =>
      api.get<Paged<UserAdminDto>>("/api/users", {
        signal,
        query: { page: 1, pageSize: 100 },
      }),
    [],
  );
  const fields: FilterField[] = [
    {
      id: "action",
      label: l.action,
      kind: "select",
      options: [
        { value: "", label: t.staffWork.all },
        ...Object.entries(t.managerAudit.actions).map(([value, label]) => ({
          value,
          label,
        })),
      ],
    },
    ...(!accountsOnly
      ? [
          {
            id: "targetEntity",
            label: l.entity,
            kind: "select" as const,
            options: [
              { value: "", label: t.staffWork.all },
              ...Object.entries(t.managerAudit.entities).map(
                ([value, label]) => ({ value, label }),
              ),
            ],
          },
        ]
      : []),
    {
      id: "actorId",
      label: t.courseHistory.actor,
      kind: "select",
      options: [
        { value: "", label: t.staffWork.all },
        ...pagedItems(actors.data).map((user) => ({
          value: user.userId,
          label: user.fullName || user.email,
        })),
      ],
    },
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
  const needsRoomNames =
    !accountsOnly && !!state.data?.items.some(needsCourtRateRoomNames);
  // One shared reference request for the page, never one request per audit row.
  const roomTypes = useApi(
    (signal) =>
      needsRoomNames
        ? api.get<RoomTypeDto[]>("/api/room-types", { signal })
        : Promise.resolve<RoomTypeDto[]>([]),
    [needsRoomNames],
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
      header: t.courseHistory.actor,
      sortable: true,
      rowHeader: true,
      cell: (row) => row.actorEmail,
    },
    {
      id: "action",
      header: l.action,
      sortable: true,
      cell: (row) =>
        t.managerAudit.actions[
          row.action as keyof typeof t.managerAudit.actions
        ] ?? t.managerAudit.otherAction,
    },
    {
      id: "targetEntity",
      header: accountsOnly ? t.adminWork.target : l.entity,
      sortable: !accountsOnly,
      cell: (row) =>
        row.targetEntity === "UserAccount" ? (
          <AuditTargetAccount row={row} linkToAccount={accountsOnly} />
        ) : (
          <AuditTargetEntity row={row} />
        ),
    },
    {
      id: "metadata",
      header: l.metadata,
      cell: (row) =>
        row.targetEntity === "ReportExport" ? (
          <ReportExportAuditDetails row={row} />
        ) : row.targetEntity === "MembershipPackage" ? (
          <MembershipAuditChanges row={row} />
        ) : row.targetEntity === "CourtRate" ? (
          <CourtRateAuditChanges row={row} roomTypes={roomTypes.data ?? []} />
        ) : (
          <ManagerAuditChanges row={row} />
        ),
    },
  ];
  const clearFilters = () =>
    query.setValues({ action: "", targetEntity: "", actorId: "", page: "1" });
  return (
    <div className={styles.root}>
      <Card
        title={l.audit}
        hint={
          accountsOnly
            ? `${l.accountScope} ${t.adminWork.targetAccountHint}`
            : l.auditHint
        }
      >
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
        {needsRoomNames && roomTypes.error && (
          <p className="small muted" role="status">
            {t.courtRateAudit.namesUnavailable}{" "}
            <button
              className="btn btn-ghost"
              type="button"
              onClick={roomTypes.reload}
            >
              {t.common.retry}
            </button>
          </p>
        )}
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
    </div>
  );
}
