/** Wire values (UPPER_SNAKE_CASE) and bilingual labels for the self-reported health profile. */
export type Option = {
  value: string;
  vi: string;
  en: string;
  hintVi?: string;
  hintEn?: string;
};

export const GOAL_TYPES: Option[] = [
  {
    value: "FAT_LOSS",
    vi: "Giảm mỡ",
    en: "Fat loss",
    hintVi: "Giảm cân và mỡ cơ thể",
    hintEn: "Lose weight and body fat",
  },
  {
    value: "MUSCLE_GAIN",
    vi: "Tăng cơ",
    en: "Muscle gain",
    hintVi: "Tăng khối lượng cơ",
    hintEn: "Build muscle mass",
  },
  {
    value: "MAINTAIN",
    vi: "Duy trì",
    en: "Maintain",
    hintVi: "Giữ vóc dáng hiện tại",
    hintEn: "Keep your current shape",
  },
  {
    value: "ENDURANCE",
    vi: "Sức bền",
    en: "Endurance",
    hintVi: "Tăng thể lực, tim mạch",
    hintEn: "Improve stamina and cardio",
  },
  {
    value: "FLEXIBILITY",
    vi: "Dẻo dai",
    en: "Flexibility",
    hintVi: "Linh hoạt, giảm cứng khớp",
    hintEn: "Mobility and flexibility",
  },
  {
    value: "GENERAL_FITNESS",
    vi: "Sức khỏe chung",
    en: "General fitness",
    hintVi: "Khỏe hơn mỗi ngày",
    hintEn: "Feel healthier overall",
  },
];

export const EXPERIENCE_LEVELS: Option[] = [
  {
    value: "BEGINNER",
    vi: "Mới bắt đầu",
    en: "Beginner",
    hintVi: "Dưới 6 tháng tập đều",
    hintEn: "Under 6 months of regular training",
  },
  {
    value: "INTERMEDIATE",
    vi: "Trung cấp",
    en: "Intermediate",
    hintVi: "6 tháng đến 2 năm",
    hintEn: "6 months to 2 years",
  },
  {
    value: "ADVANCED",
    vi: "Nâng cao",
    en: "Advanced",
    hintVi: "Trên 2 năm tập đều",
    hintEn: "Over 2 years of regular training",
  },
];

export const SEXES: Option[] = [
  { value: "FEMALE", vi: "Nữ", en: "Female" },
  { value: "MALE", vi: "Nam", en: "Male" },
  { value: "UNSPECIFIED", vi: "Không muốn nêu", en: "Prefer not to say" },
];

export const ACTIVITY_LEVELS: Option[] = [
  {
    value: "SEDENTARY",
    vi: "Ít vận động",
    en: "Sedentary",
    hintVi: "Ngồi nhiều, ít đi bộ",
    hintEn: "Desk job, little walking",
  },
  {
    value: "LIGHTLY_ACTIVE",
    vi: "Vận động nhẹ",
    en: "Lightly active",
    hintVi: "Đi bộ hoặc đứng một phần ngày",
    hintEn: "Some walking or standing",
  },
  {
    value: "MODERATELY_ACTIVE",
    vi: "Vận động vừa",
    en: "Moderately active",
    hintVi: "Thường xuyên đi lại, công việc năng động",
    hintEn: "On your feet most of the day",
  },
  {
    value: "VERY_ACTIVE",
    vi: "Vận động nhiều",
    en: "Very active",
    hintVi: "Lao động nặng hoặc luyện tập hằng ngày",
    hintEn: "Physical job or daily training",
  },
];

export const DIETARY_PREFERENCES: Option[] = [
  { value: "NO_PREFERENCE", vi: "Không kiêng", en: "No preference" },
  { value: "VEGETARIAN", vi: "Ăn chay (có trứng, sữa)", en: "Vegetarian" },
  { value: "VEGAN", vi: "Thuần chay", en: "Vegan" },
  { value: "PESCATARIAN", vi: "Ăn chay có cá", en: "Pescatarian" },
  { value: "HALAL", vi: "Halal", en: "Halal" },
];

export const BMI_CATEGORIES: Record<
  string,
  { vi: string; en: string; tone: "warn" | "ok" | "alert" }
> = {
  UNDERWEIGHT: { vi: "Thiếu cân", en: "Underweight", tone: "warn" },
  NORMAL: { vi: "Bình thường", en: "Normal", tone: "ok" },
  OVERWEIGHT: { vi: "Thừa cân", en: "Overweight", tone: "warn" },
  OBESE: { vi: "Béo phì", en: "Obese", tone: "alert" },
};

export function optionLabel(
  options: Option[],
  value: string | null | undefined,
  vi: boolean,
) {
  if (!value) return "—";
  const found = options.find((option) => option.value === value.toUpperCase());
  return found ? (vi ? found.vi : found.en) : value;
}

/** Same formula as the server (kg / m², one decimal) — used only for the live preview while typing. */
export function previewBmi(heightCm: number, weightKg: number) {
  if (!(
    heightCm >= 100 &&
    heightCm <= 250 &&
    weightKg >= 30 &&
    weightKg <= 300
  ))
    return null;
  const meters = heightCm / 100;
  return Math.round((weightKg / (meters * meters)) * 10) / 10;
}

export function bmiCategoryOf(bmi: number) {
  return bmi < 18.5
    ? "UNDERWEIGHT"
    : bmi < 25
      ? "NORMAL"
      : bmi < 30
        ? "OVERWEIGHT"
        : "OBESE";
}
