"use client";
import { DeliveryStatus } from "./delivery-status";
import { createPortal } from "react-dom";
import styles from "./incidents.module.css";
import { useRef, useState, type ReactNode } from "react";
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
export function IncidentForm({
  onFencesChanged,
  aboveForm,
}: {
  onFencesChanged?: () => void;
  /** Shown under the intro and above the form (the incidents already in progress). */
  aboveForm?: ReactNode;
}) {
  const { t, language } = useLanguage();
  const vi = language === "vi";
  const l = t.operations;
  const c = useOperationsCopy();
  const params = useSearchParams();
  const mutation = useMutation();
  const rooms = useApi((signal) => catalogApi.rooms(signal), []);
  const revision = useRef(0);
  const resolvePending = useRef(false);
  const impactsRef = useRef<HTMLElement>(null);
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
  const [held, setHeld] = useState(false);
  // null = Manager has not edited the value, so the server's suggestion is used.
  const [extensionDays, setExtensionDays] = useState<string | null>(null);
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
  const selectedExtension =
    extensionDays ??
    String(review?.preview.suggestedMembershipExtensionDays ?? 0);
  const extensionCount = Number(selectedExtension);
  const validExtension =
    !review?.preview.closesGym ||
    (selectedExtension.trim() !== "" &&
      Number.isInteger(extensionCount) &&
      extensionCount >= 0 &&
      extensionCount <= 31);
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
    setExtensionDays(null);
    setReview(null);
    setIncidentId("");
    setHeld(false);
    mutation.reset();
    setFinalReview(false);
  }
  async function holdWindow() {
    if (!review) return;
    await mutation.run(async () => {
      await incidentApi.openFence(review.body);
      setHeld(true);
      onFencesChanged?.();
    }, "");
  }
  async function preview(final = false) {
    if (!validDraft || (final && !validExtension)) return;
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
        setReview({ body, preview: data });
        setFinalReview(final && data.canResolve);
        if (!final)
          requestAnimationFrame(() =>
            impactsRef.current?.scrollIntoView({
              block: "start",
              behavior: "instant",
            }),
          );
      }
    }, "");
  }
  return (
    <div className={styles.page}>
      <p className={styles.intro}>{t.incidentHistory.intro}</p>
      {aboveForm}
      <Card
        title={incidentId ? l.resolved : t.incidentHistory.formTitle}
        hint={!incidentId ? t.incidentHistory.formHint : undefined}
      >
        {!incidentId && (
          <form
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
              {rangeError && (
                <p role="alert" className="field__error">
                  {rangeError}
                </p>
              )}
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
                <button className="btn" disabled={mutation.busy || !validDraft}>
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
      {review && !incidentId && (
        <section
          className="stack"
          ref={impactsRef}
          style={{ scrollMarginTop: "7rem" }}
        >
          <Card title={l.impact} hint={t.incidentHistory.reviewHint}>
            <IncidentImpactReview
              preview={review.preview}
              incidentRequest={review.body}
              onRefresh={() => preview()}
              onResult={(type, id, status, message) => {
                record(type, id, status, message);
                if (status !== "pending") onFencesChanged?.();
              }}
              onEditingChange={(value) => {
                setEditing(value);
                setFinalReview(false);
              }}
              disabled={mutation.busy || uncertain || !!incidentId}
            />
            {!review.preview.canResolve && (
              <div className={styles.hold}>
                <p className="small muted">
                  {held ? c.holdWindowDone : c.holdWindowHint}
                </p>
                {!held && (
                  <button
                    type="button"
                    className="btn btn--secondary"
                    disabled={mutation.busy || uncertain}
                    onClick={() => void holdWindow()}
                  >
                    {c.holdWindow}
                  </button>
                )}
              </div>
            )}
            {!finalReview && (
              <div className={styles.actions}>
                <button
                  type="button"
                  className={`btn ${styles.recheck}`}
                  disabled={
                    mutation.busy ||
                    resolving ||
                    editing ||
                    uncertain ||
                    !!incidentId ||
                    !validExtension
                  }
                  onClick={() => preview(true)}
                >
                  {t.managerOperations.recheck}
                </button>
              </div>
            )}
          </Card>
          {review.preview.closesGym && (
            <Card
              title={
                vi
                  ? "Gia hạn Membership do Gym đóng cửa"
                  : "Gym closure: extend memberships"
              }
            >
              <p>
                {vi
                  ? `Sự cố đóng cửa toàn bộ phòng Gym. ${review.preview.affectedMemberCount ?? 0} hội viên có Membership Active sẽ được cộng thêm số ngày dưới đây và nhận thông báo. Không hoàn tiền Membership vì sự cố tạm thời.`
                  : `This incident closes every Gym room. ${review.preview.affectedMemberCount ?? 0} members with an active membership get the days below added and are notified. Temporary closures do not trigger membership refunds.`}
              </p>
              <Field
                label={vi ? "Số ngày gia hạn (0–31)" : "Extension days (0–31)"}
              >
                <input
                  type="number"
                  min={0}
                  max={31}
                  step={1}
                  inputMode="numeric"
                  value={selectedExtension}
                  aria-invalid={!validExtension}
                  aria-describedby={
                    !validExtension ? "incident-extension-error" : undefined
                  }
                  disabled={
                    mutation.busy ||
                    resolving ||
                    editing ||
                    uncertain ||
                    !!incidentId
                  }
                  onChange={(e) => {
                    setExtensionDays(e.target.value);
                    setFinalReview(false);
                  }}
                />
              </Field>
              {!validExtension && (
                <p
                  id="incident-extension-error"
                  role="alert"
                  className="field__error"
                >
                  {t.incidentHistory.invalidExtension}
                </p>
              )}
              <p className="muted">
                {vi
                  ? "Gợi ý = số ngày dương lịch (giờ Việt Nam) bị đóng trọn vẹn. Hãy xác nhận trước khi đóng sự cố."
                  : "The suggestion is the number of full calendar days (Vietnam time) the Gym is closed. Confirm it before resolving."}
              </p>
            </Card>
          )}
          {finalReview &&
            createPortal(
              <Dialog
                title={t.managerOperations.resolveReview}
                description={t.incidentHistory.confirmHint}
                className={styles.dialog}
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
                        !validExtension ||
                        editing ||
                        !review.preview.canResolve ||
                        !!incidentId ||
                        uncertain
                      }
                      onClick={async () => {
                        if (resolvePending.current || !validExtension) return;
                        resolvePending.current = true;
                        setResolving(true);
                        record("FINAL", "—", "pending");
                        let unknown = false;
                        const ok = await mutation.run(async () => {
                          const response = await incidentApi
                            .resolve({
                              ...review.body,
                              membershipExtensionDays: review.preview.closesGym
                                ? extensionCount
                                : 0,
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
                          onFencesChanged?.();
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
                      {t.managerOperations.finalResolve}
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
                {review.preview.closesGym && (
                  <p className={styles.notice}>
                    {t.incidentHistory.extensionSummary.replace(
                      "{days}",
                      String(extensionCount),
                    )}
                  </p>
                )}
              </Dialog>,
              document.body,
            )}
        </section>
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
