"use client";
import { DeliveryStatus } from "./delivery-status";
import { useRef, useState } from "react";
import { api } from "@/lib/apiClient";
import { useLanguage } from "@/lib/language";
import { Card, Field } from "@/components/ui";
import { RoomSelector } from "@/features/catalog";
import { MutationFeedback, useMutation } from "@/features/operations";
import { vietnamUtc } from "@/lib/vietnam-time";
import type { IncidentPreviewDto } from "@/lib/types";
import { IncidentImpactReview } from "./incident-impact-review";
export function IncidentForm() {
  const { t } = useLanguage();
  const l = t.operations;
  const mutation = useMutation();
  const revision = useRef(0);
  const [scope, setScope] = useState("ROOM");
  const [roomId, setRoom] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
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
  const [incidentId, setIncidentId] = useState("");
  function clear() {
    revision.current++;
    setReview(null);
    setIncidentId("");
    mutation.reset();
  }
  async function preview() {
    const expectedRevision = revision.current;
    const body = {
      scope,
      roomId: scope === "ROOM" ? Number(roomId) : null,
      startAtUtc: vietnamUtc(start),
      endAtUtc: vietnamUtc(end),
      reason,
    };
    setReview(null);
    await mutation.run(async () => {
      const data = await api.post<IncidentPreviewDto>(
        "/api/manager/incidents/preview",
        body,
      );
      if (revision.current === expectedRevision)
        setReview({ body, preview: data });
    }, "");
  }
  return (
    <>
      <Card title={l.incidents}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await preview();
          }}
        >
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
        </form>
        <MutationFeedback mutation={mutation} />
        {incidentId && (
          <p role="status">
            {l.resolved} · {incidentId}
          </p>
        )}
        {incidentId && (
          <DeliveryStatus
            path={`/api/manager/incidents/${incidentId}/notifications`}
          />
        )}
      </Card>
      {review && (
        <Card title={l.impact}>
          <IncidentImpactReview preview={review.preview} onRefresh={preview} />
          {!review.preview.canResolve && <p>{l.resolutionRequired}</p>}
          <button
            className="btn"
            disabled={
              mutation.busy || !review.preview.canResolve || !!incidentId
            }
            onClick={async () => {
              const ok = await mutation.run(async () => {
                const response = await api.post<{ incidentId: string }>(
                  "/api/manager/incidents/resolve",
                  review.body,
                );
                setIncidentId(response.incidentId);
              }, l.resolved);
              if (!ok) setReview(null);
            }}
          >
            {l.resolve}
          </button>
        </Card>
      )}
    </>
  );
}
