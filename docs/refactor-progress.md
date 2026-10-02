# Checkpoint frontend — hoàn tất triển khai P2.00–P2.05 (02/10/2026)

Nhánh `feature/refactor-v2.1`, base `0d3e1ef` đã fetch/fast-forward từ develop. Thay đổi chưa commit/push. Phạm vi yêu cầu P2.00–P2.05 đã triển khai; P2.06 trở đi là chặng tiếp theo, không phải nghiệm thu toàn web.

| Chặng | Kết quả |
|---|---|
| P2.00 | Đã kiểm inbound imports, bỏ demo repository/provider/UI song song, gate QR tự sinh và Test QR Scan trong CameraQrScanner. Baseline JSON thật/API riêng đã kiểm; canonical DTO dùng ở các feature mới. |
| P2.01 | Auth 6 roles, adapter wire một nơi, F5 refresh profile, specialty/approval authority, safe local returnTo, API AbortSignal/204/idempotency/errors/Retry-After, stale-data protection; bỏ CoachCategory consumer; navigation hợp lệ và i18n mới. |
| P2.02 | Direct OTP reset, Member/ExternalCoach signup, cooldown/expiry/password checklist/confirm, Google 202 onboarding, account change-password/JWT mới, own training profile. |
| P2.03 | Landing đa môn từ sports API, Gym pricing thật/PT riêng, public course filters/detail/lịch không roster; Member mua nguyên khóa không cần Membership, Guest login return. |
| P2.04 | Shared invoice/list/detail/status, checkout idempotency/recovery/hold/server clock, cash/points split, cash=0 explicit confirm không QR/attempt, gateway/mock label, bounded polling, cancel/retry/re-quote/return, OTP quầy revision/cooldown/5-attempt lock, item refund quote/request. InvoiceWorkbench bỏ manual cash/card/transfer và cash refund. |
| P2.05 | Dashboard/lịch khóa/registrations timeline/own invoice/refund/wallet filtered ledger/Gym và PT entitlement/quote/coach specialty/PT quota+sessions+change requests+plans+results+homework, threshold own/email token/final-choice/transfer difference. PT được gộp đủ trong training; deep link dùng `/member/training`. |

## Bằng chứng bản code cuối

- `dotnet build backend/SportHub.sln -c Release --no-restore`: pass, 0 error, 4 warning cũ.
- Integration/unit: **470/470 pass, 0 fail, 0 skip**: Administration 15, Security 131, Payment 135, Scheduling 108, Training 81. TRX `p2-*-verified.trx`, Scheduling `p2-scheduling-final-build.trx` trong TestResults của từng project.
- Frontend `npm run typecheck`, `npm run lint` (0 error, 7 warning cũ), `npm run check:i18n`, `npm run build`: pass. Production build gồm các route public/Member/payment/threshold/signup mới.
- Browser HTTP UI regressions: **21 case đã pass** (20 case ở lượt đầy đủ; OTP quầy chạy lại riêng sau sửa selector bị trùng aria-label, pass); Member + foundation + payments; kiểm F5 authority, reset payload/cooldown, responsive 320/768/1280, Member WCAG A/AA, public 320/390/1440 WCAG, cash=0 không attempt, stale QR, cancel/F5, return query, compensated/reconciliation, POST timeout recovery, owner denial và OTP quầy khóa 5 mã sai/F5. Đây là UI tests có mock HTTP, không gọi chúng là integration backend.
- Browser **API thật 4/4 pass** `P2_LIVE_API=http://localhost:5000 npx playwright test tests/refactor-live.spec.ts`: khóa 200.000 VND, lần lượt 0/50/200 điểm, gateway mock verified server, F5, Paid/Fulfilled và enrollment thật; tất cả 7 trang Member và public responsive.
- HTTP API thật: anonymous membership catalog 200, filtered SPEND ledger chỉ SPEND, invalid filter 400, coach specialty/own threshold/PT requests 200.
- Screenshot đã xem sau sửa: public header/hero giữ Navy/Ice/Roboto; dashboard 320px và wallet contrast/keyboard scroll đã được sửa và qua axe.
- `git diff --check`: pass. Không sửa Requirements/SRS, .env/.env.local, schema hoặc migration.

## Môi trường và giới hạn

Tests chạy PostgreSQL18 cluster tạm riêng tại `%TEMP%/sporthub-p2-postgres-20261001`, port55439. Mỗi suite có database mới; browser dùng `sporthub_p2_browser_final`. Không migrate/reset DB phát triển/chia sẻ. API test tắt SMTP và dùng VNPay mock. Các tiến trình API/cluster riêng được dừng sau nghiệm thu, dữ liệu test giữ trong thư mục tạm. Lần Payment dùng nhầm lại DB fixture đã có 7 fail; chạy DB mới xác nhận135/135. Windows Application Control từng chặn DLL 0x800711C7; sau build cuối đã thực thi thành công và toàn suite được chạy lại, không còn blocker nghiệm thu hiện tại, không đổi chính sách bảo mật.

Google provider/SMTP delivery/VNPay sandbox thật cần môi trường tích hợp của người dùng; test Google/OTP nội bộ không chứng nhận các dịch vụ ngoài. Trang staff legacy ngoài P2.05 được giữ cho P2.06–P2.12, chỉ sửa phụ thuộc auth/types tối thiểu; không coi chúng là đã refactor hoàn chỉnh. [Contract bổ sung](refactor-api-contract.md) và [handover](refactor-frontend-handover-temp.md) lưu quyết định/bước tiếp.

---

# Tiến độ refactor backend (plan 1)

## Chốt plan 1 — 01/10/2026

**Hoàn tất phạm vi backend P1.00–P1.13, ngoại trừ tích hợp/nghiệm thu VNPay sandbox thật theo yêu cầu người dùng.** Frontend vẫn thuộc plan 2. Manifest, quyết định tương thích và giới hạn ở [bàn giao cuối](refactor-backend-final-handover.md); payload thực tế ở [JSON API](refactor-api-examples.json).

Đã đóng các phần còn thiếu sau checkpoint trước: lịch sân Class/PT/Rental/Block và phân quyền; incident lớp/PT với phương án dời/hủy/bù; email transaction cho invoice/payment/refund, threshold và thay đổi lịch; enum JSON UPPER_SNAKE_CASE; kết quả fulfillment phân biệt cấp quyền lợi/bồi hoàn/đợi đối soát; typed invoice references và snapshot giá/thời hạn/môn. Membership legacy còn cột số lượt để đọc lịch sử nhưng không còn dùng chúng để giới hạn quyền lợi/expiry. Legacy discount/correction chỉ đọc.

**Kiểm chứng cuối: 465/465 test pass, 0 fail, 0 skip.** PostgreSQL 16 Testcontainers kiểm cả DB trắng, nâng cấp có dữ liệu và concurrency; model drift không có. Chi tiết lệnh/suite tại [evidence](refactor-backend-evidence.md). Migration cuối `20261001131334_BackfillTypedInvoiceReferences`; chỉ áp trong database test, chưa áp lên DB phát triển/chia sẻ.

Trạng thái bàn giao: code tiếp tục trên checkout hiện có (HEAD lúc chốt `cf8b6bd`, phần bổ sung ở working tree), không tự commit/push. Giữ nguyên `.claude/settings.local.json` của người dùng. Sandbox VNPay và delivery SMTP bên ngoài chưa có bằng chứng thực nghiệm; mock/dispatcher đã qua test. Bước tiếp theo là plan 2 và tích hợp sandbox do người dùng phụ trách.

Các checkpoint bên dưới là **lịch sử**, gồm số test cũ và phần việc lúc đó chưa làm; không phải trạng thái hiện hành.

---

## Checkpoint — P1.12/P1.13 (01/10/2026)

Đã bổ sung báo cáo doanh thu theo môn/nguồn/ExternalCoach, dòng đối soát và legacy chưa phân loại; export CSV/PDF dùng chung dịch vụ tổng hợp với API. Có export sĩ số với bộ lọc môn, hold còn hạn theo IClock, và báo cáo hội viên mới theo ngày Việt Nam. Các loại export cũ giữ nguyên ý nghĩa ngày phát hành hóa đơn.

Seed mới có 6 vai trò, 4 trạng thái ExternalCoach, Membership không còn quota lớp nhóm, khóa Draft/Published/AtRisk/InProgress/Completed, legacy cash có item liên kết, ví 500 điểm và lượt thuê trả qua checkout bằng điểm. Chạy lại không cộng trùng ví/rental. Seed đầy đủ dành cho DB demo mới; DB đã có tài khoản chỉ bổ sung ví/rental khi nhận diện đủ các tài khoản demo, không tự sửa tài khoản/nghiệp vụ đang dùng.

