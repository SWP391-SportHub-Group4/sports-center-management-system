# SportHub — Hệ thống quản lý trung tâm thể thao đa môn (SWP391)

SportHub là **hệ thống quản lý trung tâm thể thao với ba môn Gym (bao gồm PT), cầu lông và bóng rổ; có thể mở rộng thêm môn trong tương lai**. PT là dịch vụ thuộc Gym, không phải môn thứ tư.

Monorepo cho hệ thống quản lý **trung tâm thể thao đa môn**: nhiều bộ môn (phạm vi: Gym (bao gồm PT), Cầu lông, Bóng rổ — Manager quản lý danh mục; mỗi môn có nhiều dịch vụ cấu hình được, xem CAT-01 trong thiết kế), nhiều sân/phòng, **khóa học cố định theo lớp** (ví dụ Cầu lông 01, 02), huấn luyện viên của trung tâm; mọi Member thuê sân theo giờ. Thanh toán bằng tiền (VNPay-QR) kết hợp **ví điểm** (1 điểm = 1.000 VND). Thiết kế đầy đủ: [`docs/Center-Management-System-Design-v3.md`](docs/Center-Management-System-Design-v3.md).

> **Trước khi code:** đọc [SSOT](docs/00-Source-of-Truth.md) và [thiết kế hệ thống](docs/Center-Management-System-Design-v3.md). 
## Sản phẩm

### 5 vai trò

| Vai trò | Làm gì |
|---|---|
| System Administrator | Tạo tài khoản nhân sự (Admin/Manager/Receptionist), đổi vai trò, khóa/mở khóa |
| Center Manager | CRUD môn, phòng/sân, giá thuê sân, Membership; tạo lớp + xếp lịch (AI gợi ý xếp lịch còn là phần chưa triển khai), phân công Coach theo chuyên môn, duyệt hoàn điểm, sự cố/thông báo, báo cáo, Audit Log |
| Coach (của trung tâm) | Chuyên môn theo môn (`CoachSpecialty`); xem lịch dạy và roster lớp mình; Coach có chuyên môn PT: PT session, kế hoạch tập, kết quả, gợi ý AI |
| Member | Đăng ký Membership Gym, PT; xem lớp/khóa học, ghi danh có giữ chỗ, ví điểm, lịch hôm nay/tuần, thông báo, chatbot |
| Receptionist | Tìm/đăng ký Member tại quầy, Gym check-in/out, điểm danh lớp nhóm, checkout thay Member (dùng điểm cần OTP email của Member), Court Schedule, hỗ trợ đối soát |

### Các Flow

| Flow | Loại | Nội dung |
|---|---|---|
| 1 — User & Membership | Bắt buộc | 5 vai trò, Coach + chuyên môn, Membership Gym, Gym check-in, mật khẩu mạnh, quên mật khẩu bằng link email (không hỏi mật khẩu cũ, phản hồi trung tính) |
| 2 — Class booking & schedule | Bắt buộc | Môn/Phòng/Sân, lớp theo khóa, ghi danh + giữ chỗ chống bán vượt sĩ số, ngưỡng hoàn vốn, Court Schedule, thuê sân, điểm danh lớp nhóm |
| 3 — Payment & report | Bắt buộc | Invoice nhiều loại item, VNPay-QR, ví điểm + split payment, hoàn trả **chỉ bằng điểm**, báo cáo theo môn/nguồn |
| 4 — Training & attendance | Optional (nhóm vẫn làm) | PT: kế hoạch, kết quả, điểm danh |
| 5 — AI workout recommendation | Optional (nhóm vẫn làm) | Gợi ý bài tập cho Coach có chuyên môn PT |
| 6 — AI assistant | Nhóm làm | Member assistant theo context đã có mã; Manager AI xếp lịch/function calling chưa triển khai |

### Quy tắc chính cần nhớ

- **Điểm:** 1 điểm = 1.000 VND, không hết hạn, không rút tiền mặt. **Mọi hoàn trả chỉ bằng điểm — không có hoàn tiền mặt/chuyển khoản, không gọi VNPay Refund API.**
- **Split payment:** một Invoice trả bằng điểm + VNPay-QR (ví dụ 300.000đ = 200 điểm + 100.000đ). Receptionist thanh toán thay Member **bắt buộc** có OTP 6 số gửi email Member (hiệu lực 5 phút, sai tối đa 5 lần).
- **Giữ chỗ:** checkout lớp giữ chỗ 15 phút; không bán vượt sĩ số (ràng buộc ở DB).
- **Ngưỡng hoàn vốn:** lớp chốt trước khai giảng N ngày; dưới ngưỡng thì học viên chọn chuyển lớp hoặc hoàn điểm.
- **Chống trùng lịch:** sân/Coach dùng exclusion constraint PostgreSQL (`btree_gist`).

