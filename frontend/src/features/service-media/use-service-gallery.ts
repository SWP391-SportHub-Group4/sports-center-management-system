"use client";

import { api } from "@/lib/apiClient";
import { useEffect } from "react";
import { useApi } from "@/lib/useApi";
import type { ServiceGallery, ServiceImageKind } from "./types";

/** One request per catalog, rather than one request per card. useApi cancels obsolete reads. */
export function useServiceGalleries(
  kind: ServiceImageKind,
  ids: readonly number[],
) {
  return useGalleries(kind, ids, false);
}

export function useCoachClassGalleries(ids: readonly number[]) {
  return useGalleries("class", ids, true);
}

export function useCoachClassGallery(id: number | null | undefined) {
  const state = useCoachClassGalleries(id && id > 0 ? [id] : []);
  return {
    loading: state.loading,
    error: state.error,
    reload: state.reload,
    data: id ? (state.galleries.get(id) ?? null) : null,
  };
}

function useGalleries(
  kind: ServiceImageKind,
  ids: readonly number[],
  coach: boolean,
) {
  const key = [
    ...new Set(ids.filter((id) => Number.isSafeInteger(id) && id > 0)),
  ]
    .sort((a, b) => a - b)
    .join(",");
  const state = useApi(
    async (signal) => {
      if (!key) return [] as ServiceGallery[];
      const ids = key.split(",");
      const results = await Promise.all(
        Array.from({ length: Math.ceil(ids.length / 100) }, (_, index) =>
          api.get<{ items: ServiceGallery[] }>(
            coach ? "/api/coaches/me/class-images" : "/api/service-images",
            {
              signal,
              query: {
                ...(coach ? {} : { kind }),
                ids: ids.slice(index * 100, (index + 1) * 100).join(","),
              },
            },
          ),
        ),
      );
      return results.flatMap((result) =>
        Array.isArray(result?.items) ? result.items : [],
      );
    },
    [kind, key, coach],
  );
  useGalleryRefresh(kind, state.reload);
  return {
    ...state,
    galleries: new Map(
      (state.data ?? []).map((gallery) => [gallery.id, gallery]),
    ),
  };
}

function useGalleryRefresh(kind: ServiceImageKind, reload: () => void) {
  useEffect(() => {
    const changed = (event: Event) => {
      if ((event as CustomEvent<{ kind: string }>).detail?.kind === kind)
        reload();
    };
    window.addEventListener("sporthub:service-images-changed", changed);
    const focused = () => reload();
    window.addEventListener("focus", focused);
    return () => {
      window.removeEventListener("sporthub:service-images-changed", changed);
      window.removeEventListener("focus", focused);
    };
  }, [kind, reload]);
}

export function useServiceGallery(
  kind: ServiceImageKind,
  id: number | null | undefined,
) {
  const state = useApi(
    (signal) =>
      id && id > 0
        ? api.get<ServiceGallery>(`/api/service-images/${kind}/${id}`, {
            signal,
          })
        : Promise.resolve(null),
    [kind, id],
  );
  useGalleryRefresh(kind, state.reload);
  return state;
}
