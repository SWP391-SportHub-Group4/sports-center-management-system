# Yêu cầu vắng buổi học của Coach

Phần mở rộng được chủ sản phẩm xác nhận ngày 11/10/2026 và chốt lại ngày 18/10/2026, dùng chung cho lớp cầu lông và bóng rổ. Coach chỉ báo vắng một buổi kèm lý do hoặc rút báo vắng Pending; Center Manager quyết định phương án. Giữ nguyên quyền thay đổi lịch của Manager theo BR-14 và hủy kèm học bù theo BR-54.

## Giao diện

- Coach: **Schedule** → chọn buổi → **Request** → **Request absence**. Form chỉ có **Reason** (3–500 ký tự); Coach không chọn dạy thay, ngày dời hoặc lịch học bù. Manager quyết định phương án thực tế.
- Coach mở menu avatar/tên → **Requests** hoặc mục Request của buổi học để xem trạng thái và rút báo vắng Pending. Không có nút sửa; muốn thay đổi lý do thì liên hệ Manager trực tiếp. Yêu cầu loại cũ vẫn hiển thị đúng nội dung đã lưu nhưng không được sửa hoặc gửi mới.
- Yêu cầu Absence chỉ được gửi khi buổi còn Scheduled, chưa bắt đầu, và trước giờ học ít nhất **6 tiếng**. Đúng mốc 6 tiếng được phép; dưới mốc frontend vô hiệu thao tác và API trả 409 `class_absence_deadline`. Coach vẫn được rút Pending; trường hợp khẩn cấp liên hệ Manager trực tiếp. Yêu cầu đã gửi đúng hạn vẫn được Manager xử lý sau mốc 6 tiếng nếu buổi chưa bắt đầu.
- **Yêu cầu đổi lịch của tôi** mở lịch sử ngay trong drawer; có thể rút yêu cầu Pending. Thông báo kết quả dẫn đến `/coach/change-requests`.
- Manager: **Lịch hoạt động → Yêu cầu đổi lịch lớp**. Lọc trạng thái/khóa/Coach, mở yêu cầu và chọn phương án thực tế hoặc từ chối. Danh sách HLV dạy thay chỉ hiển thị Coach đang hoạt động, đúng chuyên môn và rảnh toàn bộ khung giờ; backend kiểm tra lại khi lưu.
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

Create body: `{requestId,type:"ABSENCE",reason,proposedStartAtUtc:null,proposedEndAtUtc:null}`. `requestId` là UUID do client tạo và giữ khi retry; cùng UUID/nội dung trả bản cũ, nội dung khác trả 409. Absence không chấp nhận đề xuất giờ (`absence_proposal_not_allowed`). Lý do 3–500 ký tự. API chỉ nhận `ABSENCE` cho yêu cầu mới; các bản ghi `SUBSTITUTE`, `RESCHEDULE`, `CANCEL_WITH_MAKEUP` đã lưu trước đây vẫn đọc được để giữ lịch sử.

`PUT /api/coaches/me/teaching/change-requests/{requestId}` và thao tác sửa Pending còn trong code cũ là khoảng trống Khôi đang gỡ; chúng không thuộc hợp đồng mục tiêu. Thay đổi trạng thái do rút, Manager duyệt/từ chối hoặc cập nhật lịch trực tiếp vẫn khóa và ghi audit trong transaction.

Resolve body: `{type,reviewNote,startAtUtc?,roomId?,coachId?}`. Manager bắt buộc chọn `SUBSTITUTE`, `RESCHEDULE` hoặc `CANCEL_WITH_MAKEUP` (không chấp nhận Absence làm phương án xử lý). Yêu cầu Absence mở với **Select a resolution**, không tự chọn thay Manager. Dạy thay bắt buộc Coach mới và giữ giờ/sân; dời/học bù bắt buộc giờ mới. Thời lượng giữ nguyên; buổi bù nằm sau buổi cuối còn hiệu lực theo command lịch hiện tại. Reject body: `{reviewNote}`. ReviewNote 3–500 ký tự.

## Dữ liệu và transaction

Migration `20261011025932_AddClassSessionChangeRequests` tạo `class_session_change_requests`. Lưu lý do, đề xuất, snapshot thời gian/phòng ban đầu, Coach gửi, người xử lý, phản hồi, phương án thực tế và ID buổi kết quả.

