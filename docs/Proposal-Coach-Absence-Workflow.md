# Proposal cải tiến quy trình yêu cầu vắng của Coach

**Ngày:** 17/10/2026
**Trạng thái:** Phạm vi đã chốt ngày 18/10/2026; xem [Source of Truth](00-Source-of-Truth.md). Các mục còn thiếu trong code thuộc phần Khôi đang xử lý.
**Phạm vi:** Coach cầu lông, Coach bóng rổ và Center Manager.

## 1. Đề xuất của tôi

Tôi đề xuất Coach chỉ gửi **yêu cầu vắng một buổi học** và lý do. Center Manager quyết định phân công người dạy thay, dời lịch, hủy kèm học bù hoặc từ chối. Khi chọn người dạy thay, hệ thống chỉ cho chọn Coach đang hoạt động, đúng chuyên môn và còn trống trong toàn bộ khung giờ của buổi học.

Mục tiêu là giảm thao tác cho Coach, giúp Manager chọn được phương án thực hiện được và cho phép cả hai bên theo dõi rõ kết quả xử lý.

## 2. Hiện trạng và phần cần bổ sung

Cập nhật theo quyết định người dùng ngày 18/10/2026: Coach không được sửa yêu cầu đã gửi, chỉ được rút Pending. Quy tắc này và bộ lọc lịch trống đã được triển khai trên nhánh `feat/member-coach-workflows`; không xác nhận bản deploy đã cập nhật.

| Nội dung | Hiện trạng |
|---|---|
| Coach gửi Request absence, chỉ nhập Reason | Đã có trong code local |
| Gửi Absence trước buổi ít nhất 6 giờ; chỉ rút Pending, không sửa | Đã có trong code local |
| Manager chọn cách xử lý và xác nhận | Đã có trong code local |
| Hiển thị Request outcome và lưu kết quả tại thời điểm xử lý | Đã có trong code local; cần migration tương ứng |
| Coach selector lọc đúng môn, Active, khác Coach xin vắng và rảnh toàn khoảng | Đã có |
| Coach selector lọc thêm lịch trống trước khi lựa chọn | Đã tích hợp theo giờ gốc/giờ mới; backend vẫn kiểm lại khi lưu |
| Khóa transaction và kiểm tra Pending khi ghi | Đã có |
| Nội dung yêu cầu sau khi gửi | Bất biến; không còn nhánh Coach sửa khi Manager đang duyệt |
| Chặn tạo request đề xuất phương án từ client cũ | Quy tắc mục tiêu trên develop; backend còn nhận loại cũ để tương thích, chưa thay đổi trong lần merge này |

## 3. Luồng của Coach

1. Vào **Schedule**, chọn buổi học và mở **Request**.
2. Nhấn **Request absence**.
3. Nhập **Reason**, từ 3 đến 500 ký tự.
4. Nhấn **Send request**.
5. Yêu cầu có trạng thái **Pending**; lịch được phân công vẫn có hiệu lực khi chưa có quyết định.
6. Theo dõi tại menu avatar/tên → **Requests** hoặc trong chi tiết buổi học.

Coach không phải chọn người dạy thay hoặc đề xuất lịch bù. Coach chỉ được **Withdraw request** khi yêu cầu còn Pending, không có Edit pending request. Nếu rút rồi gửi lý do mới, hệ thống tạo yêu cầu mới khi còn đủ điều kiện, giữ nguyên lịch sử bản cũ.

Gửi Absence mới phải trước giờ bắt đầu ít nhất **6 giờ**, tính theo thời gian server. Đúng mốc 6 giờ được phép. Yêu cầu đã gửi không được sửa; rút chỉ cần Pending, không áp hạn gửi 6 giờ. Trường hợp dưới 6 giờ, giao diện hướng dẫn liên hệ Manager trực tiếp; Manager xử lý lịch theo quyền hiện có. Mốc này không buộc Manager phải quyết định trước 6 giờ: yêu cầu đã gửi đúng hạn vẫn có thể được xử lý khi buổi chưa bắt đầu và còn hợp lệ.

## 4. Luồng của Center Manager

1. Vào **Activity calendar → Class change requests**.
2. Mở yêu cầu Pending, xem buổi học, Coach và lý do đã gửi.
3. Chọn **Decision**:

