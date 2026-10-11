"use client";

import { useState } from "react";

import { AsyncSection, Card, Field, Pager, StatusChip } from "@/components/ui";

import { api } from "@/lib/apiClient";

import { useApi } from "@/lib/useApi";

import { useLanguage } from "@/lib/language";

import { formatDateTime } from "@/lib/format";

import { pagedItems } from "@/lib/paged";

import { MutationFeedback, useMutation } from "@/features/operations";

import type { PtSessionDto, WorkoutResultDto } from "@/lib/types";

import { ptApi } from "./api";

import { ListPager } from "./ui";

import { PtMemberSelect } from "./member-select";

export function WorkoutResultForm({
  session,
  result,
  onSaved,
  compact = false,
}: {
  compact?: boolean;
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

        const ok = await mutation.run(() =>
          api.put(`/api/workout-results/${session.sessionId}`, {
            ptSessionId: session.sessionId,

            progressNote: note.trim() || null,

            coachComment: comment.trim() || null,
          }),
        );

        if (ok) {
          onSaved();
        }
      }}
    >
      {!compact && (
        <p>
          {session.memberName}
          {" · "}
          {formatDateTime(session.startAtUtc)}
        </p>
      )}

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
        type="submit"
        className="btn"
        disabled={mutation.busy || session.status !== "COMPLETED"}
      >
        {l.save}
      </button>
    </form>
  );
}

export function ResultEditor({
  session,
  reload,
  compact = false,
}: {
  session: PtSessionDto;
  reload: () => void;
  compact?: boolean;
}) {
  const results = useApi(
    async (signal) => {
      for (let page = 1; ; page++) {
        const rows = await api.get<WorkoutResultDto[]>(
          "/api/coaches/me/workout-results",
          {
            signal,
            query: {
              memberId: session.memberId,
              page,
              pageSize: 100,
            },
          },
        );

        const found = rows.find(
          (result) => result.ptSessionId === session.sessionId,
        );

        if (found || rows.length < 100) {
          return {
            result: found,
          };
        }
      }
    },
    [session.sessionId, session.memberId],
  );

  return (
    <AsyncSection state={results}>
      {(data) => (
        <WorkoutResultForm
          compact={compact}
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
  initialMemberId = "",
}: {
  initialSessionId?: string;
  initialMemberId?: string;
}) {
  const { t } = useLanguage();

  const l = t.staffWork;

  const [page, setPage] = useState(1);

  const [selected, setSelected] = useState<PtSessionDto | null>(null);

  const [member, setMember] = useState(initialMemberId);

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
            `/api/coaches/me/pt-sessions/${encodeURIComponent(
              initialSessionId,
            )}`,
            {
              signal,
            },
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
          {(rows) => {
            const visibleRows = initialMemberId
              ? rows.filter((session) => session.memberId === initialMemberId)
              : rows;

            return (
              <>
                <Field label={l.session}>
                  <select
                    value={active?.sessionId ?? ""}
                    onChange={(e) =>
                      setSelected(
                        visibleRows.find(
                          (session) => session.sessionId === e.target.value,
                        ) ?? null,
                      )
                    }
                  >
                    <option value="">—</option>

                    {active &&
                      !visibleRows.some(
                        (session) => session.sessionId === active.sessionId,
                      ) && (
                        <option value={active.sessionId}>
                          {active.memberName}
                          {" · "}
                          {formatDateTime(active.startAtUtc)}
                        </option>
                      )}

                    {visibleRows.map((session) => (
                      <option key={session.sessionId} value={session.sessionId}>
                        {session.memberName}
                        {" · "}
                        {formatDateTime(session.startAtUtc)}
                      </option>
                    ))}
                  </select>
                </Field>

                <ListPager page={page} count={rows.length} onChange={setPage} />
              </>
            );
          }}
        </AsyncSection>

        {initialSessionId && initial.error && (
          <AsyncSection state={initial}>{() => null}</AsyncSection>
        )}

        {active?.status === "COMPLETED" && (
          <ResultEditor
            key={active.sessionId}
            session={active}
            reload={() => setRevision((value) => value + 1)}
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
                {pagedItems(data).map((result) => (
                  <article key={result.ptSessionId}>
                    <h3>{formatDateTime(result.startAtUtc)}</h3>

                    <StatusChip value={result.sessionStatus} />

                    {result.progressNote && <p>{result.progressNote}</p>}

                    {result.coachComment && <p>{result.coachComment}</p>}

                    {!result.progressNote && !result.coachComment && (
                      <p className="muted">{t.common.noData}</p>
                    )}
                  </article>
                ))}

                {!pagedItems(data).length && <p>{t.common.noData}</p>}

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
