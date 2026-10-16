"use client";

import { useState } from "react";
import { api } from "@/lib/apiClient";
import type { MemberSupportRequestDto } from "@/lib/types";

export type SupportAssignee = { userId: string; name: string; email: string; role: string };

export function SupportRequestActions({ request, assignees, onChanged }: {
  request: MemberSupportRequestDto;
  assignees: SupportAssignee[];
  onChanged: () => void;
}) {
  const [assigneeId, setAssigneeId] = useState(request.assignedToUserId ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(path: string, body: Record<string, string>) {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/member-support-requests/${request.requestId}/${path}`, body);
      setNote("");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update this request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <p className="small muted">Assigned: {assignees.find(x => x.userId === request.assignedToUserId)?.name ?? "Unassigned"}</p>
      {request.progressNote && <p className="small">Latest update: {request.progressNote}</p>}
      {request.status !== "CLOSED" && <>
        <label>Assign to
          <select value={assigneeId} disabled={busy} onChange={e => setAssigneeId(e.target.value)}>
            <option value="">Choose staff</option>
            {assignees.map(x => <option key={x.userId} value={x.userId}>{x.name} ({x.role})</option>)}
          </select>
        </label>
        <button type="button" className="btn btn--secondary btn--sm" disabled={busy || !assigneeId}
          onClick={() => act("assign", { assigneeUserId: assigneeId })}>Assign / transfer</button>
        <label>Progress or resolution
          <textarea value={note} maxLength={1000} disabled={busy} onChange={e => setNote(e.target.value)} />
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn btn--secondary btn--sm"
            disabled={busy || !request.assignedToUserId || note.trim().length < 3}
            onClick={() => act("progress", { note: note.trim() })}>Update progress</button>
          <button type="button" className="btn btn--secondary btn--sm"
            disabled={busy || !request.assignedToUserId || note.trim().length < 3}
            onClick={() => act("close", { resolution: note.trim() })}>Close request</button>
        </div>
      </>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
