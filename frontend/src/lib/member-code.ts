const PREFIX = "SPORTHUB-MEMBER:";
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Text encoded in a Member's QR. It only identifies the Member; it is not an entry credential. */
export function memberCodePayload(userId: string) {
  return PREFIX + userId;
}

/** Accepts the QR payload or a bare user ID typed/scanned at the desk. Returns the user ID. */
export function parseMemberCode(text: string): string | null {
  const value = text.trim();
  const id = value.startsWith(PREFIX) ? value.slice(PREFIX.length) : value;
  return GUID.test(id) ? id.toLowerCase() : null;
}
