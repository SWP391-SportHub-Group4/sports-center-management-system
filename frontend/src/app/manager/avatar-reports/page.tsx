"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AvatarImage } from "@/components/AvatarImage";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { useLanguage } from "@/lib/language";

type Report = {
  reportId: string;
  targetUserId: string;
  targetName: string;
  reporterName: string;
  avatarUrl: string;
  reason: string;
  status: string;
  createdAt: string;
};

export default function AvatarReportsPage() {
  const { language } = useLanguage();
  const vi = language === "vi";
  const reports = useApi(
    (signal) => api.get<Report[]>("/api/manager/avatar-reports", { signal }),
    [],
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  async function review(id: string, action: "remove" | "dismiss") {
    if (busy) return;
    setBusy(id);
    setError("");
    try {
      await api.post(`/api/manager/avatar-reports/${id}/${action}`);
      reports.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  }
  return (
    <AppShell
      title={vi ? "Báo cáo ảnh đại diện" : "Avatar reports"}
      allow={["CenterManager"]}
    >
      <div className="stack">
        <p>
          {vi
            ? "Xem báo cáo từ người dùng và gỡ ảnh không phù hợp. Ảnh đã được thay sau báo cáo sẽ không bị gỡ nhầm."
            : "Review user reports and remove inappropriate photos. Replaced photos cannot be removed through an old report."}
        </p>
        {error && <p role="alert">{error}</p>}
        {reports.error && <p role="alert">{reports.error.message}</p>}
        {!reports.data && !reports.error && (
          <p>{vi ? "Đang tải…" : "Loading…"}</p>
        )}
        {reports.data?.length === 0 && (
          <p>{vi ? "Chưa có báo cáo đang chờ." : "No pending reports."}</p>
        )}
        {reports.data?.map((row) => (
          <article key={row.reportId} className="card stack">
            <div className="row">
              <AvatarImage
                name={row.targetName}
                avatarUrl={row.avatarUrl}
                size={64}
              />
              <strong>{row.targetName}</strong>
            </div>
            <p>
              {vi ? "Người báo cáo" : "Reported by"}: {row.reporterName}
            </p>
            <p>{row.reason}</p>
            <time dateTime={row.createdAt}>
              {new Date(row.createdAt).toLocaleString(vi ? "vi-VN" : "en-GB")}
            </time>
            <div className="row">
              <button
                className="btn"
                type="button"
                disabled={Boolean(busy)}
                onClick={() => review(row.reportId, "remove")}
              >
                {vi ? "Gỡ ảnh" : "Remove photo"}
              </button>
              <button
                className="btn btn--secondary"
                type="button"
                disabled={Boolean(busy)}
                onClick={() => review(row.reportId, "dismiss")}
              >
                {vi ? "Bỏ qua" : "Dismiss"}
              </button>
            </div>
          </article>
        ))}
      </div>
    </AppShell>
  );
}
