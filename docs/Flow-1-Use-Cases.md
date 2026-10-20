# Flow 1 — Use Case Specifications

**Cập nhật 20/10/2026:** mô tả theo hành vi đang có trong backend (API, service, job) và giữ khuôn bảng của `Flow-2-Use-Cases.md`. Đây là đặc tả theo mã nguồn, không phải kết quả kiểm thử E2E. Chênh lệch với Business Rules và phần chưa xác minh được nêu ở mục G.

3.3 Use Case Specifications
Flow 1 Quản lý người dùng và Membership
Phạm vi: tài khoản và hồ sơ, quản trị người dùng, danh mục gói và Membership Gym, quyền vào Gym (mã check-in, check-in), báo cáo hội viên, Audit Log, yêu cầu hỗ trợ. Thanh toán, hoàn điểm và báo cáo doanh thu thuộc Flow 3; hồ sơ tập luyện là đầu vào của Flow 5.
Mã UC-F1 là mã phân rã trong Flow 1, đối chiếu UC-03 đến UC-06 của SRS (SRS hiện chỉ có các UC tổng quát; cột SRS ở mục A ghi mã gần nhất, không có nghĩa SRS đã mô tả đủ luồng chi tiết).
Quy ước chung: thời gian lưu UTC, hiển thị UTC+7, "hôm nay" tính theo giờ Việt Nam; backend kiểm tra quyền và trạng thái tại thời điểm ghi; mật khẩu theo chính sách hiện hành; OTP và token lưu dạng băm, dùng một lần; thao tác quản trị quan trọng ghi Audit Log; email được xếp vào outbox. Checkout dùng `Idempotency-Key`; các thao tác lặp khác tuân theo ngoại lệ của từng UC.
Nguồn đối chiếu: các controller, service và job trong `backend/`; `SportManagement_BusinessRules_v2.0_updated.docx`; `SWP391_Report_SRS.docx` (UC-03 đến UC-06); `Requirements.md`; `00-Source-of-Truth.md`; `api-contract.md`. Các luồng bên dưới phản ánh code hiện tại; mục G ghi rõ nơi code khác quy tắc hoặc tài liệu.

## A. Danh mục use case

