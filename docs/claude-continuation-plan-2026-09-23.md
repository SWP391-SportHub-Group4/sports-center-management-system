# Kế hoạch Claude tiếp tục SportHub ngày 23 tháng 09 năm 2026

Lập ngày 22/09/2026. Mục tiêu là sửa bản demo hiện có để đáp ứng Business Rules v1.4, hoàn thiện các phần bắt buộc và bàn giao app local để người dùng quan sát. Đây là kế hoạch thực hiện, không phải báo cáo code đã đạt.

## 1. Nguồn và phạm vi được giao

Đọc theo thứ tự: `00-Source-of-Truth.md` → `SportManagement_BusinessRules.docx` v1.4 đã gộp → `Center-Management-System-Design-v2.md` → `Requirements.md`. Đọc thêm `implementation-decisions.md`, `entity-field-purpose.md`, `RUNBOOK.md` và hướng dẫn repository nếu có.

Không tìm hoặc tạo lại bản `business-rules-v1.4.md`: nội dung đã gộp vào Word và người dùng đã xóa mirror. Không lấy comments trong code cũ hoặc kết quả demo cũ để ghi đè v1.4. Giữ 64 mã BR, không tự đánh lại số.

A1–A7, C2/C4/C5/C6 và chính sách đã ghi trong biên bản được duyệt; không hỏi lại. C1 cũ bị thay thế bởi BR-41/42/43 v1.4. C3 chỉ duyệt nguyên tắc quyền, chưa duyệt thời điểm kết thúc ClassBased. Các câu hỏi còn mở ở §8 dưới đây chỉ chặn nhánh phụ thuộc; tiếp tục công việc độc lập.

Phạm vi vẫn là Flow 1–5, 5 role, 4 môn, một trung tâm. Google Login, AI provider thật, PDF và các yêu cầu vận hành vẫn có trong scope tương ứng. Không tự đổi sang mock-only, bỏ PDF hoặc gọi backup/HTTPS là ngoài scope. Không tự triển khai chatbot Flow 6 trong đợt này.

## 2. Bằng chứng hiện trạng để bắt đầu

Các quan sát sau là đọc code ngày 22/09, chưa chạy tests mới. Kiểm tra lại nếu người dùng đã sửa code trước khi bắt đầu.

| File trong repository | Sai lệch/việc cần kiểm chứng |
|---|---|
| `backend/SportHub.Payment/Domain/Rules/InvoiceMath.cs` | Trừ cả Refund khỏi NetPayable, suy ra RefundedAmount từ phần thu vượt; trái BR-41 v1.4 |
| `backend/SportHub.Payment/Application/Services/PaymentAdjustmentService.cs` | Approve chuyển thẳng Completed, chưa có bước Receptionist xác nhận thực trả cho Refund |
| `backend/SportHub.Payment/Domain/Entities/PaymentAdjustment.cs` | Chưa có các field ApprovedAtUtc/CompletedAtUtc/CompletedByUserId/RefundMethod/RefundReferenceCode theo schema đích |
| `backend/SportHub.Payment/Application/Services/RevenueReportService.cs` | Tính adjustment theo ResolvedAt và cộng các loại; cần tách giảm nghĩa vụ với tiền thực hoàn |
| `backend/SportHub.Payment/Application/Services/PaymentRecordingService.cs` | Gán FirstDepositAtUtc khi null mà chưa phân biệt thanh toán đủ lần đầu với cọc |
| `backend/SportHub.Administration/Application/Services/ReportExportService.cs` | Export CSV và retention tính từ lúc tạo; cần PDF và thời hạn tính từ CompletedAt |
| `backend/SportHub.Scheduling/Application/Services/EnrollmentService.cs` | Kiểm tra việc hoàn lượt hồi phục gói và đồng bộ BR-10 khi concurrency |
| `frontend/src/app/quan-ly/dieu-chinh`, `le-tan/hoa-don`, `quan-ly/bao-cao` | Sửa UI theo số dư và workflow mới; không chỉ sửa backend |

119 tests cũ được báo pass chỉ là bằng chứng lịch sử cho code cũ. Mọi số tests, screenshots hoặc thông số performance trong lần bàn giao mới phải đến từ kiểm chứng thực tế.

