# SportHub — Yêu cầu hệ thống quản lý trung tâm thể thao

SportHub quản lý trung tâm thể thao với **ba môn Gym (bao gồm PT), cầu lông và bóng rổ**, đồng thời hỗ trợ mở rộng thêm môn trong tương lai. PT là dịch vụ huấn luyện cá nhân thuộc Gym. Danh mục môn, chuyên môn HLV và loại sân/phòng phải cấu hình được.

## 1. Mục tiêu và phạm vi

Số hóa hoạt động từ tiếp đón, mua dịch vụ, xếp lịch, điểm danh và tập luyện đến thuê sân, thanh toán, hoàn điểm, thông báo và báo cáo. Dữ liệu phải nhất quán giữa sáu vai trò và không bán vượt sĩ số hoặc xếp trùng sân/Coach.

Gym dùng Membership có thời hạn; PT mua riêng sau khi Membership Active. Cầu lông/bóng rổ bán khóa học nhiều buổi, độc lập Membership. ExternalCoach đã được duyệt được thuê sân theo giờ.

Ngoài phạm vi: đa chi nhánh, payroll/hợp đồng nhân sự, chia doanh thu HLV ngoài, quản lý học viên riêng của ExternalCoach, mobile native, payment production, hoàn tiền mặt/chuyển khoản và VNPay Refund API.

## 2. Yêu cầu theo vai trò

| Vai trò | Chức năng yêu cầu |
|---|---|
| Guest | Xem trung tâm, ba môn, khóa/gói công khai; đăng ký Member hoặc ExternalCoach; không đọc dữ liệu cá nhân |
| Member | Account/profile, Membership/PT/khóa học, lịch cá nhân, quyền lợi, invoice/wallet/refund, thông báo, kết quả tập và AI assistant |
| Receptionist | Tìm Member, hỗ trợ đăng ký/mua dịch vụ, Gym check-in/out, điểm danh lớp, checkout hộ; dùng điểm cần OTP Member |
| Coach | Xem lịch/lớp được giao; Coach PT lập kế hoạch, ghi kết quả, giao homework và dùng AI workout cho học viên được phân công |
| ExternalCoach | Đăng ký/chờ duyệt, xem sân phù hợp, thuê/thanh toán/quản lý lượt thuê; không có roster học viên riêng |
| CenterManager | Môn/phòng/giá, Coach/chuyên môn, lớp/lịch, threshold, ExternalCoach approval, incident, hoàn điểm và báo cáo |
| SystemAdministrator | Tài khoản nhân sự, role và trạng thái tài khoản; không tự có quyền tài chính hoặc hồ sơ tập luyện |

Guest không phải role account. Coach có nhiều chuyên môn, không chia role cứng thành PersonalTrainer/ClassInstructor. Backend kiểm cả role và ownership/relationship.

## 3. Luồng nghiệp vụ

| Flow | Yêu cầu |
|---|---|
| 1 — User/Membership | Identity, email OTP/Google onboarding, quên mật khẩu bằng link email (không OTP, phản hồi trung tính)/đổi mật khẩu, trang xác thực luôn tiếng Anh, account status, Membership renewal và Gym access |
| 2 — Class/Schedule | Catalog, nhiều buổi/khóa, seat hold/ghi danh, ngưỡng lớp, chuyển lớp, điểm danh, occupancy, thuê sân và sự cố |
| 3 — Payment/Report | Invoice/item snapshot, checkout, split điểm + VNPay, gateway verification/reconciliation, hoàn điểm và báo cáo |
| 4 — Training/Attendance | PT quota/lịch/change request, plan/result/homework; điểm danh lớp nhóm bởi Receptionist |
| 5 — AI workout | Gợi ý tập luyện cho Coach theo dữ liệu học viên được phân công |
| 6 — AI assistant | Member chat theo context; Manager gợi ý xếp lịch/tạo nháp sau xác nhận là yêu cầu chưa triển khai |

## 4. Quy tắc chức năng

- Giá và thời hạn được snapshot khi checkout; sửa catalog không thay giao dịch đã mua.
- Enrollment gắn cả lớp. Sĩ số và giữ chỗ thuộc Class, không đặt từng buổi theo hạn mức ngày.
- PT tách khỏi lớp nhóm; thời lượng 90 phút/buổi, kiểm Membership/quota/Coach/availability.
- Xếp lịch lớp/PT/rental/block dùng cùng cơ chế occupancy; frontend availability không thay thế kiểm tra DB.
- Giữ chỗ và điểm có hạn, expiry nhả đúng một lần; payment muộn phải đối soát.
- `TotalAmount = PointsApplied × 1.000 + CashAmount`; người dùng chọn điểm trước, không tự trừ khi mở trang.
- Backend xác minh IPN/QueryDR trước khi ghi payment/cấp quyền lợi; return chỉ hiển thị. Thanh toán bằng toàn điểm không tạo attempt VNPay.
- Hoàn trả chỉ bằng điểm theo item, quyền lợi đã dùng và cap hệ thống; không double credit khi retry.
- Ngưỡng lớp hỗ trợ chuyển/hoàn điểm; yêu cầu “chờ đợt sau” là hoàn 100% điểm + lưu nguyện vọng nhận thông báo, chưa có implementation.
- Incident preview và resolve recheck lịch; lớp/PT xử lý phương án riêng trước bước cuối, không giả toàn luồng là một transaction.
- AI chỉ hỗ trợ; thao tác ghi qua command có xác nhận, authorization và kiểm nghiệp vụ.

## 5. Yêu cầu chất lượng và nghiệm thu

Backend kiểm quyền từng tài nguyên; OTP/rate limit/security stamp bảo vệ account. Transaction, unique/check/exclusion constraints và idempotency bảo vệ tài chính/lịch. Lưu UTC, hiển thị giờ Việt Nam, hỗ trợ UI EN/VI và thao tác bàn phím/mobile. Outbox có retry/dedup, audit có khả năng truy vết, log không chứa secret/OTP.

Nghiệm thu cần test concurrency PostgreSQL, role/ownership negative cases, checkout/expiry/late payment/refund, migration giữ lịch sử và E2E theo vai trò. VNPay sandbox/SMTP/Gemini thật có evidence riêng; không suy từ mock hoặc sự tồn tại của mã.

## 6. Phân biệt yêu cầu và implementation

Tài liệu này nêu yêu cầu, không tuyên bố tất cả chức năng đã hoàn thành. Payment/checkout/wallet/VNPay adapter đã có mã; sandbox thật chưa được nghiệm thu trong đợt rà soát. Seed PT riêng chưa khớp phạm vi ba môn. Danh sách gap chi tiết, evidence và tiêu chí đóng nằm tại **mục 13 của [thiết kế](Center-Management-System-Design-v3.md)** và [phân công API theo page/owner](../DESIGN-SKILLS-GUIDE.md#api-liên-vai-trò-và-điều-kiện-đóng-việc).

Quy tắc chi tiết theo [Business Rules](SportManagement_BusinessRules_v2.0_updated.docx); quy ước và cách xử lý mâu thuẫn theo [SSOT](00-Source-of-Truth.md).
