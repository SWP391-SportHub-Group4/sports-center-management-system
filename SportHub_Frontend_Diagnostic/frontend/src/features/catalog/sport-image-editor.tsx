"use client";

import Image from "next/image";
import { ImagePlus, FolderOpen, RotateCcw } from "lucide-react";
import {
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
  type PointerEvent,
} from "react";
import { ApiError } from "@/lib/apiClient";
import { useLanguage } from "@/lib/language";
import { Field } from "@/components/ui";
import styles from "./sport-image-editor.module.css";

export interface SportImageEditorHandle {
  exportImage: () => Promise<Blob | null>;
}
const clamp = (value: number) => Math.max(0, Math.min(100, value));
function draw(
  canvas: HTMLCanvasElement,
  image: ImageBitmap,
  zoom: number,
  x: number,
  y: number,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  const scale =
    Math.max(canvas.width / image.width, canvas.height / image.height) * zoom;
  const width = image.width * scale,
    height = image.height * scale;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  // JPEG has no alpha channel; use the same white matte in preview and export.
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(
    image,
    ((canvas.width - width) * x) / 100,
    ((canvas.height - height) * y) / 100,
    width,
    height,
  );
  return true;
}

export function SportImageEditor({
  ref,
  value,
  disabled,
  onPreparingChange,
}: {
  ref: Ref<SportImageEditorHandle>;
  value: string;
  disabled: boolean;
  onPreparingChange: (preparing: boolean) => void;
}) {
  const { t } = useLanguage();
  const c = t.managerCatalog;
  const help = useId();
  const canvas = useRef<HTMLCanvasElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const cached = useRef<{ key: string; image: ImageBitmap; blob: Blob } | null>(
    null,
  );
  const drag = useRef<{
    id: number;
    left: number;
    top: number;
    x: number;
    y: number;
    overflowX: number;
    overflowY: number;
  } | null>(null);
  const [image, setImage] = useState<ImageBitmap | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [x, setX] = useState(50);
  const [y, setY] = useState(50);
  const locked = disabled || preparing;
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  useEffect(() => () => image?.close(), [image]);
  useEffect(() => {
    if (canvas.current && image) draw(canvas.current, image, zoom, x, y);
  }, [image, zoom, x, y]);
  useImperativeHandle(
    ref,
    () => ({
      async exportImage() {
        if (!image) return null;
        const key = `${zoom}:${x}:${y}`;
        if (cached.current?.image === image && cached.current.key === key)
          return cached.current.blob;
        const output = document.createElement("canvas");
        const cropWidth = Math.min(image.width, image.height * 1.5) / zoom;
        output.width = Math.max(
          3,
          Math.floor(Math.min(1800, cropWidth) / 3) * 3,
        );
        output.height = output.width / 1.5;
        if (!draw(output, image, zoom, x, y))
          throw new ApiError(0, "image_crop_failed", c.imageOpenFailed);
        const blob = await new Promise<Blob | null>((resolve) =>
          output.toBlob(resolve, "image/jpeg", 0.94),
        );
        if (!blob)
          throw new ApiError(0, "image_crop_failed", c.imageOpenFailed);
        cached.current = { key, image, blob };
        return blob;
      },
    }),
    [image, zoom, x, y, c.imageOpenFailed],
  );
  function stop(event: PointerEvent<HTMLCanvasElement>) {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  return (
    <section className={styles.editor} aria-label={c.landingImage}>
      <div className={styles.header}>
        <div>
          <h3>{c.landingImage}</h3>
          <p>{c.imageHint}</p>
        </div>
        <button
          type="button"
          className="btn btn--secondary"
          disabled={locked}
          onClick={() => input.current?.click()}
        >
          <FolderOpen size={18} aria-hidden="true" />
          {c.browseImage}
        </button>
      </div>
      <input
        ref={input}
        hidden
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={locked}
        aria-label={c.landingImage}
        onChange={async (event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (!file || locked) return;
          setError("");
          if (
            !file.size ||
            file.size > 10 * 1024 * 1024 ||
            !["image/jpeg", "image/png", "image/webp"].includes(file.type)
          ) {
            setError(c.imageFileInvalid);
            return;
          }
          const version = ++generation.current;
          setPreparing(true);
          onPreparingChange(true);
          try {
            const next = await createImageBitmap(file);
            if (version !== generation.current) {
              next.close();
              return;
            }
            setImage(next);
            setName(file.name);
            setZoom(1);
            setX(50);
            setY(50);
          } catch {
            if (version === generation.current) setError(c.imageOpenFailed);
          } finally {
            if (version === generation.current) {
              setPreparing(false);
              onPreparingChange(false);
            }
          }
        }}
      />
      <div className={styles.frame} data-dragging={dragging || undefined}>
        {image ? (
          <canvas
            ref={canvas}
            width={900}
            height={600}
            tabIndex={0}
            aria-label={c.imagePreview}
            aria-describedby={help}
            aria-disabled={locked}
            onPointerDown={(event) => {
              if (locked || !event.isPrimary || event.button !== 0) return;
              const rect = event.currentTarget.getBoundingClientRect();
              const scale =
                Math.max(rect.width / image.width, rect.height / image.height) *
                zoom;
              drag.current = {
                id: event.pointerId,
                left: event.clientX,
                top: event.clientY,
                x,
                y,
                overflowX: image.width * scale - rect.width,
                overflowY: image.height * scale - rect.height,
              };
              event.currentTarget.setPointerCapture(event.pointerId);
              event.currentTarget.focus({ preventScroll: true });
              setDragging(true);
              event.preventDefault();
            }}
            onPointerMove={(event) => {
              const d = drag.current;
              if (!d || d.id !== event.pointerId || locked) return;
              if (d.overflowX > 0.5)
                setX(
                  clamp(d.x - ((event.clientX - d.left) * 100) / d.overflowX),
                );
              if (d.overflowY > 0.5)
                setY(
                  clamp(d.y - ((event.clientY - d.top) * 100) / d.overflowY),
                );
            }}
            onPointerUp={stop}
            onPointerCancel={stop}
            onLostPointerCapture={() => {
              drag.current = null;
              setDragging(false);
            }}
            onKeyDown={(event) => {
              if (locked) return;
              const step = event.shiftKey ? 10 : 2;
              if (event.key === "ArrowLeft") setX((v) => clamp(v + step));
              else if (event.key === "ArrowRight") setX((v) => clamp(v - step));
              else if (event.key === "ArrowUp") setY((v) => clamp(v + step));
              else if (event.key === "ArrowDown") setY((v) => clamp(v - step));
              else return;
              event.preventDefault();
            }}
          />
        ) : value ? (
          <Image
            src={value}
            alt={c.imagePreview}
            width={900}
            height={600}
            unoptimized
          />
        ) : (
          <div className={styles.empty}>
            <ImagePlus size={30} aria-hidden="true" />
            <span>{c.imageEmpty}</span>
          </div>
        )}
        {preparing && (
          <span className={styles.preparing} role="status">
            {c.imageLoading}
          </span>
        )}
      </div>
      {image && (
        <>
          <p id={help} className={styles.hint}>
            {c.imageDragHint}
          </p>
          <div className={styles.controls}>
            <Field label={`${c.imageZoom} · ${zoom.toFixed(2)}×`}>
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={zoom}
                disabled={locked}
                onChange={(event) => setZoom(Number(event.target.value))}
              />
            </Field>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={locked}
              onClick={() => {
                setZoom(1);
                setX(50);
                setY(50);
              }}
            >
              <RotateCcw size={16} aria-hidden="true" />
              {c.imageReset}
            </button>
          </div>
          <p className={styles.filename} title={name}>
            {name}
          </p>
        </>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </section>
  );
}
