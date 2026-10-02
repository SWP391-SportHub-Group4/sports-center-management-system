"use client";
import { MemberShell } from "@/components/MemberShell";
import { MembershipCatalog, PtPurchase } from "@/features/membership/catalog";
import { useLanguage } from "@/lib/language";
import { useApi } from "@/lib/useApi";
import { api } from "@/lib/apiClient";
import type { MemberPackageDto, PtEntitlementDto } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { Card, StatusChip } from "@/components/ui";
export default function Page() {
  const { t } = useLanguage();
  const state = useApi(
    (signal) =>
      api.get<MemberPackageDto[]>("/api/members/me/packages", { signal }),
    [],
  );
  const entitlements = useApi(
    (signal) =>
      api.get<PtEntitlementDto[]>("/api/members/me/pt-entitlements", { signal }),
    [],
  );
  return (
    <MemberShell title={t.nav.myPlans}>
      <button
        onClick={() => {
          state.reload();
          entitlements.reload();
        }}
      >
        {t.refactor.refresh}
      </button>
      {state.loading ? (
        <p>{t.refactor.loading}</p>
      ) : state.error ? (
        <p role="alert">{state.error.message}</p>
      ) : !state.data?.length ? (
        <p>{t.refactor.empty}</p>
      ) : (
        state.data.map((p) => (
          <Card key={p.memberPackageId} title={p.packageName}>
            <p>
              <StatusChip value={p.status} /> · {formatDate(p.startDate)} –{" "}
              {formatDate(p.endDate)}
            </p>
          </Card>
        ))
      )}
      {entitlements.loading ? (
        <p>{t.refactor.loading}</p>
      ) : entitlements.error ? (
        <p role="alert">{entitlements.error.message}</p>
      ) : (
        entitlements.data?.map((e) => (
          <Card key={e.entitlementId} title={e.coachName}>
            <p>
              <StatusChip value={e.status} /> · {e.remainingQuota}/
              {e.totalQuota} {t.refactor.sessions} · {e.reservedSessions}{" "}
              {t.refactor.held} · {e.consumedSessions} {t.refactor.used} ·{" "}
              {formatDate(e.validityEndDate)}{e.carryOverUntilDate && ` · ${formatDate(e.carryOverUntilDate)}`}
            </p>
          </Card>
        ))
      )}
      <MembershipCatalog purchase />
      {state.data && <PtPurchase packages={state.data} />}
    </MemberShell>
  );
}
