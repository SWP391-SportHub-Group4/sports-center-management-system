"use client";

import { useId, useRef, useState, type PointerEvent } from "react";
import { GripHorizontal, Search, UserRound, X } from "lucide-react";
import { AvatarImage } from "@/components/AvatarImage";
import HomepageImage from "@/components/homepage/HomepageImage";
import { DEFAULT_AVATAR } from "@/lib/avatar";
import {
  coachSportsLabel,
  type HomepageCoach,
} from "@/components/homepage/homepage-showcase";
import styles from "./featured-coach-picker.module.css";

export function FeaturedCoachPicker({
  coaches,
  selectedIds,
  onChange,
}: {
  coaches: HomepageCoach[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const helpId = useId();
  const list = useRef<HTMLUListElement>(null);
  const gesture = useRef<{
    from: number;
    over: number;
    startX: number;
    moved: boolean;
  } | null>(null);
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  const [changing, setChanging] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const candidates = coaches
    .filter(
      (coach) =>
        !selectedIds.includes(coach.userId) &&
        (coach.fullName + " " + coachSportsLabel(coach))
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
    )
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
  const move = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || to >= selectedIds.length) return;
    const next = [...selectedIds];
    const [id] = next.splice(from, 1);
    next.splice(to, 0, id);
    onChange(next);
    setAnnouncement(
      (coaches.find((coach) => coach.userId === id)?.fullName ?? "Coach") +
        " moved " +
        (to < from ? "left." : "right."),
    );
  };
  const endDrag = (event: PointerEvent<HTMLButtonElement>, cancel = false) => {
    const current = gesture.current;
    if (!current) return;
    if (!cancel && current.moved) move(current.from, current.over);
    gesture.current = null;
    setDrag(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const closeChoices = () => {
    const slot = changing;
    setChanging(null);
    setSearch("");
    requestAnimationFrame(() => {
      if (returnFocus.current?.isConnected) returnFocus.current.focus();
      if (slot !== null)
        list.current?.children[slot]
          ?.querySelector<HTMLButtonElement>("button[aria-expanded]")
          ?.focus();
    });
  };
  return (
    <section className={styles.picker} aria-label="Featured Coaches">
      <p id={helpId} className={styles.srOnly}>
        Drag the grip to reorder, or focus it and use the left/right arrow keys.
      </p>
      <ul
        ref={list}
        className={styles.selection}
        aria-label="Homepage display order"
      >
        {[0, 1, 2].map((index) => {
          const id = selectedIds[index];
          const coach = coaches.find((entry) => entry.userId === id);
          return (
            <li
              key={id ?? "empty-" + index}
              data-coach-id={id}
              className={styles.slot}
            >
              <div
                className={styles.coachCard}
                data-dragging={drag?.from === index || undefined}
                data-drop-target={
                  (drag?.over === index && drag.from !== index) || undefined
                }
              >
                <div className={styles.photo}>
                  {coach ? (
                    <HomepageImage
                      src={coach.avatarUrl || DEFAULT_AVATAR}
                      alt={coach.fullName}
                      fallbackSrc={DEFAULT_AVATAR}
                      fill
                      sizes="240px"
                      style={{ objectFit: "contain" }}
                    />
                  ) : (
                    <UserRound size={48} aria-hidden="true" />
                  )}
                  {coach && (
                    <button
                      type="button"
                      className={styles.grip}
                      aria-label={"Reorder " + coach.fullName}
                      aria-describedby={helpId}
                      onKeyDown={(event) => {
                        if (
                          event.key !== "ArrowLeft" &&
                          event.key !== "ArrowRight"
                        )
                          return;
                        event.preventDefault();
                        move(
                          index,
                          index + (event.key === "ArrowLeft" ? -1 : 1),
                        );
                      }}
                      onPointerDown={(event) => {
                        if (!event.isPrimary || event.button !== 0) return;
                        event.currentTarget.setPointerCapture(event.pointerId);
                        gesture.current = {
                          from: index,
                          over: index,
                          startX: event.clientX,
                          moved: false,
                        };
                      }}
                      onPointerMove={(event) => {
                        const current = gesture.current;
                        if (!current) return;
                        if (
                          Math.abs(event.clientX - current.startX) < 8 &&
                          !current.moved
                        )
                          return;
                        current.moved = true;
                        const cards = Array.from(list.current?.children ?? []);
                        let nearest = current.from,
                          distance = Infinity;
                        cards.forEach((card, position) => {
                          const rect = card.getBoundingClientRect();
                          const delta = Math.abs(
                            event.clientX - (rect.left + rect.width / 2),
                          );
                          if (
                            delta < distance &&
                            position < selectedIds.length
                          ) {
                            nearest = position;
                            distance = delta;
                          }
                        });
                        current.over = nearest;
                        setDrag({ from: current.from, over: current.over });
                      }}
                      onPointerUp={(event) => endDrag(event)}
                      onPointerCancel={(event) => endDrag(event, true)}
                      onLostPointerCapture={() => {
                        gesture.current = null;
                        setDrag(null);
                      }}
                    >
                      <GripHorizontal size={20} aria-hidden="true" />
                    </button>
                  )}
                </div>
                <div className={styles.identity}>
                  <strong>
                    {coach?.fullName ??
                      (id ? "Coach unavailable" : "Choose a coach")}
                  </strong>
                  <span>
                    {coach
                      ? coachSportsLabel(coach)
                      : "Select an active coach below."}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className={styles.changeButton}
                aria-label={
                  "Change coach: " + (coach?.fullName ?? "empty position")
                }
                aria-expanded={changing === index}
                aria-controls="coach-replacements"
                onClick={(event) => {
                  returnFocus.current = event.currentTarget;
                  setChanging(changing === index ? null : index);
                  setSearch("");
                }}
              >
                {coach ? "Change coach" : "Choose coach"}
              </button>
            </li>
          );
        })}
      </ul>
      {changing !== null && (
        <div id="coach-replacements" className={styles.replacements}>
          <div className={styles.choiceHeader}>
            <strong>Change coach</strong>
            <button
              type="button"
              className={styles.closeChoices}
              aria-label="Close coach choices"
              onClick={closeChoices}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <label className={styles.search}>
            <Search size={18} aria-hidden="true" />
            <input
              autoFocus
              type="search"
              aria-label="Find a coach"
              placeholder="Search name or sport"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.stopPropagation();
                  closeChoices();
                }
              }}
            />
          </label>
          <div className={styles.candidates}>
            {candidates.map((coach) => (
              <button
                type="button"
                key={coach.userId}
                className={styles.candidate}
                aria-label={"Choose " + coach.fullName}
                onClick={() => {
                  const next = [...selectedIds];
                  next[changing] = coach.userId;
                  onChange(next);
                  setAnnouncement(coach.fullName + " selected.");
                  closeChoices();
                }}
              >
                <AvatarImage
                  name={coach.fullName}
                  avatarUrl={coach.avatarUrl}
                  size={40}
                />
                <span className={styles.identity}>
                  <strong>{coach.fullName}</strong>
                  <span>{coachSportsLabel(coach)}</span>
                </span>
              </button>
            ))}
            {!candidates.length && (
              <p className={styles.empty}>
                {search
                  ? "No coaches match your search."
                  : "No other active coaches are available."}
              </p>
            )}
          </div>
        </div>
      )}
      {coaches.length < 3 && (
        <p className={styles.help}>
          At least three active coaches are needed to publish.
        </p>
      )}
      <p className={styles.srOnly} role="status" aria-live="polite">
        {announcement}
      </p>
    </section>
  );
}
