# Product

SportHub là **hệ thống quản lý trung tâm thể thao với ba môn Gym (bao gồm PT), cầu lông và bóng rổ; có thể mở rộng thêm môn trong tương lai**. PT là dịch vụ thuộc Gym, không phải môn thứ tư.

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Hội viên (Member)**: Xem lớp/khóa học đa môn (Cầu lông, Bóng rổ...) và ghi danh có giữ chỗ; mua Membership Gym và gói PT; quản lý ví điểm và lịch sử điểm; xem lịch hôm nay/tuần, hóa đơn, thông báo; hỏi chatbot lịch tập; chuyển đổi ngôn ngữ EN / VI.
- **Huấn luyện viên của trung tâm (Coach)**: Có chuyên môn theo môn; xem lịch dạy và roster lớp mình phụ trách. Coach có chuyên môn Personal Training còn lập kế hoạch tập, ghi kết quả, giao homework, dùng gợi ý AI cho học viên được phân công.
- **Nhân viên lễ tân (Receptionist)**: Tìm và đăng ký Member tại quầy; Gym check-in/out; điểm danh lớp nhóm; checkout thay Member (dùng điểm phải có mã OTP gửi email Member); xem Court Schedule; hỗ trợ đối soát thanh toán.
- **Quản lý trung tâm (Center Manager)**: Cấu hình môn, phòng/sân, giá thuê sân, Membership; tạo lớp và xếp lịch, phân công Coach theo chuyên môn, duyệt hoàn điểm, xử lý lớp dưới ngưỡng hoàn vốn, sự cố, báo cáo doanh thu, audit log.
- **Quản trị hệ thống (System Administrator)**: Quản trị tài khoản nhân sự, phân quyền vai trò (RBAC), khóa/mở khóa tài khoản.
- **Khách vãng lai (Public Guest)**: Xem trang chủ đa môn, danh sách lớp đang mở (giá, lịch, chỗ còn), lịch sân trống tổng quát; đăng ký Member.

## Product Purpose

SportHub là hệ thống quản lý **trung tâm thể thao đa môn**, vận hành liền mạch giữa 5 vai trò. Sản phẩm số hóa chu trình từ tiếp đón tại quầy, ghi danh khóa học có giữ chỗ, thanh toán bằng tiền kết hợp ví điểm, xếp lịch sân/huấn luyện viên không trùng, cho Member thuê sân theo giờ, đến theo dõi tập luyện và báo cáo. Thành công nghĩa là học viên ghi danh trơn tru và không bị bán vượt chỗ, lớp đạt ngưỡng hoàn vốn hoặc được xử lý minh bạch, nhân viên thao tác chính xác và quản lý nắm tức thời tình hình vận hành.

## Positioning

Nền tảng đa môn khép kín cho trung tâm thể thao: khác với phần mềm gym đơn môn hoặc ứng dụng ghi chép tập luyện, SportHub xem **môn thể thao là dữ liệu cấu hình**, bán khóa học cố định theo lớp, chống trùng sân/huấn luyện viên bằng ràng buộc cơ sở dữ liệu, giữ chỗ khi checkout để không bán vượt sĩ số, có ngưỡng hoàn vốn cho từng lớp, ví điểm 1 điểm = 1.000 VND (không hết hạn) với hoàn trả chỉ bằng điểm, cho Member thuê sân theo giờ, và AI assistant cho Member chỉ đọc context SportHub; các thao tác nghiệp vụ vẫn đi qua API/authorization riêng. Hỗ trợ song ngữ EN / VI.

## Operating Context

- Môi trường sử dụng: Quầy lễ tân với màn hình máy tính; sân/phòng tập với thiết bị di động của học viên và tablet của huấn luyện viên; máy tính quản lý để theo dõi điều hành.
- Nhịp điệu vận hành: Sân/phòng mở theo giờ hoạt động (mặc định 06:00–22:00); lớp là khóa học cố định gồm nhiều buổi; Receptionist điểm danh lớp nhóm; hóa đơn được thu qua VNPay-QR hoặc điểm, đối soát tại quầy.
- Tích hợp số: VNPay sandbox (mock chỉ khi Development và UseMock được bật rõ ràng), email SMTP (thiếu thì ghi log), Gemini cho Member AI assistant (thiếu khóa thì endpoint chat báo chưa cấu hình); gợi ý workout của Coach dùng rule-based, xuất lịch sự kiện sang Google / Apple Calendar (`.ics`).

## Capabilities and Constraints

