"use client";
import Link from "next/link";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { formatDate } from "@/lib/format";
import { AsyncSection, Dialog, StatusChip, Table } from "@/components/ui";
import type {
  MemberPackageDto,
  MembershipPackageDto,
  Paged,
} from "@/lib/types";
import styles from "./package-members.module.css";
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
  const state = useApi(
    async (signal) => {
      const items: Buyer[] = [];
      let page = 1;
      while (true) {
        const result = await api.get<Paged<Buyer>>("/api/member-packages", {
          signal,
          query: {
            packageId: plan.packageId,
            currentMembersOnly: true,
            page,
            pageSize: 100,
          },
        });
        items.push(...result.items);
        if (!result.items.length || items.length >= result.totalCount) break;
        page++;
      }
      return items;
    },
    [plan.packageId],
  );
  return (
    <Dialog
      title={`${plan.name} · Members`}
      onClose={onClose}
      size="lg"
      className={styles.dialog}
    >
      <AsyncSection state={state}>
        {(data) => (
          <>
            {data.length ? (
              <Table headers={["Member", "Start", "End", "Status"]}>
                {data.map((p) => (
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
              <p>No members currently have an active package.</p>
            )}
          </>
        )}
      </AsyncSection>
    </Dialog>
  );
}
