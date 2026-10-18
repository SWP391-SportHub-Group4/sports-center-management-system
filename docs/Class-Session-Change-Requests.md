# Yêu cầu vắng buổi học của Coach

Phần mở rộng được chủ sản phẩm xác nhận ngày 11/10/2026 và chốt lại ngày 18/10/2026, dùng chung cho lớp cầu lông và bóng rổ. Coach chỉ báo vắng một buổi kèm lý do hoặc rút báo vắng Pending; Center Manager quyết định phương án. Giữ nguyên quyền thay đổi lịch của Manager theo BR-14 và hủy kèm học bù theo BR-54.

**Quyết định cập nhật 18/10/2026:** yêu cầu đã gửi không được sửa. Coach chỉ gửi yêu cầu mới hoặc rút yêu cầu còn Pending. FE không có Edit pending request; backend đã gỡ PUT sửa và UpdateAsync. Giữ nguyên endpoint withdraw. Manager dùng API availability theo đúng giờ buổi/giờ mới, chỉ hiển thị HLV Active, đúng môn, rảnh toàn khoảng và khác HLV xin vắng khi dạy thay. Có loading/error/retry/empty; đổi giờ xóa lựa chọn cũ. excludeSessionId chỉ bỏ occupancy của đúng buổi Scheduled cùng môn; không bỏ lịch khác. Backend kiểm lại khi xác nhận, xung đột giữ Pending và tải lại danh sách.

## Giao diện

- Coach: **Schedule** → chọn buổi → **Request** → **Request absence**. Form chỉ có **Reason** (3–500 ký tự); Coach không chọn dạy thay, ngày dời hoặc lịch học bù. Manager quyết định phương án thực tế.
- Coach mở menu avatar/tên → **Requests** hoặc **Schedule** → buổi → **Request** để đọc lý do/kết quả. Khi Pending chỉ có **Withdraw request** → xác nhận rút; không sửa lý do, loại hoặc giờ đề xuất. Muốn gửi lý do khác: rút yêu cầu cũ rồi gửi yêu cầu mới nếu buổi vẫn đủ điều kiện gửi; hai bản ghi có ID/lịch sử riêng. Lịch sử các loại cũ giữ nguyên, không chuyển đổi khi xem/rút.
- Yêu cầu Absence chỉ được gửi khi buổi còn Scheduled, chưa bắt đầu, và trước giờ học ít nhất **6 tiếng**. Đúng mốc 6 tiếng được phép; dưới mốc frontend vô hiệu thao tác và API trả 409 `class_absence_deadline`. Coach vẫn được rút Pending; trường hợp khẩn cấp liên hệ Manager trực tiếp. Yêu cầu đã gửi đúng hạn vẫn được Manager xử lý sau mốc 6 tiếng nếu buổi chưa bắt đầu.
- **Yêu cầu đổi lịch của tôi** mở lịch sử ngay trong drawer; có thể rút yêu cầu Pending. Thông báo kết quả dẫn đến `/coach/change-requests`.
- Manager: **Lịch hoạt động → Yêu cầu đổi lịch lớp**. Lọc trạng thái/khóa/Coach, mở yêu cầu và chọn phương án thực tế hoặc từ chối. Coach dạy thay phải đang hoạt động và đúng chuyên môn.
- Manager dùng API availability theo đúng giờ buổi/giờ mới, chỉ hiển thị HLV Active, đúng môn, rảnh toàn khoảng và khác HLV xin vắng khi dạy thay. Có loading/error/retry/empty; đổi giờ xóa lựa chọn cũ. excludeSessionId chỉ bỏ occupancy của đúng buổi Scheduled cùng môn; không bỏ lịch khác. Backend kiểm lại khi xác nhận, xung đột giữ Pending và tải lại danh sách.
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

Create body của giao diện Coach: `{requestId,type:"ABSENCE",reason,proposedStartAtUtc:null,proposedEndAtUtc:null}`. `requestId` là UUID do client tạo và giữ khi retry; cùng UUID/nội dung trả bản cũ, nội dung khác trả 409. Absence không chấp nhận đề xuất giờ (`absence_proposal_not_allowed`). Lý do 3–500 ký tự. Các bản ghi `SUBSTITUTE`, `RESCHEDULE`, `CANCEL_WITH_MAKEUP` đã lưu trước đây vẫn đọc được để giữ lịch sử. Quy tắc mục tiêu trên develop chỉ cho tạo mới ABSENCE; backend hiện vẫn nhận các loại cũ từ client cũ với validation trước đây. Đây là khoảng trống riêng chưa được thay đổi trong lần merge này, không phải quyền sửa yêu cầu đã gửi.

Không có API cập nhật nội dung yêu cầu. `PUT /api/coaches/me/teaching/change-requests/{requestId}` đã bị gỡ; với URL hợp lệ trùng GET route, PUT nhận 405 Method Not Allowed. Rút vẫn dùng POST `.../{requestId}/withdraw`, kiểm owner và Pending trong transaction; không áp dụng hạn gửi 6 giờ cho rút. Nếu Manager đã xử lý trước, rút trả 409 `class_change_not_pending`, UI tải lại trạng thái mới. Gửi lại cùng requestId với nội dung khác vẫn bị chặn bởi idempotency, không phải cách sửa yêu cầu.

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
- Manager nhận thông báo khi Coach gửi yêu cầu mới; không còn sự kiện sửa Pending. Coach nhận thông báo/email kết quả hoặc tự đóng yêu cầu. Mọi thay đổi lịch từ command chung gửi chuông và email cho Coach chính, Coach cũ và Coach mới (khử trùng người nhận), gồm lịch trước/sau, lý do, thay đổi HLV/phòng khi có. Chuông dẫn tới Schedule. Học viên Confirmed tiếp tục nhận thông báo/email lịch. Không gửi email trực tiếp trong HTTP transaction.
- Sự cố có ảnh hưởng lớp vẫn yêu cầu Manager dời/hủy kèm bù trước khi chặn phòng theo flow Incident hiện tại; các thao tác đó đi qua cùng command và gửi đầy đủ thông báo, không tự ý hủy lớp trong IncidentService.

Lỗi chính: 403 `session_not_assigned`, 404 `class_change_not_found`, 409 `class_change_pending`, `class_change_not_pending`, `class_change_stale`, `session_not_editable`; lỗi chuyên môn/giờ mở cửa/xung đột kế thừa từ command lịch.