## Cấu trúc

```
sports-center-management-system/
├── backend/     # ASP.NET Core Web API (feature-based modular monolith, 11 project) — mở bằng Rider
├── frontend/    # Next.js — mở bằng VS Code
├── ai/          # Reserved — AI hiện đang là module bên trong backend, xem ai/README.md
├── docs/        # Business Rules v2.0, Design v3 (ERD, API, RBAC...), SSOT, RUNBOOK, Git workflow
└── docker-compose.yml
```

**Không thêm project backend mới**: ví điểm nằm trong `SportHub.Payment/Wallet`, catalog môn/phòng/giá sân nằm trong `SportHub.Scheduling/Catalog` nằm trong module tương ứng; các module chỉ gọi nhau qua interface ở `BuildingBlocks`.

## Tài liệu

| Tài liệu | Vai trò |
|---|---|
| [`docs/SportManagement_BusinessRules_v2.0_updated.docx`](docs/SportManagement_BusinessRules_v2.0_updated.docx) | Business Rules v2.0 — nguồn nghiệp vụ hiện hành (thắng khi mâu thuẫn) |
| [`docs/Center-Management-System-Design-v3.md`](docs/Center-Management-System-Design-v3.md) | Thiết kế độc lập: phạm vi, module, dữ liệu, luồng, payment, bảo mật, kiểm thử và danh sách phần chưa hoàn thành |
| [`docs/00-Source-of-Truth.md`](docs/00-Source-of-Truth.md) | Phạm vi, thuật ngữ, quy ước và thứ tự nguồn |
| [`docs/Requirements.md`](docs/Requirements.md), [`docs/SWP391_Report_SRS.docx`](docs/SWP391_Report_SRS.docx) | Yêu cầu và báo cáo SRS |
| [`docs/entity-field-purpose.md`](docs/entity-field-purpose.md) | Ý nghĩa từng trường của entity |
| [`docs/RUNBOOK.md`](docs/RUNBOOK.md) | Khởi động PostgreSQL, backend và frontend trên máy local |
| [`docs/GIT_WORKFLOW.md`](docs/GIT_WORKFLOW.md) | Quy trình Git, phân module theo giai đoạn G0–G12 |
| [`PRODUCT.md`](PRODUCT.md), [`DESIGN-SKILLS-GUIDE.md`](DESIGN-SKILLS-GUIDE.md), [`DESIGN-TOKENS.md`](DESIGN-TOKENS.md) | Sản phẩm, quy trình UX/UI hai skill, phân công page/API và bộ token duy nhất |

## Chạy thử nhanh

Xem [`docs/RUNBOOK.md`](docs/RUNBOOK.md) để khởi động backend và frontend.

> Đây là đặc tả đích; code và kiểm thử đã được chuyển theo đặc tả này. VNPay/mock và checkout mới đã có; sandbox merchant thật, SMTP và Google thật vẫn cần xác minh trong môi trường tích hợp riêng.

## Backend — Feature-based Modular Monolith (11 project)

```
backend/
├── SportHub.API/                  # Composition root — Program.cs, DbContext, Migrations, controller
│   ├── Controllers/
│   │   └── HealthController.cs
│   ├── Persistence/
│   │   └── SportHubDbContext.cs
│   ├── Migrations/
│   ├── Extensions/
│   │   ├── CorsExtensions.cs
│   │   ├── SwaggerExtensions.cs
│   │   └── AuthorizationPolicyExtensions.cs
│   └── Program.cs / appsettings*.json
├── SportHub.BuildingBlocks/       # Hạ tầng dùng chung — KHÔNG phụ thuộc bất kỳ module nghiệp vụ nào
│   ├── Abstractions/Persistence/ISportHubDbContext.cs
│   └── Infrastructure/Authentication/{JwtOptions,JwtService,JwtBearerExtensions}.cs
├── SportHub.Identity/             # Role (5 vai trò), UserAccount, UserCredential, UserProfile, UserExternalLogin, UserSportSpecialty, EmailOtp
├── SportHub.Membership/           # MembershipPackage, MemberPackage, MemberTrainingProfile
├── SportHub.Scheduling/           # Catalog/ (Sport, RoomType, Room, CourtRate), Class, ClassSession, Enrollment, SeatHold, CourtRental, Occupancy, Attendance
├── SportHub.Training/             # CoachMemberRelationship, WorkoutPlan, WorkoutPlanItem, WorkoutResult
├── SportHub.Payment/              # Invoice, InvoiceItem, Payment, PaymentAdjustment (hoàn = điểm), Wallet/ (ví điểm), VnPay/ (IPaymentGateway: VnPay + Mock)
├── SportHub.Notification/         # Notification
├── SportHub.AI/                   # AiLog, gợi ý tập luyện (BR-26/27), chatbot function calling (ChatToolRegistry)
├── SportHub.Audit/                # AuditLog — module riêng vì có FK thật sang UserAccount (Identity)
└── SportHub.Administration/       # SystemSetting, ReportExport + thao tác quản trị tài khoản
                                   #   Tách riêng vì khoá/mở khoá (BR-6) bắt buộc ghi Audit trong
                                   #   cùng transaction (BR-7): Audit đã phụ thuộc Identity, nên để
                                   #   Identity gọi ngược Audit sẽ thành vòng phụ thuộc.
```

