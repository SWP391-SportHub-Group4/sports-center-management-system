"use client";

import { Activity, HeartPulse } from "lucide-react";
import { AsyncSection, StatusChip } from "@/components/ui";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime } from "@/lib/format";
import { ptApi } from "./api";
import styles from "./pt-coach-workspace.module.css";

export function PtMemberHealth({ memberId }: { memberId: string }) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const state = useApi(
    (signal) => ptApi.healthProfile(memberId, signal),
    [memberId],
  );
  return (
    <AsyncSection state={state}>
      {({ trainingProfile: profile, bmiProfile: bmi }) => (
        <div className={styles.healthProfile}>
          <section className={styles.panelSection}>
            <h3>
              <Activity size={18} aria-hidden="true" />{" "}
              {vi ? "Mục tiêu tập luyện" : "Training goals"}
            </h3>
            {profile ? (
              <>
                <p className={styles.goalText}>{profile.goal}</p>
                <p className="small muted">
                  {vi ? "Trình độ: " : "Level: "}
                  {(
                    {
                      Beginner: vi ? "Cơ bản" : "Beginner",
                      Intermediate: vi ? "Trung cấp" : "Intermediate",
                      Advanced: vi ? "Nâng cao" : "Advanced",
                    } as Record<string, string>
                  )[profile.experienceLevel] ?? profile.experienceLevel}
                </p>
              </>
            ) : (
              <p className="muted">
                {vi
                  ? "Học viên chưa khai hồ sơ tập luyện."
                  : "The student has not completed their training profile."}
              </p>
            )}
          </section>
          <section className={styles.healthNotes} data-notes={!!profile?.notes}>
            <h3>
              <HeartPulse size={18} aria-hidden="true" />{" "}
              {vi ? "Lưu ý sức khỏe" : "Health precautions"}
            </h3>
            <p>
              {profile?.notes ||
                (vi
                  ? "Chưa có lưu ý sức khỏe được học viên khai báo."
                  : "No health precautions have been reported by this student.")}
            </p>
            {profile && (
              <small>
                {vi ? "Học viên cập nhật: " : "Updated by student: "}
                {formatDateTime(profile.updatedAt)}
              </small>
            )}
          </section>
          <section className={styles.panelSection}>
            <h3>{vi ? "Chỉ số đo tại trung tâm" : "Centre measurements"}</h3>
            {bmi?.status === "MEASURED" ? (
              <>
                <dl className={styles.measurements}>
                  <div>
                    <dt>{vi ? "Chiều cao" : "Height"}</dt>
                    <dd>
                      {bmi.heightCm ?? "—"} <small>cm</small>
                    </dd>
                  </div>
                  <div>
                    <dt>{vi ? "Cân nặng" : "Weight"}</dt>
                    <dd>
                      {bmi.weightKg ?? "—"} <small>kg</small>
                    </dd>
                  </div>
                  <div>
                    <dt>BMI</dt>
                    <dd>{bmi.bmi ?? "—"}</dd>
                  </div>
                </dl>
                {bmi.measuredAt && (
                  <p className="small muted">
                    {vi ? "Đo ngày: " : "Measured: "}
                    {formatDateTime(bmi.measuredAt)}
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="muted">
                  {vi
                    ? "Chưa có kết quả đo chiều cao, cân nặng và BMI."
                    : "Height, weight and BMI have not been recorded."}
                </p>
                {bmi && <StatusChip value={bmi.status} />}
                {bmi?.appointmentAt && (
                  <p>
                    {vi ? "Lịch đo: " : "Measurement appointment: "}
                    {formatDateTime(bmi.appointmentAt)}
                  </p>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </AsyncSection>
  );
}
