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
export function IncidentForm() {
  const { t } = useLanguage();
  const l = t.operations;
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
  const [completed, setCompleted] = useState<
    { type: string; id: string; at: string }[]
  >([]);
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
          <fieldset disabled={resolving || uncertain || !!incidentId}>
            <div className="form-grid">
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
              className="btn"
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
        <h2>{t.managerOperations.completedSteps}</h2>
        {!completed.length && <p>{t.managerOperations.noSteps}</p>}
        {completed.map((r, i) => (
          <p key={`${r.id}-${i}`}>
            {t.managerOperations.completedStep} · {r.type} · <code>{r.id}</code>{" "}
            · {r.at}
          </p>
        ))}
      </div>
      {review && (
        <Card title={l.impact}>
          <IncidentImpactReview
            preview={review.preview}
            onRefresh={() => preview()}
            onCompleted={(type, id) => {
              setCompleted((rows) => [
                ...rows,
                { type, id, at: new Date().toLocaleTimeString() },
              ]);
              setFinalReview(false);
            }}
          />
          {!review.preview.canResolve && <p>{l.resolutionRequired}</p>}
          {!finalReview && (
            <button
              type="button"
              className="btn btn--secondary"
              disabled={mutation.busy || uncertain || !!incidentId}
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
                  !review.preview.canResolve ||
                  !!incidentId ||
                  uncertain
                }
                onClick={async () => {
                  setResolving(true);
                  let unknown = false;
                  const ok = await mutation.run(async () => {
                    const response = await api
                      .post<{ incidentId: string }>(
                        "/api/manager/incidents/resolve",
                        review.body,
                      )
                      .catch((error) => {
                        unknown =
                          !(error instanceof ApiError) ||
                          error.status === 0 ||
                          error.status >= 500;
                        throw error;
                      });
                    setIncidentId(response.incidentId);
                    window.history.replaceState(
                      null,
                      "",
                      `?incidentId=${response.incidentId}`,
                    );
                  }, l.resolved);
                  setResolving(false);
                  if (!ok) {
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
        </Card>
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
