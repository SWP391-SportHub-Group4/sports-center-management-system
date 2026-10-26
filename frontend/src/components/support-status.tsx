import styles from "./support-status.module.css";

export const SUPPORT_STATUS_LABELS: Record<string, string> = {
  OPEN: "Received",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In progress",
  DONE: "Done",
  REJECTED: "Reject",
  CLOSED: "Done",
};

export const SUPPORT_STATUS_FILTERS = [
  { value: "NOT_STARTED", label: "Not started (group)" },
  ...["OPEN", "ASSIGNED", "IN_PROGRESS"].map((value) => ({
    value,
    label: SUPPORT_STATUS_LABELS[value],
  })),
  { value: "FINISHED", label: "Done" },
  { value: "REJECTED", label: "Reject" },
];

export function supportStatusLabel(status: string) {
  if (status === "NOT_STARTED") return "Not started";
  if (status === "FINISHED") return "Done";
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
