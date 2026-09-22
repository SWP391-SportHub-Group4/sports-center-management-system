# Trạng thái triển khai — cập nhật 22/09/2026

> Đây là nhật ký kiểm chứng, không phải bản cam kết. Mọi số liệu dưới đây đến từ lệnh thực
> chạy trên máy phát triển trong phiên làm việc này; mục nào chưa chạy được thì ghi là chưa
> chạy, không suy ra từ lần trước.
>
> Kế hoạch gốc: [claude-continuation-plan-2026-09-23.md](claude-continuation-plan-2026-09-23.md).
> Ma trận BR: [br-implementation-matrix.md](br-implementation-matrix.md).

> **Cập nhật cuối phiên:** người dùng đã mở Docker Desktop, blocker B1 được gỡ.
> **Toàn bộ 191/191 test pass**, hai migration mới đã kiểm chứng hai chiều trên DB sạch có
> dữ liệu legacy, và kịch bản nghiệm thu §9.4 đã chạy hết qua HTTP thật. Chi tiết ở §7.

## 1. Môi trường tại thời điểm chạy

| Thành phần | Trạng thái |
|---|---|
| .NET SDK | 10.0.401 — hoạt động |
| Node.js | v24.21.0 — hoạt động |
| dotnet-ef | 10.0.12 (global tool) — hoạt động |
| Docker Desktop | Ban đầu không lên (B1); người dùng mở tay → **29.5.2, hoạt động** |
| PostgreSQL (docker-compose, cổng 5435) | Hoạt động sau khi Docker lên |
| PostgreSQL 17 (native, cổng 5432) | Đang chạy nhưng không dùng — không có credential |

## 2. Baseline đo được

### 2.1 Build

```
dotnet build backend/SportHub.sln      → Build succeeded, 0 Error(s)
cd frontend && npx tsc --noEmit        → không có lỗi
cd frontend && npx eslint src          → không có lỗi, không có warning
```

### 2.2 Test — ảnh chụp ĐẦU phiên (khi Docker chưa lên)

> Bảng này giữ lại làm baseline lịch sử. **Kết quả cuối phiên ở §7.1: 191/191 pass.**

`dotnet test backend/SportHub.sln`, chạy 22/09/2026 khi Docker chưa khởi động được:

| Project | Pass | Fail | Tổng | Ghi chú |
|---|---:|---:|---:|---|
| `SportHub.Administration.Tests` (mới) | 15 | 0 | 15 | Toàn bộ pass — không cần DB, render PDF thật rồi trích ngược text |
| `SportHub.Payment.Tests` (mới) | 25 | 31 | 56 | 25 pass = toàn bộ unit test; 31 fail = toàn bộ integration test |
| `SportHub.Scheduling.Tests` | 14 | 40 | 54 | như trên |
| `SportHub.Security.Tests` | 27 | 38 | 65 | như trên |
| **Tổng** | **81** | **109** | **190** | |

**Toàn bộ 109 failure có cùng một nguyên nhân duy nhất** và không có failure nào là lỗi
nghiệp vụ:

```
DotNet.Testcontainers.Builders.DockerUnavailableException :
Docker is either not running or misconfigured.
Failed to connect to Docker endpoint at 'npipe://./pipe/docker_engine'.
```

> Con số "119 test pass" trong các báo cáo trước là bằng chứng lịch sử cho code cũ và **không**
> được dùng làm nghiệm thu cho v1.4.

## 3. Đã làm trong phiên này

### 3.1 P1 — đối soát thu/hoàn theo BR-41/42/43 v1.4

> Cột "Trạng thái" dưới đây ghi tại thời điểm Docker chưa lên. **Sau khi gỡ B1, tất cả đã
> chạy và pass — xem §7.1 và §7.4.**

