# AI Module — reserved

Theo `docs/Center-Management-System-Design-v2.md`, mục 6 (Kiến trúc — điều chỉnh cho đúng scope MVP):

> AI Module ở MVP là **module/adapter trong chính ASP.NET Core backend**
> (`backend/SportHub.Service/Modules/AI/IAiRecommendationService.cs`),
> KHÔNG phải microservice Python riêng.

Folder này được giữ chỗ tại root để khi thật sự cần tách (scale riêng, đổi
sang xử lý bằng Python/ML, hoặc có người phụ trách AI làm việc độc lập),
chỉ cần:

1. Dựng service Python (FastAPI) trong đây.
2. Đổi implementation của `IAiRecommendationService` trong backend để gọi
   qua HTTP tới service này thay vì xử lý in-process.
3. Phần còn lại của hệ thống (Controller, Frontend) không cần đổi.

Chưa cần tạo code gì ở đây cho tới khi bước "Training/AI" (Design v2, mục 7,
bước 5) bắt đầu.
