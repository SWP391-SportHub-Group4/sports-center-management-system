"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { CourtIcon, courtIconNames } from "@/components/brand/CourtIcon";
import { SportSticker } from "@/components/brand/SportSticker";
import { Button } from "@/components/primitives/Button";
import {
  CourseCard,
  Footer,
  Hero,
  PublicHeader,
  money,
  courseImage,
  type Course,
} from "./PublicComponents";
import s from "./review.module.css";

const courses: Course[] = [
  {
    id: "badminton",
    sport: "Cầu lông",
    title: "Vững kỹ thuật, tự tin lên sân",
    schedule: "Thứ 3 & Thứ 5 · 18:00–19:30",
    coach: "Trần Quốc Huy",
    price: 1800000,
    seats: 4,
    sessions: 12,
  },
  {
    id: "basketball",
    sport: "Bóng rổ",
    title: "Bắt đầu cùng bóng rổ",
    schedule: "Thứ 7 & Chủ nhật · 08:00–09:30",
    coach: "Lê Hoàng Nam",
    price: 1600000,
    seats: 0,
    sessions: 12,
  },
];

export function CourseList({
  onSelect,
}: {
  onSelect: (course: Course) => void;
}) {
  const [query, setQuery] = useState("");
  const [sport, setSport] = useState("Tất cả");
  const [state, setState] = useState("ready");
  const filtered = courses.filter(
    (course) =>
      (sport === "Tất cả" || course.sport === sport) &&
      course.title
        .toLocaleLowerCase("vi")
        .includes(query.toLocaleLowerCase("vi")),
  );
  return (
    <section
      id="list"
      className={`${s.section} ${s.courseList}`}
      aria-labelledby="list-title"
    >
      <h2 id="list-title">
        Một lịch tập <span className={s.accentTitle}>dành cho bạn</span>
      </h2>
      <p>Khóa học theo nhóm. Đăng ký một lần cho cả khóa.</p>
      <div className={s.filters}>
        <label>
          <span className={s.iconLine}>
            <CourtIcon name="search" size={18} />
            Tìm khóa học
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tên khóa học…"
          />
        </label>
        <fieldset className={s.sportFilters}>
          <legend>Bộ môn</legend>
          <div>
            {["Tất cả", "Cầu lông", "Bóng rổ"].map((name) => (
              <button
                key={name}
                type="button"
                aria-pressed={sport === name}
                onClick={() => setSport(name)}
              >
                {name}
              </button>
            ))}
          </div>
        </fieldset>
        <label>
          Trạng thái để review
          <select value={state} onChange={(e) => setState(e.target.value)}>
            <option value="ready">Có dữ liệu</option>
            <option value="loading">Đang tải</option>
            <option value="error">Lỗi kết nối</option>
            <option value="empty">Chưa có khóa</option>
          </select>
        </label>
      </div>
      {state === "loading" ? (
        <div role="status" className={s.notice}>
          <CourtIcon name="refresh" size={24} />
          Đang tải khóa học…
        </div>
      ) : state === "error" ? (
        <div role="alert" className={s.notice}>
          <CourtIcon name="alert" size={24} />
          Không tải được khóa học.{" "}
          <Button variant="secondary" onClick={() => setState("ready")}>
            Thử lại
          </Button>
        </div>
      ) : state === "empty" || !filtered.length ? (
        <div role="status" className={s.notice}>
          <CourtIcon name="search" size={24} />
          Chưa có khóa phù hợp.{" "}
          <Button
            variant="ghost"
            onClick={() => {
              setQuery("");
              setSport("Tất cả");
              setState("ready");
            }}
          >
            Xóa bộ lọc
          </Button>
        </div>
      ) : (
        <div className={s.courseGrid}>
          {filtered.map((course) => (
            <CourseCard key={course.id} course={course} onSelect={onSelect} />
          ))}
        </div>
      )}
    </section>
  );
}

