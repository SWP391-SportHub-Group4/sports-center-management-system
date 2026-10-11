"use client";

import { useId } from "react";
import type { FilterBarProps } from "@/components/contracts/table";
import { Field } from "@/components/ui";
import { Input, Select } from "@/components/primitives/Controls";
import { useLanguage } from "@/lib/language";
import styles from "./FilterBar.module.css";

/** Controlled fields; the owning page decides when to apply values to the URL/API. */
export function FilterBar({
  fields,
  values,
  onChange,
  onReset,
  activeCount,
  actions,
}: FilterBarProps) {
  const { t } = useLanguage();
  const id = useId();
  const setValue = (key: string, value: string) =>
    onChange({ ...values, [key]: value });
  const count =
    activeCount ??
    fields.filter((field) =>
      field.kind === "dateRange"
        ? !!(values[`${field.id}From`] || values[`${field.id}To`])
        : field.kind === "toggle"
          ? values[field.id] === "true"
          : !!values[field.id],
    ).length;
  return (
    <div className={styles.root} role="group" aria-label={t.common.filter}>
      <div className={styles.fields}>
        {fields.map((field) => (
          <div key={field.id} className={styles.field} data-kind={field.kind}>
            {field.kind === "toggle" ? (
              <label className={styles.toggle}>
                <Input
                  type="checkbox"
                  name={field.id}
                  checked={values[field.id] === "true"}
                  onChange={(event) =>
                    setValue(field.id, event.target.checked ? "true" : "")
                  }
                />
                <span>{field.label}</span>
              </label>
            ) : field.kind === "dateRange" ? (
              <fieldset className={styles.range}>
                <legend>{field.label}</legend>
                <div className={styles.rangeFields}>
                  <Field label={t.filterBar.from}>
                    <Input
                      id={`${id}-${field.id}-from`}
                      name={`${field.id}From`}
                      type="date"
                      value={values[`${field.id}From`] ?? ""}
                      max={values[`${field.id}To`] || undefined}
                      onChange={(event) =>
                        setValue(`${field.id}From`, event.target.value)
                      }
                    />
                  </Field>
                  <Field label={t.filterBar.to}>
                    <Input
                      id={`${id}-${field.id}-to`}
                      name={`${field.id}To`}
                      type="date"
                      value={values[`${field.id}To`] ?? ""}
                      min={values[`${field.id}From`] || undefined}
                      onChange={(event) =>
                        setValue(`${field.id}To`, event.target.value)
                      }
                    />
                  </Field>
                </div>
              </fieldset>
            ) : (
              <Field label={field.label}>
                {field.kind === "select" ? (
                  <Select
                    id={`${id}-${field.id}`}
                    name={field.id}
                    value={values[field.id] ?? ""}
                    options={field.options ?? []}
                    onChange={(event) => setValue(field.id, event.target.value)}
                  />
                ) : (
                  <Input
                    id={`${id}-${field.id}`}
                    name={field.id}
                    type={field.kind === "date" ? "date" : "search"}
                    placeholder={field.placeholder}
                    value={values[field.id] ?? ""}
                    onChange={(event) => setValue(field.id, event.target.value)}
                  />
                )}
              </Field>
            )}
          </div>
        ))}
      </div>
      <div className={styles.actions}>
        {onReset && (
          <button type="button" className="btn btn--ghost" onClick={onReset}>
            {t.dataTable.clearFilters}
            {count > 0 && <span className={styles.count}>({count})</span>}
          </button>
        )}
        {actions}
      </div>
    </div>
  );
}
