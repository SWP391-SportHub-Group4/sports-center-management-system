"use client";

import { AsyncSection } from "@/components/ui";
import { useApi } from "@/lib/useApi";
import { formatDateTime } from "@/lib/format";
import { BodyBuildSelector } from "@/features/training/body-build-selector";
import { HealthProfileSummary } from "@/features/training/health-profile-summary";
import { teachingApi } from "./teaching-api";
import styles from "./student-physical-profile.module.css";

export function StudentPhysicalProfile({ memberId }: { memberId: string }) {
  const state = useApi(
    (signal) => teachingApi.healthProfile(memberId, signal),
    [memberId],
  );
  return (
    <AsyncSection state={state}>
      {({ profile }) =>
        profile ? (
          <section className={styles.profile} aria-label="Physical profile">
            <header>
              <h3>Physical profile</h3>
              <p>
                Reported by the member · Updated{" "}
                {formatDateTime(profile.updatedAt)}
              </p>
            </header>
            <dl className={styles.metrics}>
              {[
                ["Height", profile.heightCm, "cm"],
                ["Weight", profile.weightKg, "kg"],
                ["Target weight", profile.targetWeightKg, "kg"],
              ].map(([label, value, unit]) => (
                <div key={String(label)}>
                  <dt>{label}</dt>
                  <dd>
                    {value ?? "—"} <small>{value != null ? unit : ""}</small>
                  </dd>
                </div>
              ))}
            </dl>
            <div className={styles.layout}>
              <div className={styles.build}>
                <BodyBuildSelector value={profile.bodyBuild ?? ""} />
              </div>
              <HealthProfileSummary profile={profile} />
            </div>
          </section>
        ) : (
          <div className={styles.empty}>
            <h3>No physical profile yet</h3>
            <p>
              The member can add height, weight, current body build and health
              limitations in their Training profile. No measurements have been
              assumed.
            </p>
          </div>
        )
      }
    </AsyncSection>
  );
}
