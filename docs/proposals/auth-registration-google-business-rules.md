# Đề xuất business rule — Đăng ký, Google và bảo vệ tài khoản

> Trạng thái: **PROPOSED — chưa phải Source of Truth**  
> Mục đích: tài liệu để team review và chốt trước khi cập nhật `00-Source-of-Truth.md` và Business Rules chính thức.

## 1. Phạm vi quyết định

SportHub hỗ trợ hai cách tạo tài khoản hội viên:

1. Gmail + OTP + mật khẩu.
2. Đăng ký trực tiếp bằng Google.

Người dùng không cần liên kết Google trước khi đăng ký bằng Gmail. Liên kết Google là thao tác tùy chọn sau khi tài khoản đã tồn tại. Tài khoản nhân viên không tự đăng ký qua hai luồng này.

## 2. Flow đề xuất

### 2.1 Gmail + OTP

`Gmail → gửi OTP → xác thực OTP → họ tên + mật khẩu → tạo Member`

- Không tạo `UserAccount` trước khi OTP hợp lệ.
- Số điện thoại được bổ sung trong hồ sơ sau đăng ký.
- Verification token sau OTP chỉ dùng một lần để gọi `/api/auth/register`.

### 2.2 Đăng ký bằng Google

`Google ID token → backend xác minh → kiểm tra sub/email → tạo Member + UserExternalLogin`

- `Google sub` là định danh external login; email không phải khóa định danh Google.
- Tài khoản Google-only có thể chưa có mật khẩu.
- Người dùng có thể đặt mật khẩu sau trong trang Tài khoản.

### 2.3 Email đã tồn tại nhưng Google chưa liên kết

- Từ chối tự động liên kết.
- Yêu cầu đăng nhập bằng mật khẩu hiện tại.
- Sau đó vào trang Tài khoản để liên kết Google tường minh.

### 2.4 Liên kết Google sau đăng ký

`Phiên đăng nhập → xác thực lại → Google ID token → kiểm tra → tạo UserExternalLogin`

- `userId` phải lấy từ JWT/session.
- Google `sub` không được thuộc tài khoản khác.
- Đề xuất yêu cầu Gmail Google trùng email SportHub.
- Gửi email thông báo và ghi audit log khi liên kết thành công.

### 2.5 Gỡ liên kết

- Chỉ được gỡ khi tài khoản còn mật khẩu hoặc phương thức đăng nhập khác.
- Yêu cầu xác thực lại trước khi gỡ.
- Gửi email thông báo và ghi audit log.

### 2.6 Quên mật khẩu

`Gmail → OTP → verification token → mật khẩu mới`

- Phản hồi yêu cầu OTP giống nhau dù email tồn tại hay không.
- OTP reset không dùng được cho đăng ký và ngược lại.
- Sau reset phải gửi email cảnh báo.

## 3. Business rule đề xuất

| ID đề xuất | Nội dung |
|---|---|
| AUTH-01 | Chỉ tài khoản công khai role Member được tự đăng ký. |
| AUTH-02 | Staff/Admin do System Administrator tạo. |
| AUTH-03 | Đăng ký bằng mật khẩu phải xác thực Gmail trước. |
| AUTH-04 | Email duy nhất và so sánh không phân biệt hoa thường. |
| AUTH-05 | OTP gồm 6 số, hết hạn 5 phút, một lần sử dụng, tối đa 5 lần thử. |
| AUTH-06 | Chờ tối thiểu 60 giây trước khi gửi lại OTP. |
| AUTH-07 | Verification token hết hạn sau 10 phút và chỉ dùng một lần. |
| AUTH-08 | Tài khoản tạo bằng Google có thể chưa có mật khẩu. |
| AUTH-09 | Google được định danh bằng cặp `(provider, sub)`. |
| AUTH-10 | Backend phải xác minh chữ ký, audience, issuer, expiry và `email_verified` của Google ID token. |
| AUTH-11 | Không tự động liên kết Google chỉ vì email trùng. |
| AUTH-12 | Đăng ký Google lần đầu chỉ tạo role Member. |
| AUTH-13 | Link/unlink Google yêu cầu phiên hợp lệ và xác thực lại. |
| AUTH-14 | Đề xuất Gmail Google phải trùng email SportHub khi link. |
| AUTH-15 | Không được gỡ phương thức đăng nhập cuối cùng. |
| AUTH-16 | Forgot-password không tiết lộ email có tồn tại. |
| AUTH-17 | OTP phải gắn với đúng purpose. |
| AUTH-18 | Đổi/reset mật khẩu và link/unlink Google phải gửi cảnh báo. |
| AUTH-19 | Rate limit theo IP và email; không khóa tài khoản do spam OTP. |
| AUTH-20 | Không ghi password, OTP, ID token hoặc access token vào log. |
| AUTH-21 | Ghi audit cho login bất thường, reset password và link/unlink. |
| AUTH-22 | Sau reset mật khẩu, đề xuất thu hồi các session cũ. |

## 4. Quyết định team cần chốt

- [ ] Chỉ hỗ trợ `@gmail.com`, hay mọi Google Account có email đã xác minh?
- [ ] Link Google có bắt buộc email Google trùng email SportHub không?
- [ ] Sau đăng ký thành công có tự đăng nhập hay yêu cầu đăng nhập lại?
- [ ] Sau reset mật khẩu có thu hồi toàn bộ session không?
- [ ] OTP lưu memory cho demo hay lưu database để không mất khi restart?
- [ ] Có bắt buộc xác thực lại bằng mật khẩu/OTP trước link và unlink trong MVP không?
- [ ] Thời hạn access token và refresh token mong muốn?

## 5. Khoảng cách giữa proposal và code hiện tại

- Frontend đã có flow Gmail + OTP, Google signup/login, quên mật khẩu và UI link/unlink.
- Backend đã chặn auto-link khi email tồn tại và dùng Google `sub`.
- Backend link hiện cần phiên JWT nhưng chưa yêu cầu step-up authentication và chưa bắt buộc email Google trùng email SportHub.
- OTP hiện lưu trong memory; restart API sẽ xóa challenge đang chờ.
- Session revocation sau reset mật khẩu chưa được triển khai.

Các mục trong phần khoảng cách chỉ được triển khai sau khi team chốt rule tương ứng.
