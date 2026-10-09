"use client";
import { PublicHeader } from "./public-header";
import { useLanguage } from "@/lib/language";
import s from "./landing.module.css";
import cinema from "@/components/brand/cinema-theme.module.css";
import { PerformanceSections } from "@/components/homepage/PerformanceSections";
import { HomepageStats } from "@/components/homepage/HomepageStats";
import { InteractiveArenaTour } from "@/components/homepage/InteractiveArenaTour";
import { TrainingPhotoMarquee } from "@/components/homepage/TrainingPhotoMarquee";
import { HomepageFAQ } from "@/components/homepage/HomepageFAQ";
import { CourtBookingSection } from "@/components/homepage/CourtBookingSection";
import { ScrollReveal } from "@/components/homepage/ScrollReveal";

export default function Page() {
  const { language } = useLanguage();
  const vi = language === "vi";
  const text = (vn: string, en: string) => (vi ? vn : en);
  return (
    <div
      id="top"
      className={`${s.page} ${cinema.theme}`}
      lang={language}
      data-theme="arena-cinema"
    >
      <span id="home-nav-sentinel" className={s.sentinel} aria-hidden="true" />
      <a className={s.skip} href="#main-content">
        {text("Đến nội dung chính", "Skip to content")}
      </a>
      <PublicHeader />
      <main className={s.main} id="main-content">
        <PerformanceSections language={language} />
        <div className={s.content}>
          <HomepageStats language={language} />
          <ScrollReveal section="facilities">
            <TrainingPhotoMarquee language={language} />
          </ScrollReveal>
          <ScrollReveal section="activities">
            <InteractiveArenaTour language={language} />
          </ScrollReveal>
          <ScrollReveal section="book-court">
            <CourtBookingSection language={language} />
          </ScrollReveal>
          <ScrollReveal section="membership">
            <HomepageFAQ language={language} />
          </ScrollReveal>
        </div>
      </main>
    </div>
  );
}
