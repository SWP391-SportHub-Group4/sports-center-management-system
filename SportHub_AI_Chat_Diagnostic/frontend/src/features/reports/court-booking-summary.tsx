"use client";

import { formatDate, formatNumber } from "@/lib/format";
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
    return (
      <p className={styles.note}>
        No court bookings or rental sports in this period.
      </p>
    );
  return (
    <>
      <table className={styles.bookingTable}>
        <caption className="sr-only">
          Confirmed and completed rentals by sport for the full current month
        </caption>
        <thead>
          <tr>
            <th scope="col">Sport</th>
            <th scope="col">Bookings</th>
            <th scope="col">Booked hours</th>
          </tr>
        </thead>
        <tbody>
          {report.bySport.map((row) => (
            <tr key={row.sportId} data-empty={row.bookings === 0 || undefined}>
              <th scope="row">{row.sportName}</th>
              <td>{formatNumber(row.bookings)}</td>
              <td>{hours(row.bookedHours)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Total</th>
            <td>{formatNumber(report.totalBookings)}</td>
            <td>{hours(report.totalBookedHours)}</td>
          </tr>
        </tfoot>
      </table>
      <p className={styles.note}>
        Rental dates: {formatDate(report.fromDate)} –{" "}
        {formatDate(report.toDate)}. Confirmed/completed bookings only; booked
        hours do not measure actual attendance.
      </p>
    </>
  );
}
