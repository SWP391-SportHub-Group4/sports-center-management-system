import type { SessionUser } from "./auth";

export function canTeachSport(user: SessionUser | null, sportId: number) {
  return user?.role === "Coach" && user.sportIds.includes(sportId);
}

export function canUsePtFeatures(user: SessionUser | null, ptSportId: number) {
  return canTeachSport(user, ptSportId);
}

export function canBookCourt(user: SessionUser | null) {
  return user?.role === "ExternalCoach" && user.approvalStatus === "APPROVED";
}

export function canManageCatalog(user: SessionUser | null) {
  return user?.role === "CenterManager";
}
