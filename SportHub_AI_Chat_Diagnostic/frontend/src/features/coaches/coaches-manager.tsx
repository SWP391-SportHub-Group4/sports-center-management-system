"use client";
import Link from "next/link";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { useUrlQuery, pageQuery } from "@/lib/useUrlQuery";
import { ApiTable, FilterBar, StatusChip } from "@/components/data";
import { catalogApi } from "@/features/catalog";
import type { CoachAdminDto, Paged } from "@/lib/types";
import { AvatarImage } from "@/components/AvatarImage";
export function CoachesManager() {
  const { t } = useLanguage();
  const l = t.operations;
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
          {
            id: "fullName",
            header: l.fullName,
            rowHeader: true,
            cell: (c) => (
              <span>
                <AvatarImage
                  userId={c.userId}
                  name={c.fullName}
                  avatarUrl={c.avatarUrl}
                  size={32}
                />{" "}
                {c.fullName}
              </span>
            ),
          },
          { id: "email", header: l.email },
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
          </>
        )}
      />
    </>
  );
}
