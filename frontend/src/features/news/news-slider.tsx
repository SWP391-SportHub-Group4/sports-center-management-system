"use client";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/shared/ui";
const slides = [
  {
    title: "Cùng khởi động tuần mới với Yoga",
    text: "Khám phá lớp học và sự kiện mới tại trung tâm.",
    href: "/member/calendar",
  },
  {
    title: "Tìm người đồng hành tập luyện",
    text: "Làm quen với đội ngũ huấn luyện viên SportHub.",
    href: "/member/coaches",
  },
  {
    title: "Duy trì thói quen, từng buổi tập",
    text: "Xem kế hoạch và nhận xét từ huấn luyện viên.",
    href: "/member/training",
  },
];
export function NewsSlider() {
  const [index, setIndex] = useState(0);
  const slide = slides[index];
  return (
    <section
      className="news-slider"
      aria-roledescription="trình chiếu"
      aria-label="Tin tức SportHub"
    >
      <div className="news-copy" aria-live="polite">
        <small>MỚI TẠI SPORTHUB</small>
        <h2>
          <Link href={slide.href}>{slide.title}</Link>
        </h2>
        <p>{slide.text}</p>
      </div>
      <div className="row slider-controls">
        <Button
          variant="quiet"
          aria-label="Tin trước"
          onClick={() => setIndex((index + slides.length - 1) % slides.length)}
        >
          ‹
        </Button>
        <span>
          {index + 1} / {slides.length}
        </span>
        <Button
          variant="quiet"
          aria-label="Tin tiếp theo"
          onClick={() => setIndex((index + 1) % slides.length)}
        >
          ›
        </Button>
      </div>
    </section>
  );
}
