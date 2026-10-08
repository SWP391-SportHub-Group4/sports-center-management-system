"use client";
import Link from "next/link";
import { useId, useRef, useState } from "react";
import { pagedItems } from "@/lib/paged";
import { api } from "@/lib/apiClient";
import { useApi, useAction, useNow } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { formatDateTime, formatMoney, formatPoints } from "@/lib/format";
import type { CourseDto, Paged, ThresholdResponseDto } from "@/lib/types";
import { AsyncSection, Dialog, Field, StatusChip } from "@/components/ui";
import { CheckoutPanel } from "@/features/payments";
import { thresholdCopy } from "./threshold-copy";
import styles from "./threshold.module.css";

export type ThresholdView = ThresholdResponseDto;
type Choice = "TRANSFER" | "WAIT_NEXT_COURSE" | "REFUND";
interface Quote {
  targetClassId: number;
  cashDifference: number;
  walletCreditPoints: number;
  targetPrice: number;
  sourceValue: number;
}

export function ThresholdPanel({
  responseId,
  token,
}: {
  responseId?: string;
  token?: string;
}) {
  const { t, language } = useLanguage();
  const l = thresholdCopy[language];
  const now = useNow(1000);
  const groupId = useId();
  const [choice, setChoice] = useState<Choice | null>(null);
  const [target, setTarget] = useState("");
  const [review, setReview] = useState(false);
  const sending = useRef(false);
  const action = useAction();
  const state = useApi(
    async (signal) => {
      const value = await api.get<ThresholdView>(
        responseId
          ? `/api/class-threshold-responses/${responseId}`
          : "/api/class-threshold-responses/by-token",
        { signal, query: token ? { token } : undefined },
      );
      const wire = (s: string) =>
        s.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase();
      return {
        ...value,
        choice: value.choice
          ? (wire(value.choice) as ThresholdResponseDto["choice"])
          : null,
        resolutionStatus: wire(value.resolutionStatus),
        clockOffset: Date.parse(value.serverNowUtc) - Date.now(),
      };
    },
    [responseId, token],
  );
  const d = state.data;
  const serverNow = now + (d?.clockOffset ?? 0);
  const expired = !!d && Date.parse(d.deadlineUtc) <= serverNow;
  const closed =
    !d || !!d.choice || expired || d.resolutionStatus !== "PENDING";
  const targets = useApi(
    async (signal) => {
      if (!d || choice !== "TRANSFER" || closed) return [];
      const rows: CourseDto[] = [];
      for (let page = 1; ; page++) {
        const result = await api.get<Paged<CourseDto>>("/api/classes", {
          signal,
          query: { sportId: d.sportId, page, pageSize: 100 },
          anonymous: true,
        });
        const batch = pagedItems(result);
        rows.push(...batch);
        if (
          !batch.length ||
          rows.length >= result.totalCount ||
          batch.length < 100
        )
          return rows;
      }
    },
    [d?.sportId, choice, closed],
  );
  const eligible = pagedItems(targets.data).filter(
    (c) =>
      c.classId !== d?.classId &&
      c.sportId === d?.sportId &&
      c.status === "PUBLISHED" &&
      c.availableSeats > 0 &&
      (!c.firstSessionStartUtc ||
        Date.parse(c.firstSessionStartUtc) > serverNow),
  );
  const destination = eligible.find((c) => String(c.classId) === target);
  const quote = useApi(
    (signal) =>
      d && destination && choice === "TRANSFER" && !closed
        ? api.get<Quote>(
            `/api/class-threshold-responses/${d.responseId}/transfer-quote`,
            { signal, query: { targetClassId: destination.classId } },
          )
        : Promise.resolve(null),
    [d?.responseId, destination?.classId, choice, closed],
  );
  // Bind the quote to its target; a stale response must not confirm a new selection.
  const validQuote =
    !!quote.data &&
    quote.data.targetClassId === Number(target) &&
    !quote.loading &&
    !quote.error;
  const canSubmit =
    !closed &&
    !state.loading &&
    !state.error &&
    !action.busy &&
    (choice === "REFUND" || (choice === "TRANSFER" && validQuote));
  const labels = {
    TRANSFER: l.transfer,
    WAIT_NEXT_COURSE: l.wait,
    REFUND: l.refund,
  };
  const bodies = {
    TRANSFER: l.transferBody,
    WAIT_NEXT_COURSE: l.waitBody,
    REFUND: l.refundBody,
  };

  async function respond(retry = false) {
    if (
      !d ||
      sending.current ||
      (retry ? expired || d.choice !== "TRANSFER" : !canSubmit)
    )
      return;
    const submittedChoice = retry ? d.choice : choice;
    if (submittedChoice !== "TRANSFER" && submittedChoice !== "REFUND") return;
    sending.current = true;
    await action.run(async () => {
      try {
        await api.post(`/api/class-threshold-responses/${d.responseId}`, {
          choice: submittedChoice,
          targetClassId:
            submittedChoice === "TRANSFER"
              ? retry
                ? d.targetClassId
                : Number(target)
              : null,
        });
      } finally {
        // A timeout can happen after commit; always reconcile with server state.
        setReview(false);
        state.reload();
      }
    });
    sending.current = false;
  }

  return (
    <section className={styles.page}>
      <AsyncSection state={state}>
        {(data) => (
          <>
            <header className={styles.header}>
              <h2>{data.className}</h2>
              <p>{l.intro}</p>
              <p>
                <strong>{t.refactor.deadline}:</strong>{" "}
                {formatDateTime(data.deadlineUtc)}
              </p>
              <StatusChip value={data.resolutionStatus} />{" "}
              {data.choice && <StatusChip value={data.choice} />}
            </header>
            {!data.choice && (
              <p className={styles.value}>
                <strong>
                  {l.refundable}: {formatMoney(data.paidValueVnd)}
                </strong>
                <br />
                {formatPoints(data.paidValueVnd / 1000)} {l.estimate}
              </p>
            )}
            {expired && !data.choice && <p role="status">{l.expired}</p>}
            {data.choice && (
              <p role="status">
                {data.resolutionStatus === "AWAITING_PAYMENT"
                  ? l.pendingPayment
                  : l.recorded}
              </p>
            )}
            {!closed && (
              <>
                <fieldset className={styles.choices} disabled={action.busy}>
                  <legend>{l.choose}</legend>
                  {(["TRANSFER", "WAIT_NEXT_COURSE", "REFUND"] as const).map(
                    (option) => (
                      <label
                        className={styles.choice}
                        key={option}
                        data-selected={choice === option}
                      >
                        <input
                          type="radio"
                          name={groupId}
                          value={option}
                          checked={choice === option}
                          onChange={() => {
                            setChoice(option);
                            setReview(false);
                            action.reset();
                          }}
                        />
                        <span>
                          <strong>{labels[option]}</strong>
                          <span>{bodies[option]}</span>
                          {option === "WAIT_NEXT_COURSE" && (
                            <em>{l.unavailable}</em>
                          )}
                        </span>
                      </label>
                    ),
                  )}
                </fieldset>
                {choice === "WAIT_NEXT_COURSE" && (
                  <div className={styles.notice} role="status">
                    <p>{l.waitBlocked}</p>
                    <Link href="/member/courses?tab=interests">
                      {l.interests}
                    </Link>
                  </div>
                )}
                {choice === "TRANSFER" && (
                  <div className={styles.details}>
                    <p>{l.targetHint}</p>
                    <AsyncSection state={targets}>
                      {() =>
                        eligible.length ? (
                          <Field label={l.target}>
                            <select
                              value={target}
                              onChange={(e) => {
                                setTarget(e.target.value);
                                setReview(false);
                                action.reset();
                              }}
                            >
                              <option value="">—</option>
                              {eligible.map((c) => (
                                <option key={c.classId} value={c.classId}>
                                  {c.name} · {formatMoney(c.price)}
                                </option>
                              ))}
                            </select>
                          </Field>
                        ) : (
                          <p>{l.noTargets}</p>
                        )
                      }
                    </AsyncSection>
                    {destination && (
                      <>
                        <p>
                          {l.coach}: {destination.coachName ?? "—"} · {l.seats}:{" "}
                          {destination.availableSeats}
                        </p>
                        {destination.firstSessionStartUtc && (
                          <p>
                            {formatDateTime(destination.firstSessionStartUtc)}
                          </p>
                        )}
                        <Link
                          href={`/courses/${destination.classId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {l.schedule}
                        </Link>
                        <AsyncSection state={quote}>
                          {(q) =>
                            q && (
                              <dl className={styles.amounts}>
                                <div>
                                  <dt>{l.price}</dt>
                                  <dd>{formatMoney(q.targetPrice)}</dd>
                                </div>
                                <div>
                                  <dt>{l.difference}</dt>
                                  <dd>{formatMoney(q.cashDifference)}</dd>
                                </div>
                                <div>
                                  <dt>{l.credit}</dt>
                                  <dd>{formatPoints(q.walletCreditPoints)}</dd>
                                </div>
                              </dl>
                            )
                          }
                        </AsyncSection>
                      </>
                    )}
                  </div>
                )}
                <button
                  className="btn"
                  disabled={!canSubmit}
                  onClick={() => setReview(true)}
                >
                  {l.review}
                </button>
              </>
            )}
            {data.choice === "TRANSFER" &&
              data.resolutionStatus === "AWAITING_PAYMENT" &&
              !expired && (
                <button
                  className="btn btn--secondary"
                  disabled={action.busy}
                  onClick={() => void respond(true)}
                >
                  {t.refactor.retry}
                </button>
              )}
            {data.additionalInvoiceId && (
              <CheckoutPanel
                key={data.additionalInvoiceId}
                invoiceId={data.additionalInvoiceId}
                onChange={state.reload}
              />
            )}
          </>
        )}
      </AsyncSection>
      {action.error && <p role="alert">{action.error}</p>}
      <button
        className="btn btn--secondary"
        disabled={action.busy}
        onClick={state.reload}
      >
        {t.refactor.refresh}
      </button>
      {review && !closed && choice && choice !== "WAIT_NEXT_COURSE" && (
        <Dialog
          title={l.confirmation}
          description={l.final}
          onClose={() => {
            if (!action.busy) setReview(false);
          }}
          footer={
            <button
              className="btn"
              disabled={!canSubmit}
              onClick={() => void respond()}
            >
              {action.busy ? t.common.loading : l.confirm}
            </button>
          }
        >
          <h3>{labels[choice]}</h3>
          <p>{bodies[choice]}</p>
          {choice === "TRANSFER" ? (
            <>
              <strong>{destination?.name}</strong>
              <p>
                {l.difference}: {formatMoney(quote.data?.cashDifference ?? 0)}
              </p>
              <p>
                {l.credit}: {formatPoints(quote.data?.walletCreditPoints ?? 0)}
              </p>
            </>
          ) : (
            <p>
              {l.refundable}: {formatMoney(d?.paidValueVnd ?? 0)}
            </p>
          )}
        </Dialog>
      )}
    </section>
  );
}
