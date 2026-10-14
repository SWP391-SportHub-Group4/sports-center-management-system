"use client";
import { useId, useState } from "react";
import { Card } from "@/components/ui";
import {
  ApiTable,
  FilterBar,
  type FilterField,
  type TableColumn,
} from "@/components/data";
import type { SortDirection } from "@/components/contracts/table";
import { api } from "@/lib/apiClient";
import { useApi, type AsyncState } from "@/lib/useApi";
import { AuditActionPicker } from "./AuditActionPicker";
import { choiceQuery, pageQuery, useUrlQuery } from "@/lib/useUrlQuery";
import { useLanguage } from "@/lib/language";
import { formatDateTime } from "@/lib/format";
import type { AuditLogDto, Paged, RoomTypeDto } from "@/lib/types";
import { AuditEventDetails } from "@/features/administration/AuditEventDetails";
import {
  auditRecordType,
  readableAuditLabel,
} from "@/features/administration/audit-event-model";
import { auditDisplayText } from "@/features/administration/audit-display";
import { needsCourtRateRoomNames } from "@/features/administration/CourtRateAuditChanges";
import styles from "./AuditLogView.module.css";

const auditQueryDefaults = {
  action: "",
  targetEntity: "",
  actorId: "",
  actor: "",
  actorRole: "",
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
type AuditFilters = {
  action: string;
  targetEntity: string;
  actorId: string;
  actor: string;
  actorRole: string;
};

function AuditFilterForm({
  values,
  administrator,
  actions,
  onApply,
  onReset,
}: {
  values: AuditFilters;
  administrator: boolean;
  actions: AsyncState<string[]>;
  onApply: (values: AuditFilters) => void;
  onReset: () => void;
}) {
  const { t } = useLanguage();
  const l = t.staffWork;
  const [draft, setDraft] = useState<Record<string, string>>(values);
  const [invalidAction, setInvalidAction] = useState(false);
  const actionErrorId = useId();
  const fields: FilterField[] = [
    {
      id: "action",
      label: l.action,
      kind: "search",
      render: (props) => (
        <AuditActionPicker
          {...props}
          actions={actions}
          errorId={invalidAction ? actionErrorId : undefined}
        />
      ),
    },
    { id: "targetEntity", label: l.entity, kind: "search" },
    {
      id: "actorRole",
      label: "Role at event time",
      kind: "select",
      options: [
        { value: "", label: "All" },
        {
          value: "CENTER_MANAGER",
          label: t.navigation.roleLabel.CenterManager,
        },
        { value: "COACH", label: t.navigation.roleLabel.Coach },
        ...(administrator
          ? [
              {
                value: "SYSTEM_ADMINISTRATOR",
                label: t.navigation.roleLabel.SystemAdministrator,
              },
              { value: "SYSTEM", label: "System" },
            ]
          : [
              {
                value: "RECEPTIONIST",
                label: t.navigation.roleLabel.Receptionist,
              },
              { value: "MEMBER", label: t.navigation.roleLabel.Member },
            ]),
      ],
    },
    { id: "actor", label: "Actor name or email", kind: "search" },
  ];
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const actionText = (draft.action ?? "").trim();
        const available = Array.isArray(actions.data) ? actions.data : [];
        const action = actionText
          ? (available.find((value) => value === actionText) ??
            available.find(
              (value) => value.toLowerCase() === actionText.toLowerCase(),
            ))
          : "";
        if (action === undefined) {
          setInvalidAction(true);
          return;
        }
        setInvalidAction(false);
        onApply({
          action,
          targetEntity: (draft.targetEntity ?? "").trim(),
          actorRole: draft.actorRole ?? "",
          actorId: draft.actor !== values.actor ? "" : values.actorId,
          actor: (draft.actor ?? "").trim(),
        });
      }}
    >
      <FilterBar
        fields={fields}
        values={draft}
        onChange={(next) => {
          setDraft(next);
          setInvalidAction(false);
        }}
        activeCount={
          [
            values.action,
            values.targetEntity,
            values.actorRole,
            values.actorId,
            values.actor,
          ].filter(Boolean).length
        }
        onReset={() => {
          setDraft({
            action: "",
            targetEntity: "",
            actorId: "",
            actor: "",
            actorRole: "",
          });
          setInvalidAction(false);
          onReset();
        }}
        actions={
          <button type="submit" className="btn">
            {l.apply}
          </button>
        }
      />
      {invalidAction && (
        <p id={actionErrorId} className="field-error" role="alert">
          {t.filterBar.selectAction}
        </p>
      )}
    </form>
  );
}

