"use client";
import type { SportDto } from "@/lib/types";
import { useLanguage } from "@/lib/language";
import styles from "./specialty-editor.module.css";
export function SpecialtyEditor({
  sports,
  value,
  onChange,
  legend,
}: {
  sports: SportDto[];
  value: number[];
  onChange: (value: number[]) => void;
  legend?: string;
}) {
  const { t } = useLanguage();
  return (
    <fieldset className={styles.root}>
      <legend>{legend ?? t.operations.specialties}</legend>
      <div className={styles.options}>
        {sports.map((s) => (
          <label key={s.sportId} className={styles.option}>
            <input
              type="checkbox"
              disabled={!s.isActive && !value.includes(s.sportId)}
              checked={value.includes(s.sportId)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...value, s.sportId]
                    : value.filter((id) => id !== s.sportId),
                )
              }
            />
            <span>
              {s.name}
              {!s.isActive && (
                <span className={styles.inactive}>
                  {" "}
                  ({t.operations.deactivate})
                </span>
              )}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
