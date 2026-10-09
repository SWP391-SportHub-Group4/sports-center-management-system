import { ApiError } from "@/lib/apiClient";
import type { MembershipPackageDto } from "@/lib/types";

/** Retired activities must not appear in Services, including legacy owned packages. */
export function isRetiredActivityPackage(
  name: string,
  description = "",
): boolean {
  return /(?:^|[^\p{L}\p{N}])(?:yoga|group[\s_-]*x)(?:$|[^\p{L}\p{N}])/iu.test(
    `${name} ${description}`,
  );
}

// Exact Vietnamese labels/descriptions verified in the demo seed and catalog.
// Historical labels stay here so sold/discontinued packages keep their language metadata.
// This is a provenance fallback, not language detection by name/script.
const verifiedVietnameseContent = new Set([
  "Gym tháng",
  "Gym 3 tháng",
  "Gym 6 tháng",
  "Gym 12 tháng",
  "Gym thử 14 ngày (ngừng bán)",
  "Yoga 12 buổi",
  "Group X 20 buổi",
  "Personal Training 10 buổi",
  "Membership 90 ngày",
  "Membership 120 ngày",
  "Membership 90 ngày nâng cao",
  "Membership thử 14 ngày (ngừng bán)",
  "Tập Gym tự do trong 30 ngày, không giới hạn check-in. Cần Membership Gym còn hiệu lực để mua PT riêng.",
  "Tập Gym tự do trong 90 ngày. Cần Membership Gym còn hiệu lực để mua PT riêng.",
  "Tập Gym tự do trong 180 ngày. Cần Membership Gym còn hiệu lực để mua PT riêng.",
  "Tập Gym tự do trong 365 ngày. Cần Membership Gym còn hiệu lực để mua PT riêng.",
  "Gói Gym dùng thử cũ — giữ lại để minh hoạ gói đã ngừng áp dụng (BR-8).",
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
  // Old databases may still return retired activities before the cleanup migration
  // is applied. Exclude them from the purchase catalog, keeping owned history intact.
  return (value as MembershipPackageDto[]).filter(
    (p) => !isRetiredActivityPackage(p.name, p.description ?? ""),
  );
}
