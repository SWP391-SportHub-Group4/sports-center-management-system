"use client";

import { useEffect, useState } from "react";
import { fetchBlob } from "@/lib/apiClient";
import styles from "./support.module.css";

type Attachment = { attachmentId: string; fileName: string };

/** Ảnh Member đính kèm khi tự gửi yêu cầu; tải qua Authorization header rồi mở ở tab mới. */
export function SupportAttachments({
  attachments,
}: {
  attachments?: Attachment[] | null;
}) {
  if (!attachments?.length) return null;
  return (
    <ul className={styles.attachments} aria-label="Attached images">
      {attachments.map((a) => (
        <li key={a.attachmentId}>
          <AttachmentThumb attachment={a} />
        </li>
      ))}
    </ul>
  );
}

function AttachmentThumb({ attachment }: { attachment: Attachment }) {
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
  if (!url) return <span className={styles.attachmentLoading}>{attachment.fileName}</span>;
  return (
    <a href={url} target="_blank" rel="noreferrer" title={attachment.fileName}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={attachment.fileName} />
    </a>
  );
}
