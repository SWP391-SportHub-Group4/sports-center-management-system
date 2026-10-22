"use client";
import { LockedCoachAssignments } from "./locked-coach-assignments";
import { RemoveMemberAvatarButton } from "@/components/RemoveMemberAvatarButton";
import { PersonProfileHeader } from "@/components/PersonProfileHeader";
import profileStyles from "@/components/PersonProfile.module.css";
import { ChevronRight } from "lucide-react";
import { api } from "@/lib/apiClient";
import type { Paged, ManagerCourseDto } from "@/lib/types";
import { useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { choiceQuery, useUrlQuery } from "@/lib/useUrlQuery";
import { AsyncSection, StatusChip, Pager } from "@/components/ui";
import { Tabs } from "@/components/primitives";
import { catalogApi } from "@/features/catalog";
import { CoachEditor } from "./coach-editor";
import { ManagerSchedule } from "@/features/manager";
import type { CoachAdminDto } from "@/lib/types";
export function CoachDetail({ userId }: { userId: string }) {
  const { t } = useLanguage();
  const m = t.managerOperations;
  const [editing, setEditing] = useState(false);
  const { values, setValues } = useUrlQuery(
    { tab: "overview" },
    { tab: choiceQuery(["overview", "classes", "schedule"], "overview") },
  );
  const state = useApi(
    (signal) =>
      api.get<CoachAdminDto>(`/api/manager/coaches/${userId}`, { signal }),
    [userId],
  );
  const [classPage, setClassPage] = useState(1);
  const classes = useApi(
    (signal) =>
      api.get<Paged<ManagerCourseDto>>("/api/manager/classes", {
        signal,
        query: { coachId: userId, page: classPage, pageSize: 20 },
      }),
    [userId, classPage],
  );
  return (
    <div className={profileStyles.page}>
      <Link href="/manager/people?role=Coach" className="btn btn--ghost">
        {m.backToList}
      </Link>
      <AsyncSection state={state}>
        {(coach) => (
          <>
            <PersonProfileHeader
              name={coach.fullName}
              avatarUrl={coach.avatarUrl}
              status={<StatusChip value={coach.status} />}
              contact={
                <p>
                  {coach.email} · {coach.phone ?? "—"}
                </p>
              }
              actions={
                <>
                  <button
                    className="btn btn--secondary"
                    onClick={() => setEditing(true)}
                  >
                    {t.operations.edit}
                  </button>
                  {coach.avatarUrl && (
                    <RemoveMemberAvatarButton
                      memberId={coach.userId}
                      memberName={coach.fullName}
                      onRemoved={state.reload}
                    />
                  )}
                </>
              }
            />
            <div className={profileStyles.tabs}>
              <Tabs
                value={values.tab}
                onChange={(tab) => setValues({ tab })}
                ariaLabel={m.coachDetail}
                tabs={[
                  { id: "overview", label: m.overviewTab },
                  { id: "classes", label: "Assigned classes" },
                  { id: "schedule", label: m.assignedSchedule },
                ]}
              >
                {values.tab === "overview" && (
                  <section
                    className={`${profileStyles.surface} ${profileStyles.overview}`}
                  >
                    <h2>{m.coachDetail}</h2>
                    <p className={profileStyles.bio}>{coach.bio || "—"}</p>
                    <CoachSpecialties coach={coach} />
                    {coach.status !== "ACTIVE" && (
                      <LockedCoachAssignments
                        coachId={userId}
                        onChanged={classes.reload}
                      />
                    )}
                  </section>
                )}
                {values.tab === "classes" && (
                  <AsyncSection state={classes}>
                    {(data) => (
                      <div
                        className={`${profileStyles.surface} ${profileStyles.classes}`}
                      >
                        <ul className={profileStyles.classList}>
                          {data.items.map((c) => (
                            <li key={c.classId}>
                              <Link href={`/manager/classes/${c.classId}`}>
                                <span>{c.name}</span>
                                <ChevronRight size={18} aria-hidden="true" />
                              </Link>
                            </li>
                          ))}
                        </ul>
                        <Pager
                          page={data.page}
                          pageSize={data.pageSize}
                          totalCount={data.totalCount}
                          onChange={setClassPage}
                        />
                      </div>
                    )}
                  </AsyncSection>
                )}
                {values.tab === "schedule" && (
                  <ManagerSchedule coachId={coach.userId} />
                )}
              </Tabs>
            </div>
            {editing && (
              <CoachEditor
                coach={coach}
                onClose={() => setEditing(false)}
                onSaved={() => {
                  setEditing(false);
                  state.reload();
                }}
              />
            )}
          </>
        )}
      </AsyncSection>
    </div>
  );
}
function CoachSpecialties({ coach }: { coach: CoachAdminDto }) {
  const { t } = useLanguage();
  const state = useApi((signal) => catalogApi.sports(signal, true), []);
  return (
    <AsyncSection state={state}>
      {(sports) => (
        <p className={profileStyles.specialties}>
          <strong>{t.operations.specialties}:</strong>{" "}
          {coach.sportIds
            .map(
              (id) =>
                sports.find((s) => s.sportId === id)?.name ??
                t.managerAudit.nameUnavailable,
            )
            .join(", ")}
        </p>
      )}
    </AsyncSection>
  );
}
