/** Keep database identifiers in the API and links, never in audit display text. */
export function auditDisplayText(value: string): string {
  return value.replace(
    /#?\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    "Unavailable",
  );
}
