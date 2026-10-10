"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { AsyncSection, Card, Feedback, Field, PageNav } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { formatDateTime } from "@/lib/format";
import { useAction, useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import type { MemberBmiProfileDto, Paged } from "@/lib/types";
import { BmiResult } from "./training-profile";
import styles from "./bmi-profile.module.css";

export function BmiDesk({ memberId }: { memberId: string }) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const action = useAction();
  const submitting = useRef(false);
  const [appointment, setAppointment] = useState("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const state = useApi(
    async (signal) => ({
      profile: await api.get<MemberBmiProfileDto | null>(
        `/api/members/${memberId}/bmi-profile`,
        { signal },
      ),
    }),
    [memberId],
  );
  async function save(kind: "appointment" | "measurement") {
    if (submitting.current) return;
    submitting.current = true;
    try {
      const saved = await action.run(
        () =>
          kind === "appointment"
            ? api.put<MemberBmiProfileDto>(
                `/api/members/${memberId}/bmi-appointment`,
                {
                  appointmentAt: new Date(`${appointment}+07:00`).toISOString(),
                },
              )
            : api.post<MemberBmiProfileDto>(
                `/api/members/${memberId}/bmi-measurement`,
                { heightCm: Number(height), weightKg: Number(weight) },
              ),
        vi ? "Đã lưu thông tin đo BMI." : "BMI measurement information saved.",
      );
      if (saved) state.reload();
    } finally {
      submitting.current = false;
    }
  }
  return (
    <Card title={vi ? "Hồ sơ BMI" : "BMI Profile"}>
      <AsyncSection state={state}>
        {({ profile }) =>
          !profile ? (
            <p>
              {vi
                ? "Hội viên chưa đăng ký lịch đo BMI."
                : "This member has not requested a BMI measurement."}
            </p>
          ) : profile.status === "MEASURED" ? (
            <BmiResult profile={profile} />
          ) : (
            <div className={styles.deskForm}>
              <p>
                {vi ? "Ngày đăng ký: " : "Requested: "}
                {formatDateTime(profile.requestedAt)}
              </p>
              {profile.appointmentAt && (
                <p>
                  {vi ? "Lịch đo: " : "Appointment: "}
                  {formatDateTime(profile.appointmentAt)}
                </p>
              )}
              <form
                className="form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void save("appointment");
                }}
              >
                <Field
                  label={
                    vi
                      ? "Xếp lịch đo tại trung tâm"
                      : "Schedule centre measurement"
                  }
                  hint={
                    vi
                      ? "Giờ Việt Nam (UTC+7). Lịch được hiển thị trong hồ sơ BMI của hội viên."
                      : "Vietnam time (UTC+7). Appears in the member's BMI profile."
                  }
                >
                  <input
                    type="datetime-local"
                    required
                    value={appointment}
                    disabled={action.busy}
                    onChange={(event) => setAppointment(event.target.value)}
                  />
                </Field>
                <button
                  type="submit"
                  className="btn btn--secondary"
                  disabled={action.busy}
                >
                  {vi ? "Xác nhận lịch đo" : "Confirm appointment"}
                </button>
              </form>
              <form
                className="form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void save("measurement");
                }}
              >
                <div className={styles.fields}>
                  <Field label={vi ? "Chiều cao (cm)" : "Height (cm)"}>
                    <input
                      type="number"
                      required
                      min={50}
                      max={250}
                      step="0.1"
                      value={height}
                      disabled={action.busy}
                      onChange={(event) => setHeight(event.target.value)}
                    />
                  </Field>
                  <Field label={vi ? "Cân nặng (kg)" : "Weight (kg)"}>
                    <input
                      type="number"
                      required
                      min={10}
                      max={400}
                      step="0.1"
                      value={weight}
                      disabled={action.busy}
                      onChange={(event) => setWeight(event.target.value)}
                    />
                  </Field>
                </div>
                <p className={styles.note}>
                  {vi
                    ? "BMI được tính tự động. Sau khi lưu, kết quả không thể chỉnh sửa."
                    : "BMI is calculated automatically. Recorded results cannot be edited."}
                </p>
                <label className={styles.verification}>
                  <input type="checkbox" required disabled={action.busy} />
                  {vi
                    ? "Tôi đã kiểm tra các chỉ số đo tại trung tâm."
                    : "I have checked the measurements taken at the centre."}
                </label>
                <button type="submit" className="btn" disabled={action.busy}>
                  {vi ? "Ghi nhận & khóa kết quả" : "Record & lock results"}
                </button>
              </form>
            </div>
          )
        }
      </AsyncSection>
      <Feedback error={action.error} success={action.success} />
    </Card>
  );
}

type RequestRow = {
  memberId: string;
  memberName: string | null;
  memberEmail: string;
  requestedAt: string;
  appointmentAt: string | null;
};
export function BmiRequestQueue({
  basePath,
}: {
  basePath: "/manager/members" | "/receptionist/members";
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const [page, setPage] = useState(1);
  const state = useApi(
    (signal) =>
      api.get<Paged<RequestRow>>("/api/bmi-measurement-requests", {
        signal,
        query: { page },
      }),
    [page],
  );
  return (
    <details className={styles.queue}>
      <summary>
        {vi ? "Yêu cầu đo BMI" : "BMI measurement requests"}
        {state.data ? ` (${state.data.totalCount})` : ""}
      </summary>
      <button
        type="button"
        className="btn btn--quiet btn--sm"
        onClick={state.reload}
        disabled={state.loading}
      >
        {vi ? "Cập nhật" : "Refresh"}
      </button>
      <AsyncSection
        state={state}
        isEmpty={(data) => !data.items.length}
        emptyMessage={
          vi
            ? "Không có yêu cầu đo đang chờ."
            : "No pending measurement requests."
        }
      >
        {(data) => (
          <>
            <ul className={styles.queueList}>
              {data.items.map((row) => (
                <li key={row.memberId}>
                  <div>
                    <strong>{row.memberName || row.memberEmail}</strong>
                    <p>
                      {row.appointmentAt
                        ? (vi ? "Lịch đo: " : "Appointment: ") +
                          formatDateTime(row.appointmentAt)
                        : (vi ? "Chờ xếp lịch · " : "Awaiting appointment · ") +
                          formatDateTime(row.requestedAt)}
                    </p>
                  </div>
                  <Link
                    className="btn btn--secondary btn--sm"
                    href={`${basePath}/${row.memberId}?tab=bmi`}
                  >
                    {vi ? "Mở hồ sơ BMI" : "Open BMI profile"}
                  </Link>
                </li>
              ))}
            </ul>
            <PageNav
              page={page}
              hasNext={page * 20 < data.totalCount}
              onChange={setPage}
            />
          </>
        )}
      </AsyncSection>
    </details>
  );
}
