export interface MemberProfile {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  goal: string;
  level: "Beginner" | "Intermediate" | "Advanced";
}
export type ProfileInput = Pick<
  MemberProfile,
  "fullName" | "phone" | "goal" | "level"
>;
export function validateProfile(
  input: ProfileInput,
): Partial<Record<keyof ProfileInput, string>> {
  const errors: Partial<Record<keyof ProfileInput, string>> = {};
  if (input.fullName.trim().length < 2)
    errors.fullName = "Nhập họ và tên ít nhất 2 ký tự.";
  if (
    input.phone &&
    !/^(?:0\d{9}|\+84\d{9})$/.test(input.phone.replace(/\s/g, ""))
  )
    errors.phone = "Nhập số điện thoại Việt Nam hợp lệ.";
  if (!input.goal.trim()) errors.goal = "Nhập mục tiêu tập luyện của bạn.";
  return errors;
}