| Hạng mục | File | Trạng thái |
|---|---|---|
| Mô hình số dư v1.4 (6 đại lượng tách bạch) | `SportHub.Payment/Domain/Rules/InvoiceMath.cs` | Đã viết, **25 unit test pass** |
| Metadata thực trả trên entity | `SportHub.Payment/Domain/Entities/PaymentAdjustment.cs` | Đã viết, chưa chạy trên DB |
| CHECK constraint bằng chứng thực trả | `.../Configurations/PaymentAdjustmentConfiguration.cs` | Đã viết, chưa chạy trên DB |
| Migration + xử lý dữ liệu cũ | `SportHub.API/Migrations/20260922062330_AddRefundPayoutEvidence.cs` | Đã sinh, **chưa apply lên DB nào** |
| Tách approve / complete | `.../Services/PaymentAdjustmentService.cs` | Đã viết, chưa chạy |
| Endpoint `POST /api/payment-adjustments/{id}/complete` | `SportHub.Payment/Api/InvoicesController.cs` | Đã viết, chưa gọi thật |
| Báo cáo thu ròng theo ngày thực trả | `.../Services/RevenueReportService.cs` | Đã viết, chưa chạy |
| BR-55 phân biệt cọc với trả đủ | `.../Services/PaymentRecordingService.cs` | Đã viết, chưa chạy |
| BR-30 kích hoạt gói dùng chung hai đường | `.../Services/PackageActivationService.cs` (mới) | Đã viết, chưa chạy |
| BR-10/11 hoàn lượt có điều kiện | `SportHub.Membership/Domain/Rules/MemberPackageRules.cs` | Đã viết, chưa chạy |
| Cột báo cáo xuất theo đại lượng mới | `SportHub.Administration/...` | Đã viết, chưa chạy |
| UI số dư + xác nhận thực trả | `frontend/src/components/InvoiceWorkbench.tsx` | Đã viết, **chưa mở bằng trình duyệt** |
| UI duyệt của Manager | `frontend/src/app/quan-ly/dieu-chinh/page.tsx` | Đã viết, chưa mở |
| UI báo cáo | `frontend/src/app/quan-ly/bao-cao/page.tsx` | Đã viết, chưa mở |
| UI hội viên tách "cần hoàn" / "đã hoàn" | `frontend/src/app/hoi-vien/hoa-don/page.tsx` | Đã viết, chưa mở |

### 3.2 Bộ test mới

`backend/SportHub.Payment.Tests` — trước phiên này module Payment **không có test nào**.

- `Unit/InvoiceBalanceTests.cs` — 25 test, **đã chạy và pass**. Phủ: công thức BR-41 v1.4,
  chống giảm trừ hai lần, trần thu, `DeriveStatus` giữ Paid/Void, AddMonths cuối tháng và
  năm nhuận.
- `Integration/RefundWorkflowTests.cs` — 13 test, **chưa chạy** (cần DB).
- `Integration/DepositAndActivationTests.cs` — 10 test, **chưa chạy**.
- `Integration/RevenueReportPeriodTests.cs` — 8 test, **chưa chạy**.

`backend/SportHub.Administration.Tests` — cũng là bộ test mới.

- `Unit/ReportPdfRendererTests.cs` — 15 test, **đã chạy và pass**, không cần DB.
  Các test này sinh file PDF thật rồi **trích ngược text bằng PdfPig** để so sánh, chứ không
  chỉ kiểm "hàm không ném lỗi" — một font thiếu glyph vẫn sinh PDF hợp lệ với chữ mất dấu và
  không có exception nào báo.

### 3.3 P3 — BR-48 PDF (mới làm, đã kiểm chứng)

| Hạng mục | File | Trạng thái |
|---|---|---|
| Bộ render PDF (QuestPDF 2026.9.0) | `SportHub.Administration/Infrastructure/ReportPdfRenderer.cs` | ✅ **15 test pass** |
| Nhãn cột tiếng Việt + canh lề số | `SportHub.Administration/Domain/Entities/ReportColumnLabels.cs` | ✅ |
| `ReportExport.Format` (whitelist Csv/Pdf + CHECK ở DB) | `Domain/Entities/ReportExport.cs`, `ReportExportConfiguration.cs` | 🟡 chưa apply migration |
| Dựng dữ liệu một lần, serialize hai định dạng | `ReportExportService.RunAsync` | 🟡 chưa chạy trên DB |
| Storage + download đúng đuôi file và content type | `FileSystemReportStorage.cs`, `AdministrationControllers.cs` | 🟡 |
| Retention tính từ `CompletedAt` (BR-46 v1.4) | `ReportExportService.RunAsync` | 🟡 |
| Chọn định dạng trên UI | `frontend/src/app/quan-ly/bao-cao/page.tsx` | 🟡 chưa mở trình duyệt |

**Số đo BR-48** (`PDF_20_trang_sinh_duoi_15_giay`, chạy 22/09/2026):

| Điều kiện đo | Giá trị |
|---|---|
| Máy | Windows 11, .NET 10.0.401, Debug build |
| Dữ liệu | 700 dòng × 11 cột, khổ A4 ngang |
| Kết quả | **42 trang / 547 ms / 211 KB** |
| Ngưỡng BR-48 | 20 trang trong ≤15 giây |
| Kết luận | Đạt với biên rất rộng (42 trang, gấp đôi yêu cầu, hết 3,6% ngân sách thời gian) |
| Phạm vi đo | CHỈ thời gian render, dữ liệu đã có sẵn trong bộ nhớ. **Không** gồm truy vấn DB |

