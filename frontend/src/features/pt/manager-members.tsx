"use client";

import listStyles from "./manager-members.module.css";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { pagedItems } from "@/lib/paged";
import { formatDate } from "@/lib/format";
import { AsyncSection, Card, Field, StatusChip, Table } from "@/components/ui";
import { Tabs } from "@/components/primitives";
import { Pagination } from "@/features/operations";
import { InvoiceList } from "@/features/payments";
import type {
  CoachMemberRelationshipDto,
  MemberPackageDto,
  Paged,
  PtEntitlementDto,
  UserAdminDto,
} from "@/lib/types";
import { trainingStyles as styles } from "@/features/training";

/** Danh sách hội viên của Manager (Q12). Chỉ xem, mở hồ sơ vận hành. */
export function ManagerMemberList() {
  const { t } = useLanguage();
  const l = t.ptOps;
  const [keyword, setKeyword] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => {
    const id = window.setTimeout(() => {
      setDebounced(keyword.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(id);
  }, [keyword]);
  const search = debounced.length === 1 ? "" : debounced;
  const state = useApi(
    (signal) =>
      api.get<Paged<UserAdminDto>>("/api/users", {
        signal,
        query: { keyword: search, role: "Member", page, pageSize: 20 },
      }),
    [search, page],
  );
  return (
    <Card title={l.members}>
      <div className={listStyles.search}>
        <Field label={l.findMember}>
          <input
            type="search"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </Field>
      </div>
      <AsyncSection state={state}>
        {(data) => {
          const rows = pagedItems(data);
          if (!rows.length)
            return <p className={styles.muted}>{l.noMembers}</p>;
          return (
            <>
              <div className={listStyles.memberTable}>
                <Table
                  headers={[
                    t.frontDesk.colName,
                    t.frontDesk.colContact,
                    t.frontDesk.colStatus,
                    "",
                  ]}
                >
                  {rows.map((m) => (
                    <tr key={m.userId}>
                      <td>{m.fullName || m.email}</td>
                      <td>
                        {m.email}
                        {m.phone ? ` · ${m.phone}` : ""}
                      </td>
                      <td>
                        <StatusChip value={m.status} />
                      </td>
                      <td>
                        <Link
                          className="btn btn--secondary btn--sm"
                          href={`/manager/members/${m.userId}`}
                        >
                          {l.openMember}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </Table>
              </div>
              <div className={listStyles.pagination}>
                <Pagination
                  page={page}
                  count={data.totalCount}
                  onChange={setPage}
                />
              </div>
            </>
          );
        }}
      </AsyncSection>
    </Card>
  );
}

type TabId = "overview" | "invoices";

/** Hồ sơ vận hành của hội viên (Q12): Membership, gói PT, quan hệ Coach, hóa đơn. Không có thao tác sửa kế hoạch tập. */
export function ManagerMemberProfile({ memberId }: { memberId: string }) {
  const { t } = useLanguage();
  const l = t.ptOps;
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab: TabId = params.get("tab") === "invoices" ? "invoices" : "overview";
  const member = useApi(
    (signal) => api.get<UserAdminDto>(`/api/users/${memberId}`, { signal }),
    [memberId],
  );
  const packages = useApi(
    (signal) =>
      api.get<MemberPackageDto[]>(`/api/members/${memberId}/packages`, {
        signal,
      }),
    [memberId],
  );
  const entitlements = useApi(
    (signal) =>
      api.get<PtEntitlementDto[]>("/api/manager/pt-entitlements", {
        signal,
        query: { memberId, page: 1, pageSize: 20 },
      }),
    [memberId],
  );
  const pairs = useApi(
    (signal) =>
      api.get<CoachMemberRelationshipDto[]>("/api/coach-member-relationships", {
        signal,
        query: { memberId, page: 1, pageSize: 20, activeOnly: false },
      }),
    [memberId],
  );

  return (
    <div className={styles.page}>
      <Link className={styles.back} href="/manager/members">
        ← {l.members}
      </Link>
      <AsyncSection state={member}>
        {(m) => (
          <section
            className={styles.summary}
            aria-label={m.fullName || m.email}
          >
            <div>
              <p className={styles.coachName}>{m.fullName || m.email}</p>
              <p className={styles.muted}>
                {m.email}
                {m.phone ? ` · ${m.phone}` : ""}
              </p>
            </div>
            <div className={styles.next}>
              <StatusChip value={m.status} />
              <p className={styles.muted}>{l.readOnlyNote}</p>
            </div>
          </section>
        )}
      </AsyncSection>
      <Tabs
        tabs={[
          { id: "overview", label: l.memberOverview },
          { id: "invoices", label: l.memberInvoices },
        ]}
        value={tab}
        ariaLabel={l.memberTabsLabel}
        onChange={(id) => router.replace(`${pathname}?tab=${id}`)}
      >
        <div className={styles.tabBody}>
          {tab === "invoices" ? (
            <InvoiceList staff memberId={memberId} />
          ) : (
            <>
              <section className={styles.section}>
                <h2>{l.gymMembership}</h2>
                <AsyncSection
                  state={packages}
                  isEmpty={(rows) => !rows.length}
                  emptyMessage={l.noMembership}
                >
                  {(rows) => (
                    <ul className={styles.list}>
                      {rows.map((p) => (
                        <li key={p.memberPackageId}>
                          <div>
                            <strong>{p.packageName}</strong>
                            <span>
                              {formatDate(p.startDate)} –{" "}
                              {formatDate(p.endDate)}
                            </span>
                          </div>
                          <StatusChip value={p.status} />
                        </li>
                      ))}
                    </ul>
                  )}
                </AsyncSection>
              </section>
              <section className={styles.section}>
                <h2>{l.ptPackages}</h2>
                <AsyncSection
                  state={entitlements}
                  isEmpty={(rows) => !pagedItems(rows).length}
                  emptyMessage={l.noPtPackages}
                >
                  {(rows) => (
                    <ul className={styles.list}>
                      {pagedItems(rows).map((e) => (
                        <li key={e.entitlementId}>
                          <div>
                            <strong>{e.coachName}</strong>
                            <span>
                              {e.remainingQuota} / {e.totalQuota} ·{" "}
                              {formatDate(e.validityStartDate)} –{" "}
                              {formatDate(e.validityEndDate)}
                            </span>
                          </div>
                          <StatusChip value={e.status} />
                        </li>
                      ))}
                    </ul>
                  )}
                </AsyncSection>
              </section>
              <section className={styles.section}>
                <h2>{l.pairs}</h2>
                <AsyncSection
                  state={pairs}
                  isEmpty={(rows) => !pagedItems(rows).length}
                  emptyMessage={l.noPairs}
                >
                  {(rows) => (
                    <ul className={styles.list}>
                      {pagedItems(rows).map((p) => (
                        <li key={p.relationshipId}>
                          <div>
                            <strong>{p.coachName}</strong>
                          </div>
                          <StatusChip value={p.status} />
                        </li>
                      ))}
                    </ul>
                  )}
                </AsyncSection>
              </section>
            </>
          )}
        </div>
      </Tabs>
    </div>
  );
}
