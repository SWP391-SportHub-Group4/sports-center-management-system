"use client";

import { useState } from "react";
import { AsyncSection, Card, Field, Pager, Table } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { formatDateTime } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type { AuditLogDto, Paged } from "@/lib/types";

function formatIp(ip?: string | null) {
  if (!ip) return "—";
  return ip.replace(/^::ffff:/i, "");
}

function renderChangeText(oldStr?: string | null, newStr?: string | null) {
  if (!oldStr && !newStr) return null;

  try {
    const oldObj = oldStr ? JSON.parse(oldStr) : {};
    const newRaw = newStr ? JSON.parse(newStr) : {};
    
    const isWrapped = newRaw && typeof newRaw === "object" && "value" in newRaw;
    const newObj = isWrapped && typeof newRaw.value === "object" && newRaw.value !== null
      ? newRaw.value 
      : newRaw;
    const reason = isWrapped ? newRaw.reason : undefined;

    if (typeof oldObj !== "object" || oldObj === null || typeof newObj !== "object" || newObj === null) {
      throw new Error("Values are not objects");
    }

    const allKeys = Array.from(new Set([...Object.keys(oldObj), ...Object.keys(newObj)]));
    const changes = [];

    for (const key of allKeys) {
      const oldVal = oldObj[key];
      const newVal = newObj[key];
      
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changes.push(
          <div key={key}>
            <span style={{ textTransform: "capitalize" }}>{key}</span>:{" "}
            {oldVal !== undefined ? (
              <span className="muted" style={{ textDecoration: "line-through" }}>
                {typeof oldVal === "object" ? JSON.stringify(oldVal) : String(oldVal)}
              </span>
            ) : null}
            {oldVal !== undefined && newVal !== undefined ? " ➔ " : ""}
            {newVal !== undefined ? (
              <strong>
                {typeof newVal === "object" ? JSON.stringify(newVal) : String(newVal)}
              </strong>
            ) : null}
          </div>
        );
      }
    }

    if (changes.length === 0 && !reason) {
      return <span className="muted">No changes</span>;
    }

    return (
      <div>
        {changes}
        {reason && (
          <div className="muted" style={{ marginTop: 4 }}>
            <em>Lý do: {reason}</em>
          </div>
        )}
      </div>
    );
  } catch (e) {
    return (
      <>
        {oldStr && <div className="muted">Old: <code>{oldStr}</code></div>}
        {newStr && <div>New: <code>{newStr}</code></div>}
      </>
    );
  }
}

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
                      {renderChangeText(log.oldValue, log.newValue)}
                    </td>
                    <td className="small muted">{formatIp(log.ipAddress)}</td>
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