P1.13 đã chạy PostgreSQL thật qua Testcontainers sau khi cấp quyền truy cập Docker cho lệnh test. Không áp migration lên database phát triển. Bộ mới bổ sung chuyển lớp rẻ/bằng/đắt, thuê sân đồng thời, pending approval, incident release, outbox retry/rollback, export parity, biên ngày VN, hold hết hạn, module boundary và migration giữ cấu hình Manager. Chi tiết lệnh/kết quả ở `refactor-backend-evidence.md`.

**Kết quả:** 422/422 test pass, 0 fail, 0 skip; model drift không có, compose config và diff check pass. Sau sửa actor legacy fixture thành Lễ tân, ba test seed/export chạy lại đều pass.

CI lưu TRX; `scripts/e2e-business-rules.sh` chạy các integration suites thay cho các curl scenario cũ dùng endpoint enrollment/payment đã bỏ. Race và RBAC được kiểm bằng các suite hiện tại, không bị bỏ khỏi gate. Không thay đổi frontend.

Giới hạn cần giữ khi bàn giao: chưa có bằng chứng VNPay sandbox thật/SMTP thật; báo cáo Membership dùng trạng thái và thời hạn được lưu, không tái dựng lịch sử cancellation chưa có timestamp. Membership không gắn một môn duy nhất nên sport là null; PT legacy chỉ được phân môn khi catalog có đúng một môn OneOnOne. Incident lớp/PT vẫn cần xử lý lịch trước, lịch sân tổng hợp là phần còn lại của P1.10/P1.11, không được đánh dấu hoàn tất cả plan 1 chỉ vì test hiện có xanh.

## Lịch sử — P1.11 Incident + email outbox; P1.12/P1.13 đang tiếp tục (01/10/2026)

**Đã triển khai:** Manager có preview/resolve incident ở `/api/manager/incidents`; lớp/PT giao thời gian được trả conflict để xử lý lịch trước, rental đang thanh toán được release, rental đã trả được hủy/hoàn điểm 100%, rồi mới thêm room block và audit. Manager có `/api/manager/notices` gửi in-app/email theo danh sách người nhận. OTP đăng ký, đặt lại mật khẩu, ExternalCoach và xác nhận điểm quầy được ghi encrypted email outbox cùng transaction; SMTP dispatcher claim bằng `SKIP LOCKED`, lease, retry/backoff; truy vấn/read-all thông báo chỉ tác động InApp. Chưa hứa exactly-once gửi email.

**Migration:** `CourtRentalWorkflow` đã nối thêm `IncidentOutboxSettingsAndRentalLinks` (incident, outbox, liên kết Rental↔Invoice/Incident và settings). Migration đổi khóa `package_expiring_reminder_days` tại chỗ để giữ giá trị Manager đã chỉnh. Chưa apply migration. `has-pending-model-changes` hiện pass sau scaffold.

**P1.12 đã cập nhật:** Revenue report hiện trả legacy cash riêng, cash bồi hoàn/reconciliation theo verified provider pay time, spend/issued/adjustment/outstanding point metrics và breakdown cash/points theo InvoiceItem source. `Payment.PaidAt` của VNPay dùng `ProviderPaidAtUtc`; Spend ledger mới gắn InvoiceItemId. Docker Compose/.env mẫu map SMTP/VNPay + Data Protection key ring bền vững; Production fail-fast nếu thiếu VNPay credentials/HTTPS URLs, SMTP sender/FromAddress hoặc đường dẫn key ring. CI backend chạy test sau build. `DemoDataSeeder` thêm ExternalCoach Approved/Pending/Rejected/Suspended và `docs/RUNBOOK.md` ghi đúng account/email/password hiện seed. Còn thiếu dimension Sport cho mọi nguồn, doanh thu rental/report export cùng số liệu, membership period, và rental/wallet/ledger demo data.

**Kiểm tra:** solution Release build pass 4 warning cũ ở Security.Tests/0 error. Unit filter pass: Administration 15, Security 43, Payment 28, Scheduling 9, Training 23 (118 tổng). Full integration run chưa xác minh được: Testcontainers không kết nối Docker named pipe `npipe://./pipe/docker_engine` (Access denied). Chưa chạy migration lên database. `git diff --check` được chạy lại sau cập nhật docs.

**Còn lại để khép plan 1:** P1.12 hoàn thiện báo cáo/export + seeder/composition; P1.13 bổ sung/hoàn tất PostgreSQL integration coverage theo bảng gate, bao gồm incident, outbox, rental, payment/late payment và migration upgrade. Không gọi migration `database update` trong lượt này.

**Ghi chú lệnh migration:** khi gỡ migration rỗng vừa scaffold, EF CLI đọc `__EFMigrationsHistory` của connection string localhost:5435 để xác nhận trạng thái; lệnh chỉ đọc, không apply/đổi schema. Migration code đã được scaffold lại. Không có lệnh cập nhật database nào chạy.

## Checkpoint — P1.10 Court Rental, đang triển khai 01/10/2026

**Đã triển khai trong working tree:** CourtRental entity/migration, quote giá theo từng giờ và giờ VN, yêu cầu ExternalCoach Approved/active/cùng môn, sân active/đúng sức chứa/giờ mở cửa, giữ occupancy phòng + ExternalCoach khi checkout PendingPayment. Checkout nối vào Invoice/PaymentFulfillment; expiry/cancel nhả occupancy; payment xác nhận rental; retry tạo checkout mới; IPN muộn reacquire nếu slot còn hợp lệ và không có điểm đã nhả. Tự hủy ≥24h hoàn điểm 100%, <24h không hoàn; Manager center-fault hoàn 100%; P1.08 refund request/approval nay hỗ trợ Rental.

**API mới:** `POST /api/checkouts/court-rental` (ExternalCoach + Idempotency-Key), `GET /api/court-rentals/availability`, `GET /api/court-rentals/mine`, `POST /api/court-rentals/{id}/cancel`, lịch thuê cho StaffRead tại `/api/manager/court-schedule/rentals`, Manager hủy center-fault tại `/api/manager/court-rentals/{id}/cancel`. Availability trả phòng trống và giá, không trả Member/lịch nguồn chi tiết.

**Migration/DB:** `CourtRentalWorkflow` thêm bảng `court_rentals`, FK tới coach/sport/room/InvoiceItem; chưa apply migration lên database. Đã sinh migration sau code model; chạy lại `has-pending-model-changes` để kiểm drift.

**Kiểm tra:** Release build pass (0 errors, 4 warnings sẵn có Security.Tests); `CourtRateCalculationTests` 4/4; `PointRefundCalculatorTests` 8/8. PostgreSQL API/concurrency suite chưa thêm/chưa chạy; Docker named pipe `npipe://./pipe/docker_engine` trước đó Access denied. Chưa đánh dấu P1.10 gate hoàn tất.

**Còn thiếu P1.10:** PostgreSQL rental-vs-publish/PT/block concurrency, retry/late-payment, ownership/RBAC và privacy calendar tests; gom lịch phòng chuẩn gồm class/PT/rental/block theo contract; xác minh opening/rate settings cập nhật đồng thời trên DB thật.

## Checkpoint — P1.09 Threshold/transfer, đang triển khai 01/10/2026

**Chặng hiện tại / đã hoàn tất:** P1.09 đang triển khai. Có model `ThresholdResponse`, evaluator theo deadline, token ngẫu nhiên chỉ lưu hash, notification outbox, Member response với lựa chọn Refund/Transfer; Manager có API đổi giá/chi phí trước deadline và waive ngưỡng. Transfer bằng giá/rẻ hơn xử lý nguyên tử; đắt hơn tạo checkout difference, giữ enrollment nguồn đến khi fulfillment. P1.08 chưa qua gate vì Rental fulfillment nằm ở P1.10 và Docker integration chưa chạy được.

**Commit hoặc trạng thái working tree:** branch `develop`, chưa commit. `.claude/settings.local.json` vẫn được giữ nguyên.

**File thêm / sửa / xóa:** P1.09 thêm `ThresholdResponse`, enums/configuration, evaluator/expiry services, owner response controller, waive/pricing routes/jobs, `IInvoiceDraftWriter` implementation và `ClassTransferDifference` checkout fulfillment/retry/expiry. P1.08 có refund API/service, Membership/PT/Class fulfillment hooks, typed ledger item reference và tests. `InvoiceItem.SourceInvoiceItemId` links paid difference items to the root class item; Enrollment keeps source/current transfer lineage.

