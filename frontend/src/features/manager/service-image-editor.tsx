"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ImagePlus,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import { AsyncSection, Dialog, Feedback, Field } from "@/components/ui";
import { homepageImageSpecs } from "@/components/homepage/image-specs";
import { api, ApiError } from "@/lib/apiClient";
import { formatMoney } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import {
  ServiceCover,
  type ServiceGallery,
  type ServiceImage,
  type ServiceImageKind,
} from "@/features/service-media";
import { MediaImageCropper } from "./media-image-cropper";
import styles from "./service-image-editor.module.css";

export interface ServiceImageOwner {
  name: string;
  price?: number;
  description?: string | null;
  status?: string;
  backHref: string;
}

export function ServiceImageEditor({
  kind,
  id,
  owner,
}: {
  kind: ServiceImageKind;
  id: number;
  owner: ServiceImageOwner;
}) {
  const state = useApi(
    (signal) =>
      api.get<ServiceGallery>(`/api/manager/service-images/${kind}/${id}`, {
        signal,
      }),
    [kind, id],
  );
  return (
    <AsyncSection state={state}>
      {(gallery) => (
        <ImageDraft
          key={`${kind}:${id}:${gallery.version}`}
          kind={kind}
          id={id}
          owner={owner}
          initial={gallery}
          onReload={state.reload}
        />
      )}
    </AsyncSection>
  );
}

