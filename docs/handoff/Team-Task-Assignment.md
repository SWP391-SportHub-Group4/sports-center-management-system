# Giao việc: thanh toán, đối soát và Support Request (24/10/2026)

Nguồn yêu cầu: [Payment-Support-Workflow](../Payment-Support-Workflow.md). Mọi task đọc file này trước. Hợp đồng API đề xuất ở mục 6, dữ liệu ở mục 7, nghiệm thu ở mục 9.

## 0. Trước khi giao: việc chung bạn xử lý trước

Các việc này ảnh hưởng nhiều task, làm trước để tránh conflict.

| # | Việc chung | Lý do |
|---|---|---|
| S1 | **Commit các thay đổi sửa lỗi thanh toán đang chờ** (4 file backend, 2 file FE trong working tree: đóng attempt VNPay cũ khi đổi điểm, chỉ tải hóa đơn khi đã thanh toán, ẩn chip Pending thừa, thông báo VNPay màu đỏ). Chạy integration test Payment (cần Postgres) trước khi commit. | Mọi task payment bắt đầu từ nền này. |
| S2 | **Một migration duy nhất** cho schema mục 7 (cột `member_support_requests`, bảng `member_support_payouts`, cột `member_support_attachments`). Giao một người viết, người khác không tạo migration riêng. | Tránh nhiều migration chồng nhau và snapshot conflict. |
| S3 | **Catalog mã lỗi và system setting mới** (`day_pass_outside_hours`, `support_remind_too_early`, `payout_*`, `reconciliation_already_resolved`, `payment_request_already_open`; setting ở mục 6 của workflow). | Hai phía BE và FE dùng chung. |
| S4 | **Loại attachment** `MEMBER_PROOF`/`PAYOUT_PROOF` cùng quyền đọc (ảnh request PAYMENT chỉ chủ request và Manager). Không còn hạ tầng mã hóa số tài khoản. | Cần cho T3 và T6. |
| S5 | **Đã chốt 24/10/2026** (mục 10 của workflow): ghi chú day pass 60 phút trước giờ đóng cửa, giữ bước Member xác nhận (tự xác nhận sau 3 ngày), giá catalog luôn bội số 1.000đ, hoàn điểm cho lớp trung tâm hủy, PAYMENT bắt buộc chọn hóa đơn và 1–3 ảnh, không nhập số tài khoản (Manager gọi điện và ghi chú), Lễ tân thấy, tạo hộ và bấm Remind giúp Member. | Không còn chờ quyết định. |
| S6 | **Cập nhật `docs/api-contract.md`** từ mục 6 sau khi chốt S3, để FE gọi đúng route. | FE không dùng route chưa có trong contract. |
| S7 | Merge branch docs này vào nhánh làm việc chung rồi mọi người mới rẽ nhánh. | Tránh conflict docs. |

## 1. Task backend

Mỗi task một người, mỗi người một vùng file riêng (cột "Vùng file"). Không sửa ngoài vùng; cần sửa file chung thì báo S-owner.

| Task | Nội dung | Vùng file chính | Phụ thuộc |
|---|---|---|---|
| **B1 Day pass** | Chỉ bán 06:00 đến trước 22:00 giờ Việt Nam (409 `day_pass_outside_hours`) ở bước tạo checkout; hết hạn 22:00 cùng ngày (đổi `DayPass.ValidHours`, tính `expires_at_utc`); kiểm tra giờ lại ở bước cấp quyền lợi, quá 22:00 thì không cấp và chuyển `RECONCILIATION_REQUIRED`; thông báo/email ghi giờ hết hạn 22:00; cờ checkout `closingSoon` và `closesAtUtc` (60 phút cuối trước giờ đóng cửa) để FE hiện ghi chú. | `SportHub.Membership/*`, `CheckoutResponse`, email day pass | S3 |
| **B2 Thanh toán muộn** | Gọi QueryDR trước khi nhả chỗ khi checkout hết hạn (có sẵn guard gateway event chưa xử lý, mở rộng); nhánh IPN muộn còn chỗ tự cấp (`PAID_AFTER_RECONCILIATION` + `FULFILLED`) và không cấp được (`RECONCILIATION_REQUIRED`); `GET /api/members/me/unactivated-payments`; `POST /api/invoices/{id}/convert-to-points` (idempotent, khóa một lần cùng request PAYMENT); làm tròn điểm xuống; thông báo Member và Lễ tân; mở rộng `front-desk/payment-reconciliation` với outcome. | `SportHub.Payment/Application/Services/{CheckoutExpiryService,PaymentReconciliationService,PaymentFulfillmentService}`, controller invoices | S1, S3 |
| **B3 Support SLA** | Cột SLA, `slaDueAtUtc` trong response; `POST /api/support/requests/{id}/remind` (409 `support_remind_too_early` kèm `retryAfter`); `SupportSlaReminderJob` (15 phút, dedupe theo request + người nhận + 48h, đối tượng đã gán vs Manager và Lễ tân); sự kiện lịch sử mới; thống kê/lọc Overdue ở `stats` và `queue`. | `SportHub.Identity/Api/Member*Support*`, `SportHub.API/Jobs` (job mới) | S2, S3 |
| **B4 Request PAYMENT và payout** | Mở rộng `POST /api/support/requests` cho PAYMENT (invoiceId, 1–3 ảnh bắt buộc, không có trường ngân hàng, một request mở mỗi invoice, Lễ tân chỉ xem); `POST /api/member-support-requests/{id}/payout` chỉ CenterManager (số tiền không vượt phần đã thu trừ payout trước, ghi chú bắt buộc, 1–3 ảnh chứng từ, một lần); `confirm-received`/`report-not-received`; `SupportPayoutAutoConfirmJob` (3 ngày); audit, thông báo và email Member; quyền đọc ảnh. | `SportHub.Identity/*` (entity payout mới, controller payout), Notification templates | S2, S3, S4, B3 |
| **B5 Báo cáo** | Thêm `bankRefundPaid`, `bankRefundCount` vào `reports/revenue`, dashboard Manager và export; không trừ vào doanh thu VNPay thực thu, không cộng với hoàn điểm, không trừ hai lần cho một invoice. | `SportHub.Administration/Application/Services/Report*`, `SportHub.Payment` queries | B4 (schema payout) |

