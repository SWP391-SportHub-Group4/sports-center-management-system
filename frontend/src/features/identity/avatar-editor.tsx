"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ImagePlus, Minus, Plus, RotateCcw, X } from "lucide-react";
import { api } from "@/lib/apiClient";
import { useLanguage } from "@/lib/language";
import { AvatarImage } from "@/components/AvatarImage";
import { homepageImageSpecs } from "@/components/homepage/image-specs";
import styles from "./avatar-editor.module.css";

const PREVIEW = 320;
type Position = { x: number; y: number };

function clampPosition(
  image: HTMLImageElement,
  zoom: number,
  offset: Position,
): Position {
  const base = Math.max(
    PREVIEW / image.naturalWidth,
    PREVIEW / image.naturalHeight,
  );
  const x = (image.naturalWidth * base * zoom - PREVIEW) / 2;
  const y = (image.naturalHeight * base * zoom - PREVIEW) / 2;
  return {
    x: Math.max(-x, Math.min(x, offset.x)),
    y: Math.max(-y, Math.min(y, offset.y)),
  };
}

function drawCrop(
  canvas: HTMLCanvasElement | null,
  image: HTMLImageElement,
  zoom: number,
  offset: Position,
  size = PREVIEW,
) {
  const context = canvas?.getContext("2d");
  if (!context) return;
  const base = Math.max(
    PREVIEW / image.naturalWidth,
    PREVIEW / image.naturalHeight,
  );
  const width = image.naturalWidth * base * zoom;
  const height = image.naturalHeight * base * zoom;
  const position = clampPosition(image, zoom, offset);
  const scale = size / PREVIEW;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.clearRect(0, 0, size, size);
  context.drawImage(
    image,
    ((PREVIEW - width) / 2 + position.x) * scale,
    ((PREVIEW - height) / 2 + position.y) * scale,
    width * scale,
    height * scale,
  );
}