Mỗi module (trừ `API`/`BuildingBlocks`) dùng chung 1 cấu trúc nội bộ:

```
SportHub.<Module>/
├── <Module>ModuleMarker.cs
├── Domain/
│   ├── Entities/        # Entity thật, di chuyển nguyên trạng từ SportHub.Repository cũ
│   └── Enums/           # Enum thật
├── Domain/Rules/         # Bất biến nghiệp vụ dùng chung giữa các use case (vd MemberPackageRules)
├── Application/          # use case của module — Interface/Service tách riêng, DTO/Command tách theo request-response
│   ├── Interfaces/       # IFooService — hợp đồng, Controller inject qua đây (BẮT BUỘC, không khai báo trong Services/)
│   ├── Services/         # FooService — cài đặt interface, chứa logic thật
│   ├── DTOs/             # Response — kết quả trả ra, gom theo tính năng (vd DTOs/Packages/)
│   ├── Commands/         # Request — dữ liệu nhận vào, gom theo tính năng (vd Commands/Packages/)
│   └── Queries/          # Reserved — tham số đọc hiện truyền thẳng qua method argument, chưa dùng
├── Api/                  # Controller của module (nạp vào MVC qua AddApplicationPart ở SportHub.API)
└── Infrastructure/Persistence/Configurations/   # IEntityTypeConfiguration<T>, 1 file / entity
```

Dependency giữa các module (không có vòng lặp — sơ đồ đầy đủ + lý do từng mũi tên xem trong plan):

```
SportHub.API   → BuildingBlocks + tất cả module
Administration → Identity, Audit, Membership, Payment, BuildingBlocks
AI             → Identity, Membership, Scheduling, Training, BuildingBlocks
Training       → Identity, Scheduling, BuildingBlocks
Scheduling     → Identity, Membership, BuildingBlocks
Payment        → Identity, Membership, BuildingBlocks
Membership / Notification / Audit → Identity, BuildingBlocks
Identity       → BuildingBlocks
BuildingBlocks → (không phụ thuộc module nào)
```

Khi hai module cần gọi nhau theo chiều sẽ tạo vòng, seam được khai báo ở `BuildingBlocks` và cài
đặt ở module sở hữu dữ liệu — mỗi interface đều ghi rõ vòng phụ thuộc nào đang được cắt:

| Seam (ở `BuildingBlocks/Abstractions`) | Cài đặt ở | Ai gọi |
|---|---|---|
| `IAuditWriter` (BR-7) | `Audit` | Membership, Scheduling, Payment, Training, Administration |
| `INotificationWriter` (BR-33/34) | `Notification` | Scheduling, Payment |
| `ISystemSettingProvider` (BR-39/50) | `Administration` | Scheduling |
| `ICoachRelationshipRegistrar` | `Training` | Scheduling |
| `IPointWalletService` | `Payment` | Scheduling |
| `IOccupancyService`, `ISportCatalogReader` | `Scheduling` | Payment, AI, Training |
| `IClassEnrollmentFulfillment` | `Scheduling` | Payment (khi Invoice Paid) |

Các seam mới (dòng đánh dấu "mới") là dự kiến theo thiết kế hệ thống, chưa có trong mã.

Target framework: **net10.0** (cả 11 project). Entity/enum/state cho từng module: xem
[SSOT](docs/00-Source-of-Truth.md)–4 trước khi code.

## Cấu hình tích hợp

Backend đọc cấu hình qua biến môi trường (`__` = cấp lồng nhau, ví dụ `VnPay__TmnCode` → `VnPay:TmnCode`). Mẫu ở `.env.example`. Các tích hợp ngoài có hành vi fallback khác nhau; bảng dưới mô tả đúng runtime hiện tại:

