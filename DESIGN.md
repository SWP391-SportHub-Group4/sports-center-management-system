---
name: SportHub
description: Giao diện quản lý trung tâm thể thao rõ ràng, năng động và đáng tin.
colors:
  navy: "#1a2b4c"
  sky: "#6ec1e4"
  ice: "#c0e4f3"
  slate: "#4c607c"
  gray: "#e6e6e6"
  white: "#ffffff"
  public-accent: "#236e95"
typography:
  display:
    fontFamily: "Roboto, sans-serif"
    fontSize: "clamp(48px, 6.3vw, 90px)"
    fontWeight: 700
    lineHeight: 1.06
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Roboto, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.3
  title:
    fontFamily: "Roboto, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.4
  body:
    fontFamily: "Roboto, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Roboto, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  sm: "8px"
  md: "12px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "24px"
  "6": "32px"
components:
  button-primary:
    backgroundColor: "{colors.navy}"
    textColor: "{colors.white}"
    rounded: "{rounded.sm}"
    padding: "10px 16px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.ice}"
    textColor: "{colors.navy}"
    rounded: "{rounded.sm}"
    padding: "10px 16px"
    height: "44px"
  button-quiet:
    backgroundColor: "{colors.white}"
    textColor: "{colors.navy}"
    rounded: "{rounded.sm}"
    padding: "10px 16px"
    height: "44px"
  card:
    backgroundColor: "{colors.white}"
    textColor: "{colors.navy}"
    rounded: "{rounded.md}"
    padding: "24px"
  field:
    backgroundColor: "{colors.ice}"
    textColor: "{colors.navy}"
    rounded: "{rounded.sm}"
    padding: "10px 12px"
    height: "44px"
---

# Design System: SportHub

## 1. Overview

**Creative North Star: "Bảng lịch tập rõ nhịp"**

SportHub có cảm giác của một lịch tập dễ đọc: mỗi khu vực cho biết việc gì đang diễn ra, việc gì cần làm tiếp và kết quả ở đâu. Giao diện hội viên và nhân viên ưu tiên tác vụ, dùng mật độ vừa đủ và giữ nhịp điều hướng ổn định. Trang công khai được phép mở rộng hình ảnh và cỡ chữ để giới thiệu trung tâm, nhưng vẫn dùng cùng nhận diện.

Các màn hình hiện có là bản xem trước với dữ liệu minh họa. Thiết kế phải cho thấy rõ trạng thái này và không trình bày dữ liệu demo như dữ liệu tài khoản thật.

**Key Characteristics:**

- Rõ ràng trong thứ bậc thông tin và trạng thái.
- Năng động qua nội dung và hành động, không qua chuyển động trang trí.
- Đáng tin nhờ từ ngữ cụ thể, tương phản tốt và phản hồi dễ nhận biết.

## 2. Colors

**Navy vững chãi, xanh nhịp thở.** Navy giữ vai trò chữ và hành động chính; xanh sáng tạo lớp nền phụ, trạng thái chọn và không gian thở.

### Primary

- **Navy vững chãi:** chữ chính, nút chính, tiêu đề và trạng thái cần nhấn mạnh; ánh xạ đến `--navy`.
- **Xanh nhịp thở:** màu nhận diện phụ và điểm sáng; ánh xạ đến `--sky`.
- **Xanh băng:** nền phụ, trạng thái được chọn và nút phụ; ánh xạ đến `--ice`.

### Neutral

- **Trắng:** nền chính và bề mặt nội dung; ánh xạ đến `--white`.
- **Slate:** chữ phụ và chú giải; ánh xạ đến `--slate`.
- **Xám đường viền:** đường ngăn và viền thông thường; ánh xạ đến `--gray`.

### Named Rules

**The Clarity Rule.** Chữ thường phải đạt ít nhất 4.5:1; chữ lớn đạt ít nhất 3:1 trên nền của nó. Màu nhạt chỉ dùng khi độ tương phản đã được kiểm tra.

## 3. Typography

**Display Font:** Roboto, sans-serif.  
**Body Font:** Roboto, sans-serif.  
**Label Font:** Roboto, sans-serif.

