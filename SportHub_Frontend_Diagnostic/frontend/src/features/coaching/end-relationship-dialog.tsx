"use client";

import { useState } from "react";
import { Dialog, Field } from "@/components/ui";
import { MutationFeedback, useMutation } from "@/features/operations";
import { api } from "@/lib/apiClient";
import { useLanguage } from "@/lib/language";
import type { CoachMemberRelationshipDto } from "@/lib/types";
import styles from "./manager-members.module.css";

export function EndRelationshipDialog({
  relationship,
  onClose,
  onEnded,
}: {
  relationship: CoachMemberRelationshipDto;
  onClose: () => void;
  onEnded: () => void;
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const mutation = useMutation();
  const [reason, setReason] = useState("");
  const valid = reason.trim().length >= 3 && reason.trim().length <= 500;
  return (
    <Dialog
      title={vi ? "Kết thúc quan hệ HLV–hội viên" : "End coach relationship"}
      onClose={() => {
        if (!mutation.busy) onClose();
      }}
    >
      <form
        className={styles.assignmentForm}
        onSubmit={async (event) => {
          event.preventDefault();
          if (!valid || mutation.busy) return;
          if (
            await mutation.run(() =>
              api.post(
                `/api/coach-member-relationships/${relationship.relationshipId}/end`,
                { reason: reason.trim() },
              ),
            )
          )
            onEnded();
        }}
      >
        <p>
          {vi ? "Huấn luyện viên" : "Coach"}:{" "}
          <strong>{relationship.coachName}</strong>
        </p>
        <p>
          {vi
            ? "Quan hệ sẽ chuyển sang Đã kết thúc và giữ lại lịch sử huấn luyện cùng lý do kết thúc."
            : "The relationship will be marked Ended. Training history and the ending reason will be retained."}
        </p>
        <p>
          {vi
            ? "Hội viên vẫn ghi danh và học theo lịch hiện tại. HLV vẫn có quyền theo lớp nếu còn phụ trách lớp hội viên đang học. Để thay HLV hoặc ngừng học, hãy xử lý tại lớp học."
            : "The member stays enrolled and keeps their current schedule. Coach access through current class assignments remains. To change the teacher or end enrollment, manage the class separately."}
        </p>
        <Field
          label={vi ? "Lý do kết thúc" : "Ending reason"}
          required
          hint={vi ? "Từ 3 đến 500 ký tự." : "3–500 characters."}
        >
          <textarea
            required
            minLength={3}
            maxLength={500}
            rows={4}
            value={reason}
            disabled={mutation.busy}
            onChange={(event) => setReason(event.target.value)}
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
            className="btn btn--danger"
            disabled={!valid || mutation.busy}
          >
            {mutation.busy
              ? vi
                ? "Đang lưu…"
                : "Saving…"
              : vi
                ? "Xác nhận kết thúc"
                : "Confirm ending"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
