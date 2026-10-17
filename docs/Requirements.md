# SportHub — Yêu cầu hệ thống quản lý trung tâm thể thao

SportHub quản lý trung tâm thể thao với **ba môn Gym, cầu lông và bóng rổ**, đồng thời hỗ trợ mở rộng thêm môn trong tương lai. Danh mục môn, chuyên môn HLV và loại sân/phòng phải cấu hình được.

**Chuyên môn Coach (xác nhận 13/10/2026, BR-96):** một Coach có thể dạy nhiều môn và phải được gán ít nhất một môn. Admin được chọn nhiều môn đang hoạt động khi tạo tài khoản Coach hoặc đổi một tài khoản staff sang Coach; Manager chỉnh sửa chuyên môn sau đó. Phân công lớp yêu cầu Coach đang hoạt động và có chuyên môn khớp môn của lớp.

## 1. Mục tiêu và phạm vi

Số hóa hoạt động từ tiếp đón, mua dịch vụ, xếp lịch, điểm danh và tập luyện đến thuê sân, thanh toán, hoàn điểm, thông báo và báo cáo. Dữ liệu phải nhất quán giữa năm vai trò và không bán vượt sĩ số hoặc xếp trùng sân/Coach.

Gym dùng Membership có thời hạn và vé Gym 1 ngày (mục 4). Cầu lông/bóng rổ bán khóa học nhiều buổi, độc lập Membership. Mọi Member đều được thuê sân theo giờ; lớp cố định seed sẵn: Bóng rổ và Cầu lông, Thứ 2-4-6 07:00–09:00 và Thứ 3-5-7 14:00–16:00 (BR-141).

Ngoài phạm vi: đa chi nhánh, payroll/hợp đồng nhân sự, chia doanh thu với người thuê sân, quản lý người đi cùng khi Member thuê sân, mobile native, payment production, hoàn tiền mặt/chuyển khoản và VNPay Refund API.

## 2. Yêu cầu theo vai trò

| Vai trò | Chức năng yêu cầu |
|---|---|
| Guest | Xem **landing page** (trang chủ giới thiệu trung tâm, ba môn, đội Coach, không gian) và trang công khai: khóa/gói, sân, Coach; đăng ký Member hoặc đăng nhập; không đọc dữ liệu cá nhân |
| Member | Đăng ký và cập nhật tài khoản; xem, đăng ký, gia hạn gói thành viên; xem lớp và lịch học, đăng ký/hủy lớp (giữ chỗ, ghi danh); lịch tập cá nhân và thông tin Coach; lịch sử điểm danh và kết quả tập; kế hoạch tập và nhận xét của Coach; hỏi AI về lịch tập, bài tập, dịch vụ; nhận thông báo (lịch học, đổi lịch, hạn gói). Mở rộng của dự án: mua vé Gym 1 ngày (tự mua trên web), thuê/hủy sân, ví điểm, invoice, hoàn điểm |
| Receptionist | Tìm và xem thông tin Member; **đăng ký Member mới tại quầy** (nhập email một lần; Member nhận email kích hoạt để tự đặt mật khẩu; chờ kích hoạt thì lễ tân gửi lại link hoặc sửa email gõ sai; quá 7 ngày chưa kích hoạt và chưa có dữ liệu nào thì tài khoản bị gỡ); quản lý đăng ký/gia hạn gói; kiểm tra trạng thái gói và thời hạn; Gym check-in/out và điểm danh; đăng ký lớp hoặc hỗ trợ hủy lớp cho Member; checkout hộ, ghi nhận thanh toán, hóa đơn (*in/xuất hóa đơn chưa thấy trong giao diện*); tiếp nhận và ghi nhận yêu cầu hỗ trợ của Member (*yêu cầu, chưa triển khai*). Dùng điểm của Member cần OTP của Member |
| Coach | Xem lịch dạy và danh sách học viên lớp phụ trách; xem thông tin cơ bản và mục tiêu tập luyện của học viên được phân công; tạo kế hoạch tập cho cá nhân hoặc cả lớp; ghi kết quả sau buổi; đánh giá tiến độ và nhận xét; điểm danh trong buổi; gửi thông báo cho học viên (*bài tập về nhà đã gỡ khỏi phạm vi triển khai*, không còn homework riêng); dùng AI gợi ý bài tập theo mục tiêu, trình độ, lịch sử. Kế hoạch tập, kết quả, đánh giá và AI gợi ý làm theo lớp cho Coach cầu lông và bóng rổ |
| CenterManager (*chia việc với Admin, không giống 100% requirement gốc*) | Xem danh sách Member và Coach (tài khoản staff do Admin quản lý); quản lý môn, lớp, phòng, lịch hoạt động; phân công Coach theo chuyên môn, sửa hồ sơ và chuyên môn Coach; gói thành viên, học phí, thời hạn; threshold, sự cố, hoàn điểm; báo cáo số lượng thành viên, đăng ký lớp, doanh thu theo thời gian; xem Audit Log đầy đủ của trung tâm |
| SystemAdministrator (*vai trò bổ sung, nhận một phần việc của Manager*) | Tạo và quản lý tài khoản staff (Manager, Receptionist, Coach, Admin); phân quyền bằng cách đổi role giữa các role staff; khóa, mở khóa, vô hiệu hóa tài khoản; xem Audit Log của thao tác tài khoản. Không tự có quyền tài chính, vận hành lớp hay hồ sơ tập luyện |

