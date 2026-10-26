"use client";
import { PendingMemberActions } from "@/features/receptionist";
import type { CourseEnrollmentDto } from "@/lib/types";
import listStyles from "./manager-members.module.css";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { pagedItems } from "@/lib/paged";
import { formatDate } from "@/lib/format";
import { AsyncSection, Card, Field, StatusChip, Table } from "@/components/ui";
import { Tabs } from "@/components/primitives";
import { Pagination } from "@/features/operations";
import { InvoiceList } from "@/features/payments";
import type { MemberPackageDto, Paged, UserAdminDto } from "@/lib/types";
import { trainingStyles as styles } from "@/features/training";
import { AvatarImage } from "@/components/AvatarImage";
import { PersonProfileHeader } from "@/components/PersonProfileHeader";
import profileStyles from "@/components/PersonProfile.module.css";
import { RemoveMemberAvatarButton } from "@/components/RemoveMemberAvatarButton";
import { RegisterMemberDialog } from "@/features/receptionist";
import { MemberRentalHistory } from "./member-rental-history";

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
                          <div className={listStyles.actions}>
                            <PendingMemberActions
                              member={m}
                              onChanged={state.reload}
                            />
                            <Link
                              className="btn btn--secondary btn--sm"
                              href={`/manager/members/${m.userId}`}
                            >
                              View details
                            </Link>
                          </div>
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

/** Hồ sơ vận hành của hội viên (Q12): Membership, quan hệ Coach, hóa đơn. Không có thao tác sửa kế hoạch tập. */
export function ManagerMemberProfile({ memberId }: { memberId: string }) {
  const { t } = useLanguage();
  const [tab, setTab] = useState("packages");
  const [page, setPage] = useState(1);
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
  const enrollments = useApi(
    (signal) =>
      api.get<Paged<CourseEnrollmentDto>>(
        `/api/members/${memberId}/enrollments`,
        { signal, query: { page, pageSize: 20 } },
      ),
    [memberId, page],
  );
  return (
    <div className={profileStyles.page}>
      <Link className="btn btn--ghost" href="/manager/people?role=Member">
        {t.managerOperations.backToList}
      </Link>
      <AsyncSection state={member}>
        {(m) => (
          <PersonProfileHeader
            name={m.fullName || m.email}
            avatarUrl={m.avatarUrl}
            contact={
              <p>
                {m.email}
                {m.phone ? ` · ${m.phone}` : ""}
              </p>
            }
            actions={
              m.avatarUrl && (
                <RemoveMemberAvatarButton
                  memberId={m.userId}
                  memberName={m.fullName || m.email}
                  onRemoved={member.reload}
                />
              )
            }
            status={
              <StatusChip
                value={m.activationPending ? "PENDING_ACTIVATION" : m.status}
              />
            }
          />
        )}
      </AsyncSection>
      <div className={profileStyles.tabs}>
        <Tabs
          value={tab}
          onChange={setTab}
          ariaLabel="Member details"
          tabs={[
            { id: "packages", label: "Memberships" },
            { id: "classes", label: "Classes" },
            { id: "rentals", label: "Rental history" },
            { id: "invoices", label: "Payment history" },
          ]}
        >
          <div
            className={profileStyles.tabBody}
            data-surface={tab !== "invoices"}
          >
            {tab === "packages" && (
              <AsyncSection state={packages}>
                {(rows) =>
                  rows.length ? (
                    <Table headers={["Membership", "Start", "End", "Status"]}>
                      {rows.map((p) => (
                        <tr key={p.memberPackageId}>
                          <td>{p.packageName}</td>
                          <td>{formatDate(p.startDate)}</td>
                          <td>{formatDate(p.endDate)}</td>
                          <td>
                            <StatusChip value={p.status} />
                          </td>
                        </tr>
                      ))}
                    </Table>
                  ) : (
                    <p className={profileStyles.empty}>No memberships yet.</p>
                  )
                }
              </AsyncSection>
            )}
            {tab === "classes" && (
              <AsyncSection state={enrollments}>
                {(data) => (
                  <>
                    <Table headers={["Class", "Sport", "Status"]}>
                      {data.items.map((e) => (
                        <tr key={e.enrollmentId}>
                          <td>
                            <Link href={`/manager/classes/${e.classId}`}>
                              {e.className}
                            </Link>
                          </td>
                          <td>{e.sportName}</td>
                          <td>
                            <StatusChip value={e.status} />
                          </td>
                        </tr>
                      ))}
                    </Table>
                    <Pagination
                      page={page}
                      count={data.totalCount}
                      onChange={setPage}
                    />
                  </>
                )}
              </AsyncSection>
            )}
            {tab === "invoices" && <InvoiceList staff memberId={memberId} />}
            {tab === "rentals" && (
              <MemberRentalHistory key={memberId} memberId={memberId} />
            )}
          </div>
        </Tabs>
      </div>
    </div>
  );
}
