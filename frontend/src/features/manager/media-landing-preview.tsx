"use client";

import { useState, type CSSProperties } from "react";
import { MediaEditableText } from "./media-editable-text";
import { ArrowRight, ImagePlus } from "lucide-react";
import HomepageImage from "@/components/homepage/HomepageImage";
import { heroCopy } from "@/components/homepage/PerformanceSections";
import { sportGalleryTitle } from "@/components/homepage/sport-gallery";
import { MediaSportGallery } from "./media-sport-gallery";
import {
  arenaCopy,
  ZoneFloorPlan,
} from "@/components/homepage/InteractiveArenaTour";
import { bookingCopy } from "@/components/homepage/CourtBookingSection";
import { faqCopy } from "@/components/homepage/HomepageFAQ";
import {
  useLandingCopy,
  useLandingValues,
} from "@/components/homepage/landing-content-context";
import {
  featuredCoachIds,
  resolveHomepageShowcase,
  type HomepageShowcaseSources,
} from "@/components/homepage/homepage-showcase";
import {
  homepageImageSpecs,
  imageSpecForField,
} from "@/components/homepage/image-specs";
import { DEFAULT_AVATAR } from "@/lib/avatar";
import { homepageIntroCopy } from "@/components/homepage/homepage-content";
import arenaStyles from "@/components/homepage/interactive-arena-tour.module.css";
import styles from "./media-editor.module.css";

export type MediaImageTarget = {
  key: string;
  src: string;
  alt: string;
  label: string;
};

function EditableImage({
  target,
  changed,
  disabled,
  onEdit,
  frame,
}: {
  target: MediaImageTarget;
  changed: boolean;
  disabled: boolean;
  onEdit: () => void;
  frame?: CSSProperties;
}) {
  return (
    <div
      className={styles.editableImage}
      data-changed={changed || undefined}
      style={{
        aspectRatio: frame
          ? homepageImageSpecs.coach.ratio
          : imageSpecForField(target.key).ratio,
      }}
    >
      <HomepageImage
        src={target.src}
        alt={target.alt}
        fill
        sizes="(max-width: 700px) 90vw, (max-width: 1100px) 45vw, 400px"
        fallbackSrc={frame ? DEFAULT_AVATAR : undefined}
        style={frame}
      />
      {changed && <span className={styles.changedBadge}>Unsaved</span>}
      <div className={styles.imageControls}>
        <button
          type="button"
          className={styles.replaceButton}
          disabled={disabled}
          aria-label={`${frame ? "Edit coach" : "Replace image"}: ${target.label}`}
          onClick={onEdit}
        >
          <ImagePlus size={17} aria-hidden="true" />
          {frame ? "Edit coach" : "Replace image"}
        </button>
      </div>
    </div>
  );
}

