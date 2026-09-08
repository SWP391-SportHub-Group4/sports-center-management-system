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
