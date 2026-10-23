"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CloudUpload, Trash2 } from "lucide-react";
import {
  MAX_SUPPORT_IMAGE_BYTES,
  MAX_SUPPORT_IMAGES,
  SUPPORT_IMAGE_TYPES,
} from "@/lib/bank-refund";
import styles from "./support-refund.module.css";

/** Picks up to 3 JPG/PNG/WebP images (5 MB each) with previews. The server re-checks type, size and count. */
export function SupportImagePicker({
  files,
  onChange,
  title,
  hint,
  required = false,
  disabled = false,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  title: string;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const previews = useMemo(
    () => files.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [files],
  );
  useEffect(
    () => () => previews.forEach((p) => URL.revokeObjectURL(p.url)),
    [previews],
  );

  function add(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    let message: string | null = null;
    for (const file of Array.from(list)) {
      if (!SUPPORT_IMAGE_TYPES.includes(file.type)) {
        message = "Only JPG, PNG or WebP images can be attached.";
        continue;
      }
      if (file.size > MAX_SUPPORT_IMAGE_BYTES) {
        message = "Each image must be 5 MB or smaller.";
        continue;
      }
      if (next.length >= MAX_SUPPORT_IMAGES) {
        message = `You can attach up to ${MAX_SUPPORT_IMAGES} images.`;
        break;
      }
      next.push(file);
    }
    setProblem(message);
    onChange(next);
    if (picker.current) picker.current.value = "";
  }

  return (
    <div className={styles.picker}>
      <span className={styles.pickerTitle}>
        {title}
        {required ? " *" : ""}
      </span>
      <span className={styles.hint}>
        {hint ??
          `Up to ${MAX_SUPPORT_IMAGES} images (.jpg, .png or .webp), 5 MB each.`}
      </span>
      <input
        ref={picker}
        type="file"
        accept={SUPPORT_IMAGE_TYPES.join(",")}
        multiple
        hidden
        onChange={(e) => add(e.target.files)}
      />
      <button
        type="button"
        className={styles.pickerButton}
        disabled={disabled || files.length >= MAX_SUPPORT_IMAGES}
        onClick={() => picker.current?.click()}
      >
        <CloudUpload size={18} aria-hidden="true" /> Choose images (
        {files.length}/{MAX_SUPPORT_IMAGES})
      </button>
      {problem && (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      )}
      {previews.length > 0 && (
        <ul className={styles.thumbs}>
          {previews.map((p, index) => (
            <li key={p.url}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.file.name} />
              <button
                type="button"
                aria-label={`Remove ${p.file.name}`}
                disabled={disabled}
                onClick={() => onChange(files.filter((_, i) => i !== index))}
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