**Migration và DB test đã dùng:** Thêm `ClassThresholdResponsesAndTransferRebooking`, tạo bảng decision token và đổi unique `Enrollment.InvoiceItemId` thành unique chỉ cho enrollment Confirmed; `ClassTransferInvoiceChain` adds invoice lineage. Thêm migration refund ở checkpoint P1.08. Chưa áp migration lên DB.

**Lệnh kiểm tra + kết quả thực tế:** Release build pass (gần nhất 0 warning/0 error); `PointRefundCalculatorTests` 8/8; `CourseScheduleRulesTests` 5/5; EF `has-pending-model-changes` không phát hiện drift. Refund integration 0/3 do Testcontainers không kết nối được Docker named pipe `npipe://./pipe/docker_engine` (Access denied).

**Contract đã đổi:** thêm `POST /api/manager/classes/{classId}/threshold/waive`, `PUT /api/manager/classes/{classId}/threshold/pricing`, và `POST /api/class-threshold-responses` (Member; body token/choice/targetClassId). `/api/refunds` đã có từ P1.08.

**Vấn đề chưa xong / test đang lỗi:** P1.09 checkout chênh, refund value-chain đã code nhưng chưa xác minh integration, timeout/retry và late payment bằng PostgreSQL; race tests còn thiếu. Expiry/evaluator chưa verify bằng PostgreSQL. P1.08 vẫn thiếu Rental.

**Bước tiếp theo cụ thể:** rà soát P1.09 checkout difference/late-payment semantics, viết PostgreSQL integration tests; sau đó P1.10 Rental rồi quay lại đóng P1.08.

## Lịch sử — Checkpoint P1.08 Refund bằng điểm, đang triển khai 01/10/2026

**Chặng hiện tại / đã hoàn tất:** Đang triển khai P1.08. Đã thêm point refund theo InvoiceItem cho Membership/PT/Class và system-event credit; **chưa qua gate** vì cần rental fulfillment của P1.10 và PostgreSQL integration tests chưa chạy được. P1.08 survey checkpoint ngay dưới đây đã được supersede.

**Commit hoặc trạng thái working tree:** branch `develop`, chưa commit. Giữ nguyên `.claude/settings.local.json` chưa track. Các code thay đổi P1.08 hiện ở working tree.

**File thêm / sửa / xóa:** Thêm calculator, refund API/DTO/service, Membership refund port/service, PT/Class fact/cancel hooks, point-ledger InvoiceItem reference, test calculator + integration suite. Sửa PointWallet, PaymentAdjustment/response/query, PackagePurchase, DI, refund tests, API contract và migrations. Đã xóa `CompleteAdjustmentRequest` và route `/api/payment-adjustments/{id}/complete`.

**Migration và DB test đã dùng:** Thêm `PointRefundWorkflowFields`, `MemberPackageInvoiceItem` (backfill typed package→item từ legacy `RelatedEntityId`), `PointLedgerInvoiceItemReference` và `PointRefundLedgerReference`; migration history/model drift được kiểm tra qua EF. **Chưa áp migration lên DB.** Trong lúc gọi `dotnet ef migrations remove`, EF chỉ đọc `__EFMigrationsHistory` của DB cấu hình localhost:5435, không chạy migration/schema mutation; đã khôi phục migration đúng trong repo.

**Lệnh kiểm tra + kết quả thực tế:** `dotnet build backend/SportHub.sln --configuration Release --no-restore` pass (4 warning cũ Security.Tests); `PointRefundCalculatorTests` 8/8 pass; `dotnet ef migrations has-pending-model-changes --configuration Release --no-build` báo không đổi model; `git diff --check` không lỗi whitespace. `RefundWorkflowTests` 0/3 chạy được: Testcontainers thất bại trước khi test vì Docker named pipe bị Access denied. Chưa đánh dấu integration pass.

**Contract đã đổi:** Thêm `/api/refunds` GET/POST/approve/reject. POST body `{invoiceItemId, reason}`, approval `{centerFault, reason}`; server tính điểm, Manager không nhập điểm trực tiếp. Refund mới ghi điểm và entitlement; route complete payout bị loại. Refund legacy/Discount/Correction vẫn có thể đọc ở `/api/payment-adjustments`; legacy Refund không thể tạo/duyệt payout qua route mới.

**Vấn đề chưa xong / test đang lỗi:** Rental item hiện trả `refund_rental_unavailable` tới khi hoàn thành P1.10. Chưa có PostgreSQL integration evidence cho atomic rollback, duplicate approval/cap concurrency, split refund, migration upgrade. Đường cancellation PT/Class cần kiểm trên DB thật; test integration viết nhưng môi trường Docker hiện bị chặn.

**Cập nhật tiếp tục 01/10/2026:** Thêm migration `PointLedgerItemScopedIdempotency` cho unique ledger key phân biệt item và event; lock invoice → item trong system credit để serialize cumulative cap với manager refund. Ngăn refund thông thường trên PT/Class entitlement đã inactive; centerFault vẫn qua rule riêng. Sửa integration assertion POST `/api/refunds` theo response `200 OK`.

**Kiểm tra cập nhật:** `dotnet build backend/SportHub.sln -c Release --no-restore` pass, 0 error (4 warning cũ tại Security.Tests); `PointRefundCalculatorTests` 8/8 pass; `dotnet ef migrations has-pending-model-changes ... --no-build` pass sau migration idempotency; `git diff --check` không phát hiện whitespace. Chưa áp migration và chưa chạy được PostgreSQL integration vì Docker named pipe access denied.

**Bước tiếp theo cụ thể:** hoàn tất P1.08 sau khi P1.10 thêm Rental fulfillment và có PostgreSQL test runtime. Tiếp tục P1.09 threshold/transfer, rồi P1.10; sau đó quay lại nối Rental refund. Kế tiếp P1.11–P1.13 và plan 2 theo đúng thứ tự.

---

## Checkpoint — P1.08 Refund bằng điểm, khảo sát tiếp tục 01/10/2026

**Chặng hiện tại / đã hoàn tất:** Đã đọc P1.08 và khảo sát implementation sau P1.07; P1.08 **chưa triển khai/chưa qua gate**. Tiến độ gần nhất trong file này vẫn là P1.07; các mục P1.08 trở đi trong plan chưa được đánh dấu hoàn tất.

**Commit hoặc trạng thái working tree:** branch `develop`; thay đổi P1.07 và trước đó vẫn ở working tree. Không sửa/xóa `.claude/settings.local.json` chưa track. Lượt này chỉ cập nhật tài liệu.

**File thêm / sửa / xóa:** sửa `docs/refactor-progress.md`, `docs/refactor-api-contract.md`; không đổi code/schema.

**Migration và DB test đã dùng:** Không tạo/chạy migration, không kết nối DB.

**Lệnh kiểm tra + kết quả thực tế:** Đọc kế hoạch P1.08, contract, evidence, `PaymentAdjustmentService`, wallet/fulfillment ports và model. Không chạy build/test trong lượt khảo sát.

**Contract đã đổi:** Ghi rõ contract refund đích ở Phần H. Contract runtime hiện vẫn là route legacy `api/payment-adjustments` (bao gồm `/complete` chi tiền), chưa phải contract P1.08.

**Vấn đề chưa xong / test đang lỗi:** `PaymentAdjustment.Refund` hiện là workflow refund tiền `Requested → Approved → Completed` với lễ tân complete payout; `RefundCalculator` dùng giá MembershipPackage và tính theo toàn Invoice, không theo InvoiceItem. Không có `InvoiceItemId`, `CenterFault`, `SystemCalculatedPoints`, `ApprovedPoints` hay ledger reference trên adjustment. `IRefundCreditService` chỉ là interface, chưa có implementation/DI; Membership fulfillment chỉ cancel, PT fulfillment chỉ cancel entitlement ID, Class fulfillment cancel theo item, Rental fulfillment chưa có. Vì vậy chưa thể an toàn áp dụng cap theo item, tiêu thụ PT, ownership và hủy đúng quyền lợi xuyên module. Các file legacy và migration lưu chứng cứ payout cần được bảo toàn đến khi có migration chuyển dữ liệu; không xóa `CompleteAdjustmentRequest`/route trước bước chuyển contract có kiểm chứng.

**Bước tiếp theo cụ thể:** P1.08 implementation phải bắt đầu bằng schema chuyển đổi `PaymentAdjustment` thành refund theo `InvoiceItemId` (giữ AdjustmentId/legacy payout fields đọc được), typed fulfillment query/cancel cần thiết cho Membership/PT/Class/Rental, sau đó `RefundCalculator` theo BR-90–94 ngày Việt Nam và điểm floor VND/1000; implement/register `RefundCreditService` với `IPointWalletService` trong transaction caller; thay approve thành credit + fulfillment atomic; bổ sung direct system-event credit và test cap/item-split/PT consumed/class/session/rental/rollback/double-approval. Chỉ khi đó gỡ route complete payout mới.

