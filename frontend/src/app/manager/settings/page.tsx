"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AsyncSection, Card, Feedback, Table } from "@/components/ui";
import { api } from "@/lib/apiClient";
import { formatDateTime } from "@/lib/format";
import { useAction, useApi } from "@/lib/useApi";
import type { SystemSettingDto } from "@/lib/types";

/**
 * Cấu hình toàn hệ thống — BR-39 (chỉ Quản lý Trung tâm).
 *
 * Quan trọng: thay đổi ở đây KHÔNG hồi tố. Hạn hủy đã được chụp vào từng đăng ký tại thời
 * điểm xác nhận (BR-50), nên đăng ký cũ vẫn giữ chính sách cũ.
 */
export default function SystemSettingsPage() {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const action = useAction();

  const settings = useApi(
    (signal) => api.get<SystemSettingDto[]>("/api/system-settings", { signal }),
    [],
  );

  const save = async (key: string) => {
    const done = await action.run(
      () => api.put(`/api/system-settings/${key}`, { value: drafts[key] }),
      "Configuration saved.",
    );

    if (done !== null) {
      setDrafts((current) => {
        const next = { ...current };
        delete next[key];

        return next;
      });
      settings.reload();
    }
  };

  return (
    <AppShell
      title="System Configuration"
      description="Performing parameters by the Decision Center Management (BR-39)"
      allow={["CenterManager"]}
    >
      <Card>
        <div className="alert alert--info">
          Change Configuration <strong>no prosecution</strong>: The cancel policy is recorded in individual registers as soon as the member is booked, so the existing subscriptions still apply the former value (BR-50).
        </div>
      </Card>

      <Card title="parameter" bodyless>
        <div style={{ padding: "0 18px" }}>
          <Feedback error={action.error} success={action.success} />
        </div>

        <AsyncSection
          state={settings}
          emptyMessage="No parameters have yet."
          isEmpty={(data) => data.length === 0}
        >
          {(data) => (
            <Table headers={["parameter", "Value", "Meaning", "Update", ""]}>
              {data.map((setting) => {
                const draft = drafts[setting.key];
                const dirty = draft !== undefined && draft !== setting.value;

                return (
                  <tr key={setting.key}>
                    <td>
                      <code className="small">{setting.key}</code>
                    </td>
                    <td style={{ width: 120 }}>
                      <input
                        value={draft ?? setting.value}
                        onChange={(event) =>
                          setDrafts({ ...drafts, [setting.key]: event.target.value })
                        }
                      />
                    </td>
                    <td className="small muted">{setting.description}</td>
                    <td className="nowrap small muted">{formatDateTime(setting.updatedAt)}</td>
                    <td className="right">
                      <button
                        type="button"
                        className="btn btn--sm"
                        disabled={!dirty || action.busy}
                        onClick={() => void save(setting.key)}
                      >
                        Sto
                      </button>
                    </td>
                  </tr>
                );
              })}
            </Table>
          )}
        </AsyncSection>
      </Card>
    </AppShell>
  );
}