function AvatarCropDialog({
  fileUrl,
  onClose,
}: {
  fileUrl: string;
  onClose: (saved: boolean) => void;
}) {
  const { language } = useLanguage();
  const vi = language === "vi";
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const image = useRef<HTMLImageElement | null>(null);
  const drag = useRef<{ x: number; y: number; origin: Position } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Position>({ x: 0, y: 0 });
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [closing, setClosing] = useState<boolean | null>(null);
  const closeCallback = useRef(onClose);
  useEffect(() => {
    closeCallback.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const node = dialog.current;
    const overflow = document.body.style.overflow;
    node?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      node?.close();
      document.body.style.overflow = overflow;
    };
  }, []);
  useEffect(() => {
    let active = true;
    const next = new Image();
    next.onload = () => {
      if (!active) return;
      image.current = next;
      drawCrop(canvas.current, next, 1, { x: 0, y: 0 });
      setReady(true);
    };
    next.onerror = () => {
      if (active)
        setError(
          vi
            ? "Không thể đọc ảnh này. Hãy chọn ảnh khác."
            : "Could not read this image. Choose another image.",
        );
    };
    next.src = fileUrl;
    return () => {
      active = false;
      image.current = null;
    };
  }, [fileUrl, vi]);
  useEffect(() => {
    if (image.current) drawCrop(canvas.current, image.current, zoom, offset);
  }, [zoom, offset]);
  useEffect(() => {
    if (closing === null) return;
    const timer = window.setTimeout(
      () => {
        dialog.current?.close();
        closeCallback.current(closing);
      },
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 160,
    );
    return () => window.clearTimeout(timer);
  }, [closing]);

  function move(next: Position) {
    if (image.current) setOffset(clampPosition(image.current, zoom, next));
  }
  function changeZoom(value: number) {
    setZoom(value);
    if (image.current) setOffset(clampPosition(image.current, value, offset));
  }
  async function save() {
    if (!image.current || !ready || busy || closing !== null) return;
    setBusy(true);
    setError("");
    try {
      const output = document.createElement("canvas");
      const resolution = Math.max(
        1,
        Math.min(
          homepageImageSpecs.coach.width,
          Math.floor(
            Math.min(image.current.naturalWidth, image.current.naturalHeight) /
              zoom,
          ),
        ),
      );
      output.width = output.height = resolution;
      drawCrop(output, image.current, zoom, offset, resolution);
      const blob = await new Promise<Blob | null>((resolve) =>
        output.toBlob(resolve, "image/jpeg", 0.95),
      );
      if (!blob)
        throw new Error(
          vi
            ? "Không thể xử lý ảnh. Hãy thử lại."
            : "Could not process image. Please try again.",
        );
      const form = new FormData();
      form.append("file", blob, "avatar.jpg");
      await api.postForm("/api/avatars/me", form);
      setClosing(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    }
  }
  const locked = busy || closing !== null;
  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      data-closing={closing !== null}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-hint`}
      aria-busy={busy}
      onCancel={(event) => {
        event.preventDefault();
        if (!locked) setClosing(false);
      }}
    >
      <header className={styles.header}>
        <h2 id={`${id}-title`}>
          {vi ? "Điều chỉnh ảnh đại diện" : "Adjust your avatar"}
        </h2>
        <button
          className={styles.iconButton}
          type="button"
          aria-label={vi ? "Đóng" : "Close"}
          disabled={locked}
          onClick={() => setClosing(false)}
        >
          <X size={20} />
        </button>
      </header>
      <div className={styles.body}>
        <p id={`${id}-hint`} className={styles.hint}>
          {vi
            ? "Kéo ảnh để căn vị trí. Dùng thanh zoom để chỉnh khung hình."
            : "Drag to reposition. Use the zoom slider to find your best fit."}
        </p>
        <div className={styles.cropStage}>
          <canvas
            ref={canvas}
            width={PREVIEW}
            height={PREVIEW}
            className={styles.preview}
            tabIndex={locked ? -1 : 0}
            role="img"
            aria-label={
              vi
                ? "Xem trước ảnh đại diện. Dùng phím mũi tên để di chuyển ảnh."
                : "Avatar preview. Use arrow keys to reposition the image."
            }
            onKeyDown={(event) => {
              if (
                locked ||
                !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                  event.key,
                )
              )
                return;
              event.preventDefault();
              const step = event.shiftKey ? 15 : 5;
              move({
                x:
                  offset.x +
                  (event.key === "ArrowLeft"
                    ? -step
                    : event.key === "ArrowRight"
                      ? step
                      : 0),
                y:
                  offset.y +
                  (event.key === "ArrowUp"
                    ? -step
                    : event.key === "ArrowDown"
                      ? step
                      : 0),
              });
            }}
            onPointerDown={(event) => {
              if (locked || !ready) return;
              event.currentTarget.focus();
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = {
                x: event.clientX,
                y: event.clientY,
                origin: offset,
              };
            }}
            onPointerMove={(event) => {
              if (!drag.current || locked) return;
              const scale =
                PREVIEW / event.currentTarget.getBoundingClientRect().width;
              move({
                x:
                  drag.current.origin.x +
                  (event.clientX - drag.current.x) * scale,
                y:
                  drag.current.origin.y +
                  (event.clientY - drag.current.y) * scale,
              });
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
          />
          <div className={styles.cropGuide} aria-hidden="true" />
          {!ready && !error && (
            <span className={styles.loading} role="status">
              {vi ? "Đang tải ảnh…" : "Loading image…"}
            </span>
          )}
        </div>
        <div className={styles.zoomHeader}>
          <label htmlFor={`${id}-zoom`}>{vi ? "Phóng to" : "Zoom"}</label>
          <output htmlFor={`${id}-zoom`}>{Math.round(zoom * 100)}%</output>
        </div>
        <div className={styles.zoomRow}>
          <Minus size={18} aria-hidden="true" />
          <input
            id={`${id}-zoom`}
            className={styles.slider}
            type="range"
            min="1"
            max="3"
            step="0.05"
            value={zoom}
            disabled={!ready || locked}
            onChange={(event) => changeZoom(Number(event.target.value))}
          />
          <Plus size={18} aria-hidden="true" />
        </div>
        <button
          className={styles.reset}
          type="button"
          disabled={!ready || locked}
          onClick={() => {
            setZoom(1);
            setOffset({ x: 0, y: 0 });
          }}
        >
          <RotateCcw size={15} />
          {vi ? "Đặt lại vị trí" : "Reset position"}
        </button>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
      </div>
      <footer className={styles.footer}>
        <button
          className="btn btn--secondary"
          type="button"
          disabled={locked}
          onClick={() => setClosing(false)}
        >
          {vi ? "Hủy" : "Cancel"}
        </button>
        <button
          className="btn"
          type="button"
          disabled={!ready || locked}
          onClick={save}
        >
          {busy
            ? vi
              ? "Đang lưu…"
              : "Saving…"
            : vi
              ? "Lưu ảnh"
              : "Save avatar"}
        </button>
      </footer>
    </dialog>
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
  const input = useRef<HTMLInputElement>(null);
  const browse = useRef<HTMLButtonElement>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  useEffect(() => {
    if (fileUrl) return () => URL.revokeObjectURL(fileUrl);
  }, [fileUrl]);
  async function changed() {
    try {
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }
  async function remove() {
    if (busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await api.del("/api/avatars/me");
      await changed();
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
        <AvatarImage name={name} avatarUrl={avatarUrl} size={72} />
        <div className={styles.tools}>
          <div className={styles.actions}>
            <button
              ref={browse}
              type="button"
              className={`btn btn--secondary ${styles.browse}`}
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              <ImagePlus size={17} aria-hidden="true" />
              Browse
            </button>
            {avatarUrl && (
              <button
                className={styles.remove}
                type="button"
                disabled={busy}
                onClick={remove}
              >
                {vi ? "Xóa ảnh" : "Remove avatar"}
              </button>
            )}
          </div>
          <p className={styles.hint}>
            {vi
              ? "JPG, PNG hoặc WebP. Tối đa 5 MB."
              : "JPG, PNG or WebP. Up to 5 MB."}
          </p>
          <input
            ref={input}
            type="file"
            hidden
            accept="image/jpeg,image/png,image/webp"
            aria-label={vi ? "Chọn ảnh đại diện" : "Choose avatar image"}
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              setSuccess("");
              if (
                !["image/jpeg", "image/png", "image/webp"].includes(
                  file.type,
                ) ||
                file.size > 5 * 1024 * 1024 ||
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
              setFileUrl(URL.createObjectURL(file));
            }}
          />
        </div>
      </div>
      {fileUrl && (
        <AvatarCropDialog
          fileUrl={fileUrl}
          onClose={async (saved) => {
            setFileUrl(null);
            browse.current?.focus();
            if (saved) {
              setSuccess(vi ? "Đã cập nhật ảnh đại diện." : "Avatar updated.");
              await changed();
            }
          }}
        />
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {success && <p role="status">{success}</p>}
    </div>
  );
}