Migration `20261017090000_AddCoachAbsenceRequests` mở rộng constraint loại yêu cầu cho Absence, chặn giờ đề xuất đối với Absence; không sửa hoặc xóa lịch sử. Down bị chặn nếu đã có yêu cầu Absence để tránh biến yêu cầu vắng thành một đề xuất nghiệp vụ khác.

### Kết quả xử lý hiển thị cho Coach và Manager

- Trang Requests và mục Request trong buổi học dùng chung **Request outcome**: Pending hiển thị Awaiting Manager review; Approved nêu Substitute assigned / Session rescheduled / Cancelled · makeup scheduled; Rejected và Coach rút yêu cầu có nội dung riêng, không hiển thị như đã duyệt.
- Manager đổi lịch trực tiếp: request vẫn là WITHDRAWN/SCHEDULE_UPDATED trong API nhưng nhãn UI là **Closed**. Phần kết quả nêu cụ thể thao tác đã thực hiện, không gọi đây là Coach tự rút hoặc Manager approve request.
- Migration `20261017100000_AddClassRequestOutcomeSnapshots` thêm `outcome_snapshot_json`. Lưu phương án, lịch sau xử lý, Coach, sân/phòng, người xử lý và lý do trong cùng transaction với lịch/request. Các lần thay đổi lịch sau không viết lại kết quả này. Hủy toàn khóa có phương án `COURSE_CANCELLED`; đổi riêng phòng có `ROOM_CHANGED`.
- API trả object `outcome` đã giải mã, không trả chuỗi snapshot nội bộ. `source=DECISION` là kết quả tại thời điểm xử lý. Yêu cầu cũ chưa có snapshot trả thông tin buổi được liên kết hiện tại với `source=CURRENT_SCHEDULE`, có cảnh báo có thể đã đổi sau đó; không suy đoán hay ghi đè lịch sử cũ. Chỉ lộ thông tin lịch/Coach/phòng trong yêu cầu được phép xem, không cấp thêm quyền xem roster/hồ sơ học viên.

- Partial unique index bảo đảm một Pending cho mỗi buổi.
- Mọi mutation khóa theo thứ tự schedule → class → session → request. Manager không xử lý hai lần; thao tác trên yêu cầu đã kết thúc trả 409.
- Khi Manager đổi giờ/phòng/Coach trực tiếp, hủy kèm bù hoặc hủy toàn khóa thành công, các Pending liên quan tự đóng: `WITHDRAWN` (UI: Cancel), `resolutionType=SCHEDULE_UPDATED`, lưu Manager/thời điểm/buổi kết quả và lý do “Closed automatically — schedule updated by Manager.” Không xem đây là Approved. Trạng thái đóng, audit và outbox cùng transaction với lịch. Yêu cầu đang được duyệt trong luồng Resolve giữ `RESOLVED`; lịch xung đột rollback và giữ Pending. Snapshot stale vẫn là chốt chặn cho dữ liệu cũ.
- Resolve gọi lại `ClassSessionService.RescheduleAsync` hoặc `CancelWithMakeupAsync` trong transaction hiện có. Trạng thái yêu cầu, lịch, occupancy, audit và outbox cùng commit. Xung đột rollback toàn bộ; yêu cầu vẫn Pending.
- Ghi danh không đổi, không phát sinh hoàn tiền khi chỉ dời/hủy một buổi có bù. Hủy toàn khóa vẫn dùng quy trình riêng.
- Manager nhận thông báo khi Coach gửi báo vắng. Coach nhận thông báo/email kết quả hoặc khi Manager tự đóng yêu cầu bằng thay đổi lịch. Mọi thay đổi lịch từ command chung gửi chuông và email cho Coach chính, Coach cũ và Coach mới (khử trùng người nhận), gồm lịch trước/sau, lý do, thay đổi HLV/phòng khi có. Chuông dẫn tới Teaching schedule. Học viên Confirmed tiếp tục nhận thông báo/email lịch. Không gửi email trực tiếp trong HTTP transaction.
- Sự cố có ảnh hưởng lớp vẫn yêu cầu Manager dời/hủy kèm bù trước khi chặn phòng theo flow Incident hiện tại; các thao tác đó đi qua cùng command và gửi đầy đủ thông báo, không tự ý hủy lớp trong IncidentService.

Lỗi chính: 403 `session_not_assigned`, 404 `class_change_not_found`, 409 `class_change_pending`, `class_change_not_pending`, `class_change_stale`, `session_not_editable`; lỗi chuyên môn/giờ mở cửa/xung đột kế thừa từ command lịch.
