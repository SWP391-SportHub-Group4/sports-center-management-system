import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import styles from "./concepts.module.css";

export const metadata: Metadata = {
  title: "SportHub | Hướng thiết kế Court & Volt",
  robots: { index: false, follow: false },
};

const concepts = [
  {
    file: "01-header-account.png",
    title: "PublicHeader & AccountMenu",
    description: "Điều hướng rõ ràng, tài khoản mở ngay tại điểm thao tác.",
    width: 2103,
    height: 748,
  },
  {
    file: "02-hero.png",
    title: "Hero",
    description: "Khoảnh khắc trên sân làm nền cho lời mời bắt đầu.",
    width: 1672,
    height: 941,
  },
  {
    file: "03-course-list.png",
    title: "List & CourseCard",
    description:
      "Hai khóa học, ảnh lớn và thông tin quyết định đặt cùng một nhịp.",
    width: 1672,
    height: 941,
  },
  {
    file: "04-course-detail.png",
    title: "Detail",
    description: "Chi tiết khóa và hành động đăng ký nằm cạnh nhau.",
    note: "Địa điểm và điều kiện tham gia trong ảnh chỉ là chữ minh họa.",
    width: 1672,
    height: 941,
  },
  {
    file: "05-account-form.png",
    title: "Form",
    description: "Biểu mẫu ngắn, focus rõ, thẻ hội viên chỉ để minh họa.",
    note: "Dùng logo và nội dung bảo mật thật trong mẫu tương tác, không lấy chữ từ ảnh.",
    width: 1672,
    height: 941,
  },
  {
    file: "06-member-checkout.png",
    title: "Checkout hội viên",
    description: "Khóa học, điểm và phần tiền còn lại dễ kiểm tra.",
    note: "Số dư ví trong ảnh do công cụ tạo ảnh tự đặt; mẫu tương tác dùng 200 điểm.",
    width: 1672,
    height: 941,
  },
  {
    file: "07-counter-checkout.png",
    title: "Checkout tại quầy",
    description: "Người thụ hưởng, OTP và trạng thái khóa thanh toán rõ ràng.",
    note: "OTP nghiệp vụ gửi qua email hội viên; ảnh có chữ minh họa khác và không phải đặc tả.",
    width: 1672,
    height: 941,
  },
  {
    file: "08-footer.png",
    title: "Footer",
    description: "Kết thúc bằng nhận diện SportHub và ba đường dẫn chính.",
    width: 1860,
    height: 846,
  },
] as const;

export default function ConceptsPage() {
  return (
    <main className={styles.page}>
      <div className={styles.intro}>
        <Link href="/design-review" className={styles.back}>
          ← Về mẫu tương tác
        </Link>
        <h1>Hướng thiết kế Court & Volt</h1>
        <p>
          Tám ảnh tham chiếu riêng cho từng phần giao diện. Đây là concept hình
          ảnh để review bố cục và cảm giác thương hiệu; chữ trong ảnh do công cụ
          tạo ảnh vẽ ra, không dùng làm dữ liệu hoặc quy định nghiệp vụ.
        </p>
      </div>
      <nav className={styles.index} aria-label="Chọn ảnh tham chiếu">
        {concepts.map((concept, index) => (
          <a key={concept.file} href={`#concept-${index + 1}`}>
            {concept.title}
          </a>
        ))}
      </nav>
      <div className={styles.gallery}>
        {concepts.map((concept, index) => (
          <section
            key={concept.file}
            id={`concept-${index + 1}`}
            className={styles.section}
            aria-labelledby={`concept-title-${index + 1}`}
          >
            <div className={styles.heading}>
              <h2 id={`concept-title-${index + 1}`}>{concept.title}</h2>
              <p>{concept.description}</p>
            </div>
            <Image
              src={`/sporthub/court-volt/concepts/${concept.file}`}
              alt={`Ảnh ý tưởng thiết kế ${concept.title}`}
              width={concept.width}
              height={concept.height}
              sizes="(max-width: 767px) 100vw, 90vw"
              className={styles.image}
              priority={index === 0}
            />
            {"note" in concept && <p className={styles.note}>{concept.note}</p>}
          </section>
        ))}
      </div>
    </main>
  );
}
