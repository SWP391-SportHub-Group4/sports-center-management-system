import styles from "./support-status.module.css";

export const SUPPORT_STATUS_LABELS: Record<string, string> = {
  OPEN: "Received",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In progress",
  DONE: "Done",
  REJECTED: "Reject",
  CLOSED: "Closed",
};

export function SupportStatus({ status }: { status: string }) {
  return (
    <span className={styles.badge} data-status={status}>
      <span className={styles.dot} aria-hidden="true" />
      {SUPPORT_STATUS_LABELS[status] ?? status}
    </span>
  );
}
