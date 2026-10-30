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
import { api, ApiError } from "@/lib/apiClient";
import { useApi, type AsyncState } from "@/lib/useApi";
import { AuditActionPicker } from "./AuditActionPicker";
import { choiceQuery, pageQuery, useUrlQuery } from "@/lib/useUrlQuery";
import { useLanguage } from "@/lib/language";
import type { AuditLogDto, Paged, RoomTypeDto } from "@/lib/types";
import { AuditEventDetails } from "@/features/administration/AuditEventDetails";
import {
  auditRecordType,
  readableAuditLabel,
} from "@/features/administration/audit-event-model";
import { auditDisplayText } from "@/features/administration/audit-display";
import { needsCourtRateRoomNames } from "@/features/administration/CourtRateAuditChanges";
import { auditActionLabel } from "@/features/administration/audit-action-label";
import styles from "./AuditLogView.module.css";

const auditQueryDefaults = {
  action: "",
  targetEntity: "",
  targetId: "",
  dateFrom: "",
  dateTo: "",
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
  targetId: string;
  dateFrom: string;
  dateTo: string;
  actorId: string;
  actor: string;
  actorRole: string;
};

const vietnamTimeZone = "Asia/Ho_Chi_Minh";

// TargetEntity values emitted by backend AuditEntry writers. Merge localized
// historical types below so a readable select never hides a valid audit filter.
const auditTargetEntities = [
  "Attendance",
  "AvatarReport",
  "Class",
  "ClassSession",
  "ClassSessionChangeRequest",
  "ClassTeachingRecord",
  "CoachMemberRelationship",
  "CourtRate",
  "GymCheckIn",
  "IncidentFence",
  "IncidentNotice",
  "Invoice",
  "LandingPageContent",
  "MemberPackage",
  "MemberSupportRequest",
  "MemberSupportPayout",
  "MembershipPackage",
  "Notification",
  "PaymentAdjustment",
  "PointCreditRequest",
  "PointWallet",
  "ReportExport",
  "Room",
  "RoomBlock",
  "RoomType",
  "Sport",
  "SportServiceOffering",
  "SystemSetting",
  "ThresholdResponse",
  "UserAccount",
  "UserProfile",
] as const;

function validDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const instant = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(instant.getTime()) &&
    instant.toISOString().slice(0, 10) === value &&
    value >= "0001-01-01" &&
    value < "9999-12-31"
  );
}

function dateRangeError(from: string, to: string): string | null {
  if ((from && !validDay(from)) || (to && !validDay(to)))
    return "Enter valid dates in the From and To fields.";
  if (from && to && from > to)
    return "The end date must be on or after the start date.";
  return null;
}

function shiftDay(day: string, offset: number): string {
  const instant = new Date(`${day}T00:00:00Z`);
  instant.setUTCDate(instant.getUTCDate() + offset);
  return instant.toISOString().slice(0, 10);
}

