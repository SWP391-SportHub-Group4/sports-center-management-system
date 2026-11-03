"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, CalendarDays, Pencil, TriangleAlert } from "lucide-react";
import { ActivitySwitch } from "@/components/ActivitySwitch";
import { ConfirmRecordAction } from "@/components/ConfirmRecordAction";
import { MutationFeedback, useMutation } from "@/features/operations";
import { useLanguage } from "@/lib/language";
import type { RoomDto } from "@/lib/types";
import { catalogApi } from "./api";
import { CourtRateEditor } from "./court-pricing";
import { OpeningHoursEditor } from "./opening-hours-editor";
import { RoomBlocks } from "./room-blocks";
import styles from "./room-details.module.css";

export function RoomDetails({
  room,
  onEdit,
  onDeleted,
}: {
  room: RoomDto;
  onEdit: (room: RoomDto, apply: (updated: RoomDto) => void) => void;
  onDeleted: () => void;
}) {
  const { t } = useLanguage();
  const copy = t.managerCatalog;
  const [current, setCurrent] = useState(room);
  const rentalMutation = useMutation();
  const rental = !!current.allowRental;
  const params = useSearchParams();
  const tab = params.get("tab");
  // Preserve existing links to the old tabs, now as scroll destinations.
  useEffect(() => {
    const target =
      tab === "pricing"
        ? "rental-settings"
        : tab === "hours"
          ? "opening-hours"
          : tab === "blocks"
            ? "blocked-times"
            : null;
    if (!target) return;
    const frame = requestAnimationFrame(() =>
      document.getElementById(target)?.scrollIntoView({ block: "start" }),
    );
    return () => cancelAnimationFrame(frame);
  }, [tab]);

  return (
    <div className={styles.detail}>
      <Link href="/manager/facilities" className={styles.back}>
        <ArrowLeft size={16} aria-hidden="true" />
        {t.managerOperations.backToList}
      </Link>
      <header className={styles.summary}>
        <div className={styles.identity}>
          <h2>{current.name}</h2>
          <p>
            {t.operations.capacity}: {current.capacity}{" "}
            {current.capacity === 1 ? copy.capacityPerson : copy.capacityPeople}
          </p>
          <div className={styles.badges}>
            <span className={styles.badge} data-enabled={current.isActive}>
              {current.isActive ? t.wireStatus.ACTIVE : copy.roomDeactive}
            </span>
            <span className={styles.badge} data-enabled={!!current.allowRental}>
              {current.allowRental
                ? copy.roomRentalEnabled
                : copy.roomRentalDisabled}
            </span>
          </div>
        </div>
        <button
          type="button"
          className="btn btn--secondary"
          aria-label={copy.editCourt}
          title={copy.editCourt}
          onClick={() => onEdit(current, setCurrent)}
        >
          <Pencil size={16} aria-hidden="true" />
        </button>
      </header>
      <nav className={styles.links} aria-label={copy.roomActions}>
        <Link href={`/manager/schedule?roomId=${current.roomId}`}>
          <CalendarDays size={16} aria-hidden="true" />
          {copy.roomViewSchedule}
        </Link>
        <Link href={`/manager/incidents?roomId=${current.roomId}`}>
          <TriangleAlert size={16} aria-hidden="true" />
          {t.operations.incidents}
        </Link>
      </nav>

      <div className={styles.sections}>
        <section
          id="rental-settings"
          className={styles.section}
          aria-labelledby="room-rental-title"
        >
          <header className={styles.sectionHeading}>
            <h2 id="room-rental-title">{copy.roomRentalSettings}</h2>
            <p>{copy.roomRentalDescription}</p>
          </header>
          <div className={styles.rentalForm}>
            <fieldset
              className={styles.rentalFields}
              disabled={rentalMutation.busy}
            >
              <legend className="sr-only">{copy.rentalAccess}</legend>
              <ActivitySwitch
                label={copy.allowRental}
                hint={copy.roomRentalAccessHint}
                checked={rental}
                onChange={async (value) => {
                  let updated: RoomDto | undefined;
                  if (await rentalMutation.run(async () => {
                    updated = await catalogApi.setRoomRental(current.roomId, value);
                  }) && updated) setCurrent(updated);
                }}
              />
            </fieldset>
            <MutationFeedback mutation={rentalMutation} />
          </div>
          {rental && (
            <div className={styles.pricing}>
              <p className={styles.explanation}>{copy.roomPriceWindowsHint}</p>
              <CourtRateEditor
                key={`${current.roomId}-${current.allowRental}`}
                roomId={current.roomId}
              />
            </div>
          )}
        </section>

        <section
          id="opening-hours"
          className={styles.section}
          aria-labelledby="room-hours-title"
        >
          <header className={styles.sectionHeading}>
            <h2 id="room-hours-title">{t.operations.openingHours}</h2>
          </header>
          <OpeningHoursEditor roomId={current.roomId} showHeading={false} showInstructions={false} showTimezone={false} />
        </section>

        <section
          id="blocked-times"
          className={styles.section}
          aria-labelledby="room-blocks-title"
        >
          <header className={styles.sectionHeading}>
            <h2 id="room-blocks-title">{copy.blockTimes}</h2>
            <p>{copy.roomBlockedDescription}</p>
          </header>
          <RoomBlocks roomId={current.roomId} showHeading={false} />
        </section>
      </div>

      <section className={styles.danger} aria-labelledby="room-delete-title">
        <div>
          <h2 id="room-delete-title">{t.recordActions.deleteRoom}</h2>
          <p>{copy.roomDeleteHint}</p>
        </div>
        <ConfirmRecordAction
          label={t.recordActions.deleteRoom}
          title={t.recordActions.deleteRoom}
          description={t.recordActions.roomDescription}
          recordName={current.name}
          onConfirm={() => catalogApi.deleteRoom(current.roomId)}
          onCompleted={onDeleted}
        />
      </section>
    </div>
  );
}
