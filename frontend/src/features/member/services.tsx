"use client";
import { Tabs } from "@/components/primitives";
import { AsyncSection, Card, StatusChip, Table } from "@/components/ui";
import { MembershipCatalog, PtPurchase } from "@/features/membership";
import { api } from "@/lib/apiClient";
import { formatDate, formatDateTime } from "@/lib/format";
import { useLanguage } from "@/lib/language";
import { pagedItems } from "@/lib/paged";
import type {
  GymCheckInDto,
  MemberPackageDto,
  Paged,
  PtEntitlementDto,
} from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { choiceQuery, pageQuery, useUrlQuery } from "@/lib/useUrlQuery";
import { CoachChangeSection } from "@/features/training";

function Visits() {
  const { t } = useLanguage();
  const { values, setValues } = useUrlQuery({ page: "1" }, { page: pageQuery });
  const page = Number(values.page);
  const state = useApi(
    (signal) =>
      api.get<Paged<GymCheckInDto>>("/api/members/me/gym-checkins", {
        signal,
        query: { page, pageSize: 10 },
      }),
    [page],
  );
  return (
    <>
      <AsyncSection
        state={state}
        isEmpty={(data) => !pagedItems(data).length}
        emptyMessage={t.memberPages.emptyVisits}
      >
        {(data) => (
          <Table headers={[t.memberPages.checkIn, t.memberPages.checkOut]}>
            {pagedItems(data).map((row) => (
              <tr key={row.checkInId}>
                <td>{formatDateTime(row.checkInTime)}</td>
                <td>
                  {row.checkOutTime
                    ? formatDateTime(row.checkOutTime)
                    : t.memberPages.inside}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </AsyncSection>
      <div className="row">
        <button
          disabled={state.loading || page === 1}
          onClick={() => setValues({ page: String(page - 1) })}
        >
          {t.refactor.previous}
        </button>
        <button
          disabled={
            state.loading || !state.data || page * 10 >= state.data.totalCount
          }
          onClick={() => setValues({ page: String(page + 1) })}
        >
          {t.refactor.more}
        </button>
      </div>
    </>
  );
}

export function MemberServices() {
  const { t } = useLanguage();
  const { values, setValues } = useUrlQuery(
    { tab: "gym" },
    { tab: choiceQuery(["gym", "pt", "visits"], "gym") },
  );
  const packages = useApi(
    (signal) =>
      api.get<MemberPackageDto[]>("/api/members/me/packages", { signal }),
    [],
  );
  const entitlements = useApi(
    (signal) =>
      api.get<PtEntitlementDto[]>("/api/members/me/pt-entitlements", {
        signal,
      }),
    [],
  );
  return (
    <>
      <p className="muted">{t.memberPages.membershipNote}</p>
      <Tabs
        ariaLabel={t.memberPages.services}
        value={values.tab}
        onChange={(tab) => setValues({ tab })}
        tabs={(["gym", "pt", "visits"] as const).map((id) => ({
          id,
          label: t.memberPages[id],
        }))}
      >
        {values.tab === "visits" ? (
          <Visits />
        ) : values.tab === "gym" ? (
          <>
            <AsyncSection state={packages} isEmpty={(rows) => !rows.length}>
              {(rows) => (
                <div className="stack">
                  {rows.map((p) => (
                    <Card key={p.memberPackageId} title={p.packageName}>
                      <p>
                        <StatusChip value={p.status} />
                      </p>
                      <p>
                        {formatDate(p.startDate)} – {formatDate(p.endDate)}
                      </p>
                    </Card>
                  ))}
                </div>
              )}
            </AsyncSection>
            <MembershipCatalog purchase owned={packages.data ?? []} />
          </>
        ) : (
          <>
            <AsyncSection state={entitlements} isEmpty={(rows) => !rows.length}>
              {(rows) => (
                <div className="stack">
                  {rows.map((e) => (
                    <Card key={e.entitlementId} title={e.coachName}>
                      <p>
                        <StatusChip value={e.status} />
                      </p>
                      <dl className="row">
                        <div>
                          <dt>{t.memberPages.remaining}</dt>
                          <dd>
                            {e.remainingQuota} / {e.totalQuota}
                          </dd>
                        </div>
                        <div>
                          <dt>{t.memberPages.held}</dt>
                          <dd>{e.reservedSessions}</dd>
                        </div>
                        <div>
                          <dt>{t.memberPages.used}</dt>
                          <dd>{e.consumedSessions}</dd>
                        </div>
                      </dl>
                      <p>
                        {t.memberPages.validity}:{" "}
                        {formatDate(e.validityStartDate)} –{" "}
                        {formatDate(e.validityEndDate)}
                      </p>
                      {e.carryOverUntilDate && (
                        <p>
                          {t.memberPages.carryOver}:{" "}
                          {formatDate(e.carryOverUntilDate)}
                        </p>
                      )}
                    </Card>
                  ))}
                </div>
              )}
            </AsyncSection>
            <p className="muted">{t.memberPages.frequencyHint}</p>
            <AsyncSection state={entitlements}>
              {(rows) => <CoachChangeSection entitlements={rows} />}
            </AsyncSection>
            <AsyncSection state={packages}>
              {(rows) => <PtPurchase packages={rows} />}
            </AsyncSection>
          </>
        )}
      </Tabs>
    </>
  );
}