---

## Checkpoint — P1.07 Checkout và VNPay, 30/09/2026

Đã triển khai checkout Membership, lớp theo khóa và PT: `CheckoutSession`/`VerifiedGatewayEvent`, idempotency key, giữ chỗ/điểm, PaymentAttempt, URL VNPay, IPN và QueryDR, 100% điểm, Paid + Spend + cấp quyền lợi trong một transaction, hủy/hết hạn, retry tạo invoice/cycle mới, callback trùng và khoản thu thứ hai được bồi hoàn đúng một lần. Return URL chỉ đọc; mock thanh toán chỉ chạy ở Development. PT dùng giá setting có phiên bản; giá Membership/lớp mới phải là bội số 1.000 VND. Khoản QueryDR thực thu không đổi chính xác sang điểm sẽ nhả hold, lưu `ManualCompensationRequired`, giữ nguyên số tiền để đối soát thủ công.

**Kiểm chứng lượt này:** Payment 92/92; trong lượt chạy toàn solution, Administration 15/15, Scheduling 86/86, Security 130/130 cũng pass. Training không khởi chạy được vì Windows Application Control chặn DLL test (`0x800711C7`) cả sau build lại; lượt kiểm trước thay đổi middleware đạt 80/80. `git diff --check` không có lỗi whitespace.

**Chưa đạt toàn bộ gate P1.07:** checkout thuê sân phụ thuộc domain CourtRental của P1.10, hiện chưa có; chưa thử merchant sandbox VNPay với thông tin merchant thực, chưa chạy migration trên DB dev. Mã hiện hành vẫn giữ API thu tiền thủ công cho hóa đơn legacy, nhưng checkout mới chặn đường đó. Bằng chứng kiểm thử xem `refactor-backend-evidence.md`; contract mới ở Phần G của `refactor-api-contract.md`.

---

## Checkpoint — P1.05 Lớp theo khóa, điểm danh, Gym và PT, 30/09/2026

**Đã hoàn thành gate P1.05:** publish sinh đủ buổi và giữ phòng/Coach nguyên tử; Draft không hiện public; ghi danh theo khóa chỉ do fulfillment sau thanh toán, chỗ giữ có điều kiện chống vượt sĩ số; dời/hủy buổi giữ ghi danh, buổi hủy phải có buổi bù; điểm danh Present/Absent do Receptionist trong 24 giờ, có audit; Gym checkout dùng giờ server và idempotent; PT giữ quota, occupancy, no-show, workout/homework.

**Sửa bổ sung ở checkpoint này:** khóa Draft khi sửa để không đua với publish; sửa truy vấn EF cho danh sách/chi tiết lớp, buổi và roster; kiểm lại sức chứa, loại phòng và chuyên môn Coach khi dời/bù; chống dời lịch vào khung giờ của học viên đã ghi danh hoặc đang giữ chỗ (có khóa giao dịch dùng chung với reserve/confirm); chặn ghi danh sau buổi đầu kể cả khi job trạng thái chạy chậm; kiểm quy tắc lịch không trùng/không sai thứ. Publish ghi audit và xếp thông báo Coach vào outbox cùng transaction; rollback thì không có thông báo. Điểm danh kiểm actor hoạt động ngay trong service, ghi audit khi tạo/sửa, gọi lại cùng trạng thái không ghi lặp. PT có job tự chốt NoShow sau giờ kết thúc bằng cùng transition quota có khóa của service; khi đổi Coach, buổi có phòng chỉ chuyển nếu Coach mới vẫn dạy được trong phòng/giờ đó.

**Kiểm chứng:** `dotnet test backend/SportHub.sln --no-restore -v quiet`: **389/389 pass**, không skip (Administration 15, Payment 78, Scheduling 86, Security 130, Training 80). Sau đó thêm thông báo publish và siết trạng thái điểm danh: chạy lại **7/7 CoursePublishTests**, **8/8 CourseAttendanceTests** (Release) đều pass. Có 4 warning cũ ở Security.Tests. Test mới dùng PostgreSQL 16 qua Testcontainers, gồm lịch/publish/rollback, điểm danh/RBAC/24 giờ, seat hold concurrency, Gym checkout và PT occupancy/no-show. Chưa áp migration lên DB dev. Toàn bộ thay đổi P1.05 và P1.06 vẫn ở working tree, chưa commit/push.

**Giới hạn tiếp theo:** Payment chưa tạo checkout course/rental, chưa đánh dấu Paid/Spend/Confirm enrollment bằng luồng trả tiền thật; đó là P1.07. Publish hiện xếp thông báo in-app cho Coach; email/outbox nâng cao thuộc P1.11. Xem `refactor-handover-2026-09-30.md` để tiếp tục.

---

## Checkpoint — P1.06 Wallet và xác nhận điểm tại quầy, 30/09/2026

**Đã triển khai và kiểm chứng gate ví/OTP:** ví integer points, Hold/Release/Spend/Earn/Adjustment, ledger append-only, idempotency, kiểm quyền và audit; bổ sung OTP tại quầy 6 số, tối đa 5 phút/5 lần sai, gửi lại sau 60s với cùng lựa chọn; code cũ vô hiệu khi gửi lại/đổi điểm/bỏ chọn. Xác nhận khóa invoice → confirmation → wallet và cập nhật hold, split điểm/tiền, consume OTP cùng transaction. Lần nhập sai được commit độc lập, không bị rollback khi trả lỗi.

**Thay đổi trong lượt này:**
- `PointConfirmationService`, controller/DTO, entity/configuration; request gắn Member + revision hóa đơn + lễ tân; số điểm giữ vẫn 0 trước OTP đúng. Mã lưu PBKDF2 + salt, không có mã rõ trong audit/response.
- Self selection dùng subject JWT cho Member/ExternalCoach; GET trạng thái, clear lựa chọn tại quầy; job giải phóng điểm khi quá hạn hoặc hóa đơn Void. Ledger Release ghi đúng actor thực hiện (job dùng actor null).
- Invoice thêm `CheckoutCycleId`, `CheckoutRevision`, `HoldExpiresAtUtc`, `PointsApplied`, `CashAmount`. Mua gói mới snapshot `hold.minutes`; legacy invoice giữ dữ liệu cũ và không tự mở chu kỳ mới. Chặn đường thu tiền/điều chỉnh cũ khi đang xác nhận hoặc giữ điểm.
- Email log chỉ khi Development + `Email:DemoLoggingEnabled=true`; thiếu SMTP ngoài chế độ này thì gửi email thất bại rõ ràng, không ghi OTP vào log. Có rate limit yêu cầu mã.
- Migration `20260930070000_MultiSportPointConfirmation` + designer + snapshot. EF CLI bị Windows Application Control chặn load assembly; migration được viết thủ công và kiểm bằng PostgreSQL thật, bao gồm nâng cấp có hóa đơn/payment cũ và kiểm model drift.

**Kiểm tra:** Release build pass; toàn bộ backend **359/359**, không skip (Administration 15, Payment 78, Scheduling 59, Security 130, Training 77). Trong đó 12 test mới: 11 OTP/concurrency/rollback/RBAC/model và 1 migration upgrade. Có 4 warning sẵn có ở Security.Tests khi rebuild. Chưa áp migration lên DB dev của nhóm.

**Ranh giới với P1.07:** `Confirmed` ở API điểm chỉ nghĩa là đã xác nhận và **Hold**, chưa Paid/Spend/Fulfilled, kể cả CashAmount=0. QR/VNPay, Spend + fulfillment, checkout retry/late payment vẫn thuộc P1.07. Cycle hiện được snapshot trên Invoice; P1.07 cần chuyển thành entity `CheckoutSession` theo plan và dùng đúng reference cycle đã giữ điểm. Chưa có luồng mua course/rental bằng điểm hoàn chỉnh; không gọi phase checkout là đã xong.

Contract hiện hành: Phần E của `refactor-api-contract.md`. Các checkpoint bên dưới là lịch sử, không mô tả tiến độ mới nhất.

---

## Checkpoint — P1.04 (Catalog + occupancy) hoàn tất 30/09/2026

