# Yêu cầu vắng buổi học của Coach

Phần mở rộng được chủ sản phẩm xác nhận ngày 11/10/2026, dùng chung cho lớp cầu lông và bóng rổ. Coach gửi đề xuất, Center Manager quyết định. Giữ nguyên quyền thay đổi lịch của Manager theo BR-14 và hủy kèm học bù theo BR-54.

**Đối chiếu 18/10/2026 — commit `08728587`:** Coach hiện được gửi, sửa và rút Pending; quy tắc “chỉ được rút” chưa được áp dụng. Dropdown HLV của Manager chưa lọc lịch trống, dù API availability đã có và backend kiểm tra xung đột khi xác nhận. Đây là mô tả hiện trạng, không xác nhận bản deploy hoặc kết quả nghiệm thu. Xem [quyền nội dung lớp/buổi](Coach-Teaching-Workspace.md).

## Giao diện

- Coach: **Schedule** → chọn buổi → **Request** → **Request absence**. Form chỉ có **Reason** (3–500 ký tự); Coach không chọn dạy thay, ngày dời hoặc lịch học bù. Manager quyết định phương án thực tế.
- Coach sửa tại menu avatar/tên → **Requests** → chọn Pending → **Edit pending request**, hoặc ngay trong buổi học. Nhấn **Save changes** cập nhật cùng requestId, giữ Pending và snapshot buổi gốc. Yêu cầu cũ vẫn hiển thị đúng loại và đề xuất đã lưu; nếu sửa bằng giao diện mới, form báo rõ sẽ chuyển thành Absence, chỉ gửi lý do và xóa đề xuất giờ. Các yêu cầu đã xử lý không bị chuyển đổi. Khi Manager đã đổi lịch hoặc đóng request trong lúc form mở, lần lưu tiếp theo bị chặn và tải trạng thái mới.
- Yêu cầu Absence chỉ được gửi/sửa khi buổi còn Scheduled, chưa bắt đầu, và trước giờ học ít nhất **6 tiếng**. Đúng mốc 6 tiếng được phép; dưới mốc frontend vô hiệu thao tác và API trả 409 `class_absence_deadline`. Coach vẫn được rút Pending; trường hợp khẩn cấp liên hệ Manager trực tiếp. Yêu cầu đã gửi đúng hạn vẫn được Manager xử lý sau mốc 6 tiếng nếu buổi chưa bắt đầu.
- **Yêu cầu đổi lịch của tôi** mở lịch sử ngay trong drawer; có thể rút yêu cầu Pending. Thông báo kết quả dẫn đến `/coach/change-requests`.
- Manager: **Lịch hoạt động → Yêu cầu đổi lịch lớp**. Lọc trạng thái/khóa/Coach, mở yêu cầu và chọn phương án thực tế hoặc từ chối. Coach dạy thay phải đang hoạt động và đúng chuyên môn.
- `Assigned coach` hiện gọi `GET /api/manager/coaches?sportId=...`, phân trang rồi lọc Active và loại Coach xin vắng. Người đang bận vẫn có thể xuất hiện. API `GET /api/availability/coaches?sportId=...&startUtc=...&endUtc=...` đã có nhưng chưa được dùng ở dropdown này. Backend kiểm tra lại quyền, chuyên môn và lịch tại thời điểm xác nhận; trùng lịch thì rollback, giữ Pending. Việc dùng availability để chỉ hiển thị người rảnh là đề xuất chưa triển khai, không phải điều kiện Pass của dropdown hiện tại.
- Gửi yêu cầu không thay đổi lịch. Nếu sát giờ dạy, Coach liên hệ Manager trực tiếp để báo gấp. Chỉ buổi Scheduled chưa bắt đầu của khóa đang hoạt động được gửi và xử lý đổi lịch; yêu cầu cũ vẫn có thể rút/từ chối.

## API

