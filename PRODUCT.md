# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Hội viên (Member)**: Xem và đăng ký các lớp học Yoga, GroupX, PT; theo dõi buổi tập khả dụng và hạn sử dụng gói hội viên; mở mã QR Gate Pass ra vào cổng từ; quản lý lịch sử rèn luyện và hóa đơn; chuyển đổi ngôn ngữ EN / VI.
- **Huấn luyện viên (Coach)**: Theo dõi lịch dạy theo ca, điểm danh học viên trong lớp, ghi nhận đánh giá thể lực, nhận xét tiến độ và quản lý giáo án bài tập cá nhân cho học viên.
- **Nhân viên lễ tân (Receptionist)**: Kiểm soát check-in cổng từ bằng camera/máy quét; hỗ trợ đăng ký lớp tại quầy; bán gói tập và phát hành hóa đơn theo quy chuẩn (BR-30).
- **Quản lý trung tâm (Center Manager)**: Thiết lập cấu hình phòng tập, lớp học, lịch tuần, danh mục gói tập, quan hệ HLV - học viên; điều chỉnh thanh toán và theo dõi báo cáo doanh thu, audit log.
- **Quản trị hệ thống (System Administrator)**: Quản trị tài khoản người dùng, phân quyền vai trò (RBAC) và giám sát nhật ký kiểm toán hệ thống.
- **Khách vãng lai (Public Guest)**: Khám phá thông tin trung tâm thể thao, các bộ môn (Gym, Yoga, GroupX, Mobility), lịch sự kiện và điều hướng đăng ký tài khoản.

## Product Purpose

SportHub là hệ sinh thái quản lý trung tâm thể thao và rèn luyện thể chất toàn diện, vận hành liền mạch giữa 5 vai trò nghiệp vụ. Sản phẩm số hóa toàn bộ chu trình từ tiếp đón tại quầy, kiểm soát ra vào cổng từ bằng QR an toàn, đặt lịch ca tập theo thời gian thực đến theo dõi giáo án rèn luyện thể lực. Thành công nghĩa là hội viên tập luyện đều đặn, nhân viên thao tác chính xác, quản lý nắm bắt tức thời tình trạng vận hành và trung tâm vận hành không sai sót nghiệp vụ.

## Positioning

Hệ sinh thái thể thao đa năng khép kín kết hợp kiểm soát tự động hóa thực tế: Khác với các ứng dụng ghi chép tập luyện thuần túy hoặc phần mềm gym rời rạc, SportHub tích hợp trực tiếp mã QR xoay vòng chống giả mạo cho cổng từ, cơ chế hủy hoàn buổi tự động tuân thủ quy chế nghiêm ngặt (BR-18, BR-50), kiểm soát sĩ số trần phòng học theo thời gian thực (BR-13), và hỗ trợ song ngữ EN / VI mượt mà.

## Operating Context

- Môi trường sử dụng: Quầy lễ tân với màn hình máy tính và máy quét cổng từ; phòng tập với thiết bị di động của học viên và tablet của huấn luyện viên; máy tính quản lý để theo dõi điều hành.
- Nhịp điệu vận hành: Ca tập mở theo khung giờ cố định (sáng, chiều, tối); học viên quét QR tại cửa từ check-in; HLV chốt sĩ số điểm danh sau khi lớp bắt đầu; hóa đơn và thanh toán được đối soát tại quầy.
- Tích hợp số: Xuất lịch sự kiện sang Google / Apple Calendar (`.ics`), tự động gia hạn mã QR sau mỗi 60 giây với mã nonce bảo mật.

## Capabilities and Constraints

- **Kiểm soát cổng từ QR Pass**: Mã QR động có thời gian sống 60 giây, mã hóa thông tin hội viên và nonce chống chụp màn hình giả mạo.
- **Quản lý đặt lịch & Quy chế hủy (BR-18, BR-50)**: Đặt chỗ tức thời trừ buổi vào gói tập; hủy trước giờ học tối thiểu 2 tiếng được hoàn trả 1 lượt vào gói; hủy dưới 2 tiếng không hoàn lượt.
- **Sức chứa & Phòng tập (BR-13)**: Mỗi phòng tập có sĩ số tối đa; hệ thống tự động khóa đăng ký khi lớp đạt trần (Full).
- **Phát hành hóa đơn tại quầy (BR-30)**: Gói tập được đăng ký và phát hành hóa đơn tại quầy lễ tân trước khi thu tiền để đảm bảo tính pháp lý và an toàn tài chính.
- **Hỗ trợ đa ngôn ngữ (i18n)**: Mặc định Tiếng Anh (EN) kèm hỗ trợ Tiếng Việt (VI), chuyển đổi tức thì trên navbar không tải lại trang.

## Brand Commitments

- Tên thương hiệu: **SportHub** (với điểm nhấn thương hiệu `Sport` + `Hub`).
- Bản sắc & Giọng điệu: Vững chãi, năng động, chuẩn xác và truyền cảm hứng thể thao. Không dùng thuật ngữ cường điệu, hứa hẹn sai thực tế.
- Bảng màu nhận diện: Navy vững chãi (`--navy`, `#1a2b4c`), Xanh nhịp thở (`--sky`, `#236e95`), Xanh băng (`--ice`, `#c0e4f3`), Trắng (`#ffffff`).
- Typography: Roboto sans-serif đồng nhất, sắc nét, tối ưu đọc số liệu và lịch trình.

## Evidence on Hand

- Toàn bộ 48 routes của ứng dụng đã hoạt động thực tế với Next.js 16 (Turbopack) và ASP.NET Core 9 Web API.
- Dữ liệu demo đầy đủ 6 tài khoản mẫu (`admin@sporthub.vn`, `manager@sporthub.vn`, `letan@sporthub.vn`, `coach.yoga@sporthub.vn`, `coach.pt@sporthub.vn`, `an.member@sporthub.vn`) đã được cấu hình trong `DemoDataSeeder.cs`.
- Thư viện hình ảnh hoạt động thể thao phân giải cao (`/sporthub/activity-yoga-hd.webp`, `activity-fitness-hd.webp`, `activity-groupx-hd.webp`, `activity-stretch-hd.webp`).

## Product Principles

1. **Minh bạch trạng thái & Tác vụ tiếp theo**: Luôn hiển thị rõ kết quả hành động, thời hạn hủy, số buổi khả dụng và bước kế tiếp cho người dùng.
2. **Tuân thủ quy chế nghiệp vụ không thỏa hiệp**: Các quy tắc an toàn (hạn hủy 2h, sĩ số trần, hóa đơn tại quầy) được thực thi nhất quán ở cả giao diện và backend.
3. **Tối ưu trải nghiệm tại phòng tập**: Thao tác mở mã vào cửa, xem lịch tuần ô vuông và đăng ký lớp phải diễn ra trong vòng 2 chạm.
4. **Chuẩn mực đa ngôn ngữ**: Mọi thông điệp, nhãn nút và thông báo lỗi hiển thị chuẩn xác cả tiếng Anh lẫn tiếng Việt.

## Accessibility & Inclusion

- Hướng tới tiêu chuẩn WCAG AA.
- Đảm bảo độ tương phản màu chữ tối thiểu 4.5:1.
- Vùng chạm (tap target) tối thiểu 44px trên thiết bị cảm ứng.
- Hỗ trợ đầy đủ điều hướng bằng bàn phím (Tab, Enter, Escape đóng modal).
- Tôn trọng tùy chọn giảm chuyển động (`prefers-reduced-motion: reduce`) cho các hiệu ứng radar sóng QR.
