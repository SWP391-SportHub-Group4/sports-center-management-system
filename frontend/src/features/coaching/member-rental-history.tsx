"use client";

import Link from "next/link";
import { useState } from "react";
import { AsyncSection, StatusChip, Table } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { Paged } from "@/lib/types";
import { Pagination } from "@/features/operations";
import profileStyles from "@/components/PersonProfile.module.css";

interface RentalHistoryRow {
  courtRentalId: string;
  roomName: string;
  sportName: string;
  startAtUtc: string;
  endAtUtc: string;
  totalPrice: number;
  status: string;
  invoiceId: string | null;
  invoiceItemId: string | null;
}

export function MemberRentalHistory({ memberId }: { memberId: string }) {
  const [page, setPage] = useState(1);
  const state = useApi(
    (signal) =>
      api.get<Paged<RentalHistoryRow>>(
        `/api/manager/members/${memberId}/court-rentals`,
        {
          signal,
          query: { page, pageSize: 20 },
        },
      ),
    [memberId, page],
  );
  return (
    <AsyncSection state={state}>
      {(data) =>
        data.items.length ? (
          <>
            <Table
              headers={[
                "Court",
                "Sport",
                "Start",
                "End",
                "Total",
                "Status",
                "Invoice",
              ]}
            >
              {data.items.map((rental) => (
                <tr key={rental.courtRentalId}>
                  <td>{rental.roomName}</td>
                  <td>{rental.sportName}</td>
                  <td>{formatDateTime(rental.startAtUtc)}</td>
                  <td>{formatDateTime(rental.endAtUtc)}</td>
                  <td>{formatMoney(rental.totalPrice)}</td>
                  <td>
                    <StatusChip value={rental.status} />
                  </td>
                  <td>
                    {rental.invoiceId || rental.invoiceItemId ? (
                      <Link
                        className="btn btn--secondary btn--sm"
                        href={
                          rental.invoiceId
                            ? `/manager/finance?invoiceId=${rental.invoiceId}`
                            : `/manager/finance?invoiceItemId=${rental.invoiceItemId}`
                        }
                      >
                        View invoice
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </Table>
            <Pagination
              page={page}
              count={data.totalCount}
              loading={state.loading}
              onChange={setPage}
            />
          </>
        ) : (
          <p className={profileStyles.empty}>No court rentals yet.</p>
        )
      }
    </AsyncSection>
  );
}