export function CourseDetail({
  course,
  onCheckout,
}: {
  course: Course;
  onCheckout: () => void;
}) {
  return (
    <section
      id="detail"
      className={`${s.section} ${s.detail}`}
      aria-labelledby="detail-title"
    >
      <div className={s.detailMedia}>
        <div className={s.detailPhoto}>
          <Image
            src={courseImage(course)}
            alt={`Ảnh minh họa khóa ${course.sport.toLowerCase()}`}
            fill
            sizes="(max-width: 767px) 100vw, 60vw"
          />
        </div>
      </div>
      <aside className={`${s.panel} ${s.bookingPanel}`}>
        <span className={s.sportLabel}>
          <CourtIcon
            name={course.id === "basketball" ? "basketball" : "badminton"}
            size={20}
          />
          Khóa học {course.sport} · Mẫu chi tiết
        </span>
        <h2 id="detail-title">{course.title}</h2>
        <p>
          Rèn nền tảng cùng huấn luyện viên, thực hành theo nhóm và theo dõi
          tiến bộ qua từng buổi.
        </p>
        <dl className={s.facts}>
          <div>
            <dt className={s.iconLine}>
              <CourtIcon name="calendar" size={18} />
              Lịch học
            </dt>
            <dd>{course.schedule}</dd>
          </div>
          <div>
            <dt className={s.iconLine}>
              <CourtIcon name="user" size={18} />
              Huấn luyện viên
            </dt>
            <dd>{course.coach}</dd>
          </div>
          <div>
            <dt className={s.iconLine}>
              <CourtIcon name="clock" size={18} />
              Thời lượng khóa
            </dt>
            <dd>{course.sessions} buổi</dd>
          </div>
          <div>
            <dt className={s.iconLine}>
              <CourtIcon name="location" size={18} />
              Địa điểm
            </dt>
            <dd>Sân trong nhà SportHub</dd>
          </div>
        </dl>
        <div className={s.bookingPriceLabel}>Học phí trọn khóa</div>
        <p className={s.price}>{money(course.price)}</p>
        <p>
          {course.seats
            ? `Còn ${course.seats} chỗ trong lớp mẫu.`
            : "Lớp mẫu đã đủ chỗ."}
        </p>
        <Button size="lg" block disabled={!course.seats} onClick={onCheckout}>
          Tiếp tục thanh toán
          <CourtIcon name="arrow" size={18} />
        </Button>
        <small>
          Bạn sẽ kiểm tra lại dịch vụ và số tiền trước khi thanh toán.
        </small>
        <details className={s.disclosure}>
          <summary>Điều kiện tham gia</summary>
          <p>
            Khóa cầu lông và bóng rổ mua độc lập với Membership Gym. Mang giày
            thể thao và đến trước giờ học.
          </p>
        </details>
      </aside>
    </section>
  );
}

export function AccountForm() {
  const [saved, setSaved] = useState(false);
  return (
    <section
      id="form"
      className={`${s.section} ${s.accountForm}`}
      aria-labelledby="form-title"
    >
      <div>
        <span className={s.featureIcon}>
          <CourtIcon name="user" size={32} />
        </span>
        <h2 id="form-title">Thông tin của bạn</h2>
        <p>
          Giữ thông tin liên hệ chính xác để nhận lịch học và thông báo từ trung
          tâm.
        </p>
        <div className={s.memberPass}>
          <span>SportHub.</span>
          <CourtIcon name="gym" size={48} />
          <strong>Nguyễn Minh Anh</strong>
          <small>Thẻ hội viên minh họa · Không dùng để check-in</small>
        </div>
      </div>
      <form
        className={s.panel}
        onChange={() => setSaved(false)}
        onSubmit={(event) => {
          event.preventDefault();
          setSaved(true);
        }}
      >
        <label>
          Họ và tên
          <input
            name="fullName"
            autoComplete="name"
            defaultValue="Nguyễn Minh Anh"
            required
            maxLength={100}
          />
        </label>
        <label>
          Email
          <input
            name="email"
            type="email"
            autoComplete="email"
            defaultValue="minhanh@example.com"
            required
          />
        </label>
        <label>
          Số điện thoại
          <input
            name="phone"
            type="tel"
            autoComplete="tel"
            placeholder="Nhập số điện thoại"
            pattern="[+0-9 ]{9,20}"
            title="Nhập số điện thoại từ 9 đến 20 ký tự"
          />
        </label>
        <Button type="submit" size="lg">
          <CourtIcon name="check" size={20} />
          Lưu thông tin mẫu
        </Button>
        <p role="status">
          {saved
            ? "Đã lưu trong bản xem thử. Dữ liệu không gửi lên hệ thống."
            : "Các thay đổi chỉ dùng để review giao diện."}
        </p>
      </form>
    </section>
  );
}

