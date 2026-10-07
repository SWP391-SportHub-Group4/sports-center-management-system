# Manager Audit log — thông tin thay đổi Membership

Phản hồi: đổi giá gói nhưng cột thông tin chỉ hiện isActive: true trước/sau.

API thật của gói Test (ID 6) đã ghi oldValue.price = 100000, newValue.price = 200000; isActive và durationDays không thay đổi. Bộ lọc frontend cũ bỏ qua price/name/durationDays.

Đã thêm trình bày riêng cho MembershipPackage:
- Tên gói làm ngữ cảnh.
- Khi cập nhật, chỉ hiện trường thay đổi với giá trị trước → sau.
- Giá định dạng VND, thời hạn có đơn vị ngày, trạng thái dịch sang VI/EN.
- Khi tạo, hiện tên/giá/thời hạn/trạng thái được ghi nhận.
- Dùng snapshot của log, không truy vấn giá hoặc tên hiện tại để dựng lại lịch sử.
- Allowlist theo entity và kiểu dữ liệu: name, price, durationDays, sessionLimit, isActive. Không hiện raw JSON, trường bí mật/nested object hoặc giá cũ suy đoán.
- Metadata thiếu/sai định dạng có thông báo; dữ liệu cũ đã chứa giá sẽ hiển thị đúng sau reload.

Sửa CSS giới hạn trong AuditLogView để bảng responsive không bị min-width 640px của operations workspace ép tràn ngang trên mobile.

Kiểm chứng: TypeScript/ESLint/check:i18n và production Docker build đạt; **19/19 Playwright đạt** (6 ca Membership Audit, 4 ca Admin audit target, 9 ca Admin tables). Có kiểm tra live log giá cũ bằng Manager chỉ đọc, refresh, EN/VI, desktop 1440px và mobile 390/320px. Các kiểm tra redaction, scope và lọc/sort/phân trang Admin vẫn đạt.

Ảnh: manager-membership-audit-live.png và manager-membership-audit-mobile.png. Docker frontend đã cập nhật tại http://localhost:3000/manager/audit-log.

Phạm vi dữ liệu hiển thị là các trường có trong snapshot hiện hữu. Không sửa backend, dữ liệu audit đã lưu, policy hoặc migration. Chưa commit.
