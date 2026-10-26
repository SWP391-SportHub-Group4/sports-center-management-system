"use client";

import { AvatarImage } from "./AvatarImage";

export function UserAvatar({
  userId,
  name,
  size = 40,
}: {
  userId: string;
  name: string;
  size?: number;
}) {
  return (
    <span>
      <AvatarImage userId={userId} name={name} size={size} />
    </span>
  );
}
