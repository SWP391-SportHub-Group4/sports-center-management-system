global using SportHub.Repository.Entities.Identity;
global using SportHub.Repository.Entities.Membership;
global using SportHub.Repository.Entities.Training;
global using SportHub.Repository.Entities.Scheduling;
global using SportHub.Repository.Entities.Payment;
global using SportHub.Repository.Entities.AI;

global using SportHub.Repository.Enums.Identity;
global using SportHub.Repository.Enums.Membership;
global using SportHub.Repository.Enums.Training;
global using SportHub.Repository.Enums.Scheduling;
global using SportHub.Repository.Enums.Payment;

// Ghi chú: KHÔNG global using cho Entities.Shared/Enums phẳng (Notification, AuditLog +
// 3 enum liên quan) — module "Shared" chưa được team chốt chính thức
// (docs/00-Source-of-Truth.md §7 Open Questions, checkbox chưa tick tại thời điểm refactor
// 12/09/2026). Các entity/enum này giữ nguyên namespace phẳng SportHub.Repository.Entities /
// SportHub.Repository.Enums, và những nơi cần dùng (vd SportHubDbContext, Notification.cs)
// vẫn khai using tường minh cho namespace phẳng đó.
