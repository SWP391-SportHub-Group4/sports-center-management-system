"use client";

import { useId } from "react";
import styles from "./body-build-selector.module.css";

export const BODY_BUILDS = [
  { value: "SLENDER", label: "Slender", position: "0%" },
  { value: "ATHLETIC", label: "Athletic", position: "50%" },
  { value: "FULLER", label: "Fuller", position: "100%" },
] as const;

export function BodyBuildSelector({
  value,
  onChange,
}: {
  value: string;
  onChange?: (value: string) => void;
}) {
  const name = useId();
  return (
    <fieldset className={styles.selector}>
      <legend>
        Current body build <small>Self-reported · optional</small>
      </legend>
      <p>
        Choose the illustration closest to your current build. These are visual
        references, not body-fat measurements.
      </p>
      <div className={styles.options}>
        {BODY_BUILDS.map((build) => (
          <label
            key={build.value}
            className={styles.option}
            data-selected={value === build.value}
          >
            {onChange && (
              <input
                type="radio"
                name={name}
                value={build.value}
                checked={value === build.value}
                onChange={() => onChange(build.value)}
              />
            )}
            <span
              className={styles.figure}
              aria-hidden="true"
              style={{ backgroundPosition: `${build.position} center` }}
            />
            <strong>{build.label}</strong>
            {!onChange && value === build.value && (
              <small>Selected by member</small>
            )}
          </label>
        ))}
      </div>
      {onChange ? (
        <button
          className="btn btn--quiet btn--sm"
          type="button"
          onClick={() => onChange("")}
        >
          Prefer not to specify
        </button>
      ) : (
        !value && <p>Body build not specified by the member.</p>
      )}
    </fieldset>
  );
}