## 2. Task frontend

Chỉ bắt đầu khi route tương ứng đã vào api-contract (S6); có thể làm với mock trước.

| Task | Nội dung | Vùng file chính |
|---|---|---|
| **F1 Member checkout** | Ghi chú day pass trong 60 phút cuối trước giờ đóng cửa (đọc cờ `closingSoon` và `closesAtUtc` từ checkout), thông báo và thẻ gói hiện hạn 22:00; thông báo lỗi `day_pass_outside_hours`. | `features/payments/checkout-panel*`, `features/member/*day-pass*` |
| **F2 Member Help và request** | SLA ("We aim to reply by…"), nút Remind us với cooldown, form PAYMENT (chọn hóa đơn, 1–3 ảnh, kiểm tra phía client, không có ô số tài khoản), chi tiết request hiện payout, ảnh chứng từ của Manager, nút I received it / Not received. | `features/member/help-center.tsx` và component mới |
| **F3 Paid, not activated (Member)** | Thông báo trên Overview, màn chi tiết hóa đơn với hai lựa chọn: nhận điểm ngay hoặc gửi request; khóa lựa chọn sau khi chọn. | `features/payments/member-invoice-detail.tsx`, `app/member/page.tsx` |
| **F4 Lễ tân** | Hàng đợi Support có Overdue, thẻ cảnh báo trang chủ, mục Paid, not activated, ẩn nút ghi payout, nhắc ghi chú khi chuyển lên Manager. | `features/receptionist/*`, `payment-reconciliation` |
| **F5 Manager** | Form Record payout (số tiền, 1–3 ảnh, ghi chú) trong chi tiết request PAYMENT; thẻ Overdue trên dashboard; dòng `bankRefundPaid` trên báo cáo và Overview; hiển thị Member xác nhận hay báo chưa nhận. | `features/manager/*`, `features/reports/*` |

## 3. Task kiểm thử

| Task | Nội dung |
|---|---|
| **Q1** | Unit và integration cho B1–B5 theo từng tiêu chí ở mục 9 của workflow (day pass 05:59/06:00/21:59/22:00/22:03, IPN muộn còn/hết chỗ, SLA và Remind, request PAYMENT sai số ảnh, payout vượt số tiền, quyền Receptionist: chỉ xem và remind request PAYMENT, 403 khi xử lý). Integration chạy trên Postgres do chính người phụ trách. |
| **Q2** | Playwright theo vai trò (Member, Lễ tân, Manager, Admin) cho F1–F5, mock API trước, live khi BE xong. |
| **Q3** | Nghiệm thu sandbox VNPay thật: bấm thanh toán ở giây cuối, IPN trễ, QueryDR; ghi evidence vào mục 13 của thiết kế. |

## 4. Thứ tự và phụ thuộc

1. S1, S2, S3, S4 (bạn) → merge.
2. B1, B2, B3 song song (vùng file khác nhau). F1 làm cùng B1.
3. B4 sau B3 (dùng chung request SLA). F2 sau khi B3 có route, F3 sau B2.
4. B5 sau B4. F4, F5 sau B3/B4.
5. Q1 chạy song song từng task; Q2 sau FE; Q3 cuối.

