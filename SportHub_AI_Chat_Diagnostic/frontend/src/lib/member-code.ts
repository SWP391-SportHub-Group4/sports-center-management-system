/** Mã QR check-in do server cấp và ký (GET /api/members/me/checkin-code); client chỉ hiển thị và gửi lại để server xác thực. */
export const MEMBER_CODE_PREFIX = "SPORTHUB-CODE:";

export function isMemberCode(text: string) {
  return text.trim().startsWith(MEMBER_CODE_PREFIX);
}

export interface MemberCheckInCode {
  code: string;
  expiresAtUtc: string;
}
