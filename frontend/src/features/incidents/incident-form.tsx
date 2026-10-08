"use client";
import { DeliveryStatus } from "./delivery-status";
import { useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/apiClient";
import { useLanguage } from "@/lib/language";
import { Card, Field } from "@/components/ui";
import { RoomSelector } from "@/features/catalog";
import { MutationFeedback, useMutation } from "@/features/operations";
import { vietnamUtc } from "@/lib/vietnam-time";
import type { IncidentPreviewDto } from "@/lib/types";
import { IncidentImpactReview } from "./incident-impact-review";
import { ApiGap } from "@/features/manager";
import { ReceiptLookup, validReceiptId } from "@/features/manager";
import { managerWorkspaceStyles as styles } from "@/features/manager";
import { useOperationsCopy } from "@/features/manager";
import {
  IncidentProgress,
  type IncidentStep,
  type StepStatus,
} from "./incident-progress";
import formStyles from "./incident-forms.module.css";
export function IncidentForm() {
  const { t } = useLanguage();
  const l = t.operations;
  const c = useOperationsCopy();
  const params = useSearchParams();
  const mutation = useMutation();
  const revision = useRef(0);
  const [scope, setScope] = useState("ROOM");
  const [roomId, setRoom] = useState(
    /^\d+$/.test(params.get("roomId") ?? "") ? params.get("roomId")! : "",
  );
  const [start, setStart] = useState(params.get("start") ?? "");
  const [end, setEnd] = useState(params.get("end") ?? "");
  const [reason, setReason] = useState("");
  const [review, setReview] = useState<{
    body: {
      scope: string;
      roomId: number | null;
      startAtUtc: string;
      endAtUtc: string;
      reason: string;
    };
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
  const [steps, setSteps] = useState<IncidentStep[]>([]);
  const [editing, setEditing] = useState(false);
  function record(
    type: string,
    id: string,
    status: StepStatus,
    message?: string,
  ) {
    setSteps((rows) => {
      const next = { type, id, status, message, at: new Date().toISOString() };
      // Keep earlier attempts; only complete the current in-flight attempt.
      if (status !== "pending") {
        for (let index = rows.length - 1; index >= 0; index--) {
          const row = rows[index];
          if (
            row.type === type &&
            (row.id === id || type === "FINAL") &&
            row.status === "pending"
          ) {
            return rows.map((item, i) => (i === index ? next : item));
          }
        }
      }
      return [...rows, next];
    });
    setFinalReview(false);
    if (status === "unknown") {
      setUncertain(true);
      const query = new URLSearchParams(window.location.search);
      query.set("incidentUncertain", "1");
      window.history.replaceState(null, "", `?${query}`);
    }
  }
  function clear() {
    revision.current++;
    setReview(null);
    setIncidentId("");
    mutation.reset();
    setFinalReview(false);
  }
  async function preview(final = false) {
    const expectedRevision = revision.current;
    const body = {
      scope,
      roomId: scope === "ROOM" ? Number(roomId) : null,
      startAtUtc: vietnamUtc(start),
      endAtUtc: vietnamUtc(end),
      reason,
    };
    setReview(null);
    setFinalReview(false);
    await mutation.run(async () => {
      const data = await api.post<IncidentPreviewDto>(
        "/api/manager/incidents/preview",
        body,
      );
      if (revision.current === expectedRevision) {
        setReview({ body, preview: data });
        setFinalReview(final && data.canResolve);
      }
    }, "");
  }
  return (
    <>
      <p>{t.managerOperations.incidentWorkflow}</p>
      <ApiGap code="G06" message={t.managerOperations.incidentGap} />
      <p>{t.managerOperations.partialHint}</p>
      <Card title={l.incidents}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await preview();
          }}
        >
          <fieldset
            className={formStyles.incidentFields}
            disabled={
              mutation.busy || resolving || editing || uncertain || !!incidentId
            }
          >
            <div className={formStyles.incidentGrid}>
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
              <Field label={l.start}>
                <input
                  required
                  type="datetime-local"
                  value={start}
                  onChange={(e) => {
                    setStart(e.target.value);
                    clear();
                  }}
                />
              </Field>
              <Field label={l.end}>
                <input
                  required
                  type="datetime-local"
                  min={start}
                  value={end}
                  onChange={(e) => {
                    setEnd(e.target.value);
                    clear();
                  }}
                />
              </Field>
            </div>
            <Field label={l.reason}>
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
            <button
              className={`btn ${formStyles.previewButton}`}
              disabled={
                mutation.busy ||
                !start ||
                end <= start ||
                (scope === "ROOM" && !roomId)
              }
            >
              {l.review}
            </button>
          </fieldset>
        </form>
        <MutationFeedback mutation={mutation} />
        {incidentId && (
          <p role="status">
            {l.resolved} · {incidentId}
          </p>
        )}
        {incidentId && (
          <>
            <p>{t.managerOperations.resolvedHint}</p>
            <Link
              className="btn btn--secondary"
              href={`/manager/incidents/${incidentId}`}
            >
              {l.details}
            </Link>
            <button
              className="btn btn--ghost"
              onClick={() => {
                setIncidentId("");
                setReview(null);
                setFinalReview(false);
                setSteps([]);
                setReason("");
                mutation.reset();
                window.history.replaceState(null, "", window.location.pathname);
              }}
            >
              {l.create}
            </button>
          </>
        )}
        {incidentId && (
          <DeliveryStatus
            path={`/api/manager/incidents/${incidentId}/notifications`}
          />
        )}
      </Card>
      <div className={styles.checkpoint}>
        <IncidentProgress steps={steps} />
      </div>
      {review && (
        <section className="stack">
          <h2>{l.impact}</h2>
          <IncidentImpactReview
            preview={review.preview}
            onRefresh={() => preview()}
            onResult={record}
            onEditingChange={(value) => {
              setEditing(value);
              setFinalReview(false);
            }}
            disabled={mutation.busy || uncertain || !!incidentId}
          />
          {!review.preview.canResolve && <p>{l.resolutionRequired}</p>}
          {!finalReview && (
            <button
              type="button"
              className="btn btn--secondary"
              disabled={mutation.busy || editing || uncertain || !!incidentId}
              onClick={() => preview(true)}
            >
              {t.managerOperations.recheck}
            </button>
          )}
          {finalReview && (
            <>
              <h3>{t.managerOperations.resolveReview}</h3>
              <p>
                {review.body.startAtUtc} – {review.body.endAtUtc} ·{" "}
                {review.body.reason}
              </p>
              <p>{t.managerOperations.partialHint}</p>
              <button
                className="btn"
                disabled={
                  mutation.busy ||
                  editing ||
                  !review.preview.canResolve ||
                  !!incidentId ||
                  uncertain
                }
                onClick={async () => {
                  setResolving(true);
                  record("FINAL", "—", "pending");
                  let unknown = false;
                  const ok = await mutation.run(async () => {
                    const response = await api
                      .post<{ incidentId: string }>(
                        "/api/manager/incidents/resolve",
                        review.body,
                      )
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
                    record("FINAL", response.incidentId, "succeeded");
                    window.history.replaceState(
                      null,
                      "",
                      `?incidentId=${response.incidentId}`,
                    );
                  }, l.resolved);
                  setResolving(false);
                  if (!ok) {
                    record("FINAL", "—", unknown ? "unknown" : "failed");
                    setReview(null);
                    setFinalReview(false);
                    setUncertain(unknown);
                    if (unknown) {
                      const query = new URLSearchParams(window.location.search);
                      query.set("incidentUncertain", "1");
                      window.history.replaceState(null, "", `?${query}`);
                    }
                  }
                }}
              >
                {t.managerOperations.finalResolve}
              </button>
            </>
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
      <ReceiptLookup kind="incidents" />
    </>
  );
}
