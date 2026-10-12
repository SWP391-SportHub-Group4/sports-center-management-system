"use client";

import {
  pagedItems,
} from "@/lib/paged";

import {
  useEffect,
  useState,
} from "react";

import {
  api,
} from "@/lib/apiClient";

import {
  useApi,
} from "@/lib/useApi";

import {
  useLanguage,
} from "@/lib/language";

import {
  formatMoney,
} from "@/lib/format";

import type {
  InvoiceSummaryDto,
  InvoiceDetailDto,
  Paged,
} from "@/lib/types";

import {
  Card,
  StatusChip,
} from "@/components/ui";

import {
  InvoiceDetail,
} from "./invoice-detail";

function escapeHtml(
  value: unknown,
) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function csvValue(
  value: unknown,
) {
  return `"${String(value ?? "")
    .replaceAll('"', '""')}"`;
}

async function printInvoice(
  invoiceId: string,
) {
  const printWindow =
    window.open(
      "",
      "_blank",
      "width=900,height=700",
    );

  if (!printWindow) {
    throw new Error(
      "The browser blocked the print window.",
    );
  }

  printWindow.opener = null;

  try {
    const invoice =
      await api.get<InvoiceDetailDto>(
        `/api/invoices/${invoiceId}`,
      );

    const rows =
      invoice.items
        .map(
          (item) => `
            <tr>
              <td>${escapeHtml(
                item.description,
              )}</td>

              <td style="text-align:right">
                ${escapeHtml(
                  item.quantity,
                )}
              </td>

              <td style="text-align:right">
                ${escapeHtml(
                  formatMoney(
                    item.unitPrice,
                  ),
                )}
              </td>

              <td style="text-align:right">
                ${escapeHtml(
                  formatMoney(
                    item.lineAmount,
                  ),
                )}
              </td>
            </tr>
          `,
        )
        .join("");

    printWindow.document.write(`
      <!doctype html>

      <html>
        <head>
          <meta charset="utf-8" />

          <title>
            ${escapeHtml(
              invoice.summary
                .invoiceNumber,
            )}
          </title>

          <style>
            body {
              font-family:
                Arial,
                sans-serif;
              color: #111;
              padding: 32px;
            }

            h1 {
              margin-bottom: 4px;
            }

            .meta {
              margin-bottom: 24px;
              line-height: 1.6;
            }

            table {
              width: 100%;
              border-collapse:
                collapse;
              margin-top: 24px;
            }

            th,
            td {
              padding: 10px;
              border-bottom:
                1px solid #ddd;
              text-align: left;
            }

            .summary {
              margin-top: 24px;
              margin-left: auto;
              width: 320px;
            }

            .summary div {
              display: flex;
              justify-content:
                space-between;
              padding: 6px 0;
            }

            .total {
              font-weight: bold;
              font-size: 18px;
              border-top:
                1px solid #111;
              margin-top: 8px;
              padding-top: 12px;
            }

            .actions {
              margin-bottom: 20px;
            }

            @media print {
              .actions {
                display: none;
              }
            }
          </style>
        </head>

        <body>
          <div class="actions">
            <button
              onclick="window.print()"
            >
              Print / Save as PDF
            </button>
          </div>

          <h1>
            SPORT<span
              style="color:#087f8c"
            >HUB</span>
          </h1>

          <h2>
            Invoice
            ${escapeHtml(
              invoice.summary
                .invoiceNumber,
            )}
          </h2>

          <div class="meta">
            <div>
              Member:
              <strong>
                ${escapeHtml(
                  invoice.summary
                    .memberName,
                )}
              </strong>
            </div>

            <div>
              Email:
              ${escapeHtml(
                invoice.summary
                  .memberEmail,
              )}
            </div>

            <div>
              Status:
              ${escapeHtml(
                invoice.summary.status,
              )}
            </div>

            <div>
              Issued:
              ${escapeHtml(
                invoice.summary
                  .issuedAt,
              )}
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>
                  Description
                </th>

                <th
                  style="text-align:right"
                >
                  Qty
                </th>

                <th
                  style="text-align:right"
                >
                  Unit price
                </th>

                <th
                  style="text-align:right"
                >
                  Amount
                </th>
              </tr>
            </thead>

            <tbody>
              ${rows}
            </tbody>
          </table>

          <div class="summary">
            <div>
              <span>Total</span>

              <strong>
                ${escapeHtml(
                  formatMoney(
                    invoice.summary
                      .totalAmount,
                  ),
                )}
              </strong>
            </div>

            <div>
              <span>
                Points spent
              </span>

              <span>
                ${escapeHtml(
                  invoice.summary
                    .pointsSpent,
                )}
              </span>
            </div>

            <div>
              <span>
                Cash
              </span>

              <span>
                ${escapeHtml(
                  formatMoney(
                    invoice.summary
                      .cashAmount,
                  ),
                )}
              </span>
            </div>

            <div class="total">
              <span>Status</span>

              <span>
                ${escapeHtml(
                  invoice.summary
                    .status,
                )}
              </span>
            </div>
          </div>
        </body>
      </html>
    `);

    printWindow.document.close();

    printWindow.focus();
  } catch (error) {
    printWindow.close();

    throw error;
  }
}

