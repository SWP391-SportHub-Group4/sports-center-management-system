"use client";
import { useState } from "react";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { AsyncSection, Pager, Table } from "@/components/ui";
import type { Paged } from "@/lib/types";
type Row = {
  courseInterestId: string;
  memberId: string;
  memberName: string;
  sportName: string;
};
export function ManagerCourseInterests() {
  const [page, setPage] = useState(1);
  const state = useApi(
    (signal) =>
      api.get<Paged<Row>>("/api/course-interests", {
        signal,
        query: { active: true, page, pageSize: 20 },
      }),
    [page],
  );
  return (
    <AsyncSection state={state}>
      {(data) => (
        <>
          {data.items.length ? (
            <Table headers={["Member", "Sport"]}>
              {data.items.map((r) => (
                <tr key={r.courseInterestId}>
                  <td>{r.memberName}</td>
                  <td>{r.sportName}</td>
                </tr>
              ))}
            </Table>
          ) : (
            <p role="status">No members are following a next course.</p>
          )}
          <Pager
            page={data.page}
            pageSize={data.pageSize}
            totalCount={data.totalCount}
            onChange={setPage}
          />
        </>
      )}
    </AsyncSection>
  );
}
