"use client";

import { Activity } from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/format";
import { useLanguage } from "@/lib/language";
import type { MemberTrainingProfileDto } from "@/lib/types";
import {
  ACTIVITY_LEVELS,
  BMI_CATEGORIES,
  DIETARY_PREFERENCES,
  EXPERIENCE_LEVELS,
  GOAL_TYPES,
  SEXES,
  optionLabel,
} from "./health-profile-options";
import styles from "./health-profile.module.css";

const num = (value: number | null | undefined, digits = 1) =>
  value === null || value === undefined
    ? "—"
    : new Intl.NumberFormat("en-GB", { maximumFractionDigits: digits }).format(
        value,
      );

export function BmiCard({ profile }: { profile: MemberTrainingProfileDto }) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const category = profile.bmiCategory
    ? BMI_CATEGORIES[profile.bmiCategory]
    : null;
  return (
    <section className={styles.card} aria-label="BMI">
      <p className={styles.eyebrow}>
        <Activity size={16} aria-hidden="true" />
        {vi ? "Chỉ số BMI (tự khai)" : "BMI (self-reported)"}
      </p>
      {profile.bmi === null ? (
        <p className={styles.note}>
          {vi
            ? "Nhập chiều cao và cân nặng để xem BMI."
            : "Enter your height and weight to see your BMI."}
        </p>
      ) : (
        <>
          <p className={styles.bmiValue}>
            {num(profile.bmi)}
            <small>kg/m²</small>
          </p>
          {category && (
            <span className={styles.category} data-tone={category.tone}>
              {vi ? category.vi : category.en}
            </span>
          )}
        </>
      )}
      <p className={styles.note}>
        {vi
          ? "BMI = cân nặng (kg) / chiều cao² (m)."
          : "BMI = weight (kg) / height² (m)."}
      </p>
    </section>
  );
}

export function MeasurementHistory({
  profile,
}: {
  profile: MemberTrainingProfileDto;
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  if (profile.recentMeasurements.length < 2) return null;
  return (
    <section className={styles.card}>
      <p className={styles.eyebrow}>
        {vi ? "Lịch sử số đo" : "Measurement history"}
      </p>
      <ul className={styles.history}>
        {profile.recentMeasurements.map((m) => (
          <li key={m.measuredAt}>
            <span>{formatDate(m.measuredAt)}</span>
            <span>
              {num(m.weightKg)} kg · BMI {num(m.bmi)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Read-only view for the coach and the manager. */
export function HealthProfileSummary({
  profile,
}: {
  profile: MemberTrainingProfileDto;
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const rows: [string, string][] = [
    [
      vi ? "Chiều cao / cân nặng" : "Height / weight",
      profile.heightCm === null || profile.weightKg === null
        ? "—"
        : `${num(profile.heightCm)} cm · ${num(profile.weightKg)} kg`,
    ],
    ...(profile.targetWeightKg !== null
      ? ([
          [
            vi ? "Cân nặng mục tiêu" : "Target weight",
            `${num(profile.targetWeightKg)} kg`,
          ],
        ] as [string, string][])
      : []),
    [
      vi ? "Mục tiêu" : "Goal type",
      optionLabel(GOAL_TYPES, profile.goalType, vi),
    ],
    [
      vi ? "Trình độ" : "Experience",
      optionLabel(EXPERIENCE_LEVELS, profile.experienceLevel, vi),
    ],
    [vi ? "Tuổi" : "Age", profile.age === null ? "—" : String(profile.age)],
    [vi ? "Giới tính" : "Sex", optionLabel(SEXES, profile.sex, vi)],
    [
      vi ? "Mức vận động" : "Daily activity",
      optionLabel(ACTIVITY_LEVELS, profile.activityLevel, vi),
    ],
    [
      vi ? "Lịch tập mong muốn" : "Preferred schedule",
      profile.trainingDaysPerWeek === null
        ? "—"
        : `${profile.trainingDaysPerWeek} ${vi ? "ngày/tuần" : "days/week"}${
            profile.sessionMinutes
              ? ` · ${profile.sessionMinutes} ${vi ? "phút" : "min"}`
              : ""
          }`,
    ],
    [
      vi ? "Chế độ ăn" : "Diet",
      optionLabel(DIETARY_PREFERENCES, profile.dietaryPreference, vi),
    ],
    [vi ? "Dị ứng thực phẩm" : "Food allergies", profile.foodAllergies || "—"],
  ];
  return (
    <div className={styles.aside}>
      {!profile.isComplete && (
        <p className={styles.banner}>
          {vi
            ? "Hồ sơ chưa đầy đủ: gợi ý AI sẽ kém chính xác cho tới khi học viên bổ sung."
            : "Profile incomplete: AI suggestions will be less precise until the member fills in the missing details."}
        </p>
      )}
      <BmiCard profile={profile} />
      <section className={styles.card}>
        <p className={styles.eyebrow}>
          {vi ? "Mô tả mục tiêu" : "Goal in their words"}
        </p>
        <p>{profile.goal}</p>
        <dl className={styles.facts}>
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className={styles.card} data-notes={!!profile.notes}>
        <p className={styles.eyebrow}>
          {vi
            ? "Chấn thương, bệnh lý, hạn chế"
            : "Injuries, conditions, limitations"}
        </p>
        <p>
          {profile.notes ||
            (vi ? "Học viên không khai báo." : "None reported by the member.")}
        </p>
        <p className={styles.note}>
          {vi ? "Cập nhật: " : "Updated: "}
          {formatDateTime(profile.updatedAt)}
        </p>
      </section>
      <MeasurementHistory profile={profile} />
    </div>
  );
}
