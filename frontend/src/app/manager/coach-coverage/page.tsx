"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { formatDateTime } from "@/lib/format";
import { AsyncSection, Card } from "@/components/ui";
import { CoachSelector } from "@/features/coaches";

interface CoverageSession {
  sessionId: string;
  classId: number;
  startAtUtc: string;
}

interface CoverageItem {
  coachId: string;
  coachName: string;
  coachEmail: string;
  affectedClasses: number;
  futureSessions: number;
  activeRelationships: number;
  mainClasses: { classId: number; name: string; sportId: number }[];
  sessions: CoverageSession[];
}

function MainCoachAssignment({ coachId, cls, onDone }: {
  coachId: string;
  cls: CoverageItem["mainClasses"][number];
  onDone: () => void;
}) {
  const [replacementCoachId, setReplacementCoachId] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <li>
      <Link href={`/manager/classes/${cls.classId}`}>{cls.name} (#{cls.classId})</Link>
      <form onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        try {
          await api.post(`/api/manager/coach-coverage/${coachId}/classes/${cls.classId}/reassign-main`,
            { replacementCoachId, reason });
          onDone();
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : "Could not change the main coach.");
        } finally {
          setBusy(false);
        }
      }}>
        <CoachSelector sportId={cls.sportId} value={replacementCoachId} onChange={setReplacementCoachId} />
        <label>Reason <input required minLength={3} maxLength={500} value={reason}
          onChange={(event) => setReason(event.target.value)} /></label>
        <button className="btn btn--secondary" disabled={busy || !replacementCoachId} type="submit">
          Reassign main coach
        </button>
        {error && <p role="alert">{error}</p>}
      </form>
    </li>
  );
}

export default function CoachCoveragePage() {
  const coverage = useApi(
    (signal) => api.get<CoverageItem[]>("/api/manager/coach-coverage", { signal }),
    [],
  );
  return (
    <main className="stack">
      <h1>Coach coverage required</h1>
      <p>
        Locked coaches cannot teach. Assign an eligible replacement to each future
        session, or reschedule or cancel the session with a makeup. Review active
        coaching relationships as well. This list updates when assignments are resolved.
      </p>
      <button className="btn btn--secondary" onClick={coverage.reload}>
        Refresh coverage
      </button>
      <AsyncSection state={coverage}>
        {(items) =>
          items.length === 0 ? (
            <p role="status">No locked coaches have unfinished classes, future sessions or active coaching relationships.</p>
          ) : (
            <div className="stack">
              {items.map((item) => (
                <Card key={item.coachId} title={item.coachName}>
                  <p>{item.coachEmail}</p>
                  <p>
                    {item.affectedClasses} affected classes · {item.futureSessions} future
                    sessions · {item.activeRelationships} active coaching relationships
                  </p>
                  <ul>
                    {item.mainClasses.map((cls) => (
                      <MainCoachAssignment key={`class-${cls.classId}`} coachId={item.coachId}
                        cls={cls} onDone={coverage.reload} />
                    ))}
                    {item.sessions.map((session) => (
                      <li key={session.sessionId}>
                        <Link href={`/manager/classes/${session.classId}`}>
                          Class #{session.classId}, session {formatDateTime(session.startAtUtc)}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <Link href="/manager/coaches">Review coaching relationships</Link>
                </Card>
              ))}
            </div>
          )
        }
      </AsyncSection>
    </main>
  );
}
