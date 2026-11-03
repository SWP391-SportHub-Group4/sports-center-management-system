"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Plus, Trash2 } from "lucide-react";
import { Dialog } from "@/components/ui";
import { api } from "@/lib/apiClient";
import {
  HERO_PLAYLIST,
  heroPlaylist,
  originalHeroBackground,
  type HeroVideo,
} from "@/components/homepage/hero-background";
import { validLandingImage } from "@/components/homepage/landing-content-context";
import { MediaHomepagePreview } from "./media-homepage-preview";
import styles from "./media-hero-videos.module.css";

type SelectedVideo = HeroVideo & { id: string; file?: File };

async function inspectVideo(
  file: File,
  urls: Set<string>,
): Promise<SelectedVideo> {
  if (!/\.webm$/i.test(file.name) || (file.type && file.type !== "video/webm"))
    throw new Error(
      "Choose a WebM video. MP4 and other formats are not supported.",
    );
  if (!file.size || file.size > 25 * 1024 * 1024)
    throw new Error(
      "Each WebM video must be no larger than 25 MB. There is no duration limit.",
    );
  const header = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (header.join(",") !== "26,69,223,163")
    throw new Error("This file is not a valid WebM video.");
  const url = URL.createObjectURL(file);
  urls.add(url);
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        cleanup();
        reject(new Error("Could not read this video. Try another WebM file."));
      }, 20000);
      const cleanup = () => {
        clearTimeout(timer);
        video.onloadeddata = null;
        video.onerror = null;
      };
      video.onloadeddata = () => {
        cleanup();
        resolve();
      };
      video.onerror = () => {
        cleanup();
        reject(
          new Error(
            "This browser cannot play this WebM video. Try a VP8 or VP9 WebM file.",
          ),
        );
      };
      video.src = url;
    });
    if (!video.videoWidth || !video.videoHeight)
      throw new Error("Choose a WebM file containing a video track.");
    const canvas = document.createElement("canvas");
    canvas.width = Math.min(video.videoWidth, 1280);
    canvas.height = Math.round(
      (canvas.width * video.videoHeight) / video.videoWidth,
    );
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("Could not create the video preview. Try again.");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const poster = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(new Error("Could not create a preview image.")),
        "image/jpeg",
        0.85,
      ),
    );
    const posterUrl = URL.createObjectURL(poster);
    urls.add(posterUrl);
    return {
      id: crypto.randomUUID(),
      url,
      poster: posterUrl,
      name: file.name.slice(0, 120),
      file,
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    urls.delete(url);
    throw error;
  } finally {
    video.removeAttribute("src");
    video.load();
  }
}