## 5. Quy tắc làm việc chung

- Mỗi task một nhánh `feat/<task>` rẽ từ nhánh chung đã chứa docs; PR nhỏ theo task.
- Không sửa file `.docx` và không sửa các file docs ngoài `docs/handoff` khi chưa báo; contract thay đổi thì sửa `api-contract.md` trong PR riêng do S6-owner duyệt.
- Mọi chuỗi hiển thị trên web bằng **tiếng Anh**.
- Không commit số tài khoản, ảnh thật hay secret vào test, fixture hoặc log.
- Mỗi PR ghi rõ tiêu chí nghiệm thu của workflow mà PR phủ và test đã chạy; integration test cần Postgres.
- Hoàn thành khi: test của task pass, tiêu chí tương ứng ở mục 9 có evidence, và không đổi hành vi ngoài phạm vi task.

## 6. Phân công theo người (cập nhật 25/10/2026)

**Trạng thái:** B1, B2, B3, B4, B5 (backend) và F1 đã xong và đã duyệt. F4 và F5 do trưởng nhóm làm. Còn lại chia theo vai trò dưới đây. Mỗi người chỉ sửa trong vùng của mình; việc dùng chung xem mục 5.

### An: Member

| Việc | Nội dung | Vùng file |
|---|---|---|
| **F2 Help và request** | SLA ("We aim to reply by…"), nút Remind us chỉ bật khi `canRemindAtUtc` đã qua (lỗi 409 `support_remind_too_early` hiện thời gian còn lại), form PAYMENT (chọn hóa đơn đã trả VNPay, 1–3 ảnh, kiểm tra phía client, không có ô số tài khoản), chi tiết request hiện payout và ảnh chứng từ của Manager (`/api/support/attachments/{id}`), nút I received it / Not received. Hỗ trợ deep link `/member/help?requestId=` dùng trong email. | `features/member/help-center.tsx` và component mới |
| **F3 Paid, not activated** | Thông báo ở Overview từ `GET /api/members/me/unactivated-payments`; chi tiết hóa đơn có hai lựa chọn "Convert to points" (`POST /api/invoices/{id}/convert-to-points`, gửi `Idempotency-Key`) hoặc "Request support"; khóa lựa chọn sau khi chọn; xử lý lỗi `reconciliation_already_resolved`. | `features/payments/member-invoice-detail.tsx`, `app/member/page.tsx` |
| **Thông báo** | Thêm điều hướng cho `PAYMENT_UNACTIVATED` (tới hóa đơn), `PAYMENT_CONVERTED_TO_POINTS`, `SUPPORT_PAYOUT_RECORDED` (tới request), `SUPPORT_REQUEST_REMINDED`. | `features/member/notifications-api.ts` |
| **Q2 Member** | Playwright cho F2, F3 (mock API). | `frontend/tests/` |

### Hào: Lễ tân

F4 do trưởng nhóm làm. Phần của Hào là luồng và kiểm thử xung quanh:

| Việc | Nội dung | Vùng file |
|---|---|---|
| **PAYMENT: Lễ tân thấy, tạo hộ và remind** | **Backend đã xong (25/10).** Lễ tân thấy request PAYMENT (chỉ xem, không thấy ảnh chứng từ payout), tạo hộ Member qua `POST /api/member-support-requests` kèm `invoiceId` (không có `resolveNote`, chỉ bàn giao cho Manager), gọi `POST /api/member-support-requests/{id}/remind` (chỉ PAYMENT, chung cooldown 48 giờ với Member, chỉ Manager nhận thông báo), và nhận 403 `payment_request_manager_only` khi gán, cập nhật tiến độ, đóng hay từ chối. **Việc còn lại (frontend):** form tạo request ở quầy chọn danh mục PAYMENT thì hiện ô chọn hóa đơn VNPay đã trả của Member đó (bắt buộc, không có ô ngân hàng, ảnh không bắt buộc), ẩn "resolve now", chỉ cho bàn giao cho Manager; nút "Remind manager" ở chi tiết request PAYMENT (thuộc F4); khóa các nút gán, tiến độ, đóng, từ chối với request PAYMENT và hiện nhãn "Handled by Manager". | `features/receptionist/support-create-dialog.tsx`, `support-detail.tsx`, `support-shared.ts` |
| **Thông báo nhân sự** | Điều hướng cho `PAYMENT_UNACTIVATED` (tới mục Paid, not activated) và `SUPPORT_SLA_REMINDER` (tới hàng đợi Support, lọc Overdue). | nơi map thông báo của staff |
| **Bán day pass tại quầy** | Kiểm tra lỗi `day_pass_outside_hours` hiển thị đúng khi lễ tân tạo hóa đơn ngoài giờ; test mốc 05:59, 06:00, 21:59, 22:00. | `features/receptionist/front-desk.tsx` |
| **Q2 Lễ tân** | Playwright cho day pass tại quầy và quyền (lễ tân không thấy nút payout, không đọc được ảnh chứng từ payout). | `frontend/tests/` |

