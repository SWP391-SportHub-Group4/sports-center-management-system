/** Keep AI and existing Markdown plans readable in the plain-text plan editor. */
export function formatPlanContent(content: string): string {
  return content
    .replace(/^\s*```[^\n]*\n?/gm, "")
    .split(/\r?\n/)
    .map((line) =>
      line
        .trim()
        .replace(/^#{1,6}\s+/, "")
        .replace(/^(?:[-*•]\s+|\d+[.)]\s+)/, "")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/__([^_]+)__/g, "$1")
        .replace(/^([^:：]{1,70})[:：]\s+/, "$1 · "),
    )
    .filter(Boolean)
    .join("\n");
}