**Đã hoàn tất:** P1.00, P1.01, P1.02 đợt 1 (nay gộp cả occupancy), P1.03 (phần lớn), **P1.04**. Quyết định của bạn: **gỡ `CoachCategory` hẳn (không shim)** — sẽ làm ở P1.05 cùng lúc chuyển Training/AI/seeder sang `ICoachSpecialtyReader`, rồi mới tạo `CoachAdminService` và drop cột. Chưa làm trong lượt này.

**Working tree:** branch `develop`, chưa commit.

**Migration — LƯU Ý ĐỔI TÊN/GỘP:** migration `20260929203727_MultiSportIdentityCatalog` nêu ở checkpoint P1.02 **không còn tồn tại**: một lệnh `dotnet ef migrations remove --no-build` chạy trên bản build Debug cũ đã xóa nhầm nó. Tôi đã dựng lại từ model (vẫn nguyên) thành **một migration duy nhất `20260929210732_MultiSportIdentityCatalog`** gồm cả Identity + Catalog + Occupancy, đã sửa tay lại hai chỗ như bản trước (backfill `security_stamp` mỗi user một giá trị bằng `gen_random_uuid()`; `rooms.is_active` mặc định `true`) và thêm exclusion constraint. Bài học: `dotnet ef` mặc định dùng cấu hình Debug; luôn build/chạy đúng cấu hình, không dùng `--no-build` khi vừa đổi model.

**Đã làm (backend/):**
- **DB chống trùng lịch:** `btree_gist`; bảng `room_occupancies`, `coach_occupancies` (source_type, source_id unique, `is_active`, CHECK end > start) + hai exclusion constraint `EXCLUDE USING gist (room_id|coach_id WITH =, tstzrange(start_at_utc, end_at_utc, '[)') WITH &&) WHERE (is_active)` (SQL thô trong migration vì EF không mô hình hóa EXCLUDE). Liền kề hợp lệ; dòng inactive không chặn; cùng coach ở hai phòng cùng giờ bị chặn.
- **`OccupancyService` (IOccupancyService):** Reserve/Replace (upsert theo nguồn), Release (IsActive=false, đặt lại thì dùng lại dòng). Kiểm trước để trả danh sách xung đột; khi race và DB bắn 23P01 mà caller đang trong transaction → rollback về **savepoint** (transaction của caller vẫn dùng tiếp), khôi phục tracker, trả `OccupancyResult` thất bại. Lịch cũ giữ nguyên nếu dời lỗi. `ISportHubDbContext` thêm `Entry<T>()` (generic, để khôi phục tracker).
- **`AvailabilityService` + `AvailabilityController`:** phòng trống (phòng active, loại phòng chơi được môn, trong giờ mở cửa VN, không block/occupancy), coach trống (theo `ICoachSpecialtyReader.GetCoachIdsForSportAsync` mới thêm, trừ coach bận), danh sách khoảng bận của phòng. Giới hạn: khoảng ≤ 12 giờ, busy ≤ 31 ngày.
- **Catalog:** `SportCatalogService`, `RoomTypeService`, `RoomOpeningHourService`, `RoomBlockService`, `CourtRateService` + `CatalogContracts.cs` + 5 controller (`Sports`, `RoomTypes`, `RoomOpeningHours`, `RoomBlocks`, `CourtRates`). `SportCatalogReader` (từ P1.03) vẫn là bản cài đặt của `ISportCatalogReader`.
- **`RoomService`/`RoomsController`:** `RoomTypeId`, `IsActive` (null = giữ nguyên khi update), kiểm loại phòng tồn tại, xóa chặn khi có class/session/occupancy/block tham chiếu và xóa kèm giờ mở cửa.
- **`ExceptionHandlingMiddleware`:** `OccupancyConflictException` → 409 `occupancy_conflict` kèm mảng `conflicts`; ràng buộc DB chưa được service bắt: 23P01 → 409 `occupancy_conflict`, 23505 → 409 `duplicate_value`, 23503 → 409 `reference_violation`, 23514 → 400 `constraint_violation`, `DbUpdateConcurrencyException` → 409 `concurrency_conflict` (không lộ SQL/tên ràng buộc).
- **Audit:** giá trị audit của Catalog/Room được serialize bằng `System.Text.Json` (cột `old_value/new_value` là `json`; ghép chuỗi tay làm hỏng khi tên có dấu `"`/xuống dòng — đã có test). Lưu ý: các service cũ (Identity/Administration/…) còn ghép JSON thủ công với dữ liệu tự do (ví dụ email/tên) — rủi ro tương tự, chưa sửa.

**Quy tắc nghiệp vụ đã cố định:**
- Môn: tên unique không phân biệt hoa thường; GroupCourse bắt buộc có phút + sức chứa mặc định; **không đổi `operationType` sau khi tạo**; ngừng hoạt động thay xóa. Public `GET api/sports` chỉ trả môn active, không cần đăng nhập.
- Giờ mở cửa: một khoảng mỗi ngày mỗi phòng, giờ VN (UTC+7 cố định), không bắc qua nửa đêm; ngày vắng = đóng cửa. Không sửa lịch đã đặt khi đổi.
- Khung giá thuê sân: giá > 0 và bội 1.000, không cho hai khung **active** chồng lấn cùng loại sân + ngày + phạm vi môn (môn `null` chồng với mọi môn); môn phải chơi được ở loại sân (BR-108). Chưa có tính tổng giá theo khối 60 phút — thuộc P1.10.
- Block phòng: chỉ Manager; chồng lịch → 409 kèm danh sách, **không tự hủy/hoàn tiền**; block do sự cố (`incidentId`) không xóa tay (P1.11).

**File thêm:** `Scheduling/Occupancy/{Domain/{OccupancySourceType,RoomOccupancy,CoachOccupancy},Persistence/{RoomOccupancy,CoachOccupancy}Configuration,Application/{OccupancyService,AvailabilityService},Api/AvailabilityController}.cs`; `Scheduling/Catalog/Application/{CatalogContracts,SportCatalogService,RoomTypeService,RoomOpeningHourService,RoomBlockService,CourtRateService}.cs`; `Scheduling/Catalog/Api/{Sports,RoomTypes,RoomOpeningHours,RoomBlocks,CourtRates}Controller.cs`; `BuildingBlocks/Abstractions/Scheduling/OccupancyConflictException.cs`; tests `SportCatalogTests.cs`, `OccupancyConcurrencyTests.cs`.
**File sửa:** `RoomService`, `SaveRoomRequest`, `RoomResponse` (thêm `roomTypeId`, `isActive`), `ExceptionHandlingMiddleware`, `ISportHubDbContext`, `ICoachSpecialtyReader` + `CoachSpecialtyReader`, `SportHubDbContext` (DbSet + `btree_gist`), `CrossModuleRelationships` (FK `coach_occupancies.coach_id → user_accounts`), `Program.cs` (DI).
**Xóa:** không.

**Kiểm tra:**
- Build Release 0 lỗi. `has-pending-model-changes`: không đổi.
- Migration trên PostgreSQL 16 container tạm (đã xóa): nâng cấp từ `AddPtTrainingDomain` có dữ liệu (3 user → 3 stamp khác nhau, phòng cũ `is_active=true`), DB trắng chạy sạch; thử thật: chồng lấn → 23P01, liền kề OK, khác phòng cùng giờ OK, dòng inactive không chặn, `end<=start` bị CHECK, trùng nguồn bị unique, cùng coach hai phòng chồng giờ → 23P01.
- Test: Scheduling **87/87** (từ 65; +22: catalog, RBAC, gợi ý trống, occupancy concurrency gồm race thật bằng hai transaction song song + savepoint, replace lỗi giữ lịch cũ, release/đặt lại, block 409 có danh sách). Security 124/124, Payment 51/51, Administration 15/15 pass. Training 71/77 (6 lỗi có sẵn, không đổi).

**Contract đổi:** xem Phần D của `refactor-api-contract.md`. `RoomResponse` thêm 2 trường; `SaveRoomRequest` thêm 2 trường tùy chọn (tương thích ngược). Wire enum vẫn PascalCase.

**Chưa làm / hạn chế:**
1. Chưa có consumer thật của `IOccupancyService` (ClassSession/PT/Rental) — nối ở P1.05 (PT), P1.05 (lớp), P1.10 (thuê sân). Chưa có test "PT + lớp + block + thuê sân tranh nhau" vì các nguồn chưa nối (gate P1.10).
2. Chưa kiểm room/sport active + giờ mở cửa ở đường đặt lịch (các service đặt lịch chưa viết); `RoomOpeningHourService.IsOpenAsync` và `SportCatalogReader.IsRoomCompatibleAsync` đã sẵn sàng để dùng.
3. Court Schedule (lịch tuần theo phòng có phân loại nguồn/coach/roster) chưa làm — P1.10.
4. `Room.Capacity` cũ và `Class.DefaultRoomId`… vẫn theo mô hình lớp cũ đến P1.05.
5. Audit JSON thủ công ở module khác (xem trên).
6. 6 test Training lỗi có sẵn.

