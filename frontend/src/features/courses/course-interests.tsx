"use client";
import Link from "next/link";
import { useState } from "react";
import { Dialog, Field, Table } from "@/components/ui";
import { useLanguage } from "@/lib/language";
import { formatPoints } from "@/lib/format";
import { thresholdCopy } from "./threshold-copy";
import styles from "./threshold.module.css";

/** G02: no interest API exists. Production shows an honest unavailable state.
 * The explicitly labeled development fixture never calls a mutation endpoint. */
export function CourseInterests({ manager = false }: { manager?: boolean }) {
  const { language } = useLanguage();
  const l = thresholdCopy[language];
  const vi = language === "vi";
  const [demo, setDemo] = useState(false);
  const [sport, setSport] = useState("");
  const [status, setStatus] = useState("");
  const [cancelled, setCancelled] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const rows = [
    {
      id: "sample-1",
      member: "Member A (demo)",
      source: vi ? "Cầu lông cơ bản (mẫu)" : "Badminton basics (sample)",
      sport: vi ? "Cầu lông" : "Badminton",
      points: 600,
      active: !cancelled,
      suggested: vi ? "Chưa có ngày khai giảng" : "No start date announced",
    },
    {
      id: "sample-2",
      member: "Member B (demo)",
      source: vi ? "Bóng rổ cơ bản (mẫu)" : "Basketball basics (sample)",
      sport: vi ? "Bóng rổ" : "Basketball",
      points: 450,
      active: false,
      suggested: vi ? "Chưa thông báo khóa mới" : "No new course notified",
    },
  ];
  const label = (active: boolean) =>
    active
      ? vi
        ? "Đang nhận tin"
        : "Subscribed"
      : vi
        ? "Đã hủy nhận tin"
        : "Unsubscribed";
  const filtered = rows.filter(
    (r) =>
      (!sport || r.sport === sport) && (!status || String(r.active) === status),
  );
  return (
    <section className={styles.page}>
      <header>
        <h2>{l.interests}</h2>
        <p>{manager ? l.managerIntro : l.interestsIntro}</p>
      </header>
      {!demo ? (
        <div className={styles.notice} role="status">
          <strong>{l.unavailable}</strong>
          <p>{l.interestsBlocked}</p>
        </div>
      ) : (
        <>
          <div className={styles.notice} role="status">
            <strong>
              {vi ? "BẢN MINH HỌA · Dữ liệu mẫu" : "DEMO · Sample data"}
            </strong>
            <p>
              {vi
                ? "Thao tác chỉ đổi dữ liệu mẫu trong trang này. Không gửi thông báo, ghi danh hay hoàn điểm thật."
                : "Actions only change this page’s sample data. No real notifications, enrollments or refunds are created."}
            </p>
          </div>
          <div className="btn-row">
            <Field label={l.sport}>
              <select value={sport} onChange={(e) => setSport(e.target.value)}>
                <option value="">{vi ? "Tất cả" : "All"}</option>
                {rows.map((r) => (
                  <option key={r.id}>{r.sport}</option>
                ))}
              </select>
            </Field>
            <Field label={l.notifications}>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">{vi ? "Tất cả" : "All"}</option>
                <option value="true">{label(true)}</option>
                <option value="false">{label(false)}</option>
              </select>
            </Field>
          </div>
          {filtered.length ? (
            <Table
              headers={[
                ...(manager ? [vi ? "Hội viên" : "Member"] : []),
                l.source,
                l.sport,
                l.refunded,
                l.notifications,
                l.suggestions,
              ]}
            >
              {filtered.map((r) => (
                <tr key={r.id}>
                  {manager && <td>{r.member}</td>}
                  <td>{r.source}</td>
                  <td>{r.sport}</td>
                  <td>{formatPoints(r.points)}</td>
                  <td>
                    {label(r.active)}
                    {!manager && r.active && (
                      <button
                        className="btn btn--secondary"
                        onClick={() => setConfirm(true)}
                      >
                        {vi ? "Hủy nhận tin (mẫu)" : "Unsubscribe (sample)"}
                      </button>
                    )}
                  </td>
                  <td>{r.suggested}</td>
                </tr>
              ))}
            </Table>
          ) : (
            <p>
              {vi
                ? "Không có nguyện vọng khớp bộ lọc."
                : "No interests match these filters."}
            </p>
          )}
        </>
      )}
      {process.env.NODE_ENV === "development" && (
        <button
          className="btn btn--secondary"
          onClick={() => {
            setDemo(!demo);
            setCancelled(false);
          }}
        >
          {demo
            ? vi
              ? "Đóng minh họa"
              : "Close demo"
            : vi
              ? "Xem minh họa (dữ liệu mẫu)"
              : "Preview demo (sample data)"}
        </button>
      )}
      <Link href={manager ? "/manager/classes" : "/member/discover"}>
        {manager ? l.back : l.explore}
      </Link>
      {confirm && (
        <Dialog
          title={
            vi
              ? "Hủy nhận tin trong bản minh họa?"
              : "Unsubscribe in this demo?"
          }
          onClose={() => setConfirm(false)}
          footer={
            <button
              className="btn"
              onClick={() => {
                setCancelled(true);
                setConfirm(false);
              }}
            >
              {vi ? "Xác nhận (mẫu)" : "Confirm (sample)"}
            </button>
          }
        >
          <p>{l.interestsIntro}</p>
        </Dialog>
      )}
    </section>
  );
}
