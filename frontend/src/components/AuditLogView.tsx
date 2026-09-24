"use client";

import { useState } from "react";
import { AsyncSection, Card, Field, Pager, Table } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { formatDateTime } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type { AuditLogDto, Paged } from "@/lib/types";

/**
 * Nhật ký thao tác (BR-7). Chỉ đọc — không có endpoint nào sửa hoặc xóa audit log, nếu không
 * nhật ký mất giá trị làm bằng chứng.
 *
 * Dùng chung cho Quản lý Trung tâm (BR-7: "xem lịch sử thao tác") và Quản trị hệ thống
 * (cần đối chiếu chính các thao tác khóa/mở khóa mà BR-6 giao cho vai trò này).
 */
export function AuditLogView() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [targetEntity, setTargetEntity] = useState("");

  const logs = useApi(
    (signal) =>
      api.get<Paged<AuditLogDto>>("/api/audit-logs", {
        signal,
        query: {
          page,
          pageSize: 25,
          action: action || undefined,
          targetEntity: targetEntity || undefined,
        },
      }),
    [page, action, targetEntity],
  );

  return (
    <>
      <Card title="Filter">
        <div className="form form--inline">
          <Field
            label="Actions"
            hint="Examples: LEG_OUR_ACCUCT, RECORD_PAYMENT"
          >
            <input
              value={action}
              onChange={(event) => {
                setPage(1);
                setAction(event.target.value);
              }}
            />
          </Field>
          <Field
            label="Objects"
            hint="Examples: ‹ UserAcunit, Invoice, ClassStatus"
          >
            <input
              value={targetEntity}
              onChange={(event) => {
                setPage(1);
                setTargetEntity(event.target.value);
              }}
            />
          </Field>
        </div>
      </Card>

      <Card title="Operations Register" bodyless>
        <AsyncSection
          state={logs}
          emptyMessage="No operation has been recorded."
          isEmpty={(data) => data.items.length === 0}
        >
          {(data) => (
            <>
              <Table
                headers={[
                  "Schedule",
                  "Performor",
                  "Actions",
                  "Objects",
                  "Change Text",
                  "IP",
                ]}
              >
                {data.items.map((log) => (
                  <tr key={log.auditId}>
                    <td className="nowrap small">
                      {formatDateTime(log.timestamp)}
                    </td>
                    <td className="small">{log.actorEmail}</td>
                    <td>
                      <code className="small">{log.action}</code>
                    </td>
                    <td className="small">
                      {log.targetEntity}
                      <div className="muted" style={{ wordBreak: "break-all" }}>
                        {log.targetId}
                      </div>
                    </td>
                    <td
                      className="small"
                      style={{ maxWidth: 380, wordBreak: "break-word" }}
                    >
                      {log.oldValue && (
                        <div className="muted">
                          Before: <code>{log.oldValue}</code>
                        </div>
                      )}
                      {log.newValue && (
                        <div>
                          Sau: <code>{log.newValue}</code>
                        </div>
                      )}
                    </td>
                    <td className="small muted">{log.ipAddress || "—"}</td>
                  </tr>
                ))}
              </Table>

              <div style={{ padding: "0 18px 14px" }}>
                <Pager
                  page={data.page}
                  pageSize={data.pageSize}
                  totalCount={data.totalCount}
                  onChange={setPage}
                />
              </div>
            </>
          )}
        </AsyncSection>
      </Card>
    </>
  );
}
