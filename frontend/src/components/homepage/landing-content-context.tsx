"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api } from "@/lib/apiClient";

export type LandingDocument = {
  revision: string;
  values: Record<string, string>;
  updatedAt: string | null;
};
const ContentContext = createContext<Record<string, string>>({});

export function validLandingImage(value: string): boolean {
  if (value.startsWith("/sporthub/"))
    return (
      !value.includes("..") &&
      !value.includes("\\") &&
      !Array.from(value).some(
        (character) =>
          character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      )
    );
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function LandingContentProvider({
  children,
  preview,
}: {
  children: ReactNode;
  preview?: Record<string, string>;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    if (preview) return;
    const controller = new AbortController();
    api
      .get<LandingDocument>("/api/landing-page", {
        anonymous: true,
        signal: controller.signal,
      })
      .then((document) => {
        if (!controller.signal.aborted) setValues(document.values);
      })
      .catch(() => {
        /* Existing editorial content remains available if the API is offline. */
      });
    return () => controller.abort();
  }, [preview]);
  return (
    <ContentContext.Provider value={preview ?? values}>
      {children}
    </ContentContext.Provider>
  );
}

/** Only replaces existing text leaves; routing, counts and component structure stay in code. */
export function useLandingCopy<T>(section: string, defaults: T): T {
  const overrides = useContext(ContentContext);
  function visit(value: unknown, path: string): unknown {
    if (typeof value === "string") {
      const override = overrides[path];
      if (
        override !== undefined &&
        /\.(image|src)$/.test(path) &&
        !validLandingImage(override)
      )
        return value;
      return override ?? value;
    }
    if (Array.isArray(value))
      return value.map((item, index) => visit(item, `${path}.${index}`));
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          visit(item, `${path}.${key}`),
        ]),
      );
    return value;
  }
  return visit(defaults, section) as T;
}
