"use client";

import { api } from "@/lib/apiClient";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";

export interface ClassHoldDto {
  classId: number;
  invoiceId: string;
  expiresAtUtc: string;
}

/**
 * The signed-in member's live seat holds, by class. A valid hold can still be paid after enrollment is closed,
 * so lists and detail pages use this to offer "complete payment" instead of a dead end.
 */
export function useClassHolds() {
  const { user } = useAuth();
  const memberId = user?.role === "Member" ? user.userId : null;
  const state = useApi(
    (signal) =>
      memberId
        ? api
            .get<ClassHoldDto[]>("/api/members/me/class-holds", { signal })
            .catch(() => [] as ClassHoldDto[])
        : Promise.resolve([] as ClassHoldDto[]),
    [memberId],
  );
  const rows = state.data ?? [];
  return {
    holdFor: (classId: number) =>
      rows.find(
        (hold) =>
          hold.classId === classId &&
          Date.parse(hold.expiresAtUtc) > Date.now(),
      ),
  };
}
