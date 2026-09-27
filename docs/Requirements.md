# Yêu Cầu Hệ Thống Quản Lý Trung Tâm (Center Management System)

> SportHub là hệ thống quản lý **trung tâm thể thao đa bộ môn**: Gym/Fitness (ra vào tự do), Personal Training, Yoga, Group X — 1 trung tâm duy nhất, không đa chi nhánh. Chi tiết chốt bộ môn: `docs/00-Source-of-Truth.md` §1.1.

## 1. Danh sách Tác nhân & Vai trò (Actors & Roles)

* **System Administrator** – Quản trị tài khoản và vai trò hệ thống
* **Center Manager** – Quản lý trung tâm
* **Coach** – Huấn luyện viên
* **Member** – Học viên / Thành viên
* **Receptionist** – Nhân viên lễ tân

---

## 2. Chi Tiết Yêu Cầu Chức Năng Theo Vai Trò

### System Administrator (Quản trị Hệ thống)
* Tạo tài khoản System Administrator, Center Manager, Coach và Receptionist; gán hoặc đổi vai trò theo BR-2.
* Khóa/mở khóa tài khoản có lý do và Audit Log; không tự khóa hoặc khóa System Administrator hoạt động cuối cùng theo BR-6/7.
* Quyền đổi vai trò có hiệu lực từ request xác thực tiếp theo; không mặc nhiên có quyền nghiệp vụ của Manager hoặc quyền xem báo cáo/Audit.

### Center Manager (Quản lý Trung tâm)
* Quản lý danh sách thành viên, huấn luyện viên và nhân viên của trung tâm.
* Quản lý các lớp học, bộ môn, phòng tập và lịch hoạt động.
* Phân công huấn luyện viên phụ trách từng lớp học.
* Xem báo cáo số lượng thành viên, tình trạng đăng ký lớp và doanh thu theo ngày thu tiền. Chỉ Center Manager được xem báo cáo doanh thu.
* Quản lý MembershipPackage và thời hạn sử dụng 1, 3, 6 hoặc 12 tháng theo calendar date.
* Cấu hình chính sách nghiệp vụ của trung tâm; quyền gán/đổi vai trò thuộc System Administrator.
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
* Checkout Membership hoặc PT cho Member, tạo Invoice và PaymentAttempt VNPay-QR; hỗ trợ yêu cầu hoàn tiền thay Member khi nhập lý do.
* Tiếp nhận và ghi nhận các yêu cầu hỗ trợ từ thành viên.

---

## 3. Các Luồng Nghiệp Vụ (System Flows)

### Required Flows (Bắt buộc)
* **Flow 1:** User and membership management (Quản lý người dùng và gói thành viên)
* **Flow 2:** Class booking and schedule management (Quản lý đăng ký lớp và lịch trình)
* **Flow 3:** Payment and report management — thanh toán đủ một lần bằng VNPay-QR, Invoice/InvoiceItem snapshot giá, đối soát IPN/QueryDR, Refund theo từng InvoiceItem và báo cáo doanh thu cho Center Manager.

### Optional Flows (Tùy chọn — nhóm cam kết làm)
* **Flow 4:** Training and attendance management (Quản lý tập luyện và điểm danh)
* **Flow 5:** AI workout recommendation (Gợi ý bài tập bằng AI)

### Stretch Goal (chỉ làm nếu còn thời gian sau khi xong Flow 1–5 — xem `00-Source-of-Truth.md` §1.4)
* **Flow 6:** AI assistant (Trợ lý AI hỗ trợ giải đáp) — **không tính vào scope cam kết**, chỉ triển khai nếu còn dư thời gian.

## Quyết định hiện hành đã duyệt 23/09/2026

Business Rules v1.8 và SSOT là nguồn hiện hành. Membership, Class, Booking, No-show, PT, xác thực tài khoản và Payment áp dụng các quyết định đến ngày 26/09/2026. Nội dung Payment cũ trái BR-79–BR-95 không còn hiệu lực.

- Membership có thời hạn 1, 3, 6 hoặc 12 tháng. `StartDate` và `EndDate` đều inclusive; `EndDate = StartDate.AddMonths(DurationInMonths).AddDays(-1)`. Lần mua mới lấy `StartDate` theo ngày Việt Nam của `vnp_PayDate` đã xác minh; early renewal bắt đầu sau `EndDate` hiện tại.
- Early renewal tạo Membership mới bắt đầu ngay sau `EndDate` hiện tại. PT sessions chưa dùng được carry over nếu renew trong vòng 30 calendar days; được nối tiếp qua nhiều lần renewal nếu mỗi lần đều thỏa điều kiện này.
- Yoga và Group X là class 60 phút; mỗi bộ môn tối đa một Morning slot và một Afternoon slot mỗi ngày, tổng tối đa 4 class/ngày. Class đi theo `DRAFT → PUBLISHED → CLOSED`; chỉ `PUBLISHED` nhận booking; không có Waitlist.
- Member tối đa 1 Yoga và 1 Group X mỗi ngày. Hủy được phép tại hoặc trước 30 phút trước giờ bắt đầu; hủy thành công giải phóng slot.
- Ba No-show trong rolling 30 calendar days kích hoạt ngay booking restriction 7 calendar days, ngày kết thúc là exclusive.
- PT là dịch vụ trả phí riêng, 1 Coach : 1 Member, 90 phút/session. Chỉ Membership `Active` mới được checkout PT; không mua PT trong cùng checkout tạo Membership mới. Frequency 1/2/3 sessions per week chỉ dùng tính tổng quota, không phải giới hạn theo tuần.
- Register bằng email/mật khẩu phải xác thực OTP 6 số; OTP dùng một lần, hiệu lực 10 phút, tối đa 5 lần nhập sai, resend cooldown 60 giây và chịu rate limit theo email/IP. Google Login lần đầu với email mới phải để chính người dùng nhập và xác nhận mật khẩu trước khi hoàn tất onboarding.
- Invoice được tạo tại checkout, snapshot từng InvoiceItem và chỉ hỗ trợ trả đủ một lần bằng VND qua VNPay-QR. Một Invoice có thể có nhiều PaymentAttempt nhưng tối đa một Payment thành công; IPN/QueryDR từ backend là nguồn xác nhận, ReturnUrl chỉ để hiển thị.
- Payment thành công, Invoice Paid và tạo/kích hoạt Membership hoặc PT phải commit trong cùng database transaction. Gateway đã nhận tiền nhưng fulfillment lỗi phải được lưu `ReconciliationRequired` và cho backend thử lại; Receptionist không được tự đánh dấu thành công.
- Refund tách theo InvoiceItem. Membership đủ điều kiện khi còn ít nhất 2/3 tổng thời hạn tại ngày yêu cầu, kể cả chưa tới StartDate, và hoàn 50% số tiền item đã trả. Dưới ngưỡng hoặc Expired không hoàn, trừ lỗi trung tâm. PT chưa sử dụng session nào hoàn 50%; đã consume session thì không hoàn chuẩn, trừ lỗi trung tâm.
- Member tạo yêu cầu hoàn cho giao dịch của mình; Receptionist tạo hộ và bắt buộc nhập lý do; Center Manager approve/reject nhưng không được tăng số tiền vượt mức hệ thống tính; chỉ backend gọi VNPay Refund API.
- Quan hệ cá nhân do Manager quản lý, Coach không tự cấp quyền. Token role cũ bị từ chối sau đổi role.

Chi tiết còn mở được ghi tại [SSOT §7](00-Source-of-Truth.md). Đây là thay đổi đặc tả, chưa phải báo cáo hoàn thành.