export function MediaHeroVideos({
  values,
  onSave,
  onClose,
}: {
  values: Record<string, string>;
  onSave: (playlist: HeroVideo[], signal: AbortSignal) => Promise<void>;
  onClose: () => void;
}) {
  const [videos, setVideos] = useState<SelectedVideo[]>(() =>
    heroPlaylist(values).map((video) => ({
      ...video,
      id: crypto.randomUUID(),
    })),
  );
  const [mode, setMode] = useState<"original" | "custom">(() =>
    heroPlaylist(values).length ? "custom" : "original",
  );
  const [preparing, setPreparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  const gesture = useRef<{ from: number; over: number } | null>(null);
  const list = useRef<HTMLOListElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const urls = useRef(new Set<string>());
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const uploaded = useRef(new Map<string, HeroVideo>());
  useEffect(() => {
    mounted.current = true;
    const owned = urls.current;
    return () => {
      mounted.current = false;
      controller.current?.abort();
      owned.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);
  const previewValues = useMemo(() => {
    const next: Record<string, string> = {
      ...values,
      ...originalHeroBackground,
    };
    delete next[HERO_PLAYLIST];
    if (mode === "custom")
      next[HERO_PLAYLIST] = JSON.stringify(
        videos.map(({ url, poster, name }) => ({ url, poster, name })),
      );
    return next;
  }, [values, videos, mode]);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= videos.length || from === to) return;
    setMode("custom");
    setVideos((current) => {
      const next = [...current];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
    setAnnouncement(`Video moved to position ${to + 1}.`);
  };
  const close = () => {
    if (!busy && !preparing) onClose();
  };
  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    const abort = new AbortController();
    controller.current = abort;
    try {
      const saved: HeroVideo[] = [];
      if (mode === "custom") {
        for (const video of videos) {
          let result = uploaded.current.get(video.id);
          if (!result) {
            if (video.file) {
              const form = new FormData();
              form.append(
                "file",
                new File([video.file], video.file.name, { type: "video/webm" }),
              );
              const asset = await api.postForm<{
                url: string;
                posterUrl: string;
              }>("/api/manager/media/videos", form, { signal: abort.signal });
              if (
                !validLandingImage(asset.url) ||
                !/\.webm(?:\?|$)/i.test(asset.url) ||
                !validLandingImage(asset.posterUrl)
              )
                throw new Error(
                  "The server returned invalid video data. Try again.",
                );
              result = {
                url: asset.url,
                poster: asset.posterUrl,
                name: video.name,
              };
            } else
              result = {
                url: video.url,
                poster: video.poster,
                name: video.name,
              };
            uploaded.current.set(video.id, result);
          }
          saved.push(result);
        }
      }
      if (JSON.stringify(saved).length > 2000)
        throw new Error(
          "Video links are too long to save. Use shorter file names and try again.",
        );
      await onSave(saved, abort.signal);
    } catch (cause) {
      if (!abort.signal.aborted && mounted.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not save the videos. Your selection is still here. Try again.",
        );
    } finally {
      if (mounted.current) setBusy(false);
      controller.current = null;
    }
  };

  if (preview)
    return (
      <MediaHomepagePreview
        values={previewValues}
        onClose={() => {
          if (!busy) {
            onClose();
          }
        }}
        onSave={() => void save()}
        busy={busy}
        error={error}
      />
    );

  return (
    <Dialog
      title="Change hero video"
      description="Choose the original background or add up to 3 WebM videos. Your videos play in order, then repeat."
      size="lg"
      className={styles.dialog}
      onClose={close}
      footer={
        <div className={styles.footer}>
          <span className={styles.hint}>
            WebM · Up to 25 MB each · No duration limit
          </span>
          <div className={styles.actions}>
            <button
              type="button"
              className="btn btn--secondary"
              disabled={preparing}
              onClick={close}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn"
              disabled={preparing || (mode === "custom" && !videos.length)}
              onClick={() => {
                setError("");
                setPreview(true);
              }}
            >
              Preview landing page <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      }
    >
      <div className={styles.layout}>
        <section
          className={styles.original}
          aria-labelledby="original-video-heading"
        >
          <h3 id="original-video-heading">Default video</h3>
          <button
            type="button"
            className={styles.defaultCard}
            aria-pressed={mode === "original"}
            onClick={() => setMode("original")}
          >
            <video
              src={originalHeroBackground["hero.background.webm"]}
              poster={originalHeroBackground["hero.background.image"]}
              muted
              playsInline
              preload="none"
              aria-label="Original arena video"
            />
            <span className={styles.cardCaption}>
              SportHub arena{" "}
              {mode === "original" && <Check size={18} aria-hidden="true" />}
            </span>
          </button>
          <p className={styles.hint}>
            The original background is always available.
          </p>
        </section>
        <section
          className={styles.custom}
          aria-labelledby="custom-video-heading"
        >
          <div className={styles.heading}>
            <h3 id="custom-video-heading">Your videos</h3>
            <span>{videos.length}/3</span>
          </div>
          <p className={styles.hint}>
            Drag a video to reorder, or use the arrow buttons.
          </p>
          <ol
            ref={list}
            className={styles.queue}
            data-selected={mode === "custom" || undefined}
            aria-label="Video playback order"
          >
            {videos.map((video, index) => (
              <li
                key={video.id}
                data-video-id={video.id}
                onClick={() => setMode("custom")}
                data-dragging={drag?.from === index || undefined}
                data-drop-target={
                  (drag?.over === index && drag.from !== index) || undefined
                }
              >
                <div
                  className={styles.videoFrame}
                  role="group"
                  tabIndex={0}
                  aria-label={`Reorder ${video.name}`}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (
                      [
                        "ArrowLeft",
                        "ArrowUp",
                        "ArrowRight",
                        "ArrowDown",
                      ].includes(event.key)
                    ) {
                      event.preventDefault();
                      move(
                        index,
                        index +
                          (["ArrowLeft", "ArrowUp"].includes(event.key)
                            ? -1
                            : 1),
                      );
                    }
                  }}
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    const bounds = event.currentTarget.getBoundingClientRect();
                    if (event.clientY > bounds.bottom - 48) return;
                    event.preventDefault();
                    setMode("custom");
                    event.currentTarget.focus({ preventScroll: true });
                    event.currentTarget.setPointerCapture(event.pointerId);
                    gesture.current = { from: index, over: index };
                    setDrag(gesture.current);
                  }}
                  onPointerMove={(event) => {
                    if (!gesture.current) return;
                    const slots = Array.from(
                      list.current?.querySelectorAll<HTMLElement>("li") ?? [],
                    );
                    const over = slots.findIndex((slot) => {
                      const rect = slot.getBoundingClientRect();
                      return (
                        event.clientX >= rect.left &&
                        event.clientX <= rect.right &&
                        event.clientY >= rect.top &&
                        event.clientY <= rect.bottom
                      );
                    });
                    if (over >= 0) {
                      gesture.current.over = over;
                      setDrag({ ...gesture.current });
                    }
                  }}
                  onPointerUp={(event) => {
                    if (gesture.current)
                      move(gesture.current.from, gesture.current.over);
                    gesture.current = null;
                    setDrag(null);
                    if (event.currentTarget.hasPointerCapture(event.pointerId))
                      event.currentTarget.releasePointerCapture(
                        event.pointerId,
                      );
                  }}
                  onPointerCancel={() => {
                    gesture.current = null;
                    setDrag(null);
                  }}
                >
                  <video
                    src={video.url}
                    poster={video.poster}
                    muted
                    playsInline
                    preload="metadata"
                    controls
                    aria-label={`Preview ${video.name}`}
                  />
                </div>
                <div className={styles.itemCaption}>
                  <span className={styles.position}>{index + 1}</span>
                  <span className={styles.filename} title={video.name}>
                    {video.name}
                  </span>
                  <button
                    type="button"
                    className={styles.iconButton}
                    aria-label={`Remove ${video.name}`}
                    onClick={() => {
                      setVideos((current) =>
                        current.filter((entry) => entry.id !== video.id),
                      );
                      if (videos.length === 1) setMode("original");
                    }}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
                <div className={styles.reorder}>
                  <button
                    type="button"
                    className={styles.iconButton}
                    disabled={index === 0}
                    aria-label={`Move ${video.name} earlier`}
                    onClick={() => move(index, index - 1)}
                  >
                    <ArrowLeft size={16} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={styles.iconButton}
                    disabled={index === videos.length - 1}
                    aria-label={`Move ${video.name} later`}
                    onClick={() => move(index, index + 1)}
                  >
                    <ArrowRight size={16} aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
            {videos.length < 3 && (
              <li className={styles.addSlot}>
                <button
                  type="button"
                  className={styles.add}
                  disabled={preparing}
                  onClick={() => input.current?.click()}
                >
                  <Plus size={28} aria-hidden="true" />
                  <span>
                    {preparing ? "Opening videos…" : "Add WebM video"}
                  </span>
                </button>
              </li>
            )}
          </ol>
        </section>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <p className={styles.srOnly} role="status">
        {announcement || (preparing ? "Opening videos…" : "")}
      </p>
      <input
        ref={input}
        type="file"
        hidden
        multiple
        accept="video/webm,.webm"
        aria-label="Choose hero videos"
        onChange={async (event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
          if (!files.length || preparing) return;
          if (videos.length + files.length > 3) {
            setError(
              "You can add up to 3 videos. Remove a video before adding another.",
            );
            return;
          }
          setPreparing(true);
          setError("");
          const additions: SelectedVideo[] = [];
          try {
            for (const file of files)
              additions.push(await inspectVideo(file, urls.current));
            if (mounted.current) {
              setVideos((current) => [...current, ...additions]);
              setMode("custom");
            }
          } catch (cause) {
            if (mounted.current)
              setError(
                cause instanceof Error
                  ? cause.message
                  : "Could not open this video.",
              );
          } finally {
            if (mounted.current) setPreparing(false);
          }
        }}
      />
    </Dialog>
  );
}
