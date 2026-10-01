# Bằng chứng backend (bàn giao sang plan 2)

## P1.12/P1.13 — kết quả hiện tại, 01/10/2026

Các checkpoint phía dưới là lịch sử. Lỗi quyền Docker đã được khắc phục cho tiến trình test bằng sandbox escalation; toàn bộ integration chạy trên PostgreSQL 16 Testcontainers, không dùng DB phát triển.

Lệnh cuối: `dotnet test backend/SportHub.sln -c Release --no-restore --logger 'trx;LogFilePrefix=p1213-complete'`.

| Project | Passed | Failed | Skipped |
|---|---:|---:|---:|
| Security.Tests | 130 | 0 | 0 |
| Scheduling.Tests | 95 | 0 | 0 |
| Payment.Tests | 102 | 0 | 0 |
| Training.Tests | 80 | 0 | 0 |
| Administration.Tests | 15 | 0 | 0 |
| **Tổng** | **422** | **0** | **0** |

TRX lưu cục bộ ở `backend/<project>/TestResults/p1213-complete_*.trx` (generated, gitignored); CI upload artifact `backend-test-results`. Release build có 4 warning có sẵn trong Security.Tests (nullable Google token name, PostgreSqlBuilder cũ, 2 xUnit blocking-task warnings), không có lỗi build sau sửa Guid nullable trong fixture PT.

Sau khi sửa actor fixture legacy cash của khóa học từ Member thành Receptionist, chạy lại `dotnet test backend/SportHub.Payment.Tests -c Release --no-restore --filter 'FullyQualifiedName~ReportExportParityTests' --logger 'trx;LogFilePrefix=p1213-seed-last'`: **3/3 pass**, gồm khởi động/migrate/seed DB trắng, seed lần hai và hai phép so sánh export/API.

### Kiểm thử mới / mở rộng và vị trí cuối

- Payment `CourtRentalTests`: pending approval không tạo invoice; hai reservation thật đồng thời chỉ một thành công; cancellation nhả occupancy; incident hủy pending checkout rồi chặn slot; paid rental privacy và center refund chỉ credit một lần.
- Payment `OutboxDispatchTests`: SMTP exception giữ payload encrypted, retry bằng clock kiểm soát được, Sent xóa payload, không gửi lại; rollback action không để email trong DB. Dispatcher cập nhật kết quả chỉ khi còn sở hữu đúng lease attempt.
- Scheduling `ThresholdTransferTests`: mua khóa nguồn bằng checkout/điểm, evaluator tạo token, chặn người khác dùng token, transfer 80k/100k/120k, trả delta qua checkout, lựa chọn lặp idempotent, ledger/hold/enrollment đúng.
- Scheduling `ReportPeriodAndHoldsTests`: biên nửa mở ngày VN, expiry đúng thời điểm clock; chỉ active hold còn hạn vào báo cáo.
- Payment `ReportExportParityTests`: CSV daily và class enrollment khớp service API, giữ sport filter; seed lặp không nhân đôi ledger/rental.
- Payment `CheckoutFlowTests`: thêm đối chiếu cash compensation, PointsIssued và tổng theo source/sport vào ca duplicate callback/bank capture đang có.
- Payment `PointConfirmationMigrationTests`: nâng từ schema MultiSportWallet lên mới nhất, giữ legacy invoice/payment và cash backfill; key `membership.expiry_notice_days` giữ giá trị Manager đã sửa. Các factory cũng migrate DB trắng lên toàn bộ schema.
- Payment `ModuleBoundaryTests`: Payment/Scheduling không tham chiếu vòng; BuildingBlocks không tham chiếu module nghiệp vụ.

### Gate và giới hạn

- `dotnet ef migrations has-pending-model-changes --project backend/SportHub.API --startup-project backend/SportHub.API --configuration Release --no-build`: không có model drift. P12/P13 không thêm migration; schema cuối vẫn `20260930213319_IncidentOutboxSettingsAndRentalLinks`.
- `docker compose config --quiet`: pass. `git diff --check`: pass; chỉ cảnh báo chuyển LF/CRLF.
- Scan source ngoài migrations/obj/bin: không có `NotImplementedException` hoặc xUnit Skip; Yoga/GroupX còn trong comment giải thích lịch sử, không còn rule runtime/seed mới.
- VNPay **mock** đã qua các lifecycle integration; chưa có bằng chứng giao dịch **sandbox thật**. Outbox dùng sender test gây lỗi/chạy thành công, chưa xác nhận delivery qua SMTP bên ngoài.
- Script E2E nay gọi toàn bộ suites và model-drift check. Không chạy script Bash trực tiếp ở phiên PowerShell này; các lệnh .NET/EF tương đương đã chạy. Không kiểm frontend trong scope này.
- Đây là evidence P12/P13, không chứng nhận các phần lịch sân tổng hợp hay incident lớp/PT còn được ghi trong progress đã hoàn tất.

