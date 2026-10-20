"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Eye,
  Save,
  RotateCcw,
  Type,
  PanelsTopLeft,
  Images,
  Map as MapIcon,
  CalendarDays,
  MessagesSquare,
  ChevronRight,
  Upload,
} from "lucide-react";
import { Dialog, Field } from "@/components/ui";
import { StateView } from "@/components/data";
import { api } from "@/lib/apiClient";
import { useApi } from "@/lib/useApi";
import {
  LandingContentProvider,
  type LandingDocument,
  validLandingImage,
} from "@/components/homepage/landing-content-context";
import {
  PerformanceSections,
  heroCopy,
} from "@/components/homepage/PerformanceSections";
import { HomepageStats } from "@/components/homepage/HomepageStats";
import { homepageCategories } from "@/components/homepage/homepage-content";
import {
  resolveHomepageShowcase,
  FEATURED_COACH_IDS,
  featuredCoachIds,
  suggestHomepageCoaches,
  type HomepageCoach,
  type HomepageOverview,
  type HomepageShowcaseSources,
} from "@/components/homepage/homepage-showcase";
import {
  TrainingPhotoMarquee,
  galleryPhotos,
} from "@/components/homepage/TrainingPhotoMarquee";
import {
  InteractiveArenaTour,
  arenaCopy,
} from "@/components/homepage/InteractiveArenaTour";
import {
  CourtBookingSection,
  bookingCopy,
} from "@/components/homepage/CourtBookingSection";
import { HomepageFAQ, faqCopy } from "@/components/homepage/HomepageFAQ";
import HomepageImage from "@/components/homepage/HomepageImage";
import cinema from "@/components/brand/cinema-theme.module.css";
import styles from "./media-editor.module.css";
import { FeaturedCoachPicker } from "./featured-coach-picker";
import { MediaImageCropper } from "./media-image-cropper";
import { imageSpecForField } from "@/components/homepage/image-specs";

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
    defaults: { title: "Energy across every court", photos: galleryPhotos },
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
        !["title", "lead", "start", "enter"].includes(last ?? "")
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

type FieldGroup = { id: string; title: string; fields: ContentField[] };
function groupFields(sectionId: string, fields: ContentField[]): FieldGroup[] {
  const groups = new Map<string, FieldGroup>();
  for (const field of fields) {
    let id = "intro";
    let title = "Section content";
    const parts = field.key.split(".");
    if (sectionId === "bookmarks" && parts[2] === "items") {
      id = parts.slice(0, 4).join(".");
      title = `Card ${Number(parts[3]) + 1}`;
    } else if (sectionId === "gallery" && parts[1] === "photos") {
      id = parts.slice(0, 3).join(".");
      title = `Photo ${Number(parts[2]) + 1}`;
    } else if (sectionId === "arena" && parts[1] === "zones") {
      id = parts.slice(0, 3).join(".");
      title =
        {
          badminton: "Badminton",
          basketball: "Basketball",
          conditioning: "Conditioning",
        }[parts[2]] ?? "Sport zone";
    } else if (sectionId === "faq" && parts[1] === "questions") {
      id = parts.slice(0, 3).join(".");
      title = `Question ${Number(parts[2]) + 1}`;
    } else if (sectionId === "hero" && ["start", "enter"].includes(parts[1])) {
      id = "buttons";
      title = "Call to action";
    }
    if (!groups.has(id)) groups.set(id, { id, title, fields: [] });
    groups.get(id)!.fields.push(field);
  }
  return [...groups.values()];
}