**Character:** Một họ chữ thống nhất tạo cảm giác gọn và chắc tay. Phân cấp bằng cỡ, độ đậm và khoảng cách thay vì thêm một font trang trí.

### Hierarchy

- **Display:** chỉ dành cho hero công khai; dùng vai trò `typography.display`.
- **Headline:** tiêu đề trang ứng dụng; dùng vai trò `typography.headline`.
- **Title:** tiêu đề mục và số liệu cần đọc nhanh; dùng vai trò `typography.title`.
- **Body:** nội dung tác vụ; dùng vai trò `typography.body`, giới hạn dòng văn xuôi dài ở khoảng 65–75 ký tự.
- **Label:** điều hướng, nút và nhãn biểu mẫu; dùng vai trò `typography.label`.

## 4. Elevation

**Gọn, chắc tay; độ nổi nhẹ.** Phần lớn bề mặt phân lớp bằng nền và viền. Bóng đổ hiện có rất nhẹ, chỉ hỗ trợ tách thẻ, hộp thoại và thông báo nổi khỏi nền.

### Shadow Vocabulary

- **Surface low:** `0 2px 8px rgb(26 43 76 / 6%)`, ánh xạ đến `--shadow`; dùng cho thẻ hoặc bề mặt nổi hiện có.

### Named Rules

**The Light Lift Rule.** Không tăng bóng đổ để thay thế thứ bậc nội dung. Khi một vùng cần nổi bật hơn, kiểm tra bố cục và trạng thái trước.

## 5. Components

### Buttons

- **Shape:** góc gọn `rounded.sm`, chiều cao điều khiển tối thiểu 44px.
- **Primary:** nền navy, chữ trắng, dùng cho hành động chính.
- **Secondary:** nền ice, chữ navy, dùng cho hành động phụ.
- **Quiet:** nền trong suốt hoặc trắng, chữ navy, dùng cho hành động ít ưu tiên.
- **Hover / Focus:** hover có phản hồi rõ; focus có viền nhìn thấy bằng bàn phím. Tránh chuyển động khi người dùng bật giảm chuyển động.

### Cards / Containers

- **Corner Style:** `rounded.md`.
- **Background:** trắng; có thể dùng ice cho vùng phụ.
- **Border / Shadow:** viền xám và bóng `--shadow` hiện có; không tăng độ nổi tùy tiện.
- **Internal Padding:** `spacing.5` là mức thường dùng.

### Inputs / Fields

- **Style:** nền ice, chữ navy, viền slate, góc `rounded.sm`, cỡ chữ nhập 16px.
- **Focus:** viền focus nhìn thấy rõ theo stylesheet chung.
- **Error / Disabled:** trạng thái lỗi có viền đậm hơn; trạng thái vô hiệu giảm tương phản nhưng vẫn đọc được.

### Navigation

- **Member app:** thanh bên trên desktop, điều hướng ngắn gọn trên màn hình nhỏ; mục hiện tại dùng nền ice và gạch chân.
- **Homepage công khai:** thanh điều hướng trên cùng dẫn tới giới thiệu, hoạt động và sự kiện; đường vào khu vực hội viên tách biệt.
- **Tap target:** liên kết và nút tương tác tối thiểu 44px theo các pattern hiện có.

## 6. Do's and Don'ts

### Do:

- **Do** dùng navy cho văn bản chính và hành động chính, ice cho nền phụ và trạng thái chọn.
- **Do** giữ tên gọi nghiệp vụ nhất quán giữa điều hướng, lịch lớp, gói tập và thông báo.
- **Do** đánh dấu rõ “dữ liệu minh họa” khi một phần giao diện chưa kết nối backend.
- **Do** duy trì focus nhìn thấy, điều hướng bàn phím và hỗ trợ giảm chuyển động.

### Don't:

- **Don't** dùng nội dung, số liệu, lịch sự kiện hay trạng thái giả như dữ liệu thật.
- **Don't** dùng ảnh minh họa để ngụ ý đó là ảnh chụp thật của trung tâm.
- **Don't** thêm màu, font hay thành phần trang trí mới chỉ để một màn hình trông nổi bật hơn.
- **Don't** dùng bóng đổ mạnh, thẻ lồng thẻ hoặc các chuyển động gây chậm tác vụ.
