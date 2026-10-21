"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  Save,
  RotateCcw,
  Type,
  PanelsTopLeft,
  Images,
  Map as MapIcon,
  CalendarDays,
  MessagesSquare,
  X,
} from "lucide-react";
import { Dialog } from "@/components/ui";
import { StateView } from "@/components/data";
import { api, ApiError } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import {
  LandingContentProvider,
  type LandingDocument,
  validLandingImage,
} from "@/components/homepage/landing-content-context";
import { heroCopy } from "@/components/homepage/PerformanceSections";
import {
  homepageCategories,
  homepageIntroCopy,
} from "@/components/homepage/homepage-content";
import {
  resolveHomepageShowcase,
  FEATURED_COACH_IDS,
  featuredCoachIds,
  suggestHomepageCoaches,
  type HomepageCoach,
  type HomepageOverview,
  type HomepageShowcaseSources,
} from "@/components/homepage/homepage-showcase";
import { sportGalleryTitle } from "@/components/homepage/sport-gallery";
import { arenaCopy } from "@/components/homepage/InteractiveArenaTour";
import { bookingCopy } from "@/components/homepage/CourtBookingSection";
import { faqCopy } from "@/components/homepage/HomepageFAQ";
import { imageSpecForField } from "@/components/homepage/image-specs";
import { FeaturedCoachPicker } from "./featured-coach-picker";
import { MediaImageCropper } from "./media-image-cropper";
import {
  MediaLandingPreview,
  type MediaImageTarget,
} from "./media-landing-preview";
import styles from "./media-editor.module.css";

const sections = [
  {
    id: "hero",
    label: "Hero",
    icon: Type,
    hint: "The first message visitors see.",
    defaults: heroCopy.en,
  },
  {
    id: "bookmarks",
    label: "Bookmarks",
    icon: PanelsTopLeft,
    hint: "Coaches, courts and the Member community. Three images per category.",
    defaults: homepageCategories,
  },
  {
    id: "gallery",
    label: "Photo banner",
    icon: Images,
    hint: "Images and captions in the scrolling gallery.",
    defaults: { title: sportGalleryTitle },
  },
  {
    id: "arena",
    label: "Arena tour",
    icon: MapIcon,
    hint: "Introduce each sport and its training space.",
    defaults: arenaCopy.en,
  },
  {
    id: "booking",
    label: "Court booking",
    icon: CalendarDays,
    hint: "Invite visitors to find their next court.",
    defaults: bookingCopy,
  },
  {
    id: "faq",
    label: "FAQ",
    icon: MessagesSquare,
    hint: "Helpful answers before visitors sign in.",
    defaults: faqCopy.en,
  },
];

type ContentField = {
  key: string;
  label: string;
  original: string;
  image: boolean;
};
function fieldsFor(section: (typeof sections)[number]): ContentField[] {
  const fields: ContentField[] = [];
  function visit(value: unknown, path: string, names: string[]) {
    if (section.id === "bookmarks" && path.startsWith("bookmarks.0.items."))
      return;
    if (typeof value === "string") {
      const last = names.at(-1);
      if (
        ["vi", "href", "id", "suffix", "short"].includes(last ?? "") ||
        names.includes("vi")
      )
        return;
      if (
        section.id === "hero" &&
        ![
          "title",
          "lead",
          "start",
          "enter",
          "badminton",
          "basketball",
          "gym",
        ].includes(last ?? "")
      )
        return;
      if (
        section.id === "arena" &&
        names.length === 1 &&
        !["title", "lead"].includes(last ?? "")
      )
        return;
      fields.push({
        key: path,
        label: names
          .map((part, index) => {
            if (part === "en") return section.id === "gallery" ? "Caption" : "";
            if (part === "items" || part === "photos") return "";
            if (/^\d+$/.test(part))
              return section.id === "bookmarks" && index === 0
                ? ["Coaches", "Courts", "Members"][Number(part)]
                : `Item ${Number(part) + 1}`;
            const labels: Record<string, string> = {
              lead: "Description",
              start: "Sign-in button",
              enter: "Signed-in button",
              src: "Image URL",
              image: "Image URL",
              alt: "Image description",
              imageAlt: "Image description",
              cta: "Button label",
              specOne: "First specification",
              specTwo: "Second specification",
            };
            const words =
              labels[part] ?? part.replace(/([a-z])([A-Z])/g, "$1 $2");
            return words.charAt(0).toUpperCase() + words.slice(1);
          })
          .filter(Boolean)
          .join(" / "),
        original: value,
        image: ["image", "src"].includes(last ?? ""),
      });
    } else if (Array.isArray(value))
      value.forEach((item, i) =>
        visit(item, `${path}.${i}`, [...names, String(i)]),
      );
    else if (value && typeof value === "object")
      Object.entries(value).forEach(([key, item]) =>
        visit(item, `${path}.${key}`, [...names, key]),
      );
  }
  visit(section.defaults, section.id, []);
  return fields;
}

