"use client";

import Link from "next/link";
import { StateView } from "@/components/data";
import { stateKindFromStatus } from "@/components/contracts/state";
import type { AsyncState } from "@/lib/useApi";
import type { SportDto } from "@/lib/types";
import { hasService } from "@/lib/sports";
import { useLanguage } from "@/lib/language";
import styles from "./users.module.css";

/**
 * Sports a coach can be assigned to, with standardized loading, empty and error states for Admin forms.
 * Only active sports with group courses qualify: Gym has no coach, and a new sport appears here once its
 * group-course service is enabled.
 */
export function SportOptions({
  state,
  value,
  onChange,
  singleSelect = false,
  readOnly = false,
}: {
  state: AsyncState<SportDto[]>;
  value: number[];
  onChange: (value: number[]) => void;
  singleSelect?: boolean;
  readOnly?: boolean;
}) {
  const { t } = useLanguage();
  const rows = (state.data ?? []).filter((sport) =>
    readOnly
      ? value.includes(sport.sportId)
      : sport.isActive && hasService(sport, "GROUP_COURSE"),
  );
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
      {readOnly && !state.loading && !state.error ? (
        value.length ? (
          <ul className={styles.specialtyNames}>
            {value.map((id) => (
              <li key={id}>
                {rows.find((sport) => sport.sportId === id)?.name ??
                  `Sport #${id}`}
              </li>
            ))}
          </ul>
        ) : (
          <p>{t.adminWork.noSports}</p>
        )
      ) : kind === "ready" ? (
        rows.map((sport) => (
          <label key={sport.sportId} className={styles.sportOption}>
            <input
              type={singleSelect ? "radio" : "checkbox"}
              name={singleSelect ? "coach-create-specialty" : undefined}
              checked={value.includes(sport.sportId)}
              onChange={(event) =>
                onChange(
                  singleSelect
                    ? [sport.sportId]
                    : event.target.checked
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
