"use client";
import { hasService } from "@/lib/sports";
import { pagedItems } from "@/lib/paged";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import {
  formatDate,
  formatDateTime,
  formatMoney,
} from "@/lib/format";
import { AsyncSection, Card, Field, Table, StatusChip } from "@/components/ui";
import { MemberPicker } from "@/components/MemberPicker";
import { useDeskMember } from "./desk-context";
import { RegistrationHint } from "./dashboard";
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
  SportDto,
} from "@/lib/types";
export function MemberDesk({
  mode,
  initialMember = null,
}: {
  mode: "sales" | "courses" | "wallet" | "gym" | "invoices";
  initialMember?: UserAdminDto | null;
}) {
  const { t } = useLanguage();
  const desk = useDeskMember();
  // Ngoài khung quầy (không có provider) vẫn chạy được bằng state cục bộ.
  const [local, setLocal] = useState<UserAdminDto | null>(initialMember);
  const member = desk.member ?? local;
  const setMember = (next: UserAdminDto | null) => {
    setLocal(next);
    desk.setMember(next);
  };
  const initialId = initialMember?.userId;
  useEffect(() => {
    if (initialMember && desk.member?.userId !== initialId)
      desk.setMember(initialMember);
    // chỉ đồng bộ khi link mang sẵn hội viên (quét QR, link hóa đơn)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialId]);
  return (
    <>
      <MemberPicker
        value={member}
        onChange={setMember}
        emptyHint={<RegistrationHint />}
      />
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
export function CoursePurchase({ memberId }: { memberId: string }) {
  const { t } = useLanguage();
  const l = t.operations;
  const [page, setPage] = useState(1);
  const [sportId, setSport] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const sports = useApi(
    (s) => api.get<SportDto[]>("/api/sports", { signal: s }),
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
            ?.filter((s) => hasService(s, "GROUP_COURSE"))
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
export function PlanSales({ member }: { member: UserAdminDto }) {
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
export function MemberWallet({ memberId }: { memberId: string }) {
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
export function GymVisits({ memberId }: { memberId: string }) {
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
