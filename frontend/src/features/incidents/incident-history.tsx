"use client";
import Link from "next/link";
import { useId, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { AsyncSection, Field } from "@/components/ui";
import { Table } from "@/components/data";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime } from "@/lib/format";
import { incidentApi } from "./incident-api";
import type { IncidentDetails } from "./incident-api";
import { vietnamLocal } from "@/lib/vietnam-time";
import { catalogApi } from "@/features/catalog";
import styles from "./incident-history.module.css";

export function IncidentHistory({ refreshKey }: { refreshKey: string }) {
  const { t } = useLanguage();
  const l = t.managerOperations;
  const [scope, setScope] = useState("");
  const scopeListId = useId();
  const [scopeOpen, setScopeOpen] = useState(false);
  const [scopeSearching, setScopeSearching] = useState(false);
  const [activeScope, setActiveScope] = useState(-1);
  const rooms = useApi((signal) => catalogApi.rooms(signal), []);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const state = useApi(
    async (signal) => {
      const rows: IncidentDetails[] = [];
      let page = 1;
      let total = 0;
      do {
        const data = await incidentApi.list(page, signal, 100);
        rows.push(...data.items);
        total = data.totalCount;
        if (!data.items.length) break;
        page++;
      } while (rows.length < total);
      return [...new Map(rows.map((row) => [row.incidentId, row])).values()];
    },
    [refreshKey],
  );
  const query = scope.trim().toLocaleLowerCase();
  const scopeOptions = [
    { value: "", label: t.incidentHistory.allScopes },
    {
      value: t.incidentHistory.wholeCenter,
      label: t.incidentHistory.wholeCenter,
    },
    ...(rooms.data ?? []).map((room) => ({
      value: room.name,
      label: room.name,
    })),
  ].filter(
    (option) =>
      !scopeSearching ||
      !query ||
      option.label.toLocaleLowerCase().includes(query),
  );
  function chooseScope(value: string) {
    setScope(value);
    setScopeOpen(false);
    setScopeSearching(false);
    setActiveScope(-1);
  }
  const selectedRoom = rooms.data?.find(
    (room) => room.name.toLocaleLowerCase() === query,
  );
  const rows = (state.data ?? []).filter(
    (incident) =>
      (!query ||
        (selectedRoom
          ? incident.scope.toUpperCase() !== "CENTER" &&
            incident.roomId === selectedRoom.roomId
          : (incident.scope.toUpperCase() === "CENTER"
              ? t.incidentHistory.wholeCenter
              : (incident.roomName ??
                rooms.data?.find((room) => room.roomId === incident.roomId)
                  ?.name ??
                "")
            )
              .toLocaleLowerCase()
              .includes(query))) &&
      (!startDate ||
        vietnamLocal(incident.endAtUtc).slice(0, 10) >= startDate) &&
      (!endDate || vietnamLocal(incident.startAtUtc).slice(0, 10) <= endDate),
  );
  return (
    <div className={styles.history}>
      <div className={styles.filters}>
        <div className={styles.scopeControl}>
          <Field label={l.incidentScope}>
            <input
              type="text"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={scopeOpen}
              aria-controls={scopeOpen ? scopeListId : undefined}
              aria-activedescendant={
                scopeOpen && activeScope >= 0
                  ? `${scopeListId}-${activeScope}`
                  : undefined
              }
              className={styles.scopeInput}
              value={scope}
              autoComplete="off"
              placeholder={t.incidentHistory.allScopes}
              onFocus={() => {
                setScopeOpen(true);
                setScopeSearching(false);
              }}
              onClick={() => setScopeOpen(true)}
              onBlur={() => setScopeOpen(false)}
              onChange={(event) => {
                setScope(event.target.value);
                setScopeOpen(true);
                setScopeSearching(true);
                setActiveScope(-1);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  setScopeOpen(true);
                  if (scopeOptions.length)
                    setActiveScope(
                      (current) =>
                        (current +
                          (event.key === "ArrowDown" ? 1 : -1) +
                          scopeOptions.length) %
                        scopeOptions.length,
                    );
                } else if (
                  event.key === "Enter" &&
                  scopeOpen &&
                  activeScope >= 0
                ) {
                  event.preventDefault();
                  chooseScope(scopeOptions[activeScope].value);
                } else if (event.key === "Escape" && scopeOpen) {
                  event.preventDefault();
                  event.stopPropagation();
                  setScopeOpen(false);
                }
              }}
            />
          </Field>
          <ChevronDown
            size={18}
            className={styles.scopeChevron}
            aria-hidden="true"
          />
          {scopeOpen && (
            <div
              id={scopeListId}
              role="listbox"
              aria-label={l.incidentScope}
              className={styles.scopeMenu}
            >
              {scopeOptions.map((option, index) => (
                <button
                  key={option.value}
                  id={`${scopeListId}-${index}`}
                  type="button"
                  role="option"
                  tabIndex={-1}
                  aria-selected={scope === option.value}
                  data-active={activeScope === index || undefined}
                  className={styles.scopeOption}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => chooseScope(option.value)}
                >
                  <span>{option.label}</span>
                  {scope === option.value && (
                    <Check size={16} aria-hidden="true" />
                  )}
                </button>
              ))}
              {!scopeOptions.length && (
                <div className={styles.scopeEmpty} role="status">
                  {t.operations.empty}
                </div>
              )}
            </div>
          )}
        </div>
        <Field label={t.operations.start}>
          <input
            type="date"
            value={startDate}
            onChange={(event) => {
              const value = event.target.value;
              setStartDate(value);
              if (endDate && value > endDate) setEndDate(value);
            }}
          />
        </Field>
        <Field label={t.operations.end}>
          <input
            type="date"
            value={endDate}
            min={startDate || undefined}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </Field>
      </div>
      <div className={styles.results}>
        <AsyncSection state={state} emptyMessage={l.noIncidents}>
          {() => (
            <Table
              caption={l.incidentHistory}
              rows={rows}
              getRowId={(incident) => incident.incidentId}
              mobile="scroll"
              columns={[
                {
                  id: "reason",
                  header: t.operations.reason,
                  rowHeader: true,
                  cell: (incident) => (
                    <span className={styles.reason}>{incident.reason}</span>
                  ),
                },
                {
                  id: "scope",
                  header: l.incidentScope,
                  cell: (incident) =>
                    incident.scope === "CENTER"
                      ? t.incidentHistory.wholeCenter
                      : (incident.roomName ?? t.operations.room),
                },
                {
                  id: "startAtUtc",
                  header: t.operations.start,
                  cell: (incident) => formatDateTime(incident.startAtUtc),
                },
                {
                  id: "endAtUtc",
                  header: t.operations.end,
                  cell: (incident) => formatDateTime(incident.endAtUtc),
                },
              ]}
              rowActions={(incident) => (
                <Link
                  className="btn btn--secondary btn--sm"
                  href={`/manager/incidents/${incident.incidentId}`}
                >
                  {t.operations.details}
                </Link>
              )}
              empty={{ title: l.noIncidents }}
            />
          )}
        </AsyncSection>
      </div>
    </div>
  );
}