| Lựa chọn | Kết quả |
|---|---|
| Substitute coach | Giữ thời gian của buổi, phân công Coach khác phù hợp và còn trống |
| Reschedule | Dời chính buổi học sang thời gian mới, kiểm tra lại Coach, sân và lịch học viên |
| Cancel & makeup | Hủy buổi cũ và tạo buổi bù hợp lệ để bảo đảm đủ số buổi |
| Reject request | Từ chối yêu cầu; quyết định này không làm thay đổi lịch được phân công |

4. Nhập các thông tin cần thiết và **Decision reason / feedback to Coach**.
5. Nhấn **Confirm decision**.
6. Hệ thống kiểm tra lại trạng thái Pending, quyền và tài nguyên; cập nhật lịch, request, audit và hàng đợi thông báo trong cùng transaction.

## 5. Lọc Coach dạy thay theo lịch trống — đã tích hợp local

### 5.1. Điều kiện xuất hiện trong danh sách

Khi Manager chọn **Substitute coach**, danh sách **Assigned coach** chỉ bao gồm người đáp ứng đồng thời:

- Là tài khoản Coach đang **Active**.
- Có chuyên môn đúng môn của lớp.
- Khác Coach đang xin vắng.
- Không có hoạt động chiếm lịch chồng với bất kỳ phần nào của khoảng bắt đầu–kết thúc buổi học, bất kể sân/phòng.

Kiểm tra lịch dựa trên dữ liệu occupancy của backend. Hai buổi liền kề được phép nếu buổi trước kết thúc đúng lúc buổi sau bắt đầu; các ràng buộc khác của hệ thống vẫn áp dụng.

### 5.2. Cách thể hiện trên giao diện

| Tình huống | Hành vi đề xuất |
|---|---|
| Đang kiểm tra | Khóa selector; hiện Checking available coaches… |
| Có người phù hợp | Chỉ cho chọn trong danh sách Coach còn trống |
| Không có người phù hợp | Hiện No available coaches for this session. Gợi ý chọn Reschedule hoặc Cancel & makeup; không cho xác nhận Substitute coach |
| Không tải được lịch trống | Hiện lỗi và Retry; khóa xác nhận, không thay bằng danh sách tất cả Coach |
| Manager đổi khung giờ | Xóa lựa chọn Coach cũ và tải lại danh sách theo khung giờ mới |
| Coach vừa được phân công việc khác | Backend từ chối vì trùng lịch; giữ request Pending, tải lại danh sách và yêu cầu chọn lại |

Giờ hiển thị theo Việt Nam; tham số API dùng UTC. Thời lượng giữ nguyên theo buổi gốc. Phản hồi của lần kiểm tra khung giờ cũ không được ghi đè danh sách của khung giờ mới.

### 5.3. Tận dụng API hiện có

Hệ thống đã có:

```text
GET /api/availability/coaches?sportId=...&startUtc=...&endUtc=...
```

API trả danh sách Coach Active, đúng môn và không có occupancy chồng khung giờ. Màn chọn dạy thay đã dùng API này, kết hợp loại Coach xin vắng khỏi kết quả, thay cách lấy toàn bộ Coach của môn.

Với **Reschedule** hoặc **Cancel & makeup**, lịch trống cần được tính theo thời gian mới. Khi dời một buổi và giữ Coach hiện tại, cần hỗ trợ loại chính occupancy của buổi đang sửa khỏi phép kiểm tra; API danh sách Coach còn trống đã nhận `excludeSessionId`, kiểm đúng buổi Scheduled/cùng môn và chỉ loại occupancy của nguồn đó, không loại lịch khác. Màn xử lý đã dùng chung cho dạy thay, dời và học bù.

Danh sách Coach còn trống là gợi ý tại thời điểm tải. Khi xác nhận, backend vẫn phải kiểm tra lại và giữ ràng buộc chống trùng ở DB.

## 6. Xử lý thao tác đồng thời

Nội dung yêu cầu đã gửi bất biến; không còn trường hợp Coach sửa lý do trong lúc Manager đọc. Các thao tác rút/duyệt/từ chối và đổi lịch trực tiếp khóa dữ liệu, kiểm Pending lại trong transaction. Không khóa request suốt thời gian form mở.

