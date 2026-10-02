"use client";
import type { SportDto } from "@/lib/types";
import { useLanguage } from "@/lib/language";
export function SpecialtyEditor({
  sports,
  value,
  onChange,
}: {
  sports: SportDto[];
  value: number[];
  onChange: (value: number[]) => void;
}) {
  const { t } = useLanguage();
  return (
    <fieldset>
      <legend>{t.operations.specialties}</legend>
      {sports.map((s) => (
        <label key={s.sportId}>
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
          {s.name}
          {!s.isActive && ` (${t.operations.deactivate})`}
        </label>
      ))}
    </fieldset>
  );
}
