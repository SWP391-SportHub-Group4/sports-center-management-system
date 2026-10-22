"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@/components/ui";
import styles from "./media-editor.module.css";

export function MediaHomepagePreview({
  values,
  onClose,
}: {
  values: Record<string, string>;
  onClose: () => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (
        event.origin !== window.location.origin ||
        event.source !== frame.current?.contentWindow
      )
        return;
      if (event.data?.type === "sporthub:preview-ready") {
        frame.current?.contentWindow?.postMessage(
          { type: "sporthub:preview-values", values },
          window.location.origin,
        );
        setReady(true);
      }
      if (event.data?.type === "sporthub:preview-close") onClose();
      if (event.data?.type === "sporthub:preview-focus-close")
        frame.current
          ?.closest('[role="dialog"]')
          ?.querySelector<HTMLButtonElement>("button")
          ?.focus();
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [values, onClose]);
  return (
    <Dialog
      title="Homepage preview"
      description="Your draft images. Changes go live only after you save."
      className={styles.homepageDialog}
      size="lg"
      onClose={onClose}
    >
      {!ready && (
        <p className={styles.previewLoading} role="status">
          Loading preview...
        </p>
      )}
      <iframe
        ref={frame}
        src="/?media-preview=true"
        title="Draft homepage"
        tabIndex={0}
        className={styles.homepageFrame}
      />
    </Dialog>
  );
}
