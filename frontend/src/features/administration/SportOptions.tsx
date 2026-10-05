"use client";

import Link from "next/link";
import { StateView } from "@/components/data";
import { stateKindFromStatus } from "@/components/contracts/state";
import type { AsyncState } from "@/lib/useApi";
import type { SportDto } from "@/lib/types";
import { useLanguage } from "@/lib/language";
import styles from "./users.module.css";

/** Active sports and standardized loading, empty and error states for Admin forms. */
export function SportOptions({
  state,
  value,
  onChange,
}: {
  state: AsyncState<SportDto[]>;
  value: number[];
  onChange: (value: number[]) => void;
}) {
  const { t } = useLanguage();
  const rows = (state.data ?? []).filter((sport) => sport.isActive);
  const kind = state.loading
    ? "loading"
    : state.error
      ? stateKindFromStatus(state.error.status)
      : rows.length === 0
        ? "empty"
        : "ready";
  return (
    <fieldset className={styles.sportSelector}>
      <legend>{t.staffWork.specialties}</legend>
      {kind === "ready" ? (
        rows.map((sport) => (
          <label key={sport.sportId} className={styles.sportOption}>
            <input
              type="checkbox"
              checked={value.includes(sport.sportId)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...value, sport.sportId]
                    : value.filter((id) => id !== sport.sportId),
                )
              }
            />
            <span>{sport.name}</span>
          </label>
        ))
      ) : (
        <StateView
          kind={kind}
          title={t.sportState[`${kind}Title`]}
          description={t.sportState[`${kind}Hint`]}
          code={state.error?.code}
          action={
            kind === "loading" ? undefined : kind === "forbidden" ? (
              <Link href="/" className="btn btn--secondary">
                {t.dataTable.home}
              </Link>
            ) : (
              <button
                type="button"
                className="btn btn--secondary"
                onClick={state.reload}
              >
                {kind === "error" ? t.common.retry : t.dataTable.reload}
              </button>
            )
          }
        />
      )}
    </fieldset>
  );
}
