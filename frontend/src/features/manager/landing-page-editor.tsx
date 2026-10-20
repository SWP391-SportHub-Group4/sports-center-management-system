"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, Eye, Save, RotateCcw } from "lucide-react";
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
import styles from "./landing-page-editor.module.css";

const sections = [
  {
    id: "hero",
    label: "Hero",
    hint: "The first message visitors see.",
    defaults: heroCopy.en,
  },
  {
    id: "bookmarks",
    label: "Bookmarks",
    hint: "Coaches, courts and the Member community. Three images per category.",
    defaults: homepageCategories,
  },
  {
    id: "gallery",
    label: "Photo banner",
    hint: "Images and captions in the scrolling gallery.",
    defaults: { title: "Energy across every court", photos: galleryPhotos },
  },
  {
    id: "arena",
    label: "Arena tour",
    hint: "Introduce each sport and its training space.",
    defaults: arenaCopy.en,
  },
  {
    id: "booking",
    label: "Court booking",
    hint: "Invite visitors to find their next court.",
    defaults: bookingCopy,
  },
  {
    id: "faq",
    label: "FAQ",
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
const allFields = sections.flatMap(fieldsFor);
const defaults = Object.fromEntries(
  allFields.map((field) => [field.key, field.original]),
);

function SectionPreview({
  id,
  bookmarkIndex,
}: {
  id: string;
  bookmarkIndex: number;
}) {
  const views: Record<string, ReactNode> = {
    hero: <PerformanceSections language="en" />,
    bookmarks: (
      <HomepageStats
        language="en"
        initialCategory={homepageCategories[bookmarkIndex].id}
      />
    ),
    gallery: <TrainingPhotoMarquee language="en" />,
    arena: <InteractiveArenaTour language="en" />,
    booking: <CourtBookingSection language="en" />,
    faq: <HomepageFAQ language="en" />,
  };
  return views[id];
}

export function LandingPageEditor() {
  const state = useApi(
    (signal) => api.get<LandingDocument>("/api/landing-page", { signal }),
    [],
  );
  if (state.loading)
    return <StateView kind="loading" title="Loading landing page" />;
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
      key={state.data.revision}
      initial={state.data}
      onReload={state.reload}
    />
  );
}

function ContentEditor({
  initial,
  onReload,
}: {
  initial: LandingDocument;
  onReload: () => void;
}) {
  const [sectionId, setSectionId] = useState("hero");
  const [bookmarkIndex, setBookmarkIndex] = useState(0);
  const [document, setDocument] = useState(initial);
  const [draft, setDraft] = useState(initial.values);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [preview, setPreview] = useState(false);
  const selected = sections.find((section) => section.id === sectionId)!;
  const dirty = JSON.stringify(draft) !== JSON.stringify(document.values);
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
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
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
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy || !dirty) return;
        if (invalidFields.length) {
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
        setSaved(false);
        try {
          const result = await api.put<LandingDocument>("/api/landing-page", {
            ...document,
            values: draft,
          });
          setDocument(result);
          setDraft(result.values);
          setSaved(true);
        } catch (cause) {
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
              ? "Unsaved changes"
              : saved
                ? "Changes are live"
                : "Published content"}
          </strong>
          <span>
            {document.updatedAt
              ? `Last saved ${new Date(document.updatedAt).toLocaleString("en-GB")}`
              : "Using the original homepage content"}
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
            onClick={() => setPreview(true)}
          >
            <Eye size={16} aria-hidden="true" />
            Preview
          </button>
          <button type="submit" className="btn" disabled={busy || !dirty}>
            <Save size={16} aria-hidden="true" />
            {busy ? "Saving…" : "Save & publish"}
          </button>
        </div>
      </header>
      {error && (
        <div className={styles.error} role="alert">
          {error}
          <p>
            Your edits are still here. If another Manager changed the page, copy
            your edits before loading the latest version.
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
        </div>
      )}
      <div className={styles.layout}>
        <aside className={styles.sidebar} aria-label="Homepage sections">
          <h2>Page sections</h2>
          {sections.map((section) => (
            <button
              type="button"
              key={section.id}
              aria-pressed={sectionId === section.id}
              onClick={() => setSectionId(section.id)}
              disabled={busy}
            >
              {section.label}
              <span>
                {Object.keys(draft).filter((key) =>
                  key.startsWith(`${section.id}.`),
                ).length || ""}
              </span>
            </button>
          ))}
          <p>
            Changes appear on the public homepage after saving. Images use HTTPS
            URLs or existing /sporthub/ assets.
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
                busy ||
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
                  disabled={busy}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <fieldset disabled={busy} className={styles.fields}>
            {visibleFields.map((field) => (
              <div
                key={field.key}
                className={field.image ? styles.imageField : styles.textField}
              >
                {field.image && (
                  <div className={styles.imagePreview}>
                    <HomepageImage
                      src={
                        validLandingImage(draft[field.key] ?? field.original)
                          ? (draft[field.key] ?? field.original)
                          : field.original
                      }
                      alt="Content image preview"
                      fill
                      sizes="320px"
                    />
                  </div>
                )}
                <Field
                  label={field.label}
                  error={
                    invalidFields.some((invalid) => invalid.key === field.key)
                      ? field.image
                        ? "Enter an HTTPS image URL or /sporthub/ path."
                        : "Content cannot be empty."
                      : undefined
                  }
                  hint={
                    field.image
                      ? "HTTPS image URL or /sporthub/ path"
                      : undefined
                  }
                >
                  <textarea
                    name={field.key}
                    value={draft[field.key] ?? field.original}
                    maxLength={2000}
                    required
                    rows={field.image ? 2 : field.original.length > 90 ? 3 : 2}
                    onChange={(event) => update(field.key, event.target.value)}
                  />
                </Field>
              </div>
            ))}
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
              <SectionPreview id={sectionId} bookmarkIndex={bookmarkIndex} />
            </LandingContentProvider>
          </div>
        </Dialog>
      )}
    </form>
  );
}