## 3. P0 Khởi động và migration an toàn

1. Kiểm tra `git status`, diff, branch, migrations, môi trường và cổng đang dùng. Giữ thay đổi của người dùng. Không tự dừng dịch vụ không xác định được là của task.
2. Chạy baseline `dotnet test backend/SportHub.sln`; ở frontend chạy lint/typecheck/build. Nếu Docker/runtime thiếu, ghi rõ và làm tiếp phần có thể kiểm chứng.
3. Tạo `docs/br-implementation-matrix.md` đủ BR-1–64 với cột: yêu cầu v1.4, code/API/job/UI, test, trạng thái và bằng chứng. Không copy cột “đạt” từ báo cáo cũ.
4. Tạo `docs/implementation-status.md` gồm kết quả baseline, mục đang làm, blockers, lệnh đã chạy. Cập nhật sau mỗi lát cắt hoàn chỉnh.
5. Đối chiếu model/migrations với A1–A7 và metadata thực hoàn đã được SSOT duyệt. Chỉ thêm migration còn thiếu; không xóa hoặc sửa migration đã áp dụng. Kiểm tra upgrade từ bản hiện có và tạo DB sạch trên DB test riêng.
6. Không reset volume/DB để làm tests xanh. Không dùng `docker compose down -v` trên DB người dùng. Seed và tests ghi dữ liệu phải chạy trên DB demo/test được nhận diện rõ.
7. Refund Completed cũ có thể chỉ là approve tự động: không backfill ngày/người thực trả bằng suy đoán. Xuất danh sách cần đối soát, giữ dữ liệu gốc; chặn hoàn lại các bản ghi chưa xác minh để tránh trả hai lần. Dữ liệu demo có thể tái tạo trong DB demo riêng, dữ liệu thật cần quyết định xử lý cụ thể.

Điều kiện xong P0: có baseline, danh sách migration/schema gap và kế hoạch xử lý dữ liệu cũ không phá lịch sử.

## 4. P1 Sửa đối soát và workflow thực hoàn

### 4.1 Một mô hình số dư dùng chung

Triển khai đúng biên bản §2:

```text
GrossCollected      = SUM(Payment Success)
ObligationReduction = SUM(Discount/Correction Completed)
NetPayable          = TotalAmount - ObligationReduction
RefundedAmount      = SUM(Refund Completed có xác nhận thực trả)
NetCollected        = GrossCollected - RefundedAmount
Outstanding         = max(0, NetPayable - NetCollected)
RefundDue           = max(0, NetCollected - NetPayable)
```

Giữ NetPayable/NetCollected không âm bằng validation/transaction, không chỉ clamp để che dữ liệu sai. Refund không giảm nghĩa vụ. Discount/Correction không tự là tiền hoàn. Payment mới dương và không vượt Outstanding; phân biệt số dư với Invoice.Status Paid mang ý nghĩa lịch sử theo SSOT.

Áp dụng cùng công thức cho query DTO, thu tiền, adjustment, activation gói, dashboard, export và frontend. Tránh mỗi màn hình tự cộng trừ theo công thức riêng.

### 4.2 Tách duyệt và xác nhận trả

1. Receptionist tạo yêu cầu; Manager duyệt/từ chối, không tự duyệt yêu cầu mình tạo.
2. Refund approve chỉ chuyển Approved; không thay đổi RefundedAmount hoặc số thu ròng. Override số tiền phải có lý do, không vượt số tiền thực thu còn có thể hoàn.
3. Implement `POST /api/adjustments/{adjustmentId}/complete` theo Design v2: Receptionist xác nhận thực trả cho Refund Approved, không đổi Amount đã duyệt. Lưu CompletedByUserId, CompletedAtUtc, RefundMethod, RefundReferenceCode và Audit cùng transaction.
4. Lúc complete kiểm tra lại số dư thực thu còn lại và RefundDue. Khóa invoice/adjustment nhất quán; retry cùng thao tác không tạo thêm tiền hoàn. Hai request cùng hoặc khác adjustment trên cùng invoice phải bảo vệ tổng số tiền.
5. Discount/Correction chỉ giảm nghĩa vụ; có thể áp dụng Completed trong transaction duyệt. Correction tăng nghĩa vụ chưa thuộc đặc tả.
6. Refund dịch vụ chưa dùng cần căn cứ giảm nghĩa vụ; không tự tạo thêm giảm nghĩa vụ nếu Discount đã có. Nhánh hủy dịch vụ ảnh hưởng gói/booking vẫn chờ §8; không tự hủy gói sau một Refund.
7. Báo cáo thu ròng dùng thời điểm Payment Success và Refund CompletedAtUtc trong kỳ; ngày approve không thay ngày thực hoàn. Hiển thị Discount/Correction riêng.

