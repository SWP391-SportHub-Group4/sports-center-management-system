"use client";
import {
  AsyncSection,
  Card,
  PageNav,
  StatusChip,
  Table,
} from "@/components/ui";
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
import { pageQuery, useUrlQuery } from "@/lib/useUrlQuery";
import styles from "./services.module.css";
import { CoachChangeSection } from "@/features/training";
import { isRetiredActivityPackage } from "@/features/membership";

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
      {state.data && (
        <PageNav
          page={page}
          totalPages={Math.max(1, Math.ceil(state.data.totalCount / 10))}
          loading={state.loading}
          onChange={(next) => setValues({ page: String(next) })}
        />
      )}
    </>
  );
}

export function MemberServices({
  section = "gym",
  compact = false,
}: {
  section?: "gym" | "pt";
  showVisits?: boolean;
  compact?: boolean;
}) {
  const { t } = useLanguage();
  const packages = useApi(
    async (signal) =>
      (
        await api.get<MemberPackageDto[]>("/api/members/me/packages", {
          signal,
        })
      ).filter((row) => !isRetiredActivityPackage(row.packageName)),
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
      <div>
        {section === "gym" ? (
          <>
            <AsyncSection state={packages} isEmpty={(rows) => !rows.length}>
              {(rows) => (
                <div className={compact ? styles.packages : "stack"}>
                  {rows.map((p) => (
                    <Card key={p.memberPackageId} title={p.packageName}>
                      <p>
                        <StatusChip value={p.status} />
                      </p>
                      <p>
                        {formatDate(p.startDate)} – {formatDate(p.endDate)}
                      </p>
                      {p.isUsable && (
                        <ul>
                          <li>
                            {p.sessionLimit === null
                              ? t.memberPages.unlimitedGym
                              : t.memberPages.gymVisitsLeft.replace(
                                  "{n}",
                                  String(p.remainingSessions ?? 0),
                                )}
                          </li>
                          <li>{t.memberPages.ptSeparatePurchase}</li>
                        </ul>
                      )}
                    </Card>
                  ))}
                </div>
              )}
            </AsyncSection>
            <section id="visits" className="stack">
              <h3>{t.memberPages.visits}</h3>
              <Visits />
            </section>
          </>
        ) : (
          <>
            <AsyncSection state={entitlements} isEmpty={(rows) => !rows.length}>
              {(rows) => (
                <div className={compact ? styles.packages : "stack"}>
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

          </>
        )}
      </div>
    </>
  );
}
