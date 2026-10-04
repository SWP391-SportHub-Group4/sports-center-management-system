"use client";
import { pagedItems } from "@/lib/paged";
import { useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import {
  todayIso,
  formatDate,
  formatDateTime,
  formatMoney,
} from "@/lib/format";
import { AsyncSection, Card, Field, Table, StatusChip } from "@/components/ui";
import { MemberPicker } from "@/components/MemberPicker";
import { ScanMemberPanel } from "./scan-member";
import { CheckoutPanel } from "@/features/payments";
import { PtPurchase } from "@/features/membership";
import { WalletBalance } from "@/features/wallet";
import { WalletLedger } from "@/features/wallet";
import { InvoiceList } from "@/features/payments";
import {
  MutationFeedback,
  Pagination,
  useMutation,
} from "@/features/operations";
import { courseApi } from "@/features/courses";
import styles from "./front-desk.module.css";
import type {
  UserAdminDto,
  CourseSessionDto,
  GymCheckInDto,
  MemberPackageDto,
  MembershipPackageDto,
  WalletBalanceDto,
  Paged,
  InvoiceSummaryDto,
  CourtScheduleEntryDto,
} from "@/lib/types";
export function MemberDesk({
  mode,
  initialMember = null,
}: {
  mode: "sales" | "courses" | "wallet" | "gym" | "invoices";
  initialMember?: UserAdminDto | null;
}) {
  const { t } = useLanguage();
  const [member, setMember] = useState<UserAdminDto | null>(initialMember);
  return (
    <>
      <MemberPicker value={member} onChange={setMember} />
      {member ? (
        <MemberWork
          key={`${member.userId}-${mode}`}
          member={member}
          mode={mode}
        />
      ) : (
        <p>{t.operations.selectMember}</p>
      )}
    </>
  );
}
function CoursePurchase({ memberId }: { memberId: string }) {
  const { t } = useLanguage();
  const l = t.operations;
  const [page, setPage] = useState(1);
  const [sportId, setSport] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const sports = useApi(
    (s) =>
      api.get<{ sportId: number; name: string; operationType: string }[]>(
        "/api/sports",
        { signal: s },
      ),
    [],
  );
  const courses = useApi(
    (s) => courseApi.list({ page, pageSize: 20, sportId }, s),
    [page, sportId],
  );
  const schedule = useApi(
    (s) =>
      selected
        ? api.get<CourseSessionDto[]>(`/api/classes/${selected}/sessions`, {
            signal: s,
          })
        : Promise.resolve(null),
    [selected],
  );
  return (
    <>
      <Field label={l.sport}>
        <select
          value={sportId}
          onChange={(e) => {
            setSport(e.target.value);
            setPage(1);
            setSelected(null);
          }}
        >
          <option value="">{l.all}</option>
          {sports.data
            ?.filter((s) => s.operationType === "GROUP_COURSE")
            .map((s) => (
              <option key={s.sportId} value={s.sportId}>
                {s.name}
              </option>
            ))}
        </select>
      </Field>
      <AsyncSection state={courses}>
        {(data) => (
          <>
            <Table
              headers={[
                l.name,
                l.coach,
                l.numSessions,
                l.startDate,
                l.price,
                l.availableSeats,
                "",
              ]}
            >
              {pagedItems(data).map((c) => (
                <tr key={c.classId}>
                  <td>{c.name}</td>
                  <td>{c.coachName}</td>
                  <td>{c.numSessions}</td>
                  <td>{formatDate(c.startDate)}</td>
                  <td>{formatMoney(c.price)}</td>
                  <td>{c.availableSeats}</td>
                  <td>
                    <button
                      className="btn btn--secondary"
                      onClick={() => setSelected(c.classId)}
                    >
                      {l.details}
                    </button>
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
      {selected && (
        <>
          <AsyncSection state={schedule}>
            {(rows) => (
              <Table headers={[l.start, l.room, l.coach]}>
                {rows.map((s) => (
                  <tr key={s.sessionId}>
                    <td>{formatDateTime(s.startAtUtc)}</td>
                    <td>{s.roomName}</td>
                    <td>{s.coachName}</td>
                  </tr>
                ))}
              </Table>
            )}
          </AsyncSection>
          <CheckoutPanel
            key={selected}
            memberId={memberId}
            intent={{
              kind: "class",
              body: { classId: selected, targetMemberId: memberId },
            }}
            onChange={courses.reload}
          />
        </>
      )}
    </>
  );
}
function MemberWork({
  member,
  mode,
}: {
  member: UserAdminDto;
  mode: "sales" | "courses" | "wallet" | "gym" | "invoices";
}) {
  if (mode === "courses") return <CoursePurchase memberId={member.userId} />;
  if (mode === "wallet") return <MemberWallet memberId={member.userId} />;
  if (mode === "invoices")
    return <InvoiceList staff memberId={member.userId} />;
  if (mode === "gym") return <GymVisits memberId={member.userId} />;
  return <PlanSales member={member} />;
}
function PlanSales({ member }: { member: UserAdminDto }) {
  const memberId = member.userId;
  const { t } = useLanguage();
  const l = t.operations;
  const [selected, setSelected] = useState<number | null>(null);
  const catalog = useApi(
    (s) =>
      api.get<MembershipPackageDto[]>("/api/membership-packages", {
        signal: s,
      }),
    [],
  );
  const packages = useApi(
    (s) =>
      api.get<MemberPackageDto[]>(`/api/members/${memberId}/packages`, {
        signal: s,
      }),
    [memberId],
  );
  const selectedPlan = catalog.data?.find(
    (p) => p.packageId === selected && p.isActive,
  );
  return (
    <>
      <Card title={l.gym}>
        <AsyncSection state={catalog}>
          {(rows) => (
            <div className={styles.plans}>
              <Table headers={[l.name, l.price, t.refactor.days, ""]}>
                {rows
                  .filter((p) => p.isActive)
                  .map((p) => (
                    <tr key={p.packageId}>
                      <td>{p.name}</td>
                      <td>{formatMoney(p.price)}</td>
                      <td>{p.durationDays}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn--secondary"
                          aria-pressed={selected === p.packageId}
                          onClick={() => setSelected(p.packageId)}
                        >
                          {l.selectPlan}
                        </button>
                      </td>
                    </tr>
                  ))}
              </Table>
            </div>
          )}
        </AsyncSection>
      </Card>
      {selectedPlan && (
        <CheckoutPanel
          key={selectedPlan.packageId}
          memberId={memberId}
          review={{
            title: l.purchaseReview,
            submitLabel: l.createInvoice,
            items: [
              { label: l.member, value: member.fullName || member.email },
              { label: l.email, value: member.email },
              { label: l.name, value: selectedPlan.name },
              { label: l.price, value: formatMoney(selectedPlan.price) },
              {
                label: l.membershipDuration,
                value: `${selectedPlan.durationDays} ${t.refactor.days}`,
              },
            ],
          }}
          intent={{
            kind: "membership",
            body: {
              packageId: selectedPlan.packageId,
              targetMemberId: memberId,
              allowStacking: false,
            },
          }}
          onChange={packages.reload}
        />
      )}
      <AsyncSection state={packages}>
        {(rows) => <PtPurchase packages={rows} memberId={memberId} />}
      </AsyncSection>
    </>
  );
}
function MemberWallet({ memberId }: { memberId: string }) {
  const balance = useApi(
    (s) =>
      api.get<WalletBalanceDto>(`/api/members/${memberId}/points`, {
        signal: s,
      }),
    [memberId],
  );
  return (
    <>
      <AsyncSection state={balance}>
        {(data) => <WalletBalance balance={data} />}
      </AsyncSection>
      <WalletLedger memberId={memberId} />
    </>
  );
}
function GymVisits({ memberId }: { memberId: string }) {
  const { t } = useLanguage();
  const l = t.operations;
  const [page, setPage] = useState(1);
  const mutation = useMutation();
  const packages = useApi(
    (s) =>
      api.get<MemberPackageDto[]>(`/api/members/${memberId}/packages`, {
        signal: s,
      }),
    [memberId],
  );
  const history = useApi(
    (s) =>
      api.get<Paged<GymCheckInDto>>(`/api/members/${memberId}/gym-checkins`, {
        signal: s,
        query: { page, pageSize: 20 },
      }),
    [memberId, page],
  );
  return (
    <>
      <AsyncSection state={packages}>
        {(rows) => (
          <>
            <Table headers={[l.gym, l.status, l.end]}>
              {rows.map((p) => (
                <tr key={p.memberPackageId}>
                  <td>{p.packageName}</td>
                  <td>
                    <StatusChip value={p.status} />
                  </td>
                  <td>{formatDate(p.endDate)}</td>
                </tr>
              ))}
            </Table>
            <button
              className="btn"
              disabled={
                mutation.busy ||
                !rows.some((p) => p.status === "ACTIVE" && p.isUsable)
              }
              onClick={async () => {
                if (
                  await mutation.run(async () => {
                    try {
                      await api.post("/api/gym-checkins", {
                        targetMemberId: memberId,
                      });
                    } catch (error) {
                      if (
                        error instanceof ApiError &&
                        error.code === "gym_already_checked_in"
                      ) {
                        history.reload();
                        throw new ApiError(
                          error.status,
                          error.code,
                          l.gymAlreadyInside,
                          error.details,
                        );
                      }
                      throw error;
                    }
                  })
                )
                  history.reload();
              }}
            >
              {l.checkIn}
            </button>
          </>
        )}
      </AsyncSection>
      <MutationFeedback mutation={mutation} />
      <AsyncSection state={history}>
        {(data) => (
          <>
            <Table headers={[l.start, l.end, ""]}>
              {pagedItems(data).map((v) => (
                <tr key={v.checkInId}>
                  <td>{formatDateTime(v.checkInTime)}</td>
                  <td>
                    {v.checkOutTime ? formatDateTime(v.checkOutTime) : l.inside}
                  </td>
                  <td>
                    {!v.checkOutTime && (
                      <button
                        className="btn btn--secondary"
                        disabled={mutation.busy}
                        onClick={async () => {
                          if (
                            await mutation.run(() =>
                              api.post(
                                `/api/gym-checkins/${v.checkInId}/checkout`,
                              ),
                            )
                          )
                            history.reload();
                        }}
                      >
                        {l.checkOut}
                      </button>
                    )}
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
    </>
  );
}
export function ReceptionDashboard() {
  const { t } = useLanguage();
  const l = t.operations;
  const today = todayIso();
  const schedule = useApi(
    (s) =>
      api.get<CourtScheduleEntryDto[]>("/api/manager/court-schedule", {
        signal: s,
        query: { fromDate: today, toDate: today },
      }),
    [today],
  );
  const invoices = useApi(
    (s) =>
      api.get<Paged<InvoiceSummaryDto>>("/api/invoices", {
        signal: s,
        query: { status: "ISSUED", page: 1, pageSize: 10 },
      }),
    [],
  );
  return (
    <>
      <ScanMemberPanel />
      <Card title={l.classSession}>
        <AsyncSection state={schedule}>
          {(rows) => (
            <Table headers={[l.name, l.start, l.room, l.coach]}>
              {rows
                .filter((r) => r.sourceType === "CLASS_SESSION")
                .map((r) => (
                  <tr key={r.sourceId}>
                    <td>{r.title}</td>
                    <td>{formatDateTime(r.startAtUtc)}</td>
                    <td>{r.roomId}</td>
                    <td>{r.coachName}</td>
                  </tr>
                ))}
            </Table>
          )}
        </AsyncSection>
      </Card>
      <Card title={l.pending}>
        <AsyncSection state={invoices}>
          {(data) => (
            <Table headers={[l.invoices, l.member, l.price, ""]}>
              {pagedItems(data).map((i) => (
                <tr key={i.invoiceId}>
                  <td>{i.invoiceNumber}</td>
                  <td>{i.memberName}</td>
                  <td>{formatMoney(i.totalAmount)}</td>
                  <td>
                    <Link
                      className="btn btn--secondary"
                      href={`/receptionist/invoices?invoiceId=${i.invoiceId}`}
                    >
                      {l.details}
                    </Link>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </AsyncSection>
      </Card>
      <Card title={l.inside}>
        <GymInside />
        <MemberDesk mode="gym" />
      </Card>
    </>
  );
}
function GymInside() {
  const { t } = useLanguage();
  const l = t.operations;
  const [page, setPage] = useState(1);
  const mutation = useMutation();
  const state = useApi(
    (signal) =>
      api.get<
        Paged<{
          checkInId: string;
          memberId: string;
          memberName: string;
          checkInTime: string;
        }>
      >("/api/gym-checkins/inside", { signal, query: { page, pageSize: 20 } }),
    [page],
  );
  return (
    <>
      <button className="btn btn--ghost" onClick={state.reload}>
        {l.refresh}
      </button>
      <AsyncSection state={state}>
        {(data) => (
          <>
            <p>
              {l.inside}: {data.totalCount}
            </p>
            <Table headers={[l.member, l.start, ""]}>
              {pagedItems(data).map((row) => (
                <tr key={row.checkInId}>
                  <td>{row.memberName}</td>
                  <td>{formatDateTime(row.checkInTime)}</td>
                  <td>
                    <button
                      className="btn btn--secondary"
                      disabled={mutation.busy}
                      onClick={async () => {
                        if (
                          await mutation.run(() =>
                            api.post(
                              `/api/gym-checkins/${row.checkInId}/checkout`,
                            ),
                          )
                        )
                          state.reload();
                      }}
                    >
                      {l.checkOut}
                    </button>
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
      <MutationFeedback mutation={mutation} />
    </>
  );
}
