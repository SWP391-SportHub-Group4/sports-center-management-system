import { useId, type ReactNode } from "react";
import { AvatarImage } from "@/components/AvatarImage";
import styles from "./PersonProfile.module.css";

export function PersonProfileHeader({
  name,
  userId,
  avatarUrl,
  contact,
  status,
  actions,
}: {
  name: string;
  userId?: string;
  avatarUrl?: string | null;
  contact: ReactNode;
  status: ReactNode;
  actions?: ReactNode;
}) {
  const heading = useId();
  return (
    <section className={styles.header} aria-labelledby={heading}>
      <div className={styles.identity}>
        <AvatarImage
          userId={userId}
          name={name}
          avatarUrl={avatarUrl}
          size={80}
          className={styles.avatar}
        />
        <div className={styles.identityText}>
          <h2 id={heading}>{name}</h2>
          <div className={styles.contact}>{contact}</div>
        </div>
      </div>
      <div className={styles.headerControls}>
        {status}
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </section>
  );
}
