"use client";

import { useId, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { AsyncSection, Feedback, Field } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { useAction, useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import type { MemberTrainingProfileDto } from "@/lib/types";
import { BmiCard } from "./health-profile-summary";
import {
  ACTIVITY_LEVELS,
  DIETARY_PREFERENCES,
  EXPERIENCE_LEVELS,
  GOAL_TYPES,
  SEXES,
  bmiCategoryOf,
  previewBmi,
  type Option,
} from "./health-profile-options";
import styles from "./health-profile.module.css";
import { BodyBuildSelector } from "./body-build-selector";

type FormState = {
  bodyBuild: string;
  goal: string;
  goalType: string;
  experienceLevel: string;
  dateOfBirth: string;
  sex: string;
  heightCm: string;
  weightKg: string;
  targetWeightKg: string;
  activityLevel: string;
  trainingDaysPerWeek: string;
  sessionMinutes: string;
  dietaryPreference: string;
  foodAllergies: string;
  notes: string;
};

/** Label that stands in for the free-text goal when the member leaves it empty. */
const defaultGoalText = (goalType: string) =>
  GOAL_TYPES.find((o) => o.value === goalType)?.en ?? "General fitness";

const fromProfile = (p: MemberTrainingProfileDto | null): FormState => ({
  bodyBuild: p?.bodyBuild ?? "",
  goal: p && p.goal !== defaultGoalText(p.goalType ?? "") ? p.goal : "",
  goalType: p?.goalType ?? "",
  experienceLevel: p?.experienceLevel ?? "",
  dateOfBirth: p?.dateOfBirth ?? "",
  sex: p?.sex ?? "",
  heightCm: p?.heightCm?.toString() ?? "",
  weightKg: p?.weightKg?.toString() ?? "",
  targetWeightKg: p?.targetWeightKg?.toString() ?? "",
  activityLevel: p?.activityLevel ?? "",
  trainingDaysPerWeek: p?.trainingDaysPerWeek?.toString() ?? "",
  sessionMinutes: p?.sessionMinutes?.toString() ?? "",
  dietaryPreference: p?.dietaryPreference ?? "NO_PREFERENCE",
  foodAllergies: p?.foodAllergies ?? "",
  notes: p?.notes ?? "",
});

const oneDecimal = (value: number) => Math.round(value * 10) / 10 === value;

function ChoiceGroup({
  name,
  legend,
  options,
  value,
  onChange,
  vi,
  error,
}: {
  name: string;
  legend: string;
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  vi: boolean;
  error?: string;
}) {
  const legendId = useId();
  const errorId = useId();
  return (
    <fieldset className={styles.choiceGroup}>
      <legend id={legendId} className={styles.choiceLegend}>
        <strong>{legend}</strong> *
      </legend>
      <div
        role="radiogroup"
        aria-labelledby={legendId}
        aria-required="true"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={styles.choices}
        data-count={options.length}
      >
        {options.map((option) => (
          <label key={option.value} className={styles.choice}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <strong>{vi ? option.vi : option.en}</strong>
            {(vi ? option.hintVi : option.hintEn) && (
              <span>{vi ? option.hintVi : option.hintEn}</span>
            )}
          </label>
        ))}
      </div>
      {error && (
        <p id={errorId} className="field__error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}

function SelectField({
  label,
  options,
  value,
  onChange,
  vi,
  required,
  error,
  hint,
}: {
  label: string;
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  vi: boolean;
  required?: boolean;
  error?: string;
  hint?: string;
}) {
  return (
    <Field label={label} required={required} error={error} hint={hint}>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{vi ? "Chọn…" : "Select…"}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {vi ? option.vi : option.en}
          </option>
        ))}
      </select>
    </Field>
  );
}

function today(offsetYears: number) {
  const d = new Date();
  d.setFullYear(d.getFullYear() + offsetYears);
  return d.toISOString().slice(0, 10);
}

function ProfileForm({
  profile,
  onSaved,
}: {
  profile: MemberTrainingProfileDto | null;
  onSaved: () => void;
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const action = useAction();
  const [form, setForm] = useState<FormState>(() => fromProfile(profile));
  const [ack, setAck] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // Optional extras stay collapsed unless the member already filled one in.
  const [detailsOpen, setDetailsOpen] = useState(
    () =>
      !!profile &&
      (profile.targetWeightKg !== null ||
        profile.sessionMinutes !== null ||
        profile.dietaryPreference !== "NO_PREFERENCE" ||
        form.goal !== ""),
  );
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const height = Number(form.heightCm);
  const weight = Number(form.weightKg);
  const target =
    form.targetWeightKg === "" ? null : Number(form.targetWeightKg);
  const bmi = useMemo(
    () => (form.heightCm && form.weightKg ? previewBmi(height, weight) : null),
    [form.heightCm, form.weightKg, height, weight],
  );
  const targetBmi = useMemo(
    () => (target !== null && height ? previewBmi(height, target) : null),
    [target, height],
  );

  const required = vi ? "Bắt buộc" : "Required";
  const errors: Partial<Record<keyof FormState | "ack", string>> = {};
  if (form.goal.trim() !== "" && form.goal.trim().length < 3)
    errors.goal = vi
      ? "Mô tả mục tiêu (tối thiểu 3 ký tự)."
      : "Describe your goal (at least 3 characters).";
  if (!form.goalType) errors.goalType = required;
  if (!form.experienceLevel) errors.experienceLevel = required;
  if (!form.dateOfBirth) errors.dateOfBirth = required;
  else if (form.dateOfBirth > today(-14) || form.dateOfBirth < today(-90))
    errors.dateOfBirth = vi
      ? "Tuổi phải từ 14 đến 90."
      : "Age must be between 14 and 90.";
  if (!form.sex) errors.sex = required;
  if (!(height >= 100 && height <= 250 && oneDecimal(height)))
    errors.heightCm = vi
      ? "100–250 cm, tối đa 1 chữ số thập phân."
      : "100–250 cm, at most one decimal.";
  if (!(weight >= 30 && weight <= 300 && oneDecimal(weight)))
    errors.weightKg = vi
      ? "30–300 kg, tối đa 1 chữ số thập phân."
      : "30–300 kg, at most one decimal.";
  if (target !== null) {
    if (!(target >= 30 && target <= 300 && oneDecimal(target)))
      errors.targetWeightKg = vi
        ? "30–300 kg, tối đa 1 chữ số thập phân."
        : "30–300 kg, at most one decimal.";
    else if (targetBmi !== null && targetBmi < 18.5)
      errors.targetWeightKg = vi
        ? "Mục tiêu này khiến BMI dưới 18.5. Hãy chọn mức cao hơn."
        : "This target would put your BMI below 18.5. Choose a higher target.";
  }
  if (!form.activityLevel) errors.activityLevel = required;
  const days = Number(form.trainingDaysPerWeek);
  if (!(Number.isInteger(days) && days >= 1 && days <= 7))
    errors.trainingDaysPerWeek = vi ? "Chọn 1–7 ngày." : "Choose 1–7 days.";
  if (form.sessionMinutes !== "") {
    const minutes = Number(form.sessionMinutes);
    if (!(Number.isInteger(minutes) && minutes >= 15 && minutes <= 240))
      errors.sessionMinutes = vi ? "15–240 phút." : "15–240 minutes.";
  }
  if (!ack) errors.ack = required;
  const valid = Object.keys(errors).length === 0;
  const show = (key: keyof typeof errors) =>
    submitted ? errors[key] : undefined;

  async function save() {
    setSubmitted(true);
    // Errors inside the collapsed extras must be visible, not hidden behind the toggle.
    if (errors.targetWeightKg || errors.sessionMinutes || errors.goal)
      setDetailsOpen(true);
    if (!valid || action.busy) return;
    const saved = await action.run(
      () =>
        api.put<MemberTrainingProfileDto>("/api/members/me/training-profile", {
          goal: form.goal.trim() || defaultGoalText(form.goalType),
          goalType: form.goalType,
          experienceLevel: form.experienceLevel,
          dateOfBirth: form.dateOfBirth,
          sex: form.sex,
          heightCm: height,
          weightKg: weight,
          bodyBuild: form.bodyBuild || null,
          targetWeightKg: target,
          activityLevel: form.activityLevel,
          trainingDaysPerWeek: days,
          sessionMinutes:
            form.sessionMinutes === "" ? null : Number(form.sessionMinutes),
          dietaryPreference: form.dietaryPreference || "NO_PREFERENCE",
          foodAllergies: form.foodAllergies.trim() || null,
          notes: form.notes.trim() || null,
        }),
      vi ? "Đã lưu hồ sơ." : "Fitness profile saved.",
    );
    if (saved) onSaved();
  }

  // Live preview mirrors the server formula; the saved value from the API is authoritative.
  const preview: MemberTrainingProfileDto | null = useMemo(
    () =>
      profile || bmi !== null
        ? ({
            ...(profile ?? ({} as MemberTrainingProfileDto)),
            heightCm: bmi !== null ? height : (profile?.heightCm ?? null),
            weightKg: bmi !== null ? weight : (profile?.weightKg ?? null),
            targetWeightKg: target,
            bmi: bmi ?? profile?.bmi ?? null,
            bmiCategory:
              bmi !== null
                ? bmiCategoryOf(bmi)
                : (profile?.bmiCategory ?? null),
            recentMeasurements: profile?.recentMeasurements ?? [],
          } as MemberTrainingProfileDto)
        : null,
    [profile, bmi, height, weight, target],
  );

  return (
    <div className={styles.layout}>
      <form
        className={styles.form}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset className={styles.section}>
          <legend>{vi ? "1. Mục tiêu của bạn" : "1. Your goal"}</legend>
          <ChoiceGroup
            name="goalType"
            legend={vi ? "Mục tiêu chính" : "Main goal"}
            options={GOAL_TYPES}
            value={form.goalType}
            onChange={(v) => set("goalType", v)}
            vi={vi}
            error={show("goalType")}
          />
          <ChoiceGroup
            name="experienceLevel"
            legend={vi ? "Kinh nghiệm tập luyện" : "Training experience"}
            options={EXPERIENCE_LEVELS}
            value={form.experienceLevel}
            onChange={(v) => set("experienceLevel", v)}
            vi={vi}
            error={show("experienceLevel")}
          />
        </fieldset>

        <fieldset className={styles.section}>
          <legend>{vi ? "2. Thông tin cơ thể" : "2. Your body"}</legend>
          <BodyBuildSelector
            value={form.bodyBuild}
            onChange={(value) => set("bodyBuild", value)}
          />
          <p className={styles.sectionHint}>
            {vi
              ? "Bạn tự nhập số đo. Dùng số liệu gần đây nhất để kế hoạch sát thực tế; có thể cập nhật bất cứ lúc nào."
              : "You enter these yourself. Use recent figures for a realistic plan; update them any time."}
          </p>
          <div className={styles.grid}>
            <Field
              label={vi ? "Ngày sinh" : "Date of birth"}
              required
              error={show("dateOfBirth")}
            >
              <input
                type="date"
                min={today(-90)}
                max={today(-14)}
                value={form.dateOfBirth}
                onChange={(e) => set("dateOfBirth", e.target.value)}
              />
            </Field>
            <SelectField
              label={vi ? "Giới tính" : "Sex"}
              hint={
                vi ? "Dùng để ước tính năng lượng" : "Used for energy estimates"
              }
              options={SEXES}
              value={form.sex}
              onChange={(v) => set("sex", v)}
              vi={vi}
              required
              error={show("sex")}
            />
            <Field
              label={vi ? "Chiều cao (cm)" : "Height (cm)"}
              required
              error={show("heightCm")}
            >
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                min={100}
                max={250}
                value={form.heightCm}
                onChange={(e) => set("heightCm", e.target.value)}
              />
            </Field>
            <Field
              label={vi ? "Cân nặng (kg)" : "Weight (kg)"}
              required
              error={show("weightKg")}
            >
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                min={30}
                max={300}
                value={form.weightKg}
                onChange={(e) => set("weightKg", e.target.value)}
              />
            </Field>
          </div>
        </fieldset>

        <fieldset className={styles.section}>
          <legend>{vi ? "3. Thói quen vận động" : "3. Your routine"}</legend>
          <div className={styles.grid}>
            <div className={styles.span2}>
              <SelectField
                label={vi ? "Mức vận động hằng ngày" : "Daily activity"}
                options={ACTIVITY_LEVELS}
                value={form.activityLevel}
                onChange={(v) => set("activityLevel", v)}
                vi={vi}
                required
                error={show("activityLevel")}
                hint={
                  ACTIVITY_LEVELS.find((o) => o.value === form.activityLevel)?.[
                    vi ? "hintVi" : "hintEn"
                  ] ?? (vi ? "Ngoài giờ tập" : "Outside your workouts")
                }
              />
            </div>
            <Field
              label={vi ? "Số ngày tập mỗi tuần" : "Training days per week"}
              required
              error={show("trainingDaysPerWeek")}
            >
              <select
                value={form.trainingDaysPerWeek}
                onChange={(e) => set("trainingDaysPerWeek", e.target.value)}
              >
                <option value="">{vi ? "Chọn…" : "Select…"}</option>
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </fieldset>

        <fieldset className={styles.section}>
          <legend>
            {vi ? "4. Ăn uống và sức khỏe" : "4. Nutrition and health"}
          </legend>
          <div className={styles.grid}>
            <Field
              label={
                vi
                  ? "Dị ứng / không dung nạp thực phẩm"
                  : "Food allergies or intolerances"
              }
            >
              <input
                type="text"
                maxLength={500}
                value={form.foodAllergies}
                placeholder={
                  vi ? "Ví dụ: đậu phộng, hải sản" : "e.g. peanuts, shellfish"
                }
                onChange={(e) => set("foodAllergies", e.target.value)}
              />
            </Field>
          </div>
          <Field
            label={
              vi
                ? "Chấn thương, bệnh lý hoặc hạn chế vận động"
                : "Injuries, medical conditions or limitations"
            }
            hint={
              vi
                ? "Coach sẽ dựa vào đây để tránh bài tập không phù hợp."
                : "Your coach uses this to avoid unsuitable exercises."
            }
          >
            <textarea
              rows={3}
              maxLength={2000}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </Field>
        </fieldset>

        <details
          className={styles.details}
          open={detailsOpen}
          onToggle={(e) => setDetailsOpen(e.currentTarget.open)}
        >
          <summary>
            <span>
              {vi ? "Thêm chi tiết (tùy chọn)" : "Add details (optional)"}
            </span>
            <small>
              {vi
                ? "Cân nặng mục tiêu, thời lượng buổi tập, chế độ ăn, mô tả mục tiêu"
                : "Target weight, session length, diet, your goal in words"}
            </small>
            <ChevronDown size={18} aria-hidden="true" />
          </summary>
          <div className={styles.detailsBody}>
            <div className={styles.grid3}>
              <Field
                label={vi ? "Cân nặng mục tiêu (kg)" : "Target weight (kg)"}
                error={show("targetWeightKg")}
              >
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min={30}
                  max={300}
                  value={form.targetWeightKg}
                  onChange={(e) => set("targetWeightKg", e.target.value)}
                />
              </Field>
              <Field
                label={
                  vi ? "Thời lượng mỗi buổi (phút)" : "Minutes per session"
                }
                error={show("sessionMinutes")}
              >
                <input
                  type="number"
                  inputMode="numeric"
                  step={5}
                  min={15}
                  max={240}
                  value={form.sessionMinutes}
                  onChange={(e) => set("sessionMinutes", e.target.value)}
                />
              </Field>
              <SelectField
                label={vi ? "Chế độ ăn" : "Diet"}
                options={DIETARY_PREFERENCES}
                value={form.dietaryPreference}
                onChange={(v) => set("dietaryPreference", v)}
                vi={vi}
              />
            </div>
            <Field
              label={
                vi
                  ? "Mô tả mục tiêu bằng lời của bạn"
                  : "Describe your goal in your own words"
              }
              error={show("goal")}
              hint={
                vi
                  ? "Ví dụ: giảm 5 kg trong 3 tháng để thi đấu cầu lông. Bỏ trống thì dùng mục tiêu chính ở trên."
                  : "Example: lose 5 kg in 3 months for badminton season. Leave empty to use your main goal."
              }
            >
              <textarea
                rows={3}
                maxLength={500}
                value={form.goal}
                onChange={(e) => set("goal", e.target.value)}
              />
            </Field>
          </div>
        </details>

        <label className={styles.consent}>
          <input
            type="checkbox"
            checked={ack}
            onChange={(e) => setAck(e.target.checked)}
            aria-required="true"
            aria-invalid={show("ack") ? true : undefined}
            aria-describedby={show("ack") ? "profile-consent-error" : undefined}
          />
          <span>
            {vi
              ? "Tôi xác nhận thông tin là chính xác và hiểu rằng gợi ý của AI và Coach chỉ mang tính tham khảo, không thay thế tư vấn y tế."
              : "I confirm this information is accurate and understand that AI and coach suggestions are general guidance, not medical advice."}
          </span>
        </label>
        {show("ack") && (
          <p id="profile-consent-error" className="field__error" role="alert">
            {vi
              ? "Vui lòng xác nhận trước khi lưu."
              : "Please confirm before saving."}
          </p>
        )}

        <div className={styles.actions}>
          <button type="submit" className="btn" disabled={action.busy}>
            {action.busy
              ? vi
                ? "Đang lưu…"
                : "Saving…"
              : vi
                ? "Lưu hồ sơ"
                : "Save profile"}
          </button>
          {submitted && !valid && (
            <span className="field__error" role="alert">
              {vi
                ? "Còn trường chưa hợp lệ ở trên."
                : "Some fields above need attention."}
            </span>
          )}
        </div>
        <Feedback error={action.error} success={action.success} />
      </form>

      <aside
        className={styles.aside}
        aria-label={vi ? "Tóm tắt hồ sơ" : "Profile summary"}
      >
        {preview ? (
          <BmiCard profile={preview} />
        ) : (
          <section className={styles.card}>
            <p className={styles.note}>
              {vi
                ? "Nhập chiều cao và cân nặng để xem BMI ngay khi gõ."
                : "Enter your height and weight to see your BMI as you type."}
            </p>
          </section>
        )}
      </aside>
    </div>
  );
}

/** Members describe themselves; the centre no longer schedules measurements. The profile feeds coach and AI plans. */
export function TrainingProfile() {
  const { language } = useLanguage();
  const vi = language === "vi";
  const state = useApi(
    async (signal) => ({
      profile: await api.get<MemberTrainingProfileDto | null>(
        "/api/members/me/training-profile",
        { signal },
      ),
    }),
    [],
  );
  return (
    <div className={styles.profile}>
      <header className={styles.header}>
        <h2>Fitness profile</h2>
        <p>
          {vi
            ? "Bạn tự khai chiều cao, cân nặng, mục tiêu, thói quen và chế độ ăn. Coach và trợ lý AI dùng hồ sơ này để gợi ý bài tập và dinh dưỡng phù hợp. Chỉ bạn, Quản lý và Coach đang phụ trách bạn xem được."
            : "Tell us your measurements, goals, routine and diet. Your coach and the AI assistant use this to suggest workouts and nutrition. Only you, the manager and your assigned coach can see it."}
        </p>
      </header>
      <AsyncSection state={state}>
        {({ profile }) => (
          <>
            {(!profile || !profile.isComplete) && (
              <p className={styles.banner}>
                {profile
                  ? vi
                    ? "Hồ sơ chưa đầy đủ. Hoàn thành các mục bên dưới để nhận kế hoạch sát với bạn nhất."
                    : "Your profile is incomplete. Fill in the sections below for the most tailored plan."
                  : vi
                    ? "Bạn chưa có hồ sơ. Mất khoảng 2 phút để hoàn thành."
                    : "You have no profile yet. It takes about 2 minutes."}
              </p>
            )}
            <ProfileForm profile={profile} onSaved={() => state.reload()} />
          </>
        )}
      </AsyncSection>
    </div>
  );
}
