import Image from "next/image";
import Link from "next/link";
import styles from "./home.module.css";

const activities = [
  {
    name: "Yoga cơ bản",
    detail: "Làm quen với nhịp thở và các tư thế yoga nền tảng trên thảm.",
    image: "/sporthub/activity-yoga.webp",
    imageAlt: "Ảnh minh họa một nhóm người tập yoga trên thảm",
  },
  {
    name: "Thể lực cơ bản",
    detail:
      "Làm quen với các bài tập thể lực và động tác tăng sức mạnh nền tảng.",
    image: "/sporthub/activity-fitness.webp",
    imageAlt: "Ảnh minh họa nhóm người tập thể lực với tạ nhẹ",
  },
  {
    name: "Pilates Core Flow",
    detail:
      "Tập trung vào kiểm soát chuyển động và vùng cơ trung tâm trên thảm.",
    image: "/sporthub/activity-pilates.webp",
    imageAlt: "Ảnh minh họa người tập Pilates cùng người hướng dẫn",
  },
  {
    name: "Giãn cơ & phục hồi",
    detail: "Giãn cơ và vận động nhẹ để cơ thể thả lỏng sau những buổi tập.",
    image: "/sporthub/activity-stretch.webp",
    imageAlt: "Ảnh minh họa nhóm người thực hiện bài tập giãn cơ",
  },
];

export default function HomePage() {
  return (
    <div className={styles.site}>
      <a className="skip-link" href="#main">
        Bỏ qua điều hướng
      </a>
      <header className={styles.header}>
        <Link className={styles.logo} href="/" aria-label="SportHub, trang chủ">
          <Image src="/sporthub/brand.svg" alt="" width={34} height={34} />
          <span>
            SportHub<span className={styles.logoDot}>.</span>
          </span>
        </Link>
        <nav className={styles.nav} aria-label="Điều hướng chính">
          <a href="#gioi-thieu">Trung tâm</a>
          <a href="#hoat-dong">Hoạt động</a>
          <a href="#su-kien">Sự kiện</a>
        </nav>
        <Link className={styles.headerLink} href="/member">
          Khu vực hội viên <span aria-hidden="true">↗</span>
        </Link>
      </header>
      <main id="main">
        <section className={styles.hero} aria-labelledby="hero-title">
          <Image
            className={styles.heroImage}
            src="/sporthub/home-hero.webp"
            alt="Nhóm người cùng tập luyện trong không gian thể thao sáng và rộng"
            fill
            priority
            sizes="100vw"
          />
          <div className={styles.heroShade} />
          <div className={styles.heroContent}>
            <p className={styles.heroLabel}>CHÀO MỪNG ĐẾN SPORTHUB</p>
            <h1 id="hero-title">
              Chuyển động
              <br /> <span>theo cách của bạn.</span>
            </h1>
            <p className={styles.heroIntro}>
              Một không gian để bắt đầu, bền bỉ và tận hưởng việc vận động mỗi
              ngày. Khám phá trung tâm cùng những hoạt động dành cho mọi người.
            </p>
            <a className={styles.heroButton} href="#hoat-dong">
              Khám phá hoạt động{" "}
              <span className={styles.linkArrow} aria-hidden="true">
                ↗
              </span>
            </a>
          </div>
          <div className={styles.heroBottom}>
            <span>Ảnh minh họa không gian tập luyện</span>
            <a className={styles.scrollCue} href="#gioi-thieu">
              Khám phá bên dưới{" "}
              <span className={styles.scrollArrow} aria-hidden="true">
                ↓
              </span>
            </a>
          </div>
        </section>
        <div className={styles.momentumBand} aria-hidden="true">
          <span className={styles.momentumText}>Mỗi ngày, một bước tiến.</span>
          <span className={styles.momentumArrow}>↗</span>
        </div>
        <section
          className={styles.intro}
          id="gioi-thieu"
          aria-labelledby="intro-title"
        >
          <div className={styles.introGrid}>
            <h2 id="intro-title">
              Bắt đầu từ một
              <br /> <em>bước nhỏ.</em>
            </h2>
            <div className={styles.introBody}>
              <p>
                SportHub kết nối con người qua chuyển động. Từ một buổi tập nhẹ
                để nạp lại năng lượng đến hành trình rèn luyện dài hạn, luôn có
                chỗ cho bạn ở đây.
              </p>
              <p>
                Khám phá các lớp học, không gian tập luyện và hoạt động cộng
                đồng trước khi chọn trải nghiệm phù hợp với mình.
              </p>
              <a className={styles.inlineLink} href="#hoat-dong">
                Xem các hoạt động{" "}
                <span className={styles.linkArrow} aria-hidden="true">
                  ↗
                </span>
              </a>
            </div>
          </div>
        </section>
        <section
          className={styles.activities}
          id="hoat-dong"
          aria-labelledby="activities-title"
        >
          <div className={styles.activitiesInner}>
            <div className={styles.activitiesTitle}>
              <h2 id="activities-title">Tìm nhịp tập của bạn.</h2>
              <p>Chọn cách chuyển động khiến bạn muốn quay lại vào ngày mai.</p>
            </div>
            <div className={styles.activitiesDetail}>
              <div className={styles.activityList}>
                {activities.map((item) => (
                  <article className={styles.activity} key={item.name}>
                    <Image
                      className={styles.activityImage}
                      src={item.image}
                      alt={item.imageAlt}
                      fill
                      sizes="(max-width: 760px) calc(100vw - 44px), (max-width: 1200px) 48vw, 640px"
                    />
                    <div className={styles.activityCopy}>
                      <h3>{item.name}</h3>
                      <p>{item.detail}</p>
                    </div>
                  </article>
                ))}
              </div>
              <p className={styles.note}>
                Tên lớp và ảnh trên chỉ minh họa theo dữ liệu demo. Lịch lớp và
                tình trạng chỗ trống thực tế cần được xác nhận trong khu vực hội
                viên.
              </p>
            </div>
          </div>
        </section>
        <section
          className={styles.event}
          id="su-kien"
          aria-labelledby="event-title"
        >
          <div className={styles.eventMark} aria-hidden="true">
            SH
          </div>
          <div className={styles.eventCopy}>
            <p className={styles.eventLabel}>HOẠT ĐỘNG & SỰ KIỆN</p>
            <h2 id="event-title">
              Hẹn gặp bạn ở<br /> sự kiện tiếp theo.
            </h2>
            <p>
              Hiện chưa có sự kiện được công bố. Thông tin về các buổi tập cộng
              đồng và hoạt động tại trung tâm sẽ xuất hiện tại đây khi có lịch
              mới.
            </p>
            <a className={styles.eventLink} href="#hoat-dong">
              Khám phá hoạt động thường ngày{" "}
              <span className={styles.linkArrow} aria-hidden="true">
                ↗
              </span>
            </a>
          </div>
        </section>
      </main>
      <footer className={styles.footer}>
        <div>
          <strong>
            SportHub<span>.</span>
          </strong>
          <p>Mỗi ngày, một bước tiến.</p>
        </div>
        <nav aria-label="Điều hướng chân trang">
          <a href="#gioi-thieu">Trung tâm</a>
          <a href="#hoat-dong">Hoạt động</a>
          <a href="#su-kien">Sự kiện</a>
          <Link href="/member">Hội viên</Link>
        </nav>
        <small>© {new Date().getFullYear()} SportHub</small>
      </footer>
    </div>
  );
}
