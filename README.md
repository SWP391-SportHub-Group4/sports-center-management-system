# Sports Center Management System (SWP391)

Monorepo cho hệ thống quản lý trung tâm thể thao đa bộ môn (Gym, Personal Training, Yoga, Group X) — xem đầy đủ thiết kế trong `docs/`.

> **Trước khi code :** đọc [`docs/00-Source-of-Truth.md`](docs/00-Source-of-Truth.md) trước.
> Đây là nguồn duy nhất chốt scope MVP, entity/enum/state, và quy ước ID/money/timezone — nếu file đó và
> doc khác (design v2, business rules...) mâu thuẫn nhau thì `00-Source-of-Truth.md` thắng.

## Cấu trúc

```
sports-center-management-system/
├── backend/     # ASP.NET Core Web API (feature-based modular monolith, 11 project) — mở bằng Rider
├── frontend/    # Next.js — mở bằng VS Code
├── ai/          # Reserved — AI hiện đang là module bên trong backend, xem ai/README.md
├── docs/        # Business Rules, Design v2 (ERD, API, RBAC...)
└── docker-compose.yml
```

## Chạy thử nhanh

Xem [`docs/RUNBOOK.md`](docs/RUNBOOK.md) — có tài khoản demo cho cả 5 vai trò và đường đi cụ thể
để xem từng Flow 1–5 trên giao diện.

Quyết định đã duyệt ngày 22/09/2026: [biên bản](docs/implementation-decisions.md).
Business Rules hiện hành: [Word v1.4](docs/SportManagement_BusinessRules.docx) — bản Markdown mirror trước đây (`docs/business-rules-v1.4.md`) đã gộp xong nội dung vào file Word này và bị xoá ngày 22/09/2026 để khỏi trùng lặp.
Kế hoạch tiếp tục: [Claude 23/09/2026](docs/claude-continuation-plan-2026-09-23.md).

Plan có prompt giao việc ở mục 10; ưu tiên sửa đối soát thu/hoàn và tách approve/complete, sau đó hạn gói/lịch, contract API, PDF và tích hợp thật. Các chính sách đã duyệt không cần duyệt lại; chi tiết còn mở theo SSOT §7.

Đây là đặc tả đích; chưa xác nhận code đáp ứng v1.4. Matrix/status sẽ được Claude tạo từ kiểm chứng mới theo plan; không dùng kết quả tests cũ để kết luận các rule mới đã đạt.

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
├── SportHub.Identity/             # Role, UserAccount, UserCredential, UserProfile, UserExternalLogin
├── SportHub.Membership/           # MembershipPackage, MemberPackage, MemberTrainingProfile
├── SportHub.Scheduling/           # Room, Class, ClassRecurrence, ClassSession, Enrollment, Attendance
├── SportHub.Training/             # CoachMemberRelationship, WorkoutPlan, WorkoutPlanItem, WorkoutResult
├── SportHub.Payment/              # Invoice, InvoiceItem, Payment, PaymentAdjustment
├── SportHub.Notification/         # Notification
├── SportHub.AI/                   # AiLog, gợi ý tập luyện (BR-26/27)
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

Target framework: **net10.0** (cả 11 project). Entity/enum/state cho từng module: xem
`docs/00-Source-of-Truth.md` §2–4 trước khi code.

## Chạy local

Ở môi trường `Development`, backend tự áp migration và seed dữ liệu demo khi khởi động —
nhưng **chỉ khi database chưa có tài khoản nào**, nên không bao giờ ghi đè dữ liệu đang có.
Tài khoản demo và kịch bản thao tác: [`docs/RUNBOOK.md`](docs/RUNBOOK.md).

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

Xem chi tiết: [`docs/Center-Management-System-Design-v2.md`](docs/Center-Management-System-Design-v2.md)
