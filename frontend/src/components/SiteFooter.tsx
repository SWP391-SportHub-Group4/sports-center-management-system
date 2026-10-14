"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import { Phone, Mail, MapPin, Clock } from "lucide-react";
import { useLanguage } from "@/lib/language";
import { usePathname } from "next/navigation";
import styles from "./SiteFooter.module.css";

export function SiteFooter() {
  const { language } = useLanguage();
  const en = language === "en";
  const pathname = usePathname();
  const [contact, setContact] = useState<{
    phone: string | null;
    email: string | null;
    address: string | null;
    hours: string | null;
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    api
      .get<{ contact: NonNullable<typeof contact> }>("/api/public/overview", {
        anonymous: true,
        signal: controller.signal,
      })
      .then((data) => {
        if (!controller.signal.aborted) setContact(data.contact);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  const cinematic = ["/", "/login", "/register"].includes(pathname);
  const manager = pathname === "/manager" || pathname.startsWith("/manager/");

  if (pathname === "/login" || pathname === "/register") return null;

  return (
    <footer
      id="contact"
      className={`${styles.footer} ${cinematic ? styles.cinema : ""} ${manager ? styles.flush : ""}`}
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
          <ul>
            {contact?.phone && (
              <li>
                <Phone size={16} aria-hidden="true" />{" "}
                <a href={`tel:${contact.phone.replace(/[^+0-9]/g, "")}`}>
                  {contact.phone}
                </a>
              </li>
            )}
            {contact?.email && (
              <li>
                <Mail size={16} aria-hidden="true" />{" "}
                <a href={`mailto:${contact.email}`}>{contact.email}</a>
              </li>
            )}
            {contact?.address && (
              <li>
                <MapPin size={16} aria-hidden="true" /> {contact.address}
              </li>
            )}
            {contact?.hours && (
              <li>
                <Clock size={16} aria-hidden="true" /> {contact.hours}
              </li>
            )}
            {!contact || !Object.values(contact).some(Boolean) ? (
              <li>Contact details are currently unavailable.</li>
            ) : null}
          </ul>
        </section>
      </div>
      <p className={styles.legal}>© 2026 SportHub</p>
    </footer>
  );
}
