
export function aiPlainText(value: string): string {
  if (!value) return "";

  return value
    .replace(/\r\n?/g, "\n")
    .replace(/```[^\n]*\n?/g, "")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*[-+*]\s+/gm, "")
    .replace(/^\s*(\d+)[.)]\s+/gm, "$1. ")
    .replace(/[*#`~]/g, "")
    .replace(/__/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
