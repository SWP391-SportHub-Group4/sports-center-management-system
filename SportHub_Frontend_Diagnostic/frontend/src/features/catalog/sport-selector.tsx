"use client";
import { hasService } from "@/lib/sports";
import { Field, AsyncSection } from "@/components/ui";
import { useLanguage } from "@/lib/language";
import { useApi } from "@/lib/useApi";
import { catalogApi } from "./api";
import { InlineCreate } from "./inline-create";
export function SportSelector({
  value,
  onChange,
  groupOnly = false,
  allowCreate = false,
  onCatalogChanged,
}: {
  allowCreate?: boolean;
  onCatalogChanged?: () => void;
  value: string;
  onChange: (value: string) => void;
  groupOnly?: boolean;
}) {
  const { t } = useLanguage();
  const sports = useApi((s) => catalogApi.sports(s), []);
  return (
    <InlineCreate
      enabled={allowCreate}
      kind="sport"
      onCreated={(created) => {
        sports.reload();
        onChange(String(created.sportId));
        onCatalogChanged?.();
      }}
    >
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
    </InlineCreate>
  );
}