function MediaField({
  field,
  value,
  invalid,
  onChange,
  onUploadStateChange,
}: {
  field: ContentField;
  value: string;
  invalid: boolean;
  onChange: (key: string, value: string) => void;
  onUploadStateChange: (uploading: boolean) => void;
}) {
  const label = field.label.split(" / ").at(-1)!;
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadRequest = useRef<AbortController | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadedName, setUploadedName] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [crop, setCrop] = useState<{ image: ImageBitmap; name: string } | null>(
    null,
  );
  const spec = imageSpecForField(field.key);
  useEffect(() => () => uploadRequest.current?.abort(), []);
  useEffect(() => () => crop?.image.close(), [crop]);
  if (field.image)
    return (
      <div className={styles.imageField}>
        <div
          className={styles.imagePreview}
          aria-busy={uploading}
          style={{ aspectRatio: spec.ratio }}
        >
          <HomepageImage
            src={validLandingImage(value) ? value : field.original}
            alt="Media image preview"
            fill
            sizes="(max-width: 700px) 90vw, 300px"
          />
          {uploading && (
            <div className={styles.uploadOverlay}>Uploading to Cloudinary…</div>
          )}
        </div>
        <input
          ref={fileInput}
          hidden
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label="Choose media image"
          onChange={async (event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (!file || uploadRequest.current) return;
            setUploadError("");
            setUploadedName("");
            if (!file.size || file.size > 10 * 1024 * 1024) {
              setUploadError("Choose an image no larger than 10 MB.");
              return;
            }
            if (
              !["image/jpeg", "image/png", "image/webp"].includes(file.type)
            ) {
              setUploadError("Choose a JPG, PNG or WebP image.");
              return;
            }
            const controller = new AbortController();
            uploadRequest.current = controller;
            setPreparing(true);
            try {
              const bitmap = await createImageBitmap(file);
              if (controller.signal.aborted) bitmap.close();
              else setCrop({ image: bitmap, name: file.name });
            } catch (cause) {
              if (!controller.signal.aborted)
                setUploadError(
                  cause instanceof Error
                    ? cause.message
                    : "Could not open this image. Try another file.",
                );
            } finally {
              uploadRequest.current = null;
              setPreparing(false);
            }
          }}
        />
        <button
          type="button"
          className="btn btn--secondary"
          disabled={uploading || preparing}
          onClick={() => fileInput.current?.click()}
        >
          <Upload size={16} aria-hidden="true" />
          {preparing
            ? "Opening image…"
            : uploading
              ? "Uploading…"
              : value !== field.original
                ? "Replace image"
                : "Upload image"}
        </button>
        <p className={styles.uploadHint}>
          {spec.label} · JPG, PNG or WebP · Up to 10 MB
        </p>
        {uploadError && (
          <p className={styles.uploadError} role="alert">
            {uploadError}
          </p>
        )}
        {invalid && (
          <p className={styles.uploadError} role="alert">
            Upload a valid image before publishing.
          </p>
        )}
        {uploadedName && (
          <p className={styles.uploadSuccess} role="status">
            Uploaded: {uploadedName}
          </p>
        )}
        <details className={styles.imageSource}>
          <summary>Image link</summary>
          <input
            readOnly
            value={value}
            aria-label="Current image URL"
            onFocus={(event) => event.target.select()}
          />
        </details>
        {crop && (
          <MediaImageCropper
            image={crop.image}
            spec={spec}
            onCancel={() => setCrop(null)}
            onConfirm={async (blob) => {
              const controller = new AbortController();
              uploadRequest.current = controller;
              setUploading(true);
              onUploadStateChange(true);
              setUploadError("");
              try {
                const form = new FormData();
                form.append(
                  "file",
                  blob,
                  `${crop.name.replace(/\.[^/.]+$/, "")}.jpg`,
                );
                form.append("preset", spec.id);
                const result = await api.postForm<{ url: string }>(
                  "/api/manager/media/images",
                  form,
                  { signal: controller.signal },
                );
                if (!controller.signal.aborted) {
                  onChange(field.key, result.url);
                  setUploadedName(crop.name);
                  setCrop(null);
                }
              } catch (cause) {
                if (!controller.signal.aborted) {
                  setUploadError(
                    cause instanceof Error
                      ? cause.message
                      : "Could not upload this image.",
                  );
                  throw cause;
                }
              } finally {
                uploadRequest.current = null;
                setUploading(false);
                onUploadStateChange(false);
              }
            }}
          />
        )}
      </div>
    );
  return (
    <div className={styles.textField}>
      <Field
        label={label}
        error={invalid ? "Content cannot be empty." : undefined}
      >
        <textarea
          name={field.key}
          value={value}
          maxLength={2000}
          required
          rows={field.original.length > 90 ? 3 : 2}
          onChange={(event) => onChange(field.key, event.target.value)}
        />
      </Field>
    </div>
  );
}

