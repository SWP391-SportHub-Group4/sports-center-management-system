"use client";

import { useState } from "react";
import { Field } from "@/components/ui";
import HomepageImage from "@/components/homepage/HomepageImage";
import {
  coachFramePrefix,
  readCoachFrame,
  type HomepageCoach,
} from "@/components/homepage/homepage-showcase";
import { DEFAULT_AVATAR } from "@/lib/avatar";
import { homepageImageSpecs } from "@/components/homepage/image-specs";
import styles from "./featured-coach-picker.module.css";

export function CoachImageFraming({
  coach,
  values,
  onChange,
}: {
  coach: HomepageCoach;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  const frame = readCoachFrame(values, coach.userId);
  const prefix = coachFramePrefix(coach.userId);
  const [resolution, setResolution] = useState<{
    width: number;
    height: number;
    graphic: boolean;
  } | null>(null);
  const set = (field: string, value: string) =>
    onChange(`${prefix}.${field}`, value);
  return (
    <details className={styles.framing}>
      <summary>Adjust homepage image</summary>
      <div className={styles.frameLayout}>
        <div
          className={styles.framePreview}
          style={{ aspectRatio: homepageImageSpecs.coach.ratio }}
        >
          <HomepageImage
            src={coach.avatarUrl || DEFAULT_AVATAR}
            fallbackSrc={DEFAULT_AVATAR}
            alt={`Homepage portrait of ${coach.fullName}`}
            fill
            sizes="260px"
            style={{
              objectFit: frame.fit,
              objectPosition: `${frame.x}% ${frame.y}%`,
              transform: `scale(${frame.zoom})`,
            }}
            onLoad={(event) =>
              setResolution({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
                graphic:
                  event.currentTarget.currentSrc.includes("avatar-default.svg"),
              })
            }
          />
        </div>
        <div className={styles.frameControls}>
          <Field label="Photo fit">
            <select
              value={frame.fit}
              onChange={(event) => set("fit", event.target.value)}
            >
              <option value="contain">Show full photo</option>
              <option value="cover">Fill square frame</option>
            </select>
          </Field>
          <Field label={`Horizontal position · ${frame.x}%`}>
            <input
              type="range"
              min="0"
              max="100"
              value={frame.x}
              onChange={(event) => set("x", event.target.value)}
            />
          </Field>
          <Field label={`Vertical position · ${frame.y}%`}>
            <input
              type="range"
              min="0"
              max="100"
              value={frame.y}
              onChange={(event) => set("y", event.target.value)}
            />
          </Field>
          <Field label={`Zoom · ${frame.zoom.toFixed(2)}×`}>
            <input
              type="range"
              min="1"
              max="2"
              step="0.05"
              value={frame.zoom}
              onChange={(event) => set("zoom", event.target.value)}
            />
          </Field>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => {
              set("fit", "contain");
              set("x", "50");
              set("y", "50");
              set("zoom", "1");
            }}
          >
            Reset framing
          </button>
          <p className={styles.help}>
            This 1:1 frame matches the avatar upload and homepage. Changes do
            not alter the Coach&apos;s avatar.
          </p>
          {resolution &&
            !resolution.graphic &&
            Math.min(resolution.width, resolution.height) < 800 && (
              <p className={styles.qualityNotice}>
                This image is {resolution.width} × {resolution.height} px. Ask
                the Coach to upload the original photo again for a sharper
                portrait. Older uploads cannot recover lost detail.
              </p>
            )}
        </div>
      </div>
    </details>
  );
}
