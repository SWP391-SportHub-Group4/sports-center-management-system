import type { NotificationDto } from "./notifications-api";
import styles from "./notifications.module.css";

export function gymClosureDetails(item: NotificationDto) {
  if (!/INCIDENT/i.test(item.sourceEventType)) return null;
  const match = item.message.match(
    /^The Gym is closed from (\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}) to (\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}) \(Vietnam time\)\. Reason: ([\s\S]+?)\. Your affected Gym day-pass expiry time\(s\): ([\s\S]+?) \(Vietnam time\)\. ([\s\S]+)$/,
  );
  if (!match) return null;
  return {
    start: match[1],
    end: match[2],
    reason: match[3],
    expiries: match[4].split(", "),
    guidance: match[5].split(/(?<=\.)\s+(?=This incident|Please contact)/),
  };
}

export function NotificationBody({ item }: { item: NotificationDto }) {
  const closure = gymClosureDetails(item);
  if (!closure) return <div className={styles.body}>{item.message}</div>;
  return (
    <div className={`${styles.body} ${styles.closureBody}`}>
      <p>The Gym is temporarily closed during the period below.</p>
      <p className={styles.closureTimezone}>
        All times are in Vietnam time (UTC+7).
      </p>
      <dl className={styles.closureDetails}>
        <div>
          <dt>Closure starts</dt>
          <dd>{closure.start}</dd>
        </div>
        <div>
          <dt>Closure ends</dt>
          <dd>{closure.end}</dd>
        </div>
        <div>
          <dt>Reason</dt>
          <dd>{closure.reason}</dd>
        </div>
        <div>
          <dt>Your day-pass expiry</dt>
          <dd>
            {closure.expiries.map((expiry) => (
              <span key={expiry}>{expiry}</span>
            ))}
          </dd>
        </div>
      </dl>
      <section
        className={styles.closureGuidance}
        aria-label="What this means for your pass"
      >
        <h3>What this means for your pass</h3>
        {closure.guidance.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </section>
    </div>
  );
}