- **Danh mục môn và cơ sở vật chất**: Manager tự thêm/sửa môn (phạm vi sản phẩm: Gym (bao gồm PT), Cầu lông, Bóng rổ; seed kỹ thuật còn PT riêng, cần migration theo CAT-01), phòng/sân, giờ hoạt động, khóa sân và giá thuê theo khung giờ.
- **Ghi danh khóa học có giữ chỗ**: Checkout lớp giữ chỗ 15 phút; sĩ số không bao giờ vượt trần dù nhiều người đặt đồng thời.
- **Ngưỡng hoàn vốn**: Lớp chốt trước khai giảng N ngày; nếu dưới ngưỡng, học viên nhận email chọn chuyển lớp hoặc hoàn điểm trong thời hạn; Manager có thể miễn ngưỡng có lý do.
- **Ví điểm và split payment**: Một hóa đơn có thể trả bằng điểm + VNPay-QR (ví dụ 300.000đ = 200 điểm + 100.000đ). Receptionist thanh toán thay Member bắt buộc có OTP email của Member (5 phút, tối đa 5 lần sai).
- **Hoàn trả chỉ bằng điểm**: Không hoàn tiền mặt/chuyển khoản, không hoàn qua cổng thanh toán; Manager duyệt yêu cầu hoàn điểm.
- **Chống trùng lịch**: Sân và Coach không thể bị xếp hai hoạt động cùng khung giờ (exclusion constraint).
- **Thuê sân của Member**: Mọi Member đang hoạt động được đặt sân còn trống theo giờ (1-4 giờ), không cần Membership hay duyệt; hủy trước 24 giờ hoàn 100% điểm, muộn hơn không hoàn; sự cố do trung tâm hoàn 100%.
- **Tài khoản an toàn**: Mật khẩu mạnh; quên mật khẩu qua **link đặt lại gửi email** (hạn 10 phút, dùng một lần, phản hồi trung tính không lộ email đã đăng ký), không cần mật khẩu cũ. Các trang xác thực luôn hiển thị tiếng Anh.
- **Hỗ trợ đa ngôn ngữ (i18n)**: Mặc định Tiếng Anh (EN) kèm hỗ trợ Tiếng Việt (VI), chuyển đổi tức thì trên navbar không tải lại trang.

## Brand Commitments

- Tên thương hiệu: **SportHub** (với điểm nhấn thương hiệu `Sport` + `Hub`).
- Bản sắc & Giọng điệu: Vững chãi, năng động, chuẩn xác và truyền cảm hứng thể thao. Không dùng thuật ngữ cường điệu, hứa hẹn sai thực tế.
- Nhận diện đã chốt: **Court & Volt**, dùng duy nhất [DESIGN-TOKENS.md](DESIGN-TOKENS.md) cho màu, typography, spacing, radius và motion; không tạo palette riêng theo role.
- Typography: Barlow Condensed cho tiêu đề/display, Be Vietnam Pro cho body/UI, JetBrains Mono cho mã theo token. Runtime còn cần migration từ Roboto; quy trình và owner ở [DESIGN-SKILLS-GUIDE.md](DESIGN-SKILLS-GUIDE.md).

## Implementation và phần còn thiếu

Payment/checkout/wallet và VNPay adapter đã có mã; sandbox thật cần nghiệm thu riêng. Member assistant/workout AI đã có nền tảng, Manager AI chưa triển khai. Seed kỹ thuật còn bản ghi PT riêng, chưa khớp mô hình ba môn sản phẩm. Danh sách evidence, khoảng trống và tiêu chí nghiệm thu nằm ở mục 13 của [thiết kế hệ thống](docs/Center-Management-System-Design-v3.md).

## Product Principles

1. **Minh bạch trạng thái & Tác vụ tiếp theo**: Luôn hiển thị rõ kết quả hành động, thời hạn giữ chỗ, số điểm sẽ bị trừ/hoàn và bước kế tiếp cho người dùng.
2. **Tuân thủ quy chế nghiệp vụ không thỏa hiệp**: Các quy tắc (sĩ số trần, giữ chỗ, ngưỡng hoàn vốn, hoàn chỉ bằng điểm, OTP khi thanh toán thay) được thực thi nhất quán ở cả giao diện và backend.
3. **Tối ưu trải nghiệm tại sân/quầy**: Xem lịch hôm nay, đăng ký lớp và checkout phải diễn ra trong vài chạm.
4. **Chuẩn mực đa ngôn ngữ**: Mọi thông điệp, nhãn nút và thông báo lỗi hiển thị chuẩn xác cả tiếng Anh lẫn tiếng Việt.

## Accessibility & Inclusion

- Hướng tới tiêu chuẩn WCAG AA.
- Đảm bảo độ tương phản màu chữ tối thiểu 4.5:1.
- Vùng chạm (tap target) tối thiểu 44px trên thiết bị cảm ứng.
- Hỗ trợ đầy đủ điều hướng bằng bàn phím (Tab, Enter, Escape đóng modal).
- Tôn trọng tùy chọn giảm chuyển động (`prefers-reduced-motion: reduce`).
