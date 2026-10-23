"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Save, RotateCcw, Eye, X } from "lucide-react";
import { Dialog } from "@/components/ui";
import { StateView } from "@/components/data";
import { api, ApiError } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import {
  LandingContentProvider,
  type LandingDocument,
  validLandingImage,
} from "@/components/homepage/landing-content-context";
import {
  FEATURED_COACH_IDS,
  featuredCoachIds,
  suggestHomepageCoaches,
  type HomepageCoach,
  type HomepageOverview,
  type HomepageShowcaseSources,
} from "@/components/homepage/homepage-showcase";
import { imageSpecForField } from "@/components/homepage/image-specs";
import { FeaturedCoachPicker } from "./featured-coach-picker";
import { MediaImageCropper } from "./media-image-cropper";
import {
  MediaLandingPreview,
  type MediaImageTarget,
} from "./media-landing-preview";
import { restoreMediaBaseline } from "./media-restore";
import { MediaHomepagePreview } from "./media-homepage-preview";
import styles from "./media-editor.module.css";

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
  const [previewOpen, setPreviewOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
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

  const update = (key: string, value: string | undefined) => {
    setSaved(false);
    setError("");
    setDraft((current) => {
      const next = { ...current };
      if (value === undefined) delete next[key];
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
    if (
      Object.values(draft).some((value) => !value.trim() || value.length > 2000)
    ) {
      setError("Text must contain between 1 and 2,000 characters.");
      return;
    }
    if (
      Object.entries(draft).some(
        ([key, value]) =>
          /\.(image|src)$/.test(key) && !validLandingImage(value),
      )
    ) {
      setError("Choose a valid image before saving.");
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
      <div className={styles.restoreBar}>
        <button
          type="button"
          className="btn btn--secondary"
          disabled={working}
          onClick={() => setRestoreOpen(true)}
        >
          <RotateCcw size={16} aria-hidden="true" /> Restore original
        </button>
      </div>
      <p
        className={saved ? styles.savedFeedback : styles.srOnly}
        ref={status}
        tabIndex={-1}
        role="status"
      >
        {saved ? (
          <>
            <Check size={16} aria-hidden="true" /> Changes are live
          </>
        ) : preparing ? (
          "Opening image..."
        ) : (
          ""
        )}
      </p>
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
          onCoaches={() => setCoachesOpen(true)}
          onText={update}
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
            if (selected.key === "brand.logo.image") {
              image.close();
              setUploading(true);
              const form = new FormData();
              form.append("file", file);
              form.append("preset", "logo");
              const result = await api.postForm<{ url: string }>(
                "/api/manager/media/images",
                form,
                { signal: controller.signal },
              );
              if (!controller.signal.aborted) {
                if (!validLandingImage(result.url))
                  throw new Error(
                    "The uploaded logo URL is invalid. Try again.",
                  );
                update(selected.key, result.url);
              }
            } else if (controller.signal.aborted) image.close();
            else setCrop({ image, name: file.name, target: selected });
          } catch (cause) {
            if (!controller.signal.aborted)
              setError(
                selected.key === "brand.logo.image"
                  ? cause instanceof Error
                    ? cause.message
                    : "Could not upload the logo. Check your connection and try again."
                  : "Could not open this image. Choose another JPG, PNG or WebP file.",
              );
          } finally {
            request.current = null;
            setPreparing(false);
            setUploading(false);
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
              onClick={() => setPreviewOpen(true)}
            >
              <Eye size={16} aria-hidden="true" /> Preview
            </button>
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
      {previewOpen && (
        <MediaHomepagePreview
          values={draft}
          onClose={() => setPreviewOpen(false)}
        />
      )}
      {restoreOpen && (
        <Dialog
          title="Restore original homepage?"
          description="Restore all images, titles and content to the original homepage from main, with Gym as the sport name. Custom text, images and logo will be reset. Sports and coach profiles stay in their catalogs. Review the draft, then save to publish."
          onClose={() => setRestoreOpen(false)}
        >
          <div className={styles.actions}>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => setRestoreOpen(false)}
            >
              Keep editing
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setDraft(restoreMediaBaseline(showcaseData.coaches));
                setSaved(false);
                setError("");
                setConflict(false);
                setRestoreOpen(false);
              }}
            >
              Restore to draft
            </button>
          </div>
        </Dialog>
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
  const [ids, setIds] = useState(selectedIds);
  return (
    <Dialog
      title="Featured coaches"
      description="Drag to reorder. Use Change coach to replace someone."
      className={styles.coachDialog}
      size="lg"
      onClose={onClose}
    >
      <FeaturedCoachPicker
        coaches={coaches}
        selectedIds={ids}
        onChange={setIds}
      />
      <div className={styles.actions}>
        <button type="button" className="btn btn--secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn"
          disabled={
            ids.length !== 3 ||
            new Set(ids).size !== 3 ||
            ids.some((id) => !coaches.some((coach) => coach.userId === id))
          }
          onClick={() =>
            onApply({ ...draft, [FEATURED_COACH_IDS]: ids.join(",") })
          }
        >
          Apply changes
        </button>
      </div>
    </Dialog>
  );
}
