"use client";

import { AsyncSection } from "@/components/ui";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { HealthProfileSummary } from "@/features/training";
import { ptApi } from "./api";

/** Coach view of the profile the student entered: goals, body figures, routine, diet and limitations. */
export function PtMemberHealth({ memberId }: { memberId: string }) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const state = useApi(
    (signal) => ptApi.healthProfile(memberId, signal),
    [memberId],
  );
  return (
    <AsyncSection state={state}>
      {({ trainingProfile: profile }) =>
        profile ? (
          <HealthProfileSummary profile={profile} />
        ) : (
          <p className="muted">
            {vi
              ? "Học viên chưa khai hồ sơ sức khỏe."
              : "The student has not completed their health profile."}
          </p>
        )
      }
    </AsyncSection>
  );
}
