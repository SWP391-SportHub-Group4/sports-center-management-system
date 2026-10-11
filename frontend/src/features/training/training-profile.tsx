"use client";

import { useRef, useState } from "react";
import {
  Activity,
  CalendarPlus,
  CalendarDays,
  LockKeyhole,
  Ruler,
  Weight,
  RefreshCw,
} from "lucide-react";
import { AsyncSection, Feedback } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { formatDateTime } from "@/lib/format";
import { useAction, useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import type { MemberBmiProfileDto } from "@/lib/types";
import styles from "./bmi-profile.module.css";

export function BmiResult({ profile }: { profile: MemberBmiProfileDto }) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const number = (value: number | null) =>
    value === null
      ? "—"
      : new Intl.NumberFormat(vi ? "vi-VN" : "en-GB", {
          maximumFractionDigits: 1,
        }).format(value);
  return (
    <section
      className={styles.result}
      aria-label={
        vi ? "Kết quả đo tại trung tâm" : "Centre measurement results"
      }
    >
      <div className={styles.status}>
        <LockKeyhole size={16} aria-hidden="true" />
        {vi ? "Đã đo · Chỉ xem" : "Measured · Read only"}
      </div>
      <dl className={styles.metrics}>
        <div>
          <dt>
            <Ruler size={18} aria-hidden="true" />
            {vi ? "Chiều cao" : "Height"}
          </dt>
          <dd>
            {number(profile.heightCm)} <span>cm</span>
          </dd>
        </div>
        <div>
          <dt>
            <Weight size={18} aria-hidden="true" />
            {vi ? "Cân nặng" : "Weight"}
          </dt>
          <dd>
            {number(profile.weightKg)} <span>kg</span>
          </dd>
        </div>
        <div className={styles.bmi}>
          <dt>
            <Activity size={18} aria-hidden="true" />
            BMI
          </dt>
          <dd>
            {number(profile.bmi)} <span>kg/m²</span>
          </dd>
        </div>
      </dl>
      <p className={styles.note}>
        {vi
          ? "BMI = cân nặng (kg) / chiều cao² (m)."
          : "BMI = weight (kg) / height² (m)."}
      </p>
      {profile.measuredAt && (
        <p className={styles.measuredAt}>
          <CalendarDays size={16} aria-hidden="true" />
          {vi ? "Ngày đo: " : "Measured: "}
          {formatDateTime(profile.measuredAt)}
        </p>
      )}
      <p className={styles.note}>
        {vi
          ? "Kết quả do trung tâm ghi nhận và đã khóa chỉnh sửa."
          : "Results are recorded by the centre and locked from editing."}
      </p>
    </section>
  );
}

/** Members request a centre measurement; only authorised centre staff record results. */
export function TrainingProfile() {
  const { language } = useLanguage();
  const vi = language === "vi";
  const action = useAction();
  const submitting = useRef(false);
  const [registered, setRegistered] = useState<MemberBmiProfileDto | null>(
    null,
  );
  const state = useApi(
    async (signal) => ({
      profile: await api.get<MemberBmiProfileDto | null>(
        "/api/members/me/bmi-profile",
        { signal },
      ),
    }),
    [],
  );
  async function requestMeasurement() {
    if (submitting.current || registered || state.data?.profile) return;
    submitting.current = true;
    try {
      const saved = await action.run(
        () =>
          api.post<MemberBmiProfileDto>(
            "/api/members/me/bmi-measurement-request",
          ),
        vi
          ? "Đã đăng ký đo tại trung tâm."
          : "Your centre measurement request has been received.",
      );
      if (saved) {
        setRegistered(saved);
        state.reload();
      }
    } finally {
      submitting.current = false;
    }
  }
  return (
    <div className={styles.profile}>
      <header className={styles.header}>
        <div>
          <h2>{vi ? "Hồ sơ BMI" : "BMI Profile"}</h2>
          <p>
            {vi
              ? "Chiều cao, cân nặng và chỉ số BMI được đo tại trung tâm."
              : "Height, weight and BMI measured at the centre."}
          </p>
        </div>
        <button
          type="button"
          className="btn btn--quiet btn--sm"
          disabled={state.loading || action.busy}
          onClick={() => {
            setRegistered(null);
            state.reload();
          }}
        >
          <RefreshCw size={16} aria-hidden="true" />
          {vi ? "Cập nhật" : "Refresh"}
        </button>
      </header>
      <AsyncSection state={state}>
        {(data) => {
          const profile = data.profile ?? registered;
          if (profile?.status === "MEASURED")
            return <BmiResult profile={profile} />;
          if (profile)
            return (
              <section className={styles.appointment}>
                <CalendarDays size={28} aria-hidden="true" />
                <h3>
                  {profile.appointmentAt
                    ? vi
                      ? "Lịch đo đã được xác nhận"
                      : "Your measurement is scheduled"
                    : vi
                      ? "Đang chờ trung tâm xếp lịch"
                      : "Awaiting a measurement appointment"}
                </h3>
                {profile.appointmentAt ? (
                  <p className={styles.appointmentTime}>
                    {formatDateTime(profile.appointmentAt)}
                  </p>
                ) : (
                  <p>
                    {vi
                      ? "Trung tâm đã nhận yêu cầu. Lịch đo sẽ hiển thị tại đây sau khi được xác nhận."
                      : "The centre has received your request. Your appointment will appear here once confirmed."}
                  </p>
                )}
                <dl className={styles.requestFacts}>
                  <div>
                    <dt>{vi ? "Địa điểm" : "Location"}</dt>
                    <dd>
                      {vi
                        ? "Quầy tư vấn thể chất · SportHub"
                        : "Fitness consultation desk · SportHub"}
                    </dd>
                  </div>
                  <div>
                    <dt>{vi ? "Ngày đăng ký" : "Requested"}</dt>
                    <dd>{formatDateTime(profile.requestedAt)}</dd>
                  </div>
                </dl>
                <p className={styles.note}>
                  {vi
                    ? "Kết quả sẽ được cập nhật sau khi bạn đến trung tâm đo."
                    : "Your results will be available after your centre measurement."}
                </p>
              </section>
            );
          return (
            <section className={styles.appointment}>
              <Activity size={28} aria-hidden="true" />
              <h3>
                {vi ? "Bạn chưa có kết quả đo BMI" : "No BMI measurement yet"}
              </h3>
              <p>
                {vi
                  ? "Đăng ký nhận lịch đo chiều cao và cân nặng tại trung tâm. BMI sẽ được tính tự động từ kết quả đo."
                  : "Request an appointment to measure your height and weight at the centre. BMI is calculated automatically from your measurements."}
              </p>
              <button
                type="button"
                className="btn"
                disabled={action.busy || !!registered}
                onClick={requestMeasurement}
              >
                <CalendarPlus size={18} aria-hidden="true" />
                {action.busy
                  ? vi
                    ? "Đang đăng ký…"
                    : "Submitting…"
                  : vi
                    ? "Đăng ký lịch đo tại trung tâm"
                    : "Request a centre measurement"}
              </button>
            </section>
          );
        }}
      </AsyncSection>
      <Feedback error={action.error} success={action.success} />
    </div>
  );
}
