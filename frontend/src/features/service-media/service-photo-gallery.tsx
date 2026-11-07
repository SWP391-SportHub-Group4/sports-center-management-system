"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui";
import { galleryCover, type ServiceGallery } from "./types";
import { ServiceCover, type ServiceCoverProps } from "./service-cover";
import styles from "./service-media.module.css";

export interface ServicePhotoGalleryProps extends Omit<
  ServiceCoverProps,
  "gallery"
> {
  gallery?: ServiceGallery | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export function ServicePhotoGallery({
  gallery,
  loading,
  error,
  onRetry,
  ...coverProps
}: ServicePhotoGalleryProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const images = [...(gallery?.images ?? [])].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
  const selected =
    images.find((image) => image.imageId === selectedId) ??
    galleryCover(gallery);
  const displayed =
    gallery && selected
      ? { ...gallery, coverImageId: selected.imageId }
      : gallery;
  return (
    <div className={styles.gallery} aria-busy={loading || undefined}>
      {selected ? (
        <button
          type="button"
          className={styles.mainPhoto}
          onClick={() => setOpen(true)}
          aria-label={`Enlarge ${selected.altText || coverProps.alt}`}
        >
          <ServiceCover
            {...coverProps}
            gallery={displayed}
            sizes="(max-width: 800px) 100vw, 65vw"
          />
          <span className={styles.enlarge}>View photo</span>
        </button>
      ) : (
        <ServiceCover
          {...coverProps}
          gallery={gallery}
          sizes="(max-width: 800px) 100vw, 65vw"
        />
      )}
      {images.length > 1 && (
        <div
          className={styles.thumbnails}
          role="group"
          aria-label="Service photos"
        >
          {images.map((photo, index) => (
            <button
              key={photo.imageId}
              type="button"
              aria-label={`Show photo ${index + 1}${photo.altText ? `: ${photo.altText}` : ""}`}
              aria-pressed={selected?.imageId === photo.imageId}
              onClick={() => setSelectedId(photo.imageId)}
            >
              <ServiceCover
                {...coverProps}
                gallery={
                  gallery
                    ? {
                        ...gallery,
                        coverImageId: photo.imageId,
                        images: [photo],
                      }
                    : null
                }
                alt={photo.altText || coverProps.alt}
                sizes="140px"
              />
            </button>
          ))}
        </div>
      )}
      {error && (
        <p className={styles.photoError} role="status">
          Photos are temporarily unavailable.{" "}
          {onRetry && (
            <button type="button" onClick={onRetry}>
              Try again
            </button>
          )}
        </p>
      )}
      {open && selected && (
        <Dialog
          title={selected.altText || coverProps.alt}
          size="lg"
          onClose={() => setOpen(false)}
        >
          <div className={styles.fullPhoto}>
            <ServiceCover {...coverProps} gallery={displayed} sizes="90vw" />
          </div>
          <div className={styles.dialogControls}>
            <button
              type="button"
              className="btn btn--secondary"
              disabled={images.length < 2}
              onClick={() => {
                const current = images.findIndex(
                  (photo) => photo.imageId === selected.imageId,
                );
                setSelectedId(
                  images[(current - 1 + images.length) % images.length].imageId,
                );
              }}
            >
              Previous photo
            </button>
            <span>
              {images.findIndex((photo) => photo.imageId === selected.imageId) +
                1}{" "}
              / {images.length}
            </span>
            <button
              type="button"
              className="btn btn--secondary"
              disabled={images.length < 2}
              onClick={() => {
                const current = images.findIndex(
                  (photo) => photo.imageId === selected.imageId,
                );
                setSelectedId(images[(current + 1) % images.length].imageId);
              }}
            >
              Next photo
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
