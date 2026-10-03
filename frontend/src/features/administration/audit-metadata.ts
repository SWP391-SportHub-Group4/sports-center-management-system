// Explicit scalar allowlist: never render arbitrary JSON or fall back to raw strings.
const allowed = new Set(["status", "role", "sportIds", "points", "pointsApplied", "availableAfter", "heldAfter", "direction", "invoiceId", "invoiceItemId", "memberId", "ownerId", "ownerUserId", "confirmationId", "revision", "systemCalculatedPoints", "approvedPoints", "centerFault", "ledgerEntryId", "roomId", "classId", "sessionId", "entitlementId", "coachId", "startAtUtc", "endAtUtc", "isActive", "version"]);
export function auditMetadata(raw: string | null): [string, string][] {
  if (!raw) return [];
  try { const parsed: unknown = JSON.parse(raw); if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return []; const wrapper = parsed as Record<string, unknown>; const data = wrapper.value && typeof wrapper.value === "object" && !Array.isArray(wrapper.value) ? wrapper.value as Record<string, unknown> : wrapper;
    return Object.entries(data).filter(([key, value]) => allowed.has(key) && (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || (key === "sportIds" && Array.isArray(value) && value.every(v => typeof v === "number")))).map(([key, value]) => [key, String(value)]);
  } catch { return []; }
}
