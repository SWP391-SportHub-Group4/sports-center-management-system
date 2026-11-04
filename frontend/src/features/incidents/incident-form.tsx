"use client";
import {
  IncidentRefundTable,
  refundEdit,
  type RefundEdits,
} from "./incident-refund-table";
import { IncidentDayPassMembers } from "./incident-day-pass-members";
import { createPortal } from "react-dom";
import styles from "./incidents.module.css";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ApiError } from "@/lib/apiClient";
import { useAuth } from "@/lib/auth";
import { useIncidentDraftCleanup } from "./incident-draft-cleanup";
import { useLanguage } from "@/lib/language";
import { Card, Field, Dialog } from "@/components/ui";
import { RoomSelector } from "@/features/catalog";
import { MutationFeedback, useMutation } from "@/features/operations";
import { vietnamLocal, vietnamUtc } from "@/lib/vietnam-time";
import { IncidentDateTime, validIncidentDateTime } from "./incident-date-time";
import formStyles from "./incident-date-time.module.css";
import type { IncidentPreviewDto } from "@/lib/types";
import { IncidentImpactReview } from "./incident-impact-review";
import { validReceiptId } from "@/features/manager";
import { IncidentHistory } from "./incident-history";
import {
  incidentApi,
  type IncidentRequest,
  type IncidentResolutionSelection,
} from "./incident-api";
import { useOperationsCopy } from "@/features/manager";
import type { StepStatus } from "./incident-progress";

// Navigation timing stays fixed for this document. The server snapshot keeps
// hydration consistent before the client initializes a fresh form on reload.
const subscribeToNavigation = () => () => {};
const isReload = () =>
  (
    performance.getEntriesByType("navigation")[0] as
      PerformanceNavigationTiming | undefined
  )?.type === "reload";

export function IncidentForm() {
  const resetOnReload = useSyncExternalStore(
    subscribeToNavigation,
    isReload,
    () => false,
  );
  return (
    <IncidentFormContent
      key={String(resetOnReload)}
      resetOnReload={resetOnReload}
    />
  );
}