Tiếng Việt đã được kiểm chứng thật: text trích ngược từ PDF chứa đúng
`Số hóa đơn`, `Giảm nghĩa vụ`, `Thực thu`, `Cần hoàn`, `Nguyễn Thị Mỹ Duyên`, `Đỗ Quỳnh Hương`
và từng ký tự trong `ếộữỹĐợằễịạẩừ`. Header cột lặp lại trên mọi trang và mỗi trang có số trang.

## 4. Blockers (ghi khi phát hiện; trạng thái cuối ở §7)

### B1 — ~~Không chạy được integration test~~ → ĐÃ GỠ

**Đã giải quyết:** người dùng mở Docker Desktop bằng tay; toàn bộ test chạy được, 191/191
pass (§7.1). Phần mô tả bên dưới giữ lại để biết cách xử lý nếu gặp lại.

- **Hiện tượng:** `docker info` báo không kết nối được `npipe:////./pipe/dockerDesktopLinuxEngine`.
  Đã thử khởi động `Docker Desktop.exe` hai lần; log cho `backend process exited` sau ~50 giây
  và không còn tiến trình docker nào. Docker Desktop cần đăng nhập/khởi động tương tác trên
  máy này.
- **Ảnh hưởng:** 109/175 test không chạy được, gồm toàn bộ test chứng minh BR-41/42/43 v1.4,
  và migration `AddRefundPayoutEvidence` chưa được apply lên bất kỳ DB nào.
- **Cách gỡ (một trong hai):**
  1. Mở Docker Desktop bằng tay, đợi biểu tượng chuyển xanh, rồi chạy lại
     `dotnet test backend/SportHub.sln`.
  2. Dùng PostgreSQL có sẵn. Suite Payment đã hỗ trợ sẵn biến môi trường
     `SPORTHUB_TEST_POSTGRES`:

     ```bash
     createdb -h localhost -p 5432 -U postgres sporthub_payment_tests
     SPORTHUB_TEST_POSTGRES="Host=localhost;Port=5432;Database=sporthub_payment_tests;Username=postgres;Password=<mật khẩu của bạn>" \
       dotnet test backend/SportHub.Payment.Tests/SportHub.Payment.Tests.csproj
     ```

     **Phải là DB trống, tách riêng** — suite chạy migration và ghi dữ liệu thật.
- **Đã cố tình KHÔNG làm:** đoán mật khẩu PostgreSQL trên máy; thử với `sporthub` +
  mật khẩu trong `.env` thì bị `password authentication failed`, và dừng ở đó.

### B2 — ~~Migration chưa được kiểm chứng~~ → ĐÃ GỠ (xem §7.3)

`AddRefundPayoutEvidence` có 4 câu `UPDATE` xử lý dữ liệu cũ và 2 CHECK constraint. Logic đã
được viết để không làm hỏng dữ liệu (xem
[legacy-refund-reconciliation.md](legacy-refund-reconciliation.md)) nhưng **chưa chạy trên DB
nào**, kể cả DB trống. Cần chạy cả hai chiều trước khi coi là xong:

```bash
dotnet ef database update --project backend/SportHub.API   # nâng cấp
dotnet ef migrations script 20260921134322 20260922062330 --project backend/SportHub.API   # xem SQL
```

### B3 — ~~PDF (BR-48) chưa có~~ → đã làm, còn phần cần DB

Bộ render PDF đã xong và **đã kiểm chứng bằng 15 test pass** (xem §3.3). Phần còn treo:

- Migration `AddReportExportFormat` **chưa apply** — cùng blocker B2.
- Luồng end-to-end "tạo export PDF qua API → tải về → mở file" **chưa chạy thật** vì cần DB.
- Chưa đo lại thời gian trên Release build và trên phần cứng deploy.

### B4 — AI (Flow 5) chưa phải provider thật

`SportHub.AI/Infrastructure/RuleBasedAiRecommendationService.cs` là bộ luật cục bộ tất định.
Bản thân file đã tự ghi rõ không phải mô hình học máy. BR-26 (3 nguồn đầu vào) và BR-27
(AiLog) được kiểm ở `WorkoutRecommendationService`, nhưng **không được báo là "AI thật đã
xong"**. Chưa có API key nào được cấu hình trong phiên này.

### B5 — Google Login chưa kiểm chứng end-to-end

`GoogleAuthService` có trong code. Không có `ClientId` thật trong cấu hình phiên này nên
không thử được luồng login/link thật.

## 5. Việc còn lại theo thứ tự

