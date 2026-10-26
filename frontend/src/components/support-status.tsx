import styles from "./support-status.module.css";

export const SUPPORT_STATUS_LABELS: Record<string, string> = {
  OPEN: "Received",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In progress",
  DONE: "Resolved",
  REJECTED: "Declined",
  CLOSED: "Closed",
};

export const SUPPORT_STATUS_FILTERS = [
  { value: "NOT_STARTED", label: "Not started (group)" },
  { value: "FINISHED", label: "Finished (group)" },
  ...Object.entries(SUPPORT_STATUS_LABELS).map(([value, label]) => ({
    value,
    label,
  })),
];

export function supportStatusLabel(status: string) {
  if (status === "NOT_STARTED") return "Not started";
  if (status === "FINISHED") return "Finished";
  return SUPPORT_STATUS_LABELS[status] ?? status;
}

export function SupportStatus({ status }: { status: string }) {
  return (
    <span className={styles.badge} data-status={status}>
      <span className={styles.dot} aria-hidden="true" />
      {supportStatusLabel(status)}
    </span>
  );
}
