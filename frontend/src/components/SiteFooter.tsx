"use client";

import { useLanguage } from "@/lib/language";
import { usePathname } from "next/navigation";
import styles from "./SiteFooter.module.css";

export function SiteFooter() {
  const { language } = useLanguage();
  const en = language === "en";
  const pathname = usePathname();
  const cinematic = ["/", "/login", "/register"].includes(pathname);

  if (pathname === "/login" || pathname === "/register") return null;

  return (
    <footer
      id="contact"
      className={`${styles.footer} ${cinematic ? styles.cinema : ""}`}
      style={{ scrollMarginTop: 96 }}
      aria-label={en ? "Footer" : "Chân trang"}
    >
      <div className={styles.inner}>
        <div className={styles.brand}>
          <p className={styles.logo}>
            Sport<span>Hub</span>
          </p>
          <p>
            {en
              ? "A training home for badminton, basketball, gym and personal coaching."
              : "Không gian tập luyện cho cầu lông, bóng rổ, Gym và huấn luyện cá nhân."}
          </p>
        </div>

        <section aria-labelledby="site-footer-sports">
          <h2 id="site-footer-sports">{en ? "Sports" : "Môn tập"}</h2>
          <ul>
            <li>{en ? "Badminton" : "Cầu lông"}</li>
            <li>{en ? "Basketball" : "Bóng rổ"}</li>
            <li>{en ? "Gym & conditioning" : "Gym & thể lực"}</li>
            <li>{en ? "Personal training" : "Huấn luyện cá nhân"}</li>
          </ul>
        </section>

        <section aria-labelledby="site-footer-contact">
          <h2 id="site-footer-contact">{en ? "Contact" : "Liên hệ"}</h2>
          <ul>
            <li>
              <a href="tel:+842873002026">(+84) 28 7300 2026</a>
            </li>
            <li>
              <a href="mailto:hello@sporthub.vn">hello@sporthub.vn</a>
            </li>
            <li>
              {en
                ? "123 Sports Avenue, District 1, Ho Chi Minh City"
                : "123 Đường Thể Thao, Quận 1, TP. Hồ Chí Minh"}
            </li>
            <li>
              {en ? "Daily 6:00 AM - 10:00 PM" : "Hằng ngày 06:00 - 22:00"}
            </li>
          </ul>
        </section>
      </div>
      <p className={styles.legal}>© 2026 SportHub</p>
    </footer>
  );
}
