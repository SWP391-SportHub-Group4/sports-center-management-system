"use client";

import { api } from "@/lib/apiClient";
import { formatDate } from "@/lib/format";
import { useLanguage } from "@/lib/language";
import { useApi } from "@/lib/useApi";
import type {
  GymCheckInDto,
  InvoiceDetailDto,
  MemberPackageDto,
  Paged,
} from "@/lib/types";
import styles from "./gym-package-details.module.css";

const zone = "Asia/Ho_Chi_Minh";

function localPart(value: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    ...options,
  }).format(new Date(value));
}

function localDate(value: string) {
  return localPart(value, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function localTime(value: string) {
  return localPart(value, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
}

export function GymPackageDetails({ pkg, memberId }: { pkg: MemberPackageDto; memberId?: string }) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const tx = (v: string, e: string) => (vi ? v : e);
  const invoice = useApi(
    (signal) =>
      pkg.invoiceItemId
        ? api.get<InvoiceDetailDto>(
            `/api/invoices/by-item/${pkg.invoiceItemId}`,
            { signal },
          )
        : Promise.resolve(null),
    [pkg.invoiceItemId],
  );
  const start = new Date(
    `${pkg.startDate.slice(0, 10)}T00:00:00+07:00`,
  ).getTime();
  const end =
    new Date(`${pkg.endDate.slice(0, 10)}T00:00:00+07:00`).getTime() +
    86_400_000;
  const checkIns = useApi(
    async (signal) => {
      const rows: GymCheckInDto[] = [];
      let page = 1;
      while (true) {
        const result = await api.get<Paged<GymCheckInDto>>(
          memberId ? `/api/members/${memberId}/gym-checkins` : "/api/members/me/gym-checkins",
          {
            signal,
            query: { page, pageSize: 100 },
          },
        );
        rows.push(
          ...result.items.filter((row) => {
            const at = new Date(row.checkInTime).getTime();
            return at >= start && at < end;
          }),
        );
        const last = result.items.at(-1);
        if (
          !last ||
          page * 100 >= result.totalCount ||
          new Date(last.checkInTime).getTime() < start
        )
          break;
        page += 1;
      }
      return rows;
    },
    [pkg.memberPackageId, pkg.startDate, pkg.endDate],
  );

  const paidAt = invoice.data?.summary.paidAtUtc;
  return (
    <section
      className={styles.detail}
      aria-label={tx("Chi tiết gói Gym", "Gym membership details")}
    >
      <div className={styles.summary}>
        <div>
          <span className={styles.label}>
            {tx("Thanh toán gói Gym", "Gym membership paid at")}
          </span>
          <strong className={styles.paidAt}>
            {invoice.loading && !invoice.data
              ? tx("Đang tải…", "Loading…")
              : paidAt
                ? `${localDate(paidAt)}, ${localTime(paidAt)}`
                : "—"}
          </strong>
          {invoice.error && (
            <p role="alert">
              {tx(
                "Không tải được thời điểm thanh toán.",
                "Could not load the payment time.",
              )}
            </p>
          )}
        </div>
        <div className={styles.expiry}>
          <span className={styles.label}>
            {tx("Ngày và giờ hết hạn", "Expiry date and time")}
          </span>
          <strong>{formatDate(pkg.endDate)} · 23:59:59</strong>
          <small>{tx("Giờ Việt Nam", "Vietnam time")}</small>
        </div>
      </div>

      <div className={styles.tableHead}>
        <h2>
          {tx(
            "Các lần check-in trong thời hạn gói",
            "Check-ins during this membership",
          )}
        </h2>
        <span>
          {checkIns.data?.length ?? 0} {tx("lượt", "visits")}
        </span>
      </div>
      <p className={styles.scope}>
        {tx(
          "Các lần check-in của bạn trong khoảng ngày hiệu lực của gói.",
          "Your check-ins within this membership's active dates.",
        )}
      </p>
      {checkIns.loading && !checkIns.data ? (
        <p role="status">{tx("Đang tải check-in…", "Loading check-ins…")}</p>
      ) : checkIns.error ? (
        <p role="alert">
          {tx(
            "Không tải được danh sách check-in.",
            "Could not load check-ins.",
          )}
        </p>
      ) : !checkIns.data?.length ? (
        <p>
          {tx(
            "Chưa có lượt check-in nào trong thời hạn này.",
            "No check-ins during this period.",
          )}
        </p>
      ) : (
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">{tx("Ngày tập", "Training date")}</th>
                <th scope="col">
                  {tx("Giờ tập (check-in)", "Training time (check-in)")}
                </th>
              </tr>
            </thead>
            <tbody>
              {checkIns.data.map((row, index) => (
                <tr key={row.checkInId}>
                  <td>{index + 1}</td>
                  <td>{localDate(row.checkInTime)}</td>
                  <td>{localTime(row.checkInTime)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
