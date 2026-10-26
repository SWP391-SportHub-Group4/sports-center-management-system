"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, Table } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { useLanguage } from "@/lib/language";
import { formatDateTime } from "@/lib/format";
import type { IncidentDetails } from "./incident-api";

export function IncidentDayPassSupport({
  incident,
  onChanged,
}: {
  incident: IncidentDetails;
  onChanged: () => void;
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!incident.closesGym) return null;
  const members = incident.dayPassMembers ?? [];
  async function notify() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api.post(
        `/api/manager/incidents/${incident.incidentId}/day-pass-notice`,
      );
      onChanged();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : vi
            ? "Chưa gửi được. Hãy thử lại."
            : "Could not send. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title={vi ? "Hỗ trợ vé Gym ngày" : "Day-pass support"}>
      <p>
        {vi
          ? "Vé giữ nguyên hạn 22:00 cùng ngày. Sự cố không hủy vé, hoàn điểm hay gia hạn. Nếu Gym mở lại trước hạn, Member tiếp tục dùng vé."
          : "Passes keep their original 22:00 expiry. The incident does not cancel, refund or extend them. Members can use their passes if the Gym reopens before expiry."}
      </p>
      {members.length > 0 ? (
        <>
          <Table
            headers={[
              vi ? "Hội viên" : "Member",
              vi ? "Ngày sử dụng" : "Use date",
              vi ? "Hết hạn" : "Expires",
            ]}
          >
            {members.map((m) => (
              <tr key={m.passId}>
                <td>{m.memberName ?? m.memberId}</td>
                <td>{m.useDate}</td>
                <td>{formatDateTime(m.expiresAtUtc)}</td>
              </tr>
            ))}
          </Table>
          <p>
            {vi
              ? "Xem lại danh sách trước khi gửi thông báo và email về thời gian đóng Gym, hiệu lực vé và cách liên hệ hỗ trợ."
              : "Review the list before sending an in-app notice and email with the closure period, pass validity and support instructions."}
          </p>
          {incident.dayPassNoticeSentAtUtc ? (
            <p role="status">
              {vi ? "Đã gửi thông báo lúc" : "Notice sent at"}{" "}
              {formatDateTime(incident.dayPassNoticeSentAtUtc)}
            </p>
          ) : (
            <button
              className="btn"
              disabled={busy}
              onClick={() => void notify()}
            >
              {busy
                ? vi
                  ? "Đang gửi…"
                  : "Sending…"
                : vi
                  ? "Gửi thông báo cho người có vé"
                  : "Notify day-pass holders"}
            </button>
          )}
        </>
      ) : (
        <p>
          {vi
            ? "Không có vé Gym ngày đã thanh toán trong thời gian bị ảnh hưởng."
            : "No paid day passes overlap this closure."}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <p>
        {vi
          ? "Ghi nhận Member đồng ý trước khi tặng điểm. Nếu chưa thống nhất, Member gửi Support Request PAYMENT gắn hóa đơn để Manager hỗ trợ."
          : "Record the member’s agreement before gifting points. If further discussion is needed, the member can send a PAYMENT support request linked to the invoice."}
      </p>
      <div className="btn-row">
        <Link
          className="btn btn--secondary"
          href={`/manager/points?incidentId=${incident.incidentId}`}
        >
          {vi
            ? "Tặng điểm / Xem lịch sử hỗ trợ"
            : "Gift points / View gift history"}
        </Link>
        <Link className="btn btn--ghost" href="/manager/requests?type=support">
          {vi ? "Mở yêu cầu hỗ trợ" : "Open support requests"}
        </Link>
      </div>
    </Card>
  );
}
