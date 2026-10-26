"use client";
import { useState } from "react";
import Image from "next/image";
import styles from "./avatar.module.css";
import { DEFAULT_AVATAR } from "@/lib/avatar";
import { useUserAvatar } from "@/lib/user-avatar";

export function AvatarImage({
  name,
  userId,
  avatarUrl,
  size = 40,
  className = "",
}: {
  name: string;
  userId?: string;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const resolvedUrl = useUserAvatar(userId, avatarUrl);
  return (
    <span
      className={`${styles.avatar} ${className}`}
      style={{ width: size, height: size }}
      aria-label={name}
    >
      {resolvedUrl && resolvedUrl !== failedUrl ? (
        <Image
          src={resolvedUrl}
          alt=""
          width={size}
          height={size}
          unoptimized
          onError={() => setFailedUrl(resolvedUrl)}
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