| Thao tác hoàn tất trước | Thao tác đến sau |
|---|---|
| Manager duyệt/từ chối | Coach rút bị chặn 409 class_change_not_pending; tải lại kết quả |
| Coach rút | Manager không duyệt lại được; tải lại trạng thái |
| Manager đổi lịch trực tiếp | Request tự đóng; xác nhận rút/duyệt cũ bị chặn |
| Thay đổi lịch bị xung đột | Transaction rollback, lịch và Pending giữ nguyên |

Quy tắc này không thêm Version vào hợp đồng request. Nếu sau này cần optimistic concurrency cho phương án Manager, đó là thay đổi riêng; không mô tả Version như tính năng hiện có.

## 7. Nội dung kết quả xử lý

Trang **Requests**, phần **Request** của buổi học và màn Manager phải dùng nội dung nhất quán.

| Trạng thái / kết quả | Nội dung cần thể hiện |
|---|---|
| Pending | Awaiting Manager review; lịch hiện tại vẫn có hiệu lực |
| Approved — dạy thay | Substitute assigned; Coach thay thế, ngày giờ, sân/phòng |
| Approved — dời lịch | Session rescheduled; lịch gốc và lịch sau xử lý |
| Approved — hủy kèm bù | Cancelled · makeup scheduled; buổi bị hủy và thông tin buổi bù |
| Rejected | Request rejected; lý do từ chối |
| Coach rút | Request withdrawn; không mô tả là Manager đã duyệt |
| Manager xử lý lịch trực tiếp | Closed; nêu rõ yêu cầu tự đóng và lịch đã được xử lý như thế nào |

Kết quả đã xử lý cần có người xử lý, thời điểm và lý do. Các quyết định mới lưu snapshot để thay đổi lịch về sau không làm sai lịch sử. Yêu cầu cũ thiếu snapshot được ghi chú rõ khi chỉ có thể hiển thị lịch hiện tại.

Thông báo gửi qua chuông và hàng đợi email theo luồng hiện có. Giao dịch thất bại không tạo kết quả xử lý hoặc thông báo thành công.

## 8. Giới hạn cần lưu ý

**Quy định học bù:** BR-54 cho phép bù cuối lịch hoặc ngày Manager chỉ định. Code hiện tại giới hạn buổi bù sau buổi cuối còn hiệu lực. Proposal này ghi nhận khác biệt đó; việc bỏ giới hạn cuối khóa cần được nhóm thống nhất riêng, không mặc nhiên coi đã được thay đổi.

**Tương thích:** lịch sử các yêu cầu loại cũ cần được giữ nguyên. Giao diện Coach mới chỉ gửi Absence; phương án thực tế do Manager quyết định.

**Triển khai:** các phần đã có code local vẫn cần migration, review và kiểm tra trong môi trường dùng chung trước khi xác nhận hoàn thành. Proposal này không phải báo cáo kiểm thử.

## 9. Kết quả mong đợi

- Coach gửi được một yêu cầu vắng ngắn gọn và theo dõi đúng kết quả.
- Manager chọn được người dạy thay đúng môn, đúng khung giờ, tránh chọn xong mới biết bận.
- Không duyệt dựa trên nội dung cũ hoặc ghi đè thao tác đã xử lý đồng thời.
- Lịch, request, audit và thông báo nhất quán khi lưu thành công hoặc rollback.

## 10. Tài liệu và code đối chiếu

- [Business Rules — BR-14 và BR-54](SportManagement_BusinessRules_v2.0_updated.docx).
- [Yêu cầu vắng của Coach](Class-Session-Change-Requests.md).
- [API contract](api-contract.md).
- [Manager review UI](../frontend/src/features/manager/class-change-requests.tsx).
- [Availability API](../backend/SportHub.Scheduling/Occupancy/Api/AvailabilityController.cs).
- [Availability service](../backend/SportHub.Scheduling/Occupancy/Application/AvailabilityService.cs).
- [Request service và khóa transaction](../backend/SportHub.Scheduling/Application/Services/ClassSessionChangeRequestService.cs).
