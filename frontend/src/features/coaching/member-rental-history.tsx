"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { AsyncSection, StatusChip, Table } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { InvoiceDetailDto, Paged } from "@/lib/types";
import {
  Pagination,
  MutationFeedback,
  useMutation,
} from "@/features/operations";
import { InvoiceDetail } from "@/features/payments";
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
  const [invoiceId, setInvoiceId] = useState("");
  const invoiceLookup = useMutation();
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
    <>
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
                        <button
                          type="button"
                          className="btn btn--secondary btn--sm"
                          disabled={invoiceLookup.busy}
                          onClick={() => {
                            if (rental.invoiceId) {
                              setInvoiceId(rental.invoiceId);
                            } else {
                              void invoiceLookup.run(async () => {
                                const invoice = await api.get<InvoiceDetailDto>(
                                  `/api/invoices/by-item/${rental.invoiceItemId}`,
                                );
                                setInvoiceId(invoice.summary.invoiceId);
                              }, "");
                            }
                          }}
                        >
                          View invoice
                        </button>
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
      <MutationFeedback mutation={invoiceLookup} />
      {invoiceId &&
        createPortal(
          <InvoiceDetail
            key={invoiceId}
            invoiceId={invoiceId}
            staff
            rental
            onClose={() => setInvoiceId("")}
          />,
          document.body,
        )}
    </>
  );
}
