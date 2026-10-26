"use client";

import { useState } from "react";
import { api } from "@/lib/apiClient";
import { useApi, useNow } from "@/lib/useApi";
import type { CourseRosterDto } from "@/lib/types";

export function ReceptionistInlineAttendance({ sessionId }: { sessionId: string }) {
  const now = useNow();
  const roster = useApi(
    (signal) => api.get<CourseRosterDto>(`/api/class-sessions/${sessionId}/roster`, { signal }),
    [sessionId],
  );
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const inWindow = !!roster.data &&
    now >= Date.parse(roster.data.attendanceOpensAtUtc) &&
    now <= Date.parse(roster.data.attendanceClosesAtUtc);

  async function mark(enrollmentId: string, status: "PRESENT" | "ABSENT") {
    setBusyId(enrollmentId);
    setError("");
    try {
      await api.put(`/api/class-sessions/${sessionId}/attendance/${enrollmentId}`, { status });
      roster.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Attendance could not be updated.");
    } finally {
      setBusyId("");
    }
  }

  const members = (roster.data?.entries ?? []).filter((entry) => entry.enrollmentStatus === "CONFIRMED");
  return (
    <section aria-label="Class attendance">
      <h4>Enrolled members · {members.length}</h4>
      {roster.loading && <p>Loading class roster…</p>}
      {roster.error && <p role="alert">{roster.error.message}</p>}
      {roster.data && !inWindow && (
        <p role="status">Attendance editing is unavailable outside the permitted attendance window.</p>
      )}
      {error && <p role="alert">{error}</p>}
      {members.map((entry) => (
        <div key={entry.enrollmentId} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, padding: 10, borderBottom: "1px solid var(--line)" }}>
          <strong style={{ flex: "1 1 150px" }}>{entry.memberName}</strong>
          <span>{entry.attendanceStatus ?? "UNMARKED"}</span>
          <button type="button" className="btn btn--secondary btn--sm"
            disabled={!inWindow || !!busyId || entry.attendanceStatus === "PRESENT"}
            onClick={() => void mark(entry.enrollmentId, "PRESENT")}>Check in</button>
          <button type="button" className="btn btn--secondary btn--sm"
            disabled={!inWindow || !!busyId || entry.attendanceStatus === "ABSENT"}
            onClick={() => void mark(entry.enrollmentId, "ABSENT")}>Mark absent</button>
        </div>
      ))}
      {roster.data && members.length === 0 && <p>No confirmed members for this class.</p>}
    </section>
  );
}