---

## P1.10 — Court Rental, đang triển khai, 01/10/2026

- Thêm `CourtRental` với FK/unique invoice item, snapshot block giá JSONB, trạng thái PendingPayment/Confirmed/Cancelled/Completed; `CourtRentalWorkflow` migration được sinh, chưa apply.
- ExternalCoach checkout dùng bảng giá giờ địa phương, Approved+active+specialty, sân active/compatible/capacity/opening-hours; giữ room và coach trong occupancy, fulfillment sau verified payment, system expiry/cancel release idempotent.
- Tự cancel ≥24h hoàn điểm 100%; trong 24h không hoàn. Manager center-fault refund 100%; refund request P1.08 đọc được facts Rental. RentalStatusJob release occupancy sau kết thúc.
- IPN muộn reacquire Rental chỉ với zero-point attempt và khi khoảng giờ còn tương lai, room/sport còn hoạt động, exclusion occupancy cho slot qua; nếu không, dùng cash compensation hiện có. Không tự Spend point đã nhả.
- `CourtRateCalculatorTests` 4/4; `PointRefundCalculatorTests` 8/8; Release solution build pass (4 warning cũ Security.Tests). Integration concurrency, retry, late callback, access/privacy chưa có; Testcontainers chưa thể kết nối Docker named pipe.

## P1.09 — đang triển khai, 01/10/2026

- Thêm model `ClassThresholdResponse` (unique theo lớp/enrollment, SHA-256 token hash, expiry, choice/resolution), evaluator/job, expiry/auto-refund job, Member response API, Manager pricing/waive APIs.
- Enrollment fulfillment hỗ trợ `SourceEnrollmentId` và tái ghi danh paid InvoiceItem sau khi enrollment nguồn chuyển sang TransferredOut. Bằng giá/rẻ hơn: hoàn chính xác phần chênh trong cùng transaction. Đắt hơn: tạo invoice `ClassTransferDifference`, giữ chỗ đích và enrollment nguồn tới khi Payment fulfillment complete; checkout retry/expiry nối vào response.
- `InvoiceItem.SourceInvoiceItemId` + `Enrollment.TransferDifferenceInvoiceItemId` lưu refund value-chain; invoice difference đã trả được cộng vào cap item gốc.
- Migrations `ClassThresholdResponsesAndTransferRebooking`, `ClassTransferInvoiceChain`; chưa áp DB.
- Kiểm tra: Release build pass, `CourseScheduleRulesTests` 5/5 và P1.08 calculator 8/8. `has-pending-model-changes` pass. Refund integration suite bị chặn trước khi test do Docker named pipe Access denied; P1.09 chưa có PostgreSQL integration evidence.

## P1.08 — đang triển khai, 01/10/2026

- Đã thay `RefundCalculator` sang tính điểm theo InvoiceItem và thêm 8 unit tests: Membership 2/3 boundary/50%, PT 50% khi chưa consume, class pre-start/center-cancel ratios, rental 24h, center-fault và floor-to-points. Calculator 8/8 pass.
- Đã thêm `/api/refunds` request/approve/reject/search; approval khóa invoice/item, Earn ledger + cancel Membership/PT/Class + Completed trong cùng transaction. `IRefundCreditService` có implementation `RefundCreditService` cho `SystemEvent`; ledger ghi typed InvoiceItemId để cumulative cap tính cả system refunds.
- Migrations được tạo: `PointRefundWorkflowFields`, `MemberPackageInvoiceItem`, `PointLedgerInvoiceItemReference`, `PointRefundLedgerReference`, `PointLedgerItemScopedIdempotency`. Migration cuối thay unique ledger key để hỗ trợ nhiều invoice item trong cùng một SystemEvent; system credit khóa invoice rồi item trước khi đọc cap. EF không còn báo pending model changes sau build.
- Release solution build pass, 0 errors, 4 warnings cũ ở Security.Tests; `git diff --check` pass. PostgreSQL integration suite mới (3 cases) không bắt đầu được vì Docker engine named pipe `npipe://./pipe/docker_engine` bị Access denied. Không migration DB nào được áp dụng.
- Kiểm tra mới nhất: Release build pass (0 lỗi, 4 warning cũ trong Security.Tests); calculator 8/8; `has-pending-model-changes` pass; `git diff --check` sạch.
- Chưa hoàn P1.08: rental refund chờ P1.10; atomic rollback/concurrency/cumulative cap/split/migration upgrade chưa có evidence thực chạy. Không xem calculator unit test là gate nghiệp vụ.

