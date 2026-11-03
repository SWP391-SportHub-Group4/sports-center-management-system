/** Strict final display filter for AI responses; do not apply to user input. */
export function aiPlainText(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/^[ \t]*`{3,}[^\n]*$/gm, "")
    .replace(/^[ \t]{0,3}#{1,6}[ \t]*/gm, "")
    .replace(/^[ \t]*>[ \t]?/gm, "")
    .replace(/^[ \t]*[-+*][ \t]+/gm, "")
    .replace(/[*#`~]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
