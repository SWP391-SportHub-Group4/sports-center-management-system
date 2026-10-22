"use client";

import { useRef, useState } from "react";
import { Dialog } from "@/components/ui";
import { MemberPicker } from "@/components/MemberPicker";
import { ApiError, api } from "@/lib/apiClient";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { DAY_PASS_PACKAGE_ID } from "@/lib/day-pass";
import {
  SUPPORT_CATEGORIES,
  type SupportCategory,
} from "@/lib/support-categories";
import { useApi } from "@/lib/useApi";
import type { MemberPackageDto, UserAdminDto } from "@/lib/types";
import type { SupportAssignee } from "./support-request-actions";
import {
  ROLE_LABELS,
  ROLE_RANK,
  roleKey,
} from "./support-shared";
import styles from "./support-center.module.css";

function MemberPlanLine({ memberId }: { memberId: string }) {
  const packages = useApi(
    (signal) =>
      api.get<MemberPackageDto[]>(`/api/members/${memberId}/packages`, {
        signal,
      }),
    [memberId],
  );
  if (packages.loading) return <p className={styles.planLine}>Loading plan…</p>;
  const usable = (packages.data ?? []).filter(
    (p) => p.status === "ACTIVE" && p.isUsable,
  );
  const plan =
    usable.find((p) => p.packageId !== DAY_PASS_PACKAGE_ID) ?? usable[0];
  return (
    <p className={styles.planLine}>
      Membership:{" "}
      <strong>
        {plan
          ? plan.packageId === DAY_PASS_PACKAGE_ID
            ? "Day pass"
            : `${plan.packageName} · until ${formatDate(plan.endDate)}`
          : "No active plan"}
      </strong>
    </p>
  );
}

/** "+ Record a request for member": lookup, channel, topic, description, then create and handle or hand over. */
export function SupportCreateDialog({
  assignees,
  onClose,
  onCreated,
}: {
  assignees: SupportAssignee[];
  onClose: () => void;
  onCreated: (message: string) => void;
}) {
  const { user } = useAuth();
  const [member, setMember] = useState<UserAdminDto | null>(null);
  const [category, setCategory] = useState<SupportCategory | "">("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [handoverTo, setHandoverTo] = useState("");
  const [handoverNote, setHandoverNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);

  const target = assignees.find((x) => x.userId === handoverTo);
  const myRank = ROLE_RANK[roleKey(user?.role)];
  const escalating = !!target && ROLE_RANK[roleKey(target.role)] > myRank;
  const baseReady =
    !!member &&
    category !== "" &&
    subject.trim().length >= 3 &&
    description.trim().length >= 3;
  const handoverBlock = !handoverTo
    ? "Choose who to hand over to."
    : escalating && handoverNote.trim().length < 3
      ? "Add a handover note to escalate to a higher role."
      : null;

  async function submit(handover: boolean) {
    if (lock.current || !member || category === "") return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/member-support-requests", {
        memberId: member.userId,
        category,
        subject: subject.trim(),
        description: description.trim(),
        assigneeUserId: handover ? handoverTo : user?.userId,
        handoverNote: handover ? handoverNote.trim() : undefined,
      });
      onCreated(
        handover
          ? `Request created and handed over to ${target?.name ?? "staff"}.`
          : "Request created. You are handling it.",
      );
    } catch (e) {
      setError(
        e instanceof ApiError || e instanceof Error
          ? e.message
          : "Could not create the request.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <Dialog
      title="Record a request for member"
      size="lg"
      closeIconOnly
      onClose={() => !busy && onClose()}
    >
      <div className={styles.dialogBody}>
        <div>
          <MemberPicker
            value={member}
            onChange={setMember}
            label="Member"
            scanner={false}
            autoFocus
            placeholder="Search by name, phone or email…"
          />
          {member && <MemberPlanLine memberId={member.userId} />}
        </div>

        <label className={styles.field}>
          Topic
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as SupportCategory)}
          >
            <option value="">Select a topic</option>
            {SUPPORT_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          Subject
          <input
            value={subject}
            maxLength={200}
            placeholder="Short summary"
            onChange={(e) => setSubject(e.target.value)}
          />
        </label>

        <label className={styles.field}>
          Description
          <textarea
            value={description}
            maxLength={2000}
            placeholder="What does the member need?"
            onChange={(e) => setDescription(e.target.value)}
          />
          <span className={styles.muted}>{description.length}/2000</span>
        </label>

        <div className={styles.box}>
          <label className={styles.field}>
            Hand over to (optional)
            <select
              value={handoverTo}
              onChange={(e) => setHandoverTo(e.target.value)}
            >
              <option value="">Select a staff member</option>
              {assignees
                .filter((x) => x.userId !== user?.userId)
                .map((x) => (
                  <option key={x.userId} value={x.userId}>
                    {x.name} ({ROLE_LABELS[roleKey(x.role)]})
                  </option>
                ))}
            </select>
          </label>
          {escalating && (
            <label className={styles.field}>
              Handover note (required)
              <textarea
                value={handoverNote}
                maxLength={1000}
                placeholder="Why does this need a higher role?"
                onChange={(e) => setHandoverNote(e.target.value)}
              />
            </label>
          )}
        </div>

        {error && (
          <p className={`${styles.feedback} ${styles.feedbackError}`} role="alert">
            {error}
          </p>
        )}

        <div className={styles.dialogFoot}>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            disabled={busy || !baseReady || handoverBlock !== null}
            title={handoverBlock ?? undefined}
            onClick={() => void submit(true)}
          >
            Create &amp; hand over
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy || !baseReady}
            onClick={() => void submit(false)}
          >
            Create &amp; handle myself
          </button>
        </div>
        {baseReady && handoverBlock && (
          <p className={styles.helper}>
            To hand over: {handoverBlock.toLowerCase()}
          </p>
        )}
      </div>
    </Dialog>
  );
}
