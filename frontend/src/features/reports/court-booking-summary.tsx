"use client";

import type { CourtBookingReport } from "./api";
import styles from "./manager-overview.module.css";

const hours = (value: number) =>
  new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(value);

export function CourtBookingSummary({
  report,
}: {
  report: CourtBookingReport;
}) {
  if (!report.bySport.length)
    return <p className={styles.note}>No paid court bookings today.</p>;
  return (
    <>
      <table className={styles.bookingTable}>
        <caption className="sr-only">
          Paid court rental hours by sport for today
        </caption>
        <thead>
          <tr>
            <th scope="col">Sport</th>
            <th scope="col">Booked hours</th>
          </tr>
        </thead>
        <tbody>
          {report.bySport.map((row) => (
            <tr key={row.sportId} data-empty={row.bookings === 0 || undefined}>
              <th scope="row">{row.sportName}</th>
              <td>{hours(row.bookedHours)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Total</th>
            <td>{hours(report.totalBookedHours)}</td>
          </tr>
        </tfoot>
      </table>
    </>
  );
}
