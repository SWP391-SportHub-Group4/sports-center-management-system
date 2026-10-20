# Flow 1 — Use Case Specifications

**Cập nhật 18/10/2026:** viết lại theo cùng khuôn với `Flow-2-Use-Cases.md` (mỗi UC một bảng: Tác nhân, Mức ưu tiên, Tiền điều kiện, Luồng chính, Luồng thay thế / ngoại lệ, Hậu điều kiện). Đây là đặc tả, không phải báo cáo đã kiểm thử thành công; trạng thái triển khai và các điểm chưa khớp được gom ở mục G cuối tài liệu.

3.3 Use Case Specifications
Flow 1 Quản lý người dùng và Membership
Phạm vi: tài khoản và hồ sơ, quản trị người dùng, danh mục gói và Membership Gym, quyền vào Gym (mã check-in, check-in/out), báo cáo hội viên, Audit Log, yêu cầu hỗ trợ. Thanh toán, hoàn điểm và báo cáo doanh thu thuộc Flow 3; hồ sơ tập luyện là đầu vào của Flow 5.
Mã UC-F1 là mã phân rã trong Flow 1, đối chiếu UC-03 đến UC-06 của SRS (SRS hiện chỉ có các UC tổng quát; cột SRS ở mục A ghi mã gần nhất, không có nghĩa SRS đã mô tả đủ luồng chi tiết).
Quy ước chung: thời gian lưu UTC, hiển thị UTC+7, "hôm nay" tính theo giờ Việt Nam; backend kiểm tra quyền và trạng thái tại thời điểm ghi; mật khẩu theo BR-102; OTP và token lưu dạng băm, dùng một lần; thao tác quản trị quan trọng ghi Audit Log (BR-7); email gửi qua outbox, gửi lỗi không làm rollback nghiệp vụ; giao dịch lặp phải idempotent.
Nguồn đối chiếu: SportManagement_BusinessRules_v2.0_updated.docx; SWP391_Report_SRS.docx (UC-03 đến UC-06); Requirements.md; 00-Source-of-Truth.md; api-contract.md. Khi khác nhau, ưu tiên phạm vi đã xác nhận và Business Rules theo 00-Source-of-Truth.md.

## A. Danh mục use case

