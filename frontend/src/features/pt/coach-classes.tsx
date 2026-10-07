"use client";
import { useState } from "react";
import Link from "next/link";
import { AsyncSection, Card, Field, StatusChip, Table } from "@/components/ui";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime } from "@/lib/format";
import { ptApi } from "./api";
import { ListPager, Specialty } from "./ui";
function Roster({ id }: { id: string }) {
  const { t } = useLanguage();
  const state = useApi((signal) => ptApi.roster(id, signal), [id]);
  return (
    <AsyncSection state={state}>
      {(data) => (
        <Table
          headers={[t.staffWork.member, t.staffWork.status, t.staffWork.time]}
        >
          {data.entries.map((r) => (
            <tr key={r.enrollmentId}>
              <td>{r.memberName}</td>
              <td>
                <StatusChip value={r.attendanceStatus ?? r.enrollmentStatus} />
              </td>
              <td>
                {r.attendanceRecordedAt
                  ? formatDateTime(r.attendanceRecordedAt)
                  : "—"}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </AsyncSection>
  );
}
export function CoachClassDetail({ classId }: { classId: number }) {
  const { t } = useLanguage();
  const [session, setSession] = useState("");
  const state = useApi(
    (signal) => ptApi.classSessions(classId, signal),
    [classId],
  );
  return (
    <Card title={t.staffWork.attendance} hint={t.staffWork.readOnly}>
      <AsyncSection state={state}>
        {(rows) => (
          <>
            <Field label={t.staffWork.sessions}>
              <select
                value={session}
                onChange={(e) => setSession(e.target.value)}
              >
                <option value="">—</option>
                {rows.map((r) => (
                  <option key={r.sessionId} value={r.sessionId}>
                    {formatDateTime(r.startAtUtc)} · {r.roomName} ·{" "}
                    {r.coachName}
                  </option>
                ))}
              </select>
            </Field>
            {rows.map((r) => (
              <p key={r.sessionId}>
                {formatDateTime(r.startAtUtc)} – {formatDateTime(r.endAtUtc)} ·{" "}
                {r.roomName} · {r.coachName} · <StatusChip value={r.status} />
              </p>
            ))}
            {!rows.length && <p>{t.common.noData}</p>}
            {session && rows.some((s) => s.sessionId === session) && (
              <Roster key={session} id={session} />
            )}
          </>
        )}
      </AsyncSection>
    </Card>
  );
}
export function CoachClasses() {
  const { t } = useLanguage();
  const state = useApi(ptApi.classes, []);
  return (
    <Card title={t.staffWork.classes}>
      <AsyncSection state={state} isEmpty={(r) => !r.length}>
        {(rows) => (
          <Table
            headers={[
              t.staffWork.title,
              t.staffWork.sport,
              t.staffWork.status,
              t.staffWork.actions,
            ]}
          >
            {rows.map((c) => (
              <tr key={c.classId}>
                <td>{c.name}</td>
                <td>{c.sportName}</td>
                <td>
                  <StatusChip value={c.status} />
                </td>
                <td>
                  <Link
                    className="btn btn--secondary"
                    href={`/coach/classes/${c.classId}`}
                  >
                    {t.staffWork.attendance}
                  </Link>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </AsyncSection>
    </Card>
  );
}
function Relationships() {
  const { t } = useLanguage();
  const [page, setPage] = useState(1);
  const state = useApi(
    (signal) => ptApi.relationships(page, signal, false),
    [page],
  );
  return (
    <Card title={t.staffWork.relationships}>
      <AsyncSection state={state}>
        {(rows) => (
          <>
            <Table
              headers={[
                t.staffWork.member,
                t.staffWork.status,
                t.staffWork.actions,
              ]}
            >
              {rows.map((r) => (
                <tr key={r.relationshipId}>
                  <td>
                    {r.memberName} · {r.memberEmail}
                  </td>
                  <td>
                    <StatusChip value={r.status} />
                  </td>
                  <td>
                    {r.status === "ACTIVE" && (
                      <Link href="/coach/training-plans">
                        {t.staffWork.plans}
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
            {!rows.length && <p>{t.common.noData}</p>}
            <ListPager page={page} count={rows.length} onChange={setPage} />
          </>
        )}
      </AsyncSection>
    </Card>
  );
}
function MembersTabs({ hasPt }: { hasPt: boolean }) {
  const { t } = useLanguage();
  const [tab, setTab] = useState(false);
  return (
    <>
      <div className="btn-row">
        <button
          className="btn btn--secondary"
          aria-pressed={!tab}
          onClick={() => setTab(false)}
        >
          {t.staffWork.classes}
        </button>
        {hasPt && (
          <button
            className="btn btn--secondary"
            aria-pressed={tab}
            onClick={() => setTab(true)}
          >
            {t.staffWork.relationships}
          </button>
        )}
      </div>
      {tab && hasPt ? <Relationships /> : <CoachClasses />}
    </>
  );
}
export function CoachMembers() {
  return <Specialty>{(hasPt) => <MembersTabs hasPt={hasPt} />}</Specialty>;
}
export function CoachOverview() {
  const { t } = useLanguage();
  return (
    <>
      <CoachClasses />
      <Specialty>
        {(hasPt) => (
          <Card title={t.staffWork.sessions}>
            <div className="btn-row">
              <Link className="btn btn--secondary" href="/coach/schedule">
                {t.navigation.items.teachingSchedule}
              </Link>
              <Link className="btn btn--secondary" href="/coach/pt-sessions">
                {t.staffWork.sessions}
              </Link>
              {hasPt && (
                <>
                  <Link className="btn btn--secondary" href="/coach/progress">
                    {t.staffWork.results}
                  </Link>
                  <Link className="btn btn--secondary" href="/coach/homework">
                    {t.staffWork.homework}
                  </Link>
                  <Link
                    className="btn btn--secondary"
                    href="/coach/training-plans"
                  >
                    {t.staffWork.plans}
                  </Link>
                </>
              )}
            </div>
          </Card>
        )}
      </Specialty>
    </>
  );
}
