"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Dialog } from "@/components/ui";
import { fetchBlob } from "@/lib/apiClient";
import styles from "./support.module.css";

type Attachment = { attachmentId: string; fileName: string };

/** Load protected attachments once and reuse the blob URL for the image preview. */
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
  const [previewOpen, setPreviewOpen] = useState(false);
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
  if (!url)
    return (
      <span className={styles.attachmentLoading}>{attachment.fileName}</span>
    );
  return (
    <>
      <button
        type="button"
        className={styles.attachmentButton}
        onClick={() => setPreviewOpen(true)}
        aria-label={`View image: ${attachment.fileName}`}
        aria-haspopup="dialog"
        title={attachment.fileName}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={attachment.fileName} />
      </button>
      {previewOpen &&
        createPortal(
          <Dialog
            title={attachment.fileName}
            onClose={() => setPreviewOpen(false)}
            size="lg"
            className={styles.attachmentDialog}
            closeIconOnly
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={styles.attachmentPreview}
              src={url}
              alt={attachment.fileName}
            />
          </Dialog>,
          document.body,
        )}
    </>
  );
}
