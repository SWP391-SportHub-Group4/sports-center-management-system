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
* Xem báo cáo số lượng thành viên và tình trạng đăng ký lớp. Phần báo cáo doanh thu phụ thuộc nghiệp vụ Payment đang để treo.
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
* Chức năng thanh toán, hóa đơn và hoàn tiền đang để treo vì chưa chốt nghiệp vụ; chưa dùng mô tả cũ làm yêu cầu triển khai.
* Tiếp nhận và ghi nhận các yêu cầu hỗ trợ từ thành viên.

---

## 3. Các Luồng Nghiệp Vụ (System Flows)

### Required Flows (Bắt buộc)
* **Flow 1:** User and membership management (Quản lý người dùng và gói thành viên)
* **Flow 2:** Class booking and schedule management (Quản lý đăng ký lớp và lịch trình)
* **Flow 3:** Payment and report management — **PENDING: chưa chốt nghiệp vụ Payment**. Phần báo cáo không phụ thuộc Payment vẫn giữ trong scope.

### Optional Flows (Tùy chọn — nhóm cam kết làm)
* **Flow 4:** Training and attendance management (Quản lý tập luyện và điểm danh)
* **Flow 5:** AI workout recommendation (Gợi ý bài tập bằng AI)

### Stretch Goal (chỉ làm nếu còn thời gian sau khi xong Flow 1–5 — xem `00-Source-of-Truth.md` §1.4)
* **Flow 6:** AI assistant (Trợ lý AI hỗ trợ giải đáp) — **không tính vào scope cam kết**, chỉ triển khai nếu còn dư thời gian.

## Quyết định hiện hành đã duyệt 23/09/2026

Business Rules v1.6 và SSOT là nguồn hiện hành. Membership, Class, Booking, No-show và PT áp dụng các quyết định ngày 23/09/2026. Không tự suy diễn thêm rule. Payment/Invoice/Adjustment/Refund và báo cáo doanh thu đang **PENDING — chưa chốt nghiệp vụ**, nên nội dung Payment trước đây chỉ là dự thảo và không phải yêu cầu triển khai.

- Membership có thời hạn 1, 3, 6 hoặc 12 tháng. `StartDate` và `EndDate` đều inclusive; `EndDate = StartDate.AddMonths(DurationInMonths).AddDays(-1)`. Sự kiện xác lập `StartDate` cho lần mua mới thuộc nghiệp vụ Payment đang để treo.
- Early renewal tạo Membership mới bắt đầu ngay sau `EndDate` hiện tại. PT sessions chưa dùng được carry over nếu renew trong vòng 30 calendar days; được nối tiếp qua nhiều lần renewal nếu mỗi lần đều thỏa điều kiện này.
- Yoga và Group X là class 60 phút; mỗi bộ môn tối đa một Morning slot và một Afternoon slot mỗi ngày, tổng tối đa 4 class/ngày. Class đi theo `DRAFT → PUBLISHED → CLOSED`; chỉ `PUBLISHED` nhận booking; không có Waitlist.
- Member tối đa 1 Yoga và 1 Group X mỗi ngày. Hủy được phép tại hoặc trước 30 phút trước giờ bắt đầu; hủy thành công giải phóng slot.
- Ba No-show trong rolling 30 calendar days kích hoạt ngay booking restriction 7 calendar days, ngày kết thúc là exclusive.
- PT là add-on tùy chọn, 1 Coach : 1 Member, 90 phút/session. Frequency 1/2/3 sessions per week chỉ dùng tính tổng quota, không phải giới hạn theo tuần. Quy tắc cancel/reschedule, đổi Coach và kiểm tra quota áp dụng theo Business Rules v1.6.
- Quan hệ cá nhân do Manager quản lý, Coach không tự cấp quyền. Token role cũ bị từ chối sau đổi role.

Chi tiết còn mở được ghi tại [SSOT §7](00-Source-of-Truth.md). Đây là thay đổi đặc tả, chưa phải báo cáo hoàn thành.
