"use client";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { formatDate } from "@/lib/format";
import {
  AsyncSection,
  Dialog,
  Pager,
  StatusChip,
  Table,
} from "@/components/ui";
import type {
  MemberPackageDto,
  MembershipPackageDto,
  Paged,
} from "@/lib/types";
type Buyer = MemberPackageDto & {
  memberId: string;
  memberName: string;
  memberEmail: string;
};
export function PackageMembers({
  plan,
  onClose,
}: {
  plan: MembershipPackageDto;
  onClose: () => void;
}) {
  const [page, setPage] = useState(1);
  const state = useApi(
    (signal) =>
      api.get<Paged<Buyer>>("/api/member-packages", {
        signal,
        query: { packageId: plan.packageId, page, pageSize: 20 },
      }),
    [plan.packageId, page],
  );
  return (
    <Dialog title={`${plan.name} · Members`} onClose={onClose} size="lg">
      <AsyncSection state={state}>
        {(data) => (
          <>
            {data.items.length ? (
              <Table headers={["Member", "Start", "End", "Status"]}>
                {data.items.map((p) => (
                  <tr key={p.memberPackageId}>
                    <td>
                      <Link href={`/manager/members/${p.memberId}`}>
                        {p.memberName || p.memberEmail}
                      </Link>
                    </td>
                    <td>{formatDate(p.startDate)}</td>
                    <td>{formatDate(p.endDate)}</td>
                    <td>
                      <StatusChip value={p.status} />
                    </td>
                  </tr>
                ))}
              </Table>
            ) : (
              <p>No members have registered for this package.</p>
            )}
            <Pager
              page={page}
              pageSize={data.pageSize}
              totalCount={data.totalCount}
              onChange={setPage}
            />
          </>
        )}
      </AsyncSection>
    </Dialog>
  );
}
