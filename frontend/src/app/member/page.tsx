"use client";
import Link from "next/link";
import { MemberShell } from "@/components/MemberShell";
import { MemberCodeCard } from "@/components/MemberCodeCard";
import { AsyncSection, Card, StatusChip } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime, formatDate } from "@/lib/format";
import type {
  CourseMemberSessionDto,
  CourseEnrollmentDto,
  MemberPackageDto,
  Paged,
} from "@/lib/types";
import { walletApi } from "@/features/wallet/api";
import { WalletBalance } from "@/features/wallet/wallet-balance";
export default function MemberDashboardPage() {
  const { t } = useLanguage();
  const schedule = useApi(
    (signal) =>
      api.get<CourseMemberSessionDto[]>("/api/members/me/schedule", { signal }),
    [],
  );
  const courses = useApi(
    (signal) =>
      api.get<Paged<CourseEnrollmentDto>>("/api/members/me/enrollments", {
        signal,
        query: { page: 1, pageSize: 5 },
      }),
    [],
  );
  const packages = useApi(
    (signal) =>
      api.get<MemberPackageDto[]>("/api/members/me/packages", { signal }),
    [],
  );
  const wallet = useApi((signal) => walletApi.balance(signal), []);
  const pt = useApi(
    (signal) =>
      api.get<
        {
          entitlementId: string;
          coachName: string;
          status: string;
          remainingQuota: number;
          totalQuota: number;
          carryOverUntilDate: string | null;
        }[]
      >("/api/members/me/pt-entitlements", { signal }),
    [],
  );
  const notifications = useApi(
    (signal) =>
      api.get<{ notificationId: string; message: string }[]>(
        "/api/notifications",
        { signal },
      ),
    [],
  );

  return (
    <MemberShell
      title={t.memberOverview.title}
      description={t.memberOverview.description}
    >
      <div className="grid grid--2">
        <Card title={t.memberOverview.schedule}>
          <AsyncSection
            state={schedule}
            isEmpty={(data) => data.length === 0}
            emptyMessage={t.memberOverview.empty}
          >
            {(data) => (
              <ul>
                {data.map((s) => (
                  <li key={s.sessionId}>
                    <strong>{s.className}</strong> · {s.sportName}
                    <p>
                      {formatDateTime(s.startAtUtc)} · {s.roomName} ·{" "}
                      <StatusChip value={s.status} />
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </AsyncSection>
        </Card>
        <Card title={t.wallet.title}>
          <AsyncSection state={wallet}>
            {(data) => <WalletBalance balance={data} />}
          </AsyncSection>
          <Link href="/member/wallet">{t.wallet.history}</Link>
        </Card>
        <Card title={t.memberOverview.courses}>
          <AsyncSection state={courses}>
            {(data) => (
              <>
                {!data.items.length && <p>{t.memberOverview.empty}</p>}
                <ul>
                  {data.items.map((c) => (
                    <li key={c.enrollmentId}>
                      <strong>{c.className}</strong> ·{" "}
                      <StatusChip value={c.status} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </AsyncSection>
          <Link href="/member/class-schedule">{t.memberOverview.browse}</Link>
        </Card>
        <Card title={t.memberOverview.membership}>
          <AsyncSection
            state={packages}
            isEmpty={(data) => data.length === 0}
            emptyMessage={t.memberOverview.empty}
          >
            {(data) => (
              <ul>
                {data.map((p) => (
                  <li key={p.memberPackageId}>
                    <strong>{p.packageName}</strong>
                    <p>
                      {formatDate(p.startDate)} – {formatDate(p.endDate)} ·{" "}
                      <StatusChip value={p.status} />
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </AsyncSection>
          <Link href="/member/my-plans">{t.memberOverview.plans}</Link>
        </Card>
        <Card title={t.refactor.pt}>
          <AsyncSection state={pt}>
            {(data) =>
              data.length ? (
                <ul>
                  {data.map((e) => (
                    <li key={e.entitlementId}>
                      {e.coachName} · <StatusChip value={e.status} /> ·{" "}
                      {e.remainingQuota}/{e.totalQuota} {t.refactor.sessions}
                      {e.carryOverUntilDate &&
                        ` · ${formatDate(e.carryOverUntilDate)}`}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>{t.refactor.empty}</p>
              )
            }
          </AsyncSection>
          <Link href="/member/training">{t.refactor.training}</Link>
        </Card>
        <MemberCodeCard />
        <Card title={t.refactor.notifications}>
          <AsyncSection state={notifications}>
            {(data) =>
              data.length ? (
                <ul>
                  {data.slice(0, 5).map((n) => (
                    <li key={n.notificationId}>{n.message}</li>
                  ))}
                </ul>
              ) : (
                <p>{t.refactor.empty}</p>
              )
            }
          </AsyncSection>
        </Card>
      </div>
    </MemberShell>
  );
}
