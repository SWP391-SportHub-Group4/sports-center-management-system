"use client";

import Image from "next/image";
import Link from "next/link";
import { useId, useState } from "react";
import { AccountMenu } from "@/components/brand/AccountMenu";
import { CourtIcon } from "@/components/brand/CourtIcon";
import { Button, buttonClass } from "@/components/primitives/Button";
import styles from "./public-components.module.css";

export interface Course {
  id: string;
  sport: string;
  title: string;
  schedule: string;
  coach: string;
  price: number;
  seats: number;
  sessions: number;
}

export interface PublicNavItem {
  href: string;
  label: string;
}

const defaultNavItems: PublicNavItem[] = [
  { href: "#public", label: "Bộ môn" },
  { href: "#detail", label: "Gym" },
  { href: "#list", label: "Khóa học" },
];

export const money = (value: number) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(
    value,
  );

export const courseImage = (course: Course) =>
  `/sporthub/court-volt/course-${course.id === "basketball" ? "basketball" : "badminton"}.png`;

export function PublicHeader({
  links = defaultNavItems,
  accountName = "Minh Anh",
  onSignOut,
}: {
  links?: PublicNavItem[];
  accountName?: string;
  onSignOut?: () => void;
}) {
  const [signedIn, setSignedIn] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const navId = useId();
  const signOut = () => {
    setSignedIn(false);
    onSignOut?.();
  };
  return (
    <header
      className={styles.header}
      onKeyDown={(event) => {
        if (event.key === "Escape") setExpanded(false);
      }}
    >
      <Link href="#public" className={styles.brand} aria-label="SportHub">
        Sport<span>Hub</span>
      </Link>
      <Button
        className={styles.mobileToggle}
        variant="ghost"
        aria-expanded={expanded}
        aria-controls={navId}
        onClick={() => setExpanded(!expanded)}
      >
        <CourtIcon name={expanded ? "close" : "menu"} size={20} />
        Menu
      </Button>
      <nav
        id={navId}
        className={`${styles.nav} ${expanded ? styles.navOpen : ""}`}
        aria-label="Điều hướng chính"
      >
        {links.map((link) => (
          <Link
            key={`${link.href}-${link.label}`}
            href={link.href}
            onClick={() => setExpanded(false)}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      {signedIn ? (
        <AccountMenu
          name={accountName}
          subtitle="Tài khoản hội viên"
          logoutLabel="Đăng xuất"
          onSignOut={signOut}
          tone="default"
          links={[
            { href: "#form", label: "Thông tin tài khoản", icon: "user" },
            {
              href: "#checkout",
              label: "Ví điểm & thanh toán",
              icon: "wallet",
            },
          ]}
        />
      ) : (
        <Button onClick={() => setSignedIn(true)}>Đăng nhập</Button>
      )}
    </header>
  );
}

export function Hero({
  title = "Mỗi buổi tập",
  accentTitle = "đều có mục tiêu.",
  description = "So sánh môn tập, lịch khai giảng, học phí và chỗ còn.",
  image = "/sporthub/court-volt/hero-community.png",
  imageAlt = "Vận động viên cầu lông, bóng rổ và thể lực tập trong nhà thi đấu",
  actionLabel = "Tìm lớp học",
  actionHref = "#list",
}: {
  title?: string;
  accentTitle?: string;
  description?: string;
  image?: string;
  imageAlt?: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <section className={styles.hero} aria-label={title}>
      <div className={styles.heroCopy}>
        <h1>
          {title}
          <br />
          <span>{accentTitle}</span>
        </h1>
        <p>{description}</p>
        <Link className={buttonClass({ size: "lg" })} href={actionHref}>
          {actionLabel} <CourtIcon name="arrow" size={20} />
        </Link>
      </div>
      <div className={styles.heroImage}>
        <Image src={image} alt={imageAlt} fill priority sizes="100vw" />
      </div>
    </section>
  );
}

export function CourseCard({
  course,
  onSelect,
}: {
  course: Course;
  onSelect: (course: Course) => void;
}) {
  return (
    <article className={styles.course}>
      <div className={styles.coursePhoto}>
        <Image
          src={courseImage(course)}
          alt={`Ảnh minh họa buổi tập ${course.sport.toLowerCase()}`}
          fill
          sizes="(max-width: 767px) 100vw, 50vw"
        />
      </div>
      <div className={styles.courseBody}>
        <div className={styles.row}>
          <span className={styles.sportLabel}>
            <CourtIcon
              name={course.id === "basketball" ? "basketball" : "badminton"}
              size={20}
            />
            {course.sport}
          </span>
          <span className={course.seats ? styles.availability : styles.full}>
            {course.seats ? `Còn ${course.seats} chỗ` : "Đã đủ chỗ"}
          </span>
        </div>
        <h3>{course.title}</h3>
        <p className={styles.iconLine}>
          <CourtIcon name="calendar" size={18} />
          {course.schedule}
        </p>
        <p className={styles.iconLine}>
          <CourtIcon name="user" size={18} />
          {course.sessions} buổi · HLV {course.coach}
        </p>
        <div className={styles.courseBottom}>
          <div>
            <strong className={styles.amount}>{money(course.price)}</strong>
            <small>Trọn khóa · {course.sessions} buổi</small>
          </div>
          <Button variant="secondary" onClick={() => onSelect(course)}>
            Xem chi tiết <CourtIcon name="arrow" size={18} />
          </Button>
        </div>
      </div>
    </article>
  );
}
