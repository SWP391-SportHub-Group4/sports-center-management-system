/** Loại yêu cầu hỗ trợ: Lễ tân ghi hộ và Member tự gửi dùng chung một danh sách, khớp mã của API. */
export type SupportCategory =
  | "PAYMENT"
  | "MEMBERSHIP"
  | "CLASS"
  | "FACILITY"
  | "ACCOUNT"
  | "OTHER";

export const SUPPORT_CATEGORIES: { value: SupportCategory; label: string }[] = [
  { value: "PAYMENT", label: "Payment" },
  { value: "MEMBERSHIP", label: "Membership" },
  { value: "CLASS", label: "Coach" },
  { value: "FACILITY", label: "Facilities" },
  { value: "ACCOUNT", label: "Account" },
  { value: "OTHER", label: "Other" },
];

export function supportCategoryLabel(value: string): string {
  if (value === "GENERAL") return "Other";
  if (value === "PT") return "Coach";
  return SUPPORT_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}
