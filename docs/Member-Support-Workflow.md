# Quy trình hỗ trợ Member

Phạm vi hạng 5 ngày 18/10/2026: nối luồng hỗ trợ đã có vào workspace Manager, dùng chung với Receptionist. Business Rules FR-22 là căn cứ nghiệp vụ; đoạn SRS cũ yêu cầu loại Support Request khỏi phạm vi đã lỗi thời và không áp dụng cho triển khai này.

## Quyền và chuyển trạng thái

- Receptionist và CenterManager (FrontDesk) được ghi nhận, xem, phân công/chuyển, cập nhật và đóng mọi yêu cầu. Không giới hạn thao tác theo người được giao, đúng FR-22.
- Chỉ giao cho Receptionist/CenterManager đang Active. Giữ tên người phụ trách cũ trong kết quả đọc kể cả khi tài khoản không còn Active; có thể chuyển cho nhân sự còn hoạt động.
- Tạo mới ở OPEN; phân công/chuyển sang ASSIGNED; cập nhật tiến độ sang IN_PROGRESS. Phải phân công trước khi cập nhật hoặc đóng. Có thể đóng trực tiếp từ ASSIGNED.
- Đóng chuyển CLOSED, lưu kết quả vào ProgressNote và thời gian ClosedAt/UpdatedAt. Assign/progress sau đóng trả 409; gọi close lại trả 200 cùng kết quả đã đóng, không đổi kết quả hay ghi thêm audit.
- Các mutation khóa dòng bằng FOR UPDATE. Create/assign/progress/close ghi audit cùng lần lưu dữ liệu. Audit lưu người thao tác và nội dung tiến độ/kết quả; không có API mở lại yêu cầu.
- ProgressNote chứa cập nhật mới nhất, kết quả đóng thay thế ghi chú đó. Các lần xử lý trước giữ trong AuditLog; màn hỗ trợ không hiển thị timeline riêng. Không bổ sung bảng lịch sử mới.
- Member, Coach, Admin không được dùng API FrontDesk. Member chưa có API tự gửi yêu cầu; nhân sự ghi nhận thay.

## Giao diện và API

Manager vào Operations → Support requests (`/manager/support`); Receptionist vào `/receptionist/support`. Cả hai mở đúng hồ sơ Member trong workspace của mình. Nút Record a request dẫn tới danh sách Member; mở hồ sơ và dùng mục Member support để ghi nhận.

`GET /api/member-support-requests/queue` nhận `status`, `search` (tối đa 200 ký tự, tìm chuỗi không phân biệt hoa thường trong subject/description/tên/email Member), `assignedToUserId`, `page`, `pageSize` (1–100). Kết quả phân trang, mới cập nhật trước, phá hòa theo requestId. Các bộ lọc kết hợp AND. Apply filters về trang 1; Refresh tải lại danh sách và nhân sự. Có trạng thái rỗng, lỗi và Retry.

Response đọc bổ sung `memberName`, `memberEmail`, `assignedToName` (hồ sơ hiện tại, không phải snapshot). Giữ nguyên field và routes cũ; không cần migration mới. `GET ?memberId` vẫn trả tối đa 50 yêu cầu gần nhất. `GET assignees` chỉ trả nhân sự đang Active. Request mutation giữ nguyên contract cũ, giao diện tải lại kết quả đọc sau thành công.

## Kiểm thử và nghiệm thu

- Backend: `ReceptionistSupportWorkflowTests`: hai vai trò FrontDesk xử lý yêu cầu giao cho người khác; ba vai trò bị cấm; lọc/tìm/phân trang; nhân sự Banned/Deactivated; yêu cầu chưa giao/đã đóng; chuyển người; audit; close lặp và close/progress đồng thời.
- UI: `manager-support.spec.ts` kiểm tra xử lý đủ luồng, ghi nhận trong hồ sơ, đúng liên kết Manager, bộ lọc/phân trang, Retry/rỗng, conflict giữ ghi chú, chặn Member, mobile và accessibility. Test `desk assigns` trong `receptionist-completion.spec.ts` kiểm tra luồng Lễ tân dùng chung.
- UI tests dùng API mô phỏng; backend tests dùng PostgreSQL riêng. Không gửi yêu cầu thử vào dữ liệu vận hành.
- Docker local: `docker compose up -d --build backend frontend`, giữ named volumes. Sau cập nhật, Ctrl+F5 rồi mở `/manager/support` với tài khoản Manager. Không có yêu cầu đang lưu thì danh sách rỗng là đúng.

Điểm đồng bộ tài liệu Word: FR-22 trong Business Rules đã đúng. Trong SRS, thay đoạn “Do not keep the Support Request within the current scope…” bằng phạm vi FrontDesk tại tài liệu này khi xuất bản SRS tiếp theo; bản Word gốc được giữ nguyên trong đợt thay đổi code này.
