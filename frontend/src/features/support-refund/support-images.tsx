"use client";

import { useEffect, useState } from "react";
import { fetchBlob } from "@/lib/apiClient";
import styles from "./support-refund.module.css";

type Attachment = { attachmentId: string; fileName: string };

/** Thumbnails of ticket images; each is fetched with the Authorization header and opens full-size in a new tab. */
export function SupportImages({
  attachments,
  label = "Attached images",
}: {
  attachments?: Attachment[] | null;
  label?: string;
}) {
  if (!attachments?.length) return null;
  return (
    <ul className={styles.thumbs} aria-label={label}>
      {attachments.map((a) => (
        <li key={a.attachmentId}>
          <Thumb attachment={a} />
        </li>
      ))}
    </ul>
  );
}

function Thumb({ attachment }: { attachment: Attachment }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let revoked: string | null = null;
    let live = true;
    fetchBlob(`/api/support/attachments/${attachment.attachmentId}`)
      .then((blob) => {
        if (!live) return;
        revoked = URL.createObjectURL(blob);
        setUrl(revoked);
      })
      .catch(() => undefined);
    return () => {
      live = false;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [attachment.attachmentId]);
  if (!url) return <span className={styles.hint}>{attachment.fileName}</span>;
  return (
    <a href={url} target="_blank" rel="noreferrer" title={attachment.fileName}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={attachment.fileName} />
    </a>
  );
}
