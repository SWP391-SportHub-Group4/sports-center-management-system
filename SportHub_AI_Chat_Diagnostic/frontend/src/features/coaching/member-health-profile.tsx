"use client";

import { AsyncSection, Card } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import type { MemberTrainingProfileDto } from "@/lib/types";
import { HealthProfileSummary } from "@/features/training";

/** Read-only health and goals profile the member entered themselves (manager view). */
export function MemberHealthProfile({ memberId }: { memberId: string }) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const state = useApi(
    async (signal) => ({
      profile: await api.get<MemberTrainingProfileDto | null>(
        `/api/members/${memberId}/training-profile`,
        { signal },
      ),
    }),
    [memberId],
  );
  return (
    <Card title={vi ? "Hồ sơ sức khỏe" : "Health profile"}>
      <AsyncSection state={state}>
        {({ profile }) =>
          profile ? (
            <HealthProfileSummary profile={profile} />
          ) : (
            <p>
              {vi
                ? "Hội viên chưa khai hồ sơ sức khỏe."
                : "This member has not completed a health profile yet."}
            </p>
          )
        }
      </AsyncSection>
    </Card>
  );
}
