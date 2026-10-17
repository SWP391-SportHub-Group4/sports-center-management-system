"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import { Phone, Mail, MapPin, Clock } from "lucide-react";
import { useLanguage } from "@/lib/language";
import { usePathname } from "next/navigation";
import styles from "./SiteFooter.module.css";

interface ContactDetails {
  phone: string | null;
  email: string | null;
  address: string | null;
  hours: string | null;
}

// Presentation samples only. PublicContact configuration overrides each field.
const DEFAULT_CONTACT = {
  phone: "+84 28 0000 0000",
  email: "contact@sporthub.example",
  address: "123 Sports Avenue, District 1, Ho Chi Minh City",
  hours: "06:00 – 22:00",
};

export function SiteFooter() {
  const { language } = useLanguage();
  const en = language === "en";
  const pathname = usePathname();
  const [contact, setContact] = useState<ContactDetails | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    api
      .get<{ contact: ContactDetails }>("/api/public/overview", {
        anonymous: true,
        signal: controller.signal,
      })
      .then((data) => {
        if (!controller.signal.aborted) setContact(data.contact);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  const details = {
    phone: contact?.phone?.trim() || DEFAULT_CONTACT.phone,
    email: contact?.email?.trim() || DEFAULT_CONTACT.email,
    address: contact?.address?.trim() || DEFAULT_CONTACT.address,
    hours: contact?.hours?.trim() || DEFAULT_CONTACT.hours,
  };
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
              ? "A training home for badminton, basketball and gym."
              : "Không gian tập luyện cho cầu lông, bóng rổ và Gym."}
          </p>
        </div>

        <section aria-labelledby="site-footer-sports">
          <h2 id="site-footer-sports">{en ? "Sports" : "Môn tập"}</h2>
          <ul>
            <li>{en ? "Badminton" : "Cầu lông"}</li>
            <li>{en ? "Basketball" : "Bóng rổ"}</li>
            <li>{en ? "Gym & conditioning" : "Gym & thể lực"}</li>
          </ul>
        </section>

        <section aria-labelledby="site-footer-contact">
          <h2 id="site-footer-contact">{en ? "Contact" : "Liên hệ"}</h2>
          <ul className={styles.contactList}>
            <li>
              <Phone size={18} aria-hidden="true" />
              <div>
                <span className={styles.contactLabel}>
                  {en ? "Phone" : "Điện thoại"}
                </span>
                <a href={`tel:${details.phone.replace(/[^+0-9]/g, "")}`}>
                  {details.phone}
                </a>
              </div>
            </li>
            <li>
              <Mail size={18} aria-hidden="true" />
              <div>
                <span className={styles.contactLabel}>Email</span>
                <a href={`mailto:${details.email}`}>{details.email}</a>
              </div>
            </li>
            <li>
              <MapPin size={18} aria-hidden="true" />
              <div>
                <span className={styles.contactLabel}>
                  {en ? "Visit us" : "Địa chỉ"}
                </span>
                <span>{details.address}</span>
              </div>
            </li>
            <li>
              <Clock size={18} aria-hidden="true" />
              <div>
                <span className={styles.contactLabel}>
                  {en ? "Opening hours" : "Giờ hoạt động"}
                </span>
                <span>
                  {contact?.hours?.trim()
                    ? details.hours
                    : `${en ? "Daily" : "Hằng ngày"} · ${details.hours}`}
                </span>
              </div>
            </li>
          </ul>
        </section>
      </div>
      <p className={styles.legal}>© 2026 SportHub</p>
    </footer>
  );
}
