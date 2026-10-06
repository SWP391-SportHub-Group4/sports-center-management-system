import type { SessionUser } from "./auth";

export function canTeachSport(user: SessionUser | null, sportId: number) {
  return user?.role === "Coach" && user.sportIds.includes(sportId);
}

/** Quyền PT đến từ qualification dịch vụ PT, không từ chuyên môn môn Gym. */
export function canUsePtFeatures(user: SessionUser | null) {
  return user?.role === "Coach" && user.isPersonalTrainer === true;
}


export function canManageCatalog(user: SessionUser | null) {
  return user?.role === "CenterManager";
}
