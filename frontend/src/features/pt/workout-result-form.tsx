"use client";
import { pagedItems } from "@/lib/paged";
import { useState } from "react";
import { AsyncSection, Card, Field, Pager, StatusChip } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime } from "@/lib/format";
import { MutationFeedback, useMutation } from "@/features/operations";
import type { PtSessionDto, WorkoutResultDto } from "@/lib/types";
import { ptApi } from "./api";
import { ListPager } from "./ui";
import { PtMemberSelect } from "./member-select";

export function WorkoutResultForm({
  session,
  result,
  onSaved,
}: {
  session: PtSessionDto;
  result?: WorkoutResultDto;
  onSaved: () => void;
}) {
  const { t } = useLanguage();
  const l = t.staffWork;
  const mutation = useMutation();
  const [note, setNote] = useState(result?.progressNote ?? "");
  const [comment, setComment] = useState(result?.coachComment ?? "");
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (
          await mutation.run(() =>
            api.put(`/api/workout-results/${session.sessionId}`, {
              ptSessionId: session.sessionId,
              progressNote: note.trim() || null,
              coachComment: comment.trim() || null,
            }),
          )
        )
          onSaved();
      }}
    >
      <p>
        {session.memberName} · {formatDateTime(session.startAtUtc)}
      </p>
      <Field label={l.progressNote}>
        <textarea
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <Field label={l.coachComment}>
        <textarea
          maxLength={2000}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </Field>
      <MutationFeedback mutation={mutation} />
      <button
        className="btn"
        disabled={mutation.busy || session.status !== "COMPLETED"}
      >
        {l.save}
      </button>
    </form>
  );
}
function ResultEditor({
  session,
  reload,
}: {
  session: PtSessionDto;
  reload: () => void;
}) {
  // Timeline is scoped to the member and coach; find the session through the paginated result API.
  const results = useApi(
    async (signal) => {
      for (let page = 1; ; page++) {
        const rows = await api.get<WorkoutResultDto[]>(
          "/api/coaches/me/workout-results",
          {
            signal,
            query: { memberId: session.memberId, page, pageSize: 100 },
          },
        );
        const found = rows.find((r) => r.ptSessionId === session.sessionId);
        if (found || rows.length < 100) return { result: found };
      }
    },
    [session.sessionId, session.memberId],
  );
  return (
    <AsyncSection state={results}>
      {(data) => (
        <WorkoutResultForm
          session={session}
          result={data.result}
          onSaved={() => {
            results.reload();
            reload();
          }}
        />
      )}
    </AsyncSection>
  );
}
export function CoachProgress({
  initialSessionId = "",
}: {
  initialSessionId?: string;
}) {
  const { t } = useLanguage();
  const l = t.staffWork;
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<PtSessionDto | null>(null);
  const [member, setMember] = useState("");
  const [timelinePage, setTimelinePage] = useState(1);
  const [revision, setRevision] = useState(0);
  const sessions = useApi(
    (signal) => ptApi.sessions(false, page, signal, "COMPLETED"),
    [page],
  );
  const initial = useApi(
    (signal) =>
      initialSessionId
        ? api.get<PtSessionDto>(
            `/api/coaches/me/pt-sessions/${encodeURIComponent(initialSessionId)}`,
            { signal },
          )
        : Promise.resolve(null),
    [initialSessionId],
  );
  const timeline = useApi(
    (signal) =>
      member
        ? ptApi.progress(member, timelinePage, signal)
        : Promise.resolve(null),
    [member, timelinePage, revision],
  );
  const active = selected ?? initial.data;
  return (
    <>
      <Card title={l.results}>
        <AsyncSection state={sessions}>
          {(rows) => (
            <>
              <Field label={l.session}>
                <select
                  value={active?.sessionId ?? ""}
                  onChange={(e) =>
                    setSelected(
                      rows.find((s) => s.sessionId === e.target.value) ?? null,
                    )
                  }
                >
                  <option value="">—</option>
                  {active &&
                    !rows.some((s) => s.sessionId === active.sessionId) && (
                      <option value={active.sessionId}>
                        {active.memberName} ·{" "}
                        {formatDateTime(active.startAtUtc)}
                      </option>
                    )}
                  {rows.map((s) => (
                    <option key={s.sessionId} value={s.sessionId}>
                      {s.memberName} · {formatDateTime(s.startAtUtc)}
                    </option>
                  ))}
                </select>
              </Field>
              <ListPager page={page} count={rows.length} onChange={setPage} />
            </>
          )}
        </AsyncSection>
        {initialSessionId && initial.error && (
          <AsyncSection state={initial}>{() => null}</AsyncSection>
        )}
        {active?.status === "COMPLETED" && (
          <ResultEditor
            key={active.sessionId}
            session={active}
            reload={() => setRevision((r) => r + 1)}
          />
        )}
      </Card>
      <Card title={l.timeline}>
        <PtMemberSelect
          value={member}
          onChange={(id) => {
            setMember(id);
            setTimelinePage(1);
          }}
        />
        {member && (
          <AsyncSection state={timeline}>
            {(data) => (
              <>
                {pagedItems(data).map((r) => (
                  <article key={r.ptSessionId}>
                    <h3>{formatDateTime(r.startAtUtc)}</h3>
                    <StatusChip value={r.sessionStatus} />
                    <p>{r.progressNote}</p>
                    <p>{r.coachComment}</p>
                  </article>
                ))}
                <Pager
                  page={data.page}
                  pageSize={data.pageSize}
                  totalCount={data.totalCount}
                  onChange={setTimelinePage}
                />
              </>
            )}
          </AsyncSection>
        )}
      </Card>
    </>
  );
}
