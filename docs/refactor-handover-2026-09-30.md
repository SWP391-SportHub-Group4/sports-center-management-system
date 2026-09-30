# Handover refactor backend — 30/09/2026

> **Cập nhật P1.07 (mới nhất):** kiểm `git status` trước khi thao tác; các thay đổi frontend thuộc luồng công việc riêng. Các số liệu/đầu việc P1.07 trong bản handover cũ bên dưới là lịch sử, không phản ánh code hiện tại.
>
> Đã có checkout Membership/lớp/PT, thanh toán điểm/VNPay mock, IPN/QueryDR, event inbox và retry, expiry/compensation. Sửa thêm middleware auth trước checkout rate limit, kiểm provider time, từ chối giá mới không chia hết 1.000 VND, và xử lý QueryDR tiền lẻ bằng trạng thái `ManualCompensationRequired` sau khi nhả hold, không làm tròn. Lượt cuối: Payment 92/92, Administration 15/15, Scheduling 86/86, Security 130/130 pass. Training build pass nhưng runner bị Windows Application Control chặn DLL `0x800711C7`; trước thay đổi middleware đã qua 80/80.
>
> **Cần tiếp tục:** checkout CourtRental sau khi P1.10 có domain/port; thử VNPay sandbox merchant thực (đặc biệt QueryDR); áp migration lên DB dev theo quy trình nhóm; đánh giá loại API thu thủ công cho invoice legacy sau khi chuyển dữ liệu. Không tuyên bố toàn bộ gate P1.07 hoàn tất trước các việc này.

## Trạng thái để tiếp tục

- Workspace: `D:\Roy\sports-center-management-system`; branch `feature/refactor-v2.1`, HEAD `c53666f` (develop tại lần đồng bộ trước). **Working tree có thay đổi chưa commit/push** của P1.06 và P1.05. Không reset/pull đè trước khi kiểm `git status` và lưu các thay đổi này.
- Tài liệu nguồn: `docs/refactor-code-plan-1-backend.md` (§8 P1.05, §9 P1.06, §10 P1.07), `docs/00-Source-of-Truth.md`, `docs/Center-Management-System-Design-v3.md`. Tiến độ mới nhất: `docs/refactor-progress.md` (đọc các checkpoint đầu; các mục phía dưới là lịch sử). Contract: `docs/refactor-api-contract.md` Phần E/F. Bằng chứng: `docs/refactor-backend-evidence.md`.
- `docs/system-architecture-analysis.md` đã là file untracked khi kiểm tra; nguồn tạo chưa xác định trong lượt P1.05, hãy giữ nguyên.

## Đã làm

### P1.05 — gate hoàn thành trong working tree

- Publish lớp GroupCourse kiểm môn, Coach specialty, room, sức chứa, giá/chi phí, ngưỡng, giờ mở cửa; sinh đủ `NumSessions`, giữ phòng/Coach nguyên tử; hai publish đồng thời chỉ một thành công. Draft không hiện public. Coach nhận thông báo in-app qua outbox cùng transaction khi publish; audit cùng transaction.
- Giữ chỗ theo cả khóa qua `IClassEnrollmentFulfillment`: chống bán vượt sĩ số bằng conditional update, kiểm trùng lịch Member, không cho ghi danh sau buổi đầu dù job chưa chạy; confirm/release/cancel idempotent. `CourseScheduleLock` chặn race giữa reserve/confirm và dời lịch; dời/bù xét cả Member Confirmed và hold Active chưa hết hạn. Sửa Draft có khóa dòng với publish. Sửa lỗi EF không dịch được truy vấn chi tiết/list lớp và buổi/roster.
- Dời/hủy buổi kiểm room/coach hiện hành, sức chứa room, giờ mở cửa, occupancy và lịch học viên; hủy phải tạo buổi bù sau lịch, rollback toàn bộ nếu xung đột. Điểm danh chỉ Receptionist đang hoạt động, Present/Absent, từ giờ bắt đầu đến hết 24 giờ sau buổi; tạo/sửa có audit, gọi lại cùng trạng thái không ghi lặp. Gym checkout dùng giờ server, idempotent, từ chối giờ ra trước giờ vào.
- PT giữ quota, workout/homework, occupancy; khi đổi Coach, buổi có room chỉ chuyển nếu room/giờ vẫn tương thích Coach mới. `AttendanceFinalizerJob` 10 phút chỉ tự chốt PT NoShow sau giờ kết thúc, dùng cùng locked transition của `PtSessionService` để không consume quota hai lần. Audit action `AUTO_NO_SHOW_PT_SESSION` phân biệt job với Coach; vì schema AuditLog yêu cầu user FK, log dùng Coach của buổi làm `UserId`.
- Test mới: `CourseScheduleRulesTests`, `CoursePublishTests`, `CourseAttendanceTests`, `SeatHoldConcurrencyTests`, `GymCheckOutTests`, `PtOccupancyTests` dùng PostgreSQL Testcontainers.

