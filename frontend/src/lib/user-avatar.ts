"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { api, ApiError } from "./apiClient";

export type UserAvatarResponse = { userId: string; avatarUrl: string | null };
const photos = new Map<string, { url: string | null; checkedAt: number }>();
const listeners = new Map<string, Set<() => void>>();
const pending = new Map<string, Promise<void>>();
const versions = new Map<string, number>();
let epoch = 0;

export function publishUserAvatar({ userId, avatarUrl }: UserAvatarResponse) {
  if (!userId) return;
  versions.set(userId, (versions.get(userId) ?? 0) + 1);
  photos.set(userId, { url: avatarUrl, checkedAt: Date.now() });
  listeners.get(userId)?.forEach((listener) => listener());
}

export function clearUserAvatars() {
  epoch++;
  photos.clear();
  pending.clear();
  versions.clear();
  listeners.forEach((group) => group.forEach((listener) => listener()));
}

function load(userId: string, force = false) {
  const cached = photos.get(userId);
  if (
    pending.has(userId) ||
    (!force && cached && Date.now() - cached.checkedAt < 30_000)
  )
    return;
  const version = versions.get(userId) ?? 0;
  const requestEpoch = epoch;
  const current = () =>
    epoch === requestEpoch && (versions.get(userId) ?? 0) === version;
  const request = api
    .get<UserAvatarResponse>(`/api/avatars/${userId}`)
    .then((photo) => {
      if (current() && photo && !Array.isArray(photo) && "avatarUrl" in photo)
        publishUserAvatar({ userId, avatarUrl: photo.avatarUrl ?? null });
    })
    .catch((error: unknown) => {
      if (current() && error instanceof ApiError && error.status === 404)
        publishUserAvatar({ userId, avatarUrl: null });
    })
    .finally(() => {
      if (pending.get(userId) === request) pending.delete(userId);
    });
  pending.set(userId, request);
}

export function useUserAvatar(userId?: string, suppliedUrl?: string | null) {
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!userId) return () => {};
      const group = listeners.get(userId) ?? new Set<() => void>();
      group.add(listener);
      listeners.set(userId, group);
      return () => {
        group.delete(listener);
        if (!group.size) listeners.delete(userId);
      };
    },
    [userId],
  );
  const snapshot = useCallback(
    () =>
      userId && photos.has(userId)
        ? photos.get(userId)!.url
        : (suppliedUrl ?? null),
    [userId, suppliedUrl],
  );
  const serverSnapshot = useCallback(() => suppliedUrl ?? null, [suppliedUrl]);
  const url = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  useEffect(() => {
    if (!userId) return;
    const cached = photos.get(userId);
    load(
      userId,
      suppliedUrl !== undefined &&
        cached !== undefined &&
        suppliedUrl !== cached.url,
    );
    const refresh = () => load(userId, true);
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [userId, suppliedUrl]);
  return url;
}
