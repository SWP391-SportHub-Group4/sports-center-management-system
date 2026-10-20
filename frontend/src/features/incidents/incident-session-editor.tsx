"use client";
import { useState } from "react";
import { Field, Feedback } from "@/components/ui";
import { CoachSelector } from "@/features/coaches";
import { RoomSelector, catalogApi } from "@/features/catalog";
import { MutationFeedback, useMutation } from "@/features/operations";
import { useLanguage } from "@/lib/language";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { formatDateTime } from "@/lib/format";
import { vietnamLocal, vietnamUtc } from "@/lib/vietnam-time";
import type { CourseSessionDto } from "@/lib/types";
import { incidentApi, type IncidentRequest } from "./incident-api";
import type { StepStatus } from "./incident-progress";

export function IncidentSessionEditor({
  session,
  confirmedCount,
  sportId,
  incident,
  onSaved,
  onOutcome,
}: {
  session: CourseSessionDto;
  confirmedCount: number;
  sportId: number;
  incident: IncidentRequest;
  onSaved: () => void;
  onOutcome: (status: StepStatus, message?: string) => void;
}) {
  const { language, t } = useLanguage();
  const vi = language === "vi";
  const mutation = useMutation();
  const [openedAt] = useState(Date.now);
  const [outcome, setOutcome] = useState(
    confirmedCount > 0 ? "" : "INTERRUPTED",
  );
  const [occurred, setOccurred] = useState(
    vietnamLocal(
      new Date(
        Math.max(
          Date.parse(session.startAtUtc),
          Date.parse(incident.startAtUtc),
        ),
      ).toISOString(),
    ),
  );
  const [reason, setReason] = useState(incident.reason);
  const [start, setStart] = useState("");
  const [room, setRoom] = useState(String(session.roomId));
  const [coach, setCoach] = useState(session.coachId);
  const [review, setReview] = useState(false);
  const options = useApi(
    async (signal) => {
      const [rooms, coaches] = await Promise.all([
        catalogApi.rooms(signal),
        api.get<{ userId: string; fullName: string }[]>("/api/coaches", {
          signal,
          query: { sportId },
        }),
      ]);
      return { rooms, coaches };
    },
    [sportId],
  );
  const full = outcome === "COMPLETED_AS_PLANNED";
  const labels: Record<string, string> = {
    INTERRUPTED: vi
      ? "Đang học thì bị gián đoạn"
      : "Interrupted after starting",
    NOT_HELD: vi ? "Buổi không diễn ra" : "Session not held",
    COMPLETED_AS_PLANNED: vi ? "Đã học đầy đủ" : "Fully delivered",
  };
  const valid =
    !!outcome &&
    (confirmedCount === 0 || full) &&
    reason.trim().length >= 3 &&
    reason.trim().length <= 500 &&
    !!occurred &&
    (full || (!!start && !!room && !!coach));
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) setReview(true);
      }}
    >
      <p>
        <strong>
          {session.className} · {vi ? "Buổi" : "Session"} {session.sessionNo}
        </strong>
        <br />
        {formatDateTime(session.startAtUtc)} –{" "}
        {formatDateTime(session.endAtUtc)}
      </p>
      {confirmedCount === 0 && (
        <p>
          {vi
            ? "Giữ nguyên giờ học, điểm danh và đánh giá của buổi gốc để truy vết. Buổi không diễn ra hoặc bị gián đoạn được học lại nguyên thời lượng, không tính phần phút còn thiếu."
            : "Original times, attendance and assessments are retained. A missed or interrupted session is repeated in full; no partial-duration calculation."}
        </p>
      )}
      <fieldset disabled={mutation.busy} hidden={review}>
        {confirmedCount > 0 && (
          <p role="status">{t.classWorkspace.enrolledCancellationBlocked}</p>
        )}
        <Field
          label={vi ? "Thực tế buổi học" : "Actual session outcome"}
          required
        >
          <select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            {confirmedCount > 0 && <option value="">Select outcome</option>}
            {Object.entries(labels).map(([value, label]) => (
              <option
                key={value}
                value={value}
                disabled={
                  (confirmedCount > 0 && value !== "COMPLETED_AS_PLANNED") ||
                  (value === "COMPLETED_AS_PLANNED" &&
                    Date.parse(session.endAtUtc) > openedAt)
                }
              >
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label={vi ? "Thời điểm sự cố thực tế" : "Actual incident time"}
          required
        >
          <input
            type="datetime-local"
            required
            value={occurred}
            onChange={(e) => setOccurred(e.target.value)}
          />
        </Field>
        <Field
          label={vi ? "Lý do và ghi nhận" : "Reason and observations"}
          required
        >
          <textarea
            required
            minLength={3}
            maxLength={500}
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        {!full && confirmedCount === 0 && (
          <>
            <Field label={vi ? "Lịch học lại" : "Replacement start"} required>
              <input
                type="datetime-local"
                required
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </Field>
            <RoomSelector sportId={sportId} value={room} onChange={setRoom} />
            <CoachSelector
              sportId={sportId}
              value={coach}
              onChange={setCoach}
            />
          </>
        )}
      </fieldset>
      {review && (
        <section
          className="stack"
          aria-label={vi ? "Xác nhận phương án" : "Review incident outcome"}
        >
          <p>
            <strong>{labels[outcome]}</strong>
            <br />
            {formatDateTime(vietnamUtc(occurred))}
            <br />
            {reason}
          </p>
          {!full && (
            <p>
              {vi ? "Lịch học lại" : "Replacement"}:{" "}
              {formatDateTime(vietnamUtc(start))} ·{" "}
              {vi ? "Thời lượng" : "Duration"}:{" "}
              {(Date.parse(session.endAtUtc) - Date.parse(session.startAtUtc)) /
                60000}{" "}
              {vi ? "phút" : "minutes"}
              <br />
              {vi ? "Phòng" : "Room"}:{" "}
              {options.data?.rooms.find((r) => String(r.roomId) === room)
                ?.name ?? `#${room}`}
              <br />
              {vi ? "HLV" : "Coach"}:{" "}
              {options.data?.coaches.find((c) => c.userId === coach)
                ?.fullName ??
                (coach === session.coachId ? session.coachName : coach)}
            </p>
          )}
          {full && (
            <p>
              {vi
                ? "Không tạo buổi học lại cho buổi đã học đủ."
                : "No replacement is created for a fully delivered session."}
            </p>
          )}
          {!full && <Feedback error={options.error?.message} />}
          <div className="btn-row">
            <button
              type="button"
              className="btn btn--secondary"
              disabled={mutation.busy}
              onClick={() => setReview(false)}
            >
              {vi ? "Chỉnh sửa" : "Edit"}
            </button>
            <button
              type="button"
              className="btn"
              disabled={
                mutation.busy ||
                !valid ||
                (!full && (options.loading || !!options.error))
              }
              onClick={async () => {
                onOutcome("pending");
                const ok = await mutation.run(async () => {
                  const fence = await incidentApi.openFence(incident);
                  await api.post(
                    `/api/class-sessions/${session.sessionId}/incident`,
                    {
                      fenceId: fence.fenceId,
                      outcome,
                      occurredAtUtc: vietnamUtc(occurred),
                      reason: reason.trim(),
                      makeup: full
                        ? null
                        : {
                            startAtUtc: vietnamUtc(start),
                            roomId: Number(room),
                            coachId: coach,
                          },
                    },
                  );
                }, "");
                onOutcome(ok ? "succeeded" : "failed");
                if (ok) onSaved();
              }}
            >
              {vi ? "Xác nhận xử lý" : "Confirm outcome"}
            </button>
          </div>
        </section>
      )}
      {!review && (
        <button
          type="submit"
          className="btn"
          disabled={!valid || mutation.busy}
        >
          {vi ? "Xem lại phương án" : "Review outcome"}
        </button>
      )}
      <MutationFeedback mutation={mutation} />
    </form>
  );
}
