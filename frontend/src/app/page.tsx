"use client";
import { PublicHeader } from "./public-header";
import { useLanguage } from "@/lib/language";
import s from "./landing.module.css";
import { PerformanceSections } from "@/components/homepage/PerformanceSections";
import { HomepageStats } from "@/components/homepage/HomepageStats";
import { InteractiveArenaTour } from "@/components/homepage/InteractiveArenaTour";
import { TrainingPhotoMarquee } from "@/components/homepage/TrainingPhotoMarquee";
import { HomepageFAQ } from "@/components/homepage/HomepageFAQ";
import { CourtBookingSection } from "@/components/homepage/CourtBookingSection";

export default function Page() {
  const { language } = useLanguage();
  const vi = language === "vi";
  const text = (vn: string, en: string) => (vi ? vn : en);
  return (
    <div id="top" className={s.page} lang={language} data-theme="arena-light">
      <a className={s.skip} href="#main-content">
        {text("Đến nội dung chính", "Skip to content")}
      </a>
      <PublicHeader />
      <main className={s.main} id="main-content">
        <PerformanceSections language={language} />
        <HomepageStats language={language} />
        <InteractiveArenaTour language={language} />
        <CourtBookingSection language={language} />
        <TrainingPhotoMarquee language={language} />
        <HomepageFAQ language={language} />
      </main>
    </div>
  );
}
