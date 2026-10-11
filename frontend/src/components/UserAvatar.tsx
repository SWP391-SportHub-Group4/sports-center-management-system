"use client";

import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { AvatarImage } from "./AvatarImage";
import { ReportAvatarButton } from "./ReportAvatarButton";

export function UserAvatar({
  userId,
  name,
  size = 40,
  report = false,
}: {
  userId: string;
  name: string;
  size?: number;
  report?: boolean;
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
      {report && (
        <ReportAvatarButton
          targetUserId={userId}
          avatarUrl={avatar.data?.avatarUrl}
        />
      )}
    </span>
  );
}