async function exportInvoiceCsv(
  invoiceId: string,
) {
  const invoice =
    await api.get<InvoiceDetailDto>(
      `/api/invoices/${invoiceId}`,
    );

  const rows = [
    [
      "Invoice number",
      invoice.summary.invoiceNumber,
    ],
    [
      "Member",
      invoice.summary.memberName,
    ],
    [
      "Email",
      invoice.summary.memberEmail,
    ],
    [
      "Status",
      invoice.summary.status,
    ],
    [
      "Issued at",
      invoice.summary.issuedAt,
    ],
    [],
    [
      "Description",
      "Quantity",
      "Unit price",
      "Line amount",
    ],
    ...invoice.items.map(
      (item) => [
        item.description,
        item.quantity,
        item.unitPrice,
        item.lineAmount,
      ],
    ),
    [],
    [
      "Total",
      invoice.summary.totalAmount,
    ],
    [
      "Points spent",
      invoice.summary.pointsSpent,
    ],
    [
      "Cash amount",
      invoice.summary.cashAmount,
    ],
  ];

  const csv =
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map(csvValue)
          .join(","),
      )
      .join("\r\n");

  const blob =
    new Blob(
      [csv],
      {
        type:
          "text/csv;charset=utf-8",
      },
    );

  const url =
    URL.createObjectURL(blob);

  const anchor =
    document.createElement("a");

  anchor.href = url;

  anchor.download =
    `${invoice.summary.invoiceNumber}.csv`;

  document.body.appendChild(
    anchor,
  );

  anchor.click();

  anchor.remove();

  URL.revokeObjectURL(url);
}

