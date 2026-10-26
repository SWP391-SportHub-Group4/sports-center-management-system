"use client";
import { LockedCoachAssignments } from "./locked-coach-assignments";
import { RemoveMemberAvatarButton } from "@/components/RemoveMemberAvatarButton";
import { PersonProfileHeader } from "@/components/PersonProfileHeader";
import profileStyles from "@/components/PersonProfile.module.css";
import overviewStyles from "./coach-overview.module.css";
import { ChevronRight } from "lucide-react";
import { api } from "@/lib/apiClient";
import type { Paged, ManagerCourseDto } from "@/lib/types";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CoachCredentialsShowcase } from "@/components/coach-credentials/coach-credentials";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { choiceQuery, useUrlQuery } from "@/lib/useUrlQuery";
import { AsyncSection, StatusChip, Pager } from "@/components/ui";
import { Tabs } from "@/components/primitives";
import { catalogApi } from "@/features/catalog";
import { CoachEditor } from "./coach-editor";
import { ManagerSchedule } from "@/features/manager";
import type { CoachAdminDto } from "@/lib/types";
export function CoachDetail({
  userId,
  certificatePage = false,
}: {
  userId: string;
  certificatePage?: boolean;
}) {
  const { t } = useLanguage();
  const m = t.managerOperations;
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const { values, setValues } = useUrlQuery(
    { tab: "overview" },
    { tab: choiceQuery(["overview", "classes", "schedule"], "overview") },
  );
  const activeTab = certificatePage ? "certificates" : values.tab;
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
              userId={coach.userId}
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
            <div
              className={`${profileStyles.tabs} ${overviewStyles.coachTabs}`}
            >
              <Tabs
                value={activeTab}
                onChange={(tab) => {
                  if (tab === "certificates")
                    router.push(`/manager/coaches/${userId}/certificates`);
                  else if (certificatePage)
                    router.push(`/manager/coaches/${userId}?tab=${tab}`);
                  else setValues({ tab });
                }}
                ariaLabel={m.coachDetail}
                tabs={[
                  { id: "overview", label: m.overviewTab },
                  { id: "classes", label: "Assigned classes" },
                  { id: "schedule", label: m.assignedSchedule },
                  { id: "certificates", label: "Certificate" },
                ]}
              >
                {activeTab === "overview" && (
                  <div className={overviewStyles.overview}>
                    {coach.status !== "ACTIVE" && (
                      <LockedCoachAssignments
                        coachId={userId}
                        coachName={coach.fullName}
                        onChanged={classes.reload}
                      />
                    )}
                    <section
                      className={`${profileStyles.surface} ${overviewStyles.profile}`}
                      aria-labelledby="coach-profile-title"
                    >
                      <div className={overviewStyles.biography}>
                        <h2 id="coach-profile-title">About this coach</h2>
                        <p className={overviewStyles.bio}>
                          {coach.bio || "No biography has been added."}
                        </p>
                        {coach.philosophy && (
                          <div className={overviewStyles.philosophy}>
                            <h3>Coaching approach</h3>
                            <p>{coach.philosophy}</p>
                          </div>
                        )}
                      </div>
                      <div className={overviewStyles.details}>
                        <h3>Coaching details</h3>
                        <dl>
                          {coach.title && (
                            <div>
                              <dt>Professional title</dt>
                              <dd>{coach.title}</dd>
                            </div>
                          )}
                          {coach.yearsExperience != null && (
                            <div>
                              <dt>Experience</dt>
                              <dd>
                                {coach.yearsExperience}{" "}
                                {coach.yearsExperience === 1 ? "year" : "years"}
                              </dd>
                            </div>
                          )}
                        </dl>
                        <CoachSpecialties coach={coach} />
                      </div>
                    </section>
                  </div>
                )}
                {activeTab === "classes" && (
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
                {activeTab === "schedule" && (
                  <ManagerSchedule coachId={coach.userId} />
                )}
                {activeTab === "certificates" && (
                  <div className={profileStyles.surface}>
                    <CoachCredentialsShowcase
                      key={userId}
                      coachId={userId}
                      kind="CERTIFICATE"
                    />
                  </div>
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
        <div className={overviewStyles.specialties}>
          <span>{t.operations.specialties}</span>
          {coach.sportIds.length ? (
            <ul>
              {coach.sportIds.map((id) => (
                <li key={id}>
                  {sports.find((s) => s.sportId === id)?.name ??
                    t.managerAudit.nameUnavailable}
                </li>
              ))}
            </ul>
          ) : (
            <p>No specialties assigned.</p>
          )}
        </div>
      )}
    </AsyncSection>
  );
}
