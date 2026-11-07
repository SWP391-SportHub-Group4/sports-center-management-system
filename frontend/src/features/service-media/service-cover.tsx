"use client";

import Image from "next/image";
import { useState } from "react";
import { galleryCover, type ServiceGallery } from "./types";
import styles from "./service-media.module.css";

export interface ServiceCoverProps {
  gallery?: ServiceGallery | null;
  sportImageUrl?: string | null;
  sportName?: string | null;
  kind?: "gym" | "class" | "court";
  alt: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
}

export function serviceArtwork(
  kind: ServiceCoverProps["kind"],
  sportName?: string | null,
) {
  if (kind === "gym") return "/sporthub/court-volt/program-gym.png";
  if (/basket|bóng rổ/i.test(sportName ?? ""))
    return "/sporthub/court-volt/course-basketball.png";
  if (/badminton|cầu lông/i.test(sportName ?? ""))
    return "/sporthub/court-volt/course-badminton.png";
  return "/sporthub/placeholders/sports-equipment.webp";
}

/** Failed URLs progressively fall back to sport media, then clearly identified category artwork. */
export function ServiceCover({
  gallery,
  sportImageUrl,
  sportName,
  kind = "class",
  alt,
  className = "",
  sizes = "(max-width: 640px) 100vw, (max-width: 1100px) 50vw, 33vw",
  priority = false,
}: ServiceCoverProps) {
  const cover = galleryCover(gallery);
  const [failed, setFailed] = useState<string[]>([]);
  const candidates = [
    cover?.url,
    sportImageUrl,
    serviceArtwork(kind, sportName),
  ].filter((url): url is string => !!url);
  const source = candidates.find((url) => !failed.includes(url));
  const actualPhoto = !!cover && source === cover.url;
  return (
    <div
      className={`${styles.cover} ${className}`}
      data-service-photo={actualPhoto ? "actual" : "category"}
    >
      {source && (
        <Image
          src={source}
          alt={
            actualPhoto
              ? cover.altText || alt
              : `${sportName || (kind === "gym" ? "Gym" : "Sports")} category image`
          }
          fill
          sizes={sizes}
          unoptimized={
            /^https?:\/\//.test(source) &&
            !source.startsWith("https://res.cloudinary.com/")
          }
          priority={priority}
          onError={() =>
            setFailed((previous) =>
              previous.includes(source) ? previous : [...previous, source],
            )
          }
        />
      )}
      {!actualPhoto && (
        <span className={styles.placeholder}>
          Category image · illustrative
        </span>
      )}
    </div>
  );
}