| Biến | Bắt buộc | Thiếu thì |
|---|---|---|
| `POSTGRES_*`, `ConnectionStrings__Default` | Có | Không chạy được |
| `JwtOptions__SecretKey` (≥ 32 ký tự) | Có | API không khởi động |
| `Google__ClientId` | Không | `/api/auth/google` trả `503 google_login_not_configured` |
| `VnPay__TmnCode`, `VnPay__HashSecret`, `VnPay__PaymentUrl`, `VnPay__ReturnUrl`, `VnPay__QueryUrl` | Có khi dùng gateway thật | Mock chỉ khi Development và `VnPay__UseMock=true`; thiếu credential không tự fallback. Ngoài Development, startup yêu cầu credential và URL HTTPS. |
| `Email__Smtp__Host/Username/Password` (Gmail App Password) | Không | Dùng `LoggingEmailSender`: nội dung email (kể cả **OTP**) ghi vào log backend |
| `Gemini__ApiKey` (+ `Gemini__Model`, `Gemini__BaseUrl`, `Gemini__TimeoutSeconds`) | Không | Endpoint Gemini trả `503 gemini_not_configured`; gợi ý workout rule-based vẫn độc lập |
| `Reports__StorageRoot` | Không | `<thư mục chạy>/App_Data/reports` |

> `docker-compose.yml` hiện map `ConnectionStrings__Default`, JWT, Google, `VnPay__*`, SMTP/DataProtection và `Gemini__*` vào backend. Development có thể dùng `VnPay__UseMock=true` và `Email__DemoLoggingEnabled=true`; không dùng các chế độ demo đó để chứng nhận sandbox VNPay hoặc SMTP thật.

## Ghi chú kỹ thuật

- **Stack:** ASP.NET Core (net10.0, modular monolith) + PostgreSQL 16 (bật `btree_gist`) + Next.js; không Redis/RabbitMQ.
- **Chống trùng lịch/bán vượt:** `room_occupancies`, `coach_occupancies` với exclusion constraint; `classes.reserved_count` cập nhật có điều kiện trong transaction.
- **Job nền** chạy trong tiến trình API: giữ chỗ, thuê sân, ngưỡng hoàn vốn, trạng thái lớp, điểm danh PT, hạn Membership, gửi outbox.
- **AI assistant:** endpoint backend lấy `userId` từ JWT, build context chỉ-đọc từ dữ liệu SportHub rồi gọi provider Gemini; API key chỉ ở backend. Các action nghiệp vụ vẫn đi qua API/authorization riêng, không để model tự ghi DB.
- **Múi giờ:** `Asia/Ho_Chi_Minh` cho mọi hiển thị lịch.

## Chạy local

Ở môi trường `Development`, backend tự áp migration và seed dữ liệu demo khi khởi động —
nhưng **chỉ khi database chưa có tài khoản nào**, nên không bao giờ ghi đè dữ liệu đang có.
Cách khởi động: [`docs/RUNBOOK.md`](docs/RUNBOOK.md). Tài khoản demo do `DemoDataSeeder.cs` tạo.

### Cách 1: Docker Compose (cả 3 service)

```bash
cp .env.example .env          # lần đầu — xem giá trị mẫu trong .env.example
docker compose up -d
```

Chạy xong sẽ có 3 container: `sporthub-postgres`, `sporthub-backend`, `sporthub-frontend`. Kiểm tra bằng `docker ps` hoặc Docker Desktop.

| Thành phần | Link |
|---|---|
| Backend — Swagger UI | http://localhost:5000/swagger |
| Frontend | http://localhost:3000 |

### Gate frontend / P2.12–P2.16

Frontend yêu cầu **Node 24 + npm 11**. Từ `frontend/` chạy:

```bash
npm ci
npm run typecheck
npm run lint
npm run check:i18n
npm run build
npm run test:e2e
```

CI trên PR vào `develop` chạy thêm Playwright với PostgreSQL + backend Development thật và upload report/trace khi fail. Hợp đồng API: `docs/api-contract.md`.

### Cách 2: Chạy riêng từng phần (debug trong Rider/VS Code)

Tắt container tương ứng trong docker-compose trước khi chạy thủ công để tránh trùng port:

```bash
cd backend/SportHub.API && dotnet run
cd frontend && npm install && npm run dev
```

| Thành phần | Link |
|---|---|
| Backend — Swagger UI (http) | http://localhost:5000/swagger |
| Backend — Swagger UI (https) | https://localhost:7100/swagger |
| Frontend | http://localhost:3000 |

Xem chi tiết thiết kế: [`docs/Center-Management-System-Design-v3.md`](docs/Center-Management-System-Design-v3.md)

---
