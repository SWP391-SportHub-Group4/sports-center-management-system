"use client";
import { Table } from "@/components/ui";
import { useLanguage } from "@/lib/language";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { CourtRentalQuoteDto } from "@/lib/types";
export function RentalPriceBreakdown({
  quote,
  showTotal = true,
}: {
  quote: CourtRentalQuoteDto;
  showTotal?: boolean;
}) {
  const { t } = useLanguage();
  const l = t.operations;
  return (
    <>
      <h3>{l.priceBreakdown}</h3>
      <Table headers={[l.start, l.end, l.price]}>
        {quote.blocks.map((b) => (
          <tr key={b.startUtc}>
            <td>{formatDateTime(b.startUtc)}</td>
            <td>{formatDateTime(b.endUtc)}</td>
            <td>{formatMoney(b.price)}</td>
          </tr>
        ))}
      </Table>
      {showTotal && (
        <p>
          {t.refactor.total}: {formatMoney(quote.totalPrice)}
        </p>
      )}
    </>
  );
}