**Bước tiếp theo cụ thể (P1.05):** (a) gỡ CoachCategory: thay `RequireCategoryAsync/RequireCoachWithProfileAsync` trong `CoachMemberRelationshipService`, `PtEntitlementLifecycleService`, `PtSessionService`, `PtCoachChangeRequestService`, `WorkoutService`, `HomeworkService`, `ClassService`, AI, `DemoDataSeeder` bằng `ICoachSpecialtyReader`; tạo `CoachAdminService` + `CoachesController` (Manager tạo Coach kèm sportIds) + backfill specialty cho Coach hiện có; migration drop `coach_categories`; xóa `CoachCategory`, `ICoachProfileReader`, `CoachProfileReader`, `UserSummaryResponse.CoachCategory`. (b) Đợt migration `MultiSportCourseOccupancy`: `ClassScheduleRule`, `SeatHold`, sửa `Class/ClassSession/Enrollment/Attendance/GymCheckIn/PtSession(RoomId)` — **drop dữ liệu lớp demo, cần backup trước** (đọc hết FK cũ; đừng xóa WorkoutResult). (c) Nối PT vào `IOccupancyService`. Cần bạn xác nhận: được phép drop dữ liệu lớp demo hiện có không.

---

## (Lịch sử) Checkpoint — P1.03 (phần lớn) hoàn tất 30/09/2026

**Đã hoàn tất:** P1.00, P1.01 (ports/role/policy), P1.02 đợt 1 (Identity + Catalog), **P1.03 phần mật khẩu/token/ExternalCoach** (chi tiết dưới). **Chưa xong P1.03:** `CoachAdminService`/`CoachesController` (Manager tạo Coach nội bộ kèm chuyên môn), gỡ `CoachCategory`/`ICoachProfileReader`, ví ExternalCoach, `CoachProfile.Bio` — lý do ở mục "Chưa làm".

**Working tree:** branch `develop`, chưa commit. Không có migration mới trong chặng này (schema đã có từ P1.02 đợt 1).

**Đã làm (backend/):**
- `PasswordPolicy` (8–64 ký tự Unicode, đủ 4 nhóm, không chứa local-part email, không phân biệt hoa/thường) + `PasswordPolicyGuard` (400, mã lỗi `password_too_short|password_too_long|password_missing_character_groups|password_contains_email|password_confirmation_mismatch`). Áp cho Register, Google onboarding (email lấy từ phiếu), Reset, Change, đăng ký ExternalCoach, SysAdmin tạo staff. Login KHÔNG áp policy (tài khoản cũ).
- `PasswordHasher`: hash mới `v2$` + BCrypt enhancedEntropy (không cắt 72 byte); verify được BCrypt thuần cũ; `IPasswordHasher.NeedsRehash` (default interface method) — Login đúng thì rehash sang v2. Bỏ `MaxPasswordBytes(72)` khỏi DTO; giới hạn input còn `MaxLength(200)`.
- Security stamp: JWT có claim `sst` (`JwtService.GenerateAccessToken(..., securityStamp)`); middleware `AccountStatusJwtExtensions` so `sst` và role trong token với DB (`IUserAccountRepository.GetAuthStateAsync`, 1 query). Token thiếu `sst`, sai stamp hoặc sai role → 401. Stamp đổi khi: đổi mật khẩu, reset mật khẩu, đổi vai trò (`UserAdminService.ChangeRoleAsync`).
- Quên/đặt lại mật khẩu: `EmailOtpFlow` (OTP 6 số/10 phút/5 lần sai/60s gửi lại, chỉ mã mới nhất, băm SHA-256; đếm sai bằng UPDATE nguyên tử; consume bằng UPDATE có điều kiện trong transaction đổi mật khẩu, nên hai request đồng thời chỉ một thắng), `PasswordResetService`.
- Đổi mật khẩu khi đăng nhập: `POST api/users/me/password` nay nhận `ChangePasswordRequest` (currentPassword, newPassword, confirmNewPassword), mật khẩu mới phải khác cũ, trả `200 { accessToken }` (JWT mới), token cũ mất hiệu lực. Google-only đặt lần đầu: currentPassword bỏ trống.
- ExternalCoach: `ExternalCoachService` (OTP đăng ký, đăng ký trong 1 transaction gồm tiêu OTP + user + hồ sơ Pending + chuyên môn + audit; xem hồ sơ của chính mình; Manager duyệt/từ chối/đình chỉ/mở lại bằng UPDATE có điều kiện + audit + email báo sau commit). Role không nhận từ body. Bản cài đặt 3 port Identity: `UserAccessReader`, `CoachSpecialtyReader`, `ExternalCoachAccessReader` (`IdentityPortReaders.cs`). `SportCatalogReader` (Scheduling/Catalog/Application) là bản cài đặt sớm của `ISportCatalogReader` (thuộc P1.04) để Identity kiểm môn hợp lệ.
- `UserSummaryResponse`/`AuthResponse.User` thêm `approvalStatus` (ExternalCoach) và `sportIds` (Coach/ExternalCoach) qua `UserSummaryFactory`; `coachCategory` giữ tạm (DEPRECATED).
- `UserAdminService`: SysAdmin không tạo/gán/đổi ngược vai trò ExternalCoach (`external_coach_managed_separately`); vẫn không có đường Manager tạo Admin (`POST api/users` chỉ SystemAdministrator).

**File thêm:** `Identity/Domain/Rules/PasswordPolicy.cs`; `Identity/Application/Services/{PasswordPolicyGuard,OtpCodes,EmailOtpFlow,PasswordResetService,ExternalCoachService,IdentityPortReaders,UserSummaryFactory}.cs`; `Identity/Application/Interfaces/{IPasswordResetService,IExternalCoachService}.cs`; `Identity/Application/Commands/{ChangePasswordRequest,ForgotPasswordRequest,ResetPasswordRequest,RegisterExternalCoachRequest,ReviewExternalCoachRequest}.cs`; `Identity/Application/DTOs/ExternalCoachResponse.cs`; `Identity/Api/ExternalCoachesController.cs`; `Scheduling/Catalog/Application/SportCatalogReader.cs`. Test: `PasswordPolicyTests.cs` (+`PasswordHasherV2Tests`), `PasswordResetTests.cs`, `ExternalCoachApprovalTests.cs`.
**File sửa chính:** `PasswordHasher`, `IPasswordHasher`, `AuthService`, `GoogleAuthService`, `AccountService`+`IAccountService`, `AccountController`, `AuthController`, `JwtService`, `AccountStatusJwtExtensions`, `IUserAccountRepository`+repo, `UserAdminService`, DTO request (bỏ 72 byte), `Program.cs` (DI + rate limit policy `auth-password-reset` 3/phút/IP). Test doubles/factories cập nhật stamp (`StampOf`).
**Xóa:** `SetPasswordRequest` (thay bằng `ChangePasswordRequest`).

**Kiểm tra:** build Release 0 lỗi. Security.Tests **124/124 pass** (từ 90). `has-pending-model-changes`: không đổi. Toàn solution đã chạy giữa chặng (Administration 15, Payment 51, Scheduling 65 pass; Training 71/77 với 6 lỗi có sẵn, không đổi) nhưng chưa chạy lại toàn solution sau các sửa cuối; sau các sửa cuối chỉ chạy lại Security.

**Contract đổi:** xem `refactor-api-contract.md` Phần C. Breaking cho FE: `POST api/users/me/password` (body và response), JWT có `sst` (token cũ không có `sst` bị 401, phải đăng nhập lại), chính sách mật khẩu mới ở Register/Google onboarding.

**Quyết định kỹ thuật cần ghi vào Design (chưa cập nhật Design v3):** hash `v2$`+BCrypt enhancedEntropy thay vì ASP.NET PasswordHasher; consume OTP bằng UPDATE điều kiện; đổi mật khẩu trả token mới; rate limit reset chỉ theo IP (chưa theo email).

