"use client";
import { useState } from "react";
import { api } from "@/lib/apiClient";
import { useAuth } from "@/lib/auth";
import { useApi, useNow } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { todayIso, formatDateTime } from "@/lib/format";
import {
  AsyncSection,
  Card,
  Field,
  Table,
  StatusChip,
  Dialog,
} from "@/components/ui";
import type { CourtScheduleEntryDto, CourseRosterDto } from "@/lib/types";
export function AttendanceBoard({
  coachOnly,
  initialSessionId,
  initialDate,
}: {
  coachOnly: boolean;
  initialSessionId?: string | null;
  initialDate?: string | null;
  onResultRequested?: (entry: {
    enrollmentId: string;
    memberName: string;
  }) => void;
}) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const l = t.operations;
  const now = useNow();
  const [date, setDate] = useState(initialDate || todayIso());
  const [classId, setClass] = useState("");
  const [sessionId, setSession] = useState(initialSessionId || "");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [bulk, setBulk] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const writable = user?.role === "Receptionist" && !coachOnly;
  const sessions = useApi(
    (s) =>
      api.get<CourtScheduleEntryDto[]>(
        coachOnly
          ? "/api/coaches/me/court-schedule"
          : "/api/manager/court-schedule",
        { signal: s, query: { fromDate: date, toDate: date } },
      ),
    [date, coachOnly],
  );
  const roster = useApi(
    (s) =>
      sessionId
        ? api.get<CourseRosterDto>(`/api/class-sessions/${sessionId}/roster`, {
            signal: s,
          })
        : Promise.resolve(null),
    [sessionId],
  );
  const classes = [
    ...new Map(
      (sessions.data ?? [])
        .filter((r) => r.sourceType === "CLASS_SESSION")
        .map((r) => [r.classId, r]),
    ).values(),
  ];
  const inWindow =
    roster.data &&
    now >= new Date(roster.data.attendanceOpensAtUtc).getTime() &&
    now <= new Date(roster.data.attendanceClosesAtUtc).getTime();
  const rows =
    roster.data?.entries.filter(
      (r) =>
        r.enrollmentStatus === "CONFIRMED" &&
        r.memberName.toLowerCase().includes(search.toLowerCase()),
    ) ?? [];
  async function mark(id: string, status: "PRESENT" | "ABSENT") {
    if (!writable || !sessionId) return;
    const key = `${sessionId}-${id}`;
    setBusy((prev) => ({ ...prev, [key]: true }));
    setErrors((prev) => ({ ...prev, [key]: "" }));
    try {
      await api.put(`/api/class-sessions/${sessionId}/attendance/${id}`, {
        status,
      });
      return true;
    } catch (e) {
      setErrors((prev) => ({ ...prev, [key]: (e as Error).message }));
      return false;
    } finally {
      setBusy((prev) => ({ ...prev, [key]: false }));
    }
  }
  return (
    <Card title={l.attendance}>
      <div className="form-grid">
        <Field label={l.date}>
          <input
            required
            type="date"
            value={date}
            onChange={(e) => {
              if (!e.target.value) return;
              setDate(e.target.value);
              setClass("");
              setSession("");
              setErrors({});
            }}
          />
        </Field>
        <AsyncSection state={sessions}>
          {(data) => (
            <>
              <Field label={l.registration}>
                <select
                  disabled={bulk}
                  value={classId}
                  onChange={(e) => {
                    setClass(e.target.value);
                    setSession("");
                    setErrors({});
                  }}
                >
                  <option value="">—</option>
                  {classes.map((c) => (
                    <option key={c.classId} value={c.classId ?? ""}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={l.sessions}>
                <select
                  disabled={bulk}
                  value={sessionId}
                  onChange={(e) => {
                    setSession(e.target.value);
                    setErrors({});
                  }}
                >
                  <option value="">—</option>
                  {data
                    .filter(
                      (r) =>
                        r.sourceType === "CLASS_SESSION" &&
                        String(r.classId) === classId,
                    )
                    .map((r) => (
                      <option key={r.sourceId} value={r.sourceId}>
                        {formatDateTime(r.startAtUtc)}
                      </option>
                    ))}
                </select>
              </Field>
            </>
          )}
        </AsyncSection>
      </div>
      {!writable && <p>{l.readOnly}</p>}
      {sessionId && (
        <AsyncSection state={roster}>
          {(data) => (
            <>
              <p>
                {l.attendanceWindow}:{" "}
                {formatDateTime(data.attendanceOpensAtUtc)} –{" "}
                {formatDateTime(data.attendanceClosesAtUtc)}
              </p>
              <Field label={l.search}>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </Field>
              <Table headers={[l.member, l.status, ""]}>
                {rows.map((r) => {
                  const key = `${sessionId}-${r.enrollmentId}`;
                  return (
                    <tr key={key}>
                      <td>{r.memberName}</td>
                      <td>
                        <StatusChip value={r.attendanceStatus} />
                      </td>
                      <td>
                        {writable && (
                          <div className="btn-row">
                            {(["PRESENT", "ABSENT"] as const).map((status) => (
                              <button
                                className="btn btn--secondary"
                                key={status}
                                disabled={!inWindow || busy[key] || bulk}
                                onClick={async () => {
                                  if (await mark(r.enrollmentId, status))
                                    roster.reload();
                                }}
                              >
                                {status === "PRESENT" ? l.present : l.absent}
                              </button>
                            ))}
                          </div>
                        )}
                        {errors[key] && <p role="alert">{errors[key]}</p>}
                      </td>
                    </tr>
                  );
                })}
              </Table>
              {!rows.length && <p>{l.empty}</p>}
              {writable && (
                <button
                  className="btn btn--secondary"
                  disabled={
                    !inWindow ||
                    bulk ||
                    !rows.length ||
                    Object.values(busy).some(Boolean)
                  }
                  onClick={() => setConfirmBulk(true)}
                >
                  {l.markAll}
                </button>
              )}
            </>
          )}
        </AsyncSection>
      )}
      {confirmBulk && (
        <Dialog
          title={l.confirm}
          onClose={() => !bulk && setConfirmBulk(false)}
        >
          <p>{l.bulkConfirm}</p>
          <button
            className="btn"
            disabled={bulk}
            onClick={async () => {
              setBulk(true);
              for (const row of rows) await mark(row.enrollmentId, "PRESENT");
              setBulk(false);
              setConfirmBulk(false);
              roster.reload();
            }}
          >
            {l.confirm}
          </button>
        </Dialog>
      )}
    </Card>
  );
}
