"use client";

import { useState } from "react";
import { ArrowUp, ArrowDown, X } from "lucide-react";
import { AvatarImage } from "@/components/AvatarImage";
import { Field } from "@/components/ui";
import {
  coachSportsLabel,
  suggestHomepageCoaches,
  type HomepageCoach,
} from "@/components/homepage/homepage-showcase";
import styles from "./featured-coach-picker.module.css";
import { CoachImageFraming } from "./coach-image-framing";

export function FeaturedCoachPicker({
  coaches,
  selectedIds,
  onChange,
  frameValues,
  onFrameChange,
}: {
  coaches: HomepageCoach[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  frameValues: Record<string, string>;
  onFrameChange: (key: string, value: string) => void;
}) {
  const [search, setSearch] = useState("");
  const suggestions = suggestHomepageCoaches(coaches);
  const suggestedIds = new Set(suggestions.map((coach) => coach.userId));
  const candidates = [...coaches]
    .sort(
      (a, b) =>
        Number(!!b.avatarUrl) - Number(!!a.avatarUrl) ||
        a.fullName.localeCompare(b.fullName),
    )
    .filter((coach) =>
      `${coach.fullName} ${coachSportsLabel(coach)}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
    );
  const move = (index: number, offset: number) => {
    const next = [...selectedIds];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    onChange(next);
  };
  return (
    <section className={styles.picker} aria-label="Featured Coaches">
      <header className={styles.header}>
        <div>
          <h3>
            Featured Coaches <span>{selectedIds.length}/3</span>
          </h3>
          <p>
            Choose three active Coaches. Names, photos and sports stay linked to
            their profiles.
          </p>
        </div>
        <button
          type="button"
          className="btn btn--secondary"
          disabled={suggestions.length < 3}
          onClick={() => onChange(suggestions.map((coach) => coach.userId))}
        >
          Use suggestions
        </button>
      </header>
      <ol className={styles.selection} aria-label="Homepage display order">
        {[0, 1, 2].map((index) => {
          const id = selectedIds[index];
          const coach = coaches.find((entry) => entry.userId === id);
          return (
            <li key={index} data-empty={!id}>
              <span
                className={styles.position}
                aria-label={`Position ${index + 1}`}
              >
                {index + 1}
              </span>
              {coach && (
                <AvatarImage
                  name={coach.fullName}
                  avatarUrl={coach.avatarUrl}
                  size={44}
                />
              )}
              <div className={styles.identity}>
                <strong>
                  {coach?.fullName ??
                    (id ? "Coach no longer available" : "Choose a Coach")}
                </strong>
                <span>
                  {coach
                    ? coachSportsLabel(coach)
                    : id
                      ? "Remove this selection and choose an active Coach."
                      : "This position is empty."}
                </span>
              </div>
              {id && (
                <div className={styles.orderActions}>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    aria-label={`Move ${coach?.fullName ?? "Coach"} up`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp size={16} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    aria-label={`Move ${coach?.fullName ?? "Coach"} down`}
                    disabled={index >= selectedIds.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown size={16} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    aria-label={`Remove ${coach?.fullName ?? "unavailable Coach"}`}
                    onClick={() =>
                      onChange(
                        selectedIds.filter((_, position) => position !== index),
                      )
                    }
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </div>
              )}
              {coach && (
                <CoachImageFraming
                  key={`${coach.userId}:${coach.avatarUrl ?? "default"}`}
                  coach={coach}
                  values={frameValues}
                  onChange={onFrameChange}
                />
              )}
            </li>
          );
        })}
      </ol>
      <div className={styles.directoryHeader}>
        <h4>Choose from your Coaches</h4>
        <span>Coaches with a profile photo appear first.</span>
      </div>
      <Field label="Find a Coach">
        <input
          type="search"
          placeholder="Search name or sport"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </Field>
      <div className={styles.candidates}>
        {candidates.map((coach) => {
          const checked = selectedIds.includes(coach.userId);
          return (
            <label
              key={coach.userId}
              className={styles.candidate}
              data-selected={checked}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={!checked && selectedIds.length >= 3}
                onChange={() =>
                  onChange(
                    checked
                      ? selectedIds.filter((id) => id !== coach.userId)
                      : [...selectedIds, coach.userId],
                  )
                }
              />
              <AvatarImage
                name={coach.fullName}
                avatarUrl={coach.avatarUrl}
                size={48}
              />
              <span className={styles.identity}>
                <strong>{coach.fullName}</strong>
                <span>{coachSportsLabel(coach)}</span>
                <small>
                  {suggestedIds.has(coach.userId) && coach.avatarUrl
                    ? "Suggested · Has profile photo"
                    : coach.avatarUrl
                      ? "Has profile photo"
                      : "No profile photo yet"}
                </small>
              </span>
            </label>
          );
        })}
        {!candidates.length && (
          <p className={styles.empty}>
            {coaches.length
              ? "No Coaches match your search."
              : "No active Coaches are available yet."}
          </p>
        )}
      </div>
      <p className={styles.help} role="status">
        {coaches.length < 3
          ? "At least three active Coaches are needed before this page can be published."
          : selectedIds.length < 3
            ? `Choose ${3 - selectedIds.length} more ${selectedIds.length === 2 ? "Coach" : "Coaches"} before publishing.`
            : "Three Coaches selected. Use the arrows to change their homepage order."}
      </p>
    </section>
  );
}
