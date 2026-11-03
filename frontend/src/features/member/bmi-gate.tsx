"use client";

import Link from "next/link";
import { Dialog } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { useLanguage } from "@/lib/language";
import type { MemberTrainingProfileDto } from "@/lib/types";
import { useApi } from "@/lib/useApi";

/**
 * A course needs the member's body measurements first: the coach builds the plan from them.
 * `missing` is only true once the profile loaded and has no BMI, so a slow or failed
 * request never blocks a purchase.
 */
export function useBmiGate(enabled = true) {
  const profile = useApi(
    async (signal) =>
      enabled
        ? await api.get<MemberTrainingProfileDto | null>(
            "/api/members/me/training-profile",
            { signal },
          )
        : null,
    [enabled],
  );
  const missing =
    enabled &&
    !profile.loading &&
    !profile.error &&
    (profile.data?.bmi === null || profile.data?.bmi === undefined);
  return { missing };
}

export function BmiRequiredDialog({ onClose }: { onClose: () => void }) {
  const { language } = useLanguage();
  const tx = (v: string, e: string) => (language === "vi" ? v : e);
  return (
    <Dialog title={tx("Cập nhật chỉ số BMI", "Update your BMI first")} onClose={onClose}>
      <p>
        {tx(
          "Bạn cần cập nhật chiều cao và cân nặng (BMI) trong hồ sơ thể chất trước khi đăng ký khóa học, để huấn luyện viên xây dựng kế hoạch phù hợp.",
          "Please add your height and weight (BMI) to your fitness profile before enrolling in a course, so your coach can build a plan that fits you.",
        )}
      </p>
      <p>
        <Link className="btn btn--primary" href="/member/training?tab=profile">
          {tx("Đến hồ sơ thể chất", "Go to fitness profile")}
        </Link>{" "}
        <button type="button" className="btn btn--quiet" onClick={onClose}>
          {tx("Để sau", "Not now")}
        </button>
      </p>
    </Dialog>
  );
}