function vietnamToday(): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: vietnamTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function auditDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: vietnamTimeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

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
  const [moreOpen, setMoreOpen] = useState(false);
  const [rangeError, setRangeError] = useState<string | null>(
    dateRangeError(values.dateFrom, values.dateTo),
  );
  const moreFiltersId = useId();
  const actionErrorId = useId();
  const rangeErrorId = useId();
  const today = vietnamToday();
  const presets = [
    { label: "All time", from: "", to: "" },
    { label: "Today", from: today, to: today },
    { label: "Last 7 days", from: shiftDay(today, -6), to: today },
    { label: "This month", from: `${today.slice(0, 7)}-01`, to: today },
  ];
  const selectedPeriod = presets.findIndex(
    (preset) => preset.from === draft.dateFrom && preset.to === draft.dateTo,
  );
  const advancedCount = [
    values.action,
    values.targetEntity,
    values.targetId,
    values.actorRole,
    values.actorId,
  ].filter(Boolean).length;
  const entityLabels: Record<string, string> = t.managerAudit.entities;
  const entities: { value: string; label: string }[] = [
    ...new Set([...auditTargetEntities, ...Object.keys(entityLabels)]),
  ].map((value) => ({
    value,
    label: entityLabels[value] ?? readableAuditLabel(value),
  }));
  if (
    draft.targetEntity &&
    !entities.some((entity) => entity.value === draft.targetEntity)
  ) {
    entities.push({
      value: draft.targetEntity,
      label: readableAuditLabel(draft.targetEntity),
    });
  }
  const fields: FilterField[] = [
    { id: "date", label: "Event dates · Vietnam (UTC+7)", kind: "dateRange" },
    {
      id: "action",
      label: l.action,
      kind: "search",
      render: (props) => (
        <AuditActionPicker
          {...props}
          actions={actions}
          humanReadable={administrator}
          errorId={invalidAction ? actionErrorId : undefined}
        />
      ),
    },
    {
      id: "targetEntity",
      label: "Record type",
      kind: "select",
      options: [
        { value: "", label: "All record types" },
        ...entities.sort((a, b) => a.label.localeCompare(b.label)),
      ],
    },
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
              { value: "MEMBER", label: t.navigation.roleLabel.Member },
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
      className={styles.filters}
      aria-describedby={rangeError ? rangeErrorId : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        const error = dateRangeError(draft.dateFrom ?? "", draft.dateTo ?? "");
        setRangeError(error);
        if (error) {
          setMoreOpen(true);
          return;
        }
        const actionText = (draft.action ?? "").trim();
        const available = Array.isArray(actions.data) ? actions.data : [];
        const labelMatches = administrator
          ? available.filter(
              (value) =>
                auditActionLabel(value).toLowerCase() ===
                actionText.toLowerCase(),
            )
          : [];
        const action = actionText
          ? (available.find((value) => value === actionText) ??
            available.find(
              (value) => value.toLowerCase() === actionText.toLowerCase(),
            ) ??
            (labelMatches.length === 1 ? labelMatches[0] : undefined))
          : "";
        if (action === undefined) {
          setInvalidAction(true);
          setMoreOpen(true);
          return;
        }
        setInvalidAction(false);
        onApply({
          action,
          targetEntity: (draft.targetEntity ?? "").trim(),
          targetId: (draft.targetId ?? "").trim(),
          dateFrom: draft.dateFrom ?? "",
          dateTo: draft.dateTo ?? "",
          actorRole: draft.actorRole ?? "",
          actorId: draft.actor !== values.actor ? "" : values.actorId,
          actor: (draft.actor ?? "").trim(),
        });
      }}
    >
      {!administrator && (
        <div
          className={styles.datePresets}
          role="group"
          aria-label="Date presets"
        >
          {presets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className={`btn btn--secondary btn--sm ${styles.preset}`}
              aria-pressed={
                draft.dateFrom === preset.from && draft.dateTo === preset.to
              }
              onClick={() => {
                setDraft((current) => ({
                  ...current,
                  dateFrom: preset.from,
                  dateTo: preset.to,
                }));
                setRangeError(null);
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}
      <FilterBar
        className={!administrator ? styles.managerFilterBar : undefined}
        inline={administrator}
        resetStyle={administrator ? "icon" : "text"}
        fields={
          administrator
            ? [
                fields.find((field) => field.id === "actor")!,
                {
                  id: "period",
                  label: "Period",
                  kind: "select" as const,
                  render: ({ id }: { id: string }) => (
                    <select
                      id={id}
                      value={
                        selectedPeriod < 0 ? "custom" : String(selectedPeriod)
                      }
                      onChange={(event) => {
                        if (event.target.value === "custom") {
                          setMoreOpen(true);
                          return;
                        }
                        const preset = presets[Number(event.target.value)];
                        setDraft((current) => ({
                          ...current,
                          dateFrom: preset.from,
                          dateTo: preset.to,
                        }));
                        setRangeError(null);
                      }}
                    >
                      {presets.map((preset, index) => (
                        <option key={preset.label} value={String(index)}>
                          {preset.label}
                        </option>
                      ))}
                      <option value="custom">Custom dates…</option>
                    </select>
                  ),
                },
              ]
            : fields
        }
        values={draft}
        onChange={(next) => {
          setDraft(next);
          setInvalidAction(false);
          setRangeError(null);
        }}
        activeCount={
          [
            values.action,
            values.targetEntity,
            values.targetId,
            values.dateFrom || values.dateTo,
            values.actorRole,
            values.actorId,
            values.actor,
          ].filter(Boolean).length
        }
        onReset={() => {
          setDraft({
            action: "",
            targetEntity: "",
            targetId: "",
            dateFrom: "",
            dateTo: "",
            actorId: "",
            actor: "",
            actorRole: "",
          });
          setInvalidAction(false);
          setRangeError(null);
          setMoreOpen(false);
          onReset();
        }}
        actions={
          <>
            {administrator && (
              <button
                type="button"
                className="btn btn--secondary"
                aria-expanded={moreOpen}
                aria-controls={moreFiltersId}
                onClick={() => setMoreOpen((open) => !open)}
              >
                More filters
                {advancedCount > 0 && <span> ({advancedCount} applied)</span>}
              </button>
            )}
            <button type="submit" className="btn">
              {l.apply}
            </button>
          </>
        }
      />
      {administrator && (
        <section
          id={moreFiltersId}
          className={styles.advancedFilters}
          hidden={!moreOpen}
          aria-label="Additional audit filters"
        >
          <div className={styles.advancedBody}>
            <FilterBar
              inline
              fields={fields.filter((field) => field.id !== "actor")}
              values={draft}
              onChange={(next) => {
                setDraft(next);
                setInvalidAction(false);
                setRangeError(null);
              }}
            />
          </div>
        </section>
      )}
      {!administrator && (
        <p className={styles.dateHint}>
          Dates include the entire selected day in Vietnam time (UTC+7). Choose
          a preset or custom dates, then select Apply.
        </p>
      )}
      {rangeError && (
        <p id={rangeErrorId} className="field-error" role="alert">
          {rangeError}
        </p>
      )}
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
    targetId: query.values.targetId,
    dateFrom: query.values.dateFrom,
    dateTo: query.values.dateTo,
    actorRole: query.values.actorRole,
    actorId: query.values.actorId,
    actor: query.values.actor,
  };
  const actions = useApi(
    (signal) => api.get<string[]>("/api/audit-logs/actions", { signal }),
    [administrator],
  );
  const state = useApi(
    async (signal) => {
      const error = dateRangeError(filters.dateFrom, filters.dateTo);
      if (error) throw new ApiError(400, "invalid_date_range", error);
      return api.get<Paged<AuditLogDto>>("/api/audit-logs", {
        signal,
        query: {
          page,
          pageSize: 25,
          action: filters.action || undefined,
          targetEntity: filters.targetEntity || undefined,
          targetId: filters.targetId || undefined,
          fromUtc: filters.dateFrom
            ? new Date(`${filters.dateFrom}T00:00:00+07:00`).toISOString()
            : undefined,
          // API upper bound is exclusive: include the whole selected final day.
          toUtc: filters.dateTo
            ? new Date(
                `${shiftDay(filters.dateTo, 1)}T00:00:00+07:00`,
              ).toISOString()
            : undefined,
          actorRole: filters.actorRole || undefined,
          actorId: filters.actorId || undefined,
          actor: filters.actor || undefined,
          sortBy: sort.columnId,
          sortDirection: sort.direction,
        },
      });
    },
    [
      page,
      filters.action,
      filters.targetEntity,
      filters.targetId,
      filters.dateFrom,
      filters.dateTo,
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
      header: "Time (UTC+7)",
      sortable: true,
      cell: (row) => auditDateTime(row.timestamp),
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
      cell: (row) => (
        <span className={styles.actionCode}>
          {administrator
            ? auditActionLabel(row.action, row.newValue)
            : row.action}
        </span>
      ),
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
      targetId: "",
      dateFrom: "",
      dateTo: "",
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
            ? "Events by Managers, Administrators and Coaches, automatic system events, and Member profile photo, support and payment resolution events. Visibility uses the role recorded at event time."
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
