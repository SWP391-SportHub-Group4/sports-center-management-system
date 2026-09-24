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
    errors.fullName = "Enter them and names at least 2 characters.";
  if (
    input.phone &&
    !/^(?:0\d{9}|\+84\d{9})$/.test(input.phone.replace(/\s/g, ""))
  )
    errors.phone = "Enter a valid Vietnamese phone number.";
  if (!input.goal.trim()) errors.goal = "Enter your practice goal.";
  return errors;
}
