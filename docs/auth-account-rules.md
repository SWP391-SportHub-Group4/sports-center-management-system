# Quy tắc nghiệp vụ: đăng nhập Google, mật khẩu và liên kết tài khoản

Tài liệu này là nguồn chính thức cho luồng Google và mật khẩu của tài khoản. Nó **thay thế** quy tắc cũ (liên kết Google thủ công, onboarding Google bắt buộc nhập mật khẩu). Các mã BR-59, BR-60, BR-104 trong file Business Rules đã được viết lại theo tài liệu này; BR-78 (OTP đăng ký), BR-102 (chính sách mật khẩu) và BR-103 (quên mật khẩu bằng link) giữ nguyên.

## 1. Nguyên tắc

- Email trên hồ sơ Google **đã được Google xác minh** (`email_verified = true`) nên được tin dùng để nhận ra chủ tài khoản. Token chưa xác minh bị từ chối.
- Một tài khoản = một email. Đăng nhập Google và đăng nhập email/mật khẩu cùng trỏ về một tài khoản, không bao giờ tạo hai tài khoản cho một email.
- Tài khoản đăng ký bằng Google **chưa có mật khẩu**: `user_credentials.password_hash = NULL`. Hệ thống không tự sinh hay gửi mật khẩu.

## 2. Đăng nhập Google (`POST /api/auth/google`)

Thứ tự xử lý, dừng ở bước đầu tiên khớp:

| # | Điều kiện | Kết quả |
|---|---|---|
| 1 | Danh tính Google (`sub`) đã được liên kết với một tài khoản | Đăng nhập tài khoản đó. `isNewAccount = false` |
| 2 | Email Google trùng email một tài khoản có sẵn (không phân biệt hoa thường) | **Tự liên kết** danh tính Google vào tài khoản đó rồi đăng nhập. `isNewAccount = false` |
| 3 | Email chưa có tài khoản | **Tạo ngay** tài khoản Member `Active`, `password_hash = NULL`, họ tên lấy từ Google (thiếu thì lấy phần trước `@`), số điện thoại trống. `isNewAccount = true` |

Quy tắc kèm theo:

- Tài khoản bị khóa (`Banned`, `Deactivated`): không liên kết, không cấp phiên (bước 1 và 2).
- Tài khoản ở bước 2 đã liên kết với một danh tính Google **khác**: trả `409 google_identity_mismatch`, không ghi đè.
- Hai yêu cầu đăng nhập song song cùng một người mới: chỉ một tài khoản được tạo, yêu cầu còn lại nhận `409 google_login_conflict` và thử lại là vào nhánh bước 1.
- Không có bước onboarding và không còn endpoint `POST /api/auth/google/onboarding`. Bảng `google_onboarding_tickets` đã bị gỡ.
- Tài khoản nhân sự (Manager, Receptionist, Coach, Admin) áp dụng cùng quy tắc nếu email Google trùng email tài khoản của họ.

## 3. Đăng nhập email/mật khẩu với tài khoản chưa có mật khẩu

`POST /api/auth/login` trả lỗi thông tin đăng nhập chung (`401`), giống như sai mật khẩu, để không lộ việc email có tồn tại hay đăng ký bằng Google. Người dùng tạo mật khẩu theo Luồng A hoặc Luồng B.

## 4. Luồng A: Tạo mật khẩu trong Cài đặt tài khoản (khuyên dùng)

Áp dụng khi tài khoản **chưa có mật khẩu** (`hasPassword = false` trong `GET /api/users/me`).

1. Giao diện hiển thị khối "Đặt mật khẩu" thay cho "Đổi mật khẩu" (không có ô mật khẩu hiện tại).
2. Người dùng bấm "Gửi mã xác nhận": `POST /api/users/me/password/otp` (cần đăng nhập). Hệ thống gửi **mã OTP 6 chữ số** tới email của chính tài khoản.
3. Người dùng nhập mã, mật khẩu mới và xác nhận mật khẩu mới, rồi gửi `POST /api/users/me/password` với `otpCode`, `newPassword`, `confirmNewPassword`.
4. Thành công: lưu mật khẩu, đổi security stamp (phiên cũ mất hiệu lực), trả JWT mới cho phiên hiện tại. Từ lúc này tài khoản đăng nhập được bằng cả Google lẫn email/mật khẩu.

