"use client";
import { useState } from "react";
import Image from "next/image";
import styles from "./avatar.module.css";

export function AvatarImage({
  name,
  avatarUrl,
  size = 40,
  className = "",
}: {
  name: string;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      className={`${styles.avatar} ${className}`}
      style={{ width: size, height: size }}
      aria-label={name}
    >
      {avatarUrl && avatarUrl !== failedUrl ? (
        <Image
          src={avatarUrl}
          alt=""
          width={size}
          height={size}
          unoptimized
          onError={() => setFailedUrl(avatarUrl)}
        />
      ) : (
        initial
      )}
    </span>
  );
}
