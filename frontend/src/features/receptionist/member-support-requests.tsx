"use client";

import { useState } from "react";

import { api, ApiError } from "@/lib/apiClient";

import { useApi } from "@/lib/useApi";

import type { MemberSupportRequestDto } from "@/lib/types";

import { formatDateTime } from "@/lib/format";

export function MemberSupportRequests({ memberId }: { memberId: string }) {
  const requests = useApi(
    (signal) =>
      api.get<MemberSupportRequestDto[]>("/api/member-support-requests", {
        signal,
        query: {
          memberId,
        },
      }),
    [memberId],
  );

  const [category, setCategory] = useState("GENERAL");

  const [subject, setSubject] = useState("");

  const [description, setDescription] = useState("");

  const [busy, setBusy] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [success, setSuccess] = useState<string | null>(null);

  async function submit() {
    const trimmedSubject = subject.trim();

    const trimmedDescription = description.trim();

    if (trimmedSubject.length < 3 || trimmedDescription.length < 3) {
      setError("Subject and description must contain at least 3 characters.");

      return;
    }

    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      await api.post("/api/member-support-requests", {
        memberId,
        category,
        subject: trimmedSubject,
        description: trimmedDescription,
      });

      setSubject("");
      setDescription("");
      setCategory("GENERAL");

      setSuccess("Support request recorded successfully.");

      requests.reload();
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
      } else if (e instanceof Error) {
        setError(e.message);
      } else {
        setError("Unable to record support request.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="card"
      style={{
        marginTop: "16px",
        padding: "16px",
        display: "grid",
        gap: "14px",
      }}
      aria-label="Member support requests"
    >
      <div>
        <h3
          style={{
            marginTop: 0,
            marginBottom: "4px",
          }}
        >
          Member support
        </h3>

        <p className="small muted">
          Record a request reported by the selected member at the front desk.
        </p>
      </div>

      <label
        style={{
          display: "grid",
          gap: "6px",
        }}
      >
        <span>Category</span>

        <select
          value={category}
          disabled={busy}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="GENERAL">General</option>

          <option value="MEMBERSHIP">Membership</option>

          <option value="CLASS">Class</option>

          <option value="PAYMENT">Payment</option>

          <option value="OTHER">Other</option>
        </select>
      </label>

      <label
        style={{
          display: "grid",
          gap: "6px",
        }}
      >
        <span>Subject</span>

        <input
          value={subject}
          maxLength={200}
          disabled={busy}
          placeholder="Short summary"
          onChange={(e) => setSubject(e.target.value)}
        />
      </label>

      <label
        style={{
          display: "grid",
          gap: "6px",
        }}
      >
        <span>Description</span>

        <textarea
          rows={4}
          maxLength={2000}
          value={description}
          disabled={busy}
          placeholder="Describe the member's request"
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>

      {error && <p role="alert">{error}</p>}

      {success && <p role="status">{success}</p>}

      <div>
        <button
          type="button"
          className="btn"
          disabled={
            busy || subject.trim().length < 3 || description.trim().length < 3
          }
          onClick={submit}
        >
          {busy ? "Recording..." : "Record support request"}
        </button>
      </div>

      <div>
        <h4>Recent requests</h4>

        {requests.loading ? (
          <p className="small muted">Loading…</p>
        ) : requests.error ? (
          <p role="alert">{requests.error.message}</p>
        ) : !requests.data?.length ? (
          <p className="small muted">No support requests recorded.</p>
        ) : (
          <div
            style={{
              display: "grid",
              gap: "8px",
            }}
          >
            {requests.data.map((request) => (
              <article
                key={request.requestId}
                style={{
                  padding: "12px",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-md)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "12px",
                  }}
                >
                  <strong>{request.subject}</strong>

                  <span className="small">{request.status}</span>
                </div>

                <p className="small muted">
                  {request.category}
                  {" · "}
                  {formatDateTime(request.createdAt)}
                </p>

                <p>{request.description}</p>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
