"use client";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/apiClient";
import { useAction, useApi } from "@/lib/useApi";
import type { Paged } from "@/lib/types";
import { AsyncSection, Field } from "@/components/ui";
import { useLanguage } from "@/lib/language";
import { thresholdCopy } from "./threshold-copy";
import styles from "./threshold.module.css";

interface Interest {
  courseInterestId: string;
  memberId: string;
  memberName: string;
  sportId: number;
  sportName: string;
  sourceClassName: string;
  refundedPoints: number;
  cancelledAtUtc: string | null;
}

export function CourseInterests({ manager = false }: { manager?: boolean }) {
  const { language } = useLanguage();
  const copy = thresholdCopy[language];
  const [page, setPage] = useState(1);
  const [sportId, setSportId] = useState("");
  const action = useAction();
  const sports = useApi(
    (signal) =>
      api.get<{ sportId: number; name: string }[]>("/api/sports", { signal }),
    [],
  );
  const state = useApi(
    (signal) =>
      api.get<Paged<Interest>>("/api/course-interests", {
        signal,
        query: { page, pageSize: 20, sportId: sportId || undefined },
      }),
    [page, sportId],
  );
  return (
    <section className={styles.page}>
      <header>
        <h2>{copy.interests}</h2>
        <p>{manager ? copy.managerIntro : copy.interestsIntro}</p>
      </header>
      <Field label="Sport">
        <select
          value={sportId}
          onChange={(e) => {
            setSportId(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All sports</option>
          {sports.data?.map((s) => (
            <option key={s.sportId} value={s.sportId}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>
      {action.error && <p role="alert">{action.error}</p>}
      <AsyncSection state={state}>
        {(data) => (
          <>
            {!data.items.length && <p>No course interests found.</p>}
            {data.items.map((item) => (
              <article key={item.courseInterestId} className={styles.notice}>
                <h3>{item.sportName}</h3>
                <p>
                  {copy.source}: {item.sourceClassName}
                </p>
                {manager && <p>Member: {item.memberName}</p>}
                <p>
                  {copy.refunded}: {item.refundedPoints}
                </p>
                <p>
                  {copy.notifications}:{" "}
                  {item.cancelledAtUtc ? "Cancelled" : "Active"}
                </p>
                {!manager && !item.cancelledAtUtc && (
                  <button
                    className="btn btn--secondary"
                    disabled={action.busy}
                    onClick={() =>
                      void action.run(async () => {
                        await api.post(
                          `/api/course-interests/${item.courseInterestId}/cancel`,
                          {},
                        );
                        state.reload();
                      })
                    }
                  >
                    Stop notifications
                  </button>
                )}
              </article>
            ))}
            <nav aria-label="Course interest pages">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <span> {page} </span>
              <button
                disabled={page * 20 >= data.totalCount}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </nav>
          </>
        )}
      </AsyncSection>
      <Link href={manager ? "/manager/classes" : "/member/services"}>
        {manager ? copy.back : copy.explore}
      </Link>
    </section>
  );
}
