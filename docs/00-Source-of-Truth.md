# SportHub — Nguồn thống nhất về phạm vi và quy ước

SportHub là **hệ thống quản lý trung tâm thể thao với ba môn Gym (bao gồm PT), cầu lông và bóng rổ; có thể mở rộng thêm môn trong tương lai**. PT là dịch vụ thuộc Gym, không phải môn thứ tư.

## 1. Thứ tự nguồn và cách giải quyết mâu thuẫn

1. Yêu cầu trực tiếp đã xác nhận của chủ sản phẩm, bao gồm phạm vi ba môn và PT thuộc Gym.
2. [Business Rules](SportManagement_BusinessRules_v2.0_updated.docx): quy tắc nghiệp vụ cụ thể.
3. [Thiết kế hệ thống](Center-Management-System-Design-v3.md): kiến trúc, dữ liệu, transaction, luồng và khoảng trống triển khai.
4. [Requirements](Requirements.md), [API contract](api-contract.md), Phụ lục A (từ điển dữ liệu) của [thiết kế hệ thống](Center-Management-System-Design-v3.md): yêu cầu, field/mapping và hợp đồng tích hợp.
5. [PRODUCT](../PRODUCT.md), [DESIGN-SKILLS-GUIDE](../DESIGN-SKILLS-GUIDE.md), [DESIGN-TOKENS](../DESIGN-TOKENS.md): sản phẩm, quy trình thiết kế và nguồn token duy nhất.

Mã nguồn/controller/configuration xác định hành vi đã triển khai, không tự thay thế yêu cầu nghiệp vụ. Khi thiết kế và mã khác nhau, ghi gap cùng evidence; không tuyên bố hoàn thành chỉ vì đã có trong tài liệu. SRS Word là tài liệu yêu cầu tổng quan; các mô tả chi tiết chưa đồng bộ phải đọc theo phạm vi và thiết kế hiện hành.

Phần mở rộng được chủ sản phẩm xác nhận: [Không gian giảng dạy Coach lớp nhóm](Coach-Teaching-Workspace.md). Coach được phân công có thể soạn giáo án, điểm danh đúng buổi, lưu kết quả/nhận xét, gửi bài tập/thông báo và dùng AI gợi ý; không yêu cầu qualification PT cho các thao tác lớp nhóm này.

Phần mở rộng ngày 11/10/2026: [Coach yêu cầu thay đổi buổi học nhóm](Class-Session-Change-Requests.md), Manager xử lý hoặc từ chối; Coach không tự hủy/đổi lịch. Thay đổi lịch và cập nhật yêu cầu trong cùng transaction.

## 2. Phạm vi và thuật ngữ

| Thuật ngữ | Nghĩa thống nhất |
|---|---|
| Sport | Môn cấu hình: Gym, cầu lông, bóng rổ; mở rộng được |
| PT | Huấn luyện cá nhân thuộc Gym, một Coach — một Member |
| Membership | Quyền vào Gym có thời hạn, điều kiện mua PT; không phải vé lớp nhóm |
| Class | Khóa học cố định gồm nhiều buổi, mua cả khóa |
| ClassSession | Một buổi của khóa học |
| Enrollment | Ghi danh vào Class sau thanh toán, không phải booking từng buổi |
| SeatHold | Giữ chỗ checkout tạm thời, có hạn |
| Occupancy | Nguồn chống trùng lịch sân/phòng và Coach |
| CourtRental | Lượt thuê sân theo giờ của Member; tính tiền thuê của Member, không quan tâm mục đích sử dụng (kể cả dạy học) |
| CheckoutSession | Một cycle mua/giữ tài nguyên, giữ lịch sử retry |
| PaymentAttempt | Một lần thử thu phần tiền qua gateway |
| Payment | Khoản tiền đã được backend xác minh |
| PointWallet/PointLedgerEntry | Ví và lịch sử điểm; 1 điểm = 1.000 VND, hoàn bằng điểm |
| PaymentAdjustment | Persistence hoàn điểm theo invoice item; không có bảng Refund độc lập |

Seed kỹ thuật còn bản ghi Personal Training riêng. Việc gộp danh tính môn về Gym cần migration, không đổi/xóa ID tùy tiện. Xem CAT-01 trong thiết kế.

## 3. Vai trò và luồng

Năm role: SystemAdministrator, CenterManager, Receptionist, Coach, Member. Guest là người chưa đăng nhập, không phải role lưu trong database. Mọi Member đều có chức năng thuê sân (BR-140). Một Coach có thể có nhiều chuyên môn; quyền truy cập dựa cả role và quan hệ được phân công.

