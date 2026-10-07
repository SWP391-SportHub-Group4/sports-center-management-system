"use client";

import { useState } from "react";
import Link from "next/link";

import {
  AsyncSection,
  Card,
  Field,
  Stat,
  StatusChip,
  Table,
} from "@/components/ui";

import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import {
  addDaysIso,
  formatDate,
  formatDateTime,
  todayIso,
} from "@/lib/format";

import { courtScheduleApi } from "@/features/court-schedule/api";
import { catalogApi } from "@/features/catalog";

import { ptApi } from "./api";
import {
  ListPager,
  Specialty,
} from "./ui";

function Roster({
  id,
}: {
  id: string;
}) {
  const { t } = useLanguage();

  const state = useApi(
    (signal) =>
      ptApi.roster(
        id,
        signal,
      ),
    [id],
  );

  return (
    <AsyncSection state={state}>
      {(data) => (
        <Table
          headers={[
            t.staffWork.member,
            t.staffWork.status,
            t.staffWork.time,
          ]}
        >
          {data.entries.map(
            (row) => (
              <tr
                key={
                  row.enrollmentId
                }
              >
                <td>
                  {row.memberName}
                </td>

                <td>
                  <StatusChip
                    value={
                      row.attendanceStatus ??
                      row.enrollmentStatus
                    }
                  />
                </td>

                <td>
                  {row.attendanceRecordedAt
                    ? formatDateTime(
                        row.attendanceRecordedAt,
                      )
                    : "—"}
                </td>
              </tr>
            ),
          )}
        </Table>
      )}
    </AsyncSection>
  );
}

export function CoachClassDetail({
  classId,
}: {
  classId: number;
}) {
  const { t } = useLanguage();

  const [session, setSession] =
    useState("");

  const state = useApi(
    (signal) =>
      ptApi.classSessions(
        classId,
        signal,
      ),
    [classId],
  );

  return (
    <Card
      title={
        t.staffWork.attendance
      }
      hint={
        t.staffWork.readOnly
      }
    >
      <AsyncSection state={state}>
        {(rows) => (
          <>
            <Field
              label={
                t.staffWork.sessions
              }
            >
              <select
                value={session}
                onChange={(e) =>
                  setSession(
                    e.target.value,
                  )
                }
              >
                <option value="">
                  —
                </option>

                {rows.map(
                  (row) => (
                    <option
                      key={
                        row.sessionId
                      }
                      value={
                        row.sessionId
                      }
                    >
                      {formatDateTime(
                        row.startAtUtc,
                      )}{" "}
                      ·{" "}
                      {
                        row.roomName
                      }{" "}
                      ·{" "}
                      {
                        row.coachName
                      }
                    </option>
                  ),
                )}
              </select>
            </Field>

            {rows.map(
              (row) => (
                <p
                  key={
                    row.sessionId
                  }
                >
                  {formatDateTime(
                    row.startAtUtc,
                  )}{" "}
                  –{" "}
                  {formatDateTime(
                    row.endAtUtc,
                  )}{" "}
                  ·{" "}
                  {
                    row.roomName
                  }{" "}
                  ·{" "}
                  {
                    row.coachName
                  }{" "}
                  ·{" "}
                  <StatusChip
                    value={
                      row.status
                    }
                  />
                </p>
              ),
            )}

            {!rows.length && (
              <p>
                {
                  t.common
                    .noData
                }
              </p>
            )}

            {session &&
              rows.some(
                (row) =>
                  row.sessionId ===
                  session,
              ) && (
                <Roster
                  key={session}
                  id={session}
                />
              )}
          </>
        )}
      </AsyncSection>
    </Card>
  );
}

