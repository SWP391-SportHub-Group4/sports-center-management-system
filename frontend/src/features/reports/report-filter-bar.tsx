"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { SlidersHorizontal, RotateCcw, X } from "lucide-react";
import { Field } from "@/components/ui";
import { MemberPicker } from "@/components/MemberPicker";
import { AvatarImage } from "@/components/AvatarImage";
import { SportLoader } from "@/components/loading/SportLoader";
import { api } from "@/lib/apiClient";
import { useApi, useNow } from "@/lib/useApi";
import { useUrlQuery } from "@/lib/useUrlQuery";
import { vietnamLocal } from "@/lib/vietnam-time";
import { formatDate } from "@/lib/format";
import type { SportDto, UserAdminDto } from "@/lib/types";
import {
  monthPeriod,
  validPeriod,
  type PeriodSelection,
} from "./report-periods";
import {
  collectionSources,
  countDimensions,
  filterFields,
  readReportContext,
  reportQueryDefaults,
  reportSourceName,
  sameDimensions,
  samePeriod,
  type FilterScope,
  type ReportDimensions,
} from "./report-filter-config";
import s from "./report-filters.module.css";

const subscribeToHydration = () => () => undefined;
export function useReportLocation() {
  const ready = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const { values, setValues } = useUrlQuery(reportQueryDefaults);
  const today = vietnamLocal(new Date(useNow()).toISOString()).slice(0, 10);
  return {
    ready,
    today,
    values,
    setValues,
    context: readReportContext(values, today),
  };
}

