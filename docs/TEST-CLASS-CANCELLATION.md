# TC-CLASS-01 — Manager không được hủy lớp có học viên

## Chuẩn bị

- Một lớp Published chưa khai giảng, có lịch học và Coach A.
- Ít nhất một học viên đã thanh toán, ghi danh Confirmed và chưa kết thúc ghi danh.
- Coach B đúng chuyên môn và sân/phòng B còn trống ở giờ dự định đổi.

## Các bước và kết quả mong đợi

1. Đăng nhập Manager, mở chi tiết lớp → Management.
   - Không có nút **Cancel class**. Có thông báo lớp đã có học viên và nút **View class schedule**.
2. Chọn **View class schedule**, mở **Edit** của một buổi tương lai.
   - Chỉ chỉnh ngày/giờ, sân/phòng, Coach và lý do; không có **Cancel and create makeup**.
3. Đổi sang giờ trống, sân/phòng B và Coach B, nhập lý do, xem thông tin trước/sau rồi xác nhận.
   - Vẫn là buổi học cũ với lịch/Coach/phòng mới. Học viên vẫn Confirmed; không hoàn điểm. Có lịch sử và thông báo thay đổi.
4. Thử gọi API hủy trực tiếp bằng token Manager:
   - `GET /api/manager/classes/{classId}/cancellation-preview`: `canCancel=false`, `confirmedCount>=1`, `refundPoints=0`.
   - `POST /api/manager/classes/{classId}/cancel` với lý do hợp lệ: HTTP 409, `error=class_has_enrollments`.
   - `POST /api/class-sessions/{sessionId}/cancel` kèm buổi bù hợp lệ: cùng HTTP 409 và mã lỗi.
   - Trạng thái lớp, ghi danh, lịch, giữ chỗ và ví không đổi; không có thông báo hủy hoặc audit hủy thành công.

## Kiểm tra bổ sung

- Lấy preview lúc lớp chưa có học viên, sau đó cho một học viên thanh toán rồi gửi yêu cầu hủy với preview cũ: vẫn bị chặn.
- Lớp không có học viên Confirmed vẫn được hủy theo quy trình preview/xác nhận.
- Chọn thời gian trùng lịch học viên, phòng hoặc Coach: không được lưu thay đổi lịch.

## Kiểm thử tự động

Chạy tại thư mục `backend`:

```powershell
dotnet test SportHub.Scheduling.Tests/SportHub.Scheduling.Tests.csproj --filter FullyQualifiedName~EnrolledClassCancellationTests
```
