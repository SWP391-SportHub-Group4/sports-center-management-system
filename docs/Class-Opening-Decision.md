# M06 — Chốt lớp thiếu học viên trước khai giảng

Nguồn nghiệp vụ: quy tắc 72–48–24 giờ do người dùng chuyển từ leader/mentor và xác nhận trong cuộc trao đổi ngày 18/10/2026. Các mục triển khai bên dưới là cách hiện thực quy tắc này, không phải yêu cầu nghiệp vụ mới.

## Quy tắc đã xác nhận

- Đánh giá ít nhất 72 giờ trước buổi đầu; chỉ đếm Enrollment Confirmed, không đếm SeatHold chưa thanh toán.
- Thiếu ngưỡng: thông báo trong hệ thống và email cho học viên, Manager và HLV liên quan. Cửa sổ phản hồi tối đa 48 giờ, kết thúc ít nhất 24 giờ trước buổi đầu.
- Học viên chọn ở lại chờ, chuyển lớp hoặc hoàn điểm. Khi lớp bị hủy vì thiếu ngưỡng, thông báo hoàn điểm kèm gợi ý khóa tương đương tại thời điểm đó; không có đăng ký nhận tin khóa sau.
- Trong thời gian chờ vẫn nhận ghi danh nếu lớp cho phép; hiển thị rõ chưa xác nhận mở.
- Đạt ngưỡng trong lúc chờ: xác nhận ngay, báo người còn ghi danh; không tự hoàn người chưa phản hồi. Lựa chọn đã thực hiện không bị đảo ngược.
- Hết hạn vẫn thiếu: có quyết định miễn ngưỡng hợp lệ thì mở; nếu không, hủy và hoàn điểm cho người còn ghi danh. Manager cần ghi quyết định trước khi tác vụ hủy chốt giao dịch.
- Kiểm tra muộn: không tự kéo cửa sổ 48 giờ vượt khai giảng; Manager chốt ngay hoặc dời khai giảng. Lớp chưa chốt không tự chuyển sang đang học.

Ví dụ: khai giảng 10:00 thứ Hai → đánh giá chậm nhất 10:00 thứ Sáu → phản hồi đến 10:00 Chủ nhật. Job đánh giá hiện chạy sớm thêm 10 phút để dự phòng chu kỳ 5 phút.

## Triển khai

Tận dụng API ngưỡng, phản hồi, chuyển/hoàn, miễn ngưỡng, hủy lớp và dời buổi hiện có. Không thêm endpoint hoặc trạng thái database mới.

- `ClassStatusJob` gọi đánh giá/hết hạn trước khi cập nhật lifecycle. Chỉ lớp Met hoặc WaivedByManager được tự bắt đầu; không tự hoàn thành buổi thuộc lớp Published chưa xác nhận.
- Đánh giá phục hồi cả lớp đã qua giờ dự kiến nếu mốc cũ bị lệch. Giữ AtRisk, cảnh báo và không tạo cửa sổ phản hồi bị rút ngắn.
- Điểm danh lớp Published chưa đủ ngưỡng/chưa có quyết định bị chặn. Không duyệt miễn ngưỡng hồi tố cho giờ khai giảng đã qua.
- Manager dời lịch dự kiến chưa xác nhận bằng thao tác reschedule có sẵn. Trường hợp thời gian cũ đã qua chỉ được dời nếu buổi còn Scheduled và chưa có điểm danh/bản ghi giảng dạy; lớp đã dạy dùng luồng sự cố riêng. Dời buổi đầu cập nhật StartDate và mốc đánh giá; không rút ngắn khoảng cách 24 giờ của cửa sổ phản hồi đang mở.
- Hủy do thiếu ngưỡng giải phóng cả checkout/điểm giữ của chỗ chưa thanh toán; ghi audit SYSTEM cùng transaction. Audit giữ tham chiếu tài khoản HLV của lớp theo ràng buộc FK hiện có, không đại diện thao tác thủ công của HLV.
- Public course DTO bổ sung `openingConfirmed`, không công khai chi phí hay ngưỡng nội bộ. Catalog/chi tiết lớp hiện nhãn chưa xác nhận hoặc đã xác nhận mở. Manager tiếp tục xử lý tại Classes → chi tiết lớp → Threshold; dời tại Sessions, hủy tại Overview.

BR-120 và UC hết hạn cũ mô tả tự hoàn người không phản hồi phải được đọc cùng quyết định mới: khi lớp đã xác nhận Met/Waived thì giữ ghi danh, không tự hoàn họ. Quyết định hiện hành được ghi tại SSOT; không coi đoạn cũ là căn cứ thay đổi ngược hành vi đã xác nhận.

## Kiểm chứng local

- Lượt hồi quy Scheduling: 44 trường hợp đạt, gồm ngưỡng, chuyển lớp, hết hạn, khai giảng, lịch, sự cố và quyền Coach.
- Sau bổ sung chốt RESULT/HOMEWORK: 17 trường hợp đạt ở nhóm ClassOpeningDecision/CourseAttendance/CoachAvailabilityRequest (có trường hợp trùng lượt trên).
- Playwright: 6 trường hợp M05/M06 đạt với API fixtures; đã xem ảnh Manager ở 390px, kiểm tra nhãn chưa xác nhận và cập nhật thành đã xác nhận ở chi tiết công khai.
- Frontend TypeScript và ESLint các file thay đổi đạt; Docker frontend/backend build thành công. Không thêm migration/API.
- Log local: `.tmp/m06-complete-tests.log`, `.tmp/m06-opening-guard-final.log`, `.tmp/m06-ui-tests.log`, `.tmp/m06-docker-build.log`, `.tmp/m06-backend-deploy-build.log`. Backup trước cập nhật backend: `.tmp/m06-before-deploy.dump`.
- Email được kiểm chứng qua outbox; chưa xác nhận giao thư tới hộp thư thật. Đây không phải chứng nhận nghiệm thu staging/toàn bộ hệ thống.
