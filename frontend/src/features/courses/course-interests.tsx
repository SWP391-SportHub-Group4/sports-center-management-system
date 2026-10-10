"use client";

import Link from "next/link";
import { useState } from "react";
import { AsyncSection, Table } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { formatPoints } from "@/lib/format";
import { useAction, useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import type { Paged } from "@/lib/types";
import { thresholdCopy } from "./threshold-copy";
import styles from "./threshold.module.css";

interface Interest {
  subscriptionId: string;
  memberId: string;
  memberName: string;
  sourceClassId: number;
  sourceClassName: string;
  sportId: number;
  sportName: string;
  refundedPoints: number;
  isActive: boolean;
  createdAtUtc: string;
}

export function CourseInterests({ manager = false }: { manager?: boolean }) {
  const { language } = useLanguage();
  const l = thresholdCopy[language];
  const vi = language === "vi";
  const [page, setPage] = useState(1);
  const [sportId, setSportId] = useState("");
  const [active, setActive] = useState("");
  const action = useAction();
  const state = useApi(
    (signal) => api.get<Paged<Interest>>(
      manager ? "/api/manager/course-interests" : "/api/members/me/course-interests",
      { signal, query: { page, pageSize: 20, sportId: sportId || undefined, active: active || undefined } },
    ),
    [manager, page, sportId, active],
  );
  const rows = state.data?.items ?? [];

  async function unsubscribe(id: string) {
    await action.run(() => api.post(`/api/members/me/course-interests/${id}/unsubscribe`, {}));
    state.reload();
  }

  return (
    <section className={styles.page}>
      <header>
        <h2>{l.interests}</h2>
        <p>{manager ? l.managerIntro : l.interestsIntro}</p>
      </header>
      <div className="btn-row">
        <label>{l.sport}{" "}
          <input type="number" min="1" value={sportId} onChange={(e) => { setSportId(e.target.value); setPage(1); }}
            placeholder={vi ? "Mã môn" : "Sport ID"} />
        </label>
        <label>{l.notifications}{" "}
          <select value={active} onChange={(e) => { setActive(e.target.value); setPage(1); }}>
            <option value="">{vi ? "Tất cả" : "All"}</option>
            <option value="true">{vi ? "Đang nhận tin" : "Subscribed"}</option>
            <option value="false">{vi ? "Đã hủy nhận tin" : "Unsubscribed"}</option>
          </select>
        </label>
      </div>
      <AsyncSection state={state}>
        {() => rows.length ? (
          <Table headers={[
            ...(manager ? [vi ? "Hội viên" : "Member"] : []),
            l.source, l.sport, l.refunded, l.notifications,
          ]}>
            {rows.map((row) => (
              <tr key={row.subscriptionId}>
                {manager && <td>{row.memberName}</td>}
                <td>{row.sourceClassName}</td>
                <td>{row.sportName}</td>
                <td>{formatPoints(row.refundedPoints)}</td>
                <td>
                  {row.isActive ? (vi ? "Đang nhận tin" : "Subscribed") : (vi ? "Đã hủy nhận tin" : "Unsubscribed")}
                  {!manager && row.isActive && (
                    <button className="btn btn--secondary" disabled={action.busy}
                      onClick={() => void unsubscribe(row.subscriptionId)}>
                      {vi ? "Hủy nhận tin" : "Unsubscribe"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        ) : <p>{vi ? "Chưa có nguyện vọng khóa sau." : "No course interests yet."}</p>}
      </AsyncSection>
      {action.error && <p role="alert">{action.error}</p>}
      <div className="btn-row">
        <button className="btn btn--secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          {vi ? "Trang trước" : "Previous"}
        </button>
        <span>{page}</span>
        <button className="btn btn--secondary" disabled={!state.data || page * 20 >= state.data.totalCount}
          onClick={() => setPage(page + 1)}>{vi ? "Trang sau" : "Next"}</button>
      </div>
      <Link href={manager ? "/manager/classes" : "/member/discover"}>
        {manager ? l.back : l.explore}
      </Link>
    </section>
  );
}
