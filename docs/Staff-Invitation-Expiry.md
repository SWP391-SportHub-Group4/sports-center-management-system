# Tự hủy tài khoản nhân sự chưa kích hoạt

Áp dụng cho tài khoản do System Administrator tạo qua `POST /api/users/admin/staff`.
Tài khoản Member và tài khoản seed/hệ thống không thuộc phạm vi này.

- Hạn kích hoạt là `UserAccount.CreatedAt + 24 giờ`, tính theo UTC. Gửi lại link hoặc sửa email không đổi mốc này.
- Link staff dùng một lần và hết hạn đúng `UserAccount.CreatedAt + 24 giờ`. Link mới thay thế link cũ, nhưng không kéo dài hạn của tài khoản. Cả link staff và link Member đều có thời hạn 24 giờ.
- `StaffInvitationExpiryJob` chạy mỗi phút khi API đang chạy. API khởi động lại sẽ xử lý các tài khoản đã quá hạn ở lượt quét tiếp theo.
- Job kiểm tra role không phải Member, chưa có mật khẩu, chưa liên kết Google và có audit `CREATE_STAFF_ACCOUNT` đúng UserId. Audit này là bằng chứng nguồn tạo, nên không cần thêm cột hay migration.
- Job khóa dòng tài khoản rồi kiểm tra lại trước khi xóa. Kích hoạt, gửi lại link và sửa email sử dụng cùng khóa; tài khoản vừa kích hoạt sẽ không bị xóa.
- Đủ 24 giờ thì API từ chối kích hoạt, gửi lại link hoặc sửa email ngay cả khi job chưa kịp quét. Quên mật khẩu vẫn trả kết quả trung tính và không cấp thêm link cho tài khoản đã hết hạn.

Trong một transaction, hệ thống xóa OTP/link cũ, thông báo của tài khoản và email reset/kích hoạt theo địa chỉ email, chuyên môn Coach và tài khoản. Profile, credential và Coach profile được xóa theo quan hệ cascade có sẵn. Sau commit, email và số điện thoại được giải phóng; tạo lại tài khoản sẽ có UserId và token mới.

Audit tạo tài khoản được giữ lại; job ghi thêm `EXPIRE_UNACTIVATED_STAFF_ACCOUNT` với `ActorRole = SYSTEM`, chỉ Admin được xem. Vì schema audit bắt buộc có UserId của người dùng thật, bản ghi giữ người mời ban đầu và ghi rõ `executedBy = StaffInvitationExpiryJob` trong NewValue để xác định đây là thao tác hệ thống.

Các khóa ngoại tới dữ liệu vận hành (lớp, lịch, giao dịch hoặc audit do chính tài khoản thực hiện) vẫn được bảo vệ. Nếu dữ liệu bất thường khiến database từ chối xóa, toàn bộ transaction rollback, job ghi lỗi và tiếp tục xử lý tài khoản khác; không xóa lịch/giao dịch để ép xóa tài khoản.

## Kiểm tra

Test dùng PostgreSQL riêng qua Testcontainers, không dùng database của web:

```powershell
dotnet test backend/SportHub.Security.Tests --filter "FullyQualifiedName~StaffInvitationExpiryTests|FullyQualifiedName~PendingStaffActivationTests|FullyQualifiedName~StaffActivationTests|FullyQualifiedName~PasswordResetTests"
```

Các ca kiểm tra bao gồm trước/đúng mốc 24 giờ, xóa bản ghi phụ thuộc, email không phân biệt hoa thường có thể tái sử dụng, link cũ không kích hoạt tài khoản mới, bảo vệ tài khoản đã kích hoạt/Member/seed/Google, gửi lại không gia hạn và kiểm tra lại sau khi chờ khóa.
