# Yêu cầu phi chức năng và yêu cầu được tách khỏi Business Rules

Ngày phân loại lại: 11/09/2026. Tài liệu này là nơi tập hợp tạm các yêu cầu trước đây mang mã BR-34–38 và BR-48, theo ủy quyền tại SSOT §0.1. Chuyển vị trí không có nghĩa bỏ yêu cầu khỏi dự án hoặc đã kiểm chứng hệ thống đáp ứng chúng. SSOT luôn có ưu tiên cao nhất.

Không thay đổi scope, vai trò, entity hoặc enum. Các ngưỡng gốc được giữ nguyên; điều kiện đo còn thiếu được ghi rõ để nhóm chốt, không tự bổ sung SLA mới. Mã có tiền tố mô tả để tránh trùng NFR-01/02/03 vốn đã được tài liệu cũ tham chiếu.

## 1. Ánh xạ mã cũ

| Mã cũ — ngừng dùng như BR | Nơi quản lý hiện tại | Phân loại |
|---|---|---|
| BR-34 | NFR-NOTIFY-01; Design v2 §6, ARCH-NOTIFY-01 | Khả năng chịu lỗi; quyết định kiến trúc |
| BR-35 | NFR-PERF-API-01 | Hiệu năng |
| BR-36 | NFR-AVAIL-01 | Tính sẵn sàng |
| BR-37 | NFR-BACKUP-01 | Sao lưu và vận hành |
| BR-38 | NFR-SEC-01 | Bảo mật |
| BR-48 | NFR-PERF-REPORT-01; FR-REPORT-RETRY-01 | Hiệu năng; chức năng xử lý lỗi |

Không tái sử dụng hoặc đánh lại sáu mã BR cũ. Các dòng trong Word chỉ là chỉ dẫn chuyển mục. Nội dung gốc được giữ tại §4 để đối chiếu lịch sử.

## 2. Yêu cầu phi chức năng

| Mã | Nội dung được chuyển | Điểm cần xác nhận để nghiệm thu |
|---|---|---|
| NFR-NOTIFY-01 | Việc gửi thông báo được xử lý bất đồng bộ; lỗi gửi không làm thất bại hành động nghiệp vụ gốc, ví dụ hủy buổi học. | Cách thử lỗi và theo dõi việc gửi lại; không tự đặt số lần retry. Yêu cầu không tự mở rộng scope sang SMS/email thật. |
| NFR-PERF-API-01 | Thời gian phản hồi API trung bình cho thao tác tiêu chuẩn, không gồm AI, không vượt 200 ms. | Danh sách endpoint, tải đồng thời, dữ liệu, môi trường và khoảng đo. Giữ thước đo trung bình, không tự đổi thành percentile. |
| NFR-AVAIL-01 | Uptime tối thiểu 99,9%, loại trừ khoảng bảo trì đã thông báo. | Kỳ đo, điểm giám sát, định nghĩa downtime và cách thông báo bảo trì. |
| NFR-BACKUP-01 | Cơ sở dữ liệu được sao lưu tự động ít nhất một lần mỗi ngày. | Thời gian lưu bản sao, kiểm tra khôi phục, RPO/RTO; chưa đặt giá trị mới. |
| NFR-SEC-01 | Dữ liệu cá nhân trên đường truyền, gồm mật khẩu và thông tin liên hệ, phải dùng HTTPS. Mật khẩu lưu trữ phải được băm bằng thuật toán chuyên dụng cho mật khẩu, nhất quán với BR-5; không lưu hoặc ghi log mật khẩu thuần. | Cấu hình bảo mật cụ thể cần thống nhất với BR-5. Cụm “hashed/encrypted” trong nguồn cũ được làm rõ thành băm, không mã hóa có thể giải ngược. |
| NFR-PERF-REPORT-01 | Báo cáo PDF không quá 20 trang phải được tạo trong tối đa 15 giây. | Mốc bắt đầu/kết thúc đo, tải đồng thời và độ lớn dữ liệu truy vấn. 20 trang là phạm vi mục tiêu hiệu năng, không tự suy ra cấm báo cáo dài hơn. |

BR-33 tiếp tục quy định khi nào cần gửi thông báo; BR-5 vẫn là tham chiếu hiện có về mật khẩu. Các mã NFR-01/02/03 lịch sử không bị đánh lại trong đợt này.

## 3. Yêu cầu chức năng tách từ BR-48

**FR-REPORT-RETRY-01:** Khi tác vụ tạo báo cáo thực sự thất bại, hệ thống ghi nhận kết quả thất bại và cho phép người dùng yêu cầu tạo lại sau. Quyền truy cập tiếp tục theo BR-32/BR-43/BR-45 và SSOT; yêu cầu này không cấp thêm quyền cho vai trò nào.

Nguồn cũ gọi kết quả là `FAILED`; đây chỉ là thuật ngữ được giữ để truy vết, không chốt thêm enum, entity hoặc state machine ngoài SSOT §2–4. Mất kết nối phía người dùng không đủ để kết luận tác vụ trên máy chủ thất bại. Cơ chế xác định thất bại và nhận lại kết quả khi kết nối lại cần chốt trước khi code.

Phần triển khai bất đồng bộ của BR-34 được quản lý tại **Design v2 §6 — ARCH-NOTIFY-01**, không định nghĩa lại ở đây.

## 4. Nội dung gốc để truy vết

Các trích đoạn dưới đây là lịch sử trước khi phân loại lại, không phải yêu cầu BR đang có hiệu lực. Nếu cách diễn đạt lịch sử khác với §2–3, dùng §2–3 dưới sự ưu tiên của SSOT.

### BR-34 — bản gốc

Notifications are delivered asynchronously so that a delivery failure never blocks the originating action (e.g., a class cancellation). At MVP scale this is implemented via a background job / outbox table within the same database transaction; a dedicated message queue (e.g., RabbitMQ) is introduced only when notification volume or retry complexity requires it.

### BR-35 — bản gốc

Average API response time for standard (non-AI) operations must not exceed 200 ms.

### BR-36 — bản gốc

The system must maintain at least 99.9% uptime, excluding announced maintenance windows.

### BR-37 — bản gốc

The database is backed up automatically at least once per day.

### BR-38 — bản gốc

Personal data in transit (passwords, contact info) must be transmitted over HTTPS, and passwords at rest must be hashed/encrypted with a standard algorithm.

### BR-48 — bản gốc

A PDF report of up to 20 pages must be generated within 15 seconds. If generation is interrupted (e.g., network loss), the system records a FAILED status and allows the user to retry generating the report later.

## 5. Nguồn và phạm vi đồng bộ

- [SSOT](00-Source-of-Truth.md) §0.1: thẩm quyền, phạm vi phân loại và thứ tự ưu tiên.
- [Business Rules v1.2](SportManagement_BusinessRules_v1.2.docx): giữ chỉ dẫn thay cho sáu BR đã chuyển; các BR khác giữ nguyên.
- [Design v2](Center-Management-System-Design-v2.md) §0.1, §4.3, §6 và §8: ánh xạ, API xuất báo cáo, thiết kế thông báo và điều kiện cần chốt.

Các bất đồng về mô hình dữ liệu giữa Design v2 và SSOT tiếp tục được xử lý theo SSOT §6–7, không được xem là đã thông qua bởi việc phân loại này.
