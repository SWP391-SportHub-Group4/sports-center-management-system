import type { ReactNode } from "react";
import styles from "./EmptyPanel.module.css";

/** Trạng thái trống có hướng đi tiếp: biểu tượng nhỏ, tiêu đề, một câu giải thích, một hành động nhẹ. */
export function EmptyPanel({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className={styles.panel}>
      <span className={styles.icon} aria-hidden="true">
        {icon}
      </span>
      <div className={styles.text}>
        <h3>{title}</h3>
        {body && <p>{body}</p>}
      </div>
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