export function InvoiceList({
  staff = false,
  memberId,
  rental = false,
}: {
  staff?: boolean;
  memberId?: string;
  rental?: boolean;
}) {
  const { t } =
    useLanguage();

  const [page, setPage] =
    useState(1);

  const [
    selected,
    setSelected,
  ] =
    useState<string | null>(
      null,
    );

  const [
    linkError,
    setLinkError,
  ] =
    useState("");

  const [
    status,
    setStatus,
  ] =
    useState("");

  const [
    actionError,
    setActionError,
  ] =
    useState("");

  const [
    exporting,
    setExporting,
  ] =
    useState<string | null>(
      null,
    );

  useEffect(() => {
    const item =
      new URLSearchParams(
        window.location.search,
      ).get(
        "invoiceItemId",
      );

    const controller =
      new AbortController();

    const accept = (
      d: InvoiceDetailDto,
    ) => {
      if (
        controller.signal.aborted
      ) {
        return;
      }

      if (
        staff &&
        memberId &&
        d.summary.memberId !==
          memberId
      ) {
        setLinkError(
          t.operations
            .invoiceMemberMismatch,
        );

        return;
      }

      setSelected(
        d.summary.invoiceId,
      );
    };

    if (
      item &&
      /^[0-9a-f-]{36}$/i.test(
        item,
      )
    ) {
      api
        .get<InvoiceDetailDto>(
          `/api/invoices/by-item/${item}`,
          {
            signal:
              controller.signal,
          },
        )
        .then(accept)
        .catch((error) => {
          if (
            !controller.signal
              .aborted
          ) {
            setLinkError(
              error.message,
            );
          }
        });
    }

    const id =
      new URLSearchParams(
        window.location.search,
      ).get("invoiceId");

    if (
      id &&
      /^[0-9a-f-]{36}$/i.test(
        id,
      )
    ) {
      if (
        staff &&
        memberId
      ) {
        api
          .get<InvoiceDetailDto>(
            `/api/invoices/${id}`,
            {
              signal:
                controller.signal,
            },
          )
          .then(accept)
          .catch((error) => {
            if (
              !controller.signal
                .aborted
            ) {
              setLinkError(
                error.message,
              );
            }
          });
      } else {
        const timer =
          setTimeout(
            () =>
              setSelected(id),
            0,
          );

        controller.signal
          .addEventListener(
            "abort",
            () =>
              clearTimeout(
                timer,
              ),
            {
              once: true,
            },
          );
      }
    }

    return () =>
      controller.abort();
  }, [
    staff,
    memberId,
    t.operations
      .invoiceMemberMismatch,
  ]);

  const state =
    useApi(
      (signal) =>
        api.get<
          Paged<InvoiceSummaryDto>
        >(
          staff
            ? "/api/invoices"
            : rental
              ? "/api/members/me/rental-invoices"
              : "/api/members/me/invoices",
          {
            signal,
            query: {
              page,
              pageSize: 10,
              status,
              memberId,
            },
          },
        ),
      [
        staff,
        rental,
        page,
        status,
        memberId,
      ],
    );

  async function runInvoiceAction(
    invoiceId: string,
    action:
      | "print"
      | "csv",
  ) {
    setActionError("");

    setExporting(
      `${action}:${invoiceId}`,
    );

    try {
      if (
        action === "print"
      ) {
        await printInvoice(
          invoiceId,
        );
      } else {
        await exportInvoiceCsv(
          invoiceId,
        );
      }
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Unable to export invoice.",
      );
    } finally {
      setExporting(null);
    }
  }

  return (
    <>
      {linkError && (
        <p role="alert">
          {linkError}
        </p>
      )}

      {actionError && (
        <p role="alert">
          {actionError}
        </p>
      )}

      {selected && (
        <InvoiceDetail
          key={selected}
          invoiceId={selected}
          staff={staff}
          rental={rental}
          onClose={() => setSelected(null)}
        />
      )}

      <label>
        {t.refactor.status}

        <select
          value={status}
          onChange={(e) => {
            setStatus(
              e.target.value,
            );

            setPage(1);
          }}
        >
          <option value="">
            —
          </option>

          {[
            "ISSUED",
            "PAID",
            "VOID",
            "PAID_AFTER_RECONCILIATION",
          ].map((s) => (
            <option
              key={s}
              value={s}
            >
              {
                t.wireStatus[
                  s as keyof typeof t.wireStatus
                ]
              }
            </option>
          ))}
        </select>
      </label>

      {state.loading ? (
        <p>
          {t.refactor.loading}
        </p>
      ) : state.error ? (
        <p role="alert">
          {state.error.message}
        </p>
      ) : !pagedItems(
          state.data,
        ).length ? (
        <p>
          {t.refactor.empty}
        </p>
      ) : (
        pagedItems(
          state.data,
        ).map((i) => (
          <Card
            key={i.invoiceId}
            title={i.invoiceNumber}
          >
            <p>
              <StatusChip
                value={i.status}
              />
            </p>

            <p>
              {t.refactor.total}:{" "}
              {formatMoney(
                i.totalAmount,
              )}
              {" · "}
              {
                t.refactor
                  .remaining
              }
              :{" "}
              {formatMoney(
                i.outstanding,
              )}
            </p>

            <div className="btn-row">
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() =>
                  setSelected(
                    i.invoiceId,
                  )
                }
              >
                {t.refactor.details}
              </button>

              {staff && (
                <>
                  <button
                    type="button"
                    className="btn btn--secondary"
                    disabled={
                      exporting !==
                        null
                    }
                    onClick={() =>
                      void runInvoiceAction(
                        i.invoiceId,
                        "print",
                      )
                    }
                  >
                    {exporting ===
                    `print:${i.invoiceId}`
                      ? "Preparing..."
                      : "Print"}
                  </button>

                  <button
                    type="button"
                    className="btn btn--secondary"
                    disabled={
                      exporting !==
                        null
                    }
                    onClick={() =>
                      void runInvoiceAction(
                        i.invoiceId,
                        "csv",
                      )
                    }
                  >
                    {exporting ===
                    `csv:${i.invoiceId}`
                      ? "Exporting..."
                      : "Export CSV"}
                  </button>
                </>
              )}
            </div>
          </Card>
        ))
      )}

      <div className="btn-row">
        <button
          className="btn btn--secondary"
          disabled={page === 1}
          onClick={() =>
            setPage(
              page - 1,
            )
          }
        >
          {t.refactor.previous}
        </button>

        <button
          className="btn btn--secondary"
          disabled={
            !state.data ||
            page * 10 >=
              state.data.totalCount
          }
          onClick={() =>
            setPage(
              page + 1,
            )
          }
        >
          {t.refactor.more}
        </button>
      </div>
    </>
  );
}