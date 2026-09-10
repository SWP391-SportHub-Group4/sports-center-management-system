# Yêu Cầu Hệ Thống Quản Lý Trung Tâm (Center Management System)

> Bản yêu cầu đã đồng bộ ngày 11/09/2026 theo BR người dùng cung cấp và SSOT §0.2. Đề bài gốc có bốn tác nhân; nhóm bổ sung System Administrator và chuyển quyền quản trị tài khoản từ Manager sang Administrator. Scope các flow giữ nguyên.

## 1. Danh sách Tác nhân & Vai trò (Actors & Roles)

* **System Administrator** – Quản trị viên hệ thống
* **Center Manager** – Quản lý trung tâm
* **Coach** – Huấn luyện viên
* **Member** – Học viên / Thành viên
* **Receptionist** – Nhân viên lễ tân

---

## 2. Chi Tiết Yêu Cầu Chức Năng Theo Vai Trò

### System Administrator (Quản trị viên)
* Tạo tài khoản Administrator, Manager, Coach, Receptionist; gán/đổi vai trò (BR-2/3).
* Khóa/mở khóa tài khoản, cấm tự khóa và khóa Administrator hoạt động cuối cùng (BR-6).
* Administrator đầu tiên khởi tạo khi triển khai; mọi thao tác quan trọng phải ghi audit theo BR-7.
* Quyền thu hồi vai trò cuối cùng và quyền đọc audit còn chờ SSOT AUTH-01.

### Center Manager (Quản lý Trung tâm)
* Quản lý danh sách thành viên, huấn luyện viên và nhân viên của trung tâm.
* Quản lý các lớp học, bộ môn, phòng tập và lịch hoạt động.
* Phân công huấn luyện viên phụ trách từng lớp học.
* Xem báo cáo số lượng thành viên, tình trạng đăng ký lớp và doanh thu theo thời gian.
* Quản lý các gói thành viên, học phí và thời hạn sử dụng.
* Quản lý cấu hình nghiệp vụ; không cấp/đổi vai trò người dùng (BR-39).
* Hủy/dời buổi chưa bắt đầu theo BR-54; hệ thống hủy đăng ký, hoàn lượt và thông báo, không tự giữ chỗ buổi mới.
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
* Đăng ký hoặc hủy đăng ký từng ClassSession; chính sách hạn hủy gắn lúc xác nhận đăng ký (BR-17/18/50).
* Tự đăng ký lại khi trung tâm hủy/dời buổi (BR-54).
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
* Ghi nhận khoản tiền trung tâm thực nhận và in/xuất hóa đơn. Invoice tạo trước thu tiền; gói chỉ kích hoạt khi thanh toán đủ (BR-30).
* Theo dõi hạn hai tháng từ phát hành hoặc 12 tháng từ cọc đầu tiên trong hạn; các lần nộp tiếp không gia hạn (BR-55). Xử lý quá hạn còn chờ PAY-01.
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