**Chưa làm / lý do:**
1. `CoachAdminService` + `CoachesController` (Manager tạo Coach nội bộ, gán chuyên môn) và `SaveCoachRequest`: `CoachProfile.CoachCategory` còn NOT NULL và Training/AI/seeder còn dùng; tạo Coach mới qua API v3 sẽ phải bịa category. Làm cùng lúc gỡ category ở P1.05 (thay `RequireCategoryAsync` bằng `ICoachSpecialtyReader`), sau đó migration drop `coach_category`, xóa `CoachCategory`, `ICoachProfileReader`, `CoachProfileReader`. Hiện `POST api/users` (SysAdmin) vẫn nhận `coachCategory` như cũ và KHÔNG tạo `UserSportSpecialty` cho Coach.
2. Ví điểm cho ExternalCoach (tạo cùng transaction đăng ký) — chưa có `IPointWalletService`; sẽ tạo lazily + backfill ở P1.06.
3. Email OTP/thông báo duyệt gửi trực tiếp qua `IEmailSender` (chưa outbox có retry) — P1.11. OTP quên mật khẩu gửi lỗi được nuốt + ghi log để giữ phản hồi trung tính.
4. `CoachProfile.Bio` (Design) chưa thêm; ExternalCoach.Bio đã có ở `ExternalCoachProfile`.
5. Rate limit reset theo email+IP chưa có (chỉ IP + cooldown 60s theo email).
6. Chưa có test riêng "Google onboarding bị policy chặn"; các test Google cũ vẫn pass với mật khẩu test mới.

**Vấn đề còn lại:** 6 test Training lỗi có sẵn. `.env` ghi đè connection string khi chạy `dotnet ef` (xem checkpoint P1.02); chưa áp migration lên DB dev.

**Bước tiếp theo cụ thể:** P1.04 — `Catalog/Application/{SportCatalogService,RoomTypeService,RoomOpeningHourService,RoomBlockService,CourtRateService}.cs`, `CatalogContracts.cs`, controllers Catalog (public GET môn active, Manager ghi), mở rộng `RoomService`/`RoomsController` cho `RoomTypeId`/`IsActive`; sau đó đợt migration occupancy (`btree_gist`) để làm `OccupancyService`. Cần quyết định: gỡ category ngay ở P1.05 (khuyến nghị) hay làm `CoachAdminService` tạm với shim category.

---

## (Lịch sử) Checkpoint — P1.02 đợt 1 (Identity + Catalog) hoàn tất 30/09/2026

**Đã hoàn tất:** P1.00; P1.01 (ports, role/policy — xem mục dưới); **P1.02 đợt 1: migration `20260929203727_MultiSportIdentityCatalog`** (chỉ thêm mới, không drop dữ liệu). Chưa xong P1.02: các đợt migration còn lại (xem "Bước tiếp theo").

**Working tree:** branch `develop`, chưa commit.

**File thêm (backend/):**
- Identity: `Domain/Enums/{ExternalCoachApprovalStatus,EmailOtpPurpose}.cs`, `Domain/Entities/{ExternalCoachProfile,UserSportSpecialty}.cs`, configuration tương ứng.
- Scheduling/Catalog: `Domain/{SportOperationType,Sport,RoomType,SportRoomType,RoomOpeningHour,RoomBlock,CourtRate}.cs`, `Persistence/*Configuration.cs` (7 file).
- Host: `SportHub.API/Persistence/CrossModuleRelationships.cs` (FK scalar `user_sport_specialties.sport_id → sports`), DbSet mới trong `SportHubDbContext`.
- Migration `20260929203727_MultiSportIdentityCatalog` (+ Designer, snapshot cập nhật).
**File sửa:** `UserAccount` (+SecurityStamp Guid), `EmailOtp` (+Purpose; unique đổi từ `email` sang `(email, purpose)`), `AuthService` (2 truy vấn OTP lọc `Purpose == Register`), `Room` (+RoomTypeId nullable, +IsActive) + configuration, `RoleConfiguration` (seed ExternalCoach RoleId=6).
**Xóa:** không.

**Nội dung schema mới:** `sports`, `room_types`, `sport_room_types`, `room_opening_hours` (PK ghép room+day), `room_blocks`, `court_rates`, `external_coach_profiles`, `user_sport_specialties`. Ràng buộc: tên sport/room type unique không phân biệt hoa thường (citext); GroupCourse bắt buộc có default phút + sức chứa; giá `> 0 và % 1000 = 0`; giờ đóng > giờ mở; block end > start; FK Restrict (không cascade).
**Dữ liệu tham chiếu seed trong migration:** 4 sport (Gym/WalkIn, Personal Training/OneOnOne, Cầu lông và Bóng rổ/GroupCourse — 90'/12 chỗ và 120'/20 chỗ là giá trị gợi ý Design), 4 room type, tương thích 1-1, Role ExternalCoach.

**Migration và DB test:** kiểm trên PostgreSQL 16 container tạm (đã xóa), không đụng DB dev.
- Nâng cấp: áp `0 → AddPtTrainingDomain`, chèn 3 user/1 room/1 OTP, áp script tăng dần → `security_stamp` mỗi user khác nhau (3/3), room cũ `is_active=true`, OTP cũ `purpose=0`, role 6 và 4 sport có mặt.
- DB trắng: script `0 → latest` chạy sạch.
- Ràng buộc thử thật: tên sport trùng hoa/thường, GroupCourse thiếu default, giá không bội 1000, giờ ngược, FK sport không tồn tại, chuyên môn trùng, OTP cùng email khác purpose (ok) / trùng purpose (lỗi) — kết quả đúng như mong đợi.
- `has-pending-model-changes`: không có thay đổi.

**Lệnh kiểm tra + kết quả:** `dotnet build` 0 lỗi; `dotnet test`: Administration 15, Security 90, Payment 51, Scheduling 65 pass; Training 71/77 (6 lỗi có sẵn như baseline, không thêm lỗi).

**Lưu ý vận hành quan trọng:** `Program.cs` nạp `.env` ở thư mục gốc bằng DotNetEnv và nó GHI ĐÈ biến môi trường `ConnectionStrings__Default`. Vì vậy `dotnet ef database update` luôn nhắm vào DB trong `.env` (DB dev, cổng 5435), kể cả khi đã export biến khác. Trong lượt này một lệnh `database update` lỡ nhắm vào DB dev và bị dừng an toàn ở migration cũ `AddPaymentAttemptAndFullPaymentInvoice` (chặn vì DB dev có invoice status=1; **không có migration nào được áp lên DB dev**, `migrations list` cho thấy DB đó vẫn dừng ở `AddEmailOtp`). Cách an toàn: dùng `dotnet ef migrations script` rồi áp vào container tạm. DB dev muốn lên cấp phải reset theo RUNBOOK trước, backup trước.

**Contract đổi:** chưa có route mới. Role `ExternalCoach` có RoleId=6 trong DB. Enum mới: `ExternalCoachApprovalStatus`(PendingApproval=0, Approved, Rejected, Suspended), `EmailOtpPurpose`(Register=0, ResetPassword, ExternalCoachRegister), `SportOperationType`(WalkIn=0, OneOnOne, GroupCourse).

**Cố ý CHƯA làm trong đợt 1 (để không làm hỏng consumer):** bỏ `CoachProfile.CoachCategory` (còn nhiều consumer: CoachProfileReader, Training, seeder — gỡ ở P1.03/P1.05 rồi mới drop cột); index `ix_email_otps_email` cũ đã thay; chưa tạo `IncidentNotice` nên `RoomBlock.IncidentId` chưa có FK.

**Vấn đề còn lại:** 6 test Training lỗi có sẵn (test đọc enum dạng chuỗi). Bảng `sports` chưa có consumer nào (Class vẫn dùng Discipline).

**Bước tiếp theo cụ thể (P1.02 các đợt còn lại):**
1. Đợt `MultiSportCourseOccupancy`: bật `btree_gist`; `RoomOccupancy`/`CoachOccupancy` (+ exclusion constraint `tstzrange`, unique source), `ClassScheduleRule`, `SeatHold`; sửa `Class`, `ClassSession`, `Enrollment`, `Attendance`, `GymCheckIn`, `PtSession` (RoomId). Đây là đợt drop dữ liệu lớp demo — cần backup và `docker`/pg_dump trước, đọc hết FK cũ (Attendance/WorkoutResult → Enrollment/Session).
2. Đợt `MultiSportWalletPayments`: `PointWallet`, `PointLedgerEntry` (append-only trigger), `PointConfirmation`, `CheckoutSession`, `VerifiedGatewayEvent`; sửa `Invoice`, `InvoiceItem`, `PaymentAttempt`, `Payment`, `PaymentAdjustment`.
3. Đợt `MultiSportThresholdRentals`: `ClassThresholdResponse`, `CourtRental`, `IncidentNotice`; sửa `Notification`.
4. Sau khi consumer chuyển: drop `coach_category`.

---