1. Gỡ B1, chạy 31 integration test của Payment, sửa nếu có fail thật (P1 chưa xong tới khi đó).
2. Apply và kiểm chứng hai migration mới (AddRefundPayoutEvidence, AddReportExportFormat) theo cả hai chiều trên DB test sạch + một bản copy của DB hiện có (B2).
3. Mở UI 5 role kiểm tra thực tế, chụp màn hình kịch bản §9.4 của plan.
4. P2 còn lại: BR-50/13/16/51/54 và attendance finalizer — mới sửa phần BR-10/11, chưa rà hết.
5. P3 còn lại: contract enum UPPER_SNAKE_CASE, test ownership báo cáo (BR-45) qua API. PDF và retention đã làm, cần chạy end-to-end.
6. P4: AI thật (B4), Google (B5), backup/HTTPS/runbook restore, E2E.

## 6. Lệnh đã chạy trong phiên (để lặp lại)

```bash
dotnet build backend/SportHub.sln
dotnet test backend/SportHub.sln
dotnet test backend/SportHub.Payment.Tests/SportHub.Payment.Tests.csproj
cd frontend && npx tsc --noEmit
cd frontend && npx eslint src
dotnet ef migrations add AddRefundPayoutEvidence --project backend/SportHub.API
```

---

## 7. Kết quả sau khi gỡ blocker B1 (cuối phiên 22/09/2026)

### 7.1 Toàn bộ test pass

`dotnet test backend/SportHub.sln` với Docker đang chạy:

| Project | Pass | Fail | Tổng |
|---|---:|---:|---:|
| `SportHub.Administration.Tests` | 15 | 0 | 15 |
| `SportHub.Payment.Tests` | 57 | 0 | 57 |
| `SportHub.Scheduling.Tests` | 54 | 0 | 54 |
| `SportHub.Security.Tests` | 65 | 0 | 65 |
| **Tổng** | **191** | **0** | **191** |

### 7.2 Một lỗi THẬT do test mới phát hiện: thu vượt trần khi đồng thời

Lần chạy đầu tiên có **1 test fail thật** (không phải lỗi hạ tầng):

```
DepositAndActivationTests.Hai_khoan_thu_dong_thoi_khong_vuot_tran
  Đã thu 2,000,000 VND, vượt trần 1.000.000 VND.
```

Nguyên nhân: `PaymentRecordingService` đọc số dư bên trong transaction nhưng **không khoá
hàng hoá đơn**. Ở mức cô lập mặc định Read Committed của PostgreSQL, hai transaction song
song cùng thấy ảnh chụp trước khi nhau ghi, cùng kết luận còn đủ Outstanding, và cùng được
chấp nhận — vi phạm trực tiếp yêu cầu "khóa/kiểm tra số dư nguyên tử" của BR-41.

Đã sửa: thêm `SELECT ... FOR UPDATE` trên hàng `invoices` ở cả hai đường ghi tiền
(`PaymentRecordingService.LockInvoiceAsync` và `PaymentAdjustmentService.LockAdjustmentAsync`),
thứ tự khoá thống nhất **hoá đơn → adjustment** ở mọi đường để tránh deadlock. Bổ sung thêm
test `Hai_refund_khac_nhau_complete_dong_thoi_khong_vuot_tran` cho nhánh hai adjustment khác
nhau của cùng hoá đơn — khoá theo hàng adjustment không cứu được ca đó.

### 7.3 Migration đã kiểm chứng hai chiều trên dữ liệu legacy

Chạy trên container PostgreSQL 16 dùng một lần (`sporthub-migration-check`, cổng 55432, đã
xoá sau khi xong), quy trình: migrate về mốc trước v1.4 → seed dữ liệu **đúng hình dạng cũ**
(Refund Completed chỉ có `resolved_at`, không có bằng chứng thực trả) → migrate lên → kiểm →
migrate xuống → migrate lên lại.

Kết quả đúng như [chính sách đối soát](legacy-refund-reconciliation.md):

| Bản ghi legacy | `requested_amount` | `approved_at_utc` | `completed_at_utc` | Cách ly |
|---|---|---|---|---|
| Refund Completed | = amount | backfill từ `resolved_at` | **để trống** | **TRUE** |
| Discount Completed | = amount | backfill | backfill (đúng sự thật) | FALSE |
| Refund Rejected | = amount | backfill | để trống | FALSE |

- CHECK constraint chặn đúng một Refund Completed MỚI thiếu bằng chứng
  (`CK_payment_adjustments_completed_has_date`).
