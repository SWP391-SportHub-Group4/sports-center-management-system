"use client";

import { useState } from "react";
import styles from "./UserAvatar.module.css";

export function UserAvatar({
  name,
  src,
  className = "",
}: {
  name: string;
  src?: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(-2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "?";
  return (
    <span className={`${styles.avatar} ${className}`} aria-hidden="true">
      {src && failed !== src ? (
        // Cloudinary already returns a resized image; blob URLs are used for local previews.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" onError={() => setFailed(src)} />
      ) : (
        initials
      )}
    </span>
  );
}
