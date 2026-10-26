"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import { AvatarImage } from "./AvatarImage";
import styles from "./coach-profile-preview.module.css";

type Coach = {
  userId: string;
  fullName: string;
  avatarUrl?: string | null;
  title?: string | null;
  bio?: string | null;
  yearsExperience?: number | null;
  philosophy?: string | null;
  credentialCount?: number;
};

const subscribeToClient = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

/** Native popover uses the top layer, including inside clipped class cards. */
export function CoachProfilePreview({
  coachId,
  name,
  sport,
  children,
  className,
}: {
  coachId: string;
  name: string;
  sport?: string | null;
  children?: React.ReactNode;
  className?: string;
}) {
  const id = useId();
  const mounted = useSyncExternalStore(
    subscribeToClient,
    clientSnapshot,
    serverSnapshot,
  );
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLAnchorElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({});
  const details = useApi(
    async (signal) => {
      if (!open) return null;
      const coaches = await api.get<Coach[]>("/api/coaches", {
        anonymous: true,
        signal,
      });
      return coaches.find((coach) => coach.userId === coachId) ?? null;
    },
    [open, coachId],
  );
  const coach = details.data;
  const origin = mounted
    ? window.location.pathname + window.location.search + window.location.hash
    : "/member/services";
  const profileHref = `/coaches/${coachId}?returnTo=${encodeURIComponent(origin)}`;
  function clearTimer() {
    if (timer.current) clearTimeout(timer.current);
  }
  function locate() {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(320, window.innerWidth - 32);
    const below = window.innerHeight - rect.bottom - 16;
    const above = rect.top - 16;
    const showAbove = below < 240 && above > below;
    setPosition({
      width,
      left: Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)),
      top: showAbove ? "auto" : Math.max(16, rect.bottom + 8),
      bottom: showAbove ? window.innerHeight - rect.top + 8 : "auto",
      maxHeight: Math.max(100, (showAbove ? above : below) - 8),
    });
  }
  function show() {
    clearTimer();
    locate();
    panel.current?.showPopover();
  }
  function hideLater() {
    clearTimer();
    timer.current = setTimeout(() => panel.current?.hidePopover(), 180);
  }
  useEffect(() => {
    if (!open) return;
    const hide = (event: Event) => {
      // Scrolling the preview itself must not dismiss it.
      if (
        event.type === "scroll" &&
        event.target instanceof Node &&
        panel.current?.contains(event.target)
      )
        return;
      panel.current?.hidePopover();
    };
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [open]);
  useEffect(() => () => clearTimer(), []);

  return (
    <>
      <Link
        ref={trigger}
        href={profileHref}
        className={
          className ? `${styles.trigger} ${className}` : styles.trigger
        }
        aria-expanded={open}
        aria-controls={id}
        aria-label={`View coach profile: ${name}`}
        onClick={(event) => {
          event.stopPropagation();
          clearTimer();
          panel.current?.hidePopover();
        }}
        onPointerEnter={(event) => {
          if (event.pointerType === "touch") return;
          clearTimer();
          timer.current = setTimeout(show, 200);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType !== "touch") hideLater();
        }}
        onFocus={(event) => {
          if (event.currentTarget.matches(":focus-visible")) show();
        }}
        onBlur={(event) => {
          if (!panel.current?.contains(event.relatedTarget)) hideLater();
        }}
      >
        {children ?? name}
      </Link>
      {mounted &&
        createPortal(
          <div
            id={id}
            ref={panel}
            popover="auto"
            className={styles.panel}
            style={position}
            role="region"
            aria-label={`Coach profile: ${name}`}
            onToggle={(event) => {
              clearTimer();
              setOpen(event.newState === "open");
            }}
            onPointerEnter={clearTimer}
            onPointerLeave={(event) => {
              if (event.pointerType !== "touch") hideLater();
            }}
            onBlur={(event) => {
              if (
                !event.currentTarget.contains(event.relatedTarget) &&
                event.relatedTarget !== trigger.current
              )
                hideLater();
            }}
          >
            <Link
              href={profileHref}
              className={styles.identity}
              aria-label={`View coach profile: ${name}`}
            >
              <AvatarImage
                userId={coachId}
                name={coach?.fullName || name}
                avatarUrl={coach?.avatarUrl}
                size={64}
              />
              <div>
                <p className={styles.title}>{coach?.title || "Coach"}</p>
                <h3>{coach?.fullName || name}</h3>
                {sport && <p className={styles.sport}>{sport}</p>}
              </div>
            </Link>
            {details.loading ? (
              <p className={styles.note} role="status">
                Loading coach profile…
              </p>
            ) : details.error ? (
              <div className={styles.note} role="alert">
                <p>Could not load this profile.</p>
                <button type="button" onClick={details.reload}>
                  Try again
                </button>
              </div>
            ) : coach ? (
              <>
                {coach.yearsExperience != null && (
                  <p className={styles.experience}>
                    {coach.yearsExperience}{" "}
                    {coach.yearsExperience === 1 ? "year" : "years"} of
                    experience
                  </p>
                )}
                <p className={styles.bio}>
                  {coach.bio || "This coach has not added a biography yet."}
                </p>
                {coach.philosophy && (
                  <p className={styles.philosophy}>{coach.philosophy}</p>
                )}
                {!!coach.credentialCount && (
                  <Link
                    className={styles.credentialsLink}
                    href={`${profileHref}&tab=certificates#credentials`}
                  >
                    View certificates & awards ({coach.credentialCount})
                  </Link>
                )}
              </>
            ) : (
              <p className={styles.note}>
                Coach profile is currently unavailable.
              </p>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
