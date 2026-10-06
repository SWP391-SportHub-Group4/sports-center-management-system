"use client";

import Image from "next/image";
import { useState } from "react";
import { Button, buttonClass } from "@/components/primitives/Button";
import { CourtIcon } from "@/components/brand/CourtIcon";
import { AccountMenu as SharedAccountMenu } from "@/components/brand/AccountMenu";
import s from "./review.module.css";

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
export const money = (value: number) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(
    value,
  );
export const courseImage = (course: Course) =>
  `/sporthub/court-volt/course-${course.id === "basketball" ? "basketball" : "badminton"}.png`;

export function AccountMenu({
  name,
  onSignOut,
}: {
  name: string;
  onSignOut: () => void;
}) {
  return (
    <SharedAccountMenu
      name={name}
      subtitle="Tài khoản hội viên mẫu"
      logoutLabel="Đăng xuất bản mẫu"
      onSignOut={onSignOut}
      tone="inverse"
      links={[
        { href: "#form", label: "Thông tin tài khoản", icon: "user" },
        { href: "#checkout", label: "Ví điểm & thanh toán", icon: "wallet" },
      ]}
    />
  );
}

export function PublicHeader() {
  const [signedIn, setSignedIn] = useState(true);
  const [expanded, setExpanded] = useState(false);
  return (
    <header
      className={s.header}
      onKeyDown={(e) => {
        if (e.key === "Escape") setExpanded(false);
      }}
    >
      <a href="#public" className={s.brand}>
        Sport<span className={s.brandAccent}>Hub</span>
      </a>
      <Button
        className={s.mobileToggle}
        variant="ghost"
        aria-expanded={expanded}
        aria-controls="review-nav"
        onClick={() => setExpanded(!expanded)}
      >
        <CourtIcon name={expanded ? "close" : "menu"} size={20} />
        Menu
      </Button>
      <nav
        id="review-nav"
        className={`${s.nav} ${expanded ? s.navOpen : ""}`}
        aria-label="Điều hướng public"
      >
        <a href="#public" onClick={() => setExpanded(false)}>
          Bộ môn
        </a>
        <a href="#detail" onClick={() => setExpanded(false)}>
          Gym
        </a>
        <a href="#list" onClick={() => setExpanded(false)}>
          Khóa học
        </a>
      </nav>
      {signedIn ? (
        <AccountMenu name="Minh Anh" onSignOut={() => setSignedIn(false)} />
      ) : (
        <Button onClick={() => setSignedIn(true)}>Đăng nhập mẫu</Button>
      )}
    </header>
  );
}

export function Hero() {
  return (
    <section className={s.hero} aria-labelledby="hero-title">
      <div className={s.heroCopy}>
        <h1 id="hero-title">
          Mỗi buổi tập
          <br />
          <span>đều có mục tiêu.</span>
        </h1>
        <p>So sánh môn tập, lịch khai giảng, học phí và chỗ còn.</p>
        <a className={buttonClass({ size: "lg" })} href="#list">
          Tìm lớp học <CourtIcon name="arrow" size={20} />
        </a>
      </div>
      <div className={s.heroImage}>
        <Image
          src="/sporthub/court-volt/hero-community.png"
          alt="Ảnh AI minh họa vận động viên cầu lông, bóng rổ và thể lực cùng tập trong nhà thi đấu"
          fill
          priority
          sizes="(max-width: 767px) 100vw, 60vw"
        />
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
    <article className={s.course}>
      <div className={s.coursePhoto}>
        <Image
          src={courseImage(course)}
          alt={`Ảnh minh họa buổi tập ${course.sport.toLowerCase()}`}
          fill
          sizes="(max-width: 767px) 100vw, 50vw"
        />
      </div>
      <div className={s.courseBody}>
        <div className={s.row}>
          <span className={s.sportLabel}>
            <CourtIcon
              name={course.id === "basketball" ? "basketball" : "badminton"}
              size={20}
            />
            {course.sport}
          </span>
          <span className={course.seats ? s.availability : s.full}>
            {course.seats ? `Còn ${course.seats} chỗ` : "Đã đủ chỗ"}
          </span>
        </div>
        <h3>{course.title}</h3>
        <p className={s.iconLine}>
          <CourtIcon name="calendar" size={18} />
          {course.schedule}
        </p>
        <p className={s.iconLine}>
          <CourtIcon name="user" size={18} />
          {course.sessions} buổi · HLV {course.coach}
        </p>
        <div className={s.courseBottom}>
          <div>
            <strong className={s.amount}>{money(course.price)}</strong>
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

export function Footer() {
  return (
    <footer className={s.footer}>
      <div>
        <a className={s.brand} href="#public">
          Sport<span className={s.brandAccent}>Hub</span>
        </a>
        <p>
          Mỗi buổi tập,
          <br />
          <strong>một bước tiến.</strong>
        </p>
      </div>
      <nav aria-label="Điều hướng chân trang">
        <a href="#list">
          Khóa học <CourtIcon name="diagonal" size={18} />
        </a>
        <a href="#form">
          Thông tin tài khoản <CourtIcon name="user" size={18} />
        </a>
        <a href="#checkout">
          Thanh toán mẫu <CourtIcon name="wallet" size={18} />
        </a>
      </nav>
      <div className={s.footerSports} aria-label="Gym, cầu lông và bóng rổ">
        <CourtIcon name="gym" size={32} />
        <CourtIcon name="badminton" size={32} />
        <CourtIcon name="basketball" size={32} />
      </div>
      <small>
        Bản review giao diện · Dữ liệu minh họa · Ảnh được tạo bằng AI
      </small>
    </footer>
  );
}
