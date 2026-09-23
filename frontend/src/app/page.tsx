import Image from "next/image";
import Link from "next/link";
import styles from "./home.module.css";
import { PublicHeader } from "./public-header";

const activities = [
  {
    name: "Yoga cơ bản",
    short: "Tìm lại nhịp thở",
    detail:
      "Làm quen với nhịp thở và các tư thế yoga nền tảng trong một buổi tập vừa sức.",
    image: "/sporthub/activity-yoga-hd.webp",
    imageAlt: "Ảnh minh họa một nhóm người tập yoga trên thảm",
  },
  {
    name: "Thể lực cơ bản",
    short: "Xây nền sức mạnh",
    detail:
      "Khám phá các động tác thể lực và bài tập sức mạnh nền tảng theo nhịp của riêng bạn.",
    image: "/sporthub/activity-fitness-hd.webp",
    imageAlt: "Ảnh minh họa nhóm người tập thể lực với tạ nhẹ",
  },
  {
    name: "GroupX",
    short: "Vận động cùng tập thể",
    detail:
      "Lớp tập nhóm kết hợp âm nhạc, chuyển động và sự hướng dẫn của huấn luyện viên trong cùng một nhịp tập.",
    image: "/sporthub/activity-groupx-hd.webp",
    imageAlt: "Ảnh minh họa lớp tập nhóm GroupX cùng huấn luyện viên",
  },
  {
    name: "Giãn cơ & phục hồi",
    short: "Thả lỏng để đi xa hơn",
    detail:
      "Vận động nhẹ và giãn cơ để cơ thể tìm lại sự thoải mái sau những buổi tập.",
    image: "/sporthub/activity-stretch-hd.webp",
    imageAlt: "Ảnh minh họa nhóm người thực hiện bài tập giãn cơ",
  },
];

export default function HomePage() {
  return (
    <div className={styles.site}>
      <a className="skip-link" href="#main">
        Bỏ qua điều hướng
      </a>
      <PublicHeader />

      <main id="main">
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroCopy}>
            <p className={styles.heroLabel}>THỂ THAO · CỘNG ĐỒNG · MỖI NGÀY</p>
            <h1 id="hero-title">
              Chạm đúng nhịp.<span> Tập theo cách của bạn.</span>
            </h1>
            <p className={styles.heroIntro}>
              Bốn cách bắt đầu. Một nơi để bạn vận động, bền bỉ và tìm thấy niềm
              vui trong từng buổi tập.
            </p>
            <a className={styles.primaryAction} href="#hoat-dong">
              Khám phá lớp tập <span aria-hidden="true">↓</span>
            </a>
          </div>
          <div
            className={styles.heroMosaic}
            aria-label="Ảnh minh họa các hoạt động"
          >
            <div className={styles.heroFrame}>
              <Image
                src="/sporthub/activity-yoga-hd.webp"
                alt="Nhóm người tập yoga"
                fill
                sizes="(max-width: 760px) 33vw, 38vw"
                quality={90}
                priority
              />
            </div>
            <div className={`${styles.heroFrame} ${styles.heroFrameMain}`}>
              <Image
                src="/sporthub/home-hero.webp"
                alt="Nhóm người cùng tập luyện trong không gian thể thao"
                fill
                sizes="(max-width: 760px) 42vw, 30vw"
                quality={90}
                priority
              />
            </div>
            <div className={styles.heroFrame}>
              <Image
                src="/sporthub/activity-fitness-hd.webp"
                alt="Nhóm người tập thể lực"
                fill
                sizes="(max-width: 760px) 33vw, 38vw"
                quality={90}
                priority
              />
            </div>
          </div>
          <p className={styles.imageNote}>
            Hình ảnh minh họa hoạt động tập luyện
          </p>
        </section>

        <section
          className={styles.story}
          id="cau-chuyen"
          aria-labelledby="story-title"
        >
          <h2 id="story-title">
            Bắt đầu bằng chuyển động. Tiếp tục bằng niềm tin.
          </h2>
          <div className={styles.storyCopy}>
            <p>
              SportHub kết nối con người qua những buổi tập có mục tiêu, không
              gian cởi mở và một cộng đồng luôn sẵn sàng đồng hành.
            </p>
            <p>
              Dù bạn đang làm quen hay muốn xây dựng thói quen lâu dài, luôn có
              một nhịp tập phù hợp để bắt đầu.
            </p>
          </div>
          <a className={styles.outlineAction} href="#hoat-dong">
            Tìm lớp dành cho bạn
          </a>
        </section>

        <section
          className={styles.activities}
          id="hoat-dong"
          aria-labelledby="activities-title"
        >
          <div className={styles.activitiesHeading}>
            <h2 id="activities-title">Tìm nhịp tập của bạn.</h2>
            <p>
              Bốn hướng vận động để bạn bắt đầu từ thể lực, hơi thở và mục tiêu
              của chính mình.
            </p>
          </div>
          <div className={styles.activityList}>
            {activities.map((item) => (
              <article className={styles.activity} key={item.name}>
                <div className={styles.activityHeading}>
                  <p>{item.short}</p>
                  <h3>{item.name}</h3>
                </div>
                <div className={styles.activityImageWrap}>
                  <Image
                    className={styles.activityImage}
                    src={item.image}
                    alt={item.imageAlt}
                    fill
                    sizes="(max-width: 760px) calc(100vw - 44px), 50vw"
                    quality={90}
                  />
                </div>
                <p className={styles.activityDetail}>{item.detail}</p>
              </article>
            ))}
          </div>
          <p className={styles.demoNote}>
            Tên lớp và ảnh trên minh họa theo dữ liệu demo. Lịch học và tình
            trạng chỗ trống thực tế được cập nhật trong khu vực hội viên.
          </p>
        </section>

        <div className={styles.manifesto} aria-hidden="true">
          <span>VẬN ĐỘNG · KẾT NỐI · TIẾN BỘ ·</span>
          <span>VẬN ĐỘNG · KẾT NỐI · TIẾN BỘ ·</span>
        </div>

        <section
          className={styles.event}
          id="su-kien"
          aria-labelledby="event-title"
        >
          <div className={styles.eventImage}>
            <Image
              src="/sporthub/activity-stretch-hd.webp"
              alt="Nhóm người cùng giãn cơ sau buổi tập"
              fill
              sizes="(max-width: 760px) 100vw, 50vw"
              quality={90}
            />
          </div>
          <div className={styles.eventCopy}>
            <h2 id="event-title">Hẹn gặp bạn ở sự kiện tiếp theo.</h2>
            <p>
              Hiện chưa có sự kiện được công bố. Các buổi tập cộng đồng và hoạt
              động tại trung tâm sẽ xuất hiện tại đây khi có lịch mới.
            </p>
            <a className={styles.outlineAction} href="#hoat-dong">
              Khám phá hoạt động thường ngày
            </a>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div>
          <strong>SportHub.</strong>
          <p>Mỗi ngày, một bước tiến.</p>
        </div>
        <nav aria-label="Điều hướng chân trang">
          <a href="#cau-chuyen">Trung tâm</a>
          <a href="#hoat-dong">Lớp tập</a>
          <a href="#su-kien">Sự kiện</a>
          <Link href="/member">Hội viên</Link>
        </nav>
        <small>© {new Date().getFullYear()} SportHub</small>
      </footer>
    </div>
  );
}
