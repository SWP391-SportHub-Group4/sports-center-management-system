"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog, Field } from "@/components/ui";
import type { HomepageImageSpec } from "@/components/homepage/image-specs";
import styles from "./media-editor.module.css";

function draw(
  canvas: HTMLCanvasElement,
  image: ImageBitmap,
  zoom: number,
  x: number,
  y: number,
) {
  const context = canvas.getContext("2d");
  if (!context)
    throw new Error("Image editing is not available in this browser.");
  const scale =
    Math.max(canvas.width / image.width, canvas.height / image.height) * zoom;
  const width = image.width * scale;
  const height = image.height * scale;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.fillStyle = "#e3efeb";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(
    image,
    ((canvas.width - width) * x) / 100,
    ((canvas.height - height) * y) / 100,
    width,
    height,
  );
}

export function MediaImageCropper({
  image,
  spec,
  onConfirm,
  onCancel,
}: {
  image: ImageBitmap;
  spec: HomepageImageSpec;
  onConfirm: (blob: Blob) => Promise<void>;
  onCancel: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(1);
  const [x, setX] = useState(50);
  const [y, setY] = useState(50);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ratio = spec.width / spec.height;
  const cropWidth = Math.min(image.width, image.height * ratio) / zoom;
  const outputWidth = Math.max(1, Math.floor(Math.min(spec.width, cropWidth)));
  const outputHeight = Math.max(1, Math.round(outputWidth / ratio));
  useEffect(() => {
    if (canvas.current) draw(canvas.current, image, zoom, x, y);
  }, [image, zoom, x, y]);
  return (
    <Dialog
      title="Frame your image"
      description={`${spec.label}. This crop matches the homepage. Position the subject before uploading.`}
      size="lg"
      onClose={() => {
        if (!busy) onCancel();
      }}
    >
      <div className={styles.cropLayout}>
        <div className={styles.cropPreview} style={{ aspectRatio: spec.ratio }}>
          <canvas
            ref={canvas}
            width={600}
            height={Math.round(600 / ratio)}
            aria-label="Image crop preview"
          />
        </div>
        <fieldset disabled={busy} className={styles.cropControls}>
          <legend className="sr-only">Crop position and zoom</legend>
          <Field label={`Horizontal position · ${x}%`}>
            <input
              type="range"
              min="0"
              max="100"
              value={x}
              onChange={(event) => setX(Number(event.target.value))}
            />
          </Field>
          <Field label={`Vertical position · ${y}%`}>
            <input
              type="range"
              min="0"
              max="100"
              value={y}
              onChange={(event) => setY(Number(event.target.value))}
            />
          </Field>
          <Field label={`Zoom · ${zoom.toFixed(2)}×`}>
            <input
              type="range"
              min="1"
              max="2"
              step="0.05"
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
            />
          </Field>
          <p className={styles.uploadHint}>
            Output: {outputWidth} × {outputHeight} px. Small images are never
            enlarged.
          </p>
          {outputWidth < Math.min(800, spec.width) && (
            <p className={styles.uploadError}>
              A larger original image will look sharper in this frame.
            </p>
          )}
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => {
              setZoom(1);
              setX(50);
              setY(50);
            }}
          >
            Reset crop
          </button>
          <div className={styles.actions}>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn"
              onClick={async () => {
                if (busy) return;
                setBusy(true);
                setError("");
                try {
                  const output = document.createElement("canvas");
                  output.width = outputWidth;
                  output.height = outputHeight;
                  draw(output, image, zoom, x, y);
                  const blob = await new Promise<Blob | null>((resolve) =>
                    output.toBlob(resolve, "image/jpeg", 0.95),
                  );
                  if (!blob) throw new Error("Could not crop this image.");
                  await onConfirm(blob);
                } catch (cause) {
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : "Could not upload this image.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Uploading…" : "Use crop & upload"}
            </button>
          </div>
        </fieldset>
      </div>
      {error && (
        <p role="alert" className={styles.uploadError}>
          {error}
        </p>
      )}
    </Dialog>
  );
}
