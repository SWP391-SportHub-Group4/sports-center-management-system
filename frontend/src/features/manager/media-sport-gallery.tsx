"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { useLandingValues } from "@/components/homepage/landing-content-context";
import { resolveSportGallery } from "@/components/homepage/sport-gallery";
import { useSportGallery } from "@/components/homepage/use-sport-gallery";
import type { MediaImageTarget } from "./media-landing-preview";
import styles from "./media-editor.module.css";

export function MediaSportGallery({
  title,
  renderImage,
}: {
  title: ReactNode;
  renderImage: (target: MediaImageTarget) => ReactNode;
}) {
  const state = useSportGallery();
  const values = useLandingValues();
  const photos = resolveSportGallery(state.sports ?? [], values);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState({ left: 0, max: 0 });
  const id = useId();
  const search = query
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
  const filtered = photos.filter((sport) =>
    sport.name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase()
      .includes(search),
  );
  const entriesKey = filtered.map((sport) => sport.sportId).join(",");
  const hasOverflow = scroll.max > 0;
  const measure = useCallback(() => {
    const node = strip.current;
    if (!node) return;
    const max = Math.max(0, node.scrollWidth - node.clientWidth);
    setScroll({
      left: Math.round(Math.min(max, Math.max(0, node.scrollLeft))),
      max,
    });
  }, []);
  useEffect(() => {
    const node = strip.current;
    if (!node) return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [entriesKey, hasOverflow, measure]);
  const move = (direction: number) =>
    strip.current?.scrollBy({
      left: direction * strip.current.clientWidth * 0.8,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => input.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);
  useEffect(() => {
    strip.current?.scrollTo({ left: 0 });
  }, [query]);
  const closeSearch = () => {
    setQuery("");
    setOpen(false);
    toggle.current?.focus();
  };
  return (
    <section
      id="media-gallery"
      className={styles.section}
      aria-labelledby="media-gallery-title"
    >
      <div className={styles.galleryHeading}>
        {title}
        <div
          className={styles.gallerySearch}
          data-open={open || undefined}
          onTransitionEnd={(event) => {
            if (
              event.target === event.currentTarget &&
              event.propertyName === "width" &&
              open &&
              document.activeElement === toggle.current
            )
              input.current?.focus();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              closeSearch();
            }
          }}
        >
          <div id={id} className={styles.gallerySearchField} inert={!open}>
            <input
              ref={input}
              type="search"
              aria-label="Search sports by name"
              placeholder="Search sports…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              tabIndex={open ? 0 : -1}
            />
          </div>
          <button
            ref={toggle}
            type="button"
            className={styles.gallerySearchToggle}
            aria-label={open ? "Close sport search" : "Search sports"}
            aria-expanded={open}
            aria-controls={id}
            onClick={() => (open ? closeSearch() : setOpen(true))}
          >
            {open ? (
              <X size={19} aria-hidden="true" />
            ) : (
              <Search size={19} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
      {!state.sports && !state.error && (
        <p className={styles.galleryMessage} role="status">
          Loading sports...
        </p>
      )}
      {state.error && (
        <div className={styles.galleryMessage} role="status">
          Could not refresh sports. Your image edits are still here.{" "}
          <button
            type="button"
            className="btn btn--secondary"
            onClick={state.reload}
          >
            Retry sports
          </button>
        </div>
      )}
      {state.sports && !photos.length && (
        <p className={styles.galleryMessage}>
          Create a sport in Services → Sports. It will appear here
          automatically.
        </p>
      )}
      {photos.length > 0 && !filtered.length && (
        <div className={styles.galleryMessage}>
          <p>No sports match “{query}”.</p>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => {
              setQuery("");
              input.current?.focus();
            }}
          >
            Clear search
          </button>
        </div>
      )}
      {filtered.length > 0 && (
        <div className={styles.galleryRail}>
          <div
            ref={strip}
            id={`${id}-strip`}
            className={styles.sportGalleryStrip}
            onScroll={measure}
            tabIndex={0}
            role="region"
            aria-label="Sports gallery editor"
          >
            {filtered.map((photo) => (
              <figure key={photo.sportId} data-sport-id={photo.sportId}>
                {renderImage({
                  key: photo.key,
                  src: photo.src,
                  alt: photo.name,
                  label: `Photo banner · ${photo.name}`,
                })}
                <figcaption>
                  <span>{photo.name}</span>
                  {!photo.isActive && <small>Inactive</small>}
                </figcaption>
              </figure>
            ))}
          </div>
          {scroll.max > 0 && (
            <div className={styles.galleryArrows}>
              <button
                type="button"
                aria-label="Scroll sports left"
                aria-controls={`${id}-strip`}
                disabled={scroll.left <= 0}
                onClick={() => move(-1)}
              >
                <ChevronLeft size={22} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Scroll sports right"
                aria-controls={`${id}-strip`}
                disabled={scroll.left >= scroll.max - 1}
                onClick={() => move(1)}
              >
                <ChevronRight size={22} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
