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

## Backend — Feature-based Modular Monolith (10 project)

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
├── SportHub.AI/                   # AiLog, IAiRecommendationService (interface có sẵn, chưa có implementation)
└── SportHub.Audit/                # AuditLog — module riêng vì có FK thật sang UserAccount (Identity)
```

Mỗi module (trừ `API`/`BuildingBlocks`) dùng chung 1 cấu trúc nội bộ:

```
SportHub.<Module>/
├── <Module>ModuleMarker.cs
├── Domain/
│   ├── Entities/        # Entity thật, di chuyển nguyên trạng từ SportHub.Repository cũ
│   └── Enums/           # Enum thật
├── Application/          # trống — .gitkeep, chờ code Controller/Service theo module
│                         #   ngoại lệ: SportHub.AI/Application/Interfaces/IAiRecommendationService.cs (có sẵn)
└── Infrastructure/Persistence/Configurations/   # IEntityTypeConfiguration<T>, 1 file / entity
```

Dependency giữa các module (không có vòng lặp — sơ đồ đầy đủ + lý do từng mũi tên xem trong plan):

```
SportHub.API   → BuildingBlocks + tất cả module
Scheduling     → Identity, Membership, BuildingBlocks
Training       → Identity, Scheduling, BuildingBlocks
Payment        → Identity, Membership, BuildingBlocks
Membership / AI / Notification / Audit → Identity, BuildingBlocks
Identity       → BuildingBlocks
BuildingBlocks → (không phụ thuộc module nào)
```

Target framework: **net10.0** (cả 10 project). `Application/`/`Api/` của mọi module đang trống — chưa có Controller/Service/use case thật nào (đúng phạm vi "thuần structural" của đợt refactor này). Code nghiệp vụ đầu tiên sẽ bắt đầu từ Identity (Auth). Entity/enum/state cho từng module: xem `docs/00-Source-of-Truth.md` §2–4 trước khi code.

## Chạy local

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
