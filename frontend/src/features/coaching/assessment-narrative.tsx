import styles from "./assessment-narrative.module.css";

const headings =
  /^(Result|Outcome|Strengths|Needs work|Next lesson|Kết quả|Điểm mạnh|Cần cải thiện|Buổi tiếp theo)\s*:\s*(.*)$/i;

export function AssessmentNarrative({ content }: { content: string }) {
  const sections: { title: string; lines: string[] }[] = [];
  const introduction: string[] = [];

  for (const line of content.split(/\r?\n/)) {
    const heading = line.match(headings);
    if (heading) {
      sections.push({
        title: heading[1],
        lines: heading[2] ? [heading[2]] : [],
      });
    } else if (sections.length) {
      sections[sections.length - 1].lines.push(line);
    } else {
      introduction.push(line);
    }
  }

  if (!sections.length) return <p className={styles.plain}>{content}</p>;

  return (
    <div className={styles.narrative}>
      {introduction.join("\n").trim() && (
        <p className={styles.plain}>{introduction.join("\n").trim()}</p>
      )}
      {sections.map(({ title, lines }, index) => (
        <section key={`${title}-${index}`}>
          <h6>{title}</h6>
          <p>{lines.join("\n").trim() || "—"}</p>
        </section>
      ))}
    </div>
  );
}
