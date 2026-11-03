"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { fetchBlob, ApiError } from "@/lib/apiClient";
import { useAuth } from "@/lib/auth";
import type { AuditLogDto } from "@/lib/types";
import styles from "./AuditAvatarImages.module.css";

export function isAvatarAuditEvent(row: AuditLogDto) {
  return (
    row.targetEntity === "UserProfile" &&
    [
      "UPDATE_AVATAR",
      "DELETE_AVATAR",
      "IMPORT_GOOGLE_AVATAR",
      "MANAGER_REMOVE_MEMBER_AVATAR",
    ].includes(row.action)
  );
}
type Snapshot = {
  avatarSnapshotId?: string;
  avatarSnapshotExpiresAtUtc?: string;
  hadAvatar?: boolean;
};
function snapshot(raw: string | null): Snapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const value = parsed?.value ?? parsed;
    if (!value || typeof value !== "object" || Array.isArray(value))
      return null;
    return value;
  } catch {
    return null;
  }
}
function Photo({
  label,
  data,
  empty,
}: {
  label: string;
  data: Snapshot | null;
  empty: boolean;
}) {
  const [url, setUrl] = useState("");
  const [state, setState] = useState("loading");
  const [attempt, setAttempt] = useState(0);
  const id = data?.avatarSnapshotId;
  const noPhoto = empty || data?.hadAvatar === false;
  const validId =
    !!id &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id);
  useEffect(() => {
    if (noPhoto || !validId) return;
    let active = true;
    let objectUrl = "";
    const abort = new AbortController();
    void fetchBlob(`/api/admin/audit-avatar-images/${id}`, {
      signal: abort.signal,
    })
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
        setState("ready");
      })
      .catch((error: unknown) => {
        if (active)
          setState(
            error instanceof ApiError && [404, 410].includes(error.status)
              ? "unavailable"
              : "error",
          );
      });
    return () => {
      active = false;
      abort.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, validId, noPhoto, attempt]);
  return (
    <figure className={styles.photo}>
      <figcaption>{label}</figcaption>
      <div className={styles.frame}>
        {noPhoto ? (
          <p>No profile photo</p>
        ) : !validId || state === "unavailable" ? (
          <p>Image no longer available</p>
        ) : state === "error" ? (
          <div role="alert">
            <p>Image unavailable</p>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() => {
                setState("loading");
                setAttempt((n) => n + 1);
              }}
            >
              Retry
            </button>
          </div>
        ) : url ? (
          <Image
            unoptimized
            src={url}
            alt={`${label} profile photo recorded for this event`}
            width={480}
            height={320}
            onError={() => setState("unavailable")}
          />
        ) : (
          <p role="status">Loading image…</p>
        )}
      </div>
      {url && state === "ready" && (
        <a href={url} target="_blank" rel="noopener noreferrer">
          Open image
        </a>
      )}
    </figure>
  );
}
export function AuditAvatarImages({ row }: { row: AuditLogDto }) {
  const { user } = useAuth();
  if (user?.role !== "SystemAdministrator" || !isAvatarAuditEvent(row))
    return null;
  const before = snapshot(row.oldValue),
    after = snapshot(row.newValue);
  const removed = ["DELETE_AVATAR", "MANAGER_REMOVE_MEMBER_AVATAR"].includes(
    row.action,
  );
  return (
    <section className={styles.section} aria-label="Recorded profile photos">
      <h3>Profile photo history</h3>
      <p>
        Images are available to administrators for 30 days after this event.
        Earlier events may not include images.
      </p>
      <div className={styles.grid}>
        <Photo
          key={`${row.auditId}-before`}
          label="Before"
          data={before}
          empty={row.action === "IMPORT_GOOGLE_AVATAR"}
        />
        <Photo
          key={`${row.auditId}-after`}
          label="After"
          data={after}
          empty={removed}
        />
      </div>
    </section>
  );
}
