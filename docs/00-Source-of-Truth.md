# SportHub — Nguồn thống nhất về phạm vi và quy ước

SportHub là **hệ thống quản lý trung tâm thể thao với ba môn Gym, cầu lông và bóng rổ; có thể mở rộng thêm môn trong tương lai**. Gym chỉ bán Membership có thời hạn và vé Gym 1 ngày.

## 1. Thứ tự nguồn và cách giải quyết mâu thuẫn

**Quyết định đã xác nhận:** [Kích hoạt staff và quyền Audit log](Admin-Activation-and-Audit.md). Link staff hết hạn đúng `CreatedAt + 24 giờ`; gửi lại hoặc sửa email không đổi mốc này. Admin xem mọi log do Manager/Admin/Coach thực hiện và log hệ thống; Manager xem mọi log do Manager/Receptionist/Coach/Member thực hiện. Phạm vi dựa trên role được ghi tại thời điểm thao tác, không dựa role hiện tại của tài khoản.

1. Yêu cầu trực tiếp đã xác nhận của chủ sản phẩm, bao gồm phạm vi ba môn (Gym, cầu lông, bóng rổ) và vé Gym 1 ngày.
2. [Business Rules](SportManagement_BusinessRules_v2.0_updated.docx): quy tắc nghiệp vụ cụ thể.
3. [Thiết kế hệ thống](Center-Management-System-Design-v3.md): kiến trúc, dữ liệu, transaction, luồng và khoảng trống triển khai.
4. [Requirements](Requirements.md), [API contract](api-contract.md), Phụ lục A (từ điển dữ liệu) của [thiết kế hệ thống](Center-Management-System-Design-v3.md): yêu cầu, field/mapping và hợp đồng tích hợp.
5. [PRODUCT](../PRODUCT.md), [DESIGN-TOKENS](../DESIGN-TOKENS.md): sản phẩm và nguồn token duy nhất.

Mã nguồn/controller/configuration xác định hành vi đã triển khai, không tự thay thế yêu cầu nghiệp vụ. Khi thiết kế và mã khác nhau, ghi gap cùng evidence; không tuyên bố hoàn thành chỉ vì đã có trong tài liệu. SRS Word là tài liệu yêu cầu tổng quan; các mô tả chi tiết chưa đồng bộ phải đọc theo phạm vi và thiết kế hiện hành.

Phạm vi Flow 4 được chủ sản phẩm xác nhận ngày 18/10/2026: không quản lý dịch vụ PT 1:1. Coach của lớp cầu lông/bóng rổ được phân công có thể tạo workout plan, ghi workout result/nhận xét, giao homework, gửi thông báo và điểm danh đúng buổi. AI gợi ý cho Coach thuộc Flow 5; Coach kiểm tra trước khi lưu nội dung. Các quy tắc PT cũ trong Business Rules và SRS chỉ còn giá trị tham khảo lịch sử, không áp dụng cho phạm vi hiện hành. Xem [Không gian giảng dạy Coach lớp nhóm](Coach-Teaching-Workspace.md).

Quyết định Flow 2/4 ngày 18/10/2026: Coach chỉ gửi báo vắng kèm lý do cho buổi được phân công và có thể rút báo vắng khi còn Pending; Coach không sửa báo vắng hoặc tự chọn dạy thay/dời lịch/học bù. Center Manager liên hệ Coach khác khi cần, rồi quyết định phương án và kiểm tra lại chuyên môn/lịch trống trước khi lưu. Thay đổi lịch và cập nhật yêu cầu trong cùng transaction. Xem [yêu cầu vắng buổi học](Class-Session-Change-Requests.md).

## 2. Phạm vi và thuật ngữ

| Thuật ngữ | Nghĩa thống nhất |
|---|---|
| Sport | Môn cấu hình: Gym, cầu lông, bóng rổ; mở rộng được |
| Vé Gym 1 ngày | Gói Gym cố định 50.000đ, dùng trong ngày thanh toán thành công (giờ Việt Nam), mã check-in do server cấp, chỉ có hiệu lực trong ngày |
| Membership | Quyền vào Gym có thời hạn; không phải vé lớp nhóm |
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

## 3. Vai trò và luồng

