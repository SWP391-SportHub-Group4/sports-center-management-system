import type { SessionUser } from "./auth";

export function canTeachSport(user: SessionUser | null, sportId: number) {
  return user?.role === "Coach" && user.sportIds.includes(sportId);
}

export function canManageCatalog(user: SessionUser | null) {
  return user?.role === "CenterManager";
}
