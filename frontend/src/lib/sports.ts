import type { SportDto, SportServiceType } from "./types";

/** Môn có dịch vụ này đang bật không (cờ chỉ chặn giao dịch mới, không hủy thứ đã bán). */
export function hasService(
  sport: Pick<SportDto, "services"> | null | undefined,
  type: SportServiceType,
): boolean {
  return !!sport?.services.some((s) => s.serviceType === type && s.isEnabled);
}

/** Môn đầu tiên có dịch vụ này đang bật (PT và Membership luôn là môn Gym). */
export function findSportWithService(
  sports: SportDto[] | null | undefined,
  type: SportServiceType,
): SportDto | undefined {
  return sports?.find((s) => hasService(s, type));
}
