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
export function useLandingValues() {
  return useContext(ContentContext);
}

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
    // The popup uses the real public route, with draft data confined to this same-origin frame.
    if (
      window.parent !== window &&
      new URLSearchParams(window.location.search).get("media-preview") ===
        "true"
    ) {
      const origin = window.location.origin;
      const receive = (event: MessageEvent) => {
        if (
          event.origin !== origin ||
          event.source !== window.parent ||
          event.data?.type !== "sporthub:preview-values"
        )
          return;
        const incoming: unknown = event.data.values;
        if (
          !incoming ||
          typeof incoming !== "object" ||
          Array.isArray(incoming)
        )
          return;
        const entries = Object.entries(incoming);
        if (
          entries.length > 300 ||
          entries.some(
            ([key, value]) =>
              !/^(hero|gallery|bookmarks|arena|booking|faq)\.[a-zA-Z0-9_.]+$/.test(
                key,
              ) ||
              typeof value !== "string" ||
              value.length > 2000,
          )
        )
          return;
        setValues(Object.fromEntries(entries) as Record<string, string>);
      };
      const navigate = (event: MouseEvent) => {
        const element = event.target instanceof Element ? event.target : null;
        const link = element?.closest<HTMLAnchorElement>("a[href]");
        // Keep account actions and links from leaving the draft preview or changing a session.
        if (!link && !element?.closest('[data-account-action="logout"]'))
          return;
        event.preventDefault();
        event.stopPropagation();
        if (link) {
          const destination = new URL(link.href, origin);
          if (
            destination.origin === origin &&
            destination.pathname === "/" &&
            destination.hash
          ) {
            document
              .getElementById(destination.hash.slice(1))
              ?.scrollIntoView({ behavior: "smooth" });
          }
        }
      };
      const keyboard = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          window.parent.postMessage({ type: "sporthub:preview-close" }, origin);
        }
        if (event.key === "Tab") {
          const targets = [
            ...document.querySelectorAll<HTMLElement>(
              'button:not(:disabled),a[href],input:not(:disabled),[tabindex="0"]',
            ),
          ].filter(
            (element) =>
              element.getClientRects().length && !element.closest("[inert]"),
          );
          if (
            (event.shiftKey && document.activeElement === targets[0]) ||
            (!event.shiftKey && document.activeElement === targets.at(-1))
          ) {
            event.preventDefault();
            window.parent.postMessage(
              { type: "sporthub:preview-focus-close" },
              origin,
            );
          }
        }
      };
      window.addEventListener("message", receive);
      document.addEventListener("click", navigate, true);
      document.addEventListener("keydown", keyboard, true);
      window.parent.postMessage({ type: "sporthub:preview-ready" }, origin);
      return () => {
        window.removeEventListener("message", receive);
        document.removeEventListener("click", navigate, true);
        document.removeEventListener("keydown", keyboard, true);
      };
    }
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
      if (path.startsWith("bookmarks.0.items.")) return value;
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