export function CoachClasses() {
  const { t } = useLanguage();

  const state = useApi(
    ptApi.classes,
    [],
  );

  return (
    <Card
      title={
        t.staffWork.classes
      }
    >
      <AsyncSection
        state={state}
        isEmpty={(rows) =>
          !rows.length
        }
        emptyMessage={
          t.common.noData
        }
      >
        {(rows) => (
          <Table
            headers={[
              t.staffWork.title,
              t.staffWork.sport,
              t.staffWork.status,
              t.staffWork.actions,
            ]}
          >
            {rows.map(
              (course) => (
                <tr
                  key={
                    course.classId
                  }
                >
                  <td>
                    {
                      course.name
                    }
                  </td>

                  <td>
                    {
                      course.sportName
                    }
                  </td>

                  <td>
                    <StatusChip
                      value={
                        course.status
                      }
                    />
                  </td>

                  <td>
                    <Link
                      className="btn btn--secondary"
                      href={`/coach/classes/${course.classId}`}
                    >
                      {
                        t.staffWork
                          .attendance
                      }
                    </Link>
                  </td>
                </tr>
              ),
            )}
          </Table>
        )}
      </AsyncSection>
    </Card>
  );
}

function Relationships() {
  const { t } = useLanguage();

  const [page, setPage] =
    useState(1);

  const state = useApi(
    (signal) =>
      ptApi.relationships(
        page,
        signal,
        true,
      ),
    [page],
  );

  return (
    <Card
      title={
        t.staffWork
          .relationships
      }
    >
      <AsyncSection
        state={state}
        emptyMessage={
          t.common.noData
        }
      >
        {(rows) => (
          <>
            <Table
              headers={[
                t.staffWork.member,
                t.staffWork.status,
                t.staffWork.actions,
              ]}
            >
              {rows.map(
                (relationship) => (
                  <tr
                    key={
                      relationship.relationshipId
                    }
                  >
                    <td>
                      {
                        relationship.memberName
                      }
                    </td>

                    <td>
                      <StatusChip
                        value={
                          relationship.status
                        }
                      />
                    </td>

                    <td>
                      {relationship.status ===
                        "ACTIVE" && (
                        <Link
                          className="btn btn--secondary"
                          href={`/coach/members/${relationship.memberId}`}
                        >
                          {
                            t.coach
                              .members
                              .viewProfileBtn
                          }
                        </Link>
                      )}
                    </td>
                  </tr>
                ),
              )}
            </Table>

            {!rows.length && (
              <p>
                {
                  t.common
                    .noData
                }
              </p>
            )}

            <ListPager
              page={page}
              count={
                rows.length
              }
              onChange={
                setPage
              }
            />
          </>
        )}
      </AsyncSection>
    </Card>
  );
}

function MembersTabs({
  hasPt,
}: {
  hasPt: boolean;
}) {
  const { t } = useLanguage();

  const [tab, setTab] =
    useState(false);

  return (
    <>
      <div className="btn-row">
        <button
          type="button"
          className="btn btn--secondary"
          aria-pressed={!tab}
          onClick={() =>
            setTab(false)
          }
        >
          {
            t.staffWork
              .classes
          }
        </button>

        {hasPt && (
          <button
            type="button"
            className="btn btn--secondary"
            aria-pressed={
              tab
            }
            onClick={() =>
              setTab(true)
            }
          >
            {
              t.staffWork
                .relationships
            }
          </button>
        )}
      </div>

      {tab && hasPt ? (
        <Relationships />
      ) : (
        <CoachClasses />
      )}
    </>
  );
}

export function CoachMembers() {
  return (
    <Specialty>
      {(hasPt) => (
        <MembersTabs
          hasPt={hasPt}
        />
      )}
    </Specialty>
  );
}

