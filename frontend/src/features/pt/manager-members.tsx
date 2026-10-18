"use client";
import listStyles from "./manager-members.module.css";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { pagedItems } from "@/lib/paged";
import { formatDate, formatDateTime } from "@/lib/format";
import { AsyncSection, Card, Field, StatusChip, Table } from "@/components/ui";
import { Tabs } from "@/components/primitives";
import { Pagination } from "@/features/operations";
import { InvoiceList } from "@/features/payments";
import type {
  CoachMemberRelationshipDto,
  MemberPackageDto,
  Paged,
  UserAdminDto,
} from "@/lib/types";
import { trainingStyles as styles } from "@/features/training";
import { MemberHealthProfile } from "./member-health-profile";
import { AvatarImage } from "@/components/AvatarImage";
import { ReportAvatarButton } from "@/components/ReportAvatarButton";
import { AssignCoachDialog } from "./assign-coach-dialog";
import { EndRelationshipDialog } from "./end-relationship-dialog";
import {
  PendingMemberPanel,
  RegisterMemberDialog,
} from "@/features/receptionist";

/** Danh sách hội viên của Manager và đăng ký Member tại quầy. */
export function ManagerMemberList() {
  const { t } = useLanguage();
  const l = t.ptOps;
  const router = useRouter();
  const [registering, setRegistering] = useState(false);
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
    <div>
      <Card
        title={l.members}
        actions={
          <button
            type="button"
            className="btn"
            onClick={() => setRegistering(true)}
          >
            {t.frontDesk.openRegistration}
          </button>
        }
      >
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
                        <td>
                          <AvatarImage
                            name={m.fullName || m.email}
                            avatarUrl={m.avatarUrl}
                            size={32}
                          />{" "}
                          {m.fullName || m.email}
                        </td>
                        <td>
                          {m.email}
                          {m.phone ? ` · ${m.phone}` : ""}
                        </td>
                        <td>
                          {m.activationPending ? (
                            <StatusChip
                              value="PENDING_ACTIVATION"
                              tone="warning"
                              label={t.frontDesk.pendingActivation}
                            />
                          ) : (
                            <StatusChip value={m.status} />
                          )}
                        </td>
                        <td>
                          <ReportAvatarButton
                            targetUserId={m.userId}
                            avatarUrl={m.avatarUrl}
                          />
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
      {registering && (
        <RegisterMemberDialog
          onClose={() => setRegistering(false)}
          onCreated={(member) => {
            setRegistering(false);
            router.push(`/manager/members/${member.userId}`);
          }}
        />
      )}
    </div>
  );
}

type TabId = "overview" | "invoices" | "health";

/** Hồ sơ vận hành của hội viên (Q12): Membership, quan hệ Coach, hóa đơn. Không có thao tác sửa kế hoạch tập. */
export function ManagerMemberProfile({ memberId }: { memberId: string }) {
  const [assigning, setAssigning] = useState(false);
  const [ending, setEnding] = useState<CoachMemberRelationshipDto | null>(null);
  const { t, language } = useLanguage();
  const l = t.ptOps;
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const requested = params.get("tab");
  const tab: TabId =
    requested === "invoices" || requested === "health" ? requested : "overview";
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
          <>
            <section
              className={styles.summary}
              aria-label={m.fullName || m.email}
            >
              <div>
                <AvatarImage
                  name={m.fullName || m.email}
                  avatarUrl={m.avatarUrl}
                  size={64}
                />
                <p className={styles.coachName}>{m.fullName || m.email}</p>
                <ReportAvatarButton
                  targetUserId={m.userId}
                  avatarUrl={m.avatarUrl}
                />
                <p className={styles.muted}>
                  {m.email}
                  {m.phone ? ` · ${m.phone}` : ""}
                </p>
              </div>
              <div className={styles.next}>
                {m.activationPending ? (
                  <StatusChip
                    value="PENDING_ACTIVATION"
                    tone="warning"
                    label={t.frontDesk.pendingActivation}
                  />
                ) : (
                  <StatusChip value={m.status} />
                )}
                <p className={styles.muted}>{l.readOnlyNote}</p>
              </div>
            </section>
            {m.activationPending && (
              <PendingMemberPanel
                key={m.userId}
                member={m}
                onChange={() => member.reload()}
              />
            )}
          </>
        )}
      </AsyncSection>
      <Tabs
        tabs={[
          { id: "overview", label: l.memberOverview },
          { id: "invoices", label: l.memberInvoices },
          {
            id: "health",
            label: language === "vi" ? "Hồ sơ sức khỏe" : "Health profile",
          },
        ]}
        value={tab}
        ariaLabel={l.memberTabsLabel}
        onChange={(id) => router.replace(`${pathname}?tab=${id}`)}
      >
        <div className={styles.tabBody}>
          {tab === "health" ? (
            <MemberHealthProfile key={memberId} memberId={memberId} />
          ) : tab === "invoices" ? (
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
                <div className={listStyles.sectionHeader}>
                  <h2>{l.pairs}</h2>
                  <button
                    type="button"
                    className="btn btn--sm"
                    disabled={!member.data || member.data.status !== "ACTIVE"}
                    onClick={() => setAssigning(true)}
                  >
                    {language === "vi" ? "Phân công HLV" : "Assign coach"}
                  </button>
                </div>
                <AsyncSection
                  state={pairs}
                  isEmpty={(rows) => !pagedItems(rows).length}
                  emptyMessage={l.noPairs}
                >
                  {(rows) => (
                    <ul className={styles.list}>
                      {pagedItems(rows).map((p) => (
                        <li key={p.relationshipId}>
                          <div className={listStyles.relationshipDetails}>
                            <strong>{p.coachName}</strong>
                            <span>
                              {p.sourceType === "ASSIGNED_BY_MANAGER"
                                ? "Assigned by Manager"
                                : "Class assignment"}
                            </span>
                            {p.status === "ACTIVE" ? (
                              (p.activeClasses ?? []).map((course) => (
                                <Link
                                  key={course.classId}
                                  href={`/manager/classes/${course.classId}`}
                                >
                                  {course.className}
                                </Link>
                              ))
                            ) : (
                              <>
                                {p.endedAt && (
                                  <span>Ended {formatDateTime(p.endedAt)}</span>
                                )}
                                <span>
                                  {p.endReason ?? "End reason not recorded."}
                                </span>
                              </>
                            )}
                          </div>
                          <div className={listStyles.relationshipActions}>
                            <StatusChip value={p.status} />
                            {p.status === "ACTIVE" && (
                              <button
                                type="button"
                                className="btn btn--secondary btn--sm"
                                aria-label={
                                  language === "vi"
                                    ? `Kết thúc quan hệ với ${p.coachName}`
                                    : `End relationship with ${p.coachName}`
                                }
                                onClick={() => setEnding(p)}
                              >
                                {language === "vi"
                                  ? "Kết thúc quan hệ"
                                  : "End relationship"}
                              </button>
                            )}
                          </div>
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
      {assigning && member.data && (
        <AssignCoachDialog
          member={member.data}
          onClose={() => setAssigning(false)}
          onCreated={() => {
            setAssigning(false);
            pairs.reload();
          }}
        />
      )}
      {ending && (
        <EndRelationshipDialog
          relationship={ending}
          onClose={() => setEnding(null)}
          onEnded={() => {
            setEnding(null);
            pairs.reload();
          }}
        />
      )}
    </div>
  );
}
