# Bàn giao backend plan 1 — 01/10/2026

Phạm vi: hoàn tất backend của [plan 1](refactor-code-plan-1-backend.md), ngoại trừ kết nối và nghiệm thu VNPay sandbox thật theo yêu cầu của người dùng. Frontend thuộc [plan 2](refactor-code-plan-2-frontend.md). Không thay đổi Requirements, SRS, BR DOCX hoặc triển khai tính năng AI.

## Manifest triển khai

| Chặng | Kết quả và nơi kiểm chứng |
|---|---|
| P1.00 | Baseline và các checkpoint được giữ trong `refactor-progress.md`; bản chốt này thay thế trạng thái đang làm ở checkpoint cũ. |
| P1.01 | Ports trong BuildingBlocks, composition tại API; `ModuleBoundaryTests` kiểm phụ thuộc. Membership, Identity, Scheduling, Training, Payment giao tiếp qua ports cho checkout, fulfillment, refund, lịch và thông báo. |
| P1.02 | Chuỗi migration cho catalog, course, occupancy, wallet, checkout cycles, inbox, refund, transfer, rental, outbox và typed invoice references. `PointConfirmationMigrationTests` kiểm nâng cấp có dữ liệu; factories migrate PostgreSQL trắng. |
| P1.03 | Password policy/rehash, reset OTP, security stamp, Google regression, Coach specialties, ExternalCoach approval/RBAC; Security.Tests. |
| P1.04 | Catalog đa môn, room type/opening hours/rate/block; occupancy exclusion constraints chống trùng sân/Coach. `OccupancyConcurrencyTests`, `CoursePublishTests`, `CourtRentalTests`. |
| P1.05 | Khóa học cố định, roster/attendance, Gym checkout/check-in, PT quota/workout/homework/coach change; Scheduling.Tests và Training.Tests. Membership chỉ phụ thuộc trạng thái và ngày, không quota buổi. |
| P1.06 | Wallet/ledger, Hold/Spend/Release, OTP tại quầy, revision và ownership; `WalletConcurrencyTests`, `CounterPointOtpTests`. |
| P1.07 | Checkout Membership/Class/PT/Rental, retry, verified payment, inbox/idempotency, late payment/reconciliation; `CheckoutFlowTests`, `VnPayGatewayTests`. Gateway mock được kiểm, sandbox thật được loại khỏi phạm vi. |
| P1.08 | Hoàn bằng điểm qua PaymentAdjustment, cumulative cap và item lineage, cancellation nguyên tử; `RefundWorkflowTests`, `PointRefundCalculatorTests`, rental/transfer integration. |
| P1.09 | Threshold evaluation/response deadline/expiry, owner token, waive/pricing, transfer rẻ/bằng/đắt và checkout phần chênh; `ThresholdTransferTests`. |
| P1.10 | Thuê sân ExternalCoach Approved, rate snapshot, cancellation/late callback; lịch sân hợp nhất Class/PT/Rental/Block cho Manager/Lễ tân, lịch lớp của Coach; `CourtRentalTests`, `CourtScheduleAndIncidentTests`. |
| P1.11 | Incident preview có phương án dời/hủy/bù; resolve kiểm lại lịch và hoàn rental/block trong transaction. Email outbox cho invoice/payment/refund, threshold, class/PT schedule, incident; retry/lease/encryption; `OutboxDispatchTests`, class/PT incident tests. |
| P1.12 | Revenue theo môn/nguồn/ExternalCoach, legacy/compensation trace, export cùng service, seed lặp không nhân đôi, settings/config; `ReportExportParityTests`, `RevenueReportPeriodTests`, `ReportPeriodAndHoldsTests`. |
| P1.13 | Bộ test solution, model drift, compose và diff gate; số liệu/lệnh chính xác tại [evidence](refactor-backend-evidence.md). API wire và snapshot mua hàng có HTTP integration test. |

Tên file test có thể khác danh sách dự kiến của plan: gateway/callback/late/expiry nằm trong `Payment.Tests/Integration/CheckoutFlowTests.cs` và `VnPayGatewayTests.cs`; outbox/migration/module boundary nằm trong Payment.Tests để dùng host fixture sẵn có; incident lớp nằm trong `Scheduling.Tests/Integration/CourtScheduleAndIncidentTests.cs`, PT trong `Training.Tests/Integration/PtOccupancyTests.cs`. Tất cả project có tiền tố `SportHub.`.

