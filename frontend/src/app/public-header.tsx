"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AccountMenu } from "@/components/brand/AccountMenu";
import { CourtIcon } from "@/components/brand/CourtIcon";
import { HOME_BY_ROLE, useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
import styles from "./public-header.module.css";

export function PublicHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const navLinks = useRef<HTMLDivElement>(null);
  const indicator = useRef<HTMLSpanElement>(null);
  const [activeSection, setActiveSection] = useState("top");
  const [scrolled, setScrolled] = useState(false);
  const homepage = usePathname() === "/";
  const { user, loading, logout } = useAuth();
  const { language, toggleLanguage, t } = useLanguage();
  const vi = language === "vi";
  const copy = vi
    ? {
        menu: "Mở điều hướng",
        closeMenu: "Đóng điều hướng",
        home: "SportHub, trang chủ",
        hero: "Trang chủ",
        coaches: "Huấn luyện viên",
        facilities: "Sân tập",
        membership: "Hội viên",
        bookCourt: "Đặt sân",
        arenaTour: "Khám phá sân",
        contact: "Liên hệ",
        signIn: "Đăng nhập",
        signUp: "Đăng ký",
        mySpace: "Không gian của tôi",
        account: "Tài khoản & bảo mật",
        subtitle: "Tài khoản SportHub",
      }
    : {
        menu: "Open navigation",
        closeMenu: "Close navigation",
        home: "SportHub, homepage",
        hero: "Home",
        coaches: "Coaches",
        facilities: "Facilities",
        membership: "Members",
        bookCourt: "Book court",
        arenaTour: "Tour arena",
        contact: "Contact",
        signIn: "Sign in",
        signUp: "Sign up",
        mySpace: "My space",
        account: "Account & security",
        subtitle: "SportHub account",
      };

  useEffect(() => {
    if (!menuOpen) return;
    const dismissOutside = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node))
        setMenuOpen(false);
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuTrigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!homepage || !("IntersectionObserver" in window)) return;
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>("[data-home-section]"),
    );
    const visible = new Set<Element>();
    let footerVisible = false;
    const selectCurrent = () => {
      if (footerVisible) {
        setActiveSection("contact");
        return;
      }
      const current = sections
        .filter((node) => visible.has(node))
        .sort(
          (a, b) =>
            Math.abs(a.getBoundingClientRect().top - 96) -
            Math.abs(b.getBoundingClientRect().top - 96),
        )[0];
      if (current?.dataset.homeSection)
        setActiveSection(current.dataset.homeSection);
    };
    let observer: IntersectionObserver;
    const observeSections = () => {
      observer?.disconnect();
      visible.clear();
      // Pixel margins avoid vertical percentages being resolved against viewport width.
      const bottomInset = Math.max(
        0,
        window.innerHeight - 80 - Math.min(220, window.innerHeight * 0.3),
      );
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) visible.add(entry.target);
            else visible.delete(entry.target);
          });
          selectCurrent();
        },
        {
          rootMargin: `-80px 0px -${bottomInset}px 0px`,
          threshold: [0, 0.05, 0.25, 0.5, 0.75, 1],
        },
      );
      sections.forEach((node) => observer.observe(node));
    };
    observeSections();
    window.addEventListener("resize", observeSections);
    const selectShowcase = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (["coaches", "facilities", "membership"].includes(id))
        setActiveSection(id);
    };
    window.addEventListener("sporthub:showcase", selectShowcase);
    const sentinel = document.getElementById("home-nav-sentinel");
    const topObserver = new IntersectionObserver(([entry]) =>
      setScrolled(!entry.isIntersecting),
    );
    if (sentinel) topObserver.observe(sentinel);
    // The footer can never reach the top band on shorter viewports.
    const footer = document.getElementById("contact");
    const footerObserver = new IntersectionObserver(
      ([entry]) => {
        footerVisible = entry.isIntersecting;
        selectCurrent();
      },
      { threshold: 0.35 },
    );
    if (footer) footerObserver.observe(footer);
    return () => {
      observer.disconnect();
      topObserver.disconnect();
      footerObserver.disconnect();
      window.removeEventListener("resize", observeSections);
      window.removeEventListener("sporthub:showcase", selectShowcase);
    };
  }, [homepage]);

  const positionIndicator = (id: string) => {
    const link = navLinks.current?.querySelector<HTMLElement>(
      `[data-section="${id}"]`,
    );
    if (!link || !indicator.current) return;
    indicator.current.style.setProperty(
      "--indicator-x",
      `${link.offsetLeft}px`,
    );
    indicator.current.style.setProperty(
      "--indicator-width",
      `${link.offsetWidth}px`,
    );
    indicator.current.dataset.positioned = "true";
  };

  useEffect(() => {
    const links = navLinks.current;
    if (!links || !homepage) return;
    const update = () => {
      const link = links.querySelector<HTMLElement>(
        `[data-section="${activeSection}"]`,
      );
      if (!link || !indicator.current) return;
      indicator.current.style.setProperty(
        "--indicator-x",
        `${link.offsetLeft}px`,
      );
      indicator.current.style.setProperty(
        "--indicator-width",
        `${link.offsetWidth}px`,
      );
      indicator.current.dataset.positioned = "true";
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(links);
    Array.from(links.querySelectorAll("a")).forEach((link) =>
      observer.observe(link),
    );
    return () => observer.disconnect();
  }, [activeSection, language, menuOpen, homepage]);

  const closeMenu = () => setMenuOpen(false);
  const sections = [
    { id: "top", label: copy.hero },
    { id: "coaches", label: copy.coaches },
    { id: "facilities", label: copy.facilities },
    { id: "membership", label: copy.membership },
    { id: "activities", label: copy.arenaTour },
    { id: "book-court", label: copy.bookCourt },
    { id: "contact", label: copy.contact },
  ];

  return (
    <header
      ref={headerRef}
      className={`${styles.header} ${scrolled || !homepage ? styles.scrolled : ""}`}
    >
      <Link
        className={styles.logo}
        href="/#top"
        aria-label={copy.home}
        onClick={closeMenu}
      >
        <span className={styles.logoMark} aria-hidden="true">
          <CourtIcon name="gym" size={19} />
        </span>
        <span className={styles.logoWord}>
          Sport<span className={styles.logoAccent}>Hub</span>
        </span>
      </Link>

      <button
        ref={menuTrigger}
        className={styles.menuToggle}
        type="button"
        aria-expanded={menuOpen}
        aria-controls="public-navigation"
        aria-label={menuOpen ? copy.closeMenu : copy.menu}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <CourtIcon name={menuOpen ? "close" : "menu"} size={20} />
      </button>

      <nav
        id="public-navigation"
        className={`${styles.navigation} ${menuOpen ? styles.navigationOpen : ""}`}
        aria-label={vi ? "Điều hướng chính" : "Main navigation"}
      >
        <div
          ref={navLinks}
          className={styles.navLinks}
          onPointerLeave={() => positionIndicator(activeSection)}
          onBlur={(event) => {
            if (
              !event.currentTarget.contains(event.relatedTarget as Node | null)
            )
              positionIndicator(activeSection);
          }}
        >
          {sections.map((section) => (
            <Link
              key={section.id}
              data-section={section.id}
              href={`/#${section.id}`}
              aria-current={
                homepage && activeSection === section.id
                  ? "location"
                  : undefined
              }
              onPointerEnter={() => positionIndicator(section.id)}
              onFocus={() => positionIndicator(section.id)}
              onClick={() => {
                closeMenu();
                if (homepage) {
                  setActiveSection(section.id);
                  window.dispatchEvent(
                    new CustomEvent("sporthub:section", { detail: section.id }),
                  );
                }
              }}
            >
              {section.label}
            </Link>
          ))}
          <span
            ref={indicator}
            className={styles.navIndicator}
            aria-hidden="true"
          />
        </div>

        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.langToggle}
            onClick={toggleLanguage}
            title={t.publicNav.toggleLang}
            aria-label={t.publicNav.toggleLang}
          >
            <span className={language === "en" ? styles.langActive : ""}>
              EN
            </span>
            <span className={styles.langDivider}>/</span>
            <span className={language === "vi" ? styles.langActive : ""}>
              VI
            </span>
          </button>

          {loading ? (
            <span
              className={styles.accountLoading}
              aria-label={vi ? "Đang tải tài khoản" : "Loading account"}
              aria-busy="true"
            />
          ) : user ? (
            <AccountMenu
              name={user.fullName}
              subtitle={copy.subtitle}
              logoutLabel={t.common.logout}
              onSignOut={logout}
              links={[
                {
                  href: HOME_BY_ROLE[user.role],
                  label: copy.mySpace,
                  icon: "calendar",
                },
                {
                  href: "/account",
                  label: copy.account,
                  icon: "shield",
                },
                ...(user.role === "Member"
                  ? [
                      {
                        href: "/member/finance?tab=wallet",
                        label: vi ? "Ví điểm" : "Point wallet",
                        icon: "wallet" as const,
                      },
                    ]
                  : []),
              ]}
            />
          ) : (
            <div className={styles.authLinks}>
              <Link className={styles.signIn} href="/login" onClick={closeMenu}>
                {copy.signIn}
              </Link>
              <Link
                className={styles.signUp}
                href="/register"
                onClick={closeMenu}
              >
                {copy.signUp}
                <CourtIcon name="arrow" size={17} />
              </Link>
            </div>
          )}
        </div>
      </nav>
    </header>
  );
}