## (Lịch sử) Checkpoint — P1.01 (một phần) hoàn tất 30/09/2026

**Chặng đã hoàn tất:** P1.00, P1.01 phần khai báo ports + role/policy. **Chưa xong trong P1.01:** chuyển consumer sang port và cắt navigation cross-module (làm dần theo từng chặng có consumer thật), `INotificationWriter` mở rộng Email (hoãn sang P1.11 cùng entity Notification, để không có nhánh Email chưa chạy được).

**Working tree:** branch `develop`, chưa commit.

**File thêm:** `backend/SportHub.BuildingBlocks/Abstractions/`: `Identity/{IUserAccessReader,ICoachSpecialtyReader,IExternalCoachAccessReader}.cs`, `Scheduling/{ISportCatalogReader,IOccupancyService,IClassEnrollmentFulfillment,ICourtRentalFulfillment}.cs`, `Membership/{IMembershipAccessReader,IMembershipFulfillment}.cs`, `Training/IPtPurchaseFulfillment.cs`, `Wallet/IPointWalletService.cs`, `Payment/{ICheckoutService,IInvoiceDraftWriter,IRefundCreditService}.cs`; test `SportHub.Security.Tests/Unit/RolesAndPoliciesTests.cs`.
**File sửa:** `SportHubRoleNames.cs` (+ExternalCoach), `SportHubPolicies.cs` (+ExternalCoach, CatalogManage, CoachManagement, CourtRental, WalletOwner, RefundApprove, PaymentReconciliation), `AuthorizationPolicyExtensions.cs` (đăng ký), `SportHub.Identity/Domain/Enums/UserRole.cs` (+ExternalCoach=5, append).
**Xóa:** không. `ICoachProfileReader` giữ đến khi consumer chuyển port (P1.03/P1.05).

**Migration / DB:** không đổi schema. `has-pending-model-changes`: không có thay đổi. Seed `Role` (RoleId=6 ExternalCoach) **chưa thêm** — làm trong migration P1.02; đến lúc đó chưa tạo được user ExternalCoach.

**Kiểm tra:** build Release 0 lỗi; test: Administration 15, Security 90 (+3 mới), Payment 51, Scheduling 65 pass; Training 71/77 với 6 lỗi có sẵn như baseline (không thêm lỗi mới).

**Contract đổi:** chưa có route mới. Role wire name `ExternalCoach`; policy mới như trên. Các port chưa có implementation — chữ ký có thể chỉnh khi implement ở chặng sở hữu, phải cập nhật contract.

**Quyết định thiết kế đáng ghi:**
- Ports dùng primitive/record trong BuildingBlocks, ID lớp là int, còn lại Guid; giờ dùng `DateTimeOffset` (UTC).
- Ví: idempotent theo (owner, referenceType, referenceId); lỗi thiếu điểm/xung đột tham chiếu là exception riêng trong BuildingBlocks.
- Ports chỉ làm quote/reserve/confirm/release/cancel; không port nào SaveChanges.
- `ISportHubDbContext` giữ generic như plan.

**Chưa xong / lỗi:** 6 test Training lỗi có sẵn (enum dạng chuỗi trong test), chưa sửa. Chưa có test DI-cycle vì chưa có implementation; thêm khi implement port đầu tiên (build container + resolve orchestrator).

**Bước tiếp theo:** P1.02 — tạo entity/configuration/enum theo §5.1 (bắt đầu Identity: `ExternalCoachProfile`, `UserSportSpecialty`, enum `ExternalCoachApprovalStatus`, `EmailOtpPurpose`; Catalog: `Sport`, `RoomType`...), thêm seed Role ExternalCoach, `btree_gist`, sinh migration `MultiSportIdentityCatalog` bằng `dotnet ef migrations add`; thử trên DB trắng và nâng cấp từ `20260929010712_AddPtTrainingDomain`. Backup DB trước khi drop bảng lớp.

---

## (Lịch sử) Checkpoint — P1.00 hoàn tất (30/09/2026)

**Chặng hiện tại / đã hoàn tất:** P1.00 (khảo sát baseline) — hoàn tất. Chưa bắt đầu P1.01.

**Commit hoặc trạng thái working tree:** branch `develop`, HEAD `a5c480b`. Chưa commit. Untracked: `docs/refactor-code-plan-1-backend.md`, `docs/refactor-code-plan-2-frontend.md`, và 3 file docs mới của chặng này. Không có `AGENTS.md`. (Plan nhắc `.claude/settings.local.json` chưa track — lúc này `git status` không hiển thị, không thuộc phạm vi.)

**File thêm / sửa / xóa:** thêm `docs/refactor-api-contract.md`, `docs/refactor-progress.md`, `docs/refactor-backend-evidence.md`. Không đổi code, không đổi schema.

**Migration và DB test đã dùng:** Không chạy migration hay `database update`. Test tích hợp dùng Testcontainers PostgreSQL (`PostgreSqlBuilder` trong 4 factory: Security, Scheduling, Payment, Training), mỗi factory tự dựng container Docker (Docker 29.5.2 có sẵn). DB dev `appsettings.json`: localhost:5435/sporthub — **chưa đụng tới**. Migration mới nhất: `20260929010712_AddPtTrainingDomain` (10 migration).

**Lệnh kiểm tra + kết quả thực tế:**
- `dotnet build backend/SportHub.sln -c Release` → 0 lỗi, 4 cảnh báo (nullable/xUnit1031/obsolete PostgreSqlBuilder trong Security.Tests).
- `dotnet test backend/SportHub.sln -c Release --no-build`:
  - Administration.Tests 15/15, Security.Tests 87/87, Payment.Tests 51/51, Scheduling.Tests 65/65 pass.
  - **Training.Tests 71/77 pass, 6 FAIL sẵn có** (trước mọi thay đổi).

**Contract đã đổi:** chưa có. `docs/refactor-api-contract.md` phần A ghi 132 route baseline (không tính controller test).

**Vấn đề chưa xong / test đang lỗi:**
6 test Training lỗi có từ trước, cùng nguyên nhân: test đọc response bằng `System.Text.Json` mặc định, không có `JsonStringEnumConverter`, trong khi API trả enum dạng chuỗi (`$.status` của `WorkoutPlanResponse`):
- `WorkoutPlanCharacterizationTests.Personal_trainer_with_active_relationship_creates_a_plan`
- `WorkoutAndHomeworkWorkflowTests.Completed_pt_session_accepts_result_and_appears_in_both_progress_timelines`
- `WorkoutAndHomeworkWorkflowTests.Pt_can_update_activate_and_archive_own_plan`
- `WorkoutAndHomeworkWorkflowTests.Member_cannot_update_another_members_homework`
- `WorkoutAndHomeworkWorkflowTests.Homework_has_separated_pt_and_member_write_boundaries`
- `TrainingHardeningTests.Other_pt_cannot_update_a_plan_they_do_not_own`

Đây là lỗi test, không phải lỗi refactor; chưa sửa (ngoài phạm vi P1.00). Nên sửa ở P1.05/P1.13 khi đụng test Training.

Quan sát cấu trúc cho chặng sau:
- Thư mục `backend/SportHub.Repository` và `SportHub.Service` chỉ còn `bin/obj` (không có source, không nằm trong sln) — rác build.
- Đồ thị ProjectReference hiện tại: Identity→BB; Membership→Identity,BB; Scheduling→Identity,Membership,BB; Training→Identity,Scheduling,Membership,BB; Payment→Identity,Membership,BB; Administration→BB,Identity,Audit,Membership,Payment; Notification/Audit→Identity,BB; AI→Identity,BB,Membership,Scheduling,Training. Không có tham chiếu Scheduling↔Payment; P1.01 phải giữ vậy (Payment dùng port, không reference Scheduling).
- `ISportHubDbContext` đã generic (Set/SaveChanges/Database) — giữ nguyên.
- CI (`.github/workflows/ci.yml`) backend chỉ restore+build, chưa chạy test.
- `UserRole` chưa có ExternalCoach; `InvoiceStatus` = Issued/Paid/Void.

**Bước tiếp theo cụ thể:** P1.01 — thêm ports vào `backend/SportHub.BuildingBlocks/Abstractions/{Identity,Scheduling,Membership,Training,Wallet,Payment}/` (bắt đầu với `IUserAccessReader`, `ICoachSpecialtyReader`, `ISportCatalogReader`), append `ExternalCoach` (=5) vào `SportHubRoleNames.cs`/`UserRole`, mở rộng `SportHubPolicies.cs` + `AuthorizationPolicyExtensions.cs`. Trước đó cần quyết định có sửa 6 test Training lỗi sẵn không.