Ràng buộc của mã OTP (cùng chuẩn với BR-78):

- Hiệu lực 10 phút, dùng một lần, chỉ mã mới nhất còn hiệu lực.
- Tối đa 5 lần nhập sai; quá ngưỡng phải xin mã mới (`otp_attempts_exceeded`).
- Gửi lại phải chờ ít nhất 60 giây (`429 otp_resend_too_soon`) và chịu rate limit theo IP (3 lần/phút).
- Lưu ở dạng băm SHA-256, không ghi log giá trị rõ. Mã gắn với email của tài khoản đang đăng nhập nên không dùng được cho tài khoản khác.
- Mã chỉ bị tiêu khi mật khẩu được lưu thành công. Mật khẩu yếu hoặc xác nhận không khớp bị chặn **trước** khi kiểm mã nên không làm mất lượt thử.

Lỗi thường gặp:

| Mã lỗi | Ý nghĩa |
|---|---|
| `otp_required` | Tài khoản chưa có mật khẩu nhưng không gửi `otpCode` |
| `otp_invalid` | Mã sai |
| `otp_expired` / `otp_already_used` / `otp_attempts_exceeded` | Mã hết hạn, đã dùng, hoặc hết lượt thử |
| `password_already_set` (409) | Xin mã khi tài khoản đã có mật khẩu: hãy dùng đổi mật khẩu |

## 5. Luồng B: Quên mật khẩu (link email)

Giữ nguyên BR-103. Người dùng ở trang đăng nhập nhập email rồi chọn "Quên mật khẩu": hệ thống gửi **link đặt lại** (token 256-bit, hiệu lực 10 phút, dùng một lần), người dùng tạo mật khẩu mới. Luồng này dùng được cho tài khoản chưa có mật khẩu (Google) và không hỏi mật khẩu cũ. Phản hồi luôn trung tính, không lộ email nào đã đăng ký.

## 6. Đổi mật khẩu khi đã có mật khẩu

Giữ nguyên BR-104: nhập đúng mật khẩu hiện tại, mật khẩu mới đáp ứng BR-102 và khác mật khẩu cũ. Trường `otpCode` bị bỏ qua. Thành công vô hiệu mọi phiên cũ.

## 7. Gỡ liên kết Google

`DELETE /api/auth/google/link` chỉ thành công khi tài khoản **đã có mật khẩu** (`password_required_before_unlink`), tránh khóa người dùng ra khỏi tài khoản. Liên kết thủ công `POST /api/auth/google/link` (đã đăng nhập) còn dùng được cho trường hợp email Google khác email tài khoản.

## 8. Tóm tắt thay đổi so với quy tắc cũ

| Chủ đề | Trước | Nay |
|---|---|---|
| Email Google trùng tài khoản có sẵn | `409 google_account_not_linked`, phải đăng nhập mật khẩu rồi liên kết thủ công | Tự liên kết và đăng nhập |
| Email Google chưa có tài khoản | `202` + phiếu onboarding, bắt buộc nhập họ tên, SĐT, mật khẩu | Tạo tài khoản ngay, mật khẩu NULL |
| Tạo mật khẩu cho tài khoản Google | Chỉ qua onboarding hoặc Quên mật khẩu | Cài đặt tài khoản kèm OTP, hoặc Quên mật khẩu |
| Bảng/entity | `google_onboarding_tickets` | Đã gỡ |

## 9. Kiểm thử

- Backend: `SportHub.Security.Tests/Integration/GoogleLoginTests.cs` (tự tạo, tự liên kết, khóa, song song, không lộ bí mật) và `SetPasswordTests.cs` (OTP, hết lượt, gửi lại, tài khoản đã có mật khẩu).
- Frontend: `frontend/tests/auth-google-account.spec.ts`.