| Luồng | Phạm vi |
|---|---|
| User/Membership | Identity, OTP, account/profile, Membership Gym, renewal/check-in |
| Class/Schedule | Môn/phòng/giá, lớp nhiều buổi, hold/enrollment, threshold, occupancy, rental, incident |
| Payment/Report | Invoice snapshot, checkout, VNPay/điểm, reconciliation, refund điểm, báo cáo |
| Training/Attendance | PT entitlement/session, plan/result, điểm danh lớp bởi Receptionist |
| AI workout | Gợi ý cho Coach trong phạm vi học viên được giao |
| AI assistant | Member context chat; Manager xếp lịch/tạo nháp là phần chưa triển khai |

Ngoài phạm vi: đa chi nhánh, payroll/hợp đồng, chia doanh thu với người thuê sân, quản lý người đi cùng khi Member thuê sân, mobile native, VNPay production và hoàn tiền mặt/ngân hàng. Không biến “chờ đợt sau” thành waitlist giữ chỗ.

## 4. Bất biến nghiệp vụ

- Membership Gym và gói lớp độc lập; PT là gói trả phí riêng khi Membership Active.
- Giá/thời hạn/quyền lợi đã mua dùng snapshot, không tính lại khi sửa catalog.
- Enrollment theo khóa; attendance theo enrollment/session; lớp nhóm Present/Absent, PT xử lý No-show riêng.
- ReservedCount bao gồm chỗ giữ và đã xác nhận; ConfirmedCount <= ReservedCount <= Capacity.
- Ghi lịch phải đi qua occupancy trong transaction, không chỉ kiểm availability ở UI.
- TotalAmount = PointsApplied × 1.000 + CashAmount; backend quyết định amount, không nhận client làm nguồn giá.
- Return URL không xác nhận payment. Chỉ callback/query được xác minh cấp quyền lợi; retry không thu/cấp/hoàn trùng.
- Điểm chỉ giữ/trừ theo xác nhận; dùng điểm hộ cần OTP Member. Hoàn trả bằng điểm theo item và cap hệ thống tính.
- Manager duyệt theo quyền; SystemAdministrator không mặc nhiên có quyền nghiệp vụ; Coach chỉ đọc dữ liệu được phân công.
- Checkout (A15, đã triển khai): hai cột, tóm tắt hiển thị tổng/điểm/tiền còn lại đúng số server; đồng hồ giữ chỗ tính từ `expiresAtUtc − serverNowUtc` và không reset khi reload; hết giờ thì dừng thao tác và tải lại, FE không "release slot"; quay lại tab thì tải lại ví và đơn; return từ cổng thanh toán không chứng minh đã thu. Route `/checkout/[invoiceId]`; tài chính Member ở `/member/finance?tab=wallet|invoices`, chi tiết `/member/invoices/[id]` (route cũ `/member/wallet`, `/member/invoices` chuyển hướng).
- Quên mật khẩu bằng link email (BR-103): phản hồi trung tính; xem thiết kế v3 mục Danh tính. Trang xác thực luôn tiếng Anh.
- “Chờ đợt sau” cần hoàn 100% điểm + subscription thông báo, không giữ tiền/chỗ hoặc tự ghi danh.

## 5. Quy ước kỹ thuật

| Chủ đề | Quy ước |
|---|---|
| Naming | C# PascalCase; DB snake_case; JSON camelCase; route theo contract |
| Enum | Wire UPPER_SNAKE_CASE; JWT role nội bộ; DB giữ số đã có, không reorder |
| ID | Giữ int/Guid đúng entity/contract, không chuyển đồng loạt |
| Tiền/điểm | decimal VND; điểm nguyên; giá theo validation nghiệp vụ |
| Thời gian | UTC để lưu; giờ Việt Nam để hiển thị; khoảng lịch [start, end) |
| API | Validate server, ownership, paging/range; error code ổn định |
| Đồng thời | DB constraints + transaction/lock/version; không read-then-write thiếu bảo vệ |
| Lịch sử | Restrict cho tài chính; không cascade xóa chứng từ; ngừng catalog thay xóa cứng |
| Migration | Không sửa migration đã áp dụng; kiểm DB trắng/upgrade và backfill có bằng chứng |
| Tích hợp | Mock chỉ Development với UseMock rõ ràng; không tự fallback vì thiếu credential |
| Thông báo | Outbox trong transaction, gửi sau commit, retry/dedup |
| Tài liệu | Trạng thái theo evidence; lịch sử thay đổi dùng Git |

## 6. Theo dõi phần chưa hoàn thành

Danh sách tập trung ở **mục 13 của [thiết kế hệ thống](Center-Management-System-Design-v3.md)**: payment đã có mã nhưng sandbox thật chưa nghiệm thu; callback public cần kiểm tra/sửa; mô hình Gym/PT cần đồng bộ; Manager AI, chờ đợt sau, QR Member, PT self-booking và các API hỗ trợ frontend còn thiếu.

Chi tiết G01–G13 và D01–D08 theo ownership trong [guide](../DESIGN-SKILLS-GUIDE.md). Không duy trì API plan riêng hoặc quyết định cũ trái phạm vi.
