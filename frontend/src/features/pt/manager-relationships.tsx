"use client";
import { pagedItems } from "@/lib/paged";
import { useState } from "react";
import Link from "next/link";
import { MemberPicker } from "@/components/MemberPicker";
import { AsyncSection, Card, Field, StatusChip } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import { MutationFeedback, useMutation } from "@/features/operations";
import type {
  CoachMemberRelationshipDto,
  UserAdminDto,
  CoachAdminDto,
  Paged,
} from "@/lib/types";
import { ListPager } from "./ui";
function Relationship({
  row: r,
  reload,
}: {
  row: CoachMemberRelationshipDto;
  reload: () => void;
}) {
  const { t } = useLanguage();
  const l = t.staffWork;
  const [reason, setReason] = useState("");
  const mutation = useMutation();
  return (
    <Card title={`${r.memberName} · ${r.coachName}`}>
      <StatusChip value={r.status} />
      {r.status === "ACTIVE" && (
        <form
          className="form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await mutation.run(() =>
                api.post(
                  `/api/coach-member-relationships/${r.relationshipId}/end`,
                  { reason: reason.trim() },
                ),
              )
            )
              reload();
          }}
        >
          <Field label={l.reason}>
            <input
              required
              minLength={3}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <button
            className="btn btn--danger"
            disabled={mutation.busy || reason.trim().length < 3}
          >
            {l.endRelationship}
          </button>
        </form>
      )}
      <MutationFeedback mutation={mutation} />
    </Card>
  );
}
export function ManagerRelationships() {
  const { t } = useLanguage();
  const l = t.staffWork;
  const [member, setMember] = useState<UserAdminDto | null>(null);
  const [coachId, setCoachId] = useState("");
  const [note, setNote] = useState("");
  const [page, setPage] = useState(1);
  const [active, setActive] = useState(true);
  const [coachPage, setCoachPage] = useState(1);
  const mutation = useMutation();
  const coaches = useApi(
    async (signal) => {
      const [ptCoaches, coaches] = await Promise.all([
        api.get<{ userId: string }[]>("/api/coaches", {
          signal,
          query: { service: "PERSONAL_TRAINING" },
        }),
        api.get<Paged<CoachAdminDto>>("/api/manager/coaches", {
          signal,
          query: { page: coachPage, pageSize: 20 },
        }),
      ]);
      const ptIds = new Set(ptCoaches.map((c) => c.userId));
      return {
        ...coaches,
        items: pagedItems(coaches).filter(
          (c) => c.status === "ACTIVE" && ptIds.has(c.userId),
        ),
      };
    },
    [coachPage],
  );
  const state = useApi(
    (signal) =>
      api.get<CoachMemberRelationshipDto[]>("/api/coach-member-relationships", {
        signal,
        query: { page, pageSize: 20, activeOnly: active },
      }),
    [page, active],
  );
  return (
    <>
      <Link className="btn btn--secondary" href="/manager/pt?tab=requests">
        {l.requests}
      </Link>
      <Card title={l.newRelationship}>
        <form
          className="form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!member) return;
            if (
              await mutation.run(() =>
                api.post("/api/coach-member-relationships", {
                  memberId: member.userId,
                  coachId,
                  sourceType: "ASSIGNED_BY_MANAGER",
                  note: note.trim() || null,
                }),
              )
            ) {
              setMember(null);
              setNote("");
              state.reload();
            }
          }}
        >
          <MemberPicker
            value={member}
            onChange={(m) => {
              setMember(m);
              mutation.reset();
            }}
          />
          <AsyncSection state={coaches}>
            {(data) => (
              <>
                <Field label={l.coach}>
                  <select
                    required
                    value={coachId}
                    onChange={(e) => setCoachId(e.target.value)}
                  >
                    <option value="">—</option>
                    {pagedItems(data).map((c) => (
                      <option key={c.userId} value={c.userId}>
                        {c.fullName}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="btn-row">
                  <button
                    type="button"
                    className="btn btn--secondary"
                    disabled={coachPage <= 1}
                    onClick={() => {
                      setCoachPage((p) => p - 1);
                      setCoachId("");
                    }}
                  >
                    {t.wallet.previous}
                  </button>
                  <button
                    type="button"
                    className="btn btn--secondary"
                    disabled={coachPage * 20 >= data.totalCount}
                    onClick={() => {
                      setCoachPage((p) => p + 1);
                      setCoachId("");
                    }}
                  >
                    {t.wallet.next}
                  </button>
                </div>
              </>
            )}
          </AsyncSection>
          <Field label={l.note}>
            <textarea
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
          <MutationFeedback mutation={mutation} />
          <button
            className="btn"
            disabled={mutation.busy || !member || !coachId}
          >
            {l.save}
          </button>
        </form>
      </Card>
      <label>
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => {
            setActive(e.target.checked);
            setPage(1);
          }}
        />
        {l.activeOnly}
      </label>
      <AsyncSection state={state}>
        {(rows) => (
          <>
            {rows.map((r) => (
              <Relationship
                key={`${r.relationshipId}-${r.status}`}
                row={r}
                reload={state.reload}
              />
            ))}
            {!rows.length && <p>{t.common.noData}</p>}
            <ListPager page={page} count={rows.length} onChange={setPage} />
          </>
        )}
      </AsyncSection>
    </>
  );
}