### P1.06 — đã triển khai ở phiên trước, cùng working tree

- Wallet integer points, ledger append-only, Hold/Release/Spend/Earn/Adjustment. Invoice thêm cycle/revision/deadline/points/cash; OTP tại quầy 6 số, PBKDF2+salt, tối đa 5 phút/5 lần sai, resend sau 60s, revoke/release khi đổi/bỏ điểm; tự chọn điểm qua JWT; rate limit, job hết hạn; migration `20260930070000_MultiSportPointConfirmation` và 12 test mới.
- OTP `Confirmed` chỉ chứng minh đồng ý dùng điểm và đã **Hold**; chưa Paid/Spend/fulfillment. Email SMTP thật chưa thử; integration test dùng sender giả. Migration mới đã thử trên DB PostgreSQL tạm, gồm nâng cấp invoice/payment cũ và `HasPendingModelChanges=false`; **chưa áp lên DB dev**. EF CLI bị Windows Application Control chặn, không thử bypass; migration/designer/snapshot được viết và kiểm bằng test.

## Kiểm chứng hiện có

- `cd backend; dotnet test SportHub.sln --no-restore -v quiet`: **389/389 pass**, không skip: Administration 15, Payment 78, Scheduling 86, Security 130, Training 80. Chạy sau khi thêm các test P1.05 và trước hai thay đổi nhỏ cuối: thêm event `ClassPublished` + thông báo in-app, siết status điểm danh để không chấp nhận chuỗi số `"0"`. Sau đó chạy `CoursePublishTests` **7/7 pass** và `CourseAttendanceTests` cấu hình Release **8/8 pass**. Build toàn solution thành công; 4 warning cũ ở Security.Tests.
- Sau full suite, tiến trình `SportHub.API` PID 41088 khóa DLL Debug khiến một lần build Debug cuối báo `MSB3027/MSB3021`. Không dừng tiến trình đó; build/test Release đi qua. Khi cần test tiếp, dùng `-c Release` hoặc dừng API theo nhu cầu của người đang chạy nó.
- Testcontainers dùng PostgreSQL 16 qua Docker Desktop. Không cần DB dev. `.NET SDK 10.0.401`, target `net10.0`.

## Chưa làm / bước tiếp theo

1. **P1.07** theo §10 của plan: thêm `CheckoutSession` và `VerifiedGatewayEvent`; nối quote/reserve course/PT/rental, PaymentAttempt, VNPay IPN/QueryDR và retry. Sau khi xác minh tiền hoặc giao dịch 100% điểm, commit Paid + Spend + fulfillment + audit/outbox nguyên tử. Retry phải cấp cycle/hold mới, không tái dùng reference điểm đã release. Loại bỏ đường thu tiền thủ công khi verified checkout thay thế xong.
2. Nối `SeatHoldExpiryJob` với Payment checkout expiry để Void invoice/release point hold đồng bộ; hiện job P1.05 chỉ expire seat hold và trả danh sách cho caller. Thiết kế chuyển/hoàn khóa dưới ngưỡng thuộc P1.09; thuê sân thuộc P1.10; email outbox/retry nâng cao thuộc P1.11.
3. Trước khi commit/push: `git diff --check`, đọc diff của cả P1.05 và P1.06, kiểm migration bằng test; nếu sửa code tiếp thì chạy test liên quan. Không đưa `docs/system-architecture-analysis.md` vào commit khi chưa xác định chủ sở hữu/nội dung. Không có commit hay push nào được tạo trong hai phiên này.

## Giới hạn cần nhớ

- Chưa có API mua khóa hoàn chỉnh: `IClassEnrollmentFulfillment` là port giao dịch cho P1.07, không tự xác nhận thanh toán. Test confirm dùng invoice item dựng riêng để chứng minh seat/ghi danh và tính idempotent, không đại diện cho luồng thanh toán thật.
- Publish gửi thông báo in-app cho Coach; email cho từng Member trong luồng đổi lịch chỉ xếp `ScheduleChanged` theo hạ tầng thông báo hiện tại. Không khẳng định SMTP/outbox email bền vững đã hoàn tất.
- Chưa xác minh E2E frontend hoặc triển khai lên môi trường của nhóm trong P1.05/P1.06.
