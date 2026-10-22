"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/apiClient";
import { useLanguage } from "@/lib/language";
import { AvatarImage } from "@/components/AvatarImage";
import styles from "./avatar-editor.module.css";
import { homepageImageSpecs } from "@/components/homepage/image-specs";

const MAX_BYTES = 5 * 1024 * 1024;
const PREVIEW = 240;
const OUTPUT = homepageImageSpecs.coach.width;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

function drawCrop(
  canvas: HTMLCanvasElement | null,
  source: HTMLImageElement | null,
  zoom: number,
  offset: { x: number; y: number },
  outputSize = PREVIEW,
) {
  const context = canvas?.getContext("2d");
  if (!context || !source) return;
  const base = Math.max(
    PREVIEW / source.naturalWidth,
    PREVIEW / source.naturalHeight,
  );
  const width = source.naturalWidth * base * zoom;
  const height = source.naturalHeight * base * zoom;
  const x = Math.max(
    PREVIEW - width,
    Math.min(0, (PREVIEW - width) / 2 + offset.x),
  );
  const y = Math.max(
    PREVIEW - height,
    Math.min(0, (PREVIEW - height) / 2 + offset.y),
  );
  const scale = outputSize / PREVIEW;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.clearRect(0, 0, outputSize, outputSize);
  context.drawImage(
    source,
    x * scale,
    y * scale,
    width * scale,
    height * scale,
  );
}

export function AvatarEditor({
  name,
  avatarUrl,
  onChanged,
}: {
  name: string;
  avatarUrl?: string | null;
  onChanged: () => Promise<void> | void;
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const image = useRef<HTMLImageElement | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(
    null,
  );

  useEffect(() => {
    if (!fileUrl) return;
    const next = new Image();
    next.onload = () => {
      image.current = next;
      drawCrop(canvas.current, next, zoom, offset);
    };
    next.onerror = () =>
      setError(vi ? "Không thể đọc ảnh này." : "Could not read this image.");
    next.src = fileUrl;
    return () => {
      image.current = null;
      URL.revokeObjectURL(fileUrl);
    };
    // The current position is redrawn by the zoom/drag effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileUrl]);

  useEffect(() => {
    drawCrop(canvas.current, image.current, zoom, offset);
  }, [zoom, offset]);

  async function save() {
    if (!image.current || !canvas.current || busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const output = document.createElement("canvas");
      const resolution = Math.max(
        1,
        Math.min(
          OUTPUT,
          Math.floor(
            Math.min(image.current.naturalWidth, image.current.naturalHeight) /
              zoom,
          ),
        ),
      );
      output.width = resolution;
      output.height = resolution;
      // Render from original pixels, never upscale the 240px editor preview.
      drawCrop(output, image.current, zoom, offset, resolution);
      const blob = await new Promise<Blob | null>((resolve) =>
        output.toBlob(resolve, "image/jpeg", 0.95),
      );
      if (!blob)
        throw new Error(
          vi ? "Không thể xử lý ảnh." : "Could not process image.",
        );
      const form = new FormData();
      form.append("file", blob, "avatar.jpg");
      await api.postForm("/api/avatars/me", form);
      setFileUrl(null);
      await onChanged();
      setSuccess(vi ? "Đã cập nhật ảnh đại diện." : "Avatar updated.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await api.del("/api/avatars/me");
      setFileUrl(null);
      await onChanged();
      setSuccess(vi ? "Đã xóa ảnh đại diện." : "Avatar removed.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.layout}>
      <div className={styles.pick}>
        <div className={styles.current}>
          <AvatarImage name={name} avatarUrl={avatarUrl} size={72} />
        </div>
        <label className={styles.tools}>
          <span>
            {vi
              ? "Chọn ảnh JPG, PNG hoặc WebP (tối đa 5 MB)"
              : "Choose a JPG, PNG or WebP image (up to 5 MB)"}
          </span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              if (
                !ALLOWED.includes(file.type) ||
                file.size > MAX_BYTES ||
                file.size === 0
              ) {
                setError(
                  vi
                    ? "Ảnh phải là JPG, PNG hoặc WebP và không quá 5 MB."
                    : "Use a JPG, PNG or WebP image up to 5 MB.",
                );
                return;
              }
              setError("");
              setSuccess("");
              setZoom(1);
              setOffset({ x: 0, y: 0 });
              setFileUrl(URL.createObjectURL(file));
            }}
          />
        </label>
      </div>
      {fileUrl && (
        <>
          <p>
            {vi
              ? "Kéo ảnh để căn trong khung vuông."
              : "Drag the image to position it in the square."}
          </p>
          <canvas
            ref={canvas}
            width={PREVIEW}
            height={PREVIEW}
            className={styles.preview}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = {
                x: event.clientX,
                y: event.clientY,
                ox: offset.x,
                oy: offset.y,
              };
            }}
            onPointerMove={(event) => {
              if (drag.current) {
                const scale =
                  PREVIEW / event.currentTarget.getBoundingClientRect().width;
                setOffset({
                  x: drag.current.ox + (event.clientX - drag.current.x) * scale,
                  y: drag.current.oy + (event.clientY - drag.current.y) * scale,
                });
              }
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
          />
          <label className={styles.tools}>
            {vi ? "Phóng to" : "Zoom"}
            <input
              type="range"
              min="1"
              max="3"
              step="0.05"
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
            />
          </label>
        </>
      )}
      <div className={styles.actions}>
        {fileUrl && (
          <button className="btn" type="button" disabled={busy} onClick={save}>
            {vi ? "Lưu ảnh" : "Save avatar"}
          </button>
        )}
        {avatarUrl && (
          <button
            className="btn btn--secondary"
            type="button"
            disabled={busy}
            onClick={remove}
          >
            {vi ? "Xóa ảnh" : "Remove avatar"}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {success && <p role="status">{success}</p>}
    </div>
  );
}