export function AuditLogView({
  administrator = false,
}: {
  administrator?: boolean;
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
    targetEntity: query.values.targetEntity,
    actorRole: query.values.actorRole,
    actorId: query.values.actorId,
    actor: query.values.actor,
  };
  const actions = useApi(
    (signal) => api.get<string[]>("/api/audit-logs/actions", { signal }),
    [administrator],
  );
  const state = useApi(
    (signal) =>
      api.get<Paged<AuditLogDto>>("/api/audit-logs", {
        signal,
        query: {
          page,
          pageSize: 25,
          action: filters.action || undefined,
          targetEntity: filters.targetEntity || undefined,
          actorRole: filters.actorRole || undefined,
          actorId: filters.actorId || undefined,
          actor: filters.actor || undefined,
          sortBy: sort.columnId,
          sortDirection: sort.direction,
        },
      }),
    [
      page,
      filters.action,
      filters.targetEntity,
      filters.actorId,
      filters.actor,
      filters.actorRole,
      administrator,
      sort.columnId,
      sort.direction,
    ],
  );
  const needsRoomNames = !!state.data?.items.some(needsCourtRateRoomNames);
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
      header: l.actor,
      sortable: true,
      rowHeader: true,
      cell: (row) => (
        <>
          <strong>
            {row.actorRole === "SYSTEM"
              ? "System"
              : auditDisplayText(
                  row.actorFullName?.trim() || row.actorEmail || "Unavailable",
                )}
          </strong>
          {row.actorEmail &&
            (row.actorRole === "SYSTEM" || row.actorFullName?.trim()) && (
              <>
                <br />
                <span className="small muted">
                  {auditDisplayText(
                    row.actorRole === "SYSTEM"
                      ? `Origin account: ${row.actorEmail}`
                      : row.actorEmail,
                  )}
                </span>
              </>
            )}
        </>
      ),
    },
    {
      id: "actorRole",
      header: "Role at event time",
      cell: (row) => (
        <span>
          {(
            {
              CENTER_MANAGER: t.navigation.roleLabel.CenterManager,
              SYSTEM_ADMINISTRATOR: t.navigation.roleLabel.SystemAdministrator,
              COACH: t.navigation.roleLabel.Coach,
              RECEPTIONIST: t.navigation.roleLabel.Receptionist,
              MEMBER: t.navigation.roleLabel.Member,
              SYSTEM: "System",
              UNKNOWN: "Unclassified historical event",
            } as Record<string, string>
          )[row.actorRole ?? ""] ?? "—"}
        </span>
      ),
    },
    {
      id: "action",
      header: l.action,
      sortable: true,
      cell: (row) => readableAuditLabel(row.action),
    },
    {
      id: "targetEntity",
      header: t.adminWork.target,
      sortable: true,
      cell: (row) => auditRecordType(row, t),
    },
    {
      id: "metadata",
      header: "",
      cell: (row) => (
        <AuditEventDetails row={row} roomTypes={roomTypes.data ?? []} />
      ),
    },
  ];
  const clearFilters = () =>
    query.setValues({
      action: "",
      targetEntity: "",
      actorId: "",
      actor: "",
      actorRole: "",
      page: "1",
    });
  return (
    <div className={`${styles.root} ${styles.compact}`}>
      <Card
        title={l.audit}
        hint={
          administrator
            ? "Events by Managers, Administrators and Coaches, plus automatic system events. Visibility uses the role recorded at event time."
            : "Events by Managers, Receptionists, Coaches and Members. Administrator and system events are excluded. Open an event to see its recorded values."
        }
      >
        <AuditFilterForm
          key={JSON.stringify(filters)}
          values={filters}
          administrator={administrator}
          actions={actions}
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
