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
        "Đăng ký khóa học Cầu lông hoặc Bóng rổ có cần Membership Gym không?",
        "Do Badminton or Basketball courses require a Gym membership?",
      ),
      text(
        "Không. Khóa học Cầu lông và Bóng rổ được đăng ký riêng, không cần Membership Gym.",
        "No. Badminton and Basketball courses are purchased separately and do not require a Gym membership.",
      ),
    ],
    [
      text(
        "Mua PT có cần Membership Gym không?",
        "Do I need a Gym membership to purchase PT?",
      ),
      text(
        "Có. PT được mua riêng và bạn cần Membership Gym còn hiệu lực.",
        "Yes. PT is purchased separately and requires an active Gym membership.",
      ),
    ],
    [
      text("Tôi bắt đầu đăng ký như thế nào?", "How do I get started?"),
      text(
        "Chọn khóa học hoặc gói Gym, đăng nhập và kiểm tra thông tin tại bước thanh toán trước khi xác nhận.",
        "Choose a course or gym plan, sign in and review your purchase at checkout before confirming.",
      ),
    ],
  ];
  return (
    <div
      className={s.page}
      lang={language}
      data-theme="performance"
      onPointerMove={(event) => {
        if (event.pointerType !== "mouse") return;

        event.currentTarget.style.setProperty(
          "--spotlight-x",
          `${event.clientX}px`,
        );
        event.currentTarget.style.setProperty(
          "--spotlight-y",
          `${event.clientY}px`,
        );
        event.currentTarget.style.setProperty("--spotlight-opacity", "1");
      }}
      onPointerLeave={(event) => {
        event.currentTarget.style.setProperty("--spotlight-opacity", "0");
      }}
    >
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
                  "Tập 1 kèm 1 với huấn luyện viên cá nhân (PT), dịch vụ riêng thuộc Gym. Bạn cần Membership Gym còn hiệu lực để mua PT.",
                  "Train one to one with a personal trainer (PT), a separate Gym service. An active Gym membership is required to purchase PT.",
                )}
              </p>
              <Link
                className={buttonClass({ variant: "secondary", size: "lg" })}
                href="#pricing"
              >
                {text("Xem các gói Membership", "Compare Membership plans")}
                <CourtIcon name="arrow" size={18} />
              </Link>
            </div>
          </div>
        </section>
        <div className={`${s.section} ${s.pricing}`}>
          <div className={s.sectionHeading}>
            <h2>Membership</h2>
            <p>
              {text(
                "So sánh thời hạn và quyền lợi của các gói Membership đang mở bán. Dịch vụ PT yêu cầu Membership còn hiệu lực.",
                "Compare the validity and benefits of available Membership plans. PT services require an active Membership.",
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
          <Link href="#pricing">
            {text("Gói Membership", "Membership plans")}
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
