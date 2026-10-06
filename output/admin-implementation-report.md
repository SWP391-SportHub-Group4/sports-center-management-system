# KO-01 — Admin: kết quả triển khai và kiểm chứng

Ngày: 06/10/2026 (giờ Việt Nam).

## Đã triển khai

- `/admin`: lối tắt tạo nhân sự, quản lý tài khoản, nhật ký; tổng tài khoản theo trạng thái từ `GET /api/users/admin` với `pageSize=1`, đọc `totalCount`; năm audit `UserAccount` mới nhất theo timestamp giảm dần. Không đọc endpoint finance.
- `/admin/users`: giữ tìm/lọc/phân trang/sort; thêm liên kết chi tiết. Tạo nhân sự qua Dialog dùng chung, có bước review và không hiển thị mật khẩu trong phần review.
- Đổi role/khóa/mở/vô hiệu hóa: xem lại tài khoản, role/trạng thái mới, lý do và hệ quả trước xác nhận; tránh gửi trùng; giữ dữ liệu khi API từ chối; đóng Dialog và tải lại danh sách sau thành công. Không cho tự khóa ở UI; backend guard Admin cuối được giữ nguyên.
- `/admin/users/[id]`: route được bảo vệ bằng quyền SystemAdministrator. Dựng thông tin identity/access, phương thức đăng nhập và chuyên môn Coach theo DTO. Có loading, lỗi, không tìm thấy, ID sai và G10; khi API cho phép, reload detail sau mutation và F5.
- Nội dung EN/VI; Table/Form/Dialog/StateView và token hiện có được tái sử dụng.
- Audit log và hoạt động gần đây dùng chung cột **Tài khoản bị tác động**: họ tên + email tài khoản đích, tách biệt với người thực hiện. API audit bổ sung `targetFullName`, `targetEmail`, `targetAccountExists`, tra cứu một lần cho các tài khoản thuộc trang hiện tại. Đây là thông tin hiện tại; không thay đổi bản ghi audit lịch sử. Tài khoản không còn tồn tại vẫn giữ sự kiện và ID. Response cũ chưa có identity dùng thông báo chưa có thông tin, không giả định đã xóa.

## BLOCKED API — G10

Chức năng bị chặn: **System Administrator đọc chi tiết tài khoản, gồm direct link/F5 và reload detail sau mutation**.

`GET /api/users/{id}` dùng `StaffRead`, policy không chứa SystemAdministrator. Kiểm tra API Docker thật ngày 06/10/2026 trả HTTP 403. Giao diện ghi `BLOCKED API — G10` kèm thông báo và đường về danh sách. List/create/role/status dùng endpoint riêng của Admin, không nằm trong blocker này.

Không sửa policy G10, mở rộng StaffRead hay migration. Backend chỉ bổ sung thông tin tài khoản đích trong response audit theo phần mở rộng đã duyệt. Chưa ghi nhận Q30 detail hoàn thành. Cần G10 sửa endpoint/policy hẹp rồi kiểm thử lại bằng phiên Admin thật; kiểm thử giả lập khi detail được cấp quyền không thay thế nghiệm thu đó.

## Kiểm chứng

- TypeScript `npm.cmd run typecheck`: đạt.
- ESLint các file Admin thay đổi và test mới: đạt.
- `npm.cmd run check:i18n`: đạt trong phạm vi script hiện có; EN/VI mới cũng được kiểm tra kiểu Translations và giao diện.
- Docker frontend production build: đạt; frontend đã chạy lại tại `http://localhost:3000`.
- Playwright trên Chrome đã cài: **31/31 đạt** (`admin-account-flows`, `admin-tables`, `admin-sport-states`, `admin-filterbar`).
- Kiểm tra API thật bằng demo Admin: truy vấn tổng theo ACTIVE/BANNED/DEACTIVATED và audit tài khoản trả 200; detail trả 403. Số lượng chỉ là snapshot, không hardcode vào frontend.
- Một test browser dùng API thật kiểm tổng quan EN/VI và G10 direct link/F5. Các ca tạo/đổi/khóa/mở, backend denial, detail được cấp quyền và negative role UI dùng fixture. Không ghi/chỉnh tài khoản thật trong kiểm chứng này.
- Ảnh desktop/mobile được xem để kiểm layout; mobile 390px không tràn ngang.
- Sau thay đổi audit identity: **29/29 Playwright đạt**, gồm `admin-audit-targets`, `admin-account-flows`, `admin-tables`, `admin-filterbar`, `admin-table-sorting-live`. Đã đối chiếu tên/email API audit với danh sách tài khoản bằng API Admin thật, kiểm G10 vẫn 403 và hiển thị mobile 320/390px.
- **5/5 backend integration test `AuditTargetAccountTests` đạt** trên PostgreSQL Testcontainers riêng: actor/target khác nhau, thông tin hiện tại cập nhật nhưng event giữ nguyên, target thiếu/ID sai, paging và Admin account scope, non-account không nhận identity, quyền Member/Coach/Receptionist vẫn bị từ chối. Test host dùng FromAddress giả để không bị cấu hình SMTP máy ảnh hưởng; email sender của test không gửi email. Không dùng database dev cho các ca ghi dữ liệu.
- Build backend/frontend Docker sau thay đổi audit: đạt; các container đang chạy. Backend production build không có warning/error. Build test native có các cảnh báo đã tồn tại ở test khác và metadata NuGet NU1900 từ cache; không có test thất bại ở lần chạy cuối.

## Ảnh

- [Tổng quan — API thật, VI](admin-overview-live.png)
- [Tổng quan — mobile, fixture](admin-overview-mobile.png)
- [Detail G10 — API thật](admin-detail-g10-live.png)
- [Audit họ tên/email — API thật, VI](admin-audit-target-live.png)
- [Audit họ tên/email — mobile, fixture](admin-audit-target-mobile.png)

## Phạm vi

Frontend Admin, EN/VI, test, tiến độ KO-01 và phần bổ sung response audit backend đã được duyệt. Không đổi schema/migration, quyền truy cập hoặc finance. AuditLogView dùng chung vẫn giữ cách hiển thị entity khác và điều hướng đúng scope Manager. Chưa tự tạo commit.
