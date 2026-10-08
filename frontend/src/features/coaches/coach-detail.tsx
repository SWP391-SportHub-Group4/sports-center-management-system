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
import styles from "@/components/data/ProfileSummary.module.css";
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
              <fieldset
                className={styles.qualificationOptions}
                disabled={mutation.busy}
              >
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
                      PT · #{id}
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
    <div className={styles.profilePage}>
      <Link href="/manager/coaches" className={`btn btn--ghost ${styles.back}`}>
        {m.backToList}
      </Link>
      <AsyncSection state={state}>
        {(coach) => (
          <>
            <section className={styles.summary} aria-label={coach.fullName}>
              <div className={styles.summaryHeader}>
                <h2>{coach.fullName}</h2>
                <div className="btn-row">
                  <StatusChip value={coach.status} />
                  <button
                    className="btn btn--secondary"
                    onClick={() => setEditing(true)}
                  >
                    {t.operations.edit}
                  </button>
                </div>
              </div>
              <dl className={styles.contacts}>
                <div>
                  <dt>{t.operations.email}</dt>
                  <dd>{coach.email}</dd>
                </div>
                <div>
                  <dt>{t.operations.phone}</dt>
                  <dd>{coach.phone || "—"}</dd>
                </div>
              </dl>
            </section>
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
                  <div className={styles.coachOverview}>
                    <section className={styles.bio}>
                      <h3>{t.operations.bio}</h3>
                      <p>{coach.bio || "—"}</p>
                    </section>
                    <section className={styles.specialties}>
                      <h3>{t.operations.specialties}</h3>
                      <CoachSpecialties coach={coach} />
                    </section>
                  </div>
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
    </div>
  );
}
function CoachSpecialties({ coach }: { coach: CoachAdminDto }) {
  const { t } = useLanguage();
  const state = useApi((signal) => catalogApi.sports(signal, true), []);
  return (
    <AsyncSection state={state}>
      {(sports) =>
        coach.sportIds.length ? (
          <ul className={styles.specialtyList}>
            {coach.sportIds.map((id) => (
              <li key={id}>
                {sports.find((s) => s.sportId === id)?.name ?? `#${id}`}
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.note}>{t.common.noData}</p>
        )
      }
    </AsyncSection>
  );
}
