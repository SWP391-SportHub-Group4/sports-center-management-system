const PREFIX = "SPORTHUB-MEMBER-V1:";

/** Opaque, short-lived backend code. Never use this as an entry or payment credential. */
export function memberCodePayload(code: string) {
  return PREFIX + code;
}

/** Accept only server-issued QR payloads, never a guessed Member user ID. */
export function parseMemberCode(text: string): string | null {
  const value = text.trim();
  if (!value.startsWith(PREFIX)) return null;
  const code = value.slice(PREFIX.length);
  return code.length > 20 && code.length <= 2048 ? code : null;
}
