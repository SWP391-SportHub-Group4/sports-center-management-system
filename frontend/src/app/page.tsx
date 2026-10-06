"use client";
import Link from "next/link";
import Image from "next/image";
import { PublicHeader } from "./public-header";
import { MembershipPricing } from "./membership-pricing";
import { useLanguage } from "@/lib/language";
import { buttonClass } from "@/components/primitives/Button";
import s from "./landing.module.css";
import { CourtIcon } from "@/components/brand/CourtIcon";
import { PerformanceSections } from "@/components/homepage/PerformanceSections";

export default function Page() {
  const { language } = useLanguage();
  const vi = language === "vi";
  const text = (vn: string, en: string) => (vi ? vn : en);
  const questions = [
    [
      text(
        "Tôi xem lịch và số chỗ còn của lớp ở đâu?",
        "Where can I see a class schedule and available places?",
      ),
      text(
        "Mở thẻ môn học để xem lịch, học phí, số buổi và chỗ còn trước khi đăng ký.",
        "Open a course card to review its schedule, price, session count, and available places before enrolling.",
      ),
    ],
    [
      text(
        "PT khác với tập Gym tự do như thế nào?",
        "How is personal training different from Open Gym?",
      ),
      text(
        "PT là buổi tập 1 kèm 1 theo lịch hẹn; Gym tự do phù hợp với lịch tập linh hoạt.",
        "PT is one-to-one coaching by appointment; Open Gym gives you a more flexible training schedule.",
      ),
    ],
    [
      text("Tôi bắt đầu đăng ký như thế nào?", "How do I get started?"),
      text(
        "Chọn môn hoặc lớp phù hợp, xem chi tiết lịch tập rồi đăng nhập để hoàn tất đăng ký.",
        "Choose a sport or class, review its schedule, then sign in to complete your registration.",
      ),
    ],
  ];
  return (
    <div className={s.page} lang={language} data-theme="arena-light">
      <a className={s.skip} href="#main-content">
        {text("Đến nội dung chính", "Skip to content")}
      </a>
      <PublicHeader />
      <main className={s.main} id="main-content">
        <PerformanceSections language={language} />
        <section
          className={`${s.section} ${s.training}`}
          id="training"
          aria-labelledby="pt-title"
        >
          <div className={s.goalBackground} aria-hidden="true">
            <Image
              src="/sporthub/court-volt/conditioning-speed-track.png"
              alt=""
              fill
              sizes="(max-width: 767px) calc(100vw - 2rem), (max-width: 1199px) calc(100vw - 3rem), 90vw"
            />
          </div>
          <div className={s.goalContent}>
            <div className={s.goalCopy}>
              <CourtIcon name="gym" size={40} />
              <h2 id="pt-title">
                {text(
                  "Mục tiêu của bạn.\nLộ trình của riêng bạn.",
                  "Your own goals.\nYour own game plan.",
                )}
              </h2>
            </div>
            <div className={s.goalDetails}>
              <Image
                className={s.goalSticker}
                src="/sporthub/court-volt/sticker-goals.png"
                alt=""
                width={1381}
                height={1139}
                aria-hidden="true"
                priority={false}
              />
              <p>
                {text(
                  "Huấn luyện cá nhân (PT) giúp bạn xây dựng chương trình tập phù hợp và theo sát tiến độ.",
                  "Personal training (PT) gives you a tailored program and coaching to track your progress.",
                )}
              </p>
              <Link
                className={buttonClass({ variant: "secondary", size: "lg" })}
                href="#programs"
              >
                {text("Khám phá các môn tập", "Explore sports")}
                <CourtIcon name="arrow" size={18} />
              </Link>
            </div>
          </div>
        </section>
        <div className={`${s.section} ${s.pricing}`}>
          <div className={s.sectionHeading}>
            <h2>{text("Các môn thể thao", "Sports & programs")}</h2>
            <p>
              {text(
                "Xem thông tin Gym & PT, Cầu lông, Bóng rổ và các lớp đang nhận đăng ký.",
                "Explore Gym & PT, Badminton, Basketball, and classes currently open for registration.",
              )}
            </p>
          </div>
          <MembershipPricing />
        </div>
        <section
          className={`${s.section} ${s.faq}`}
          aria-labelledby="faq-title"
        >
          <h2 id="faq-title">
            {text("Trước buổi tập đầu tiên", "Before your first session")}
          </h2>
          <div>
            {questions.map(([question, answer]) => (
              <details key={question}>
                <summary>{question}</summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
      <footer className={s.footer}>
        <div>
          <Link href="/" className={s.wordmark}>
            Sport<span className={s.wordmarkAccent}>Hub</span>
          </Link>
          <p className={s.footerStatement}>
            {text("Mỗi buổi tập,", "Every session,")}
            <span>{text("một bước tiến.", "a step forward.")}</span>
          </p>
        </div>
        <nav aria-label={text("Điều hướng chân trang", "Footer navigation")}>
          <Link href="#activities">
            {text("Môn tập", "Programs")}
            <CourtIcon name="arrow" size={22} />
          </Link>
          <Link href="#programs">
            {text("Các môn tập", "Sports & programs")}
            <CourtIcon name="arrow" size={22} />
          </Link>
          <Link href="/login">
            {text("Tài khoản", "Your account")}
            <CourtIcon name="arrow" size={22} />
          </Link>
        </nav>
        <div className={s.footerIcons} aria-hidden="true">
          <CourtIcon name="gym" size={32} />
          <CourtIcon name="badminton" size={32} />
          <CourtIcon name="basketball" size={32} />
        </div>
        <small>
          SportHub · Gym / {text("Cầu lông", "Badminton")} /{" "}
          {text("Bóng rổ", "Basketball")}
          {text(" · Ảnh AI minh họa", " · AI-generated illustrative imagery")}
        </small>
      </footer>
    </div>
  );
}