export function ReportFilterBar({
  scope,
  label,
  draft,
  applied,
  dimensions,
  appliedDimensions,
  onPeriodChange,
  onDimensionsChange,
  onApply,
  onReset,
  today,
  children,
}: {
  scope: FilterScope;
  label: string;
  draft: PeriodSelection;
  applied: PeriodSelection;
  dimensions: ReportDimensions;
  appliedDimensions: ReportDimensions;
  onPeriodChange: (next: PeriodSelection) => void;
  onDimensionsChange: (next: ReportDimensions) => void;
  onApply: () => void;
  onReset: () => void;
  today: string;
  children?: ReactNode;
}) {
  const [error, setError] = useState("");
  const [openScopes, setOpenScopes] = useState<
    Partial<Record<FilterScope, boolean>>
  >({});
  const fields = filterFields[scope],
    count = countDimensions(appliedDimensions);
  const changed =
    !samePeriod(draft, applied) ||
    !sameDimensions(dimensions, appliedDimensions);
  const sports = useApi(
    (signal) =>
      fields.sport
        ? api.get<SportDto[]>("/api/manager/sports", { signal })
        : Promise.resolve([] as SportDto[]),
    [fields.sport],
  );
  const memberId =
    dimensions.memberId && !dimensions.member
      ? dimensions.memberId
      : appliedDimensions.memberId && !appliedDimensions.member
        ? appliedDimensions.memberId
        : "";
  const member = useApi(
    (signal) =>
      memberId
        ? api.get<UserAdminDto>(`/api/users/${memberId}`, { signal })
        : Promise.resolve(null),
    [memberId],
  );
  const selectedMember =
    dimensions.member ??
    (member.data?.userId === dimensions.memberId ? member.data : null);
  const appliedMember =
    appliedDimensions.member ??
    (member.data?.userId === appliedDimensions.memberId ? member.data : null);
  const thisMonth = monthPeriod(today),
    previous = monthPeriod(today, -1);
  const preset =
    draft.fromDate === thisMonth.fromDate && draft.toDate === thisMonth.toDate
      ? "current"
      : draft.fromDate === previous.fromDate && draft.toDate === previous.toDate
        ? "previous"
        : "custom";
  const hasFields = fields.sport || fields.member || fields.source;
  const sportName =
    appliedDimensions.sportName ??
    sports.data?.find(
      (row) => String(row.sportId) === appliedDimensions.sportId,
    )?.name ??
    `Sport ${appliedDimensions.sportId}`;
  return (
    <form
      className={s.filters}
      aria-label={`${label} report filters`}
      onSubmit={(event) => {
        event.preventDefault();
        if (
          !validPeriod(draft) ||
          (draft.compare === "custom" &&
            !validPeriod({
              fromDate: draft.compareFrom,
              toDate: draft.compareTo,
            }))
        ) {
          setError("Choose a valid period of 1–366 days.");
          return;
        }
        setError("");
        onApply();
      }}
    >
      {children && <div className={s.context}>{children}</div>}
      <div className={s.toolbar}>
        <Field label="Report period">
          <select
            value={preset}
            onChange={(e) => {
              const dates =
                e.target.value === "current"
                  ? thisMonth
                  : e.target.value === "previous"
                    ? previous
                    : { fromDate: "", toDate: "" };
              onPeriodChange({ ...draft, ...dates });
            }}
          >
            <option value="current">This month</option>
            <option value="previous">Previous month</option>
            <option value="custom">Custom period</option>
          </select>
        </Field>
        <Field label="Compare with">
          <select
            value={draft.compare}
            onChange={(e) =>
              onPeriodChange({
                ...draft,
                compare: e.target.value as PeriodSelection["compare"],
              })
            }
          >
            <option value="off">Off</option>
            <option value="previous">Previous month</option>
            <option value="custom">Custom period</option>
          </select>
        </Field>
        {hasFields && (
          <button
            type="button"
            className={`btn btn--ghost ${s.more}`}
            aria-expanded={!!openScopes[scope]}
            aria-controls="report-more-filters"
            onClick={() =>
              setOpenScopes({ ...openScopes, [scope]: !openScopes[scope] })
            }
          >
            <SlidersHorizontal size={16} aria-hidden="true" />
            <span>More filters</span>
            {count > 0 && (
              <span
                className={s.count}
                aria-label={`${count} applied ${count === 1 ? "filter" : "filters"}`}
              >
                {count}
              </span>
            )}
          </button>
        )}
        <button className="btn" type="submit">
          Apply
        </button>
      </div>
      <div className={s.range}>
        {formatDate(applied.fromDate)} – {formatDate(applied.toDate)} · Vietnam
        time
      </div>
      {preset === "custom" && (
        <div className={s.dateRow}>
          <Field label="From">
            <input
              type="date"
              required
              value={draft.fromDate}
              onChange={(e) =>
                onPeriodChange({ ...draft, fromDate: e.target.value })
              }
            />
          </Field>
          <Field label="To">
            <input
              type="date"
              required
              value={draft.toDate}
              onChange={(e) =>
                onPeriodChange({ ...draft, toDate: e.target.value })
              }
            />
          </Field>
        </div>
      )}
      {draft.compare === "custom" && (
        <div className={s.dateRow}>
          <Field label="Comparison from">
            <input
              type="date"
              required
              value={draft.compareFrom}
              onChange={(e) =>
                onPeriodChange({ ...draft, compareFrom: e.target.value })
              }
            />
          </Field>
          <Field label="Comparison to">
            <input
              type="date"
              required
              value={draft.compareTo}
              onChange={(e) =>
                onPeriodChange({ ...draft, compareTo: e.target.value })
              }
            />
          </Field>
        </div>
      )}
      {hasFields && (
        <div
          id="report-more-filters"
          className={s.advanced}
          hidden={!openScopes[scope]}
        >
          <div className={s.advancedHeading}>
            <strong>{label} filters</strong>
            <button
              type="button"
              className={s.reset}
              disabled={!count && !countDimensions(dimensions)}
              onClick={() => {
                setError("");
                onReset();
              }}
            >
              <RotateCcw size={14} aria-hidden="true" />
              Reset filters
            </button>
          </div>
          <div className={s.fields}>
            {fields.sport && (
              <div>
                <Field label="Sport">
                  <select
                    value={dimensions.sportId}
                    disabled={sports.loading || !!sports.error}
                    onChange={(e) =>
                      onDimensionsChange({
                        ...dimensions,
                        sportId: e.target.value,
                        sportName: sports.data?.find(
                          (row) => String(row.sportId) === e.target.value,
                        )?.name,
                      })
                    }
                  >
                    <option value="">All sports</option>
                    {dimensions.sportId &&
                      !sports.data?.some(
                        (row) => String(row.sportId) === dimensions.sportId,
                      ) && (
                        <option value={dimensions.sportId}>
                          {dimensions.sportName ??
                            `Sport ${dimensions.sportId}`}
                        </option>
                      )}
                    {sports.data?.map((row) => (
                      <option key={row.sportId} value={row.sportId}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                </Field>
                {sports.loading && (
                  <span className={s.lookupStatus}>Loading sports…</span>
                )}
                {sports.error && (
                  <span className={s.lookupError} role="alert">
                    Sports unavailable.{" "}
                    <button type="button" onClick={sports.reload}>
                      Retry
                    </button>
                  </span>
                )}
              </div>
            )}
            {fields.source && (
              <Field label="Collection source">
                <select
                  value={dimensions.source}
                  onChange={(e) =>
                    onDimensionsChange({
                      ...dimensions,
                      source: e.target.value,
                    })
                  }
                >
                  <option value="">All sources</option>
                  {collectionSources.map(([value, name]) => (
                    <option key={value} value={value}>
                      {name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {fields.member && (
              <div>
                {dimensions.memberId ? (
                  <div className={s.memberSelection}>
                    <span className={s.fieldLabel}>Member</span>
                    <div className={s.memberCard}>
                      {selectedMember ? (
                        <>
                          <AvatarImage
                            userId={selectedMember.userId}
                            name={
                              selectedMember.fullName || selectedMember.email
                            }
                            avatarUrl={selectedMember.avatarUrl}
                          />
                          <div className={s.memberIdentity}>
                            <strong>
                              {selectedMember.fullName || selectedMember.email}
                            </strong>
                            <span>{selectedMember.email}</span>
                          </div>
                        </>
                      ) : (
                        <div className={s.memberIdentity}>
                          {member.loading ? (
                            <SportLoader
                              size="inline"
                              label="Loading member…"
                            />
                          ) : (
                            <span role="alert">
                              Member details unavailable.{" "}
                              <button type="button" onClick={member.reload}>
                                Retry
                              </button>
                            </span>
                          )}
                        </div>
                      )}
                      <button
                        type="button"
                        className={s.remove}
                        aria-label="Remove member"
                        onClick={() =>
                          onDimensionsChange({
                            ...dimensions,
                            member: null,
                            memberId: "",
                          })
                        }
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <MemberPicker
                    scanner={false}
                    label="Member"
                    placeholder="Find a member"
                    value={null}
                    onChange={(next) =>
                      onDimensionsChange({
                        ...dimensions,
                        member: next,
                        memberId: next?.userId ?? "",
                      })
                    }
                  />
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {(count > 0 || changed) && (
        <div className={s.statusRow}>
          {count > 0 && (
            <div className={s.applied} aria-label="Applied filters">
              <span>Applied:</span>
              {appliedDimensions.sportId && (
                <span className={s.chip}>{sportName}</span>
              )}
              {appliedDimensions.source && (
                <span className={s.chip}>
                  {reportSourceName(appliedDimensions.source)}
                </span>
              )}
              {appliedDimensions.memberId && (
                <span className={s.chip}>
                  Member:{" "}
                  {appliedMember?.fullName ||
                    appliedMember?.email ||
                    "Selected member"}
                </span>
              )}
            </div>
          )}
          {changed && (
            <span className={s.pending} role="status">
              Changes not applied
            </span>
          )}
        </div>
      )}
      {error && (
        <p className={s.lookupError} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
