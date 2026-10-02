"use client";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
import { api } from "@/lib/apiClient";
import { AsyncSection, StatusChip } from "@/components/ui";
import { useApi } from "@/lib/useApi";
export default function ExternalCoachPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const profile = useApi(
    (signal) =>
      user?.role === "ExternalCoach"
        ? api.get<{ approvalStatus: string; reviewNote: string | null }>(
            "/api/external-coaches/me",
            { signal },
          )
        : Promise.resolve(null),
    [user?.userId, user?.role],
  );
  return (
    <AppShell
      title={t.navigation.roleLabel.ExternalCoach}
      description={t.identity.externalDescription}
      allow={["ExternalCoach"]}
    >
      <AsyncSection state={profile}>
        {(data) => (
          <>
            <StatusChip value={data.approvalStatus} />
            <p>{data.reviewNote}</p>
          </>
        )}
      </AsyncSection>
    </AppShell>
  );
}
