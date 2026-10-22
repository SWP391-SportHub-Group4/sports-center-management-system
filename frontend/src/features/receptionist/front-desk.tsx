"use client";
import { hasService } from "@/lib/sports";
import { pagedItems } from "@/lib/paged";
import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import {
  AsyncSection,
  Card,
  Dialog,
  Field,
  Table,
  StatusChip,
} from "@/components/ui";
import { MemberPicker } from "@/components/MemberPicker";
import { useDeskMember } from "./desk-context";
import { RegistrationHint } from "./dashboard";
import { SelectedMemberPanel } from "./selected-member";
import { CheckoutPanel } from "@/features/payments";
import { WalletBalance } from "@/features/wallet";
import { WalletLedger } from "@/features/wallet";
import { InvoiceList } from "@/features/payments";
import { Pagination } from "@/features/operations";
import { courseApi, isCourseOpenForRegistration } from "@/features/courses";
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
      {mode === "gym" && member ? (
        <SelectedMemberPanel
          key={member.userId}
          member={member}
          onChange={setMember}
          showProfileLink={false}
          withExtras={false}
        />
      ) : (
        <MemberPicker
          value={member}
          onChange={setMember}
          emptyHint={<RegistrationHint />}
        />
      )}
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
  const [sportId, setSport] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const sports = useApi(
    (s) => api.get<SportDto[]>("/api/sports", { signal: s }),
    [],
  );
  const courses = useApi(
    async (s) => {
      const result = await courseApi.list({ page: 1, pageSize: 100, sportId }, s);
      return pagedItems(result).filter((c) =>
        isCourseOpenForRegistration(c, Date.now()),
      );
    },
    [sportId],
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
              {data.map((c) => (
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
export function PlanSales({
  member,
  initialPlan = null,
}: {
  member: UserAdminDto;
  initialPlan?: number | null;
}) {
  const memberId = member.userId;
  const { t } = useLanguage();
  const l = t.operations;
  const [selected, setSelected] = useState<number | null>(initialPlan);
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
        <Dialog
          title={`${selectedPlan.name} · ${member.fullName || member.email}`}
          size="lg"
          onClose={() => setSelected(null)}
        >
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
                ...(selectedPlan.durationDays === 1
                  ? [
                      {
                        label: "Lưu ý trước khi thanh toán",
                        value:
                          "Vé Gym 1 ngày và mã check-in chỉ dùng trong ngày thanh toán thành công (giờ Việt Nam). Hãy thông báo điều này cho Member trước khi thu tiền.",
                      },
                    ]
                  : []),
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
        </Dialog>
      )}
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
        )}
      </AsyncSection>
      <AsyncSection state={history}>
        {(data) => (
          <>
            <Table headers={[l.start]}>
              {pagedItems(data).map((v) => (
                <tr key={v.checkInId}>
                  <td>{formatDateTime(v.checkInTime)}</td>
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
