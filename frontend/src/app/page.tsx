"use client";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { PublicHeader } from "./public-header";
import { MembershipPricing } from "./membership-pricing";
import { useLanguage } from "@/lib/language";
import { buttonClass } from "@/components/primitives/Button";
import s from "./landing.module.css";
import { CourtIcon } from "@/components/brand/CourtIcon";

export default function Page() {
  const { language } = useLanguage();
  const vi = language === "vi";
  const text = (vn: string, en: string) => (vi ? vn : en);
  const [activeHeroSport, setActiveHeroSport] = useState<
    "gym" | "badminton" | "basketball"
  >("badminton");
  const heroSports = [
    {
      key: "gym" as const,
      name: "Gym",
      image: "/sporthub/activity-fitness.jpg",
      alt: text("Vận động viên tập Gym", "Athlete training in the gym"),
    },
    {
      key: "badminton" as const,
      name: text("Cầu lông", "Badminton"),
      image: "/sporthub/court-volt/hero-rally.png",
      alt: text(
        "Vận động viên đánh cầu lông trên sân trong nhà",
        "Athlete playing badminton on an indoor court",
      ),
    },
    {
      key: "basketball" as const,
      name: text("Bóng rổ", "Basketball"),
      image: "/sporthub/court-volt/course-basketball.png",
      alt: text(
        "Vận động viên tập bóng rổ trong nhà",
        "Athletes training basketball indoors",
      ),
    },
  ];
  const sports = [
    {
      image: "/sporthub/court-volt/course-badminton.png",
      icon: "badminton" as const,
      name: text("Cầu lông", "Badminton"),
      description: text(
        "Từ bước chân đầu tiên đến những pha cầu tự tin. Rèn kỹ thuật qua khóa học nhiều buổi.",
        "From your first steps to confident rallies. Build technique through a multi-session course.",
      ),
    },
    {
      name: text("Bóng rổ", "Basketball"),
      image: "/sporthub/court-volt/course-basketball.png",
      icon: "basketball" as const,
      description: text(
        "Làm chủ bóng, phối hợp đồng đội và phát triển kỹ năng trên sân qua từng buổi học.",
        "Develop ball control, teamwork and court skills with every session.",
      ),
    },
  ];
  const questions = [
    [
      text(
        "Học cầu lông hoặc bóng rổ có cần gói Gym không?",
        "Do court courses require a gym membership?",
      ),
      text(
        "Không. Bạn đăng ký và thanh toán theo khóa học độc lập với Membership Gym.",
        "No. You purchase a complete course independently of a Gym membership.",
      ),
    ],
    [
      text(
        "PT có nằm trong gói Membership không?",
        "Is personal training included in membership?",
      ),
      text(
        "PT được mua riêng. Bạn cần Membership Gym đang hiệu lực để mua gói huấn luyện cá nhân.",
        "Personal training is purchased separately and requires an active Gym membership.",
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
    <div className={s.page} lang={language}>
      <a className={s.skip} href="#main-content">
        {text("Đến nội dung chính", "Skip to content")}
      </a>
      <PublicHeader />
      <main className={s.main} id="main-content">
        <section className={s.hero} aria-labelledby="hero-title">
          <div className={s.heroCopy}>
            <h1 id="hero-title">
              {text("Bắt đầu ở đây.", "Find your game.")}
              <br />
              <span>{text("Bứt phá mỗi ngày.", "Own your progress.")}</span>
            </h1>
            <p className={s.lead}>
              {text(
                "Gym, cầu lông, bóng rổ. Chọn nhịp tập hợp với bạn và bắt đầu ngay hôm nay.",
                "Gym, badminton, basketball. Choose your pace and make every session count.",
              )}
            </p>
            <Link href="#activities" className={buttonClass({ size: "lg" })}>
              {text("Chọn môn ngay", "Find your sport")}
              <CourtIcon name="arrow" size={20} />
            </Link>
          </div>
          <div className={s.heroVisual}>
            <div className={s.photo}>
              {heroSports.map((sport) => (
                <Image
                  key={sport.key}
                  src={sport.image}
                  alt={sport.alt}
                  aria-hidden={activeHeroSport !== sport.key}
                  data-active={activeHeroSport === sport.key}
                  className={s.heroPhoto}
                  fill
                  priority={sport.key === "badminton"}
                  sizes="(max-width: 900px) 100vw, (max-width: 1440px) 55vw, 710px"
                />
              ))}
            </div>
            <div
              className={s.heroSwitcher}
              role="group"
              aria-label={text("Xem trước môn thể thao", "Preview sports")}
            >
              {heroSports.map((sport) => (
                <button
                  key={sport.key}
                  type="button"
                  className={s.heroSportButton}
                  aria-pressed={activeHeroSport === sport.key}
                  onPointerEnter={(event) => {
                    if (event.pointerType === "mouse")
                      setActiveHeroSport(sport.key);
                  }}
                  onFocus={() => setActiveHeroSport(sport.key)}
                  onClick={() => setActiveHeroSport(sport.key)}
                  aria-label={text(
                    `Xem ảnh ${sport.name}`,
                    `Preview ${sport.name}`,
                  )}
                >
                  <CourtIcon name={sport.key} size={20} />
                  <span>{sport.name}</span>
                </button>
              ))}
            </div>
          </div>
        </section>
        <section
          id="activities"
          className={s.section}
          aria-labelledby="sports-title"
        >
          <div className={s.sectionHeading}>
            <h2 id="sports-title">
              {text("Chọn sân chơi của bạn.", "Find your place to play.")}
            </h2>
            <p>
              {text(
                "Tập tự do, học cùng nhóm hoặc đồng hành với huấn luyện viên. Mỗi mục tiêu có một cách bắt đầu.",
                "Train independently, learn with a group or work with a coach. Every goal has a starting point.",
              )}
            </p>
          </div>
          <div className={s.sportsLayout}>
            <article className={s.gymFeature}>
              <Image
                src="/sporthub/activity-fitness.jpg"
                alt={text("Khu vực tập Gym", "Gym training area")}
                width={900}
                height={650}
                sizes="(max-width: 767px) 100vw, 50vw"
              />
              <div>
                <span className={s.meta}>
                  {text(
                    "Tập tự do & dịch vụ PT",
                    "Independent training & PT services",
                  )}
                </span>
                <h3 className={s.sportHeading}>
                  <CourtIcon name="gym" size={32} />
                  Gym
                </h3>
                <p>
                  {text(
                    "Chủ động nhịp tập với Membership. Thêm huấn luyện cá nhân khi bạn cần một lộ trình riêng.",
                    "Set your own pace with a membership. Add personal training when you need a plan of your own.",
                  )}
                </p>
                <Link href="#pricing">
                  {text("Xem gói Gym", "Explore gym plans")}{" "}
                  <CourtIcon name="diagonal" size={18} />
                </Link>
              </div>
            </article>
            <div className={s.courtSports}>
              {sports.map((item) => (
                <article key={item.name}>
                  <Image
                    src={item.image}
                    alt={text(
                      `Ảnh minh họa ${item.name.toLowerCase()}`,
                      `${item.name} illustration`,
                    )}
                    width={640}
                    height={400}
                    sizes="(max-width: 767px) 100vw, 45vw"
                    className={s.courtPhoto}
                  />
                  <span className={s.meta}>
                    {text("Đăng ký trọn khóa", "Full-course enrollment")}
                  </span>
                  <h3 className={s.sportHeading}>
                    <CourtIcon name={item.icon} size={28} />
                    {item.name}
                  </h3>
                  <p>{item.description}</p>
                  <Link href="/courses">
                    {text(
                      "Xem khóa học cầu lông & bóng rổ",
                      "View badminton & basketball courses",
                    )}{" "}
                    <CourtIcon name="diagonal" size={18} />
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section
          className={`${s.section} ${s.training}`}
          aria-labelledby="pt-title"
        >
          <div>
            <CourtIcon name="gym" size={40} />
            <h2 id="pt-title">
              {text(
                "Mục tiêu của bạn.\nLộ trình của riêng bạn.",
                "Your own goals.\nYour own game plan.",
              )}
            </h2>
          </div>
          <div>
            <p>
              {text(
                "Cùng huấn luyện viên xây dựng kế hoạch, ghi nhận kết quả và duy trì nhịp tập. PT là dịch vụ riêng thuộc Gym, dành cho hội viên có Membership đang hiệu lực.",
                "Build a plan, track results and keep moving with a coach. Personal training is a separate Gym service for members with an active membership.",
              )}
            </p>
            <Link
              className={buttonClass({ variant: "secondary", size: "lg" })}
              href="/member/my-plans"
            >
              {text(
                "Đến trang gói tập & huấn luyện cá nhân",
                "Go to plans & personal training",
              )}
              <CourtIcon name="arrow" size={18} />
            </Link>
          </div>
        </section>
        <div className={`${s.section} ${s.pricing}`}>
          <div className={s.sectionHeading}>
            <h2>{text("Bắt đầu từ một thói quen.", "Start with a habit.")}</h2>
            <p>
              {text(
                "Xem giá và thời hạn của các gói trung tâm đang mở bán. Quyền tập Gym và huấn luyện cá nhân (PT) được mua riêng; mua PT cần gói Gym còn hiệu lực.",
                "Compare prices and durations of the center’s available packages. Gym access and personal training (PT) are purchased separately; PT requires an active Gym membership.",
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
            <Image src="/sporthub/brand.svg" width={32} height={32} alt="" />{" "}
            SportHub.
          </Link>
          <p className={s.footerStatement}>
            {text("Mỗi buổi tập,", "Every session,")}
            <span>{text("một bước tiến.", "a step forward.")}</span>
          </p>
        </div>
        <nav aria-label={text("Điều hướng chân trang", "Footer navigation")}>
          <Link href="/courses">
            {text("Khóa học", "Courses")}
            <CourtIcon name="arrow" size={22} />
          </Link>
          <Link href="#pricing">
            {text("Gói Gym", "Gym plans")}
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
          SportHub · Gym / {sports[0].name} / {sports[1].name}
          {text(" · Ảnh AI minh họa", " · AI-generated illustrative imagery")}
        </small>
      </footer>
    </div>
  );
}