## P1.07 — 30/09/2026

- PostgreSQL Testcontainers kiểm luồng Membership 0/40/100% điểm; lớp reserve→confirm và IPN muộn; PT báo giá có version→activate; callback song song/lặp và khoản thu thứ hai; inbox lỗi fulfillment→retry; expiry/retry không tái dùng point hold; khoản QueryDR lẻ cần bồi hoàn thủ công. Kết quả tổng Payment xem checkpoint/handover mới nhất.
- Payment **92/92 pass**; Administration **15/15**, Scheduling **86/86**, Security **130/130** pass trong lượt solution. Training build thành công nhưng runner không nạp được DLL do Windows Application Control `0x800711C7`, kể cả chạy riêng sau build; kết quả Training trước thay đổi middleware là **80/80**. Không tính Training vào kết quả lượt cuối.
- Migration `20260930130000_MultiSportCheckout` được kiểm trên PostgreSQL tạm cùng model drift; chưa áp DB dev. Fixture ký PAY VNPay kiểm canonicalization, amount, thời gian và checksum; QueryDR dùng checksum phản hồi. Chưa có thử nghiệm E2E với merchant sandbox thật.
- Giới hạn: CourtRental checkout chờ P1.10; không tính là gate P1.07 đã hoàn tất tuyệt đối.

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
# P1.11/P1.12 cập nhật — 01/10/2026

- `dotnet build backend/SportHub.sln --configuration Release --no-restore` → pass, 4 existing warnings in Security.Tests, 0 errors.
- `dotnet test backend/SportHub.sln --configuration Release --no-build --filter FullyQualifiedName~Unit` → Administration 15/15, Security 43/43, Payment 28/28, Scheduling 9/9, Training 23/23 (118 pass).
- Full `dotnet test backend/SportHub.sln --configuration Release --no-build` khởi động integration fixtures nhưng Testcontainers bị `DockerUnavailableException` do quyền truy cập `npipe://./pipe/docker_engine`; full integration gate chưa đạt/không thể xác nhận trong host này.
- `dotnet ef migrations add IncidentOutboxSettingsAndRentalLinks` chỉ scaffold migration files. `dotnet ef migrations has-pending-model-changes --project backend/SportHub.API --startup-project backend/SportHub.API --configuration Release --no-build` → “No changes have been made to the model since the last migration.” Không chạy `database update`.
- `IncidentService` khóa các nguồn thuê đã trả trước khi refund/cancel, release rental PendingPayment trước khi thêm block; nếu lớp/PT vẫn nằm trong vùng sự cố trả conflict và không tạo block giả. Preview không trả thông tin roster/member.
- Email writer mã hóa payload bằng Data Protection; dispatcher khóa batch bằng `FOR UPDATE SKIP LOCKED`, đặt lease trước network I/O, ghi `Sent` sau sender thành công, retry lỗi; nội dung/OTP không ghi audit/log dispatcher.
- Security/Payment API test factories giữ real encrypted outbox write và chỉ expose OTP vào test harness; đã thêm test integration đảm bảo read-all InApp không đánh dấu email OTP Pending thành Read. Test cần PostgreSQL fixture và chưa chạy do Docker unavailable.
- Settings expiry reminder được đổi khóa tại chỗ bằng SQL để migration không ghi đè giá trị hiện hành do Manager chỉnh.
- Docker Compose truyền VnPay/Smtp cấu hình qua biến môi trường; development mock/log cần opt-in theo config. CI nay chạy toàn bộ backend tests sau build; job test vẫn cần Docker khả dụng cho Testcontainers.
- Revenue report tách LegacyCash và cash reconciliation từ event VNPay đã bồi hoàn/yêu cầu settlement; points redeemed/issued/manager adjustment/outstanding và cash/points breakdown theo loại InvoiceItem được thêm. Payment VNPay ghi ngày `PaidAt` theo provider-verified pay time; checkout Spend ledger mới gắn InvoiceItemId. Unit suite sau thay đổi vẫn pass 118/118.
- Chưa có dimension Sport xuyên Membership/PT/Class/Rental, chưa có court-rental revenue/export dùng chung aggregation; không tuyên bố phần báo cáo P1.12 hoàn tất.