### Khoa: Manager

F5 do trưởng nhóm làm. Phần của Khoa là backend và kiểm thử:

| Việc | Nội dung | Vùng file |
|---|---|---|
| **Hoàn điểm lớp trung tâm hủy** | Đối chiếu `CourseCancellationService` và hoàn điểm thủ công với mục 3 của workflow: lớp bị hủy và lớp dưới ngưỡng thì hoàn điểm; Member tự hủy ghi danh thì không hoàn. Hiện lớp dưới ngưỡng hoàn tự động; xác nhận có đúng ý "Manager hoàn" hay cần bước Manager duyệt, ghi kết luận vào PR, thêm test cho cả hai nhánh. | `SportHub.Scheduling/Application/Services/CourseCancellationService.cs`, `SportHub.Payment` refund |
| **Request sau khi Member báo chưa nhận** | Payout chỉ ghi một lần nên request mở lại không ghi thêm được. Chốt cách kết thúc (Manager Done hoặc Reject kèm ghi chú, hoặc cho ghi payout bổ sung có trần) và viết test. | `SportHub.API/Controllers/SupportPayoutController.cs`, `MemberSupportRequestsController.cs` |
| **Dữ liệu ngân hàng và payout** | **Đã xong (25/10):** đã gỡ `BankAccountProtector`, `MemberSupportPayoutDetail`, endpoint `bank-details`, job xóa dữ liệu, trường ngân hàng và mã lỗi liên quan; migration `RemoveSupportBankDetails` bỏ bảng và khóa `support.bank_data_retention_days`; payout bắt buộc `note` (400 `payout_note_required`). **Việc còn lại:** chạy migration trên DB của bạn, rồi chạy integration `SupportPayoutFlowTests` trên Postgres và báo kết quả. | `SportHub.API/Migrations`, `SupportPayoutFlowTests` |
| **Thông báo Manager** | Điều hướng cho `SUPPORT_PAYOUT_NOT_RECEIVED` và `SUPPORT_SLA_REMINDER`. | nơi map thông báo của staff |
| **Q1 Manager** | Chạy lại integration `SupportPayoutFlowTests`, `ReportReconciliationTests`, `ReportExportParityTests` trên Postgres và báo kết quả; thêm test export có cột `bankRefundPaid`. | `SportHub.Payment.Tests/Integration` |

### Khôi: Coach và Admin

| Việc | Nội dung | Vùng file |
|---|---|---|
| **Admin: system settings** | Màn Settings chỉ hiện nhóm rental. Thêm ba khóa mới: `support.sla_hours` (1–168), `support.remind_cooldown_hours` (1–168), `support.payout_confirm_days` (1–30), kèm nhãn tiếng Anh và kiểm tra khoảng giá trị khớp backend. | `features/catalog/settings-manager.tsx` |
| **Admin: Operations health** | `OperationsHealthController` còn đếm `ManualCompensationRequired` (luồng cũ). Thay bằng số hóa đơn Paid, not activated chưa xử lý và số request Overdue; cập nhật màn hiển thị và `needsAttention`. | `SportHub.API/Controllers/OperationsHealthController.cs`, `features/reports/operations-health.tsx` |
| **Admin: nhật ký audit** | Kiểm tra màn audit hiển thị đúng các action mới (`PAYMENT_NOT_ACTIVATED`, `CONVERT_UNACTIVATED_PAYMENT_TO_POINTS`, `REMIND_SUPPORT_REQUEST`, `SUPPORT_PAYOUT_RECORDED`, `SUPPORT_PAYOUT_CONFIRMED`, `SUPPORT_PAYOUT_NOT_RECEIVED`, `SUPPORT_PAYOUT_AUTO_CONFIRMED`). | `features/administration/*` |
| **Coach** | Không có thay đổi chức năng. Chỉ chạy smoke test Playwright của Coach để chắc luồng mới không làm hỏng; nếu hủy lớp ảnh hưởng thông báo cho Coach thì báo Khoa. | `frontend/tests/coach*.spec.ts` |
| **Q2 Admin** | Playwright cho Settings và Operations health. | `frontend/tests/` |

### Thứ tự

1. An làm F2 và F3 song song với trưởng nhóm làm F4 và F5.
2. Hào, Khoa, Khôi làm song song vì vùng file khác nhau; hai việc cùng chạm nơi map thông báo của staff (Hào và Khoa) thì Hào làm trước, Khoa rebase.
3. Q3 (sandbox VNPay thật) chạy cuối, sau khi các việc trên merge.
