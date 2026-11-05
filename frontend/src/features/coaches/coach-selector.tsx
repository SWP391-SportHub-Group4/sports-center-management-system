"use client";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { AsyncSection, Field } from "@/components/ui";
export function CoachSelector({
  sportId,
  value,
  onChange,
  required = false,
}: {
  sportId: number;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  const { t } = useLanguage();
  const state = useApi(
    (s) =>
      sportId
        ? api.get<{ userId: string; fullName: string }[]>("/api/coaches", {
            signal: s,
            query: { sportId },
          })
        : Promise.resolve([]),
    [sportId],
  );
  return (
    <AsyncSection state={state}>
      {(rows) => (
        <Field label={t.operations.coach} required={required}>
          <select
            required={required}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">—</option>
            {rows.map((c) => (
              <option key={c.userId} value={c.userId}>
                {c.fullName}
              </option>
            ))}
          </select>
        </Field>
      )}
    </AsyncSection>
  );
}