### Manager chia việc với Admin

Requirement gốc chỉ có bốn vai trò (Manager, Coach, Member, Receptionist) và giao cho Manager cả việc quản lý nhân sự, phân quyền, lịch sử thao tác. Dự án thêm vai trò **SystemAdministrator** và **chia việc** với Manager: phần quản trị tài khoản chuyển sang Admin, phần vận hành trung tâm ở lại Manager. Vì vậy vai trò Manager **không còn giống 100% requirement gốc**; bảng dưới đây là cách chia hiện hành.

| Việc trong requirement gốc của Manager | Hiện thuộc về |
|---|---|
| Quản lý danh sách nhân viên và Coach (tạo tài khoản, kích hoạt, khóa) | **Admin**; Manager chỉ xem Coach, sửa hồ sơ và chuyên môn |
| Quản lý danh sách thành viên | Manager (xem, báo cáo) và Receptionist (tìm, hỗ trợ) |
| Phân quyền truy cập cho từng vai trò | **Admin** (đổi role giữa các role staff); quyền theo role cố định trong hệ thống |
| Xem lịch sử thao tác quan trọng | Manager xem Audit Log đầy đủ của trung tâm; Admin chỉ xem phần thao tác tài khoản |
| Lớp, môn, phòng, lịch, phân công Coach, báo cáo, gói và học phí | Manager |

Member và staff là hai loại tài khoản tách biệt: không chuyển Member thành staff hay ngược lại. Người muốn làm staff dùng một email khác; SystemAdministrator tạo tài khoản staff, kể cả Coach kèm chuyên môn (nhận email kích hoạt để tự đặt mật khẩu); Manager chỉ sửa hồ sơ Coach. Chỉ đổi role giữa các role staff, và Coach chỉ rời vai trò khi không còn lớp, lịch hay quan hệ huấn luyện đang hoạt động. Email chưa được xác minh là của đúng người khi tạo (Admin nhập email một lần, gõ sai thì sửa); tài khoản chưa kích hoạt hiển thị "Chờ kích hoạt" (`activationPending`), Admin được gửi lại link (cooldown 60 giây, link cũ vô hiệu) hoặc sửa email gõ sai (link cũ vô hiệu, link mới tới email mới, có audit) cho tới khi người nhận đặt mật khẩu.

Tài khoản staff do Admin tạo mà chưa kích hoạt sau 24 giờ được tự xóa để giải phóng email. Gửi lại link hoặc sửa email không kéo dài hạn này; Member và tài khoản seed/hệ thống không bị xóa. Xem [chi tiết xử lý và kiểm tra](Staff-Invitation-Expiry.md).

Theo yêu cầu xác nhận 13/10/2026, không được đổi role của tài khoản đang là SystemAdministrator, bao gồm chính mình và Admin khác. Các tài khoản nhân sự khác vẫn được đổi role theo quy tắc hiện có, kể cả nâng lên Admin; sau khi trở thành Admin thì không được hạ role. Quy tắc khóa/mở khóa tài khoản không thay đổi.

Guest không phải role account. Coach có nhiều chuyên môn, không chia role cứng thành PersonalTrainer/ClassInstructor. Backend kiểm cả role và ownership/relationship.

## 3. Luồng nghiệp vụ

| Flow | Yêu cầu |
|---|---|
| 1 — User/Membership | Identity, email OTP/Google onboarding, quên mật khẩu bằng link email (không OTP, phản hồi trung tính)/đổi mật khẩu, trang xác thực luôn tiếng Anh, account status, Membership renewal và Gym access |
| 2 — Class/Schedule | Catalog, nhiều buổi/khóa, seat hold/ghi danh, ngưỡng lớp, chuyển lớp, điểm danh, occupancy, thuê sân và sự cố |
| 3 — Payment/Report | Invoice/item snapshot, checkout, split điểm + VNPay, gateway verification/reconciliation, hoàn điểm và báo cáo |
| 4 — Training/Attendance | Kế hoạch tập, kết quả, đánh giá theo lớp cho Coach cầu lông/bóng rổ (homework đã gỡ); điểm danh lớp nhóm bởi Receptionist |
| 5 — AI workout | Gợi ý tập luyện cho Coach theo dữ liệu học viên được phân công |
| 6 — AI assistant | Member chat theo context; Manager gợi ý xếp lịch/tạo nháp sau xác nhận là yêu cầu chưa triển khai |

