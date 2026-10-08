import Link from "next/link";
import styles from "./homepage-faq.module.css";

type Language = "en" | "vi";

const copy = {
  en: {
    eyebrow: "A few useful answers",
    title: "Good to know before you get started.",
    lead: "A quick guide to choosing a sport, finding a class and making your first booking.",
    questions: [
      {
        question: "Which sports and training options can I explore?",
        answer:
          "SportHub offers badminton, basketball, Gym and conditioning, plus personal training with a coach.",
      },
      {
        question: "Can I see class schedules and prices on the homepage?",
        answer:
          "The homepage gives you an overview of each sport. Current class dates, availability and prices are shown in the Member class catalog after you sign in.",
      },
      {
        question: "How do I register for a class?",
        answer:
          "Sign in to your Member account, open the class catalog, choose an available class and follow checkout. If you are signed out, SportHub will ask you to sign in first.",
        link: "Browse classes",
        href: "/member/discover",
      },
      {
        question: "Can I book a personal training session?",
        answer:
          "Yes. Sign in to check your PT options and available sessions, then book through your Member space.",
        link: "Explore PT booking",
        href: "/member/pt/book",
      },
      {
        question: "Do I need an account to browse SportHub?",
        answer:
          "You can explore the homepage without an account. Sign-in is required for Member schedules, class registration and bookings.",
        link: "Sign in to SportHub",
        href: "/login",
      },
    ],
  },
  vi: {
    eyebrow: "Một vài thông tin hữu ích",
    title: "Thông tin cần biết trước khi bắt đầu.",
    lead: "Hướng dẫn nhanh để chọn môn tập, tìm lớp và đặt buổi đầu tiên.",
    questions: [
      {
        question: "SportHub có những môn tập và hình thức huấn luyện nào?",
        answer:
          "SportHub có cầu lông, bóng rổ, Gym và rèn thể lực, cùng các buổi huấn luyện cá nhân với huấn luyện viên.",
      },
      {
        question:
          "Tôi có thể xem lịch lớp và học phí ngay trên homepage không?",
        answer:
          "Homepage giới thiệu tổng quan từng môn. Ngày học, chỗ còn trống và học phí hiện tại được hiển thị trong danh mục lớp Member sau khi đăng nhập.",
      },
      {
        question: "Làm thế nào để đăng ký một lớp học?",
        answer:
          "Đăng nhập tài khoản Member, mở danh mục lớp, chọn lớp còn chỗ và làm theo hướng dẫn thanh toán. Nếu chưa đăng nhập, SportHub sẽ yêu cầu bạn đăng nhập trước.",
        link: "Khám phá lớp học",
        href: "/member/discover",
      },
      {
        question: "Tôi có thể đặt buổi huấn luyện cá nhân không?",
        answer:
          "Có. Đăng nhập để xem lựa chọn PT và lịch còn trống, sau đó đặt buổi trong không gian Member.",
        link: "Khám phá lịch đặt PT",
        href: "/member/pt/book",
      },
      {
        question: "Tôi có cần tài khoản để xem SportHub không?",
        answer:
          "Bạn có thể xem homepage mà không cần tài khoản. Cần đăng nhập để xem lịch Member, đăng ký lớp và đặt buổi tập.",
        link: "Đăng nhập SportHub",
        href: "/login",
      },
    ],
  },
} satisfies Record<
  Language,
  {
    eyebrow: string;
    title: string;
    lead: string;
    questions: {
      question: string;
      answer: string;
      link?: string;
      href?: string;
    }[];
  }
>;

export function HomepageFAQ({ language }: { language: Language }) {
  const t = copy[language];

  return (
    <section className={styles.section} aria-labelledby="homepage-faq-title">
      <div className={styles.intro}>
        <p className={styles.eyebrow}>{t.eyebrow}</p>
        <h2 id="homepage-faq-title">{t.title}</h2>
        <p className={styles.lead}>{t.lead}</p>
      </div>

      <div className={styles.questions}>
        {t.questions.map((item) => (
          <details className={styles.item} key={item.question}>
            <summary>
              <span>{item.question}</span>
              <span className={styles.indicator} aria-hidden="true" />
            </summary>
            <div className={styles.answer}>
              <p>{item.answer}</p>
              {item.link && item.href && (
                <Link href={item.href}>{item.link}</Link>
              )}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