| Mã | Tên use case | Tác nhân | SRS | Quy tắc (BR) | API chính |
|---|---|---|---|---|---|
| UC-F1-01 | Đăng ký Member bằng email + OTP | Guest | UC-03 | 1, 49, 62, 78, 102 | POST /api/auth/register/otp, /register |
| UC-F1-02 | Đăng nhập email/mật khẩu | Mọi người dùng | — | 4, 5, 6, 60 | POST /api/auth/login |
| UC-F1-03 | Đăng nhập Google | Guest | — | 59, 60, 143 | POST /api/auth/google |
| UC-F1-04 | Liên kết Google thủ công | Người dùng đã đăng nhập | — | 59 | POST /api/auth/google/link |
| UC-F1-05 | Quên và đặt lại mật khẩu | Mọi người dùng | — | 102, 103, 104 | POST /api/auth/password/forgot, /reset |
| UC-F1-06 | Đặt mật khẩu lần đầu / đổi mật khẩu | Người dùng đã đăng nhập | — | 60, 102, 104 | POST /api/users/me/password/otp; POST /api/users/me/password |
| UC-F1-07 | Xem và cập nhật hồ sơ cá nhân | Người dùng đã đăng nhập | — | 62 | GET /api/users/me; PUT /api/users/me/profile |
| UC-F1-08 | Quản lý ảnh đại diện | Member, Coach; Center Manager | — | — (tài liệu Avatar-Cloudinary) | GET /api/avatars/{userId}; POST/DELETE /api/avatars/me; DELETE /api/manager/members/{memberId}/avatar |
| UC-F1-09 | Đăng ký Member tại quầy | Receptionist, Center Manager | UC-03 | 1, 7, 134, 143 | POST /api/members/front-desk |
| UC-F1-10 | Kích hoạt tài khoản qua link | Member tại quầy, nhân sự | — | 1, 2, 143 | POST /api/auth/password/reset |
| UC-F1-11 | Gửi lại link / sửa email Member chờ kích hoạt | Receptionist, Center Manager | UC-03 | 7, 143 | POST …/resend-activation; PUT …/email |
| UC-F1-12 | Tìm kiếm, xem tài khoản | Receptionist, Center Manager, Coach, System Administrator | — | 6 | GET /api/users[/admin][/{id}] |
| UC-F1-13 | Tạo tài khoản nhân sự | System Administrator | UC-04 | 2, 7, 96, 143 | POST /api/users/admin/staff |
| UC-F1-14 | Gửi lại link / sửa email nhân sự chờ kích hoạt | System Administrator | UC-04 | 7, 143 | POST /api/users/{id}/resend-activation; PUT /{id}/email |
| UC-F1-15 | Đổi vai trò | System Administrator | UC-04 | 2, 7, 96, 142 | PUT /api/users/{id}/role |
| UC-F1-16 | Khóa / mở khóa / vô hiệu hóa tài khoản | System Administrator | UC-04 | 6, 7 | POST /api/users/{id}/lock, unlock, deactivate |
| UC-F1-17 | Quản lý hồ sơ và chuyên môn Coach | Center Manager | — | 2, 96 | GET/PUT /api/manager/coaches |
| UC-F1-18 | Xem danh mục gói thành viên | Guest, mọi vai trò | UC-05 (liên quan) | 8, 144 | GET /api/membership-packages[/public] |
| UC-F1-19 | Quản lý danh mục gói | Center Manager | UC-05 | 7, 8, 39, 56 | /api/membership-packages |
| UC-F1-20 | Mua / gia hạn gói và kích hoạt (gồm vé Gym 1 ngày) | Member; Receptionist, Center Manager mua hộ | UC-06 | 9, 65 + quy tắc vé ngày (xem G.1) | POST /api/checkouts/membership |
| UC-F1-21 | Xem gói đã mua và hạn dùng | Member, Receptionist, Center Manager, Coach | UC-06 (liên quan) | 9 | GET /api/members/me/packages; /api/member-packages |
| UC-F1-22 | Tự động hết hạn và nhắc hạn gói | Hệ thống | — | 9, 33 | MemberPackageExpiryJob |
| UC-F1-23 | Khai báo hồ sơ tập luyện | Member; Center Manager, Coach (đọc) | — | 26 (đầu vào AI) | /api/members/me/training-profile |
| UC-F1-24 | Xem báo cáo hội viên | Center Manager | — | — (đề bài Center Manager) | GET /api/reports/membership-* |
| UC-F1-25 | Xem Audit Log theo quyền | Center Manager, System Administrator | — | 7 | GET /api/audit-logs; GET /api/audit-logs/actions |
| UC-F1-26 | Ghi nhận và xử lý yêu cầu hỗ trợ của Member | Receptionist, Center Manager | — | — (đặc tả Lễ tân) | /api/member-support-requests/* |
| UC-F1-27 | Cấp và xác thực mã check-in Gym | Member; Receptionist, Center Manager | Flow 1 Gym access | 64 + quy tắc vé ngày (G.1) | GET /api/members/me/checkin-code; POST /api/members/checkin-code/resolve |
| UC-F1-28 | Check-in và xem lịch sử Gym | Member; Receptionist; Center Manager | Flow 1 Gym access | 64 | /api/gym-checkins; /api/members/{id|me}/gym-checkins |

## B. Tài khoản và hồ sơ

### UC-F1-01 — Đăng ký Member bằng email + OTP

| Mục | Nội dung |
|---|---|
| Tác nhân | Guest |
| Mức ưu tiên | Required |
| Tiền điều kiện | Email chưa có tài khoản (không phân biệt hoa thường). |
| Luồng chính | 1. Guest nhập email và yêu cầu mã.<br>2. Nếu email chưa có tài khoản, hệ thống ghi OTP 6 chữ số và xếp email; mã hiệu lực 10 phút, dùng một lần, mã mới thay mã cũ.<br>3. Guest nhập họ tên, số điện thoại tùy chọn, mật khẩu và OTP.<br>4. Hệ thống kiểm chính sách mật khẩu trước khi kiểm OTP.<br>5. Hệ thống kiểm email và số điện thoại chưa dùng, tạo Member Active với mật khẩu băm và hồ sơ; đánh dấu OTP đã dùng trong cùng lần lưu.<br>6. Hệ thống trả JWT và thông tin tài khoản mới. |
| Luồng thay thế / ngoại lệ | a. Email đã có tài khoản ngay lúc xin OTP: API trả `email_already_exists`.<br>b. Gửi lại OTP trước 60 giây: từ chối.<br>c. OTP không có, đã dùng, hết hạn, sai hoặc đã sai 5 lần: từ chối; lần nhập sai tăng bộ đếm.<br>d. Mật khẩu không đạt chính sách: từ chối trước khi kiểm OTP.<br>e. Email hoặc số điện thoại trùng khi tạo tài khoản: từ chối.<br>f. Vượt giới hạn tần suất theo IP: từ chối. |
| Hậu điều kiện | Có tài khoản Member Active, có mật khẩu, đã đăng nhập. Ví điểm được tạo khi dùng lần đầu, không tạo lúc đăng ký. |

### UC-F1-02 — Đăng nhập email/mật khẩu

| Mục | Nội dung |
|---|---|
| Tác nhân | Mọi người dùng đã có mật khẩu |
| Mức ưu tiên | Required |
| Tiền điều kiện | Chưa đăng nhập; tài khoản đã được tạo và đã có mật khẩu. |
| Luồng chính | 1. Nhập email và mật khẩu.<br>2. Hệ thống tìm tài khoản và kiểm mật khẩu.<br>3. Hệ thống kiểm trạng thái tài khoản (Banned, Deactivated bị từ chối).<br>4. Hệ thống cấp phiên đăng nhập (hiệu lực 60 phút) gắn vai trò và trả thông tin người dùng.<br>5. Mọi request sau đó được kiểm tra lại trạng thái tài khoản. |
| Luồng thay thế / ngoại lệ | a. Email không tồn tại, chưa có mật khẩu hoặc sai mật khẩu: cùng một thông báo thông tin đăng nhập sai, không cho biết email có tồn tại hay không.<br>b. Tài khoản bị khóa hoặc vô hiệu hóa dù mật khẩu đúng: từ chối kèm thông báo tương ứng; phiên đã cấp trước đó bị chặn từ request kế tiếp.<br>c. Tài khoản chờ kích hoạt: không đăng nhập bằng mật khẩu được.<br>d. Quá 10 lần/phút theo IP: từ chối và cho biết thời gian chờ.<br>e. Mật khẩu băm kiểu cũ: băm lại sang kiểu mới sau khi đăng nhập thành công. |
| Hậu điều kiện | Client giữ phiên đăng nhập hợp lệ. |

### UC-F1-03 — Đăng nhập Google (tự tạo / tự liên kết)

| Mục | Nội dung |
|---|---|
| Tác nhân | Guest có Google ID token hợp lệ |
| Mức ưu tiên | Optional |
| Tiền điều kiện | Hệ thống đã cấu hình Google Client ID; email Google đã được Google xác minh. |
| Luồng chính | 1. Client gửi Google ID token; hệ thống xác minh token và yêu cầu email đã xác minh.<br>2. Nếu danh tính Google đã liên kết với một tài khoản: đăng nhập tài khoản đó.<br>3. Nếu chưa liên kết nhưng có tài khoản Active cùng email: tự liên kết rồi đăng nhập.<br>4. Nếu chưa có tài khoản: tạo Member Active không mật khẩu, liên kết Google, nhập ảnh Google một lần (lỗi nhập ảnh bị bỏ qua) và đánh dấu tài khoản mới. |
| Luồng thay thế / ngoại lệ | a. Token không hợp lệ, email chưa xác minh hoặc chưa cấu hình Google: từ chối.<br>b. Tài khoản đã gắn danh tính Google khác: từ chối, không ghi đè.<br>c. Hai request song song cùng tạo tài khoản: một request thắng, request còn lại báo xung đột.<br>d. Tài khoản nhân sự chờ kích hoạt: từ chối, không dùng Google để bỏ qua kích hoạt.<br>e. Tài khoản Banned hoặc Deactivated: từ chối.<br>f. Member đăng ký tại quầy còn chờ kích hoạt: được đăng nhập Google nếu email Google trùng; tài khoản được liên kết và coi như đã xác minh chủ email (BR-143). |
| Hậu điều kiện | Tài khoản gắn đúng một danh tính Google. Member mới chưa có mật khẩu cho tới khi dùng UC-F1-06 hoặc UC-F1-05. |

### UC-F1-04 — Liên kết Google thủ công

| Mục | Nội dung |
|---|---|
| Tác nhân | Người dùng đã đăng nhập |
| Mức ưu tiên | Optional |
| Tiền điều kiện | Đang đăng nhập bằng tài khoản Active; có Google ID token hợp lệ. |
| Luồng chính | 1. Người dùng chọn liên kết Google và gửi ID token.<br>2. Hệ thống xác minh token.<br>3. Hệ thống gắn danh tính Google vào tài khoản hiện tại. |
| Luồng thay thế / ngoại lệ | a. Danh tính Google đã thuộc tài khoản khác: từ chối.<br>b. Tài khoản hiện tại đã liên kết Google: từ chối.<br>c. Token không hợp lệ: như UC-F1-03. |
| Hậu điều kiện | Tài khoản đăng nhập được bằng Google. Chiều gỡ liên kết chưa có (xem G.3). |

### UC-F1-05 — Quên và đặt lại mật khẩu bằng link

| Mục | Nội dung |
|---|---|
| Tác nhân | Mọi người dùng |
| Mức ưu tiên | Required |
| Tiền điều kiện | Người dùng nhận được email tại địa chỉ cần đặt lại. |
| Luồng chính | 1. Nhập email ở trang quên mật khẩu; hệ thống luôn trả cùng một thông báo trung tính.<br>2. Nếu tài khoản tồn tại và không bị khóa, hệ thống gửi email chứa link đặt lại (token ngẫu nhiên 256-bit, hiệu lực 10 phút, dùng một lần, chỉ link mới nhất còn hiệu lực).<br>3. Người dùng mở link, nhập mật khẩu mới và xác nhận (BR-102), không cần mật khẩu hiện tại.<br>4. Trong một giao dịch, hệ thống tiêu token, đổi mật khẩu, vô hiệu mọi phiên đăng nhập cũ và xếp email thông báo. |
| Luồng thay thế / ngoại lệ | a. Email không tồn tại, tài khoản bị khóa hoặc còn trong 60 giây chờ: vẫn trả thông báo trung tính, không gửi email.<br>b. Token sai, đã dùng, hết hạn hoặc quá 5 lần thử sai: từ chối.<br>c. Mật khẩu và xác nhận không khớp hoặc không đạt BR-102: từ chối.<br>d. Quá 3 yêu cầu/phút theo IP: từ chối. |
| Hậu điều kiện | Mật khẩu mới có hiệu lực; người dùng nhận email "mật khẩu đã đổi" (hoặc email hoàn tất kích hoạt nếu tài khoản trước đó chưa có mật khẩu). |

### UC-F1-06 — Đặt mật khẩu lần đầu / đổi mật khẩu

| Mục | Nội dung |
|---|---|
| Tác nhân | Người dùng đã đăng nhập |
| Mức ưu tiên | Required |
| Tiền điều kiện | Đang đăng nhập bằng tài khoản Active. Nhánh A chỉ áp dụng khi tài khoản chưa có mật khẩu; nhánh B chỉ áp dụng khi đã có. |
| Luồng chính | A. Tài khoản chưa có mật khẩu (đăng ký bằng Google):<br>1. Yêu cầu OTP gửi tới email của chính mình.<br>2. Nhập OTP, mật khẩu mới và xác nhận; hệ thống kiểm OTP và tiêu mã trong giao dịch.<br>B. Tài khoản đã có mật khẩu:<br>1. Nhập mật khẩu hiện tại, mật khẩu mới (khác mật khẩu cũ) và xác nhận.<br>Cả hai nhánh: hệ thống lưu mật khẩu băm, vô hiệu các phiên khác, xếp email thông báo và cấp phiên mới cho thiết bị hiện tại. |
| Luồng thay thế / ngoại lệ | a. Xin OTP khi tài khoản đã có mật khẩu: từ chối.<br>b. Xin lại OTP khi chưa đủ 60 giây: từ chối.<br>c. Thiếu OTP, OTP sai hoặc hết hạn (nhánh A): từ chối.<br>d. Thiếu hoặc sai mật khẩu hiện tại, hoặc mật khẩu mới trùng mật khẩu cũ (nhánh B): từ chối.<br>e. Mật khẩu mới không đạt BR-102 hoặc xác nhận không khớp: từ chối. |
| Hậu điều kiện | Tài khoản đăng nhập được bằng mật khẩu; các phiên cũ hết hiệu lực. |

### UC-F1-07 — Xem và cập nhật hồ sơ cá nhân

| Mục | Nội dung |
|---|---|
| Tác nhân | Người dùng đã đăng nhập |
| Mức ưu tiên | Required |
| Tiền điều kiện | Đang đăng nhập; hồ sơ được xác định từ phiên đăng nhập, không từ mã người dùng do client gửi. |
| Luồng chính | 1. Gọi `GET /api/users/me` để xem email, họ tên, số điện thoại, vai trò, trạng thái, cờ có mật khẩu, cờ liên kết Google, ảnh đại diện và mã môn chuyên môn.<br>2. Gửi họ tên và số điện thoại tùy chọn qua `PUT /api/users/me/profile`.<br>3. Hệ thống lấy user ID từ JWT, kiểm dữ liệu và lưu hồ sơ. |
| Luồng thay thế / ngoại lệ | a. Sai định dạng: từ chối và chỉ rõ trường.<br>b. Số điện thoại đã thuộc tài khoản khác: từ chối (BR-62).<br>c. Không tìm thấy tài khoản: báo lỗi. |
| Hậu điều kiện | Hồ sơ được cập nhật. Email không đổi được ở đây. |

### UC-F1-08 — Quản lý ảnh đại diện

| Mục | Nội dung |
|---|---|
| Tác nhân | Member, Coach (tự quản lý); Center Manager (gỡ ảnh Member) |
| Mức ưu tiên | Optional |
| Tiền điều kiện | Đã đăng nhập khi tải, xóa hoặc xem ảnh Member; xem ảnh Coach công khai không cần đăng nhập. |
| Luồng chính | 1. Người dùng tải ảnh lên (tối đa 5 MB) hoặc xóa ảnh của mình.<br>2. Hệ thống lưu ảnh lên dịch vụ lưu trữ ảnh và gắn vào hồ sơ.<br>3. Người được phép xem ảnh theo quyền (ảnh Coach công khai, ảnh Member cần đăng nhập).<br>4. Center Manager mở hồ sơ Member và gỡ trực tiếp ảnh hiện tại nếu không phù hợp; hệ thống ghi audit và dọn ảnh cũ. |
| Luồng thay thế / ngoại lệ | a. Ảnh rỗng hoặc vượt dung lượng: từ chối.<br>b. Quá 10 lần ghi/phút: từ chối.<br>c. Đối tượng không phải Member: từ chối.<br>d. Ảnh bị thay đồng thời: yêu cầu tải lại hồ sơ. |
| Hậu điều kiện | Ảnh hiện hành được lưu; ảnh cũ được dọn nền bởi tác vụ hệ thống. |

## C. Vận hành tài khoản

### UC-F1-09 — Đăng ký Member tại quầy

| Mục | Nội dung |
|---|---|
| Tác nhân | Receptionist, Center Manager |
| Mức ưu tiên | Required |
| Tiền điều kiện | Đã đăng nhập; email và số điện thoại của khách chưa có trong hệ thống. |
| Luồng chính | 1. Nhập họ tên, email một lần và số điện thoại tùy chọn.<br>2. Hệ thống kiểm email và số điện thoại chưa tồn tại.<br>3. Trong một giao dịch: tạo Member Active chưa có mật khẩu, tạo ví 0 điểm, ghi audit `FRONT_DESK_CREATE_MEMBER`, tạo link kích hoạt và xếp email.<br>4. Màn hình hiển thị trạng thái chờ đặt mật khẩu. |
| Luồng thay thế / ngoại lệ | a. Email hoặc số điện thoại đã tồn tại: từ chối.<br>b. Quầy không đặt mật khẩu hộ và không tạo vai trò khác Member.<br>c. Tác vụ chạy mỗi 10 phút chỉ xóa tài khoản quầy sau 7 ngày nếu vẫn chưa có mật khẩu/Google và chưa có hóa đơn, ghi danh, đặt sân, gói hoặc giao dịch điểm; giữ audit đăng ký và ghi audit hết hạn. |
| Hậu điều kiện | Tài khoản Active nhưng chưa đăng nhập được bằng mật khẩu; quầy có thể ghi nhận dịch vụ cho Member trong lúc chờ. Tài khoản đã phát sinh dữ liệu vận hành không bị tác vụ dọn xóa. |

### UC-F1-10 — Kích hoạt tài khoản qua link

| Mục | Nội dung |
|---|---|
| Tác nhân | Member đăng ký tại quầy; nhân sự do System Administrator tạo |
| Mức ưu tiên | Required |
| Tiền điều kiện | Tài khoản chưa đặt mật khẩu và có link kích hoạt còn hiệu lực, dùng một lần. Link Member hết hạn 24 giờ từ khi phát; link nhân sự hết hạn đúng 24 giờ sau khi tạo tài khoản. |
| Luồng chính | 1. Mở link trong email, vào trang đặt mật khẩu (phân biệt Member hay nhân sự).<br>2. Nhập mật khẩu và xác nhận theo BR-102.<br>3. Hệ thống tiêu link, lưu mật khẩu băm, vô hiệu phiên cũ và gửi email hoàn tất kích hoạt. |
| Luồng thay thế / ngoại lệ | a. Link hết hạn, đã dùng hoặc bị thay thế: từ chối.<br>b. Nhân sự quá hạn 24 giờ kể từ lúc tạo: từ chối dù có link cũ; tác vụ hệ thống xóa lời mời chưa kích hoạt và giữ audit.<br>c. Mật khẩu không đạt chính sách hoặc xác nhận không khớp: từ chối. |
| Hậu điều kiện | Tài khoản có mật khẩu, không còn "chờ kích hoạt", đăng nhập bình thường. |

### UC-F1-11 — Gửi lại link / sửa email Member chờ kích hoạt

| Mục | Nội dung |
|---|---|
| Tác nhân | Receptionist, Center Manager |
| Mức ưu tiên | Required |
| Tiền điều kiện | Member chưa có mật khẩu và chưa liên kết Google. |
| Luồng chính | 1. Gửi lại link: hệ thống phát link mới, vô hiệu link cũ, ghi audit `RESEND_MEMBER_ACTIVATION`.<br>2. Sửa email: nhập email mới một lần và lý do 3–500 ký tự; hệ thống hủy link của email cũ, đổi email, ghi audit `CHANGE_PENDING_MEMBER_EMAIL` và phát link tới email mới. |
| Luồng thay thế / ngoại lệ | a. Không tìm thấy Member: báo lỗi.<br>b. Tài khoản đã có mật khẩu hoặc đã liên kết Google: từ chối.<br>c. Gửi lại trước 60 giây: từ chối.<br>d. Email không đổi hoặc email mới đã tồn tại: từ chối. |
| Hậu điều kiện | Chỉ link mới nhất dùng được. |

### UC-F1-12 — Tìm kiếm, xem tài khoản

| Mục | Nội dung |
|---|---|
| Tác nhân | Receptionist, Center Manager (tra danh sách); Coach (chỉ đọc chi tiết Member có quan hệ Active); System Administrator (danh sách quản trị) |
| Mức ưu tiên | Required |
| Tiền điều kiện | Đã đăng nhập với vai trò và quan hệ dữ liệu cho phép đọc tài khoản được yêu cầu. |
| Luồng chính | 1. Receptionist/Center Manager dùng `GET /api/users`; System Administrator dùng `/api/users/admin` và có thể sắp xếp.<br>2. Hệ thống lọc theo từ khóa, vai trò, trạng thái và trả danh sách phân trang (mặc định 20 dòng, tối đa 100); Receptionist luôn bị giới hạn vai trò Member.<br>3. Người có quyền mở chi tiết qua `/api/users/{id}` hoặc `/api/users/admin/{id}`; Coach chỉ được mở Member có quan hệ Active. |
| Luồng thay thế / ngoại lệ | a. Bộ lọc hoặc cột sắp xếp không hợp lệ: từ chối.<br>b. Coach xem Member không có quan hệ Active: từ chối.<br>c. Không tìm thấy tài khoản: báo lỗi. |
| Hậu điều kiện | Không thay đổi dữ liệu. |

### UC-F1-13 — Tạo tài khoản nhân sự

| Mục | Nội dung |
|---|---|
| Tác nhân | System Administrator |
| Mức ưu tiên | Required |
| Tiền điều kiện | Đã đăng nhập; email nhân sự chưa được dùng; với Coach, môn chuyên môn được chọn đang hoạt động. |
| Luồng chính | 1. Nhập email một lần, họ tên, số điện thoại tùy chọn và chọn vai trò nhân sự. Với Coach, chọn ít nhất một môn có thể dạy.<br>2. Hệ thống kiểm email, số điện thoại chưa dùng và ràng buộc chuyên môn.<br>3. Trong một giao dịch: tạo tài khoản Active chưa có mật khẩu, hồ sơ và chuyên môn Coach nếu cần, ghi audit `CREATE_STAFF_ACCOUNT`, phát link kích hoạt có hạn chót cố định 24 giờ từ lúc tạo.<br>4. Danh sách hiển thị tài khoản chờ đặt mật khẩu. |
| Luồng thay thế / ngoại lệ | a. Vai trò không hợp lệ hoặc Member: từ chối.<br>b. Coach không chọn môn hợp lệ, hoặc vai trò khác Coach lại gửi chuyên môn: từ chối.<br>c. Email hoặc số điện thoại đã tồn tại: từ chối.<br>d. Sau 24 giờ chưa kích hoạt: tác vụ xóa lời mời nhân sự, giải phóng email và ghi audit hết hạn. |
| Hậu điều kiện | Nhân sự chưa đăng nhập được bằng mật khẩu cho tới khi kích hoạt (UC-F1-10). |

### UC-F1-14 — Gửi lại link / sửa email nhân sự chờ kích hoạt

| Mục | Nội dung |
|---|---|
| Tác nhân | System Administrator |
| Mức ưu tiên | Required |
| Tiền điều kiện | Đã đăng nhập; tài khoản đích là nhân sự chờ kích hoạt. |
| Luồng chính | 1. Gửi lại link: hệ thống phát link mới, vô hiệu link cũ, ghi audit `RESEND_STAFF_ACTIVATION`.<br>2. Sửa email: nhập email mới một lần và lý do 3–500 ký tự; hệ thống hủy link cũ, đổi email, ghi audit `CHANGE_PENDING_STAFF_EMAIL` và gửi link mới.<br>3. Hạn chót vẫn là 24 giờ kể từ lúc tạo tài khoản. |
| Luồng thay thế / ngoại lệ | a. Tài khoản là Member, đã có mật khẩu hoặc đã liên kết Google: từ chối.<br>b. Gửi lại trước 60 giây hoặc sau hạn chót lời mời: từ chối.<br>c. Email không đổi hoặc email mới đã tồn tại: từ chối. |
| Hậu điều kiện | Chỉ link mới nhất dùng được. |

### UC-F1-15 — Đổi vai trò

| Mục | Nội dung |
|---|---|
| Tác nhân | System Administrator |
| Mức ưu tiên | Required |
| Tiền điều kiện | Đã đăng nhập; tài khoản đích là nhân sự; vai trò mới là vai trò nhân sự. |
| Luồng chính | 1. Chọn vai trò mới và nhập lý do (3–500 ký tự); nếu đổi sang Coach thì chọn môn chuyên môn.<br>2. Hệ thống kiểm các ràng buộc.<br>3. Hệ thống đổi vai trò, vô hiệu phiên đăng nhập cũ của tài khoản và ghi audit CHANGE_USER_ROLE.<br>4. Khi rời vai trò Coach: gỡ chuyên môn nhưng giữ hồ sơ Coach làm lịch sử. |
| Luồng thay thế / ngoại lệ | a. Vai trò mới trùng vai trò hiện tại: trả hồ sơ hiện tại.<br>b. Đổi giữa Member và nhân sự: từ chối.<br>c. Không cho đổi vai trò của bất kỳ System Administrator hiện tại nào, kể cả chính mình.<br>d. Coach còn lớp chưa kết thúc, buổi tương lai hoặc quan hệ huấn luyện Active: chặn và liệt kê lý do.<br>e. Vai trò/chuyên môn không hợp lệ: từ chối. |
| Hậu điều kiện | Người dùng phải đăng nhập lại để nhận quyền đúng vai trò mới. |

### UC-F1-16 — Khóa / mở khóa / vô hiệu hóa tài khoản

| Mục | Nội dung |
|---|---|
| Tác nhân | System Administrator |
| Mức ưu tiên | Required |
| Tiền điều kiện | Đã đăng nhập; tài khoản đích tồn tại. |
| Luồng chính | 1. Chọn hành động (khóa, mở khóa, vô hiệu hóa) và nhập lý do (3–500 ký tự).<br>2. Hệ thống đổi trạng thái tài khoản (Banned, Active, Deactivated).<br>3. Hệ thống ghi audit kèm trạng thái cũ, trạng thái mới và lý do (khóa và vô hiệu hóa cùng ghi LOCK_USER_ACCOUNT; mở khóa ghi UNLOCK_USER_ACCOUNT).<br>4. Từ request kế tiếp, phiên đăng nhập của tài khoản bị chặn. |
| Luồng thay thế / ngoại lệ | a. Tự khóa chính mình: từ chối.<br>b. Khóa hoặc vô hiệu hóa System Administrator hoạt động cuối cùng: từ chối.<br>c. Tài khoản đã ở đúng trạng thái yêu cầu: không làm gì.<br>d. Không tìm thấy tài khoản: báo lỗi. |
| Hậu điều kiện | Tài khoản không đăng nhập và không mua mới được. Khóa không tự hủy quyền lợi đã mua, lịch đã đặt hay số dư ví; hủy và hoàn phải qua luồng nghiệp vụ riêng, có audit. |

### UC-F1-17 — Quản lý hồ sơ và chuyên môn Coach

| Mục | Nội dung |
|---|---|
| Tác nhân | Center Manager |
| Mức ưu tiên | Required |
| Tiền điều kiện | Đã đăng nhập; tài khoản đích có vai trò Coach. |
| Luồng chính | 1. Tìm Coach theo từ khóa và môn.<br>2. Xem chi tiết Coach.<br>3. Sửa hồ sơ công khai (tiêu đề, giới thiệu, kinh nghiệm) và danh sách môn chuyên môn (một Coach có thể có nhiều môn).<br>4. Hệ thống lưu và ghi audit. |
| Luồng thay thế / ngoại lệ | a. Không tìm thấy Coach: báo lỗi.<br>b. Môn không hợp lệ hoặc không còn hoạt động: từ chối.<br>c. Center Manager không tạo Coach và không đổi vai trò (thuộc System Administrator). |
| Hậu điều kiện | Hồ sơ và chuyên môn Coach được cập nhật; chuyên môn là căn cứ phân công lớp (BR-14). |

## D. Membership và Gym

### UC-F1-18 — Xem danh mục gói thành viên

| Mục | Nội dung |
|---|---|
| Tác nhân | Guest (bản công khai); mọi vai trò đã đăng nhập |
| Mức ưu tiên | Required |
| Tiền điều kiện | Không cần đăng nhập để xem danh mục công khai; danh mục có cả gói ngừng bán chỉ dành cho vai trò được phép. |
| Luồng chính | 1. Mở danh mục gói.<br>2. Hệ thống trả các gói đang bán, sắp theo giá tăng dần, gồm tên, giá, thời hạn và mô tả.<br>3. Center Manager có thể chọn xem cả gói đã ngừng bán. |
| Luồng thay thế / ngoại lệ | a. Guest chỉ thấy gói đang bán.<br>b. Người không có quyền không xem được gói ngừng bán. |
| Hậu điều kiện | Không thay đổi dữ liệu. |

### UC-F1-19 — Quản lý danh mục gói

| Mục | Nội dung |
|---|---|
| Tác nhân | Center Manager |
| Mức ưu tiên | Required |
| Tiền điều kiện | Đã đăng nhập. |
| Luồng chính | 1. Tạo gói: nhập tên duy nhất 2–120 ký tự, giá dương là bội số 1.000 VND, thời hạn `durationDays` từ 1–3650 và mô tả tùy chọn.<br>2. Hệ thống dành riêng thời hạn 1 ngày cho vé Gym; gói thường phải dài hơn 1 ngày và không có giới hạn số buổi (`sessionLimit = null`).<br>3. Center Manager sửa gói, ngừng bán hoặc bán lại; mỗi thao tác ghi audit tương ứng.<br>4. Thay đổi danh mục không hồi tố gói đã bán hoặc hóa đơn đã phát hành. |
| Luồng thay thế / ngoại lệ | a. Tên trùng gói khác: từ chối.<br>b. Giá không hợp lệ, thời hạn ngoài khoảng hoặc gửi `sessionLimit` khác null: từ chối.<br>c. Gói thường có thời hạn 1 ngày: từ chối vì dành cho vé Gym.<br>d. Vé Gym 1 ngày cho sửa giá/tên/mô tả nhưng giữ thời hạn đúng 1 ngày; không cho ngừng bán hoặc bán lại qua API trạng thái.<br>e. Không tìm thấy gói: báo lỗi. |
| Hậu điều kiện | Danh mục được cập nhật; hóa đơn đã phát hành giữ nguyên snapshot giá và thời hạn; ngừng bán không làm mất quyền lợi đã mua (BR-8). |

### UC-F1-20 — Mua / gia hạn gói và kích hoạt (gồm vé Gym 1 ngày)

| Mục | Nội dung |
|---|---|
| Tác nhân | Member (tự mua); Receptionist, Center Manager (mua hộ, phải chỉ rõ Member) |
| Mức ưu tiên | Required |
| Tiền điều kiện | Đã đăng nhập; gói đang bán; Member đích ở trạng thái Active. |
| Luồng chính | 1. Client gửi `POST /api/checkouts/membership` với `Idempotency-Key`; hệ thống lấy giá và thời hạn hiện tại của gói.<br>2. Hệ thống tạo Membership `PendingPayment`, hóa đơn `Issued` và phiên checkout trong một giao dịch; gói thường bắt đầu sau gói Active còn hiệu lực có ngày kết thúc muộn nhất, hoặc từ hôm nay.<br>3. Thanh toán và đối soát do Flow 3 xử lý. Khi hóa đơn được xác nhận trả thành công, Membership chuyển `Active`, tính lại ngày bắt đầu/kết thúc bằng giờ Việt Nam và snapshot thời hạn, ghi audit `ACTIVATE_MEMBER_PACKAGE` và xếp thông báo.<br>4. Khi phiên/hóa đơn được hủy hoặc giải phóng theo luồng thanh toán, Membership còn `PendingPayment` chuyển `Cancelled`.<br>5. Vé Gym 1 ngày dùng giá hiện hành trong danh mục (seed mặc định 50.000 VND); khi kích hoạt, ngày bắt đầu và kết thúc đều là ngày thanh toán thành công, kèm thông báo trong ứng dụng và email về hiệu lực trong ngày. |
| Luồng thay thế / ngoại lệ | a. Thiếu hoặc dùng lại `Idempotency-Key` cho Member/gói khác: từ chối; cùng khóa hợp lệ trả lại checkout cũ.<br>b. Member mua hộ người khác hoặc nhân sự không chỉ rõ Member: từ chối.<br>c. Gói không tồn tại, ngừng bán, giá không hợp lệ hoặc Member không Active: từ chối.<br>d. Nếu có checkout chưa thanh toán cùng gói còn hiệu lực, hệ thống tiếp tục dùng checkout đó; nếu vẫn có `PendingPayment` khác thì chặn, trừ khi Center Manager duyệt mua chồng kèm lý do.<br>e. Gym đang đóng do sự cố hoặc Member đã có vé ngày Active hôm nay: không bán vé ngày. |
| Hậu điều kiện | Member được vào Gym khi có gói `Active` và hôm nay nằm trong khoảng ngày hiệu lực. Gia hạn gói thường được xếp nối tiếp; vé ngày áp dụng riêng cho ngày thanh toán. Thanh toán, thử lại và đối soát thuộc Flow 3. |

### UC-F1-21 — Xem gói đã mua và hạn dùng

| Mục | Nội dung |
|---|---|
| Tác nhân | Member (của mình); Receptionist, Center Manager (của một Member, và tìm toàn bộ); Coach (Member có quan hệ Active) |
| Mức ưu tiên | Required |
| Tiền điều kiện | Đã đăng nhập; chỉ đọc gói của mình hoặc của Member mà vai trò và quan hệ cho phép. |
| Luồng chính | 1. Mở danh sách gói đã mua, sắp theo ngày bắt đầu giảm dần.<br>2. Mỗi gói hiển thị tên, ngày bắt đầu, ngày kết thúc và trạng thái (chờ thanh toán, đang hiệu lực, hết hạn, đã hủy), kèm dấu hiệu "đang dùng được" khi gói Active và hôm nay nằm trong khoảng ngày.<br>3. Quầy có thể tìm theo trạng thái và từ khóa email/họ tên. |
| Luồng thay thế / ngoại lệ | a. Coach xem Member không có quan hệ Active: từ chối.<br>b. Member xem gói của người khác: từ chối. |
| Hậu điều kiện | Không thay đổi dữ liệu. |

### UC-F1-22 — Tự động hết hạn và nhắc hạn gói

| Mục | Nội dung |
|---|---|
| Tác nhân | Hệ thống (tác vụ chạy mỗi 15 phút) |
| Mức ưu tiên | Required |
| Tiền điều kiện | Tác vụ được bật; hệ thống có ngày hiện tại theo giờ Việt Nam và số ngày nhắc hạn đã cấu hình (mặc định 7 ngày, Center Manager chỉnh được). |
| Luồng chính | 1. Gói Active có ngày kết thúc trước hôm nay chuyển sang Expired.<br>2. Gói Active sắp hết hạn trong số ngày cấu hình được xếp một thông báo nhắc hạn cho Member.<br>3. Mỗi gói chỉ được nhắc một lần; vé Gym 1 ngày không được nhắc. |
| Luồng thay thế / ngoại lệ | a. Gói đã có thông báo `PackageExpiring`: không xếp thêm.<br>b. Lỗi ghi thông báo: tác vụ thử lại ở lượt chạy sau; trạng thái gói đã hết hạn được cập nhật riêng. |
| Hậu điều kiện | Gói quá ngày kết thúc chuyển `Expired`; mỗi gói đủ điều kiện có tối đa một thông báo nhắc hạn trong hệ thống. |

## E. Dữ liệu và hỗ trợ

### UC-F1-23 — Khai báo hồ sơ tập luyện

| Mục | Nội dung |
|---|---|
| Tác nhân | Member (ghi và đọc của mình); Center Manager, Coach có quan hệ Active (chỉ đọc). Receptionist không có quyền. |
| Mức ưu tiên | Optional |
| Tiền điều kiện | Member đã đăng nhập để ghi hồ sơ của mình; Center Manager hoặc Coach có quan hệ Active được đọc. |
| Luồng chính | 1. Member nhập mục tiêu, loại mục tiêu, trình độ, ngày sinh, giới tính, chiều cao, cân nặng, cân nặng mục tiêu, mức vận động, số ngày/buổi tập, chế độ ăn, dị ứng thực phẩm và ghi chú.<br>2. Hệ thống kiểm tra, tính tuổi và BMI.<br>3. Khi chiều cao hoặc cân nặng đổi, hệ thống lưu lịch sử số đo (giữ tối đa 12 dòng gần nhất).<br>4. Hệ thống trả cờ cho biết hồ sơ đã đầy đủ hay chưa. |
| Luồng thay thế / ngoại lệ | a. Member chưa có hồ sơ: trả kết quả rỗng.<br>b. Tuổi ngoài 14–90, chiều cao hoặc cân nặng không hợp lệ, cân nặng mục tiêu quá một chữ số thập phân: từ chối.<br>c. BMI ứng với cân nặng mục tiêu dưới 18,5: từ chối vì không an toàn.<br>d. Giá trị mục tiêu, trình độ, giới tính, mức vận động hoặc chế độ ăn ngoài danh sách cho phép: từ chối. |
| Hậu điều kiện | Hồ sơ được lưu; là đầu vào cho gợi ý AI của Coach (Flow 5). |

### UC-F1-24 — Xem báo cáo hội viên

| Mục | Nội dung |
|---|---|
| Tác nhân | Center Manager |
| Mức ưu tiên | Required |
| Tiền điều kiện | Đã đăng nhập; ngày hoặc khoảng ngày báo cáo được cung cấp, hoặc dùng mặc định. |
| Luồng chính | 1. Xem tổng quan theo ngày (mặc định hôm nay): tổng tài khoản vai trò Member, số Member có và không có Membership thường hiệu lực, số gói thường theo trạng thái, số Member có vé ngày.<br>2. Xem theo kỳ [từ ngày, đến ngày]: Member mới, Member có Membership thường hiệu lực cuối kỳ, số Member có mua gói, số vé ngày đã bán.<br>3. Vé Gym 1 ngày không được tính vào chỉ số Membership thường hiệu lực; người mua vé vẫn là tài khoản vai trò Member và nằm trong tổng tài khoản Member. |
| Luồng thay thế / ngoại lệ | a. Hai ngày bị đảo thứ tự: hệ thống tự đổi chỗ.<br>b. Vai trò khác Center Manager: từ chối. |
| Hậu điều kiện | Không thay đổi dữ liệu. Doanh thu thuộc báo cáo của Flow 3; mục này chỉ để đối chiếu phần Membership. |

### UC-F1-25 — Xem Audit Log theo quyền

| Mục | Nội dung |
|---|---|
| Tác nhân | Center Manager, System Administrator; mỗi vai trò có tập log hiển thị riêng theo vai trò người thực hiện |
| Mức ưu tiên | Required |
| Tiền điều kiện | Đã đăng nhập; phạm vi log đọc được phụ thuộc vai trò. |
| Luồng chính | 1. Gọi `GET /api/audit-logs/actions` để lấy hành động có thể lọc, hoặc `GET /api/audit-logs` để lọc theo hành động, đối tượng, người thực hiện, vai trò, mã đích, thời gian và sắp xếp.<br>2. Hệ thống trả danh sách phân trang (mặc định 25, tối đa 200).<br>3. Center Manager thấy log có actor role `CENTER_MANAGER`, `RECEPTIONIST`, `COACH`, `MEMBER`; System Administrator thấy `SYSTEM_ADMINISTRATOR`, `CENTER_MANAGER`, `COACH`, `SYSTEM`.<br>4. Các thao tác tài khoản, danh mục, kích hoạt Membership và xử lý yêu cầu hỗ trợ được ghi audit tại service/controller tương ứng. |
| Luồng thay thế / ngoại lệ | a. Người không có quyền: từ chối.<br>b. Vai trò actor lọc không hợp lệ: từ chối.<br>c. Log ngoài tập vai trò được phép của người xem: không trả về, kể cả khi khớp bộ lọc. |
| Hậu điều kiện | Không thay đổi dữ liệu. |

### UC-F1-26 — Ghi nhận và xử lý yêu cầu hỗ trợ của Member

| Mục | Nội dung |
|---|---|
| Tác nhân | Receptionist, Center Manager |
| Mức ưu tiên | Optional |
| Tiền điều kiện | Đã đăng nhập; tài khoản đích có vai trò Member. |
| Luồng chính | 1. Receptionist hoặc Center Manager chọn Member, nhập loại `GENERAL`, `MEMBERSHIP`, `CLASS`, `PAYMENT` hoặc `OTHER`, tiêu đề 3–200 ký tự và nội dung 3–2000 ký tự.<br>2. Hệ thống tạo yêu cầu `OPEN` với người ghi nhận và audit; có thể xem 50 yêu cầu gần nhất của Member hoặc hàng đợi phân trang với bộ lọc trạng thái, người phụ trách và từ khóa.<br>3. Chọn Receptionist/Center Manager đang Active để giao việc; yêu cầu chuyển `ASSIGNED`.<br>4. Ghi chú tiến độ 3–1000 ký tự sau khi đã giao; yêu cầu chuyển `IN_PROGRESS`.<br>5. Nhập kết quả 3–1000 ký tự để đóng; yêu cầu chuyển `CLOSED` và lưu thời điểm đóng. |
| Luồng thay thế / ngoại lệ | a. Tài khoản đích không phải Member, loại hoặc nội dung không hợp lệ: từ chối.<br>b. Người được giao không phải Receptionist/Center Manager Active: từ chối.<br>c. Chưa giao việc mà cập nhật tiến độ hoặc đóng: từ chối.<br>d. Yêu cầu đã đóng: không cho giao lại/cập nhật tiến độ; đóng lặp trả bản ghi cũ. |
| Hậu điều kiện | Yêu cầu và các thay đổi trạng thái được lưu, có audit cho tạo, giao, cập nhật và đóng. |

## F. Quyền vào Gym

### UC-F1-27 — Cấp và xác thực mã check-in Gym

| Mục | Nội dung |
|---|---|
| Tác nhân | Member (lấy mã); Receptionist, Center Manager (quét mã) |
| Mức ưu tiên | Required |
| Tiền điều kiện | Member đã đăng nhập để lấy mã; nhân sự đã đăng nhập và có quyền quầy để quét. Việc cấp mã không chứng minh Member có gói Gym hiệu lực. |
| Luồng chính | 1. Member yêu cầu mã check-in của chính mình.<br>2. Server tạo mã chứa mã Member và thời điểm hết hạn, ký chữ ký số và trả về mã kèm thời điểm hết hạn; mã hết hiệu lực lúc 00:00 ngày kế tiếp theo giờ Việt Nam.<br>3. Receptionist hoặc Center Manager quét mã và gửi lên máy chủ.<br>4. Server xác minh cấu trúc, chữ ký, hạn dùng và trả mã Member.<br>5. Nhân sự tiếp tục UC-F1-28 để kiểm quyền vào Gym và ghi check-in. |
| Luồng thay thế / ngoại lệ | a. Mã sai cấu trúc hoặc sai chữ ký: từ chối.<br>b. Mã hết hạn: từ chối.<br>c. Người quét không có quyền: từ chối.<br>d. Mã hợp lệ nhưng Member không có Membership Active: vẫn bị từ chối ở UC-F1-28. |
| Hậu điều kiện | Mã chỉ định danh Member, không tự tạo lượt vào Gym và không cấp quyền sử dụng. |

### UC-F1-28 — Check-in và xem lịch sử Gym

| Mục | Nội dung |
|---|---|
| Tác nhân | Member (đưa mã QR, xem lịch sử của mình); Receptionist (check-in cho Member, xem lịch sử); Center Manager (xem lịch sử) |
| Mức ưu tiên | Required |
| Tiền điều kiện | Member tồn tại, có vai trò Member, trạng thái Active và có ít nhất một gói Gym Active với ngày bắt đầu ≤ hôm nay ≤ ngày kết thúc theo giờ Việt Nam. Member được nhận diện qua tài khoản đăng nhập hoặc mã QR (UC-F1-27). |
| Luồng chính | 1. Receptionist tìm hoặc quét mã QR của Member rồi gọi `POST /api/gym-checkins` (Member không tự ghi check-in).<br>2. Hệ thống kiểm vai trò, trạng thái tài khoản, gói Gym hiệu lực đúng ngày và thời điểm check-in gần nhất trong transaction; lấy giờ máy chủ làm giờ vào.<br>3. Nút Check-in của Member đếm ngược 10 giây sau khi thành công; hết cooldown có thể check-in tiếp.<br>4. Member, Receptionist và Center Manager xem lịch sử check-in có phân trang. |
| Luồng thay thế / ngoại lệ | a. Không tìm thấy Member, sai vai trò hoặc tài khoản không Active: từ chối.<br>b. Không có gói Active đúng ngày: từ chối.<br>c. Check-in lại trong 10 giây, kể cả gửi đồng thời từ hai máy: 409 `gym_checkin_cooldown`.<br>d. Người thiếu quyền: từ chối. |
| Hậu điều kiện | Lịch sử check-in Gym được lưu. Quyền vào chỉ được xác nhận tại thời điểm check-in, không dựa vào mã QR hay dữ liệu do client gửi. |

## G. Đối chiếu code và quy tắc (không thuộc nội dung UC)

1. **OTP đăng ký và BR-78:** `AuthService.RequestRegisterOtpAsync` trả `email_already_exists` ngay khi xin mã cho email đã tồn tại. Vì vậy UC-F1-01 mô tả phản hồi hiện có; yêu cầu không tiết lộ sự tồn tại email của BR-78 chưa được đáp ứng.
2. **Email nhập hai lần và BR-143:** request tạo Member tại quầy, tạo nhân sự và sửa email đang chờ kích hoạt đều chỉ có một trường `Email`. UC-F1-09, 11, 13, 14 phản ánh code; nếu cần hai lần nhập phải bổ sung contract và kiểm tra ở backend.
3. **Hết hạn lời mời:** link Member có hạn 24 giờ từ mỗi lần phát; tài khoản Member tại quầy chưa kích hoạt bị dọn sau 7 ngày chỉ khi chưa có dữ liệu vận hành. Link nhân sự có hạn chót cố định 24 giờ từ lúc tạo, gửi lại hoặc sửa email không gia hạn; lời mời nhân sự chưa kích hoạt được dọn sau hạn chót. Các điều kiện này do `ActivationLinkService`, `MemberInvitationExpiryService` và `StaffInvitationExpiryService` thực hiện.
4. **Thời hạn Membership và BR-9:** API nhận `durationDays` 1–3650 (1 ngày dành riêng cho vé Gym). `MemberPackageRules` quy đổi từ 28 ngày trở lên sang tháng bằng cách làm tròn `durationDays / 30.4375`, dưới 28 ngày tính theo ngày. BR-9 chỉ nêu 1, 3, 6, 12 tháng. Cần chốt lại tập thời hạn được bán hoặc sửa BR-9.
5. **Vé Gym 1 ngày:** giá seed 50.000 VND không phải giá cố định trong code; Center Manager sửa được giá tại danh mục, nhưng không đổi được thời hạn 1 ngày hoặc ngừng bán. Hóa đơn dùng giá danh mục tại lúc mua; thông báo sau kích hoạt nêu ngày thanh toán thực tế. Quy tắc vé ngày chưa có mã BR tương ứng trong Business Rules v2.0.
6. **Giới hạn số buổi:** Membership hiện không dùng quota. `MembershipPackageService` từ chối mọi `sessionLimit` khác null; `MemberPackageRules` kiểm quyền bằng trạng thái và ngày hiệu lực. Quy tắc hoặc màn hình nào còn mô tả gói giới hạn buổi cần cập nhật.
7. **Google và hỗ trợ:** chưa có API gỡ liên kết Google dù BR-59 đề cập. `MemberSupportRequestsController` đã có hàng đợi, giao việc, ghi tiến độ và đóng yêu cầu.
8. **Quyền quản trị:** `UserAdminService` cấm đổi vai trò của mọi System Administrator hiện tại. UC-F1-15 ghi theo code thay vì điều kiện "chỉ chặn Administrator cuối cùng" của bản trước.
9. **Thanh toán:** Membership chỉ chuyển `Cancelled` khi luồng thanh toán thực sự giải phóng bản ghi `PendingPayment`. Việc VNPay trả về thất bại/hủy và trạng thái giao diện chờ xác nhận thuộc Flow 3, cần kiểm thử riêng; không suy ra `Cancelled` chỉ từ việc người dùng rời trang thanh toán.
10. **Mã BR và mức ưu tiên:** tài liệu BR v2.0 không có BR-30, BR-40, BR-145 từng được dẫn ở bản cũ; BR-11 nói về PT, không dùng cho hết hạn Membership. Required/Optional trong bảng là đề xuất của nhóm, không suy ra từ code. Tài liệu này đối chiếu mã nguồn nhưng chưa thay thế kiểm thử tích hợp hoặc E2E.
