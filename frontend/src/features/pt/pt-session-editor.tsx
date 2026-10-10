"use client";
import styles from "./pt-session-editor.module.css";
import { useState } from "react";
import { AsyncSection, Card, Field } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { vietnamUtc, vietnamLocal } from "@/lib/vietnam-time";
import { MutationFeedback, useMutation } from "@/features/operations";
import type { PtSessionDto, PtEntitlementDto, RoomDto } from "@/lib/types";
export function PtSessionEditor({
  session,
  entitlement,
  onSaved,
}: {
  session?: PtSessionDto;
  entitlement?: PtEntitlementDto;
  onSaved: () => void;
}) {
  const { t } = useLanguage();
  const l = t.staffWork;
  const [start, setStart] = useState(
    session ? vietnamLocal(session.startAtUtc) : "",
  );
  const [room, setRoom] = useState(session?.roomId?.toString() ?? "");
  const [reason, setReason] = useState("");
  const rooms = useApi(
    (signal) => api.get<RoomDto[]>("/api/rooms", { signal }),
    [],
  );
  const mutation = useMutation();
  return (
    <Card title={session ? l.reschedule : l.schedule} hint={l.sessionHint}>
      <form
        className={styles.form}
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await mutation.run(() =>
              session
                ? api.post(
                    `/api/manager/pt-sessions/${session.sessionId}/reschedule`,
                    {
                      newStartAtUtc: vietnamUtc(start),
                      roomId: room ? Number(room) : null,
                      reason: reason.trim(),
                    },
                  )
                : api.post("/api/manager/pt-sessions", {
                    entitlementId: entitlement?.entitlementId,
                    startAtUtc: vietnamUtc(start),
                    roomId: room ? Number(room) : null,
                  }),
            )
          )
            onSaved();
        }}
      >
        <p>
          {session?.memberName ?? entitlement?.memberName} ·{" "}
          {session?.coachName ?? entitlement?.coachName}
        </p>
        <Field label={l.start}>
          <input
            type="datetime-local"
            required
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </Field>
        <AsyncSection state={rooms}>
          {(rows) => (
            <Field label={l.room}>
              <select value={room} onChange={(e) => setRoom(e.target.value)}>
                <option value="">{session ? l.keepRoom : l.noRoom}</option>
                {rows
                  .filter((r) => r.isActive)
                  .map((r) => (
                    <option key={r.roomId} value={r.roomId}>
                      {r.name}
                    </option>
                  ))}
              </select>
            </Field>
          )}
        </AsyncSection>
        {session && (
          <Field label={l.reason}>
            <textarea
              required
              minLength={3}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
        )}
        <MutationFeedback mutation={mutation} />
        <button
          className="btn"
          disabled={mutation.busy || rooms.loading || !!rooms.error}
        >
          {l.save}
        </button>
      </form>
    </Card>
  );
}
