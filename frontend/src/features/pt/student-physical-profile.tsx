"use client";

import { RefreshCw } from "lucide-react";
import { AsyncSection } from "@/components/ui";
import { useApi } from "@/lib/useApi";
import { formatDate, formatDateTime } from "@/lib/format";
import { BodyBuildSelector } from "@/features/training/body-build-selector";
import { MeasurementHistory } from "@/features/training/health-profile-summary";
import {
  ACTIVITY_LEVELS,
  BMI_CATEGORIES,
  DIETARY_PREFERENCES,
  EXPERIENCE_LEVELS,
  GOAL_TYPES,
  SEXES,
  optionLabel,
} from "@/features/training/health-profile-options";
import { teachingApi } from "./teaching-api";
import styles from "./student-physical-profile.module.css";

const measurement = (value: number | null) =>
  value == null
    ? "Not provided"
    : new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 }).format(
        value,
      );

function Facts({ rows }: { rows: [string, string][] }) {
  return (
    <dl className={styles.facts}>
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function StudentPhysicalProfile({ memberId }: { memberId: string }) {
  const state = useApi(
    (signal) => teachingApi.healthProfile(memberId, signal),
    [memberId],
  );
  return (
    <section className={styles.profile} aria-label="Fitness profile">
      <header className={styles.heading}>
        <div>
          <h3>Fitness profile</h3>
          <p>Member-reported measurements, goals and health information.</p>
        </div>
        <button
          type="button"
          className="btn btn--quiet btn--sm"
          onClick={state.reload}
          disabled={state.loading}
        >
          <RefreshCw size={16} aria-hidden="true" />
          Refresh
        </button>
      </header>
      <AsyncSection state={state}>
        {({ profile }) =>
          profile ? (
            <>
              <p className={styles.updated}>
                Updated {formatDateTime(profile.updatedAt)} · Read only
              </p>
              {!profile.isComplete && (
                <p className={styles.incomplete}>
                  This profile is incomplete. Missing information is marked
                  below; ask the member to update their Fitness profile.
                </p>
              )}
              <dl className={styles.metrics}>
                {[
                  ["Height", profile.heightCm, "cm"],
                  ["Weight", profile.weightKg, "kg"],
                  ["BMI", profile.bmi, "kg/m²"],
                ].map(([label, value, unit]) => (
                  <div key={String(label)}>
                    <dt>{label}</dt>
                    <dd>
                      {value == null ? "—" : measurement(Number(value))}{" "}
                      <small>{value != null ? unit : ""}</small>
                    </dd>
                    {label === "BMI" && profile.bmiCategory && (
                      <span className={styles.bmiCategory}>
                        {BMI_CATEGORIES[profile.bmiCategory]?.en ??
                          profile.bmiCategory}
                      </span>
                    )}
                  </div>
                ))}
              </dl>
              <div className={styles.layout}>
                <div className={styles.column}>
                  <section
                    className={styles.section}
                    data-priority={!!profile.notes}
                  >
                    <h4>Health & limitations</h4>
                    <p className={styles.prose}>
                      {profile.notes?.trim() ||
                        "No injuries, conditions or limitations reported."}
                    </p>
                    <Facts
                      rows={[
                        [
                          "Food allergies / intolerances",
                          profile.foodAllergies?.trim() || "None reported",
                        ],
                        [
                          "Diet",
                          optionLabel(
                            DIETARY_PREFERENCES,
                            profile.dietaryPreference,
                            false,
                          ),
                        ],
                      ]}
                    />
                  </section>
                  <section className={styles.section}>
                    <h4>Goals & experience</h4>
                    <Facts
                      rows={[
                        [
                          "Main goal",
                          optionLabel(GOAL_TYPES, profile.goalType, false),
                        ],
                        [
                          "Experience",
                          optionLabel(
                            EXPERIENCE_LEVELS,
                            profile.experienceLevel,
                            false,
                          ),
                        ],
                        [
                          "Target weight",
                          profile.targetWeightKg == null
                            ? "Not provided"
                            : `${measurement(profile.targetWeightKg)} kg`,
                        ],
                      ]}
                    />
                    {profile.goal?.trim() && (
                      <p className={styles.prose}>{profile.goal}</p>
                    )}
                  </section>
                  <section className={styles.section}>
                    <h4>Training routine</h4>
                    <Facts
                      rows={[
                        [
                          "Daily activity",
                          optionLabel(
                            ACTIVITY_LEVELS,
                            profile.activityLevel,
                            false,
                          ),
                        ],
                        [
                          "Preferred training frequency",
                          profile.trainingDaysPerWeek == null
                            ? "Not provided"
                            : `${profile.trainingDaysPerWeek} days / week`,
                        ],
                        [
                          "Preferred session length",
                          profile.sessionMinutes == null
                            ? "Not provided"
                            : `${profile.sessionMinutes} min`,
                        ],
                      ]}
                    />
                  </section>
                </div>
                <div className={styles.column}>
                  <section className={styles.section}>
                    <h4>Personal details</h4>
                    <Facts
                      rows={[
                        [
                          "Date of birth",
                          profile.dateOfBirth
                            ? formatDate(profile.dateOfBirth)
                            : "Not provided",
                        ],
                        [
                          "Age",
                          profile.age == null
                            ? "Not provided"
                            : `${profile.age} years`,
                        ],
                        ["Sex", optionLabel(SEXES, profile.sex, false)],
                      ]}
                    />
                  </section>
                  <section className={styles.section}>
                    <BodyBuildSelector value={profile.bodyBuild ?? ""} />
                  </section>
                  <MeasurementHistory profile={profile} />
                </div>
              </div>
            </>
          ) : (
            <div className={styles.empty}>
              <h4>No Fitness profile yet</h4>
              <p>
                The member can complete their profile in Training → Fitness
                profile. Measurements, goals and health information will appear
                here after saving.
              </p>
            </div>
          )
        }
      </AsyncSection>
    </section>
  );
}