| Method | Route | Quyền |
|---|---|---|
| POST | `/api/coaches/me/teaching/sessions/{sessionId}/change-requests` | Coach được phân công |
| GET | `/api/coaches/me/teaching/change-requests?status&sessionId&classId&page` | Coach, chỉ yêu cầu của mình |
| GET | `/api/coaches/me/teaching/change-requests/{requestId}` | Coach sở hữu |
| POST | `/api/coaches/me/teaching/change-requests/{requestId}/withdraw` | Coach sở hữu, Pending |
| PUT | `/api/coaches/me/teaching/change-requests/{requestId}` | Coach sở hữu và đang được phân công buổi, Pending, buổi Scheduled của khóa hoạt động; ABSENCE còn ít nhất 6 giờ trước start |
| GET | `/api/manager/class-session-change-requests?status&classId&coachId&page` | CenterManager |
| GET | `/api/manager/class-session-change-requests/filters` | CenterManager; tên các khóa/Coach có yêu cầu |
| GET | `/api/manager/class-session-change-requests/{requestId}` | CenterManager |
| POST | `/api/manager/class-session-change-requests/{requestId}/resolve` | CenterManager |
| POST | `/api/manager/class-session-change-requests/{requestId}/reject` | CenterManager |

Danh sách trả `{items,page,pageSize:50,totalCount}`. Trạng thái wire: `PENDING`, `RESOLVED`, `REJECTED`, `WITHDRAWN`.

Create body của giao diện mới: `{requestId,type:"ABSENCE",reason,proposedStartAtUtc:null,proposedEndAtUtc:null}`. `requestId` là UUID do client tạo và giữ khi retry; cùng UUID/nội dung trả bản cũ, nội dung khác trả 409. Absence không chấp nhận đề xuất giờ (`absence_proposal_not_allowed`). Lý do 3–500 ký tự. Các loại cũ `SUBSTITUTE`, `RESCHEDULE`, `CANCEL_WITH_MAKEUP` vẫn được API hỗ trợ để tương thích client cũ, với validation cũ (hủy phải trước 6 giờ); giao diện Coach mới không tạo các loại này.

Update dùng cùng body, `requestId` phải khớp URL. Giao diện mới gửi Absence và lý do, không đề xuất giờ; giữ nguyên trạng thái Pending, người gửi, thời điểm tạo và snapshot buổi học. Cập nhật khóa cùng thứ tự với duyệt, ghi audit và thông báo cho Manager trong transaction; yêu cầu đã được duyệt/từ chối/rút trả 409.

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
- Khi Manager đổi giờ/phòng/Coach trực tiếp, hủy kèm bù hoặc hủy toàn khóa thành công, các Pending liên quan tự đóng: `WITHDRAWN` (UI: Closed khi `resolutionType=SCHEDULE_UPDATED`; Coach chủ động rút dùng Cancel), lưu Manager/thời điểm/buổi kết quả và lý do “Closed automatically — schedule updated by Manager.” Không xem đây là Approved. Trạng thái đóng, audit và outbox cùng transaction với lịch. Yêu cầu đang được duyệt trong luồng Resolve giữ `RESOLVED`; lịch xung đột rollback và giữ Pending. Snapshot stale vẫn là chốt chặn cho dữ liệu cũ.
- Resolve gọi lại `ClassSessionService.RescheduleAsync` hoặc `CancelWithMakeupAsync` trong transaction hiện có. Trạng thái yêu cầu, lịch, occupancy, audit và outbox cùng commit. Xung đột rollback toàn bộ; yêu cầu vẫn Pending.
- Ghi danh không đổi, không phát sinh hoàn tiền khi chỉ dời/hủy một buổi có bù. Hủy toàn khóa vẫn dùng quy trình riêng.
- Manager nhận thông báo khi gửi và mỗi lần sửa Pending; mỗi lần sửa là một event riêng để không vi phạm unique key outbox. Coach nhận thông báo/email kết quả hoặc tự đóng yêu cầu. Mọi thay đổi lịch từ command chung gửi chuông và email cho Coach chính, Coach cũ và Coach mới (khử trùng người nhận), gồm lịch trước/sau, lý do, thay đổi HLV/phòng khi có. Chuông dẫn tới Schedule. Học viên Confirmed tiếp tục nhận thông báo/email lịch. Không gửi email trực tiếp trong HTTP transaction.
- Sự cố có ảnh hưởng lớp vẫn yêu cầu Manager dời/hủy kèm bù trước khi chặn phòng theo flow Incident hiện tại; các thao tác đó đi qua cùng command và gửi đầy đủ thông báo, không tự ý hủy lớp trong IncidentService.

Lỗi chính: 403 `session_not_assigned`, 404 `class_change_not_found`, 409 `class_change_pending`, `class_change_not_pending`, `class_change_stale`, `session_not_editable`; lỗi chuyên môn/giờ mở cửa/xung đột kế thừa từ command lịch.
