# Sports Center Management System (SWP391)

Monorepo cho hệ thống quản lý trung tâm thể thao đa bộ môn (Gym, Personal Training, Yoga, Group X) — xem đầy đủ thiết kế trong `docs/`.

> **Trước khi code :** đọc [`docs/00-Source-of-Truth.md`](docs/00-Source-of-Truth.md) trước.
> Đây là nguồn duy nhất chốt scope MVP, entity/enum/state, và quy ước ID/money/timezone — nếu file đó và
> doc khác (design v2, business rules...) mâu thuẫn nhau thì `00-Source-of-Truth.md` thắng.

## Cấu trúc

```
sports-center-management-system/
├── backend/     # ASP.NET Core Web API (feature-based modular monolith, 10 project) — mở bằng Rider
├── frontend/    # Next.js — mở bằng VS Code
├── ai/          # Reserved — AI hiện đang là module bên trong backend, xem ai/README.md
├── docs/        # Business Rules, Design v2 (ERD, API, RBAC...)
└── docker-compose.yml
```

## Chạy thử nhanh

Xem [`docs/RUNBOOK.md`](docs/RUNBOOK.md) — có tài khoản demo cho cả 5 vai trò và đường đi cụ thể
để xem từng Flow 1–5 trên giao diện.

Trạng thái triển khai từng business rule (BR-1 → BR-64):
[`docs/br-implementation-matrix.md`](docs/br-implementation-matrix.md).
Các quyết định phải tự đưa ra khi tài liệu chưa chốt — và những mục **cần PO duyệt** —
nằm ở [`docs/implementation-decisions.md`](docs/implementation-decisions.md).

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
├── Application/          # DTO + service: use case của module
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
| Backend — Swagger UI (http) | http://localhost:5100/swagger |
| Backend — Swagger UI (https) | https://localhost:7100/swagger |
| Frontend | http://localhost:3000 |

Xem chi tiết: [`docs/Center-Management-System-Design-v2.md`](docs/Center-Management-System-Design-v2.md)