## 4. Quy tắc chức năng

- Giá và thời hạn được snapshot khi checkout; sửa catalog không thay giao dịch đã mua.
- Enrollment gắn cả lớp. Sĩ số và giữ chỗ thuộc Class, không đặt từng buổi theo hạn mức ngày.
- Vé Gym 1 ngày (day pass): giá cố định 50.000đ (seed cố định, Manager không sửa hay ngừng được), chỉ dùng trong ngày thanh toán thành công theo giờ Việt Nam, kèm mã check-in do server ký và cấp, chỉ có hiệu lực trong ngày; Member được báo rõ điều này trước khi trả tiền. Không bán khi Gym đang đóng cửa vì sự cố, không gia hạn khi đóng Gym, không hoàn trả.
- Khách lạ tới Gym: Receptionist đăng ký Member cho khách (email kích hoạt) hoặc khách tự đăng ký; sau đó Receptionist hỗ trợ mua vé 1 ngày hoặc khách tự mua trên web. Vé ngày có mã check-in: Member tự check-in, hoặc Receptionist check-in hộ. Receptionist nhắc khách trước khi trả tiền rằng mã chỉ dùng trong ngày.
- Xếp lịch lớp/rental/block dùng cùng cơ chế occupancy; frontend availability không thay thế kiểm tra DB.
- Giữ chỗ và điểm có hạn, expiry nhả đúng một lần; payment muộn phải đối soát.
- `TotalAmount = PointsApplied × 1.000 + CashAmount`; người dùng chọn điểm trước, không tự trừ khi mở trang.
- Backend xác minh IPN/QueryDR trước khi ghi payment/cấp quyền lợi; return chỉ hiển thị. Thanh toán bằng toàn điểm không tạo attempt VNPay.
- Hoàn trả chỉ bằng điểm theo item, quyền lợi đã dùng và cap hệ thống; không double credit khi retry. Hoàn chuẩn Membership Gym tối đa 50% khi còn từ 2/3 thời hạn; sự cố tạm thời của trung tâm không phải căn cứ hoàn (BR-91, BR-130).
- Ngưỡng lớp hỗ trợ chuyển/hoàn điểm; yêu cầu “chờ đợt sau” là hoàn 100% điểm + lưu nguyện vọng nhận thông báo, chưa có implementation.
- Incident preview và resolve recheck lịch; lớp xử lý phương án riêng trước bước cuối, không giả toàn luồng là một transaction.
- Sự cố ảnh hưởng Gym (BR-130): email cho Member có Membership Active; Membership được gia hạn thêm số ngày Gym đóng cửa sửa chữa; buổi lớp bù vào lịch tiếp theo (BR-54); lượt thuê sân hoàn 100% bằng điểm. Đã triển khai (INC-01 trong thiết kế).
- AI chỉ hỗ trợ; thao tác ghi qua command có xác nhận, authorization và kiểm nghiệp vụ.

## 5. Yêu cầu chất lượng và nghiệm thu

Backend kiểm quyền từng tài nguyên; OTP/rate limit/security stamp bảo vệ account. Transaction, unique/check/exclusion constraints và idempotency bảo vệ tài chính/lịch. Lưu UTC, hiển thị giờ Việt Nam, hỗ trợ UI EN/VI và thao tác bàn phím/mobile. Outbox có retry/dedup, audit có khả năng truy vết, log không chứa secret/OTP.

Nghiệm thu cần test concurrency PostgreSQL, role/ownership negative cases, checkout/expiry/late payment/refund, migration giữ lịch sử và E2E theo vai trò. VNPay sandbox/SMTP/Gemini thật có evidence riêng; không suy từ mock hoặc sự tồn tại của mã.

## 6. Phân biệt yêu cầu và implementation

Tài liệu này nêu yêu cầu, không tuyên bố tất cả chức năng đã hoàn thành. Payment/checkout/wallet/VNPay adapter đã có mã; sandbox thật chưa được nghiệm thu trong đợt rà soát. Danh sách gap chi tiết, evidence và tiêu chí đóng nằm tại **mục 13 của [thiết kế](Center-Management-System-Design-v3.md)**.

Quy tắc chi tiết theo [Business Rules](SportManagement_BusinessRules_v2.0_updated.docx); quy ước và cách xử lý mâu thuẫn theo [SSOT](00-Source-of-Truth.md).