- `report_exports.format` backfill về `Csv` cho bản ghi cũ, không vi phạm CHECK.
- Chiều xuống giữ nguyên toàn bộ dữ liệu (3 adjustment, 1 invoice còn đủ).

### 7.4 Kịch bản nghiệm thu §9.4 chạy qua HTTP thật

API cổng 5001, DB `sporthub_demo_v14` (tách riêng, xem §7.6):

| Bước | Kết quả đo được | Đúng kỳ vọng |
|---|---|---|
| Thu đủ 1.800.000 | `grossCollected=1800000 outstanding=0 refundDue=0 status=Paid` | ✅ |
| Duyệt Discount 500k | `netPayable=1300000 netCollected=1800000 refundDue=500000 refunded=0 status=Paid` | ✅ cần hoàn xuất hiện, đã hoàn vẫn 0, Paid giữ nguyên (BR-40) |
| **Duyệt Refund 500k** | `status=Approved awaitingPayout=true completedAtUtc=null` → `refundDue=500000 refunded=0 netCollected=1800000` | ✅ **tiền KHÔNG đổi khi duyệt** |
| Lễ tân xác nhận thực trả | `status=Completed method=Cash completedBy=Lê Thị Lễ Tân` → `refundDue=0 refunded=500000 netCollected=1300000` | ✅ |
| Retry complete | `HTTP 409` | ✅ không hoàn hai lần |
| Báo cáo thu ròng | `collected=3600000 refunded=500000 obligationReduction=500000 NET=3100000` | ✅ NET không trừ giảm nghĩa vụ (BR-43) |
| Phân quyền báo cáo | letan `403`, manager `200` | ✅ BR-32 |
| Xuất PDF | `status=Completed format=Pdf rows=2 bytes=28623`, tải về `Content-Type: application/pdf`, file bắt đầu `%PDF-` | ✅ BR-48 |
| Tải file của người khác | letan `403` | ✅ BR-45 |

Script: `acceptance.sh` trong thư mục scratchpad của phiên (không commit vào repo).

### 7.5 Sự cố cần biết: migration đã chạy nhầm lên DB `sporthub`

Khi Docker khởi động, compose stack tự bật lại (`restart: unless-stopped`), kéo theo
postgres/backend/frontend cũ. Một lệnh `dotnet ef database update` và một lần chạy API đã
lấy connection string mặc định trong `appsettings.json` (cổng 5435, DB `sporthub`) thay vì
biến môi trường được truyền vào, nên **hai migration mới đã được áp lên DB `sporthub`**.

Đã kiểm tra ngay sau đó: **không mất dữ liệu** — 7 invoice, 7 payment, 17 user còn nguyên;
bản ghi adjustment duy nhất (Discount, trạng thái Requested) không bị backfill sai. Migration
này chỉ thêm cột và backfill theo đúng chính sách, và đã được chứng minh là hoàn tác được.

Muốn đưa DB `sporthub` về trạng thái trước đó:

```bash
cd backend/SportHub.API
dotnet ef database update AddBusinessRuleSupportTables \
  --connection "Host=localhost;Port=5435;Database=sporthub;Username=sporthub;Password=<mật khẩu>"
```

**Bài học đã ghi lại:** `env` trong `.claude/launch.json` không có tác dụng, và biến môi
trường `ConnectionStrings__Default` cũng không thắng được `appsettings.json` qua `dotnet ef`.
Cách chắc chắn là truyền tham số dòng lệnh: `dotnet ef ... --connection "..."` cho EF, và
`dotnet run ... -- --ConnectionStrings:Default "..."` cho API.

### 7.6 App đang chạy để quan sát

| Thành phần | URL | DB |
|---|---|---|
| API (code mới) | http://localhost:5001 — Swagger tại `/swagger` | `sporthub_demo_v14` |
| Frontend (code mới) | **http://localhost:3001** | qua API 5001 |
| Compose cũ (code đã commit) | 5000 / 3000 | `sporthub` |

`sporthub_demo_v14` là DB **mới tạo, tách riêng**, đã seed 12 tài khoản demo. Frontend đọc
`frontend/.env.local` (nằm trong `.gitignore`) để trỏ sang cổng 5001.

Tài khoản demo, mật khẩu `Sporthub@123`: `admin@sporthub.vn`, `manager@sporthub.vn`,
`letan@sporthub.vn`, `coach.yoga@sporthub.vn`, `coach.pt@sporthub.vn`, `an.member@sporthub.vn`.

Lưu ý: policy `auth-login` giới hạn 10 request/IP/phút, nên đăng nhập đổi vai trò liên tục
có thể gặp `429` — đợi một phút là được (đây là BR-35/§5.6 hoạt động đúng).