function IncidentFormContent({ resetOnReload }: { resetOnReload: boolean }) {
  const { t } = useLanguage();
  const l = t.operations;
  const c = useOperationsCopy();
  const params = useSearchParams();
  const { user } = useAuth();
  const drafts = useIncidentDraftCleanup(user?.userId);
  const previousPreviewToken = useRef("");
  const resolutionPlans = useRef<IncidentResolutionSelection[]>([]);
  const [resolutions, setResolutions] = useState<IncidentResolutionSelection[]>(
    [],
  );
  const previewRequest = useRef<AbortController | null>(null);
  const mutation = useMutation();
  const revision = useRef(0);
  const resolvePending = useRef(false);
  const operationId = useRef("");
  const [refundEdits, setRefundEdits] = useState<RefundEdits>({});
  const reviewButtonRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [timeError, setTimeError] = useState("");
  const [openedAt] = useState(Date.now);
  const today = vietnamLocal(new Date(openedAt).toISOString()).slice(0, 10);
  const [scope, setScope] = useState(
    !resetOnReload && params.get("scope") === "CENTER" ? "CENTER" : "ROOM",
  );
  const [roomId, setRoom] = useState(
    !resetOnReload && /^\d+$/.test(params.get("roomId") ?? "")
      ? params.get("roomId")!
      : "",
  );
  const [start, setStart] = useState(
    resetOnReload ? "" : (params.get("start") ?? ""),
  );
  const [end, setEnd] = useState(
    resetOnReload ? "" : (params.get("end") ?? ""),
  );
  const [reason, setReason] = useState(
    resetOnReload ? "" : (params.get("reason") ?? ""),
  );
  const [review, setReview] = useState<{
    body: IncidentRequest;
    preview: IncidentPreviewDto;
  } | null>(null);
  const [incidentId, setIncidentId] = useState("");
  const [historyKey, setHistoryKey] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [hideDraftActivities, setHideDraftActivities] = useState(false);
  const [confirmationUncertain, setUncertain] = useState(
    params.get("incidentUncertain") === "1",
  );
  const [resolving, setResolving] = useState(false);
  const [editing, setEditing] = useState(false);
  const uncertain = confirmationUncertain || drafts.uncertain;
  useEffect(() => {
    if (resetOnReload) {
      const query = new URLSearchParams(window.location.search);
      for (const key of [
        "incidentId",
        "scope",
        "roomId",
        "start",
        "end",
        "reason",
        "fenceId",
      ])
        query.delete(key);
      window.history.replaceState(
        null,
        "",
        window.location.pathname + (query.size ? "?" + query.toString() : ""),
      );
    }
    const abort = () => previewRequest.current?.abort();
    window.addEventListener("pagehide", abort);
    return () => window.removeEventListener("pagehide", abort);
    // Browser reload discards unfinished form values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const hasValidDates =
    validIncidentDateTime(start) && validIncidentDateTime(end);
  const startMs = hasValidDates ? Date.parse(vietnamUtc(start)) : 0;
  const endMs = hasValidDates ? Date.parse(vietnamUtc(end)) : 0;
  const rangeError = !hasValidDates
    ? null
    : startMs < openedAt
      ? t.incidentHistory.startInPast
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
  const canConfirm =
    !!review &&
    review.preview.impacts.every((impact) =>
      review.body.resolutions?.some(
        (plan) => plan.sourceId === impact.sourceId,
      ),
    ) &&
    refundRows.length === 0 &&
    review.preview.canResolve &&
    !mutation.busy &&
    !resolving &&
    !editing &&
    !uncertain &&
    !incidentId;
  function record(type: string, status: StepStatus) {
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
    previousPreviewToken.current = "";
    resolutionPlans.current = [];
    setResolutions([]);
    setRefundEdits({});
    setReview(null);
    setIncidentId("");
    mutation.reset();
  }
  function finish() {
    clear();
    setScope("ROOM");
    setRoom("");
    setStart("");
    setEnd("");
    setReason("");
    window.history.replaceState(null, "", window.location.pathname);
  }
  function stageResolution(plan: IncidentResolutionSelection) {
    revision.current++;
    resolutionPlans.current = [
      ...resolutionPlans.current.filter((p) => p.sourceId !== plan.sourceId),
      plan,
    ];
    setResolutions(resolutionPlans.current);
  }
  async function preview(hideDrafts = false) {
    if (hasValidDates && startMs < Date.now()) {
      setTimeError(t.incidentHistory.startInPast);
      return;
    }
    if (!hasValidDates || rangeError) {
      setTimeError(
        !hasValidDates ? t.incidentHistory.invalidTime : rangeError!,
      );
      return;
    }
    if (!formRef.current?.reportValidity()) return;
    if (!validDraft) return;
    if (!operationId.current) operationId.current = crypto.randomUUID();
    const priorToken =
      review?.preview.previewToken || previousPreviewToken.current;
    const expectedRevision = revision.current;
    const body = {
      scope,
      roomId: scope === "ROOM" ? Number(roomId) : null,
      startAtUtc: vietnamUtc(start),
      endAtUtc: vietnamUtc(end),
      reason: reason.trim(),
      resolutions: resolutionPlans.current,
    };
    setReview(null);
    await mutation.run(async () => {
      const controller = new AbortController();
      previewRequest.current = controller;
      const data = await incidentApi.preview(body, controller.signal);
      if (revision.current === expectedRevision) {
        const changed = !!priorToken && priorToken !== data.previewToken;
        previousPreviewToken.current = data.previewToken ?? "";
        if (changed || !priorToken) setRefundEdits({});
        setHideDraftActivities(hideDrafts);
        setReview({ body, preview: data });
      }
    }, "");
  }
  async function confirmIncident() {
    if (!review || !canConfirm || resolvePending.current) return;
    if (Date.parse(review.body.startAtUtc) < Date.now()) {
      setTimeError(t.incidentHistory.startInPast);
      return;
    }
    resolvePending.current = true;
    drafts.markConfirming(true);
    setResolving(true);
    record("FINAL", "pending");
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
              refundEdit(row, refundEdits).reason.trim() || undefined,
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
      setHistoryKey(response.incidentId);
      setReview(null);
      drafts.markConfirming(false);
      previousPreviewToken.current = "";
      record("FINAL", "succeeded");
    }, "");
    resolvePending.current = false;
    setResolving(false);
    if (!ok) {
      if (!unknown) drafts.markConfirming(false);
      record("FINAL", unknown ? "unknown" : "failed");
      setReview(null);
      setUncertain(unknown);
      if (unknown) {
        const query = new URLSearchParams(window.location.search);
        query.set("incidentUncertain", "1");
        window.history.replaceState(null, "", `?${query}`);
      }
    }
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
      {incidentId &&
        createPortal(
          <Dialog
            title={t.incidentHistory.successTitle}
            showCloseButton={false}
            onClose={finish}
            footer={
              <button type="button" className="btn" onClick={finish}>
                {t.common.close}
              </button>
            }
          >
            <p role="status">{t.incidentHistory.successMessage}</p>
          </Dialog>,
          document.body,
        )}
      {drafts.error && (
        <div className="alert alert--warning" role="alert">
          <p>{t.incidentDraft.cleanupError}</p>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={drafts.retry}
          >
            {t.common.retry}
          </button>
        </div>
      )}
      <Card
        title={incidentId ? l.resolved : t.incidentHistory.formTitle}
        actions={
          <button
            type="button"
            className="btn btn--secondary"
            aria-haspopup="dialog"
            disabled={mutation.busy || resolving || editing}
            onClick={() => setShowHistory(true)}
          >
            {t.managerOperations.incidentHistory}
          </button>
        }
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
                !drafts.ready ||
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
                    searchable
                    showHint={false}
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
                  minDate={today}
                  onChange={(value) => {
                    const date = value.split("T")[0];
                    if (date && date !== start.split("T")[0]) {
                      setEnd(
                        (current) => `${date}T${current.split("T")[1] ?? ""}`,
                      );
                    }
                    setStart(value);
                    clear();
                  }}
                />
                <IncidentDateTime
                  label={l.end}
                  value={end}
                  minDate={
                    start.split("T")[0] > today ? start.split("T")[0] : today
                  }
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
      </Card>
      {review &&
        !incidentId &&
        createPortal(
          <Dialog
            title={t.incidentHistory.reviewTitle}
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
                  disabled={!canConfirm}
                  onClick={() => void confirmIncident()}
                >
                  {l.confirm}
                </button>
              </div>
            }
            onClose={() => {
              if (!mutation.busy && !resolving && !editing) {
                setReview(null);
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
                      impacts: review.preview.impacts.filter(
                        (impact) =>
                          !hideDraftActivities ||
                          !resolutions.some(
                            (plan) => plan.sourceId === impact.sourceId,
                          ),
                      ),
                      members: review.preview.members?.filter(
                        (m) => m.sourceType === "CLASS_SESSION",
                      ),
                    }}
                    incidentRequest={review.body}
                    resolutions={resolutions}
                    onStage={stageResolution}
                    onRefresh={() => preview(true)}
                    onResult={(type, _id, status) => {
                      record(type, status);
                    }}
                    onEditingChange={(value) => {
                      setEditing(value);
                    }}
                    disabled={mutation.busy || uncertain || !!incidentId}
                  />
                )}
                <IncidentRefundTable
                  rows={refundRows}
                  edits={refundEdits}
                  onChange={setRefundEdits}
                  disabled={mutation.busy || resolving || editing}
                />
                <IncidentDayPassMembers preview={review.preview} />
              </div>
              <MutationFeedback mutation={mutation} />
            </div>
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
      {showHistory &&
        createPortal(
          <Dialog
            title={t.managerOperations.incidentHistory}
            size="lg"
            className={`${styles.dialog} ${styles.historyDialog}`}
            onClose={() => setShowHistory(false)}
          >
            <IncidentHistory key={historyKey} refreshKey={historyKey} />
          </Dialog>,
          document.body,
        )}
    </div>
  );
}