### 4.3 UI và tests đi kèm

- Manager xem số tiền đề nghị, số duyệt, lý do và trạng thái chờ lễ tân trả; Receptionist có hành động xác nhận thực trả; Member thấy riêng “cần hoàn” và “đã hoàn”.
- Test hóa đơn 3 triệu thu đủ → Discount 500 nghìn Completed → RefundDue 500 nghìn, RefundedAmount 0 → Refund Approved vẫn không đổi tiền → complete mới RefundedAmount 500 nghìn, RefundDue 0.
- Test thu cọc 1 triệu/3 triệu, Discount 500 nghìn → Outstanding 1,5 triệu, không phát sinh tiền hoàn giả.
- Test approve/complete khác kỳ báo cáo, refund vượt trần, refund concurrent, retry, trái vai trò, tự duyệt, override không có lý do và rollback audit.
- Test Paid giữ nguyên khi refund, Invoice không bị xóa/sửa gốc, Void chỉ theo Correction toàn phần đủ điều kiện.

Điều kiện xong P1: thao tác thực được qua UI, số dư DB/API/UI/report khớp; tests PostgreSQL thật chứng minh không thu/hoàn vượt trần hoặc hai lần.

## 5. P2 Gói tập, hạn thanh toán và lịch

1. BR-55: hạn đầu +2 tháng lịch; cọc đầu Success chỉ khi còn Outstanding sau khoản thu và nhận tại/trước hạn đầu, gia hạn +12 tháng kể từ cọc. Thu đủ lần đầu không đặt FirstDepositAtUtc. Khoản sau không gia hạn; sau hạn chặn thu thông thường, đúng hạn vẫn cho thu.
2. BR-30: activate một lần khi đủ nghĩa vụ hợp lệ, thỏa BR-9/10. StartDate theo ngày VN trả đủ; EndDate = StartDate + DurationDays - 1. Retry không reset ngày/lượt. Thay đổi giá/thời hạn catalog không được âm thầm đổi quyền đã bán; đối chiếu khả năng snapshot hiện có, ghi gap cần chốt nếu schema chưa đủ.
3. BR-10: ngoại lệ cùng PackageId có người/thời điểm/lý do Manager duyệt; không bỏ điều kiện thanh toán. Kiểm tra hai payment/activation đồng thời không tạo hai gói Active trái rule.
4. BR-11/18/54: hoàn lượt đúng một lần; gói hết lượt còn hạn có thể Expired → Active nếu không vướng BR-10. Nếu vướng, vẫn hoàn lượt, giữ Expired và hiển thị cần Manager xử lý. Không hồi phục Cancelled/quá ngày hoặc tăng ngày hết hạn; unlimited giữ null.
5. BR-50: setting mặc định 12 giờ; snapshot bất biến. Test hủy đúng mốc, ngay trước/sau và thay setting sau booking. BR-33 mặc định nhắc 7 ngày, job không gửi trùng.
6. BR-13/16/51: baseline bất biến, capacity không vượt trần/phòng hoặc thấp hơn ConfirmedCount; chặn lịch giao nhau kể cả concurrency, cho phép nối tiếp. Phòng bị giảm sức chứa phải kiểm tác động các session còn hiệu lực.
7. BR-54: dời buổi tạo session mới liên kết, hủy/hoàn booking cũ không phạt; không tự chuyển booking. Buổi mới có baseline tại lúc tạo. Thông báo nêu cần đặt lại.
8. Attendance finalizer không ghi NoShow cho session hủy/dời hoặc Enrollment đã hủy; không đè Present/Absent. Gym check-in giữ BR-64, không thêm điều kiện kiểm lượt/ngày riêng vào check-in.