Năm role: SystemAdministrator, CenterManager, Receptionist, Coach, Member. Requirement gốc chỉ có bốn role (Manager, Coach, Member, Receptionist); SystemAdministrator là role bổ sung, chia việc với Manager: Admin nhận quản lý tài khoản staff, phân quyền (đổi role) và đọc log do Manager/Admin/Coach thực hiện cùng log hệ thống; Manager giữ vận hành trung tâm và đọc log do Manager/Receptionist/Coach/Member thực hiện, nên Manager không còn giống 100% requirement gốc, xem bảng đối chiếu trong [Requirements](Requirements.md) §2. Guest là người chưa đăng nhập (xem được landing page và nội dung công khai), không phải role lưu trong database. Mọi Member đều có chức năng thuê sân (BR-140). Một Coach có thể có nhiều chuyên môn; quyền truy cập dựa cả role và quan hệ được phân công.

| Luồng | Phạm vi |
|---|---|
| User/Membership | Identity, OTP, account/profile, Membership Gym, renewal/check-in |
| Class/Schedule | Môn/phòng/giá, lớp nhiều buổi, hold/enrollment, threshold, occupancy, rental, incident |
| Payment/Report | Invoice snapshot, checkout, VNPay/điểm, reconciliation, refund điểm, báo cáo |
| Training/Attendance | Plan/result/đánh giá và homework theo lớp; Receptionist hoặc Coach được phân công điểm danh đúng buổi |
| AI workout | Gợi ý cho Coach trong phạm vi học viên được giao |
| AI assistant | Member context chat; Manager xếp lịch/tạo nháp là phần chưa triển khai |

Ngoài phạm vi: đa chi nhánh, payroll/hợp đồng, chia doanh thu với người thuê sân, quản lý người đi cùng khi Member thuê sân, mobile native, VNPay production và hoàn tiền mặt/ngân hàng. Không biến “chờ đợt sau” thành waitlist giữ chỗ.

## 4. Bất biến nghiệp vụ

