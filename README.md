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
docker compose up -d          # Postgres + Backend + Frontend
```

Chạy xong sẽ có 3 container: `sporthub-postgres`, `sporthub-backend`, `sporthub-frontend`. Kiểm tra bằng `docker ps` hoặc Docker Desktop.

Muốn chạy backend/frontend ngoài Docker (debug trực tiếp trong Rider/VS Code) thì tắt container tương ứng rồi chạy thủ công:

```bash
cd backend/SportHub.API && dotnet run
cd frontend && npm install && npm run dev
```

### Thông tin kết nối DB (local)

| Field | Giá trị |
|---|---|
| Host | `localhost` |
| Port | `5435` |
| Database | `sporthub` |
| Username | `sporthub` |
| Password | `Soicodoc123@` |

Connection string tương ứng (đã có sẵn trong `appsettings.json`):
```
Host=localhost;Port=5435;Database=sporthub;Username=sporthub;Password=Soicodoc123@
```

> Đây là password dev dùng chung cho môi trường local, không phải secret thật — đừng tái sử dụng cho môi trường khác.

Xem chi tiết: [`docs/Center-Management-System-Design-v2.md`](docs/Center-Management-System-Design-v2.md)
