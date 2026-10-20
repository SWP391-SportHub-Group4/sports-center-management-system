"use client";

import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { ReportAvatarButton } from "./ReportAvatarButton";
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
  const avatar = useApi(
    (signal) =>
      api.get<{ avatarUrl: string | null }>(`/api/avatars/${userId}`, {
        signal,
      }),
    [userId],
  );
  return (
    <span>
      <AvatarImage name={name} avatarUrl={avatar.data?.avatarUrl} size={size} />
      <ReportAvatarButton
        userId={userId}
        name={name}
        avatarUrl={avatar.data?.avatarUrl}
      />
    </span>
  );
}