export function MediaEditor() {
  const state = useApi(async (signal) => {
    const [document, coaches, overview] = await Promise.all([
      api.get<LandingDocument>("/api/landing-page", { signal }),
      api.get<HomepageCoach[]>("/api/coaches", { signal, anonymous: true }),
      api.get<HomepageOverview>("/api/public/overview", {
        signal,
        anonymous: true,
      }),
    ]);
    const values = Object.fromEntries(
      Object.entries(document.values).filter(
        ([key]) => !/^gallery\.photos\.[0-9]+\.(en|vi)$/.test(key),
      ),
    );
    return {
      document: { ...document, values },
      showcaseData: { coaches, overview },
    };
  }, []);
  if (state.loading)
    return <StateView kind="loading" title="Loading media content" />;
  if (!state.data)
    return (
      <StateView
        kind="error"
        title="Could not load content"
        description={state.error?.message}
        action={
          <button className="btn btn--secondary" onClick={state.reload}>
            Retry
          </button>
        }
      />
    );
  return (
    <ContentEditor
      key={state.data.document.revision}
      initial={state.data.document}
      showcaseData={state.data.showcaseData}
      onReload={state.reload}
    />
  );
}

function ContentEditor({
  initial,
  showcaseData,
  onReload,
}: {
  initial: LandingDocument;
  showcaseData: HomepageShowcaseSources;
  onReload: () => void;
}) {
  const [published, setPublished] = useState(initial);
  const [draft, setDraft] = useState(initial.values);
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [saved, setSaved] = useState(false);
  const [coachesOpen, setCoachesOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [crop, setCrop] = useState<{
    image: ImageBitmap;
    name: string;
    target: MediaImageTarget;
  } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const target = useRef<MediaImageTarget | null>(null);
  const request = useRef<AbortController | null>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const working = busy || preparing || uploading;
  const selectedCoachIds =
    featuredCoachIds(draft) ??
    suggestHomepageCoaches(showcaseData.coaches).map((coach) => coach.userId);
  const editorSections = sections.map((section) =>
    section.id === "bookmarks"
      ? {
          ...section,
          defaults: resolveHomepageShowcase(
            showcaseData.coaches,
            showcaseData.overview,
          ),
        }
      : section,
  );
  const allFields = [
    ...editorSections.flatMap(fieldsFor),
    ...Object.entries(homepageIntroCopy).map(([key, original]) => ({
      key: `bookmarks.intro.${key}`,
      label: key,
      original,
      image: false,
    })),
  ];
  const defaults = Object.fromEntries(
    allFields.map((field) => [field.key, field.original]),
  );
  const changedKeys = [
    ...new Set([...Object.keys(draft), ...Object.keys(published.values)]),
  ].filter((key) => draft[key] !== published.values[key]);
  const dirty = changedKeys.length > 0;

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => () => crop?.image.close(), [crop]);
  useEffect(() => {
    if (!dirty && !working && !crop) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const guardLink = (event: MouseEvent) => {
      const link =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>("a[href]")
          : null;
      if (
        !link ||
        link.target === "_blank" ||
        link.hasAttribute("download") ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey ||
        event.button !== 0
      )
        return;
      const destination = new URL(link.href, window.location.href);
      if (
        destination.pathname === window.location.pathname &&
        destination.search === window.location.search
      )
        return;
      if (!window.confirm("Leave Media and discard your unsaved changes?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", guardLink, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", guardLink, true);
    };
  }, [dirty, working, crop]);

  const update = (key: string, value: string) => {
    setSaved(false);
    setError("");
    setDraft((current) => {
      const next = { ...current };
      if (value === defaults[key] && published.values[key] === undefined)
        delete next[key];
      else next[key] = value;
      return next;
    });
  };
  const save = async () => {
    if (working || !dirty || crop || coachesOpen) return;
    if (
      selectedCoachIds.length !== 3 ||
      new Set(selectedCoachIds).size !== 3 ||
      selectedCoachIds.some(
        (id) => !showcaseData.coaches.some((coach) => coach.userId === id),
      )
    ) {
      setError("Choose exactly three active coaches before saving.");
      setCoachesOpen(true);
      return;
    }
    const invalid = allFields.find(
      (field) =>
        draft[field.key] !== undefined &&
        (!draft[field.key].trim() ||
          (field.image && !validLandingImage(draft[field.key]))),
    );
    if (invalid) {
      setError("Complete the empty or invalid content before saving.");
      window.document
        .querySelector<HTMLElement>(
          `[data-media-field="${invalid.key}"] [role="button"]`,
        )
        ?.focus();
      return;
    }
    setBusy(true);
    setError("");
    setConflict(false);
    setSaved(false);
    try {
      const result = await api.put<LandingDocument>("/api/landing-page", {
        ...published,
        values: {
          ...Object.fromEntries(
            Object.entries(draft).filter(
              ([key]) => !key.startsWith("bookmarks.0.items."),
            ),
          ),
          [FEATURED_COACH_IDS]: selectedCoachIds.join(","),
        },
      });
      setPublished(result);
      setDraft(result.values);
      setSaved(true);
      requestAnimationFrame(() =>
        status.current?.focus({ preventScroll: true }),
      );
    } catch (cause) {
      setConflict(cause instanceof ApiError && cause.status === 409);
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save changes. Your edits are still here. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.editor}>
      <header className={styles.toolbar}>
        <div className={styles.saveStatus}>
          <p ref={status} tabIndex={-1} role="status">
            <Check size={16} aria-hidden="true" />
            {saved
              ? "Changes are live"
              : dirty
                ? changedKeys.length + " unsaved changes"
                : "Published homepage"}
          </p>
          <span id="media-inline-help">
            {preparing
              ? "Opening image…"
              : "Double-click text to edit; tap on touch screens. Enter to finish, Shift+Enter for a new line, Esc to undo. Hover over an image to replace it."}
          </span>
        </div>
        <Link
          className="btn btn--secondary"
          href="/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open homepage
          <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </header>
      <nav className={styles.sectionNav} aria-label="Homepage sections">
        {sections.map((section) => (
          <a key={section.id} href={"#media-" + section.id}>
            {section.label}
          </a>
        ))}
      </nav>
      {error && !dirty && (
        <div className={`${styles.error} ${styles.feedback}`} role="alert">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => setError("")}
            aria-label="Dismiss image error"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      )}
      <LandingContentProvider preview={draft}>
        <MediaLandingPreview
          showcaseData={showcaseData}
          changedKeys={changedKeys}
          disabled={working}
          onImage={(image) => {
            target.current = image;
            fileInput.current?.click();
          }}
          onTextChange={update}
          onCoaches={() => setCoachesOpen(true)}
        />
      </LandingContentProvider>
      <input
        ref={fileInput}
        hidden
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label="Choose media image"
        onChange={async (event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          const selected = target.current;
          if (!file || !selected || working || request.current) return;
          setError("");
          if (!file.size || file.size > 10 * 1024 * 1024) {
            setError("Choose an image no larger than 10 MB.");
            return;
          }
          if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
            setError("Choose a JPG, PNG or WebP image.");
            return;
          }
          const controller = new AbortController();
          request.current = controller;
          setPreparing(true);
          try {
            const image = await createImageBitmap(file);
            if (controller.signal.aborted) image.close();
            else setCrop({ image, name: file.name, target: selected });
          } catch {
            if (!controller.signal.aborted)
              setError(
                "Could not open this image. Choose another JPG, PNG or WebP file.",
              );
          } finally {
            request.current = null;
            setPreparing(false);
          }
        }}
      />
      <div
        className={styles.saveDock}
        data-visible={dirty || undefined}
        inert={!dirty}
        aria-hidden={!dirty}
      >
        {error && (
          <div className={styles.dockError} role="alert">
            <p>{error}</p>
            {conflict && (
              <button
                type="button"
                className="btn btn--secondary"
                disabled={working}
                onClick={() => {
                  if (
                    window.confirm(
                      "Load the latest published content and discard your edits?",
                    )
                  )
                    onReload();
                }}
              >
                Load latest content
              </button>
            )}
          </div>
        )}
        <div className={styles.dockRow}>
          <span role="status">
            {changedKeys.length} unsaved{" "}
            {changedKeys.length === 1 ? "change" : "changes"}
          </span>
          <div className={styles.actions}>
            <button
              type="button"
              className="btn btn--secondary"
              disabled={working}
              onClick={() => setDiscardOpen(true)}
            >
              <RotateCcw size={16} aria-hidden="true" />
              Cancel
            </button>
            <button
              type="button"
              className="btn"
              disabled={working}
              onClick={save}
            >
              <Save size={16} aria-hidden="true" />
              {busy ? "Saving…" : uploading ? "Uploading…" : "Save changes"}
            </button>
          </div>
        </div>
      </div>
      {crop && (
        <MediaImageCropper
          image={crop.image}
          spec={imageSpecForField(crop.target.key)}
          onCancel={() => setCrop(null)}
          onConfirm={async (blob) => {
            const controller = new AbortController();
            request.current = controller;
            setUploading(true);
            try {
              const form = new FormData();
              form.append(
                "file",
                blob,
                crop.name.replace(/\.[^/.]+$/, "") + ".jpg",
              );
              form.append("preset", imageSpecForField(crop.target.key).id);
              const result = await api.postForm<{ url: string }>(
                "/api/manager/media/images",
                form,
                { signal: controller.signal },
              );
              if (!controller.signal.aborted) {
                if (!validLandingImage(result.url))
                  throw new Error(
                    "The uploaded image URL is invalid. Please try again.",
                  );
                update(crop.target.key, result.url);
                setCrop(null);
              }
            } finally {
              request.current = null;
              setUploading(false);
            }
          }}
        />
      )}
      {coachesOpen && (
        <CoachEditor
          coaches={showcaseData.coaches}
          draft={draft}
          selectedIds={selectedCoachIds}
          onApply={(values) => {
            setDraft(values);
            setSaved(false);
            setError("");
            setCoachesOpen(false);
          }}
          onClose={() => setCoachesOpen(false)}
        />
      )}
      {discardOpen && (
        <Dialog
          title="Discard your changes?"
          description="All unsaved edits will be replaced with the last published homepage."
          onClose={() => setDiscardOpen(false)}
        >
          <div className={styles.actions}>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => setDiscardOpen(false)}
            >
              Keep editing
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setDraft(published.values);
                setSaved(false);
                setError("");
                setConflict(false);
                setDiscardOpen(false);
                requestAnimationFrame(() =>
                  status.current?.focus({ preventScroll: true }),
                );
              }}
            >
              Discard changes
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function CoachEditor({
  coaches,
  draft,
  selectedIds,
  onApply,
  onClose,
}: {
  coaches: HomepageCoach[];
  draft: Record<string, string>;
  selectedIds: string[];
  onApply: (values: Record<string, string>) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState(draft);
  const [ids, setIds] = useState(selectedIds);
  return (
    <Dialog
      title="Featured coaches"
      description="Coach photos stay linked to their profiles. Choose and frame the coaches shown on the homepage."
      size="lg"
      onClose={onClose}
    >
      <FeaturedCoachPicker
        coaches={coaches}
        selectedIds={ids}
        frameValues={values}
        onChange={setIds}
        onFrameChange={(key, value) =>
          setValues((current) => ({ ...current, [key]: value }))
        }
      />
      <div className={styles.actions}>
        <button type="button" className="btn btn--secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn"
          disabled={ids.length !== 3}
          onClick={() =>
            onApply({ ...values, [FEATURED_COACH_IDS]: ids.join(",") })
          }
        >
          Apply changes
        </button>
      </div>
    </Dialog>
  );
}