function CoachDashboard({
  hasPt,
}: {
  hasPt: boolean;
}) {
  const { t } = useLanguage();

  const today = todayIso();
  const until =
    addDaysIso(
      today,
      6,
    );

  const schedule = useApi(
    (signal) =>
      courtScheduleApi.list(
        today,
        until,
        "",
        true,
        signal,
        hasPt,
      ),
    [
      today,
      until,
      hasPt,
    ],
  );

  const rooms = useApi(
    (signal) =>
      catalogApi.rooms(
        signal,
      ),
    [],
  );

  const relationships =
    useApi(
      (signal) =>
        hasPt
          ? ptApi.relationships(
              1,
              signal,
              true,
            )
          : Promise.resolve(
              [],
            ),
      [hasPt],
    );

  const ptSessions =
    useApi(
      (signal) =>
        hasPt
          ? ptApi.sessions(
              false,
              1,
              signal,
            )
          : Promise.resolve(
              [],
            ),
      [hasPt],
    );

  function vietnamDate(
    value: string,
  ) {
    return new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          "Asia/Ho_Chi_Minh",
      },
    ).format(
      new Date(value),
    );
  }

  return (
    <div className="stack">
      <AsyncSection
        state={schedule}
      >
        {(rows) => {
          const todayRows =
            rows.filter(
              (entry) =>
                vietnamDate(
                  entry.startAtUtc,
                ) === today,
            );

          return (
            <div className="stats-grid">
              <Stat
                label={
                  t.coach
                    .dashboard
                    .statTodayLessons
                }
                value={
                  todayRows.length
                }
              />

              <Stat
                label={
                  t.coach
                    .dashboard
                    .statUpcomingLessons
                }
                value={
                  rows.length
                }
              />

              {hasPt && (
                <AsyncSection
                  state={
                    relationships
                  }
                >
                  {(
                    members,
                  ) => (
                    <Stat
                      label={
                        t.coach
                          .dashboard
                          .statAssignedMembers
                      }
                      value={
                        members.length
                      }
                      hint={
                        t.coach
                          .dashboard
                          .statAssignedMembersHint
                      }
                    />
                  )}
                </AsyncSection>
              )}

              {hasPt && (
                <AsyncSection
                  state={
                    ptSessions
                  }
                >
                  {(
                    sessions,
                  ) => {
                    const pending =
                      sessions.filter(
                        (
                          session,
                        ) =>
                          [
                            "SCHEDULED",
                            "RESCHEDULED",
                          ].includes(
                            session.status,
                          ) &&
                          new Date(
                            session.endAtUtc,
                          ).getTime() <
                            Date.now(),
                      );

                    return (
                      <Stat
                        label={
                          t.staffWork
                            .results
                        }
                        value={
                          pending.length
                        }
                        hint={
                          t.staffWork
                            .complete
                        }
                      />
                    );
                  }}
                </AsyncSection>
              )}
            </div>
          );
        }}
      </AsyncSection>

      <Card
        title={
          t.coach
            .dashboard
            .scheduleTableTitle
        }
        actions={
          <Link
            className="btn btn--secondary"
            href="/coach/schedule"
          >
            {
              t.navigation
                .items
                .teachingSchedule
            }
          </Link>
        }
      >
        <AsyncSection
          state={schedule}
          isEmpty={(rows) =>
            !rows.length
          }
          emptyMessage={
            t.coach
              .dashboard
              .scheduleTableEmpty
          }
        >
          {(rows) => (
            <AsyncSection
              state={rooms}
            >
              {(
                roomRows,
              ) => (
                <Table
                  headers={[
                    t.coach
                      .dashboard
                      .columnClass,
                    t.coach
                      .dashboard
                      .columnTime,
                    t.coach
                      .dashboard
                      .columnRoom,
                    t.coach
                      .dashboard
                      .columnStatus,
                    t.staffWork
                      .actions,
                  ]}
                >
                  {rows
                    .slice(
                      0,
                      8,
                    )
                    .map(
                      (
                        entry,
                      ) => {
                        const room =
                          roomRows.find(
                            (
                              item,
                            ) =>
                              item.roomId ===
                              entry.roomId,
                          );

                        return (
                          <tr
                            key={`${entry.sourceType}-${entry.sourceId}`}
                          >
                            <td>
                              {
                                entry.title
                              }
                            </td>

                            <td>
                              {formatDateTime(
                                entry.startAtUtc,
                              )}
                            </td>

                            <td>
                              {
                                room?.name ??
                                "—"
                              }
                            </td>

                            <td>
                              <StatusChip
                                value={
                                  entry.status
                                }
                              />
                            </td>

                            <td>
                              {entry.sourceType ===
                                "CLASS_SESSION" &&
                              entry.classId ? (
                                <Link
                                  className="btn btn--secondary"
                                  href={`/coach/classes/${entry.classId}`}
                                >
                                  {
                                    t.staffWork
                                      .attendance
                                  }
                                </Link>
                              ) : entry.sourceType ===
                                "PT_SESSION" ? (
                                <Link
                                  className="btn btn--secondary"
                                  href="/coach/pt-sessions"
                                >
                                  {
                                    t.staffWork
                                      .sessions
                                  }
                                </Link>
                              ) : null}
                            </td>
                          </tr>
                        );
                      },
                    )}
                </Table>
              )}
            </AsyncSection>
          )}
        </AsyncSection>
      </Card>

      {hasPt && (
        <Card
          title={
            t.coach
              .dashboard
              .membersTableTitle
          }
          hint={
            t.coach
              .dashboard
              .membersTableHint
          }
          actions={
            <Link
              className="btn btn--secondary"
              href="/coach/members"
            >
              {
                t.navigation
                  .items
                  .assignedMembers
              }
            </Link>
          }
        >
          <AsyncSection
            state={
              relationships
            }
            isEmpty={(rows) =>
              !rows.length
            }
            emptyMessage={
              t.coach
                .dashboard
                .membersTableEmpty
            }
          >
            {(rows) => (
              <Table
                headers={[
                  t.coach
                    .dashboard
                    .columnMember,
                  t.coach
                    .dashboard
                    .columnSource,
                  t.coach
                    .dashboard
                    .columnStart,
                  t.staffWork
                    .actions,
                ]}
              >
                {rows
                  .slice(
                    0,
                    6,
                  )
                  .map(
                    (
                      relationship,
                    ) => (
                      <tr
                        key={
                          relationship.relationshipId
                        }
                      >
                        <td>
                          {
                            relationship.memberName
                          }
                        </td>

                        <td>
                          {
                            relationship.sourceType
                          }
                        </td>

                        <td>
                          {formatDate(
                            relationship.startedAt,
                          )}
                        </td>

                        <td>
                          <Link
                            className="btn btn--secondary"
                            href={`/coach/members/${relationship.memberId}`}
                          >
                            {
                              t.coach
                                .members
                                .viewProfileBtn
                            }
                          </Link>
                        </td>
                      </tr>
                    ),
                  )}
              </Table>
            )}
          </AsyncSection>
        </Card>
      )}

      <Card
        title={
          t.staffWork
            .actions
        }
      >
        <div className="btn-row">
          <Link
            className="btn btn--secondary"
            href="/coach/schedule"
          >
            {
              t.navigation
                .items
                .teachingSchedule
            }
          </Link>

          <Link
            className="btn btn--secondary"
            href="/coach/classes"
          >
            {
              t.staffWork
                .classes
            }
          </Link>

          {hasPt && (
            <>
              <Link
                className="btn btn--secondary"
                href="/coach/members"
              >
                {
                  t.navigation
                    .items
                    .assignedMembers
                }
              </Link>

              <Link
                className="btn btn--secondary"
                href="/coach/progress"
              >
                {
                  t.coach
                    .dashboard
                    .quickWriteResults
                }
              </Link>

              <Link
                className="btn btn--secondary"
                href="/coach/training-plans"
              >
                {
                  t.coach
                    .dashboard
                    .quickEditPlans
                }
              </Link>

              <Link
                className="btn btn--secondary"
                href="/coach/homework"
              >
                {
                  t.staffWork
                    .homework
                }
              </Link>

              <Link
                className="btn btn--secondary"
                href="/coach/pt-sessions"
              >
                {
                  t.staffWork
                    .sessions
                }
              </Link>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

export function CoachOverview() {
  return (
    <Specialty>
      {(hasPt) => (
        <CoachDashboard
          hasPt={hasPt}
        />
      )}
    </Specialty>
  );
}