export function CheckoutLayout({
  course,
  counter = false,
}: {
  course: Course;
  counter?: boolean;
}) {
  const [points, setPoints] = useState(false);
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState(false);
  const [result, setResult] = useState("");
  const [status, setStatus] = useState("pending");
  const [member, setMember] = useState("Nguyễn Minh Anh · SH-00824");
  const applied = points ? 200000 : 0;
  const blocked =
    status !== "pending" ||
    !course.seats ||
    (counter && points && (!sent || otp !== "123456"));
  return (
    <section
      id={counter ? "counter" : "checkout"}
      className={`${s.section} ${counter ? s.counterSection : ""}`}
      aria-labelledby={counter ? "counter-title" : "checkout-title"}
    >
      <div className={s.row}>
        <h2 id={counter ? "counter-title" : "checkout-title"}>
          <CourtIcon name={counter ? "receipt" : "wallet"} size={32} />{" "}
          {counter ? "Quầy bán dịch vụ" : "Kiểm tra & thanh toán"}
        </h2>
        <span className={s.tag}>{counter ? "Receptionist" : "Member"}</span>
      </div>
      <p>
        {counter
          ? "Xác định người thụ hưởng trước khi chọn dịch vụ và dùng điểm."
          : "Một đơn hàng, rõ quyền lợi và số tiền cần trả."}
      </p>
      <div className={s.checkoutGrid}>
        <div className={s.stack}>
          {counter && (
            <div className={s.panel}>
              <h3 className={s.iconLine}>
                <CourtIcon name="user" size={24} />
                Người thụ hưởng
              </h3>
              <label>
                Hội viên mẫu
                <select
                  value={member}
                  disabled={status !== "pending"}
                  onChange={(event) => {
                    setMember(event.target.value);
                    setOtp("");
                    setSent(false);
                    setResult("");
                  }}
                >
                  <option>Nguyễn Minh Anh · SH-00824</option>
                  <option>Phạm Bảo Ngọc · SH-00916</option>
                </select>
              </label>
              <small>
                Danh sách và số dư trong mẫu đều là dữ liệu minh họa.
              </small>
            </div>
          )}
          <div className={s.panel}>
            <h3>{counter ? "Chọn khóa học" : "Thông tin khóa học"}</h3>
            <div className={s.orderCourse}>
              <Image
                src={courseImage(course)}
                alt=""
                width={160}
                height={112}
              />
              <div>
                <span className={s.sportLabel}>{course.sport}</span>
                <h3>{course.title}</h3>
              </div>
            </div>
            <p>{course.schedule}</p>
            <p>
              {course.sessions} buổi · {course.sport}
            </p>
            <strong>{money(course.price)}</strong>
          </div>
          <div className={s.panel}>
            <h3 className={s.iconLine}>
              <CourtIcon name="wallet" size={24} />
              Dùng điểm trong ví
            </h3>
            <p>Số dư mẫu: 200 điểm · 1 điểm = 1.000 ₫</p>
            <label className={s.checkbox}>
              <input
                type="checkbox"
                checked={points}
                disabled={status !== "pending"}
                onChange={(e) => {
                  setPoints(e.target.checked);
                  setOtp("");
                  setSent(false);
                  setResult("");
                }}
              />
              Dùng 200 điểm cho đơn này
            </label>
            {counter && points && (
              <div className={s.stack}>
                <p>Cần hội viên xác nhận OTP trước khi dùng điểm tại quầy.</p>
                <Button
                  variant="secondary"
                  disabled={status !== "pending"}
                  onClick={() => {
                    setSent(true);
                    setOtp("");
                  }}
                >
                  Gửi OTP mẫu
                  <CourtIcon name="mail" size={18} />
                </Button>
                {sent && (
                  <label>
                    OTP minh họa: 123456
                    <input
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      disabled={status !== "pending"}
                      aria-invalid={otp.length === 6 && otp !== "123456"}
                      aria-describedby="counter-otp-hint"
                      value={otp}
                      onChange={(e) =>
                        setOtp(e.target.value.replace(/\D/g, ""))
                      }
                    />
                    <small id="counter-otp-hint" role="status">
                      {otp === "123456"
                        ? "Đã xác nhận OTP mẫu cho hội viên và số điểm hiện tại."
                        : otp.length === 6
                          ? "Mã mẫu chưa đúng. Nhập 123456 để thử luồng xác nhận."
                          : "Nhập đủ 6 chữ số để xác nhận dùng điểm."}
                    </small>
                  </label>
                )}
              </div>
            )}
          </div>
          <label>
            Trạng thái để review
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setResult("");
              }}
            >
              <option value="pending">Chờ thanh toán</option>
              <option value="expired">Đã hết hạn</option>
              <option value="reconciliation">Cần đối soát</option>
              <option value="compensated">Đã bồi hoàn điểm</option>
            </select>
          </label>
        </div>
        <aside className={`${s.panel} ${s.summary}`}>
          <h3 className={s.iconLine}>
            <CourtIcon name="receipt" size={24} />
            Tóm tắt đơn hàng
          </h3>
          {counter && (
            <p className={s.beneficiary}>
              Thanh toán cho <strong>{member}</strong>
            </p>
          )}
          <dl className={s.totals}>
            <div>
              <dt>Giá dịch vụ</dt>
              <dd>{money(course.price)}</dd>
            </div>
            <div>
              <dt>Điểm sử dụng{points && <small>200 điểm</small>}</dt>
              <dd>{points ? `−${money(applied)}` : money(0)}</dd>
            </div>
            <div>
              <dt>Thanh toán qua VNPay</dt>
              <dd>{money(course.price - applied)}</dd>
            </div>
          </dl>
          <p className={s.notice}>
            <CourtIcon
              name={status === "pending" ? "shield" : "alert"}
              size={20}
            />
            {status === "expired"
              ? "Đơn đã hết hạn. Cần kiểm tra lại chỗ và tạo checkout mới."
              : status === "reconciliation"
                ? "Đang đối soát. Kiểm tra trạng thái trước khi thử thanh toán lại."
                : status === "compensated"
                  ? "Mẫu kết quả: đã bồi hoàn bằng điểm, chưa cấp quyền lợi khóa học."
                  : "Bản mẫu không giữ chỗ, gửi OTP hoặc tạo giao dịch thật."}
          </p>
          {blocked && status === "pending" && (
            <p role="status" className={s.blockedReason}>
              {!course.seats
                ? "Khóa đã đủ chỗ. Chọn khóa khác để tiếp tục."
                : "Cần OTP hợp lệ của hội viên để dùng điểm tại quầy."}
            </p>
          )}
          <Button
            size="lg"
            block
            disabled={blocked}
            onClick={() =>
              setResult(
                "Đã xem thử bước chuyển sang VNPay. Chưa thanh toán và chưa cấp quyền lợi.",
              )
            }
          >
            Xem thử thanh toán
            <CourtIcon name="arrow" size={18} />
          </Button>
          <p role="status">{result}</p>
        </aside>
      </div>
    </section>
  );
}

