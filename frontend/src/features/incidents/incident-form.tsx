"use client";
import {
  IncidentRefundTable,
  validRefunds,
  refundEdit,
  type RefundEdits,
} from "./incident-refund-table";
import { DeliveryStatus } from "./delivery-status";
import { createPortal } from "react-dom";
import styles from "./incidents.module.css";
import { useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ApiError } from "@/lib/apiClient";
import { useLanguage } from "@/lib/language";
import { Card, Field, Dialog } from "@/components/ui";
import { RoomSelector, catalogApi } from "@/features/catalog";
import { useApi } from "@/lib/useApi";
import { MutationFeedback, useMutation } from "@/features/operations";
import { vietnamUtc } from "@/lib/vietnam-time";
import { IncidentDateTime, validIncidentDateTime } from "./incident-date-time";
import formStyles from "./incident-date-time.module.css";
import { formatDateTime } from "@/lib/format";
import type { IncidentPreviewDto } from "@/lib/types";
import { IncidentImpactReview } from "./incident-impact-review";
import { validReceiptId } from "@/features/manager";
import { IncidentHistory } from "./incident-history";
import { incidentApi, type IncidentRequest } from "./incident-api";
import { useOperationsCopy } from "@/features/manager";
import {
  IncidentProgress,
  type IncidentStep,
  type StepStatus,
} from "./incident-progress";
export function IncidentForm() {
  const { t } = useLanguage();
  const l = t.operations;
  const c = useOperationsCopy();
  const params = useSearchParams();
  const mutation = useMutation();
  const rooms = useApi((signal) => catalogApi.rooms(signal), []);
  const revision = useRef(0);
  const resolvePending = useRef(false);
  const operationId = useRef("");
  const [refundEdits, setRefundEdits] = useState<RefundEdits>({});
  const [previewChanged, setPreviewChanged] = useState(false);
  const reviewButtonRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [timeError, setTimeError] = useState("");
  const [steps, setSteps] = useState<IncidentStep[]>([]);
  const [scope, setScope] = useState(
    params.get("scope") === "CENTER" ? "CENTER" : "ROOM",
  );
  const [roomId, setRoom] = useState(
    /^\d+$/.test(params.get("roomId") ?? "") ? params.get("roomId")! : "",
  );
  const [start, setStart] = useState(params.get("start") ?? "");
  const [end, setEnd] = useState(params.get("end") ?? "");
  const [reason, setReason] = useState(params.get("reason") ?? "");
  const [review, setReview] = useState<{
    body: IncidentRequest;
    preview: IncidentPreviewDto;
  } | null>(null);
  const [incidentId, setIncidentId] = useState(
    validReceiptId(params.get("incidentId") ?? "")
      ? params.get("incidentId")!
      : "",
  );
  const [finalReview, setFinalReview] = useState(false);
  const [uncertain, setUncertain] = useState(
    params.get("incidentUncertain") === "1",
  );
  const [resolving, setResolving] = useState(false);
  const [editing, setEditing] = useState(false);
  const hasValidDates =
    validIncidentDateTime(start) && validIncidentDateTime(end);
  const startMs = hasValidDates ? Date.parse(vietnamUtc(start)) : 0;
  const endMs = hasValidDates ? Date.parse(vietnamUtc(end)) : 0;
  const rangeError = !hasValidDates
    ? null
    : endMs <= startMs
      ? t.incidentHistory.invalidRange
      : endMs - startMs > 31 * 86400000
        ? t.incidentHistory.rangeTooLong
        : null;
  const validDraft =
    hasValidDates &&
    !rangeError &&
    reason.trim().length >= 3 &&
    reason.trim().length <= 500 &&
    (scope !== "ROOM" || Number(roomId) > 0);
  const refundRows = review?.preview.refunds ?? [];
  const refundValid = validRefunds(refundRows, refundEdits);
  function record(
    type: string,
    id: string,
    status: StepStatus,
    message?: string,
  ) {
    const step = { type, id, status, message, at: new Date().toISOString() };
    setSteps((previous) => [
      ...previous.filter(
        (item) => item.type !== type || (type !== "FINAL" && item.id !== id),
      ),
      step,
    ]);
    if (type !== "FINAL") setFinalReview(false);
    if (status === "unknown") {
      setUncertain(true);
      const query = new URLSearchParams(window.location.search);
      query.set("incidentUncertain", "1");
      window.history.replaceState(null, "", `?${query}`);
    }
  }
  function clear() {
    revision.current++;
    operationId.current = "";
    setRefundEdits({});
    setPreviewChanged(false);
    setReview(null);
    setIncidentId("");
    mutation.reset();
    setFinalReview(false);
  }
  async function preview(final = false) {
    if (!hasValidDates || rangeError) {
      setTimeError(
        !hasValidDates ? t.incidentHistory.invalidTime : rangeError!,
      );
      return;
    }
    if (!formRef.current?.reportValidity()) return;
    if (!validDraft || (final && !refundValid)) return;
    if (!operationId.current) operationId.current = crypto.randomUUID();
    const priorToken = review?.preview.previewToken;
    const expectedRevision = revision.current;
    const body = {
      scope,
      roomId: scope === "ROOM" ? Number(roomId) : null,
      startAtUtc: vietnamUtc(start),
      endAtUtc: vietnamUtc(end),
      reason: reason.trim(),
    };
    setReview(null);
    setFinalReview(false);
    await mutation.run(async () => {
      const data = await incidentApi.preview(body);
      if (revision.current === expectedRevision) {
        const changed = !!priorToken && priorToken !== data.previewToken;
        if (changed || !priorToken) setRefundEdits({});
        setPreviewChanged(changed);
        setReview({ body, preview: data });
        setFinalReview(final && data.canResolve && !changed);
      }
    }, "");
  }
  return (
    <div className={styles.page}>
      {timeError &&
        createPortal(
          <Dialog
            title={t.incidentHistory.timeErrorTitle}
            onClose={() => setTimeError("")}
            showCloseButton={false}
            footer={
              <button
                type="button"
                className="btn"
                onClick={() => setTimeError("")}
              >
                {t.common.close}
              </button>
            }
          >
            <p role="alert">{timeError}</p>
          </Dialog>,
          document.body,
        )}
      <p className={styles.intro}>{t.incidentHistory.intro}</p>
      <Card
        title={incidentId ? l.resolved : t.incidentHistory.formTitle}
        hint={!incidentId ? t.incidentHistory.formHint : undefined}
      >
        {!incidentId && (
          <form
            ref={formRef}
            noValidate
            onSubmit={async (e) => {
              e.preventDefault();
              await preview();
            }}
          >
            <fieldset
              className={formStyles.formFields}
              disabled={
                mutation.busy ||
                resolving ||
                editing ||
                uncertain ||
                !!incidentId
              }
            >
              <div className={formStyles.formGrid}>
                <Field label={l.scope}>
                  <select
                    value={scope}
                    onChange={(e) => {
                      setScope(e.target.value);
                      clear();
                    }}
                  >
                    <option value="ROOM">{l.room}</option>
                    <option value="CENTER">{l.center}</option>
                  </select>
                </Field>
                {scope === "ROOM" && (
                  <RoomSelector
                    value={roomId}
                    onChange={(v) => {
                      setRoom(v);
                      clear();
                    }}
                  />
                )}
              </div>
              <div className={formStyles.formGrid}>
                <IncidentDateTime
                  label={l.start}
                  value={start}
                  onChange={(value) => {
                    setStart(value);
                    clear();
                  }}
                />
                <IncidentDateTime
                  label={l.end}
                  value={end}
                  minDate={start.split("T")[0]}
                  onChange={(value) => {
                    setEnd(value);
                    clear();
                  }}
                />
              </div>
              <Field label={l.reason} required>
                <textarea
                  required
                  minLength={3}
                  maxLength={500}
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    clear();
                  }}
                />
              </Field>
              <div className={styles.actions}>
                <button
                  ref={reviewButtonRef}
                  className="btn"
                  disabled={
                    mutation.busy || (scope === "ROOM" && Number(roomId) <= 0)
                  }
                >
                  {l.review}
                </button>
              </div>
            </fieldset>
          </form>
        )}
        <MutationFeedback mutation={mutation} />
        {incidentId && (
          <div className={styles.result}>
            <p role="status">{t.managerOperations.resolvedHint}</p>
            <div className={styles.actions}>
              <Link
                className="btn btn--secondary"
                href={`/manager/incidents/${incidentId}`}
              >
                {l.details}
              </Link>
              <button
                className="btn btn--ghost"
                onClick={() => {
                  clear();
                  setSteps([]);
                  setReason("");
                  mutation.reset();
                  window.history.replaceState(
                    null,
                    "",
                    window.location.pathname,
                  );
                }}
              >
                {l.create}
              </button>
            </div>
          </div>
        )}
      </Card>
      {incidentId && <DeliveryStatus incidentId={incidentId} />}
      {incidentId && refundRows.length > 0 && (
        <Card>
          <IncidentRefundTable rows={refundRows} edits={refundEdits} readOnly />
          <Link
            className="btn btn--secondary"
            href={`/manager/incidents/${incidentId}`}
          >
            {t.incidentRefunds.receipt}
          </Link>
        </Card>
      )}
      {review &&
        !finalReview &&
        !incidentId &&
        createPortal(
          <Dialog
            title={l.impact}
            description={t.incidentHistory.reviewHint}
            size="lg"
            className={`${styles.dialog} ${styles.impactDialog}`}
            footer={
              <div className={styles.refundFooter}>
                {refundRows.length > 0 && (
                  <span>
                    {t.incidentRefunds.total}{" "}
                    <strong>
                      {refundRows
                        .reduce(
                          (sum, row) =>
                            sum +
                            (Number(refundEdit(row, refundEdits).points) || 0),
                          0,
                        )
                        .toLocaleString("en-US")}{" "}
                      {t.incidentRefunds.unit}
                    </strong>
                  </span>
                )}
                <button
                  type="button"
                  className={`btn ${styles.recheck}`}
                  disabled={
                    mutation.busy ||
                    resolving ||
                    editing ||
                    uncertain ||
                    !!incidentId ||
                    !refundValid
                  }
                  onClick={() => preview(true)}
                >
                  {refundRows.length
                    ? t.incidentRefunds.review
                    : t.managerOperations.recheck}
                </button>
              </div>
            }
            onClose={() => {
              if (!mutation.busy && !resolving && !editing && !finalReview) {
                setReview(null);
                setFinalReview(false);
                requestAnimationFrame(() => reviewButtonRef.current?.focus());
              }
            }}
          >
            <div className="stack">
              <div>
                {(review.preview.impacts.some(
                  (i) => i.sourceType !== "COURT_RENTAL",
                ) ||
                  refundRows.length === 0) && (
                  <IncidentImpactReview
                    preview={{
                      ...review.preview,
                      members: review.preview.members?.filter(
                        (m) => m.sourceType === "CLASS_SESSION",
                      ),
                    }}
                    incidentRequest={review.body}
                    onRefresh={() => preview()}
                    onResult={(type, id, status, message) => {
                      record(type, id, status, message);
                    }}
                    onEditingChange={(value) => {
                      setEditing(value);
                      setFinalReview(false);
                    }}
                    disabled={mutation.busy || uncertain || !!incidentId}
                  />
                )}
                {previewChanged && (
                  <p className="alert alert--info" role="status">
                    {t.incidentRefunds.changed}
                  </p>
                )}
                <IncidentRefundTable
                  rows={refundRows}
                  edits={refundEdits}
                  onChange={setRefundEdits}
                  disabled={mutation.busy || resolving || editing}
                />
              </div>
              <MutationFeedback mutation={mutation} />
            </div>
          </Dialog>,
          document.body,
        )}
      {review &&
        !incidentId &&
        finalReview &&
        createPortal(
          <Dialog
            title={t.managerOperations.resolveReview}
            description={t.incidentHistory.confirmHint}
            size="lg"
            className={`${styles.dialog} ${styles.impactDialog}`}
            onClose={() => {
              if (!resolving && !mutation.busy) setFinalReview(false);
            }}
            showCloseButton={false}
            footer={
              <>
                <button
                  type="button"
                  className={`btn ${styles.back}`}
                  disabled={resolving || mutation.busy}
                  onClick={() => setFinalReview(false)}
                >
                  {t.incidentHistory.backToImpacts}
                </button>
                <button
                  className={`btn ${styles.confirm}`}
                  disabled={
                    mutation.busy ||
                    resolving ||
                    editing ||
                    !review.preview.canResolve ||
                    !!incidentId ||
                    uncertain ||
                    !refundValid
                  }
                  onClick={async () => {
                    if (resolvePending.current || !refundValid) return;
                    resolvePending.current = true;
                    setResolving(true);
                    record("FINAL", "—", "pending");
                    let unknown = false;
                    const ok = await mutation.run(async () => {
                      const response = await incidentApi
                        .resolve({
                          ...review.body,
                          previewToken: review.preview.previewToken,
                          operationId: operationId.current,
                          refunds: refundRows.map((row) => ({
                            sourceId: row.sourceId,
                            points: Number(refundEdit(row, refundEdits).points),
                            adjustmentReason:
                              refundEdit(row, refundEdits).reason.trim() ||
                              undefined,
                          })),
                        })
                        .then((response) => {
                          if (!validReceiptId(response.incidentId))
                            throw new Error(c.invalidReceipt);
                          return response;
                        })
                        .catch((error) => {
                          unknown =
                            !(error instanceof ApiError) ||
                            error.status === 0 ||
                            error.status >= 500;
                          throw error;
                        });
                      setIncidentId(response.incidentId);
                      setFinalReview(false);
                      record("FINAL", response.incidentId, "succeeded");
                      window.history.replaceState(
                        null,
                        "",
                        `?incidentId=${response.incidentId}`,
                      );
                    }, l.resolved);
                    resolvePending.current = false;
                    setResolving(false);
                    if (!ok) {
                      record("FINAL", "—", unknown ? "unknown" : "failed");
                      setReview(null);
                      setFinalReview(false);
                      setUncertain(unknown);
                      if (unknown) {
                        const query = new URLSearchParams(
                          window.location.search,
                        );
                        query.set("incidentUncertain", "1");
                        window.history.replaceState(null, "", `?${query}`);
                      }
                    }
                  }}
                >
                  {refundRows.length
                    ? t.incidentRefunds.confirm
                    : t.managerOperations.finalResolve}
                </button>
              </>
            }
          >
            <dl className={styles.summary}>
              <div>
                <dt>{l.scope}</dt>
                <dd>
                  {review.body.scope === "CENTER"
                    ? t.incidentHistory.entireCenter
                    : (rooms.data?.find(
                        (room) => room.roomId === review.body.roomId,
                      )?.name ?? l.room)}
                </dd>
              </div>
              <div>
                <dt>{l.impact}</dt>
                <dd>{review.preview.impacts.length}</dd>
              </div>
              <div>
                <dt>{l.start}</dt>
                <dd>{formatDateTime(review.body.startAtUtc)}</dd>
              </div>
              <div>
                <dt>{l.end}</dt>
                <dd>{formatDateTime(review.body.endAtUtc)}</dd>
              </div>
              <div className={styles.wide}>
                <dt>{l.reason}</dt>
                <dd>{review.body.reason}</dd>
              </div>
            </dl>
            <IncidentRefundTable
              rows={refundRows}
              edits={refundEdits}
              readOnly
            />
          </Dialog>,
          document.body,
        )}
      {uncertain && (
        <div className="alert alert--warning" role="alert">
          <p>{t.managerOperations.unknownIncident}</p>
          <Link href="/manager/audit-log">
            {t.navigation.items.auditLog}
          </Link> ·{" "}
          <Link href="/manager/facilities">
            {t.managerOperations.facilities}
          </Link>
        </div>
      )}
      {!!steps.length && <IncidentProgress steps={steps} />}
      <IncidentHistory key={incidentId} refreshKey={incidentId} />
    </div>
  );
}
