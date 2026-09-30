# Bằng chứng backend (bàn giao sang plan 2)

Cập nhật sau mỗi chặng.

## P1.05 — 30/09/2026

- Toàn backend **389/389 pass** trên PostgreSQL 16 Testcontainers (Administration 15, Payment 78, Scheduling 86, Security 130, Training 80), không skip; sau thay đổi nhỏ cuối, **7/7 CoursePublishTests** và **8/8 CourseAttendanceTests** (Release) pass. Bốn warning cũ thuộc Security.Tests. Không migration DB dev.
- `CoursePublishTests`: Draft không lộ public, hai Manager publish đồng thời chỉ một thành công, xung đột ở buổi cuối rollback toàn bộ session/occupancy/outbox; kiểm lại chuyên môn/giờ mở cửa/ngưỡng; dời/bù giữ enrollment và từ chối phòng quá nhỏ hoặc lịch học viên trùng.
- `CourseAttendanceTests`, `SeatHoldConcurrencyTests`, `GymCheckOutTests`, `CourseScheduleRulesTests`: role Receptionist, biên 24 giờ/audit, chặn NoShow lớp, giữ chỗ đồng thời không vượt sĩ số, khóa bán khi buổi đầu đã bắt đầu, checkout Gym idempotent và dùng giờ server.
- `PtOccupancyTests`: phòng PT đúng loại/giờ, xung đột giữ lịch cũ, hủy nhả occupancy, job NoShow chỉ consume quota và ghi audit một lần. Các test PT cũ tiếp tục qua.
- Mua/hoàn tất khóa qua thanh toán thật vẫn chờ P1.07; `IClassEnrollmentFulfillment` hiện là port giao dịch để checkout gọi. P1.05 không tự tạo Invoice Paid hay enrollment miễn phí.

## P1.06 — 30/09/2026

- `dotnet test backend/SportHub.sln --configuration Release --no-restore`: **359/359 pass**, không skip; build Release thành công. Có 4 warning sẵn có trong Security.Tests.
- Payment: **78/78**; thêm `CounterPointOtpTests.cs` (11 test) và `PointConfirmationMigrationTests.cs` (1 test).
- Đã thử OTP sai 5 lần (cả song song), biên 60s resend/5 phút bằng fake clock, code cũ vô hiệu, đúng mã lặp/song song giữ một lần, hai invoice cạnh tranh số dư, stale revision, IDOR/RBAC, chặn thu thủ công, clear/expiry release, rollback sau Hold, tiền decimal lớn.
- Migration trên PostgreSQL 16 test: DB trắng qua toàn bộ migrations; nâng từ `MultiSportWallet` có invoice/payment legacy không mất dữ liệu, cash amount được backfill; `Database.HasPendingModelChanges()` = false. EF CLI bị Windows Application Control chặn nên migration/snapshot được viết thủ công và kiểm bằng test. Chưa migrate DB dev của nhóm.
- P1.06 chỉ xác nhận và Hold điểm. QR/VNPay, Spend + fulfillment (kể cả 100% điểm), checkout retry vẫn chưa triển khai ở P1.07. SMTP thật chưa được kiểm trực tiếp; test dùng capturing sender. Contract ở Phần E, `refactor-api-contract.md`.

## Baseline 30/09/2026 (trước refactor)
- Build Release: 0 lỗi. Test: 289 pass, 6 fail (Training, lỗi test enum-string có sẵn — chi tiết ở `refactor-progress.md`).
- Migration áp dụng lên DB: chưa có (chưa chạy migration nào trong chặng này).
- Sandbox VNPay: chưa có bằng chứng thực nghiệm; chưa có code VnPay gateway.
- Account demo / cách chạy SMTP/mock: chưa cập nhật (làm ở P1.12).
- File legacy FE cần xóa, error codes: chưa có.
