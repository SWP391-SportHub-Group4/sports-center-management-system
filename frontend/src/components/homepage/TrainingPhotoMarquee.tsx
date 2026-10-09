"use client";

import Image from "next/image";
import styles from "./training-photo-marquee.module.css";

type Language = "en" | "vi";

const photos = [
  {
    src: "/sporthub/court-volt/course-badminton.png",
    vi: "Cầu lông",
    en: "Badminton",
  },
  {
    src: "/sporthub/court-volt/course-basketball.png",
    vi: "Bóng rổ",
    en: "Basketball",
  },
  {
    src: "/sporthub/court-volt/program-gym.png",
    vi: "Gym",
    en: "Gym",
  },
  {
    src: "/sporthub/court-volt/conditioning-speed-track.png",
    vi: "Rèn thể lực",
    en: "Conditioning",
  },
];

export function TrainingPhotoMarquee({
  language,
}: {
  language: Language;
}) {
  const vi = language === "vi";

  return (
    <section
      className={styles.section}
      aria-labelledby="training-gallery-title"
    >
      <header className={styles.heading}>
        <h2 id="training-gallery-title">
          {vi ? "Năng lượng trên mọi sân tập" : "Energy across every court"}
        </h2>
      </header>

      <div className={styles.viewport}>
        <div className={styles.track}>
          {[0, 1].map((copy) => (
            <div
              className={styles.group}
              key={copy}
              aria-hidden={copy === 1 ? "true" : undefined}
            >
              {photos.map((photo) => (
                <figure className={styles.photo} key={photo.src}>
                  <div className={styles.imageFrame}>
                    <Image
                      src={photo.src}
                      alt=""
                      fill
                      sizes="(max-width: 767px) 250px, (max-width: 1199px) 31vw, 360px"
                    />
                  </div>
                  <figcaption>{vi ? photo.vi : photo.en}</figcaption>
                </figure>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
