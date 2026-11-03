"use client";

import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import { memberEnrollments } from "../member/api";

/** Resolve every enrollment page, so ownership never depends on catalog pagination. */
export function useCourseEnrollments() {
  const { user, loading: authLoading } = useAuth();
  const memberId = user?.role === "Member" ? user.userId : null;
  const state = useApi(
    async (signal) => ({
      memberId,
      rows: memberId ? await memberEnrollments(signal) : [],
    }),
    [memberId],
  );
  return {
    ...state,
    loading:
      authLoading ||
      (!!memberId &&
        (state.loading || (!state.error && state.data?.memberId !== memberId))),
    isEnrolled: (classId: number) =>
      !!memberId &&
      state.data?.memberId === memberId &&
      !!state.data.rows.some(
        (row) =>
          row.classId === classId && row.status.toUpperCase() === "CONFIRMED",
      ),
  };
}