Test mốc cuối tháng/năm nhuận cho AddMonths, 23:59/00:00 giờ VN cho DateOnly, lượt/chỗ cuối, cancel đồng thời booking, expiry job đồng thời hoàn lượt và giữ lịch nối tiếp hợp lệ. Dùng clock có thể điều khiển, không dùng sleep dài.

## 6. P3 Contract, báo cáo PDF và quyền

1. JSON property camelCase; enum request/response/query nghiệp vụ UPPER_SNAKE_CASE. Giữ JWT role PascalCase/NameIdentifier và DB ordinal/index hiện có. Kiểm cả DTO string thủ công, Enum.TryParse và query binding; chỉ đổi JsonStringEnumConverter không đủ.
2. Sửa frontend types, filter, labels và payload trong cùng lát cắt; không đổi các string không phải enum như Class.Discipline tùy tiện. Thêm contract tests cho PENDING_PAYMENT/CANCELLED_ON_TIME/SYSTEM_ADMINISTRATOR và role JWT cũ khác role DB.
3. ReportExport whitelist Csv/Pdf, columns và filter; nội dung chỉ gồm trường đã chọn. PDF tiếng Việt đọc được, có phân trang, không tràn bảng; thực hiện render/kiểm tra file xuất thật.
4. Completed chỉ khi file tồn tại và tải được qua API kiểm quyền. Failed có lỗi an toàn và retry; không trả stack/đường dẫn nội bộ. Retention ít nhất CompletedAt +6 tháng, chặn xóa trước hạn; sau xóa list/download và link cũ không truy cập được.
5. Test ownership trực tiếp API, Member/Receptionist/Admin không truy báo cáo Manager. Không đưa report vào public/static folder; client không được chọn filesystem path.
6. Đo PDF 20 trang ≤15 giây, ghi dataset/môi trường/kết quả. Tách ngày hoàn và ngày duyệt trong report/exports; đối chiếu số tiền mẫu P1.

## 7. P4 Tích hợp thật và bàn giao

1. Google Login: test login/link với ClientId thật nếu có, bao gồm email trùng không auto-link, account Google-only và ID token không hợp lệ. Secret/config chỉ ở môi trường phù hợp, không commit. Thiếu cấu hình ghi rõ chưa kiểm chứng, tiếp tục việc khác.
2. AI: implement provider thật cho Flow 5, kiểm quyền Coach, goal/level/lịch sử phủ 30 ngày, timeout/error và AiLog. Fixture chỉ dùng test/demo có nhãn; không báo provider deterministic là AI thật. Không bịa lịch sử Member mới; ghi vấn đề đầu vào thiếu nếu cần quyết định.
3. Vận hành: chuẩn bị cấu hình HTTPS, backup hằng ngày và runbook restore; kiểm restore trên DB riêng. BR-35 đo lại có điều kiện rõ; BR-36 uptime cần quan sát môi trường deploy, không suy ra từ test local. Không tự deploy public.
4. Chạy toàn bộ tests cũ và tests mới, frontend lint/typecheck/build và E2E tối thiểu mua gói → thu đủ → booking → cancel/reschedule → attendance, cùng Discount → approve Refund → complete → báo cáo.
5. E2E phải tự chuẩn bị dữ liệu riêng và chạy lặp an toàn. Sửa test harness lỗi rồi chạy lại toàn bộ suite; không dùng “đã chạy tay bù” để báo suite xanh. Test concurrency dùng PostgreSQL thật/Testcontainers, không EF InMemory.
6. Mở UI kiểm tra 5 role, desktop/mobile, trạng thái loading/empty/error, quyền và số dư sau reload. Cập nhật RUNBOOK bằng luồng thực tế; không để hướng dẫn approve là trả tiền.
7. Cập nhật matrix/status: đã làm, đã test, chưa test, blocked, dependency, lệnh/kết quả. Cung cấp URL local và kịch bản người dùng quan sát. Không tự push/merge, không tự reset DB hoặc stage toàn bộ repository.

