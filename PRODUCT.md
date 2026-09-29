# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Hội viên (Member)**: Xem lớp/khóa học đa môn (Cầu lông, Bóng rổ...) và ghi danh có giữ chỗ; mua Membership Gym và gói PT; quản lý ví điểm và lịch sử điểm; xem lịch hôm nay/tuần, hóa đơn, thông báo; hỏi chatbot lịch tập; chuyển đổi ngôn ngữ EN / VI.
- **Huấn luyện viên của trung tâm (Coach)**: Có chuyên môn theo môn; xem lịch dạy và roster lớp mình phụ trách. Coach có chuyên môn Personal Training còn lập kế hoạch tập, ghi kết quả, giao homework, dùng gợi ý AI cho học viên được phân công.
- **Huấn luyện viên ngoài (ExternalCoach)**: Coach tự do tự đăng ký, chờ Manager duyệt; xem sân trống và giá, thuê sân theo giờ để tự dạy, thanh toán bằng VNPay-QR và/hoặc điểm, xem lịch sử thuê. Không được quản lý hay điểm danh học viên riêng trên hệ thống.
- **Nhân viên lễ tân (Receptionist)**: Tìm và đăng ký Member tại quầy; Gym check-in/out; điểm danh lớp nhóm; checkout thay Member (dùng điểm phải có mã OTP gửi email Member); xem Court Schedule; hỗ trợ đối soát thanh toán.
- **Quản lý trung tâm (Center Manager)**: Cấu hình môn, phòng/sân, giá thuê sân, Membership; tạo lớp và xếp lịch (có chatbot gợi ý), phân công Coach theo chuyên môn, duyệt ExternalCoach, duyệt hoàn điểm, xử lý lớp dưới ngưỡng hoàn vốn, sự cố, báo cáo doanh thu, audit log.
- **Quản trị hệ thống (System Administrator)**: Quản trị tài khoản nhân sự, phân quyền vai trò (RBAC), khóa/mở khóa tài khoản.
- **Khách vãng lai (Public Guest)**: Xem trang chủ đa môn, danh sách lớp đang mở (giá, lịch, chỗ còn), lịch sân trống tổng quát; đăng ký Member hoặc đăng ký Coach ngoài.

## Product Purpose

SportHub là hệ thống quản lý **nhà văn hóa thể thao đa môn**, vận hành liền mạch giữa 6 vai trò. Sản phẩm số hóa chu trình từ tiếp đón tại quầy, ghi danh khóa học có giữ chỗ, thanh toán bằng tiền kết hợp ví điểm, xếp lịch sân/huấn luyện viên không trùng, cho thuê sân cho huấn luyện viên ngoài, đến theo dõi tập luyện và báo cáo. Thành công nghĩa là học viên ghi danh trơn tru và không bị bán vượt chỗ, lớp đạt ngưỡng hoàn vốn hoặc được xử lý minh bạch, nhân viên thao tác chính xác và quản lý nắm tức thời tình hình vận hành.

## Positioning

Nền tảng đa môn khép kín cho nhà văn hóa thể thao: khác với phần mềm gym đơn môn hoặc ứng dụng ghi chép tập luyện, SportHub xem **môn thể thao là dữ liệu cấu hình**, bán khóa học cố định theo lớp, chống trùng sân/huấn luyện viên bằng ràng buộc cơ sở dữ liệu, giữ chỗ khi checkout để không bán vượt sĩ số, có ngưỡng hoàn vốn cho từng lớp, ví điểm 1 điểm = 1.000 VND (không hết hạn) với hoàn trả chỉ bằng điểm, cho ExternalCoach thuê sân theo giờ, và chatbot function calling chỉ hành động qua danh sách hàm cố định. Hỗ trợ song ngữ EN / VI.

## Operating Context

