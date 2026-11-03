import { BookOpen, MapPin } from "lucide-react";
import { CourtIcon } from "@/components/brand/CourtIcon";
import type { EventKind } from "./event-meta";
import styles from "./calendar-sticker.module.css";

export function CalendarSticker({
  sport,
  kind,
}: {
  sport?: string | null;
  kind: EventKind;
}) {
  const name = (sport ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const icon = /cau long|badminton/.test(name)
    ? "badminton"
    : /bong ro|basketball/.test(name)
      ? "basketball"
      : /gym|fitness/.test(name)
        ? "gym"
        : "calendar";
  const KindIcon = kind === "rental" ? MapPin : BookOpen;
  return (
    <span
      className={styles.sticker}
      data-sport={icon}
      data-kind={kind}
      aria-hidden="true"
    >
      <span className={styles.emblem}>
        <CourtIcon name={icon} size={20} />
      </span>
      <span className={styles.badge}>
        <KindIcon size={9} strokeWidth={2.5} />
      </span>
    </span>
  );
}
