"use client";
import { useState } from "react";
import Image from "next/image";
import styles from "./avatar.module.css";
import { DEFAULT_AVATAR } from "@/lib/avatar";

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
        <Image
          src={DEFAULT_AVATAR}
          alt=""
          width={size}
          height={size}
          unoptimized
        />
      )}
    </span>
  );
}
