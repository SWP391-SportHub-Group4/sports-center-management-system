"use client";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { choiceQuery, useUrlQuery } from "@/lib/useUrlQuery";
import { Card, AsyncSection, StatusChip } from "@/components/ui";
import { Tabs } from "@/components/primitives";
import { catalogApi } from "@/features/catalog";
import { useMutation, MutationFeedback } from "@/features/operations";
import { CoachEditor } from "./coach-editor";
import { ManagerSchedule } from "@/features/manager";
import type { CoachAdminDto } from "@/lib/types";
function Qualifications({ coach }: { coach: CoachAdminDto }) {
  const { t } = useLanguage();
  const l = t.managerOperations;
  const mutation = useMutation();
  const [draft, setDraft] = useState<number[] | null>(null);
  const state = useApi(
    async (signal) => {
      const [sports, qualified] = await Promise.all([
        catalogApi.sports(signal, true),
        api.get<{ offeringIds: number[] }>(
          `/api/manager/coaches/${coach.userId}/service-qualifications`,
          { signal },
        ),
      ]);
      return { sports, qualified };
    },
    [coach.userId, coach.sportIds.join(",")],
  );
  return (
    <Card title={l.qualification}>
      <p>{l.qualificationHint}</p>
      <AsyncSection state={state}>
        {({ sports, qualified }) => {
          const offerings = sports
            .filter((s) => s.code === "gym" && s.isActive)
            .flatMap((s) =>
              s.services
                .filter(
                  (service) =>
                    service.serviceType === "PERSONAL_TRAINING" &&
                    service.isEnabled &&
                    service.offeringId,
                )
                .map((service) => ({ sport: s, id: service.offeringId! })),
            );
          const chosen = draft ?? qualified.offeringIds;
          return (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (
                  await mutation.run(() =>
                    api.put(
                      `/api/manager/coaches/${coach.userId}/service-qualifications`,
                      { offeringIds: chosen },
                    ),
                  )
                ) {
                  setDraft(null);
                  state.reload();
                }
              }}
            >
              <fieldset disabled={mutation.busy}>
                {offerings.map(({ sport, id }) => (
                  <label key={id}>
                    <input
                      type="checkbox"
                      checked={chosen.includes(id)}
                      disabled={!coach.sportIds.includes(sport.sportId)}
                      onChange={(e) =>
                        setDraft(
                          e.target.checked
                            ? [...chosen, id]
                            : chosen.filter((x) => x !== id),
                        )
                      }
                    />
                    {sport.name} · PT
                  </label>
                ))}
                {!offerings.length && <p>{l.noPtOffering}</p>}
                {qualified.offeringIds
                  .filter((id) => !offerings.some((o) => o.id === id))
                  .map((id) => (
                    <label key={id}>
                      <input
                        type="checkbox"
                        checked={chosen.includes(id)}
                        onChange={(e) =>
                          setDraft(
                            e.target.checked
                              ? [...chosen, id]
                              : chosen.filter((x) => x !== id),
                          )
                        }
                      />
                      PT · {t.managerAudit.nameUnavailable}
                    </label>
                  ))}
              </fieldset>
              <button
                className="btn"
                disabled={mutation.busy || draft === null}
              >
                {t.operations.save}
              </button>
              <MutationFeedback mutation={mutation} />
            </form>
          );
        }}
      </AsyncSection>
    </Card>
  );
}
export function CoachDetail({ userId }: { userId: string }) {
  const { t } = useLanguage();
  const m = t.managerOperations;
  const [editing, setEditing] = useState(false);
  const { values, setValues } = useUrlQuery(
    { tab: "overview" },
    { tab: choiceQuery(["overview", "qualification", "schedule"], "overview") },
  );
  const state = useApi(
    (signal) =>
      api.get<CoachAdminDto>(`/api/manager/coaches/${userId}`, { signal }),
    [userId],
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
                { id: "qualification", label: m.qualification },
                { id: "schedule", label: m.assignedSchedule },
              ]}
            >
              {values.tab === "overview" && (
                <Card title={m.coachDetail}>
                  <p style={{ whiteSpace: "pre-wrap" }}>{coach.bio || "—"}</p>
                  <CoachSpecialties coach={coach} />
                </Card>
              )}
              {values.tab === "qualification" && (
                <Qualifications
                  key={`${coach.userId}-${coach.sportIds.join(",")}`}
                  coach={coach}
                />
              )}{" "}
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
