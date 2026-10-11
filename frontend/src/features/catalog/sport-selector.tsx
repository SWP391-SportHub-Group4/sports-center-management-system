"use client";
import { hasService } from "@/lib/sports";
import { Field, AsyncSection } from "@/components/ui";
import { useLanguage } from "@/lib/language";
import { useApi } from "@/lib/useApi";
import { catalogApi } from "./api";
export function SportSelector({
  value,
  onChange,
  groupOnly = false,
}: {
  value: string;
  onChange: (value: string) => void;
  groupOnly?: boolean;
}) {
  const { t } = useLanguage();
  const sports = useApi((s) => catalogApi.sports(s), []);
  return (
    <AsyncSection state={sports}>
      {(rows) => (
        <Field label={t.operations.sport}>
          <select
            required
            value={value}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">—</option>
            {rows
              .filter((s) => !groupOnly || hasService(s, "GROUP_COURSE"))
              .map((s) => (
                <option key={s.sportId} value={s.sportId}>
                  {s.name}
                </option>
              ))}
          </select>
        </Field>
      )}
    </AsyncSection>
  );
}
