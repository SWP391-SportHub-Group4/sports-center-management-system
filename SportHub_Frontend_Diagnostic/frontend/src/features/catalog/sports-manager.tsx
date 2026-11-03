"use client";
import { useState } from "react";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { StatusChip } from "@/components/ui";
import { useMutation } from "@/features/operations";
import type { SportDto } from "@/lib/types";
import { catalogApi } from "./api";
import { SportEditor } from "./sport-editor";
import {
  CatalogPanel,
  CatalogFeedback,
  CatalogFilters,
  CatalogTable,
  matchesCatalog,
  useCatalogFilters,
} from "./manager-shared";
import styles from "./manager-catalog.module.css";

export function SportsManager() {
  const { t } = useLanguage();
  const l = t.operations;
  const c = t.managerCatalog;
  const state = useApi((s) => catalogApi.sports(s, true), []);
  const filters = useCatalogFilters();
  const mutation = useMutation();
  const [editor, setEditor] = useState<{ row?: SportDto } | null>(null);
  const edit = (row?: SportDto) => setEditor({ row });
  return (
    <>
      <CatalogPanel
        filters={<CatalogFilters filters={filters} />}
        actions={
          <button
            className="btn"
            disabled={state.loading || !!state.error}
            onClick={() => edit()}
          >
            {c.createSport}
          </button>
        }
      >
        <CatalogTable
          className={styles.sportsTable}
          state={state}
          filters={filters}
          caption={l.sports}
          rows={(state.data ?? []).filter((s) =>
            matchesCatalog(s, `${s.code} ${s.name}`, filters.values),
          )}
          getRowId={(s) => String(s.sportId)}
          columns={[
            { id: "sortOrder", header: c.ordinal, numeric: true },
            { id: "name", header: l.name, rowHeader: true },
            {
              id: "code",
              header: l.code,
              cell: (s) => <span className={styles.sportCode}>{s.code}</span>,
            },
            {
              id: "isActive",
              header: l.status,
              cell: (s) => (
                <StatusChip value={s.isActive ? "ACTIVE" : "INACTIVE"} />
              ),
            },
          ]}
          actions={(s) => (
            <>
              <button
                className="btn btn--secondary btn--sm"
                disabled={mutation.busy}
                onClick={() => edit(s)}
              >
                {l.edit}
              </button>
            </>
          )}
        />
        {!editor && mutation.success && <CatalogFeedback mutation={mutation} />}
      </CatalogPanel>
      {editor && (
        <SportEditor
          row={editor.row}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            state.reload();
          }}
        />
      )}
    </>
  );
}
