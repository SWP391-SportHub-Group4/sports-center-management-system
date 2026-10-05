import { ApiError } from "@/lib/apiClient";
import type { MembershipPackageDto } from "@/lib/types";

// Exact text verified in DemoDataSeeder.cs and the public catalog on 2026-10-05.
// This is a legacy provenance fallback, not language detection by name/script.
// New or edited text needs language metadata from its publisher.
const verifiedVietnameseContent = new Set([
  "Gym tháng",
  "Yoga 12 buổi",
  "Group X 20 buổi",
  "Personal Training 10 buổi",
  "Membership 90 ngày",
  "Membership 120 ngày",
  "Membership 90 ngày nâng cao",
  "Membership thử 14 ngày (ngừng bán)",
  "Ra vào Gym/Fitness tự do trong 30 ngày, không giới hạn số lần check-in.",
  "12 buổi Yoga nhóm, dùng trong 90 ngày.",
  "20 buổi Group X / Aerobic / HIIT, dùng trong 120 ngày.",
  "10 buổi tập 1 kèm 1 với huấn luyện viên cá nhân.",
  "Quyền sử dụng trung tâm trong 90 ngày.",
  "Quyền sử dụng trung tâm trong 120 ngày.",
  "Membership nền để mua PT riêng.",
  "Gói dùng thử cũ — giữ lại để minh hoạ gói đã ngừng áp dụng (BR-8).",
]);

export function catalogContentLanguage(
  content: string,
  declaredLanguage?: string | null,
): string {
  if (declaredLanguage?.trim()) {
    try {
      return Intl.getCanonicalLocales(declaredLanguage.trim())[0];
    } catch {
      // Invalid metadata must not turn into an invalid HTML lang attribute.
    }
  }
  return verifiedVietnameseContent.has(content.trim()) ? "vi" : "und";
}

/** Reject unusable prices/identities instead of rendering misleading purchase UI. */
export function parseMembershipCatalog(value: unknown): MembershipPackageDto[] {
  const ids = new Set<number>();
  if (
    !Array.isArray(value) ||
    !value.every((item: unknown) => {
      if (!item || typeof item !== "object") return false;
      const p = item as Record<string, unknown>;
      const valid =
        typeof p.packageId === "number" &&
        Number.isSafeInteger(p.packageId) &&
        p.packageId > 0 &&
        !ids.has(p.packageId) &&
        typeof p.name === "string" &&
        p.name.trim().length > 0 &&
        typeof p.price === "number" &&
        Number.isSafeInteger(p.price) &&
        p.price > 0 &&
        typeof p.durationDays === "number" &&
        Number.isSafeInteger(p.durationDays) &&
        p.durationDays > 0 &&
        (p.description == null || typeof p.description === "string") &&
        typeof p.isActive === "boolean" &&
        (p.nameLanguage == null || typeof p.nameLanguage === "string") &&
        (p.descriptionLanguage == null ||
          typeof p.descriptionLanguage === "string");
      if (valid) ids.add(p.packageId as number);
      return valid;
    })
  ) {
    throw new ApiError(
      0,
      "invalid_catalog",
      "Invalid membership catalog response.",
    );
  }
  return value as MembershipPackageDto[];
}