export default function ReviewPage() {
  const [course, setCourse] = useState(courses[0]);
  const moveTo = (id: string) => {
    const section = document.getElementById(id);
    const heading = section?.querySelector("h2");
    heading?.setAttribute("tabindex", "-1");
    heading?.focus({ preventScroll: true });
    section?.scrollIntoView({
      block: "start",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  };
  return (
    <div className={s.root} lang="vi">
      <a className={s.skip} href="#review-main">
        Bỏ qua điều hướng
      </a>
      <div className={s.reviewBar}>
        <strong>Phòng review SportHub</strong>
        <span>Dữ liệu demo · Không phát sinh giao dịch</span>
        <nav aria-label="Chọn mẫu review">
          <a href="#public">Public</a>
          <a href="#list">List</a>
          <a href="#detail">Detail</a>
          <a href="#form">Form</a>
          <a href="#checkout">Checkout</a>
          <a href="#counter">Quầy</a>
          <a href="#brand">Brandkit & icons</a>
          <Link href="/design-review/concepts">Ảnh ý tưởng mới</Link>
        </nav>
      </div>
      <div className={s.container} id="public">
        <PublicHeader />
        <main id="review-main">
          <Hero />
          <CourseList
            onSelect={(selected) => {
              setCourse(selected);
              moveTo("detail");
            }}
          />
          <CourseDetail course={course} onCheckout={() => moveTo("checkout")} />
          <AccountForm />
          <CheckoutLayout key={`member-${course.id}`} course={course} />
          <CheckoutLayout
            key={`counter-${course.id}`}
            course={course}
            counter
          />
          <section
            id="brand"
            className={s.section}
            aria-labelledby="brand-title"
          >
            <h2 id="brand-title">Courtline, nét riêng của SportHub</h2>
            <p>
              21 icon SVG cùng nét 1.8, lưới 24. Dùng rõ ràng ở kích thước nhỏ
              và đồng nhất với đường kẻ sân.
            </p>
            <div
              className={s.stickerGallery}
              aria-label="Sticker SportHub theo bộ môn"
            >
              <figure>
                <SportSticker sport="gym" size={104} />
                <figcaption>Gym · Tập tự do & PT</figcaption>
              </figure>
              <figure>
                <SportSticker sport="badminton" size={104} />
                <figcaption>Cầu lông · Toàn bộ khóa</figcaption>
              </figure>
              <figure>
                <SportSticker sport="basketball" size={104} />
                <figcaption>Bóng rổ · Toàn bộ khóa</figcaption>
              </figure>
            </div>
            <div className={s.iconGallery}>
              {courtIconNames.map((name) => (
                <div key={name}>
                  <CourtIcon name={name} size={32} />
                  <span>{name}</span>
                </div>
              ))}
            </div>
            <details className={s.disclosure}>
              <summary>Xem bảng định hướng Brandkit</summary>
              <Image
                src="/sporthub/court-volt/brand-board.png"
                alt="Board định hướng SportHub Court & Volt: ảnh thể thao, icon, màu và ứng dụng thương hiệu"
                width={1586}
                height={1024}
                sizes="100vw"
                className={s.brandBoard}
              />
              <p>
                Board là concept hình ảnh. Logo hiện có của sản phẩm được giữ
                nguyên; ảnh vận động viên là ảnh AI minh họa.
              </p>
            </details>
          </section>
        </main>
        <Footer />
      </div>
    </div>
  );
}