export function MediaLandingPreview({
  showcaseData,
  changedKeys,
  disabled,
  onImage,
  onCoaches,
  onText,
}: {
  showcaseData: HomepageShowcaseSources;
  changedKeys: string[];
  disabled: boolean;
  onImage: (target: MediaImageTarget) => void;
  onCoaches: () => void;
  onText: (field: string, value: string | undefined) => void;
}) {
  const [categoryIndex, setCategoryIndex] = useState(0);
  const [zoneId, setZoneId] = useState<
    "badminton" | "basketball" | "conditioning"
  >("badminton");
  const values = useLandingValues();
  const hero = useLandingCopy("hero", heroCopy.en);
  const intro = useLandingCopy("bookmarks.intro", homepageIntroCopy);
  const categories = useLandingCopy(
    "bookmarks",
    resolveHomepageShowcase(
      showcaseData.coaches,
      showcaseData.overview,
      featuredCoachIds(values),
      values,
    ),
  );
  const gallery = useLandingCopy("gallery", {
    title: sportGalleryTitle,
  });
  const arena = useLandingCopy("arena", arenaCopy.en);
  const booking = useLandingCopy("booking", bookingCopy);
  const faq = useLandingCopy("faq", faqCopy.en);
  const category = categories[categoryIndex];
  const zone = arena.zones[zoneId];
  const text = (
    field: string,
    label: string,
    value: string,
    as: "h2" | "h3" | "p" | "span" | "small" | "figcaption" = "span",
    id?: string,
    onSelect?: () => void,
  ) => (
    <MediaEditableText
      key={field}
      field={field}
      label={label}
      value={value}
      as={as}
      id={id}
      disabled={disabled}
      onChange={onText}
      onSelect={onSelect}
    />
  );
  const image = (target: MediaImageTarget) => (
    <EditableImage
      target={target}
      changed={changedKeys.includes(target.key)}
      disabled={disabled}
      onEdit={() => onImage(target)}
    />
  );

  return (
    <div className={styles.landing} aria-label="Editable homepage preview">
      <div className={styles.previewHeader}>
        <div className={styles.logoEditor}>
          {values["brand.logo.image"] ? (
            <HomepageImage
              src={values["brand.logo.image"]}
              alt="Homepage logo"
              width={180}
              height={56}
              className={styles.logoImage}
            />
          ) : (
            <strong>
              Sport<span>Hub</span>
            </strong>
          )}
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            disabled={disabled}
            onClick={() =>
              onImage({
                key: "brand.logo.image",
                src: values["brand.logo.image"] ?? "",
                alt: "Homepage logo",
                label: "Homepage logo",
              })
            }
          >
            <ImagePlus size={16} aria-hidden="true" /> Change logo
          </button>
        </div>
        <span>
          Double-click text to edit. Enter to finish; Shift+Enter for a new
          line; Esc to undo.
        </span>
      </div>
      <section id="media-hero" className={styles.hero} aria-label="Hero">
        {text("hero.title", "Hero title", hero.title, "h2")}
        {text("hero.lead", "Hero description", hero.lead, "p")}
        <span className={styles.mockCta}>
          {text("hero.start", "Hero button label", hero.start)}
          <ArrowRight size={17} aria-hidden="true" />
        </span>
        <div className={styles.disciplines}>
          {text("hero.badminton", "Badminton label", hero.badminton)}
          {text("hero.basketball", "Basketball label", hero.basketball)}
          {text("hero.gym", "Gym label", hero.gym)}
        </div>
      </section>

      <section
        id="media-bookmarks"
        className={styles.section}
        aria-labelledby="media-community-title"
      >
        {text(
          "bookmarks.intro.title",
          "Community title",
          intro.title,
          "h2",
          "media-community-title",
        )}
        {text("bookmarks.intro.lead", "Community description", intro.lead, "p")}
        <div
          className={styles.categoryTabs}
          role="group"
          aria-label="Showcase category"
        >
          {categories.map((entry, index) => (
            <div
              key={entry.id}
              className={styles.categoryTab}
              data-active={categoryIndex === index || undefined}
            >
              {text(
                `bookmarks.${index}.title.en`,
                `${entry.id} category title`,
                entry.title.en,
                "span",
                undefined,
                () => setCategoryIndex(index),
              )}
              <button
                type="button"
                aria-label={`Show ${entry.title.en}`}
                aria-pressed={categoryIndex === index}
                onClick={() => setCategoryIndex(index)}
              >
                {entry.value ?? "—"}
              </button>
            </div>
          ))}
        </div>
        <div className={styles.sectionTools}>
          {categoryIndex === 0 && (
            <button
              type="button"
              className={styles.chooseCoaches}
              disabled={disabled}
              onClick={onCoaches}
            >
              Choose coaches
            </button>
          )}
        </div>
        {text(
          `bookmarks.${categoryIndex}.lead.en`,
          `${category.id} description`,
          category.lead.en,
          "p",
        )}
        <div className={styles.showcaseGrid}>
          {category.items.map((item, index) => (
            <article key={`${category.id}-${index}`}>
              {categoryIndex === 0 ? (
                <EditableImage
                  target={{
                    key: `coach-${index}`,
                    src: item.image,
                    alt: item.alt.en,
                    label: item.name.en,
                  }}
                  frame={{
                    objectFit: item.frame?.fit ?? "contain",
                    objectPosition: `${item.frame?.x ?? 50}% ${item.frame?.y ?? 50}%`,
                    transform: `scale(${item.frame?.zoom ?? 1})`,
                  }}
                  changed={changedKeys.some(
                    (key) =>
                      key === "bookmarks.coachIds" ||
                      key.startsWith("bookmarks.coachFrame."),
                  )}
                  disabled={disabled}
                  onEdit={onCoaches}
                />
              ) : (
                image({
                  key: `bookmarks.${categoryIndex}.items.${index}.image`,
                  src: item.image,
                  alt: item.alt.en,
                  label: `${category.title.en} · ${item.name.en}`,
                })
              )}
              {categoryIndex === 0 ? (
                <>
                  <h3>{item.name.en}</h3>
                  <p>{item.detail.en}</p>
                  <small>{item.highlight.en}</small>
                </>
              ) : (
                <>
                  {text(
                    `bookmarks.${categoryIndex}.items.${index}.name.en`,
                    `${category.id} card ${index + 1} title`,
                    item.name.en,
                    "h3",
                  )}
                  {text(
                    `bookmarks.${categoryIndex}.items.${index}.detail.en`,
                    `${category.id} card ${index + 1} description`,
                    item.detail.en,
                    "p",
                  )}
                  {text(
                    `bookmarks.${categoryIndex}.items.${index}.highlight.en`,
                    `${category.id} card ${index + 1} highlight`,
                    item.highlight.en,
                    "small",
                  )}
                </>
              )}
            </article>
          ))}
        </div>
        {category.items.length === 0 && (
          <p>No coaches selected. Use “Choose coaches” to add them.</p>
        )}
      </section>

      <MediaSportGallery
        title={text(
          "gallery.title",
          "Photo banner title",
          gallery.title,
          "h2",
          "media-gallery-title",
        )}
        renderImage={image}
      />

      <section
        id="media-arena"
        className={styles.section}
        aria-labelledby="media-arena-title"
      >
        <div className={styles.headingRow}>
          {text(
            "arena.title",
            "Arena title",
            arena.title,
            "h2",
            "media-arena-title",
          )}
        </div>
        {text("arena.lead", "Arena description", arena.lead, "p")}
        <div className={styles.sportTabs} role="group" aria-label="Arena sport">
          {(["badminton", "basketball", "conditioning"] as const).map((id) => (
            <div
              key={id}
              className={styles.sportTab}
              data-active={zoneId === id || undefined}
            >
              {text(
                `arena.zones.${id}.label`,
                `${id} sport label`,
                arena.zones[id].label,
                "span",
                undefined,
                () => setZoneId(id),
              )}
              <button
                type="button"
                aria-label={`Show ${arena.zones[id].label} zone`}
                aria-pressed={zoneId === id}
                onClick={() => setZoneId(id)}
              >
                <ArrowRight size={14} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
        <div className={styles.arenaGrid}>
          <div
            className={`${styles.floorPlan} ${arenaStyles.mapCanvas}`}
            data-zone={zoneId}
          >
            <ZoneFloorPlan label={arena.mapAlt} onSelect={setZoneId} />
          </div>
          <article>
            {image({
              key: `arena.zones.${zoneId}.image`,
              src: zone.image,
              alt: zone.imageAlt,
              label: `Arena tour · ${zone.label}`,
            })}
            {text(
              `arena.zones.${zoneId}.title`,
              `${zoneId} zone title`,
              zone.title,
              "h3",
            )}
            {text(
              `arena.zones.${zoneId}.description`,
              `${zoneId} zone description`,
              zone.description,
              "p",
            )}
          </article>
        </div>
      </section>

      <section
        id="media-booking"
        className={styles.booking}
        aria-labelledby="media-booking-title"
      >
        {image({
          key: "booking.image",
          src: booking.image,
          alt: booking.imageAlt,
          label: "Court booking",
        })}
        <div>
          {text(
            "booking.title",
            "Booking title",
            booking.title,
            "h2",
            "media-booking-title",
          )}
          {text("booking.lead", "Booking description", booking.lead, "p")}
          {text("booking.sports", "Booking sports", booking.sports, "p")}
          <span className={styles.mockCta}>
            {text("booking.cta", "Booking button label", booking.cta)}
            <ArrowRight size={17} aria-hidden="true" />
          </span>
        </div>
      </section>

      <section
        id="media-faq"
        className={styles.section}
        aria-labelledby="media-faq-title"
      >
        <div className={styles.headingRow}>
          {text("faq.title", "FAQ title", faq.title, "h2", "media-faq-title")}
        </div>
        {text("faq.lead", "FAQ description", faq.lead, "p")}
        <div className={styles.questions}>
          {faq.questions.map((question, index) => (
            <details key={index}>
              <summary>
                {text(
                  `faq.questions.${index}.question`,
                  `FAQ question ${index + 1}`,
                  question.question,
                )}
              </summary>
              {text(
                `faq.questions.${index}.answer`,
                `FAQ answer ${index + 1}`,
                question.answer,
                "p",
              )}
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
