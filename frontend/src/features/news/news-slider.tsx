"use client";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/shared/ui";
const slides = [
  {
    title: "Start new week with Yoga",
    text: "Discovering classes and new events at the center.",
    href: "/member/calendar",
  },
  {
    title: "Find a fellow trainee",
    text: "Meet SportHub coach team.",
    href: "/member/coaches",
  },
  {
    title: "Maintaining Habits, Practices",
    text: "Look at the plans and remarks from the coach.",
    href: "/member/training",
  },
];
export function NewsSlider() {
  const [index, setIndex] = useState(0);
  const slide = slides[index];
  return (
    <section
      className="news-slider"
      aria-roledescription="slideshow"
      aria-label="SportHub News"
    >
      <div className="news-copy" aria-live="polite">
        <small>ENJOY IN SYPHHB</small>
        <h2>
          <Link href={slide.href}>{slide.title}</Link>
        </h2>
        <p>{slide.text}</p>
      </div>
      <div className="row slider-controls">
        <Button
          variant="quiet"
          aria-label="Previous News"
          onClick={() => setIndex((index + slides.length - 1) % slides.length)}
        >
          ‹
        </Button>
        <span>
          {index + 1} / {slides.length}
        </span>
        <Button
          variant="quiet"
          aria-label="Next news."
          onClick={() => setIndex((index + 1) % slides.length)}
        >
          ›
        </Button>
      </div>
    </section>
  );
}
