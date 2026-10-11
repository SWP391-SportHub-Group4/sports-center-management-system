# Yêu cầu thay đổi buổi học lớp nhóm

Phần mở rộng được chủ sản phẩm xác nhận ngày 11/10/2026, dùng chung cho lớp cầu lông và bóng rổ. Coach gửi đề xuất, Center Manager quyết định. Giữ nguyên quyền thay đổi lịch của Manager theo BR-14 và hủy kèm học bù theo BR-54.

## Giao diện

- Coach: Lịch dạy → chọn buổi → tab **Đổi lịch** → **Yêu cầu thay đổi**. Chọn dạy thay, dời lịch hoặc hủy và học bù; nhập lý do, có thể đề xuất thời gian. Giờ nhập theo Việt Nam, API dùng UTC.
- **Yêu cầu đổi lịch của tôi** mở lịch sử ngay trong drawer; có thể rút yêu cầu Pending. Thông báo kết quả dẫn đến `/coach/schedule?changes=1`.
- Manager: **Lịch hoạt động → Yêu cầu đổi lịch lớp**. Lọc trạng thái/khóa/Coach, mở yêu cầu và chọn phương án thực tế hoặc từ chối. Coach dạy thay phải đang hoạt động và đúng chuyên môn.
- Gửi yêu cầu không thay đổi lịch. Nếu sát giờ dạy, Coach liên hệ Manager trực tiếp để báo gấp. Chỉ buổi Scheduled chưa bắt đầu của khóa đang hoạt động được gửi và xử lý đổi lịch; yêu cầu cũ vẫn có thể rút/từ chối.

## API

| Method | Route | Quyền |
|---|---|---|
| POST | `/api/coaches/me/teaching/sessions/{sessionId}/change-requests` | Coach được phân công |
| GET | `/api/coaches/me/teaching/change-requests?status&sessionId&classId&page` | Coach, chỉ yêu cầu của mình |
| GET | `/api/coaches/me/teaching/change-requests/{requestId}` | Coach sở hữu |
| POST | `/api/coaches/me/teaching/change-requests/{requestId}/withdraw` | Coach sở hữu, Pending |
| GET | `/api/manager/class-session-change-requests?status&classId&coachId&page` | CenterManager |
| GET | `/api/manager/class-session-change-requests/filters` | CenterManager; tên các khóa/Coach có yêu cầu |
| GET | `/api/manager/class-session-change-requests/{requestId}` | CenterManager |
| POST | `/api/manager/class-session-change-requests/{requestId}/resolve` | CenterManager |
| POST | `/api/manager/class-session-change-requests/{requestId}/reject` | CenterManager |

Danh sách trả `{items,page,pageSize:50,totalCount}`. Trạng thái wire: `PENDING`, `RESOLVED`, `REJECTED`, `WITHDRAWN`.

Create body: `{requestId,type,reason,proposedStartAtUtc?,proposedEndAtUtc?}`. `requestId` là UUID do client tạo và giữ khi retry; cùng UUID/nội dung trả bản cũ, nội dung khác trả 409. `type` là `SUBSTITUTE`, `RESCHEDULE` hoặc `CANCEL_WITH_MAKEUP`. Lý do 3–500 ký tự. Giờ đề xuất tùy chọn; nếu có phải cung cấp cả start/end ở tương lai và giữ nguyên thời lượng. Dạy thay không đề xuất đổi giờ.

Resolve body: `{type,reviewNote,startAtUtc?,roomId?,coachId?}`. Manager có thể chọn phương án khác đề xuất. Dạy thay bắt buộc Coach mới và giữ giờ/sân; dời/học bù bắt buộc giờ mới. Thời lượng giữ nguyên; buổi bù nằm sau buổi cuối còn hiệu lực theo command lịch hiện tại. Reject body: `{reviewNote}`. ReviewNote 3–500 ký tự.

## Dữ liệu và transaction

Migration `20261011025932_AddClassSessionChangeRequests` tạo `class_session_change_requests`. Lưu lý do, đề xuất, snapshot thời gian/phòng ban đầu, Coach gửi, người xử lý, phản hồi, phương án thực tế và ID buổi kết quả.

- Partial unique index bảo đảm một Pending cho mỗi buổi.
- Mọi mutation khóa theo thứ tự schedule → class → session → request. Manager không xử lý hai lần; thao tác trên yêu cầu đã kết thúc trả 409.
- Nếu giờ/phòng/Coach đã thay đổi độc lập sau khi gửi, resolve trả `class_change_stale`; Manager từ chối yêu cầu cũ rồi xem lại lịch.
- Resolve gọi lại `ClassSessionService.RescheduleAsync` hoặc `CancelWithMakeupAsync` trong transaction hiện có. Trạng thái yêu cầu, lịch, occupancy, audit và outbox cùng commit. Xung đột rollback toàn bộ; yêu cầu vẫn Pending.
- Ghi danh không đổi, không phát sinh hoàn tiền khi chỉ dời/hủy một buổi có bù. Hủy toàn khóa vẫn dùng quy trình riêng.
- Manager nhận thông báo khi gửi; Coach nhận thông báo/email kết quả; Coach dạy thay nhận phân công. Học viên nhận thông báo/email lịch từ command lịch hiện có. Không gửi email trực tiếp trong HTTP transaction.

Lỗi chính: 403 `session_not_assigned`, 404 `class_change_not_found`, 409 `class_change_pending`, `class_change_not_pending`, `class_change_stale`, `session_not_editable`; lỗi chuyên môn/giờ mở cửa/xung đột kế thừa từ command lịch.