function SectionPreview({
  id,
  bookmarkIndex,
  showcaseData,
}: {
  id: string;
  bookmarkIndex: number;
  showcaseData: HomepageShowcaseSources;
}) {
  const views: Record<string, ReactNode> = {
    hero: <PerformanceSections language="en" />,
    bookmarks: (
      <HomepageStats
        language="en"
        initialCategory={homepageCategories[bookmarkIndex].id}
        showcaseData={showcaseData}
      />
    ),
    gallery: <TrainingPhotoMarquee language="en" />,
    arena: <InteractiveArenaTour language="en" />,
    booking: <CourtBookingSection language="en" />,
    faq: <HomepageFAQ language="en" />,
  };
  return views[id];
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
    return { document, showcaseData: { coaches, overview } };
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
  onReload,
  showcaseData,
}: {
  initial: LandingDocument;
  onReload: () => void;
  showcaseData: HomepageShowcaseSources;
}) {
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
  const allFields = editorSections.flatMap(fieldsFor);
  const defaults = Object.fromEntries(
    allFields.map((field) => [field.key, field.original]),
  );
  const [sectionId, setSectionId] = useState("hero");
  const [bookmarkIndex, setBookmarkIndex] = useState(0);
  const [document, setDocument] = useState(initial);
  const [draft, setDraft] = useState<Record<string, string>>(() => ({
    ...initial.values,
    [FEATURED_COACH_IDS]:
      initial.values[FEATURED_COACH_IDS] ??
      suggestHomepageCoaches(showcaseData.coaches)
        .map((coach) => coach.userId)
        .join(","),
  }));
  const selectedCoachIds =
    featuredCoachIds(draft) ??
    suggestHomepageCoaches(showcaseData.coaches).map((coach) => coach.userId);
  const [busy, setBusy] = useState(false);
  const [pendingUploads, setPendingUploads] = useState(0);
  const working = busy || pendingUploads > 0;
  const [error, setError] = useState("");
  const [saveFailed, setSaveFailed] = useState(false);
  const [saved, setSaved] = useState(false);
  const [preview, setPreview] = useState(false);
  const selected = editorSections.find((section) => section.id === sectionId)!;
  const changedKeys = [
    ...new Set([...Object.keys(draft), ...Object.keys(document.values)]),
  ].filter((key) => draft[key] !== document.values[key]);
  const dirty = changedKeys.length > 0;
  const invalidFields = allFields.filter(
    (field) =>
      draft[field.key] !== undefined &&
      (!draft[field.key].trim() ||
        (field.image && !validLandingImage(draft[field.key]))),
  );
  const visibleFields = fieldsFor(selected).filter(
    (field) =>
      sectionId !== "bookmarks" ||
      field.key.startsWith(`bookmarks.${bookmarkIndex}.`),
  );
  const groups = groupFields(sectionId, visibleFields);
  useEffect(() => {
    if (!dirty && !pendingUploads) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, pendingUploads]);
  const update = (key: string, value: string) => {
    setSaved(false);
    setDraft((current) => {
      const next = { ...current };
      if (value === defaults[key]) delete next[key];
      else next[key] = value;
      return next;
    });
  };
  return (
    <form
      className={styles.editor}
      noValidate
      onSubmit={async (event) => {
        event.preventDefault();
        if (working || !dirty) return;
        if (
          selectedCoachIds.length !== 3 ||
          new Set(selectedCoachIds).size !== 3 ||
          selectedCoachIds.some(
            (id) => !showcaseData.coaches.some((coach) => coach.userId === id),
          )
        ) {
          setSectionId("bookmarks");
          setBookmarkIndex(0);
          setSaveFailed(false);
          setError("Choose exactly three active Coaches before publishing.");
          return;
        }
        if (invalidFields.length) {
          setSaveFailed(false);
          const invalid = invalidFields[0];
          setSectionId(invalid.key.split(".")[0]);
          if (invalid.key.startsWith("bookmarks."))
            setBookmarkIndex(Number(invalid.key.split(".")[1]));
          setError(
            "Complete the highlighted fields before saving. Images need a valid HTTPS URL or /sporthub/ path.",
          );
          return;
        }
        setBusy(true);
        setError("");
        setSaveFailed(false);
        setSaved(false);
        try {
          const result = await api.put<LandingDocument>("/api/landing-page", {
            ...document,
            values: {
              ...Object.fromEntries(
                Object.entries(draft).filter(
                  ([key]) => !key.startsWith("bookmarks.0.items."),
                ),
              ),
              [FEATURED_COACH_IDS]: selectedCoachIds.join(","),
            },
          });
          setDocument(result);
          setDraft(result.values);
          setSaved(true);
        } catch (cause) {
          setSaveFailed(true);
          setError(
            cause instanceof Error ? cause.message : "Could not save changes.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <header className={styles.toolbar}>
        <div className={styles.saveStatus} role="status">
          <strong>
            {dirty
              ? `${changedKeys.length} unsaved ${changedKeys.length === 1 ? "change" : "changes"}`
              : saved
                ? "Changes are live"
                : "Published content"}
          </strong>
          <span>
            {document.updatedAt
              ? `Last saved ${new Date(document.updatedAt).toLocaleString("en-GB")}`
              : "Homepage content · Original version"}
          </span>
        </div>
        <div className={styles.actions}>
          <Link
            className="btn btn--secondary"
            href="/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open homepage
            <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
          <button
            type="button"
            className="btn btn--secondary"
            disabled={working}
            onClick={() => setPreview(true)}
          >
            <Eye size={16} aria-hidden="true" />
            Preview
          </button>
          <button type="submit" className="btn" disabled={working || !dirty}>
            <Save size={16} aria-hidden="true" />
            {pendingUploads
              ? "Uploading image…"
              : busy
                ? "Saving…"
                : "Save & publish"}
          </button>
        </div>
      </header>
      {error && (
        <div className={styles.error} role="alert">
          {error}
          {saveFailed && (
            <>
              <p>
                Your edits are still here. If another Manager changed the page,
                copy your edits before loading the latest version.
              </p>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => {
                  if (
                    window.confirm(
                      "Load published content and discard your unsaved edits?",
                    )
                  )
                    onReload();
                }}
              >
                Load published content
              </button>
            </>
          )}
        </div>
      )}
      <div className={styles.layout}>
        <aside className={styles.sidebar} aria-label="Homepage sections">
          <h2>Page sections</h2>
          {editorSections.map((section) => {
            const Icon = section.icon;
            const imageCount = fieldsFor(section).filter(
              (field) => field.image,
            ).length;
            const edits = changedKeys.filter((key) =>
              key.startsWith(`${section.id}.`),
            ).length;
            return (
              <button
                type="button"
                key={section.id}
                aria-pressed={sectionId === section.id}
                onClick={() => setSectionId(section.id)}
                disabled={working}
              >
                <Icon size={18} aria-hidden="true" />
                <span className={styles.sectionLabel}>
                  {section.label}
                  <small>
                    {imageCount ? `${imageCount} images` : "Text & copy"}
                  </small>
                </span>
                {edits > 0 ? (
                  <span
                    className={styles.editCount}
                    aria-label={`${edits} unsaved changes`}
                  >
                    {edits}
                  </span>
                ) : (
                  <ChevronRight size={14} aria-hidden="true" />
                )}
              </button>
            );
          })}
          <p>
            Upload images to Cloudinary, review your changes, then publish them
            to the homepage.
          </p>
        </aside>
        <section
          className={styles.panel}
          aria-labelledby="content-section-title"
        >
          <header className={styles.panelHead}>
            <div>
              <h2 id="content-section-title">{selected.label}</h2>
              <p>{selected.hint}</p>
            </div>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={
                working ||
                !Object.keys(draft).some((key) =>
                  key.startsWith(`${sectionId}.`),
                )
              }
              onClick={() => {
                if (
                  !window.confirm(
                    `Restore the original ${selected.label} content in this draft?`,
                  )
                )
                  return;
                setDraft((current) =>
                  Object.fromEntries(
                    Object.entries(current).filter(
                      ([key]) => !key.startsWith(`${sectionId}.`),
                    ),
                  ),
                );
                setSaved(false);
              }}
            >
              <RotateCcw size={16} aria-hidden="true" />
              Restore section
            </button>
          </header>
          {sectionId === "bookmarks" && (
            <div
              className={styles.categoryTabs}
              role="group"
              aria-label="Bookmark category"
            >
              {["Coaches", "Courts", "Members"].map((label, index) => (
                <button
                  key={label}
                  type="button"
                  className={`btn ${bookmarkIndex === index ? "" : "btn--secondary"}`}
                  aria-pressed={bookmarkIndex === index}
                  onClick={() => setBookmarkIndex(index)}
                  disabled={working}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <fieldset disabled={working} className={styles.groups}>
            <legend className="sr-only">{selected.label} editor</legend>
            {groups.map((group) => {
              const imageFields = group.fields.filter((field) => field.image);
              const textFields = group.fields.filter((field) => !field.image);
              const renderField = (field: ContentField) => (
                <MediaField
                  key={field.key}
                  field={field}
                  value={draft[field.key] ?? field.original}
                  invalid={invalidFields.some(
                    (invalid) => invalid.key === field.key,
                  )}
                  onChange={update}
                  onUploadStateChange={(uploading) =>
                    setPendingUploads((current) =>
                      Math.max(0, current + (uploading ? 1 : -1)),
                    )
                  }
                />
              );
              const content = (
                <div
                  className={
                    imageFields.length ? styles.assetLayout : styles.copyLayout
                  }
                >
                  {imageFields.length > 0 && (
                    <div className={styles.assetColumn}>
                      {imageFields.map(renderField)}
                    </div>
                  )}
                  <div className={styles.copyFields}>
                    {textFields.map(renderField)}
                  </div>
                </div>
              );
              return sectionId === "faq" && group.id !== "intro" ? (
                <details
                  className={styles.questionGroup}
                  key={group.id}
                  open={
                    group.id === "faq.questions.0" ||
                    group.fields.some((field) =>
                      invalidFields.some(
                        (invalid) => invalid.key === field.key,
                      ),
                    )
                  }
                >
                  <summary>
                    <span>{group.title}</span>
                    <span className={styles.questionSummary}>
                      {draft[`${group.id}.question`] ??
                        defaults[`${group.id}.question`]}
                    </span>
                  </summary>
                  {content}
                </details>
              ) : (
                <section
                  key={group.id}
                  className={styles.fieldGroup}
                  aria-label={group.title}
                >
                  <h3>{group.title}</h3>
                  {content}
                </section>
              );
            })}
            {sectionId === "bookmarks" && bookmarkIndex === 0 && (
              <FeaturedCoachPicker
                coaches={showcaseData.coaches}
                selectedIds={selectedCoachIds}
                frameValues={draft}
                onFrameChange={update}
                onChange={(ids) => {
                  setSaved(false);
                  setDraft((current) => ({
                    ...current,
                    [FEATURED_COACH_IDS]: ids.join(","),
                  }));
                }}
              />
            )}
          </fieldset>
          <p className={styles.note}>
            Live account counts, class prices, bookings and sign-in links are
            managed by the system.
          </p>
        </section>
      </div>
      {preview && (
        <Dialog
          title={`${selected.label} preview`}
          description="Unsaved changes are visible only in this preview."
          size="lg"
          className={styles.previewDialog}
          onClose={() => setPreview(false)}
        >
          <div
            className={`${styles.preview} ${cinema.theme}`}
            onClickCapture={(event) => {
              if (event.target instanceof Element && event.target.closest("a"))
                event.preventDefault();
            }}
          >
            <LandingContentProvider preview={draft}>
              <SectionPreview
                id={sectionId}
                bookmarkIndex={bookmarkIndex}
                showcaseData={showcaseData}
              />
            </LandingContentProvider>
          </div>
        </Dialog>
      )}
    </form>
  );
}