- Quy tắc xác nhận 13/10/2026 (BR-96): một Coach có thể dạy nhiều môn, có ít nhất một chuyên môn và được chọn nhiều môn ngay khi Admin tạo tài khoản hoặc đổi role sang Coach. Manager chỉnh sửa chuyên môn; phân công lớp phải khớp chuyên môn. Giới hạn đúng một môn trong luồng tạo Coach hiện tại là khoảng trống triển khai, không phải quy tắc nghiệp vụ.
- Quy tắc xác nhận 13/10/2026: không đổi role của bất kỳ tài khoản đang là SystemAdministrator nào, kể cả chính mình và Admin khác. Việc tạo Admin hoặc nâng một tài khoản staff khác lên Admin vẫn được phép. Quy tắc khóa/mở khóa không thay đổi.
- Membership Gym và gói lớp độc lập.
- Vé Gym 1 ngày (day pass): giá cố định 50.000đ (seed cố định, Manager không sửa hay ngừng được), chỉ dùng trong ngày thanh toán thành công theo giờ Việt Nam, kèm mã check-in do server ký và cấp, chỉ có hiệu lực trong ngày; Member được báo rõ điều này trước khi trả tiền. Không bán khi Gym đang đóng cửa vì sự cố, không gia hạn khi đóng Gym, không hoàn trả.
- Giá/thời hạn/quyền lợi đã mua dùng snapshot, không tính lại khi sửa catalog.
- Enrollment theo khóa; attendance theo enrollment/session; lớp nhóm Present/Absent.
- JWT xác định danh tính và role của Coach; `classId`/`sessionId` xác định tài nguyên được yêu cầu. Backend đối chiếu Coach từ JWT với Coach được phân công cho lớp/buổi trước khi cấp quyền. `sessionId` không phải mã xác thực hay giá trị thay thế JWT.
- ReservedCount bao gồm chỗ giữ và đã xác nhận; ConfirmedCount <= ReservedCount <= Capacity.
- Ghi lịch phải đi qua occupancy trong transaction, không chỉ kiểm availability ở UI.
- TotalAmount = PointsApplied × 1.000 + CashAmount; backend quyết định amount, không nhận client làm nguồn giá.
- Return URL không xác nhận payment. Chỉ callback/query được xác minh cấp quyền lợi; retry không thu/cấp/hoàn trùng.
- Điểm chỉ giữ/trừ theo xác nhận; dùng điểm hộ cần OTP Member. Hoàn trả bằng điểm theo item và cap hệ thống tính.
- Hoàn chuẩn Membership Gym tối đa 50% (còn ≥ 2/3 thời hạn). Sự cố tạm thời của trung tâm (hỏng/sửa chữa phòng Gym) không phải căn cứ hoàn: Membership Active được gia hạn thêm số ngày đóng cửa, buổi lớp bù vào lịch tiếp theo, người bị ảnh hưởng được email (BR-130, BR-138). Hoàn do lỗi trung tâm chỉ cho vấn đề khác khiến trung tâm không thể cung cấp dịch vụ, theo phần chưa dùng.
- Tài khoản Banned/Deactivated bị chặn sử dụng dịch vụ và mua mới tại backend, kể cả thao tác do nhân viên ghi nhận như check-in/điểm danh. Khóa tài khoản không tự hủy quyền lợi đã mua, lịch đã đặt hay số dư ví; hủy và hoàn phải qua luồng nghiệp vụ riêng, có audit.
- Tài khoản Member được tạo bằng hai cách: Member tự đăng ký (OTP email hoặc Google), hoặc Receptionist/Manager đăng ký tại quầy (`POST /api/members/front-desk`): email nhập một lần, tài khoản chưa có mật khẩu, Member nhận email kích hoạt (24 giờ, một lần) và tự đặt mật khẩu; chờ kích hoạt thì gửi lại link hoặc sửa email gõ sai (link cũ vô hiệu, có audit); quá 7 ngày kể từ lúc đăng ký mà vẫn chưa kích hoạt và chưa có dữ liệu nào ghi nhận cho tài khoản thì tài khoản bị gỡ, email được giải phóng. Quầy không đặt mật khẩu hộ và chỉ tạo role Member.
- Member và staff là hai loại tài khoản tách biệt (BR-142): không chuyển Member thành staff hay ngược lại (409 `member_staff_role_change_not_allowed`); muốn làm staff phải dùng email khác. Chỉ SystemAdministrator tạo tài khoản staff (kể cả Coach kèm chuyên môn, BR-96) và đó là bước duy nhất tạo Coach; staff nhận email kích hoạt để tự đặt mật khẩu. Manager chỉ sửa hồ sơ Coach. Đổi role chỉ giữa các role staff; Coach chỉ rời vai trò khi không còn lớp, lịch tương lai hay quan hệ huấn luyện Active. Email chưa được xác minh là của đúng người khi tạo (Admin nhập email một lần, gõ sai thì sửa); tài khoản chưa kích hoạt hiển thị "Chờ kích hoạt" (`activationPending`), Admin được gửi lại link (cooldown 60 giây, link cũ vô hiệu) hoặc sửa email gõ sai (link cũ vô hiệu, link mới tới email mới, có audit) cho tới khi người nhận đặt mật khẩu.
- Manager duyệt theo quyền; SystemAdministrator không mặc nhiên có quyền nghiệp vụ; Coach chỉ đọc dữ liệu được phân công.
- Checkout (A15, đã triển khai): hai cột, tóm tắt hiển thị tổng/điểm/tiền còn lại đúng số server; đồng hồ giữ chỗ tính từ `expiresAtUtc − serverNowUtc` và không reset khi reload; hết giờ thì dừng thao tác và tải lại, FE không "release slot"; quay lại tab thì tải lại ví và đơn; return từ cổng thanh toán không chứng minh đã thu. Route `/checkout/[invoiceId]`; tài chính Member ở `/member/finance?tab=wallet|invoices`, chi tiết `/member/invoices/[id]` (route cũ `/member/wallet`, `/member/invoices` chuyển hướng).
- Quên mật khẩu bằng link email (BR-103): phản hồi trung tính; xem thiết kế v3 mục Danh tính. Trang xác thực luôn tiếng Anh.
- “Chờ đợt sau” cần hoàn 100% điểm + subscription thông báo, không giữ tiền/chỗ hoặc tự ghi danh.
- Avatar Member/Coach qua Cloudinary: tự thay/xóa, ảnh Coach công khai, ảnh Member cho tài khoản đăng nhập, báo cáo sau đăng tải do Manager xử lý; chi tiết tại [Avatar-Cloudinary](Avatar-Cloudinary.md).

## 5. Quy ước kỹ thuật

### Language policy

The product uses English only. Public pages, authenticated screens, validation and API messages, notifications, reports, and other system-generated text must be in English. There is no language switch or saved language preference. Catalog and configuration seed values stored in the database are English. User-entered names, notes, course descriptions, and other free-form content retain the language entered by the user; do not translate or overwrite them. When migrating legacy seed data, update only records whose values still match the original system seed, so manager edits remain intact. Historical invoice snapshots and notices remain as originally issued for audit integrity; new system-generated records use English.

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

Danh sách tập trung ở **mục 13 của [thiết kế hệ thống](Center-Management-System-Design-v3.md)**: payment đã có mã nhưng sandbox thật chưa nghiệm thu; callback public cần kiểm tra/sửa; Manager AI, chờ đợt sau và các API hỗ trợ frontend còn thiếu.