function ImageDraft({
  kind,
  id,
  owner,
  initial,
  onReload,
}: {
  kind: ServiceImageKind;
  id: number;
  owner: ServiceImageOwner;
  initial: ServiceGallery;
  onReload: () => void;
}) {
  const router = useRouter();
  const [baseline, setBaseline] = useState(initial);
  const [images, setImages] = useState(initial.images);
  const [coverId, setCoverId] = useState(initial.coverImageId);
  const [crop, setCrop] = useState<ImageBitmap | null>(null);
  const [cropName, setCropName] = useState("");
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [conflict, setConflict] = useState(false);
  const [preview, setPreview] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const staged = useRef(new Set<string>());
  const alive = useRef(true);
  const generation = useRef(0);
  const locked = busy || preparing;
  const endpoint = `/api/manager/service-images/${kind}/${id}`;
  const dirty =
    coverId !== baseline.coverImageId ||
    JSON.stringify(images) !== JSON.stringify(baseline.images);
  const gallery: ServiceGallery = {
    kind,
    id,
    version: baseline.version,
    coverImageId: coverId,
    images,
  };
  const imageKind =
    kind === "membership" ? "gym" : kind === "room" ? "court" : "class";

  useEffect(() => {
    alive.current = true;
    const pendingUploads = staged.current;
    return () => {
      alive.current = false;
      for (const imageId of pendingUploads)
        void api
          .del(`${endpoint}/${imageId}`, { keepalive: true })
          .catch(() => {});
    };
  }, [endpoint]);
  useEffect(() => () => crop?.close(), [crop]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function move(imageId: string, to: number) {
    if (locked) return;
    setImages((previous) => {
      const next = [...previous];
      const from = next.findIndex((image) => image.imageId === imageId);
      if (from < 0 || to < 0 || to >= next.length) return previous;
      next.splice(to, 0, next.splice(from, 1)[0]);
      return next.map((image, sortOrder) => ({ ...image, sortOrder }));
    });
    setSuccess("");
  }

  async function remove(image: ServiceImage) {
    if (locked) return;
    setError("");
    setSuccess("");
    if (staged.current.has(image.imageId)) {
      setBusy(true);
      try {
        await api.del(`${endpoint}/${image.imageId}`);
        staged.current.delete(image.imageId);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not remove this upload.",
        );
        return;
      } finally {
        setBusy(false);
      }
    }
    const remaining = images
      .filter((item) => item.imageId !== image.imageId)
      .map((item, sortOrder) => ({ ...item, sortOrder }));
    setImages(remaining);
    if (coverId === image.imageId) setCoverId(remaining[0]?.imageId ?? null);
  }

  async function save() {
    if (locked || !dirty) return;
    setBusy(true);
    setError("");
    setSuccess("");
    setConflict(false);
    try {
      const saved = await api.put<ServiceGallery>(endpoint, {
        version: baseline.version,
        imageIds: images.map((image) => image.imageId),
        coverImageId: images.length ? (coverId ?? images[0].imageId) : null,
        altTexts: Object.fromEntries(
          images.map((image) => [image.imageId, image.altText]),
        ),
      });
      setBaseline(saved);
      setImages(saved.images);
      setCoverId(saved.coverImageId);
      staged.current.clear();
      setSuccess("Images saved. Members can now see these photos.");
      window.dispatchEvent(
        new CustomEvent("sporthub:service-images-changed", {
          detail: { kind, id },
        }),
      );
    } catch (cause) {
      setConflict(cause instanceof ApiError && cause.isConflict);
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save these images. Your changes are still here.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    if (locked) return;
    setBusy(true);
    await Promise.allSettled(
      [...staged.current].map((imageId) => api.del(`${endpoint}/${imageId}`)),
    );
    staged.current.clear();
    router.push(owner.backHref);
  }

  const memberCard = (
    <article className={styles.memberCard}>
      <ServiceCover
        gallery={gallery}
        kind={imageKind}
        alt={owner.name}
        sizes="(max-width: 800px) 100vw, 360px"
      />
      <div>
        <h3>{owner.name}</h3>
        {owner.description && <p>{owner.description}</p>}
        {owner.price !== undefined && (
          <strong>{formatMoney(owner.price)}</strong>
        )}
        <span className={styles.previewAction}>
          {kind === "room"
            ? "View court"
            : kind === "membership"
              ? "View plan"
              : "View class"}
        </span>
      </div>
    </article>
  );

  return (
    <div className={styles.page}>
      <Link
        className={styles.back}
        href={owner.backHref}
        onClick={(event) => {
          if (dirty || staged.current.size) {
            event.preventDefault();
            setLeaving(true);
          }
        }}
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Back
      </Link>
      <header className={styles.heading}>
        <div>
          <h2>{owner.name}</h2>
          <p>1 cover image + up to 5 gallery photos</p>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className="btn btn--secondary"
            disabled={locked}
            onClick={() => setPreview(true)}
          >
            Preview
          </button>
          <button
            type="button"
            className="btn"
            disabled={locked || !dirty}
            onClick={() => void save()}
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </header>
      <Feedback error={error || null} success={success || null} />
      {conflict && (
        <p className={styles.conflict}>
          Another manager changed these images.{" "}
          <button
            type="button"
            className="btn btn--secondary"
            disabled={locked}
            onClick={onReload}
          >
            Reload latest images
          </button>
        </p>
      )}
      <div className={styles.columns}>
        <section
          className={styles.coverPanel}
          aria-labelledby="service-cover-title"
        >
          <header>
            <h3 id="service-cover-title">Cover image</h3>
            <button
              type="button"
              className="btn btn--secondary"
              disabled={locked || images.length >= 6}
              onClick={() => input.current?.click()}
            >
              <Upload size={16} aria-hidden="true" />
              Upload photos
            </button>
          </header>
          <ServiceCover
            gallery={gallery}
            kind={imageKind}
            alt={owner.name}
            sizes="(max-width: 900px) 100vw, 850px"
          />
          <p>
            {images.length
              ? "Choose a cover below. Drag a photo or use its arrow buttons to change the gallery order."
              : "Add photos of this service. Members will see the category image until you save a cover."}
          </p>
        </section>
        <aside className={styles.preview}>
          <h3>Member preview</h3>
          {memberCard}
          <p>Shown in Services and service details.</p>
        </aside>
      </div>
      <section
        className={styles.gallery}
        aria-labelledby="service-gallery-title"
      >
        <header>
          <h3 id="service-gallery-title">
            Gallery <span>{images.length} / 6 images</span>
          </h3>
          <p>JPG, PNG or WebP · Up to 10 MB per photo · Landscape 3:2</p>
        </header>
        <div className={styles.grid}>
          {images.map((image, index) => (
            <article
              key={image.imageId}
              className={styles.tile}
              draggable={!locked}
              onDragStart={(event) =>
                event.dataTransfer.setData("text/plain", image.imageId)
              }
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                move(event.dataTransfer.getData("text/plain"), index);
              }}
            >
              <button
                type="button"
                className={styles.photoButton}
                disabled={locked}
                aria-label={`Set photo ${index + 1} as cover`}
                aria-pressed={coverId === image.imageId}
                onClick={() => {
                  setCoverId(image.imageId);
                  setSuccess("");
                }}
              >
                <ServiceCover
                  gallery={{
                    ...gallery,
                    coverImageId: image.imageId,
                    images: [image],
                  }}
                  kind={imageKind}
                  alt={image.altText || owner.name}
                  sizes="(max-width: 600px) 50vw, 230px"
                />
                {coverId === image.imageId && (
                  <span className={styles.coverBadge}>
                    <Star size={12} aria-hidden="true" />
                    Cover
                  </span>
                )}
              </button>
              <Field label={`Photo ${index + 1} description`}>
                <input
                  maxLength={200}
                  value={image.altText}
                  disabled={locked}
                  onChange={(event) => {
                    const value = event.target.value;
                    setImages((previous) =>
                      previous.map((item) =>
                        item.imageId === image.imageId
                          ? { ...item, altText: value }
                          : item,
                      ),
                    );
                    setSuccess("");
                  }}
                />
              </Field>
              <div className={styles.tileActions}>
                <button
                  type="button"
                  className="btn btn--quiet"
                  aria-label={`Move photo ${index + 1} earlier`}
                  disabled={locked || index === 0}
                  onClick={() => move(image.imageId, index - 1)}
                >
                  <ArrowUp size={16} />
                </button>
                <button
                  type="button"
                  className="btn btn--quiet"
                  aria-label={`Move photo ${index + 1} later`}
                  disabled={locked || index === images.length - 1}
                  onClick={() => move(image.imageId, index + 1)}
                >
                  <ArrowDown size={16} />
                </button>
                <button
                  type="button"
                  className={`btn btn--quiet ${styles.remove}`}
                  aria-label={`Remove photo ${index + 1}`}
                  disabled={locked}
                  onClick={() => void remove(image)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))}
          {images.length < 6 && (
            <button
              type="button"
              className={styles.uploadTile}
              disabled={locked}
              onClick={() => input.current?.click()}
            >
              <ImagePlus size={28} aria-hidden="true" />
              <span>{preparing ? "Preparing image…" : "Upload photo"}</span>
            </button>
          )}
        </div>
      </section>
      <footer className={styles.saveBar}>
        <span role="status">
          {dirty ? "Changes not saved" : "All changes saved"}
        </span>
        <button
          type="button"
          className="btn"
          disabled={locked || !dirty}
          onClick={() => void save()}
        >
          {busy ? "Saving…" : "Save changes"}
        </button>
      </footer>
      <input
        className="sr-only"
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label="Upload service photo"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file || locked || images.length >= 6) return;
          setError("");
          setSuccess("");
          if (
            file.size > 10 * 1024 * 1024 ||
            !["image/jpeg", "image/png", "image/webp"].includes(file.type)
          ) {
            setError("Choose a JPG, PNG or WebP image no larger than 10 MB.");
            return;
          }
          setPreparing(true);
          const request = ++generation.current;
          try {
            const image = await createImageBitmap(file);
            if (!alive.current || request !== generation.current) {
              image.close();
              return;
            }
            if (
              image.width > 20000 ||
              image.height > 20000 ||
              image.width * image.height > 80_000_000
            ) {
              image.close();
              throw new Error(
                "Choose a smaller image to frame it comfortably.",
              );
            }
            setCropName(file.name.replace(/\.[^.]+$/, "").slice(0, 160));
            setCrop(image);
          } catch (cause) {
            if (alive.current)
              setError(
                cause instanceof Error
                  ? cause.message
                  : "Could not open this image.",
              );
          } finally {
            if (alive.current) setPreparing(false);
          }
        }}
      />
      {crop && (
        <MediaImageCropper
          image={crop}
          spec={homepageImageSpecs.landscape}
          description="Frame this service photo. Members see your new photos only after you save the gallery."
          onCancel={() => setCrop(null)}
          onConfirm={async (blob) => {
            setBusy(true);
            try {
              const body = new FormData();
              body.append("file", blob, "service-photo.jpg");
              body.append("altText", cropName || owner.name);
              const uploaded = await api.post<ServiceImage>(endpoint, body);
              if (!alive.current) {
                await api
                  .del(`${endpoint}/${uploaded.imageId}`, { keepalive: true })
                  .catch(() => {});
                return;
              }
              staged.current.add(uploaded.imageId);
              setImages((previous) => [
                ...previous,
                { ...uploaded, sortOrder: previous.length },
              ]);
              setCoverId((previous) => previous ?? uploaded.imageId);
              setCrop(null);
              setSuccess("");
            } finally {
              if (alive.current) setBusy(false);
            }
          }}
        />
      )}
      {preview && (
        <Dialog
          title="Member preview"
          size="lg"
          onClose={() => setPreview(false)}
        >
          {memberCard}
          <p className={styles.previewHint}>
            This preview includes your unsaved changes.
          </p>
        </Dialog>
      )}
      {leaving && (
        <Dialog
          title="Discard image changes?"
          onClose={() => {
            if (!busy) setLeaving(false);
          }}
          footer={
            <>
              <button
                type="button"
                className="btn btn--secondary"
                disabled={busy}
                onClick={() => setLeaving(false)}
              >
                Keep editing
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => void leave()}
              >
                Discard changes
              </button>
            </>
          }
        >
          <p>
            The saved gallery will stay as it is. New uploads will be discarded.
          </p>
        </Dialog>
      )}
    </div>
  );
}
