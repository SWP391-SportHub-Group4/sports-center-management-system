"use client";

import { useState } from "react";
import { AsyncSection, Feedback, Field } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { useAction, useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { findSportWithService } from "@/lib/sports";
import type {
  PtChangeRequestDto,
  PtEntitlementDto,
  SportDto,
} from "@/lib/types";
import { RequestList } from "./request-list";
import styles from "./training.module.css";

/** Đổi HLV (A09): form chỉ mở khi cần, lịch sử yêu cầu kèm trạng thái duyệt. */
export function CoachChangeSection({
  entitlements,
}: {
  entitlements: PtEntitlementDto[];
}) {
  const { t } = useLanguage();
  const l = t.ptOps;
  const active = entitlements.filter(
    (e) => e.status.toUpperCase() === "ACTIVE",
  );
  const [open, setOpen] = useState(false);
  const [entitlementId, setEntitlement] = useState(
    active.length === 1 ? active[0].entitlementId : "",
  );
  const [coachId, setCoach] = useState("");
  const [reason, setReason] = useState("");
  const [revision, setRevision] = useState(0);
  const action = useAction();
  const sports = useApi(
    (signal) => api.get<SportDto[]>("/api/sports", { signal, anonymous: true }),
    [],
  );
  const pt = findSportWithService(sports.data, "PERSONAL_TRAINING");
  const coaches = useApi(
    (signal) =>
      pt
        ? api.get<{ userId: string; fullName: string }[]>("/api/coaches", {
            signal,
            query: { service: "PERSONAL_TRAINING" },
          })
        : Promise.resolve([]),
    [pt?.sportId],
  );
  const history = useApi(
    (signal) =>
      api.get<PtChangeRequestDto[]>(
        "/api/members/me/pt-coach-change-requests",
        { signal },
      ),
    [revision],
  );
  const current = active.find((e) => e.entitlementId === entitlementId);

  return (
    <section className={styles.section} aria-labelledby="coach-change-title">
      <h2 id="coach-change-title">{l.coachChangeTitle}</h2>
      <p className={styles.muted}>{l.coachChangeHint}</p>
      {active.length > 0 && !open && (
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => setOpen(true)}
        >
          {l.requestCoach}
        </button>
      )}
      {open && (
        <form
          className={styles.panel}
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await action.run(
              () =>
                api.post(
                  `/api/members/me/pt-entitlements/${entitlementId}/coach-change-requests`,
                  {
                    requestedCoachId: coachId,
                    reason: reason.trim(),
                  },
                ),
              l.sent,
            );
            if (ok !== null) {
              setOpen(false);
              setCoach("");
              setReason("");
              setRevision((n) => n + 1);
            }
          }}
        >
          {active.length > 1 && (
            <Field label={l.package}>
              <select
                value={entitlementId}
                onChange={(e) => setEntitlement(e.target.value)}
              >
                <option value="">—</option>
                {active.map((e) => (
                  <option key={e.entitlementId} value={e.entitlementId}>
                    {e.coachName}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label={l.newCoach}>
            <select
              value={coachId}
              onChange={(e) => setCoach(e.target.value)}
              required
            >
              <option value="">—</option>
              {coaches.data
                ?.filter((c) => c.userId !== current?.coachId)
                .map((c) => (
                  <option key={c.userId} value={c.userId}>
                    {c.fullName}
                  </option>
                ))}
            </select>
          </Field>
          <Field label={l.reason}>
            <textarea
              maxLength={2000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <div className="btn-row">
            <button
              type="submit"
              className="btn"
              disabled={action.busy || !entitlementId || !coachId}
            >
              {l.sendRequest}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setOpen(false)}
            >
              {l.closeForm}
            </button>
          </div>
        </form>
      )}
      <Feedback error={action.error} success={action.success} />
      <AsyncSection state={history}>
        {(rows) => (
          <RequestList coach requests={rows} empty={l.noCoachRequests} />
        )}
      </AsyncSection>
    </section>
  );
}
