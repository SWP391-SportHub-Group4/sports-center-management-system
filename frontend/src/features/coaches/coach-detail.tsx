"use client";
import { LockedCoachAssignments } from "./locked-coach-assignments";
import { RemoveMemberAvatarButton } from "@/components/RemoveMemberAvatarButton";
import { AvatarImage } from "@/components/AvatarImage";
import { api } from "@/lib/apiClient";
import type { Paged, ManagerCourseDto } from "@/lib/types";
import { useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { choiceQuery, useUrlQuery } from "@/lib/useUrlQuery";
import { Card, AsyncSection, StatusChip, Pager } from "@/components/ui";
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
    <>
      <Link href="/manager/coaches" className="btn btn--ghost">
        {m.backToList}
      </Link>
      <AsyncSection state={state}>
        {(coach) => (
          <>
            <Card
              title={coach.fullName}
              actions={
                <>
                  <StatusChip value={coach.status} />
                  <button
                    className="btn btn--secondary"
                    onClick={() => setEditing(true)}
                  >
                    {t.operations.edit}
                  </button>
                </>
              }
            >
              <AvatarImage
                name={coach.fullName}
                avatarUrl={coach.avatarUrl}
                size={64}
              />
              {coach.avatarUrl && (
                <RemoveMemberAvatarButton
                  memberId={coach.userId}
                  memberName={coach.fullName}
                  onRemoved={state.reload}
                />
              )}
              <p>
                {coach.email} · {coach.phone ?? "—"}
              </p>
            </Card>
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
                <Card title={m.coachDetail}>
                  <p style={{ whiteSpace: "pre-wrap" }}>{coach.bio || "—"}</p>
                  <CoachSpecialties coach={coach} />
                  {coach.status !== "ACTIVE" && (
                    <LockedCoachAssignments
                      coachId={userId}
                      onChanged={classes.reload}
                    />
                  )}
                </Card>
              )}
              {values.tab === "classes" && (
                <AsyncSection state={classes}>
                  {(data) => (
                    <>
                      <ul>
                        {data.items.map((c) => (
                          <li key={c.classId}>
                            <Link href={`/manager/classes/${c.classId}`}>
                              {c.name}
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
                    </>
                  )}
                </AsyncSection>
              )}
              {values.tab === "schedule" && (
                <ManagerSchedule coachId={coach.userId} />
              )}
            </Tabs>
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
    </>
  );
}
function CoachSpecialties({ coach }: { coach: CoachAdminDto }) {
  const { t } = useLanguage();
  const state = useApi((signal) => catalogApi.sports(signal, true), []);
  return (
    <AsyncSection state={state}>
      {(sports) => (
        <p>
          {t.operations.specialties}:{" "}
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
