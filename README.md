# Sports Center Management System (SWP391)

Monorepo cho hệ thống quản lý trung tâm thể hình — xem đầy đủ thiết kế trong `docs/`.

> ⚠️ **Trước khi code / trước khi hỏi AI sinh code:** đọc [`docs/00-Source-of-Truth.md`](docs/00-Source-of-Truth.md) trước.
> Đây là nguồn duy nhất chốt scope MVP, entity/enum/state, và quy ước ID/money/timezone — nếu file đó và
> doc khác (design v2, business rules...) mâu thuẫn nhau thì `00-Source-of-Truth.md` thắng.

## Cấu trúc

```
sports-center-management-system/
├── backend/     # ASP.NET Core Web API (modular monolith) — mở bằng Rider
├── frontend/    # Next.js — mở bằng VS Code
├── ai/          # Reserved — AI hiện đang là module bên trong backend, xem ai/README.md
├── docs/        # Business Rules, Design v2 (ERD, API, RBAC...)
└── docker-compose.yml
```

## Skeleton backend hiện tại (tạm — sẽ xoá khỏi README khi có code thật, xem lịch sử ở SSOT §8)

```
backend/
├── SportHub.API/                  # Web API — controllers, DI wiring
│   ├── Controllers/
│   │   └── HealthController.cs
│   ├── Extensions/                # IServiceCollection/WebApplication extension methods (giữ Program.cs gọn)
│   │   ├── CorsExtensions.cs      # policy "Default", đọc Cors:AllowedOrigins (đã dùng)
│   │   ├── SwaggerExtensions.cs   # AddSportHubSwagger / UseSportHubSwagger (đã dùng)
│   │   └── JwtExtensions.cs       # STUB — chưa implement, chờ Identity/RBAC
│   ├── Middleware/                # trống — .gitkeep, chưa có middleware custom nào
│   ├── Modules/                   # trống — .gitkeep, mỗi thư mục = 1 flow, chờ Controller theo module
│   │   ├── AI/  Identity/  Membership/  Payment/  Scheduling/  Training/
│   ├── Program.cs
│   └── appsettings*.json
├── SportHub.Service/               # Business logic theo module
│   └── Modules/
│       ├── AI/
│       │   └── IAiRecommendationService.cs   # code thật duy nhất trong Service hiện tại
│       └── Identity/ Membership/ Payment/ Scheduling/ Training/   # trống — .gitkeep
└── SportHub.Repository/            # EF Core: DbContext, Entities, Migrations
    ├── SportHubDbContext.cs
    ├── Entities/                   # trống — .gitkeep
    ├── Migrations/                 # trống — .gitkeep
    └── Modules/
        └── Identity/ Membership/ Payment/ Scheduling/ Training/      # trống — .gitkeep
```

Target framework: **net10.0** (cả 3 project). Modules trống chỉ có `.gitkeep` để giữ cấu trúc git — code Controller/Service/Entity theo từng module sẽ được thêm dần theo đúng thứ tự ở mục "Thứ tự code" bên dưới. Entity/enum/state cho từng module: xem `docs/00-Source-of-Truth.md` §2–4 trước khi code.

## Chạy local

```bash
docker compose up -d          # Postgres
cd backend/SportHub.API && dotnet run
cd frontend && npm install && npm run dev
```

## Thứ tự code (theo Design v2, mục 7)

1. Identity/RBAC
2. Membership
3. Lớp/Lịch/Booking
4. Payment/Invoice/Report
5. (Sprint sau) Training/Workout đầy đủ + AI + Notification queue thật

Xem chi tiết: [`docs/Center-Management-System-Design-v2.md`](docs/Center-Management-System-Design-v2.md)