| Mã | Tên use case | Tác nhân | SRS | Quy tắc (BR) | API chính |
|---|---|---|---|---|---|
| UC-F1-01 | Đăng ký Member bằng email + OTP | Guest | UC-03 | 1, 49, 62, 78, 102 | POST /api/auth/register/otp, /register |
| UC-F1-02 | Đăng nhập email/mật khẩu | Mọi người dùng | — | 4, 5, 6, 60 | POST /api/auth/login |
| UC-F1-03 | Đăng nhập Google | Guest | — | 59, 60, 143 | POST /api/auth/google |
| UC-F1-04 | Liên kết Google thủ công | Người dùng đã đăng nhập | — | 59 | POST /api/auth/google/link |
| UC-F1-05 | Quên và đặt lại mật khẩu | Mọi người dùng | — | 102, 103, 104 | POST /api/auth/password/forgot, /reset |
| UC-F1-06 | Đặt mật khẩu lần đầu / đổi mật khẩu | Người dùng đã đăng nhập | — | 60, 102, 104 | POST /api/users/me/password[/otp] |
| UC-F1-07 | Xem và cập nhật hồ sơ cá nhân | Người dùng đã đăng nhập | — | 62 | GET/PUT /api/users/me |
| UC-F1-08 | Quản lý ảnh đại diện | Member, Coach; nhân sự; Center Manager | — | — (tài liệu Avatar-Cloudinary) | /api/avatars/* |
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
| UC-F1-25 | Xem Audit Log thao tác tài khoản | Center Manager, System Administrator | — | 7 | GET /api/audit-logs |
| UC-F1-26 | Ghi nhận yêu cầu hỗ trợ của Member | Receptionist, Center Manager | — | — (đặc tả Lễ tân) | GET/POST /api/member-support-requests |
| UC-F1-27 | Cấp và xác thực mã check-in Gym | Member; Receptionist, Center Manager | Flow 1 Gym access | 64 + quy tắc vé ngày (G.1) | GET /api/members/me/checkin-code; POST /api/members/checkin-code/resolve |
| UC-F1-28 | Check-in, check-out và xem lịch sử Gym | Member; Receptionist; Center Manager | Flow 1 Gym access | 64 | /api/gym-checkins/*; /api/members/{id|me}/gym-checkins |

## B. Tài khoản và hồ sơ

### UC-F1-01 — Đăng ký Member bằng email + OTP

| Mục | Nội dung |
|---|---|
| Tác nhân | Guest |
| Mức ưu tiên | Required |
| Tiền điều kiện | Email chưa có tài khoản (không phân biệt hoa thường). |
| Luồng chính | 1. Guest nhập email và yêu cầu mã.<br>2. Hệ thống gửi OTP 6 chữ số (hiệu lực 10 phút, dùng một lần, chỉ mã mới nhất còn hiệu lực) và không tiết lộ email đã tồn tại hay chưa.<br>3. Guest nhập họ tên (2–100 ký tự chữ), số điện thoại Việt Nam (tùy chọn), mật khẩu và OTP.<br>4. Hệ thống kiểm mật khẩu trước (không tốn lượt nhập OTP), rồi kiểm OTP.<br>5. Hệ thống kiểm email và số điện thoại chưa dùng, tạo tài khoản Member trạng thái Active kèm mật khẩu băm và hồ sơ; đánh dấu OTP đã dùng trong cùng giao dịch.<br>6. Hệ thống đăng nhập luôn cho Guest. |
| Luồng thay thế / ngoại lệ | a. Gửi lại OTP khi chưa đủ 60 giây: từ chối.<br>b. OTP không có, đã dùng, hết hạn, sai hoặc quá 5 lần nhập sai: từ chối và nêu đúng lý do; nhập sai thì tăng số lần thử.<br>c. Mật khẩu không đạt BR-102: từ chối, không tốn lượt OTP.<br>d. Email hoặc số điện thoại đã tồn tại tại bước 5: từ chối.<br>e. Vượt giới hạn tần suất theo IP: từ chối. |
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
| Luồng chính | 1. Mở hồ sơ: hệ thống hiển thị email, họ tên, số điện thoại, vai trò, trạng thái, đã có mật khẩu hay chưa, đã liên kết Google hay chưa, ảnh đại diện và môn chuyên môn (với Coach).<br>2. Sửa họ tên (2–100 ký tự chữ) và số điện thoại Việt Nam (có thể để trống).<br>3. Hệ thống kiểm tra và lưu. |
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
| Luồng chính | 1. Nhập họ tên, email, nhập lại email và số điện thoại (tùy chọn).<br>2. Hệ thống kiểm hai lần nhập email khớp, email và số điện thoại chưa tồn tại.<br>3. Trong một giao dịch: tạo Member Active chưa có mật khẩu, tạo ví điểm 0, ghi audit FRONT_DESK_CREATE_MEMBER, tạo link kích hoạt (hiệu lực 24 giờ) và xếp email.<br>4. Màn hình hiển thị trạng thái "chờ kích hoạt". |
| Luồng thay thế / ngoại lệ | a. Hai lần nhập email không khớp: từ chối.<br>b. Email hoặc số điện thoại đã tồn tại: từ chối.<br>c. Quầy không đặt mật khẩu hộ và không tạo được vai trò khác Member. |
| Hậu điều kiện | Tài khoản Active nhưng chưa đăng nhập được bằng mật khẩu; quầy vẫn có thể ghi nhận thanh toán và đăng ký dịch vụ cho Member trong lúc chờ. |

### UC-F1-10 — Kích hoạt tài khoản qua link

| Mục | Nội dung |
|---|---|
| Tác nhân | Member đăng ký tại quầy; nhân sự do System Administrator tạo |
| Mức ưu tiên | Required |
| Tiền điều kiện | Tài khoản chưa đặt mật khẩu và có link kích hoạt còn hiệu lực (24 giờ, dùng một lần). |
| Luồng chính | 1. Mở link trong email, vào trang đặt mật khẩu (phân biệt Member hay nhân sự).<br>2. Nhập mật khẩu và xác nhận theo BR-102.<br>3. Hệ thống tiêu link, lưu mật khẩu băm, vô hiệu phiên cũ và gửi email hoàn tất kích hoạt. |
| Luồng thay thế / ngoại lệ | a. Link hết hạn, đã dùng hoặc bị thay thế (do gửi lại link hoặc sửa email): từ chối; người phụ trách dùng UC-F1-11 hoặc UC-F1-14 để phát link mới.<br>b. Mật khẩu không đạt BR-102: từ chối. |
| Hậu điều kiện | Tài khoản có mật khẩu, không còn "chờ kích hoạt", đăng nhập bình thường. |

### UC-F1-11 — Gửi lại link / sửa email Member chờ kích hoạt

| Mục | Nội dung |
|---|---|
| Tác nhân | Receptionist, Center Manager |
| Mức ưu tiên | Required |
| Tiền điều kiện | Member chưa có mật khẩu và chưa liên kết Google. |
| Luồng chính | 1. Gửi lại link: hệ thống phát link mới, vô hiệu link cũ, ghi audit RESEND_MEMBER_ACTIVATION.<br>2. Sửa email: nhập email mới hai lần và lý do (3–500 ký tự); hệ thống hủy link gửi tới email cũ, đổi email, ghi audit CHANGE_PENDING_MEMBER_EMAIL (email cũ, email mới, lý do) và gửi link mới tới email mới. |
| Luồng thay thế / ngoại lệ | a. Không tìm thấy Member: báo lỗi.<br>b. Tài khoản đã kích hoạt hoặc đã liên kết Google: từ chối.<br>c. Gửi lại khi chưa đủ 60 giây: từ chối.<br>d. Hai lần nhập email không khớp, email không đổi hoặc email mới đã tồn tại: từ chối. |
| Hậu điều kiện | Chỉ link mới nhất dùng được. |

### UC-F1-12 — Tìm kiếm, xem tài khoản

| Mục | Nội dung |
|---|---|
| Tác nhân | Receptionist, Center Manager (danh sách Member); Coach (chỉ Member có quan hệ huấn luyện Active); System Administrator (danh sách quản trị) |
| Mức ưu tiên | Required |
| Tiền điều kiện | Đã đăng nhập với vai trò và quan hệ dữ liệu cho phép đọc tài khoản được yêu cầu. |
| Luồng chính | 1. Nhập từ khóa (email, họ tên, số điện thoại), chọn vai trò, trạng thái và cách sắp xếp.<br>2. Hệ thống trả danh sách phân trang (20 dòng, tối đa 100).<br>3. Mỗi dòng hiển thị trạng thái chờ kích hoạt, đã có mật khẩu, đã liên kết Google và môn chuyên môn (với Coach).<br>4. Mở chi tiết một tài khoản khi cần. |
| Luồng thay thế / ngoại lệ | a. Bộ lọc hoặc cột sắp xếp không hợp lệ: từ chối.<br>b. Coach xem Member không có quan hệ Active: từ chối.<br>c. Không tìm thấy tài khoản: báo lỗi. |
| Hậu điều kiện | Không thay đổi dữ liệu. |

### UC-F1-13 — Tạo tài khoản nhân sự

| Mục | Nội dung |
|---|---|
| Tác nhân | System Administrator |
| Mức ưu tiên | Required |
| Tiền điều kiện | Đã đăng nhập; email nhân sự chưa được dùng; với Coach, môn chuyên môn được chọn đang hoạt động. |
| Luồng chính | 1. Nhập email, nhập lại email, họ tên, số điện thoại (tùy chọn) và chọn vai trò (System Administrator, Center Manager, Receptionist, Coach). Với Coach, chọn đúng một môn đang hoạt động.<br>2. Hệ thống kiểm hai lần nhập email khớp, email và số điện thoại chưa dùng, ràng buộc môn.<br>3. Trong một giao dịch: tạo tài khoản Active chưa có mật khẩu, tạo hồ sơ và chuyên môn Coach (nếu là Coach), ghi audit CREATE_STAFF_ACCOUNT, phát link kích hoạt 24 giờ.<br>4. Danh sách hiển thị tài khoản ở trạng thái "chờ kích hoạt".<br>5. Sau khi tạo, Center Manager có thể bổ sung chuyên môn cho Coach (UC-F1-17). |
| Luồng thay thế / ngoại lệ | a. Vai trò không hợp lệ hoặc vai trò Member: từ chối (Member phải tự đăng ký).<br>b. Coach không chọn đúng một môn, hoặc vai trò khác Coach nhưng có chọn môn: từ chối.<br>c. Hai lần nhập email không khớp: từ chối.<br>d. Email hoặc số điện thoại đã tồn tại: từ chối. |
| Hậu điều kiện | Nhân sự chưa đăng nhập được cho tới khi kích hoạt (UC-F1-10). |

### UC-F1-14 — Gửi lại link / sửa email nhân sự chờ kích hoạt

| Mục | Nội dung |
|---|---|
| Tác nhân | System Administrator |
| Mức ưu tiên | Required |
| Tiền điều kiện | Đã đăng nhập; tài khoản đích là nhân sự chờ kích hoạt. |
| Luồng chính | 1. Gửi lại link: hệ thống phát link mới, vô hiệu link cũ, ghi audit RESEND_STAFF_ACTIVATION.<br>2. Sửa email: nhập email mới hai lần và lý do (3–500 ký tự); hệ thống hủy link cũ, đổi email, ghi audit CHANGE_PENDING_STAFF_EMAIL (email cũ, email mới, lý do) và gửi link mới tới email mới. |
| Luồng thay thế / ngoại lệ | a. Tài khoản là Member, đã có mật khẩu hoặc đã liên kết Google: từ chối.<br>b. Gửi lại khi chưa đủ 60 giây: từ chối.<br>c. Email không đổi hoặc email mới đã tồn tại: từ chối. |
| Hậu điều kiện | Chỉ link mới nhất dùng được. |

### UC-F1-15 — Đổi vai trò

| Mục | Nội dung |
|---|---|
| Tác nhân | System Administrator |
| Mức ưu tiên | Required |
| Tiền điều kiện | Đã đăng nhập; tài khoản đích là nhân sự; vai trò mới là vai trò nhân sự. |
| Luồng chính | 1. Chọn vai trò mới và nhập lý do (3–500 ký tự); nếu đổi sang Coach thì chọn môn chuyên môn.<br>2. Hệ thống kiểm các ràng buộc.<br>3. Hệ thống đổi vai trò, vô hiệu phiên đăng nhập cũ của tài khoản và ghi audit CHANGE_USER_ROLE.<br>4. Khi rời vai trò Coach: gỡ chuyên môn nhưng giữ hồ sơ Coach làm lịch sử. |
| Luồng thay thế / ngoại lệ | a. Vai trò mới trùng vai trò hiện tại: không làm gì.<br>b. Đổi giữa Member và nhân sự: từ chối (BR-142).<br>c. Hạ System Administrator hoạt động cuối cùng: từ chối.<br>d. Coach còn lớp chưa kết thúc, buổi tương lai hoặc quan hệ huấn luyện Active: chặn và liệt kê lý do.<br>e. Vai trò không hợp lệ, hoặc có chọn môn khi vai trò mới không phải Coach: từ chối. |
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
| Luồng chính | 1. Tạo gói: nhập tên duy nhất (2–120 ký tự), giá (dương, bội số của 1.000 VND), thời hạn và mô tả.<br>2. Sửa gói, ngừng bán hoặc bán lại.<br>3. Mỗi thao tác ghi audit (CREATE, UPDATE, DISCONTINUE, REACTIVATE_MEMBERSHIP_PACKAGE) kèm giá trị cũ và mới.<br>4. Sửa giá hoặc thời hạn không làm đổi các gói đã bán. |
| Luồng thay thế / ngoại lệ | a. Tên trùng gói khác: từ chối (BR-56).<br>b. Giá không hợp lệ: từ chối.<br>c. Bỏ giới hạn số buổi của gói đang có giới hạn: từ chối.<br>d. Vé Gym 1 ngày có giá và thời hạn cố định: không cho sửa hoặc ngừng bán.<br>e. Không tìm thấy gói: báo lỗi. |
| Hậu điều kiện | Danh mục được cập nhật; hóa đơn đã phát hành giữ nguyên snapshot giá và thời hạn; ngừng bán không làm mất quyền lợi đã mua (BR-8). |

### UC-F1-20 — Mua / gia hạn gói và kích hoạt (gồm vé Gym 1 ngày)

| Mục | Nội dung |
|---|---|
| Tác nhân | Member (tự mua); Receptionist, Center Manager (mua hộ, phải chỉ rõ Member) |
| Mức ưu tiên | Required |
| Tiền điều kiện | Đã đăng nhập; gói đang bán; Member đích ở trạng thái Active. |
| Luồng chính | 1. Hệ thống báo giá gói (giá, thời hạn được chốt tại thời điểm mua).<br>2. Hệ thống tạo Membership ở trạng thái chờ thanh toán. Ngày bắt đầu là ngày ngay sau khi Membership Active gần nhất hết hạn (gia hạn sớm, BR-65), nếu không có thì là hôm nay.<br>3. Hệ thống tạo hóa đơn và chuyển sang thanh toán (Flow 3).<br>4. Khi thanh toán thành công: Membership chuyển Active, tính lại ngày bắt đầu/kết thúc theo BR-9 (hai đầu inclusive), ghi audit ACTIVATE_MEMBER_PACKAGE và thông báo cho Member.<br>5. Khi thanh toán thất bại hoặc bị hủy: Membership chờ thanh toán chuyển Cancelled.<br>6. Vé Gym 1 ngày: giá 50.000 VND, bắt đầu và kết thúc trong ngày thanh toán thành công; Member được báo rõ mã check-in chỉ dùng trong ngày trước khi trả tiền, và nhận lại thông báo kèm email nhắc. |
| Luồng thay thế / ngoại lệ | a. Thiếu mã chống trùng giao dịch, hoặc Member mua hộ người khác: từ chối.<br>b. Nhân sự mua hộ mà không chỉ rõ Member: từ chối.<br>c. Gói không tồn tại, đã ngừng bán hoặc giá không còn hợp lệ: từ chối.<br>d. Đã có đơn chờ thanh toán cùng gói: từ chối, trừ khi được duyệt mua chồng kèm lý do.<br>e. Gym đang đóng do sự cố: không bán vé ngày.<br>f. Member đã có vé ngày còn hiệu lực trong ngày: từ chối.<br>g. Tài khoản không Active: từ chối. |
| Hậu điều kiện | Member có quyền vào Gym trong khoảng ngày hiệu lực; các gói nối tiếp nhau, không chồng lấn. Thanh toán, thử lại và đối soát do Flow 3 đặc tả. |

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
| Luồng thay thế / ngoại lệ | a. Gói đã nhắc: không nhắc lại.<br>b. Gửi thông báo lỗi: giữ trạng thái để tác vụ thử lại theo cơ chế outbox, không làm sai trạng thái gói. |
| Hậu điều kiện | Trạng thái gói đúng theo ngày; Member nhận đúng một nhắc hạn cho mỗi gói. |

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
| Luồng chính | 1. Xem tổng quan theo ngày (mặc định hôm nay): tổng Member, Member có và không có Membership hiệu lực, số gói theo từng trạng thái, số Member có vé ngày.<br>2. Xem theo kỳ [từ ngày, đến ngày]: Member mới, Member có Membership hiệu lực cuối kỳ, số Member có mua gói, số vé ngày đã bán.<br>3. Vé Gym 1 ngày không tính là hội viên. |
| Luồng thay thế / ngoại lệ | a. Hai ngày bị đảo thứ tự: hệ thống tự đổi chỗ.<br>b. Vai trò khác Center Manager: từ chối. |
| Hậu điều kiện | Không thay đổi dữ liệu. Doanh thu thuộc báo cáo của Flow 3; mục này chỉ để đối chiếu phần Membership. |

### UC-F1-25 — Xem Audit Log thao tác tài khoản

| Mục | Nội dung |
|---|---|
| Tác nhân | Center Manager (toàn bộ); System Administrator (chỉ thao tác tài khoản) |
| Mức ưu tiên | Required |
| Tiền điều kiện | Đã đăng nhập; phạm vi log đọc được phụ thuộc vai trò. |
| Luồng chính | 1. Lọc theo hành động, loại đối tượng, người thực hiện, mã đối tượng và khoảng thời gian; chọn cách sắp xếp.<br>2. Hệ thống trả danh sách phân trang (25 dòng).<br>3. Các hành động của Flow 1 được ghi: CREATE_STAFF_ACCOUNT, RESEND_STAFF_ACTIVATION, CHANGE_PENDING_STAFF_EMAIL, FRONT_DESK_CREATE_MEMBER, RESEND_MEMBER_ACTIVATION, CHANGE_PENDING_MEMBER_EMAIL, CHANGE_USER_ROLE, LOCK_USER_ACCOUNT, UNLOCK_USER_ACCOUNT, CREATE/UPDATE/DISCONTINUE/REACTIVATE_MEMBERSHIP_PACKAGE, ACTIVATE_MEMBER_PACKAGE. |
| Luồng thay thế / ngoại lệ | a. Người không có quyền: từ chối.<br>b. System Administrator chỉ thấy Audit Log thao tác tài khoản. |
| Hậu điều kiện | Không thay đổi dữ liệu. |

### UC-F1-26 — Ghi nhận yêu cầu hỗ trợ của Member

| Mục | Nội dung |
|---|---|
| Tác nhân | Receptionist, Center Manager |
| Mức ưu tiên | Optional |
| Tiền điều kiện | Đã đăng nhập; tài khoản đích có vai trò Member. |
| Luồng chính | 1. Chọn Member.<br>2. Nhập loại yêu cầu (chung, Membership, lớp học, thanh toán, khác), tiêu đề (3–200 ký tự) và nội dung (3–2000 ký tự).<br>3. Hệ thống lưu yêu cầu ở trạng thái OPEN kèm người ghi nhận.<br>4. Xem 50 yêu cầu gần nhất của Member. |
| Luồng thay thế / ngoại lệ | a. Tài khoản đích không phải Member: từ chối.<br>b. Loại, tiêu đề hoặc nội dung không hợp lệ: từ chối. |
| Hậu điều kiện | Có bản ghi yêu cầu OPEN. Chưa có bước xử lý hoặc đóng yêu cầu (xem G.4). |

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

### UC-F1-28 — Check-in, check-out và xem lịch sử Gym

| Mục | Nội dung |
|---|---|
| Tác nhân | Member (đưa mã QR, xem lịch sử của mình); Receptionist (check-in và check-out cho Member, xem lịch sử); Center Manager (xem lịch sử) |
| Mức ưu tiên | Required |
| Tiền điều kiện | Member tồn tại, có vai trò Member, trạng thái Active và có ít nhất một gói Gym Active với ngày bắt đầu ≤ hôm nay ≤ ngày kết thúc theo giờ Việt Nam. Member được nhận diện qua tài khoản đăng nhập hoặc mã QR (UC-F1-27). |
| Luồng chính | 1. Receptionist tìm hoặc quét mã QR của Member rồi yêu cầu check-in (Member không tự check-in).<br>2. Hệ thống kiểm vai trò, trạng thái tài khoản, Member chưa có lượt đang mở và có gói Gym hiệu lực đúng ngày; lấy giờ máy chủ làm giờ vào.<br>3. Hệ thống lưu lượt check-in kèm người thực hiện.<br>4. Receptionist chọn lượt đang mở để check-out; hệ thống ghi giờ ra và người thực hiện.<br>5. Member xem lịch sử của mình; Receptionist và Center Manager xem lịch sử của một Member (phân trang). |
| Luồng thay thế / ngoại lệ | a. Không tìm thấy Member hoặc không đúng vai trò: từ chối.<br>b. Tài khoản không Active: từ chối.<br>c. Đang có lượt chưa check-out: từ chối.<br>d. Không có gói Active đúng ngày (kể cả vé ngày đã qua ngày): từ chối.<br>e. Check-out lượt không tồn tại: báo lỗi.<br>f. Check-out lặp lại: trả lại bản ghi đã đóng, không ghi đè giờ ra.<br>g. Người thiếu quyền: từ chối. |
| Hậu điều kiện | Lịch sử vào/ra Gym được lưu. Quyền vào chỉ được xác nhận tại thời điểm check-in, không dựa vào mã QR hay dữ liệu do client gửi. |

## G. Điểm cần chốt và đối chiếu (không thuộc nội dung UC)

1. **Mã BR không có trong Business Rules v2.0.** Bản cũ dẫn BR-30, BR-40, BR-145 nhưng file BR chỉ đến BR-144 và không có ba mã này. Quy tắc vé Gym 1 ngày (50.000đ, dùng trong ngày, mã check-in hiệu lực trong ngày) hiện chỉ có ở Requirements.md và 00-Source-of-Truth.md; cần thêm vào file BR và đặt mã, rồi cập nhật cột BR ở mục A. BR-11 (bản cũ dẫn cho tác vụ hết hạn) là quy tắc gói PT, không phải hết hạn Membership; đã thay bằng BR-9, BR-33.
2. **Thời hạn gói: BR-9 và code lệch nhau.** BR-9 quy định Membership chỉ có thời hạn 1, 3, 6 hoặc 12 tháng, EndDate = StartDate cộng số tháng trừ một ngày. Bản cũ UC-F1-19 ghi thời hạn lưu theo số ngày từ 1 đến 3650 và UC-F1-20 ghi quy đổi từ 28 ngày trở lên sang tháng. Cần chốt: sửa BR-9 cho khớp code, hoặc giới hạn code theo BR-9. UC viết lại dùng cách nói trung tính "thời hạn", "theo BR-9".
3. **Gỡ liên kết Google chưa có.** BR-59 cho phép người dùng gỡ liên kết Google khi tài khoản đã có mật khẩu; UC-F1-04 chỉ có chiều liên kết.
4. **Yêu cầu hỗ trợ (UC-F1-26):** chỉ tạo và xem, chưa có xử lý hoặc đóng yêu cầu; loại PT còn sót sau khi bỏ PT (bản viết lại đã bỏ khỏi danh sách loại).
5. **BR-143 chưa áp dụng đủ cho nhân sự:** form và API tạo nhân sự hiện chỉ có một ô email (UC-F1-13 viết theo BR-143, tức nhập hai lần); màn quản trị người dùng của System Administrator chưa có nút gọi gửi lại link / sửa email (UC-F1-14).
6. **Requirements.md lệch BR-1:** Requirements.md ghi lễ tân nhập email một lần và tài khoản chưa kích hoạt quá 7 ngày bị gỡ; BR-1 và BR-143 yêu cầu nhập hai lần, và không có BR nào về việc tự gỡ sau 7 ngày. UC-F1-09 viết theo BR-1; cần sửa Requirements.md hoặc bổ sung BR cho quy tắc 7 ngày.
7. **UC-F1-01 bước gửi OTP:** BR-78 cấm phản hồi gửi OTP tiết lộ email đã tồn tại; bản cũ ghi trả lỗi email đã tồn tại ngay ở bước gửi OTP. UC viết lại theo BR-78; cần kiểm lại code.
8. **UC-F1-20 bước 5 (hủy thanh toán → Cancelled)** phụ thuộc xử lý kết quả cổng thanh toán ở Flow 3; màn "Confirming your payment" treo Pending khi người dùng hủy ở VNPay là chưa khớp bước này.
9. **UC-F1-27, UC-F1-28:** có mã nguồn nhưng chưa có bằng chứng nghiệm thu; các UC còn lại cũng chưa phải kết quả chạy thật hoặc E2E.
10. **Mức ưu tiên (Required / Optional)** là đề xuất để nhóm xác nhận: Google (03, 04), ảnh đại diện (08), hồ sơ tập luyện (23) và yêu cầu hỗ trợ (26) đặt Optional.
