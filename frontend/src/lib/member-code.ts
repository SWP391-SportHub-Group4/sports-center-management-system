const PREFIX = "SPORTHUB-MEMBER:";
const DAY_PASS_PREFIX = "SPORTHUB-DAYPASS:";
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Text encoded in a Member's QR. It only identifies the Member; it is not an entry credential. */
export function memberCodePayload(userId: string) {
  return PREFIX + userId;
}

/** Day-pass QR is dated in Vietnam time. Membership validity is still verified by the server. */
export function dayPassCodePayload(userId: string, localDate: string) {
  return `${DAY_PASS_PREFIX}${localDate}:${userId}`;
}

/** Accepts the QR payload or a bare user ID typed/scanned at the desk. Returns the user ID. */
export function parseMemberCode(text: string): string | null {
  const value = text.trim();
  if (value.startsWith(DAY_PASS_PREFIX)) {
    const match = /^SPORTHUB-DAYPASS:(\d{4}-\d{2}-\d{2}):([0-9a-f-]{36})$/i.exec(value);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
    return match && match[1] === today && GUID.test(match[2]) ? match[2].toLowerCase() : null;
  }
  const id = value.startsWith(PREFIX) ? value.slice(PREFIX.length) : value;
  return GUID.test(id) ? id.toLowerCase() : null;
}
