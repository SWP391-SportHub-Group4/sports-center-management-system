# Yêu Cầu Hệ Thống Quản Lý Trung Tâm (Center Management System)

> SportHub là hệ thống quản lý **trung tâm thể thao đa bộ môn**: Gym/Fitness (ra vào tự do), Personal Training, Yoga, Group X — 1 trung tâm duy nhất, không đa chi nhánh. Chi tiết chốt bộ môn: `docs/00-Source-of-Truth.md` §1.1.

## 1. Danh sách Tác nhân & Vai trò (Actors & Roles)

* **Center Manager** – Quản lý trung tâm
* **Coach** – Huấn luyện viên
* **Member** – Học viên / Thành viên
* **Receptionist** – Nhân viên lễ tân

---

## 2. Chi Tiết Yêu Cầu Chức Năng Theo Vai Trò

### Center Manager (Quản lý Trung tâm)
* Quản lý danh sách thành viên, huấn luyện viên và nhân viên của trung tâm.
* Quản lý các lớp học, bộ môn, phòng tập và lịch hoạt động.
* Phân công huấn luyện viên phụ trách từng lớp học.
* Xem báo cáo số lượng thành viên, tình trạng đăng ký lớp và doanh thu theo thời gian.
* Quản lý các gói thành viên, học phí và thời hạn sử dụng.
* Phân quyền truy cập hệ thống cho từng vai trò.
* Xem lịch sử thao tác quan trọng trên hệ thống.

### Coach (Huấn luyện viên)
* Xem lịch dạy và danh sách học viên trong các lớp phụ trách.
* Xem thông tin cơ bản và mục tiêu tập luyện của từng học viên.
* Tạo kế hoạch tập luyện cho cá nhân hoặc cho cả lớp.
* Ghi nhận kết quả tập luyện của học viên sau mỗi buổi.
* Đánh giá tiến độ của học viên và ghi nhận nhận xét.
* Điểm danh học viên trong từng buổi tập.
* Gửi thông báo hoặc bài tập về nhà cho học viên.
* Sử dụng AI để gợi ý bài tập phù hợp dựa trên mục tiêu, trình độ và lịch sử tập luyện của học viên.

### Member (Học viên / Thành viên)
* Đăng ký tài khoản và cập nhật thông tin cá nhân.
* Xem các gói thành viên và đăng ký/gia hạn gói tập.
* Xem danh sách các lớp học và lịch học.
* Đăng ký hoặc hủy đăng ký lớp học.
* Xem lịch tập cá nhân và thông tin huấn luyện viên.
* Xem lịch sử điểm danh và kết quả tập luyện.
* Xem kế hoạch tập luyện và nhận xét từ huấn luyện viên.
* *(Stretch — Flow 6, chỉ làm nếu còn thời gian)* Gửi câu hỏi cho hệ thống AI về lịch tập, bài tập hoặc các dịch vụ của trung tâm.
* Nhận thông báo về lịch học, thay đổi lịch hoặc thời hạn gói thành viên.

### Receptionist (Nhân viên Lễ tân)
* Tìm kiếm và xem thông tin thành viên.
* Đăng ký thành viên mới tại quầy.
* Quản lý đăng ký/gia hạn các gói thành viên.
* Kiểm tra trạng thái gói tập và thời hạn sử dụng của thành viên.
* Điểm danh thành viên khi đến trung tâm.
* Đăng ký lớp học hoặc hỗ trợ hủy lớp cho thành viên.
* Ghi nhận các khoản thanh toán và in/xuất hóa đơn.
* Tiếp nhận và ghi nhận các yêu cầu hỗ trợ từ thành viên.

---

## 3. Các Luồng Nghiệp Vụ (System Flows)

### Required Flows (Bắt buộc)
* **Flow 1:** User and membership management (Quản lý người dùng và gói thành viên)
* **Flow 2:** Class booking and schedule management (Quản lý đăng ký lớp và lịch trình)
* **Flow 3:** Payment and report management (Quản lý thanh toán và báo cáo)

### Optional Flows (Tùy chọn — nhóm cam kết làm)
* **Flow 4:** Training and attendance management (Quản lý tập luyện và điểm danh)
* **Flow 5:** AI workout recommendation (Gợi ý bài tập bằng AI)

### Stretch Goal (chỉ làm nếu còn thời gian sau khi xong Flow 1–5 — xem `00-Source-of-Truth.md` §1.4)
* **Flow 6:** AI assistant (Trợ lý AI hỗ trợ giải đáp) — **không tính vào scope cam kết**, chỉ triển khai nếu còn dư thời gian.

## Quyết định bổ sung đã duyệt 22/09/2026

Business Rules v1.4 và SSOT là nguồn hiện hành; [implementation-decisions](implementation-decisions.md) ghi chi tiết. Flow 1–5 giữ nguyên scope; Google Login, AI provider thật và PDF BR-48 phải hoàn thiện. CSV/fixture/demo không thay thế nghiệm thu. Backup hằng ngày, HTTPS và uptime thuộc requirements vận hành, không bị loại bỏ.

- Manager cấu hình mặc định hủy 12 giờ, nhắc hạn 7 ngày; deadline snapshot theo booking.
- Ngày gói bắt đầu khi thanh toán đủ theo giờ VN, ngày cuối inclusive; hoàn lượt có thể hồi phục gói hết lượt còn hạn theo BR-11, tôn trọng BR-10.
- Không trùng lịch phòng/Coach/Member. Cộng dồn cùng PackageId cần Manager duyệt; không gộp ngày/lượt.
- Hóa đơn quá hạn chặn thu thông thường, không tự void/tịch thu cọc. Ngoại lệ còn chờ chính sách cụ thể.
- Discount/Correction giảm nghĩa vụ; Refund Completed cần xác nhận tiền thực trả sau duyệt; báo cáo không trừ cả hai cho cùng dòng tiền.
- Quan hệ cá nhân do Manager quản lý, Coach không tự cấp quyền. Token role cũ bị từ chối sau đổi role.

Chi tiết còn mở và kế hoạch thực hiện: [SSOT §7](00-Source-of-Truth.md), [plan Claude 23/09](claude-continuation-plan-2026-09-23.md). Đây là thay đổi đặc tả, chưa phải báo cáo hoàn thành.
