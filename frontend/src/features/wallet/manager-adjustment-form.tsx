"use client";
import { useState } from "react";
import { Card, Field } from "@/components/ui";
import { api, ApiError } from "@/lib/apiClient";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
import { formatPoints } from "@/lib/format";
import type { WalletBalanceDto } from "@/lib/types";
import { MutationFeedback, useMutation } from "@/features/operations";
type Intent = {
  idempotencyKey: string;
  points: number;
  direction: string;
  reason: string;
};
function readIntent(key: string): Intent | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(key) ?? "null");
    return v &&
      typeof v.idempotencyKey === "string" &&
      Number.isSafeInteger(v.points) &&
      v.points > 0 &&
      ["CREDIT", "DEBIT"].includes(v.direction) &&
      typeof v.reason === "string"
      ? v
      : null;
  } catch {
    return null;
  }
}
function storeIntent(key: string, intent: Intent | null) {
  try {
    if (intent) sessionStorage.setItem(key, JSON.stringify(intent));
    else sessionStorage.removeItem(key);
  } catch {
    /* In-memory retries still retain the same intent if storage is unavailable. */
  }
}
export function ManagerAdjustmentForm({
  balance,
  ownerName,
  onSaved,
  disabled = false,
}: {
  balance: WalletBalanceDto;
  ownerName: string;
  onSaved: () => void;
  disabled?: boolean;
}) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const l = t.staffWork;
  const mutation = useMutation();
  const storageKey = `sporthub:point-adjustment:${user?.userId}:${balance.ownerUserId}`;
  const [points, setPoints] = useState(1);
  const [direction, setDirection] = useState("CREDIT");
  const [reason, setReason] = useState("");
  const [review, setReview] = useState<Intent | null>(() =>
    readIntent(storageKey),
  );
  const [done, setDone] = useState(false);
  const [uncertain, setUncertain] = useState(() => !!readIntent(storageKey));
  async function confirm() {
    if (!review) return;
    setUncertain(true);
    storeIntent(storageKey, review);
    const ok = await mutation.run(async () => {
      try {
        return await api.post(
          `/api/wallets/${balance.ownerUserId}/adjustments`,
          review,
        );
      } catch (e) {
        if (
          e instanceof ApiError &&
          e.status >= 400 &&
          e.status < 500 &&
          e.status !== 408
        ) {
          setUncertain(false);
          storeIntent(storageKey, null);
        }
        throw e;
      }
    });
    if (ok) {
      setUncertain(false);
      storeIntent(storageKey, null);
      setDone(true);
      onSaved();
    }
  }
  return (
    <Card title={l.adjustment}>
      <p>
        {ownerName} · {formatPoints(balance.availablePoints)}
      </p>
      {!review ? (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            setReview({
              idempotencyKey: crypto.randomUUID(),
              points,
              direction,
              reason: reason.trim(),
            });
          }}
        >
          <Field label={l.action}>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
            >
              <option value="CREDIT">{l.credit}</option>
              <option value="DEBIT">{l.debit}</option>
            </select>
          </Field>
          <Field label={l.points}>
            <input
              type="number"
              required
              min={1}
              max={direction === "DEBIT" ? balance.availablePoints : 2147483647}
              step={1}
              value={points}
              onChange={(e) => setPoints(Number(e.target.value))}
            />
          </Field>
          <Field label={l.reason}>
            <textarea
              required
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <button
            className="btn"
            disabled={
              disabled ||
              !reason.trim() ||
              !Number.isSafeInteger(points) ||
              points <= 0 ||
              (direction === "DEBIT" && points > balance.availablePoints)
            }
          >
            {l.adjustmentReview}
          </button>
        </form>
      ) : (
        <>
          <p>
            {review.direction === "CREDIT" ? l.credit : l.debit}:{" "}
            {formatPoints(review.points)}
          </p>
          <p>{review.reason}</p>
          <p>
            {t.finOps.balanceAfter}:{" "}
            {formatPoints(
              Math.max(
                0,
                balance.availablePoints +
                  (review.direction === "CREDIT"
                    ? review.points
                    : -review.points),
              ),
            )}
          </p>
          <div className="btn-row">
            {!done && (
              <button
                className="btn"
                disabled={disabled || mutation.busy}
                onClick={confirm}
              >
                {l.confirm}
              </button>
            )}
            {!uncertain && (
              <button
                className="btn btn--secondary"
                disabled={disabled || mutation.busy}
                onClick={() => {
                  setReview(null);
                  setDone(false);
                  mutation.reset();
                }}
              >
                {done ? l.newIntent : l.cancel}
              </button>
            )}
          </div>
        </>
      )}
      <MutationFeedback mutation={mutation} />
      {uncertain && !mutation.busy && (
        <>
          <p role="status">{l.uncertain}</p>
          <button className="btn btn--secondary" onClick={onSaved}>
            {l.refresh}
          </button>
        </>
      )}
    </Card>
  );
}
