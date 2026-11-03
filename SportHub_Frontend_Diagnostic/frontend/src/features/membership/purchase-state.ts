import type { MemberPackageDto } from "@/lib/types";

const statusOf = (row: MemberPackageDto) =>
  row.status.replace(/_/g, "").toUpperCase();

/** Include paid renewals scheduled for later; never treat an unpaid purchase as ownership. */
export function membershipPurchaseState(
  owned: readonly MemberPackageDto[],
  packageId: number,
  today: string,
  nowUtc = Date.now(),
) {
  const matching = owned.filter((row) => row.packageId === packageId);
  const active = matching
    .filter(
      (row) =>
        statusOf(row) === "ACTIVE" &&
        row.endDate.slice(0, 10) >= today &&
        (!row.expiresAtUtc || Date.parse(row.expiresAtUtc) > nowUtc),
    )
    .sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
  return {
    active,
    pending: matching.some((row) => statusOf(row) === "PENDINGPAYMENT"),
    previouslyPurchased: matching.some((row) =>
      ["ACTIVE", "EXPIRED"].includes(statusOf(row)),
    ),
  };
}
