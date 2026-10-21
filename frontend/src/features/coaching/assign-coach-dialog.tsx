"use client";

import { useState } from "react";
import { AsyncSection, Dialog, Field } from "@/components/ui";
import { MutationFeedback, useMutation } from "@/features/operations";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";
import type {
  CoachMemberRelationshipDto,
  CourseEnrollmentDto,
  Paged,
  UserAdminDto,
} from "@/lib/types";
import styles from "./manager-members.module.css";

async function loadCandidates(memberId: string, signal: AbortSignal) {
  const enrollments: CourseEnrollmentDto[] = [];
  const relationships: CoachMemberRelationshipDto[] = [];
  await Promise.all([
    (async () => {
      for (let page = 1; ; page++) {
        const data = await api.get<Paged<CourseEnrollmentDto>>(
          `/api/members/${memberId}/enrollments`,
          { signal, query: { page, pageSize: 100 } },
        );
        enrollments.push(...data.items);
        if (!data.items.length || page * data.pageSize >= data.totalCount)
          break;
      }
    })(),
    (async () => {
      for (let page = 1; ; page++) {
        const data = await api.get<CoachMemberRelationshipDto[]>(
          "/api/coach-member-relationships",
          {
            signal,
            query: { memberId, activeOnly: true, page, pageSize: 100 },
          },
        );
        relationships.push(...data);
        if (data.length < 100) break;
      }
    })(),
  ]);
  const coaches = new Map<
    string,
    {
      id: string;
      name: string;
      assigned: boolean;
      classes: Map<
        number,
        { name: string; sportKey: string; sportName: string }
      >;
    }
  >();
  for (const e of enrollments) {
    if (
      !e.coachId ||
      e.status !== "CONFIRMED" ||
      !["PUBLISHED", "IN_PROGRESS"].includes(e.classStatus)
    )
      continue;
    let coach = coaches.get(e.coachId);
    if (!coach) {
      coach = {
        id: e.coachId,
        name: e.coachName || e.coachId,
        assigned: relationships.some(
          (r) => r.coachId === e.coachId && r.status === "ACTIVE",
        ),
        classes: new Map(),
      };
      coaches.set(e.coachId, coach);
    }
    coach.classes.set(e.classId, {
      name: e.className,
      sportKey: String(e.sportId ?? e.sportName),
      sportName: e.sportName,
    });
  }
  return [...coaches.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function AssignCoachDialog({
  member,
  onClose,
  onCreated,
}: {
  member: UserAdminDto;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const candidates = useApi(
    (signal) => loadCandidates(member.userId, signal),
    [member.userId],
  );
  const mutation = useMutation();
  const [sportKey, setSportKey] = useState("");
  const [coachId, setCoachId] = useState("");
  const [note, setNote] = useState("");
  const sports = [
    ...new Map(
      (candidates.data ?? []).flatMap((c) =>
        [...c.classes.values()].map(
          (course) => [course.sportKey, course.sportName] as const,
        ),
      ),
    ),
  ].sort((a, b) => a[1].localeCompare(b[1]));
  const visibleCoaches = (candidates.data ?? []).filter(
    (c) =>
      !sportKey ||
      [...c.classes.values()].some((course) => course.sportKey === sportKey),
  );
  const selected = visibleCoaches.find((c) => c.id === coachId && !c.assigned);
  return (
    <Dialog
      title={vi ? "Phân công HLV" : "Assign coach"}
      description={
        vi
          ? "Chọn HLV chính của lớp hội viên đang theo học. Phân công tự kết thúc khi không còn lớp chung hợp lệ."
          : "Choose a primary coach from the member’s current classes. The assignment ends automatically when no eligible shared classes remain."
      }
      onClose={() => {
        if (!mutation.busy) onClose();
      }}
    >
      <form
        className={styles.assignmentForm}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!selected || candidates.loading || mutation.busy) return;
          if (
            await mutation.run(() =>
              api.post("/api/coach-member-relationships", {
                coachId: selected.id,
                memberId: member.userId,
                sourceType: "ASSIGNED_BY_MANAGER",
                note: note.trim() || null,
              }),
            )
          )
            onCreated();
          else {
            setCoachId("");
            setSportKey("");
            candidates.reload();
          }
        }}
      >
        <p>
          <strong>{member.fullName || member.email}</strong>
          <br />
          {member.email}
        </p>
        <AsyncSection
          state={candidates}
          isEmpty={(rows) => !rows.length}
          emptyMessage={
            vi
              ? "Hội viên chưa có lớp chung hợp lệ với HLV. Cần ghi danh vào lớp trước khi phân công."
              : "This member has no eligible shared classes with a coach. Enroll the member in a class before assigning a coach."
          }
        >
          {() => (
            <>
              <Field
                label={vi ? "Bộ môn" : "Sport"}
                hint={
                  vi
                    ? "Chỉ hiển thị bộ môn có lớp chung hợp lệ với hội viên."
                    : "Only sports with eligible shared classes are shown."
                }
              >
                <select
                  value={sportKey}
                  disabled={mutation.busy}
                  onChange={(e) => {
                    setSportKey(e.target.value);
                    setCoachId("");
                    mutation.reset();
                  }}
                >
                  <option value="">
                    {vi ? "Tất cả bộ môn" : "All sports"}
                  </option>
                  {sports.map(([key, name]) => (
                    <option key={key} value={key}>
                      {name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={vi ? "Huấn luyện viên" : "Coach"} required>
                <select
                  required
                  value={coachId}
                  disabled={mutation.busy}
                  onChange={(e) => {
                    setCoachId(e.target.value);
                    mutation.reset();
                  }}
                >
                  <option value="">{vi ? "Chọn HLV" : "Choose a coach"}</option>
                  {visibleCoaches.map((c) => (
                    <option key={c.id} value={c.id} disabled={c.assigned}>
                      {c.name}
                      {" — "}
                      {[
                        ...new Set(
                          [...c.classes.values()].map(
                            (course) => course.sportName,
                          ),
                        ),
                      ].join(", ")}
                      {c.assigned
                        ? vi
                          ? " — Đã phân công"
                          : " — Already assigned"
                        : ""}
                    </option>
                  ))}
                </select>
              </Field>
              {visibleCoaches.length > 0 &&
                visibleCoaches.every((c) => c.assigned) && (
                  <p>
                    {vi
                      ? "Tất cả HLV có lớp chung đã được phân công."
                      : "All coaches with eligible shared classes are already assigned."}
                  </p>
                )}
              {selected && (
                <div className={styles.assignmentPreview}>
                  <strong>
                    {vi ? "Lớp chung làm căn cứ" : "Eligible shared classes"}
                  </strong>
                  <ul>
                    {[...selected.classes].map(([id, course]) => (
                      <li key={id}>
                        {course.name} — {course.sportName}
                      </li>
                    ))}
                  </ul>
                  <p>
                    {vi
                      ? "Nguồn phân công: Quản lý"
                      : "Assignment source: Manager"}
                  </p>
                </div>
              )}
            </>
          )}
        </AsyncSection>
        <Field label={vi ? "Ghi chú (không bắt buộc)" : "Note (optional)"}>
          <textarea
            value={note}
            maxLength={500}
            rows={3}
            disabled={mutation.busy}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        <MutationFeedback mutation={mutation} />
        <div className="btn-row">
          <button
            type="button"
            className="btn btn--secondary"
            disabled={mutation.busy}
            onClick={onClose}
          >
            {vi ? "Hủy" : "Cancel"}
          </button>
          <button
            type="submit"
            className="btn"
            disabled={!selected || candidates.loading || mutation.busy}
          >
            {mutation.busy
              ? vi
                ? "Đang lưu…"
                : "Saving…"
              : vi
                ? "Xác nhận phân công"
                : "Confirm assignment"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
