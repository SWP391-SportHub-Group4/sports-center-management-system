"use client";

import Image from "./HomepageImage";
import styles from "./training-photo-marquee.module.css";
import { useLandingCopy, useLandingValues } from "./landing-content-context";
import { homepageImageSpecs } from "./image-specs";
import { resolveSportGallery, sportGalleryTitle } from "./sport-gallery";
import { useSportGallery } from "./use-sport-gallery";

export function TrainingPhotoMarquee({ language }: { language: "en" | "vi" }) {
  const state = useSportGallery();
  const values = useLandingValues();
  const gallery = useLandingCopy("gallery", { title: sportGalleryTitle });
  const photos = resolveSportGallery(state.sports ?? [], values);
  // Fill one full viewport even when the catalog contains only one sport.
  const repeats = photos.length ? Math.max(1, Math.ceil(6 / photos.length)) : 1;
  return (
    <section
      className={styles.section}
      aria-labelledby="training-gallery-title"
    >
      <header className={styles.heading}>
        <h2 id="training-gallery-title">{gallery.title}</h2>
      </header>
      {state.error && (
        <p role="status">
          Could not refresh sports.{" "}
          <button type="button" className={styles.retry} onClick={state.reload}>
            Retry
          </button>
        </p>
      )}
      {!state.sports && !state.error && <p role="status">Loading sports...</p>}
      {state.sports && !photos.length && (
        <p>Sports will appear here once they are created.</p>
      )}
      {photos.length > 0 && (
        <div
          className={styles.viewport}
          tabIndex={0}
          role="region"
          aria-label={language === "vi" ? "Gallery" : "Sport photo gallery"}
        >
          <div className={styles.track}>
            {[0, 1].map((copy) => (
              <div
                className={styles.group}
                key={copy}
                aria-hidden={copy === 1 ? true : undefined}
              >
                {Array.from({ length: repeats }, (_, repeat) =>
                  photos.map((photo) => (
                    <figure
                      className={styles.photo}
                      key={repeat + "-" + photo.sportId}
                      data-sport-id={photo.sportId}
                      data-repeat={repeat > 0 || undefined}
                      aria-hidden={repeat > 0 ? true : undefined}
                    >
                      <div
                        className={styles.imageFrame}
                        style={{
                          aspectRatio: homepageImageSpecs.landscape.ratio,
                        }}
                      >
                        <Image
                          src={photo.src}
                          alt=""
                          fill
                          sizes="(max-width: 767px) 250px, (max-width: 1199px) 31vw, 360px"
                        />
                      </div>
                      <figcaption>{photo.name}</figcaption>
                    </figure>
                  )),
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
