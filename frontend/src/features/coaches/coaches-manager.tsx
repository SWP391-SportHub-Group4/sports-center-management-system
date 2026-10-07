"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { useUrlQuery, pageQuery } from "@/lib/useUrlQuery";
import { ApiTable, FilterBar, StatusChip } from "@/components/data";
import { catalogApi } from "@/features/catalog";
import { CoachEditor } from "./coach-editor";
import type { CoachAdminDto, Paged } from "@/lib/types";
export function CoachesManager() {
  const { t } = useLanguage();
  const l = t.operations;
  const router = useRouter();
  const [editing, setEditing] = useState<CoachAdminDto | null | undefined>(
    undefined,
  );
  const { values, setValues } = useUrlQuery(
    { keyword: "", sportId: "", page: "1" },
    { page: pageQuery },
  );
  const page = Number(values.page);
  const state = useApi(
    (signal) =>
      api.get<Paged<CoachAdminDto>>("/api/manager/coaches", {
        signal,
        query: { ...values, page, pageSize: 20 },
      }),
    [values.keyword, values.sportId, page],
  );
  const sports = useApi((signal) => catalogApi.sports(signal, true), []);
  return (
    <>
      <FilterBar
        fields={[
          { id: "keyword", label: l.search, kind: "search" },
          {
            id: "sportId",
            label: l.sport,
            kind: "select",
            options: [
              { value: "", label: l.all },
              ...(sports.data ?? []).map((s) => ({
                value: String(s.sportId),
                label: s.name,
              })),
            ],
          },
        ]}
        values={values}
        onChange={(next) => setValues({ ...next, page: "1" })}
        onReset={() => setValues({ keyword: "", sportId: "", page: "1" })}
        actions={
          <button className="btn" onClick={() => setEditing(null)}>
            {l.create}
          </button>
        }
      />
      {sports.error && <p role="alert">{sports.error.message}</p>}
      <ApiTable
        state={state}
        caption={l.coaches}
        page={page}
        pageSize={20}
        onPageChange={(page) => setValues({ page: String(page) })}
        getRowId={(c) => c.userId}
        columns={[
          { id: "fullName", header: l.fullName, rowHeader: true },
          { id: "email", header: l.email },
          {
            id: "sportIds",
            header: l.specialties,
            cell: (c) =>
              c.sportIds
                .map(
                  (id) =>
                    sports.data?.find((s) => s.sportId === id)?.name ??
                    `#${id}`,
                )
                .join(", "),
          },
          {
            id: "status",
            header: l.status,
            cell: (c) => <StatusChip value={c.status} />,
          },
        ]}
        rowActions={(c) => (
          <>
            <Link
              className="btn btn--secondary"
              href={`/manager/coaches/${c.userId}`}
            >
              {l.details}
            </Link>
            <button className="btn btn--ghost" onClick={() => setEditing(c)}>
              {l.edit}
            </button>
          </>
        )}
      />
      {editing !== undefined && (
        <CoachEditor
          coach={editing ?? undefined}
          onClose={() => setEditing(undefined)}
          onSaved={(saved) => {
            setEditing(undefined);
            state.reload();
            if (editing === null)
              router.push(`/manager/coaches/${saved.userId}`);
          }}
        />
      )}
    </>
  );
}
