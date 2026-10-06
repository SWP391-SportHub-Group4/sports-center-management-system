"use client";
import { PublicHeader } from "./public-header";
import { useLanguage } from "@/lib/language";
import { Clock3, Mail, MapPin, Phone } from "lucide-react";
import s from "./landing.module.css";
import { PerformanceSections } from "@/components/homepage/PerformanceSections";
import { HomepageStats } from "@/components/homepage/HomepageStats";
import { InteractiveArenaTour } from "@/components/homepage/InteractiveArenaTour";
import { TrainingPhotoMarquee } from "@/components/homepage/TrainingPhotoMarquee";

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
        <TrainingPhotoMarquee language={language} />
      </main>
      <footer className={s.footer} aria-label={text("Chân trang", "Footer")}>
        <div className={s.footerGrid}>
          <section className={s.footerBrand} aria-label="SportHub">
            <span className={s.wordmark}>
              Sport<span className={s.wordmarkAccent}>Hub</span>
            </span>
            <p>
              {text(
                "Không gian tập luyện cho cầu lông, bóng rổ, Gym và huấn luyện cá nhân.",
                "A training home for badminton, basketball, Gym and personal coaching.",
              )}
            </p>
          </section>

          <section className={s.footerColumn} aria-labelledby="footer-sports">
            <h2 id="footer-sports">
              {text("Bộ môn", "Sports")}
            </h2>
            <ul>
              <li>{text("Cầu lông", "Badminton")}</li>
              <li>{text("Bóng rổ", "Basketball")}</li>
              <li>{text("Gym & thể lực", "Gym & conditioning")}</li>
              <li>{text("Huấn luyện cá nhân", "Personal training")}</li>
            </ul>
          </section>

          <section className={s.footerColumn} aria-labelledby="footer-contact">
            <div className={s.contactHeading}>
              <h2 id="footer-contact">{text("Liên hệ", "Contact")}</h2>
            </div>
            <ul className={s.contactList}>
              <li>
                <Phone size={18} aria-hidden="true" />
                <div>
                  <span>{text("Hotline", "Phone")}</span>
                  <a href="tel:+842873002026">(+84) 28 7300 2026</a>
                </div>
              </li>
              <li>
                <Mail size={18} aria-hidden="true" />
                <div>
                  <span>Email</span>
                  <a href="mailto:hello@sporthub.vn">hello@sporthub.vn</a>
                </div>
              </li>
              <li>
                <MapPin size={18} aria-hidden="true" />
                <div>
                  <span>{text("Địa chỉ", "Address")}</span>
                  <p>{text("123 Đường Thể Thao, Quận 1, TP. Hồ Chí Minh", "123 Sports Avenue, District 1, Ho Chi Minh City")}</p>
                </div>
              </li>
              <li>
                <Clock3 size={18} aria-hidden="true" />
                <div>
                  <span>{text("Giờ hoạt động", "Opening hours")}</span>
                  <p>{text("Hằng ngày, 06:00–22:00", "Daily, 6:00 AM–10:00 PM")}</p>
                </div>
              </li>
            </ul>
          </section>
        </div>

        <div className={s.footerBottom}>
          <small>© 2026 SportHub</small>
        </div>
      </footer>
    </div>
  );
}