- Môi trường sử dụng: Quầy lễ tân với màn hình máy tính; sân/phòng tập với thiết bị di động của học viên và tablet của huấn luyện viên; máy tính quản lý để theo dõi điều hành.
- Nhịp điệu vận hành: Sân/phòng mở theo giờ hoạt động (mặc định 06:00–22:00); lớp là khóa học cố định gồm nhiều buổi; Receptionist điểm danh lớp nhóm; hóa đơn được thu qua VNPay-QR hoặc điểm, đối soát tại quầy.
- Tích hợp số: VNPay-QR sandbox (thiếu khóa thì cổng mô phỏng), email SMTP (thiếu thì ghi log), Gemini cho chatbot/gợi ý (thiếu khóa thì trả lời mô phỏng), xuất lịch sự kiện sang Google / Apple Calendar (`.ics`).

## Capabilities and Constraints

- **Danh mục môn và cơ sở vật chất**: Manager tự thêm/sửa môn (seed: Gym, Personal Training, Cầu lông, Bóng rổ), phòng/sân, giờ hoạt động, khóa sân và giá thuê theo khung giờ.
- **Ghi danh khóa học có giữ chỗ**: Checkout lớp giữ chỗ 15 phút; sĩ số không bao giờ vượt trần dù nhiều người đặt đồng thời.
- **Ngưỡng hoàn vốn**: Lớp chốt trước khai giảng N ngày; nếu dưới ngưỡng, học viên nhận email chọn chuyển lớp hoặc hoàn điểm trong thời hạn; Manager có thể miễn ngưỡng có lý do.
- **Ví điểm và split payment**: Một hóa đơn có thể trả bằng điểm + VNPay-QR (ví dụ 300.000đ = 200 điểm + 100.000đ). Receptionist thanh toán thay Member bắt buộc có OTP email của Member (5 phút, tối đa 5 lần sai).
- **Hoàn trả chỉ bằng điểm**: Không hoàn tiền mặt/chuyển khoản, không hoàn qua cổng thanh toán; Manager duyệt yêu cầu hoàn điểm.
- **Chống trùng lịch**: Sân và Coach không thể bị xếp hai hoạt động cùng khung giờ (exclusion constraint).
- **Thuê sân của ExternalCoach**: Chỉ ExternalCoach đã duyệt được đặt; hủy trước 24 giờ hoàn 100% điểm, muộn hơn không hoàn; sự cố do trung tâm hoàn 100%.
- **Tài khoản an toàn**: Mật khẩu mạnh; quên mật khẩu qua OTP email, không cần mật khẩu cũ.
- **Hỗ trợ đa ngôn ngữ (i18n)**: Mặc định Tiếng Anh (EN) kèm hỗ trợ Tiếng Việt (VI), chuyển đổi tức thì trên navbar không tải lại trang.

## Brand Commitments

- Tên thương hiệu: **SportHub** (với điểm nhấn thương hiệu `Sport` + `Hub`).
- Bản sắc & Giọng điệu: Vững chãi, năng động, chuẩn xác và truyền cảm hứng thể thao. Không dùng thuật ngữ cường điệu, hứa hẹn sai thực tế.
- Bảng màu nhận diện: Navy vững chãi (`--navy`, `#1a2b4c`), Xanh nhịp thở (`--sky`, `#236e95`), Xanh băng (`--ice`, `#c0e4f3`), Trắng (`#ffffff`).
- Typography: Roboto sans-serif đồng nhất, sắc nét, tối ưu đọc số liệu và lịch trình.

## Evidence on Hand

- Ứng dụng đã có nhiều routes hoạt động với Next.js 16 (Turbopack) và ASP.NET Core Web API (con số 48 routes là của bản gym trước 30/09/2026; cần đếm lại sau refactor).
- Dữ liệu demo đã cấu hình trong `DemoDataSeeder.cs` cho mô hình cũ; bộ tài khoản demo mới theo Design v3 §15 (Admin, Manager, Receptionist, 2 Coach, ExternalCoach Approved + PendingApproval, 3 Member) sẽ được seed lại ở giai đoạn G1 — xem `docs/RUNBOOK.md`.
- Thư viện hình ảnh hoạt động thể thao đang có (`/sporthub/activity-*.webp`) gồm ảnh Yoga/Group X của bản cũ; cần thay bằng ảnh các môn mới, và nội dung trang chủ lấy từ dữ liệu môn (`SPORTS`), không hard-code.

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