## Quyết định tương thích đã triển khai

- JSON enum dùng `UPPER_SNAKE_CASE`; enum DB giữ nguyên số và chỉ append. DTO string biểu diễn enum có converter riêng; JWT role và tên nội bộ giữ nguyên. Error codes giữ snake_case chữ thường; action identifier của incident giữ tên được trả về, không phải enum.
- API invoice có `beneficiaryUserId` cho cả Member và ExternalCoach; `memberId` là alias tương thích. Entity/column lịch sử `Invoice.MemberId`/`member_id` được giữ để tránh đổi FK không cần thiết. Không suy ra role Member từ tên cột này.
- `InvoiceItem` có FK typed tới Class/CourtRental/PtEntitlement/MemberPackage/Sport và snapshot sport name, PT frequency. `SourceInvoiceItemId` giữ chuỗi chuyển lớp. `RelatedEntityId` chỉ còn tương thích/fallback lịch sử. Không đoán liên kết khi dữ liệu cũ không chứng minh được.
- `Payment.PaymentAttemptId` gắn giao dịch đã xác minh với attempt. Invoice/item/ledger lịch sử không bị cascade-delete theo invoice.
- Membership lưu `DurationDaysSnapshot` khi chuẩn bị checkout; thay catalog sau đó không đổi giá hoặc thời hạn đã mua. Các cột legacy `SessionLimit`/`RemainingSessions` được giữ để đọc lịch sử, không còn quyết định quyền vào Gym hoặc expiry. Catalog request mới có sessionLimit khác null bị từ chối.
- PT snapshot môn chỉ khi xác định được đúng một môn OneOnOne đang hoạt động của Coach; dữ liệu chưa xác định giữ null. Membership không thuộc riêng một môn nên sport null. Báo cáo ưu tiên snapshot; legacy có lookup/fallback và nhóm chưa phân loại.
- `fulfillmentOutcome` được tính từ trạng thái thanh toán, PaidVia và reconciliation flag; không thêm một trạng thái DB có thể lệch với quyền lợi. `PAID_AFTER_RECONCILIATION` có thể là cấp quyền lợi muộn hoặc bồi hoàn; frontend phải đọc outcome.
- Incident là quy trình nhiều bước: Manager chọn dời/hủy kèm bù cho lớp hoặc dời/hủy PT trước; sau khi không còn conflict mới resolve incident. Mỗi bước có transaction/rule riêng, final resolve kiểm lại lịch để tránh dùng preview cũ. Không tự chọn giờ bù hoặc hủy lớp chỉ vì có incident.

## Migration và vận hành

Hai migration cuối:

1. `20261001092136_TypedInvoiceReferencesAndSnapshots`: nullable typed FKs, snapshot, PaymentAttempt link và Restrict.
2. `20261001131334_BackfillTypedInvoiceReferences`: bổ sung liên kết chứng minh được từ owner/checkout/hold lịch sử; chỉ cập nhật field chưa có, không ghi đè snapshot đã mua. Sport name lịch sử chỉ có thể lấy tên tại lúc nâng cấp; không thể khôi phục tên trước đó nếu chưa từng lưu. Down giữ dữ liệu bổ sung này.

Migration mới đã được kiểm trong PostgreSQL Testcontainers; không chạy `database update` trên DB phát triển/chia sẻ. Khi triển khai, backup và xác minh connection string đích trước khi áp chuỗi migration. Xem [RUNBOOK](RUNBOOK.md) cho Development, demo logging và SMTP.

## Đầu vào cho frontend

Đọc [API contract](refactor-api-contract.md), [JSON lấy từ test](refactor-api-examples.json) và [evidence](refactor-backend-evidence.md). Bỏ UI booking từng buổi, quota Membership, discount/correction/refund payout và thu tiền thủ công theo flow cũ. Giữ đọc lịch sử và dùng checkout/point refund hiện hành. Không dùng route baseline Phần A như danh sách endpoint còn hỗ trợ ghi.

VNPay sandbox thật do người dùng tự tích hợp/nghiệm thu. SMTP dispatcher đã được kiểm bằng sender có kiểm soát (lỗi, retry, success, rollback); chưa có bằng chứng email được giao qua nhà cung cấp SMTP bên ngoài. Frontend/browser E2E chưa thuộc gate này.
