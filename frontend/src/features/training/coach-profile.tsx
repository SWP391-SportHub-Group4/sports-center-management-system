"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Award,
  BriefcaseBusiness,
  GraduationCap,
} from "lucide-react";
import { AvatarImage } from "@/components/AvatarImage";
import { CoachCredentialsShowcase } from "@/components/coach-credentials/coach-credentials";
import { AsyncSection } from "@/components/ui";
import { Tabs } from "@/components/primitives";
import { choiceQuery, useUrlQuery } from "@/lib/useUrlQuery";
import { api } from "@/lib/apiClient";
import { safeReturnTo } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import type { SportDto } from "@/lib/types";
import styles from "./coach-profile.module.css";

type CoachDto = {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  bio?: string | null;
  sportIds?: number[];
  title?: string | null;
  yearsExperience?: number | null;
  philosophy?: string | null;
  credentialCount?: number;
};

export function CoachProfile({
  coachId,
  publicView = false,
}: {
  coachId: string;
  publicView?: boolean;
}) {
  const { values, setValues } = useUrlQuery(
    { tab: "overview", returnTo: "" },
    { tab: choiceQuery(["overview", "certificates", "awards"], "overview") },
  );
  const tab = values.tab;
  const fallback = publicView ? "/#sporthub" : "/member/services";
  const origin = safeReturnTo(values.returnTo, fallback);
  const returnTo =
    origin.split(/[?#]/)[0] === `/coaches/${coachId}` ||
    origin.split(/[?#]/)[0] === "/coaches"
      ? fallback
      : origin;
  const setTab = (tab: string) => setValues({ tab });
  const coaches = useApi(
    (signal) =>
      api.get<CoachDto[]>("/api/coaches", { signal, anonymous: true }),
    [],
  );
  const sports = useApi(
    (signal) => api.get<SportDto[]>("/api/sports", { signal, anonymous: true }),
    [],
  );
  return (
    <div className={styles.page}>
      <Link className={styles.back} href={returnTo}>
        <ArrowLeft size={16} aria-hidden="true" /> Back
      </Link>
      <AsyncSection state={coaches}>
        {(list) => {
          const coach = list.find((item) => item.userId === coachId);
          if (!coach)
            return (
              <section className={styles.notFound}>
                <h1>Coach not found</h1>
                <p>This profile is not currently available.</p>
              </section>
            );
          const specialties = (sports.data ?? []).filter((sport) =>
            coach.sportIds?.includes(sport.sportId),
          );
          return (
            <article className={styles.profile}>
              <header className={styles.hero}>
                <div className={styles.identity}>
                  <AvatarImage
                    name={coach.fullName}
                    avatarUrl={coach.avatarUrl}
                    size={128}
                    className={styles.avatar}
                  />
                  <div className={styles.heroText}>
                    <p className={styles.eyebrow}>SPORTHUB COACH</p>
                    <h1>{coach.fullName}</h1>
                    <p className={styles.title}>
                      {coach.title || "Sports coach"}
                    </p>
                    {specialties.length > 0 && (
                      <ul className={styles.badges} aria-label="Sports">
                        {specialties.map((sport) => (
                          <li key={sport.sportId}>{sport.name}</li>
                        ))}
                      </ul>
                    )}
                    {sports.error && (
                      <p className={styles.sportError}>
                        Sports unavailable.{" "}
                        <button type="button" onClick={sports.reload}>
                          Retry
                        </button>
                      </p>
                    )}
                  </div>
                </div>
                <dl className={styles.facts}>
                  <div>
                    <dt>
                      <BriefcaseBusiness size={15} aria-hidden="true" />
                      Experience
                    </dt>
                    <dd>
                      {coach.yearsExperience != null
                        ? `${coach.yearsExperience} ${coach.yearsExperience === 1 ? "year" : "years"}`
                        : "Not provided"}
                    </dd>
                  </div>
                  <div>
                    <dt>
                      <GraduationCap size={15} aria-hidden="true" />
                      Public documents
                    </dt>
                    <dd>{coach.credentialCount ?? "Not available"}</dd>
                  </div>
                </dl>
              </header>
              <div className={styles.workspace}>
                <Tabs
                  value={tab}
                  onChange={setTab}
                  ariaLabel="Coach profile sections"
                  animatedIndicator
                  tabs={[
                    { id: "overview", label: "Overview" },
                    { id: "certificates", label: "Certificates" },
                    { id: "awards", label: "Awards" },
                  ]}
                >
                  <div className={styles.content}>
                    {tab === "overview" ? (
                      <div className={styles.overview}>
                        <div className={styles.introduction}>
                          <section className={styles.prose}>
                            <p className={styles.sectionLabel}>
                              GET TO KNOW YOUR COACH
                            </p>
                            <h2>About {coach.fullName}</h2>
                            <p>
                              {coach.bio?.trim() ||
                                "This coach has not shared an introduction yet."}
                            </p>
                          </section>
                          <section className={styles.prose}>
                            <h2>Coaching approach</h2>
                            <p>
                              {coach.philosophy?.trim() ||
                                "This coach has not shared a coaching approach yet."}
                            </p>
                          </section>
                        </div>
                        <aside
                          className={styles.documents}
                          aria-label="Qualifications and recognition"
                        >
                          <GraduationCap size={25} aria-hidden="true" />
                          <h2>Qualifications & recognition</h2>
                          <p>
                            Explore the certificates and awards this coach has
                            shared.
                          </p>
                          <button
                            type="button"
                            className="btn btn--secondary"
                            onClick={() => setTab("certificates")}
                          >
                            <GraduationCap size={16} aria-hidden="true" />
                            View certificates
                          </button>
                          <button
                            type="button"
                            className="btn btn--ghost"
                            onClick={() => setTab("awards")}
                          >
                            <Award size={16} aria-hidden="true" />
                            View awards
                          </button>
                        </aside>
                      </div>
                    ) : (
                      <CoachCredentialsShowcase
                        key={tab}
                        coachId={coachId}
                        kind={tab === "certificates" ? "CERTIFICATE" : "AWARD"}
                      />
                    )}
                  </div>
                </Tabs>
              </div>
            </article>
          );
        }}
      </AsyncSection>
    </div>
  );
}