## 8. Câu hỏi còn mở và cách tiếp tục

| Cần quyết định cụ thể | Trong lúc chờ |
|---|---|
| ClassBased kết thúc khi nào, Coach còn xem lịch sử nào sau kết thúc? | Hoàn thiện quyền theo session và quan hệ do Manager cấp; không tự cấp quyền toàn bộ hồ sơ vô thời hạn. Kiểm schema unique cặp Coach–Member khi có nhiều lớp để nêu phương án trước khi đổi. |
| Manager xử lý hóa đơn quá hạn bằng quy trình nào? | Chặn thu thông thường, hiển thị công nợ; không tự gia hạn/void/tịch thu/hoàn cọc. |
| Refund theo ngày có tính ngày đang sử dụng là chưa dùng không? | Hoàn thiện refund số tiền được duyệt và refund theo lượt; không gọi công thức ngày hiện tại là đã được phê duyệt. |
| Hủy dịch vụ và refund tác động gói/booking tương lai thế nào? | Hoàn thiện hoàn khoản thu thừa có căn cứ Discount/Correction; không tự hủy gói hoặc giữ quyền sử dụng vô điều kiện như một rule mới. |

Hỏi gọn các nhánh cần quyết định khi thực sự phụ thuộc; nêu ví dụ và phương án. Không bỏ toàn bộ P1 chỉ vì công thức refund theo ngày còn mở. Không tự mở quyền SystemAdministrator ngoài scope hoặc thêm soft-delete field cho mọi entity.

## 9. Kịch bản nghiệm thu ưu tiên của người dùng

1. Manager tạo gói → Member chọn → lễ tân thu cọc rồi thu đủ → ngày gói/hạn invoice đúng và chỉ kích hoạt một lần.
2. Member dùng lượt cuối → hủy đúng hạn → lượt hoàn và gói hồi phục nếu đủ điều kiện; hủy trễ không hoàn.
3. Manager dời buổi → session thay thế, booking cũ hủy, lượt hoàn, notification yêu cầu đăng ký lại.
4. Manager duyệt Discount → UI hiện cần hoàn, chưa hiện đã hoàn → duyệt Refund → lễ tân xác nhận trả → số dư và report đổi đúng kỳ.
5. Manager chọn cột PDF → tải file tiếng Việt → role khác gọi cùng URL bị chặn.
6. Coach ghi attendance/result đúng lớp và lấy gợi ý AI thật; Member chỉ xem dữ liệu của mình. Google login/link được kiểm chứng riêng nếu có credentials.

## 10. Prompt để giao Claude Code

```text
Tiếp tục SportHub theo docs/claude-continuation-plan-2026-09-23.md. Đọc SSOT và Business Rules v1.4 đã gộp trong docs/SportManagement_BusinessRules.docx; không tạo lại Markdown mirror đã xóa.

A1–A7 và các chính sách ghi đã duyệt không cần hỏi lại. Làm P0 rồi ưu tiên P1 đối soát/Refund: Discount/Correction giảm nghĩa vụ, Refund Approved chưa phải đã trả; chỉ Receptionist complete với bằng chứng thực trả mới tính RefundedAmount và báo cáo thu ròng. Sửa DB/API/UI/report cùng tests PostgreSQL thật, sau đó tiếp tục P2–P4.

Giữ code/dữ liệu hiện có, không reset DB, không tự ghi bằng chứng hoàn tiền cho dữ liệu legacy, không tự push/merge/deploy. Với câu hỏi mở trong plan, hỏi đúng phần phụ thuộc và làm tiếp phần độc lập. Không dừng ở báo cáo kế hoạch hoặc scaffold.

Hoàn thiện PDF, Google và AI thật trong phạm vi cấu hình có sẵn; thiếu cấu hình ghi blocker cụ thể, không mock rồi báo xong. Chạy lại tests, tạo BR matrix và implementation-status có bằng chứng mới, cập nhật RUNBOOK và chạy app local để tôi quan sát. Phân biệt code đã viết, tests đã pass và tích hợp chưa nghiệm thu.
```