## Refactor delta (PRODUCT.md — 30/09/2026)

### XÓA

| Nội dung | Lý do |
|---|---|
| Lớp Yoga, GroupX, Mobility; "5 vai trò" | Yoga/Group X bỏ; nay 6 vai trò (Design v3 §0) |
| Kiểm soát cổng từ QR Pass (QR 60 giây, nonce) và "quét QR check-in" trong định vị | Design v3 chỉ có Gym check-in/out do Receptionist ghi (BR-64); QR cổng từ không nằm trong thiết kế mới. **Chưa chắc:** nếu nhóm vẫn giữ tính năng này trong code thì thêm lại như tính năng phụ |
| Quy chế hủy BR-18/BR-50 (hoàn lượt trước 2 giờ), trừ buổi vào gói | Mô hình ghi danh theo buổi/trừ buổi bị bỏ; nay ghi danh theo khóa (Design v3 §0 #2, #3) |
| "Sức chứa phòng tập BR-13, khóa đăng ký khi Full" dạng theo buổi | Thay bằng giữ chỗ + `reserved_count` ở cấp lớp |
| Hóa đơn "phát hành trước khi thu tiền tại quầy (BR-30)" như tính năng riêng | Gộp vào luồng Invoice + VNPay/điểm |
| Số liệu "48 routes", "ASP.NET Core 9", 6 tài khoản `coach.yoga@`... | Số liệu cũ; xem mục Evidence |

### GIỮ

| Nội dung | Lý do |
|---|---|
| Platform, Brand Commitments (tên, giọng điệu, bảng màu, Roboto) | Token thương hiệu không đổi |
| Accessibility & Inclusion | Không đổi |
| Vai trò Member, Coach, Receptionist, Manager, System Admin, Guest (viết lại nội dung) | Vẫn là persona hợp lệ |
| Nguyên tắc minh bạch trạng thái, đa ngôn ngữ; i18n EN/VI; xuất `.ics` | Không liên quan đổi phạm vi |

### SỬA

| Nội dung | Trước → Sau |
|---|---|
| Product Purpose | gym + cổng từ QR → nhà văn hóa thể thao đa môn, 6 vai trò, ghi danh khóa học, ví điểm |
| Positioning | QR xoay vòng + hủy hoàn buổi → môn là dữ liệu, giữ chỗ, ngưỡng hoàn vốn, ví điểm, chống trùng lịch, chatbot |
| Operating Context | ca sáng/chiều/tối, cổng từ → giờ hoạt động sân 06:00–22:00, khóa học nhiều buổi; tích hợp VNPay/SMTP/Gemini có fallback |
| Coach persona | ClassInstructor/PersonalTrainer → chuyên môn theo môn; PT là chuyên môn |
| Receptionist persona | quét cổng từ → Gym check-in/out, điểm danh lớp nhóm, checkout thay + OTP |
| Principle 2, 3 | hạn hủy 2h, mở QR 2 chạm → sĩ số/giữ chỗ/hoàn điểm/OTP, xem lịch + checkout vài chạm |

### THÊM

| Nội dung | Lý do |
|---|---|
| Persona ExternalCoach | Vai trò thứ 6 (BR-105, 125–133) |
| Capabilities: danh mục môn, giữ chỗ, ngưỡng hoàn vốn, ví điểm/split payment, hoàn chỉ bằng điểm, chống trùng lịch, thuê sân, mật khẩu/quên mật khẩu | Design v3 §0 |
| Tích hợp VNPay-QR/SMTP/Gemini và chế độ mock/log | Design v3 §3, §19.2 |
| Ghi chú cần thay hình ảnh Yoga/Group X và số liệu Evidence | Tránh nội dung stale |
