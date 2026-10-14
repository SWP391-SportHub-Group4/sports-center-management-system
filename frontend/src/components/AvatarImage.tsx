"use client";

import { useState } from "react";
import styles from "./avatar.module.css";

function AvatarContent({
  avatarUrl,
  initial,
}: {
  avatarUrl?: string | null;
  initial: string;
}) {
  const [failed, setFailed] = useState(false);
  return avatarUrl && !failed ? (
    <img
      src={avatarUrl}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  ) : (
    initial
  );
}

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
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      className={`${styles.avatar} ${className}`}
      style={{ width: size, height: size }}
      aria-label={name}
    >
      <AvatarContent key={avatarUrl} avatarUrl={avatarUrl} initial={initial} />
    </span>
  );
}
