# Plan: Refactor backend → Feature-based Modular Monolith — SportHub

> **v4.3 — sửa 3 điểm review trên v4.2.** v4.2 đã sửa xong thứ tự baseline SQL, làm rõ phạm vi "thuần structural" cho phép type hạ tầng, checklist Application/Api, Pre-flight Git, và `docker compose build backend`. Bản này vá nốt: (1) chưa quy định rõ working directory — mục 11 giả định đang ở `backend/` trong khi Pre-flight/migration/docker compose giả định đang ở repo root, dễ khiến AI chạy đúng lệnh nhưng sai thư mục; (2) thiếu bước tạo thư mục `artifacts/refactor` trước khi `dotnet ef migrations script --output` vào đó; (3) mục 9 (di chuyển `SportHubDbContext`) chưa yêu cầu rõ giữ nguyên toàn bộ public surface (constructor, `DbSet`, `HasPostgresExtension`, naming convention, seed role, raw SQL filter) và chưa yêu cầu `rg` tìm caller trước khi đổi signature `JwtService`/tách `JwtExtensions`.

## 0. Baseline — đã đọc lại repo thật trước khi viết bản này

Repo hiện **không còn ở trạng thái ban đầu** — plan v2 (tách namespace Entity/Enum, chưa tách project) đã được thực thi thật, xác nhận bằng cách đọc trực tiếp:

- `SportHub.Repository/Enums/{Identity,Membership,Scheduling,Training,Payment}/` và `Entities/{...}` đã chia đúng theo module, namespace đã đổi, `Enums.` prefix trong `SportHubDbContext.cs` đã bị xoá.
- `SportHub.Repository/GlobalUsings.cs` đã tồn tại.
- Migration cũ đã bị xoá, có 1 migration mới `20260912083202_InitialCreate.cs` trong **source code**.
- `SportHub.API/Dockerfile` vẫn `COPY` `SportHub.Service.csproj`/`SportHub.Repository.csproj` — chưa đổi.

**Lưu ý quan trọng:** migration `InitialCreate` **có trong source** không đồng nghĩa **database thật đã được apply** đúng migration đó. Xác minh trạng thái DB thật bằng 1 trong 2 cách (chi tiết lệnh ở Pre-flight ngay dưới đây), không suy đoán từ việc thấy file migration trong `Migrations/`.

### Pre-flight bắt buộc — chạy trước khi đụng vào bất kỳ file/project nào (mới ở v4.2)

**Quy định working directory (mới ở v4.3, tránh nhầm folder):** toàn bộ lệnh Pre-flight (a, b dưới đây), migration (mục 14) và `docker compose` chạy từ **repo root** — các đường dẫn `--project backend/SportHub.API` v.v. đều viết theo giả định này. Riêng khối lệnh `dotnet new classlib`/`dotnet sln`/`dotnet add reference` ở mục 11 chạy **trong `backend/`** (xem `Push-Location`/`Pop-Location` bọc quanh khối đó ở mục 11) — không trộn hai giả định working directory này với nhau.

**a. Git safety** — worktree hiện có phần thay đổi dở từ v2 (xem trên), AI không được tự ý dọn nó:
```powershell
git status --short
git diff --check
```
Nếu có thay đổi chưa commit (kể cả phần dở của v2), commit hoặc tạo snapshot/tag riêng cho trạng thái đó **trước khi** chạy bất kỳ lệnh nào ở plan này. AI không được `git reset`, `git checkout -- .`, hay ghi đè/xoá bất kỳ thay đổi nào nằm ngoài phạm vi plan này.

**b. Xác nhận DB thật + lưu SQL baseline "before"** — **bắt buộc chạy ở bước này**, không được hoãn tới lúc xoá migration cũ (mục 12/14): tại thời điểm đó `SportHub.API` đã bị gỡ `ProjectReference` sang `SportHub.Repository` (mục 12 bước 13), nên `dotnet ef` sẽ không build được assembly chứa `DbContext` cũ nữa và lệnh sẽ fail. Baseline "before" chỉ lấy được **trong khi** `SportHub.Repository` còn nguyên và còn được `SportHub.API` reference:
```powershell
docker compose up -d postgres

dotnet ef migrations list `
  --project backend/SportHub.Repository --startup-project backend/SportHub.API
# hoặc query trực tiếp
docker exec -it <container-postgres> psql -U <user> -d <db> -c "SELECT * FROM \"__EFMigrationsHistory\";"

New-Item -ItemType Directory -Force "artifacts/refactor" | Out-Null

dotnet ef migrations script `
  --project backend/SportHub.Repository --startup-project backend/SportHub.API `
  --output artifacts/refactor/baseline-before-refactor.sql
```
Chỉ kết luận "DB đã ở trạng thái InitialCreate" nếu lệnh `migrations list`/query xác nhận. File `baseline-before-refactor.sql` dùng để so sánh với `baseline-after-refactor.sql` ở mục 14 sau khi refactor xong.

## 1. Quyết định đã chốt

| Câu hỏi | Quyết định |
|---|---|
| Mỗi module bao nhiêu project? | **1 project/module**, 4 folder `Domain/ Application/ Infrastructure/ Api/` bên trong. |
| Application dùng CQRS+MediatR hay Service? | **Giữ pattern Service.** `Commands/`/`Queries/` chỉ phân loại Request/DTO, không có Handler/MediatR. |
| DbContext chung hay riêng từng module? | **1 `SportHubDbContext` dùng chung**, đặt ở `SportHub.API` (composition root). |
| Phạm vi đợt refactor này | **Thuần structural.** Không thêm business rule, domain behavior, Application use case, Controller hay API endpoint mới nào. **Được phép** tạo type hạ tầng/cấu trúc cần thiết để tách project mà vẫn giữ nguyên behavior hiện có — vd `ISportHubDbContext`, `<Module>ModuleMarker`, `IEntityTypeConfiguration<T>`, `JwtBearerExtensions`, `AuthorizationPolicyExtensions` (mục 6, 8, 9) — đây không phải "type/behavior mới" theo nghĩa nghiệp vụ, chỉ là hạ tầng bọc quanh code đã có. Không viết Application/Api thật (use case/endpoint) cho module nào, kể cả Identity — ngoại lệ duy nhất là move nguyên văn `IAiRecommendationService` (mục 7). Xem mục 8 — `DomainException`/`ExceptionHandlingMiddleware` (chưa tồn tại trong repo, và là behavior mới thật sự — xử lý exception nghiệp vụ) bị đưa ra khỏi phạm vi đợt này, dời sang task Auth. |

## 2. Danh sách project

| Project | Vai trò |
|---|---|
| `SportHub.API` | Composition root: `Program.cs`, `appsettings*.json`, `Controllers/HealthController.cs`, `Persistence/SportHubDbContext.cs` + `Migrations/`, `Extensions/{CorsExtensions,SwaggerExtensions,AuthorizationPolicyExtensions}.cs` |
| `SportHub.BuildingBlocks` | Chỉ những gì **không phụ thuộc bất kỳ module nghiệp vụ nào**: `Abstractions/Persistence/ISportHubDbContext.cs`, `Infrastructure/Authentication/{JwtOptions,JwtService,JwtBearerExtensions}.cs` |
| `SportHub.Identity` | Role, UserAccount, UserCredential, UserProfile, UserExternalLogin — Application/Api để trống đợt này |
| `SportHub.Membership` | MembershipPackage, MemberPackage, MemberTrainingProfile |
| `SportHub.Scheduling` | Room, Class, ClassRecurrence, ClassSession, Enrollment, Attendance |
| `SportHub.Training` | CoachMemberRelationship, WorkoutPlan, WorkoutPlanItem, WorkoutResult |
| `SportHub.Payment` | Invoice, InvoiceItem, Payment, PaymentAdjustment |
| `SportHub.Notification` | Notification + 3 enum |
| `SportHub.AI` | AiLog, `IAiRecommendationService` (file có thật, xem mục 7) |
| `SportHub.Audit` | AuditLog — module riêng, lý do xem v4 gốc mục 5 (giữ nguyên, không đổi) |

`Reporting`/`Messaging`: **không có trong đợt này** — chưa có trong SSOT, chưa có use case thật.

`SportHub.Service` và `SportHub.Repository` bị xoá khỏi solution — chỉ xoá vật lý sau khi build/migrate/Docker-build pass (mục 13).

## 3. Sơ đồ dependency (đã sửa — v4 giải thích đúng nhưng code block quên áp fix)

```
SportHub.API   → BuildingBlocks + tất cả module

Identity       → BuildingBlocks
Scheduling     → Identity, Membership, BuildingBlocks     ← đã thêm Membership (Enrollment.MemberPackage là FK thật)
Membership     → Identity, BuildingBlocks
Training       → Identity, Scheduling, BuildingBlocks
Payment        → Identity, Membership, BuildingBlocks
AI             → Identity, BuildingBlocks
Notification   → Identity, BuildingBlocks
Audit          → Identity, BuildingBlocks

BuildingBlocks → (không phụ thuộc module nào)
```

## 4. ⚠️ Vòng lặp tham chiếu phải phá trước khi tách project (giữ nguyên từ v4, chưa đổi)

| Navigation 2 chiều | Bên giữ FK thật (giữ nguyên) | Bên phải xoá |
|---|---|---|
| `MemberPackage.Enrollments` ↔ `Enrollment.MemberPackage` | `Enrollment.MemberPackageId` (Scheduling → Membership) | Xoá `MemberPackage.Enrollments` (Membership) |
| `Class.CoachMemberRelationships` ↔ `CoachMemberRelationship.Class` | `CoachMemberRelationship.ClassId` (Training → Scheduling) | Xoá `Class.CoachMemberRelationships` (Scheduling) |
| `Enrollment.WorkoutResults` ↔ `WorkoutResult.Enrollment` | `WorkoutResult.EnrollmentId` (Training → Scheduling) | Xoá `Enrollment.WorkoutResults` (Scheduling) |

Fluent API tương ứng đổi `WithMany(x => x.Collection)` → `WithMany()`. Không đổi schema — chỉ mất tiện lợi gọi navigation 2 chiều, FK/cột DB giữ nguyên.

## 5. `AuditLog` → module riêng `SportHub.Audit` (giữ nguyên từ v4)

`AuditLog.User` là navigation sang `UserAccount` (Identity); nếu đặt trong `BuildingBlocks`, `BuildingBlocks` phải reference `Identity` → vỡ nguyên tắc. Giải pháp: tạo `SportHub.Audit`, phụ thuộc `Identity`, giữ nguyên 100% entity + FK constraint thật.

## 6. `ISportHubDbContext` — bắt buộc, tránh vòng lặp `API ↔ Identity`

```csharp
// SportHub.BuildingBlocks/Abstractions/Persistence/ISportHubDbContext.cs
namespace SportHub.BuildingBlocks.Abstractions.Persistence;

public interface ISportHubDbContext
{
    DbSet<TEntity> Set<TEntity>() where TEntity : class;
    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
```

```csharp
// SportHub.API/Persistence/SportHubDbContext.cs
public class SportHubDbContext : DbContext, ISportHubDbContext { ... }
```

```csharp
// Program.cs
builder.Services.AddDbContext<SportHubDbContext>(...);
builder.Services.AddScoped<ISportHubDbContext>(sp => sp.GetRequiredService<SportHubDbContext>());
```

Interface này tạo ra ngay trong đợt structural (dù chưa có Repository nào dùng tới) vì nó gắn liền với chính việc dời `SportHubDbContext` sang `SportHub.API` (nội dung mục này) — khác với `DomainException`/Middleware ở mục 8, vốn không có bất kỳ đoạn code nào trong repo hiện tại cần đến chúng.

## 7. Cấu trúc 1 module — áp dụng giống nhau cho mọi module, kể cả Identity

```
SportHub.<Module>/
  SportHub.<Module>.csproj          (PackageReference Microsoft.EntityFrameworkCore — mục 10)
  <Module>ModuleMarker.cs
  Domain/
    Entities/     <di chuyển nguyên trạng, đổi namespace SportHub.<Module>.Domain.Entities>
    Enums/        <di chuyển nguyên trạng, đổi namespace SportHub.<Module>.Domain.Enums>
    Exceptions/   (trống — .gitkeep)
    ValueObjects/ (trống — .gitkeep)
  Application/
    Commands/ Queries/ DTOs/ Interfaces/   (trống — .gitkeep, kể cả Identity)
  Infrastructure/
    Persistence/Configurations/   <1 file IEntityTypeConfiguration<T> / entity, lấy y hệt Fluent API hiện có>
    Repositories/                 (trống — .gitkeep, kể cả Identity)
  Api/                            (trống — .gitkeep, kể cả Identity)
```

**Ngoại lệ duy nhất — `SportHub.AI`:** file `SportHub.Service/Modules/AI/IAiRecommendationService.cs` **đã có code thật** (không phải rỗng như các module khác), namespace hiện tại (`SportHub.Service.Modules.AI`) vốn đã đúng chuẩn module ngay từ đầu. Đây **không phải thêm code mới** — chỉ move nguyên văn sang `SportHub.AI/Application/Interfaces/IAiRecommendationService.cs`, đổi `namespace` thành `SportHub.AI.Application.Interfaces`, nội dung interface + record `WorkoutSuggestion` giữ nguyên 100%.

Bảng entity/enum theo module (không đổi so với SSOT):

| Module | Entities | Enums |
|---|---|---|
| Identity | `Role`, `UserAccount`, `UserCredential`, `UserProfile`, `UserExternalLogin` | `UserRole`, `UserStatus`, `ExternalAuthProvider` |
| Membership | `MembershipPackage`, `MemberPackage`, `MemberTrainingProfile` | `MemberPackageStatus`, `ExperienceLevel` |
| Scheduling | `Room`, `Class`, `ClassRecurrence`, `ClassSession`, `Enrollment`, `Attendance` | `ClassStatus`, `ClassSessionStatus`, `EnrollmentStatus`, `AttendanceStatus` |
| Training | `CoachMemberRelationship`, `WorkoutPlan`, `WorkoutPlanItem`, `WorkoutResult` | `RelationshipSourceType`, `RelationshipStatus` |
| Payment | `Invoice`, `InvoiceItem`, `Payment`, `PaymentAdjustment` | `InvoiceStatus`, `InvoiceItemRelatedEntityType`, `PaymentMethod`, `PaymentStatus`, `PaymentAdjustmentType`, `PaymentAdjustmentStatus` |
| AI | `AiLog` (+ `IAiRecommendationService`, xem trên) | *(không có)* |
| Notification | `Notification` | `NotificationChannel`, `NotificationSourceEventType`, `NotificationStatus` |
| Audit | `AuditLog` | *(không có)* |

## 8. `SportHub.BuildingBlocks` — đã bỏ `DomainException` khỏi phạm vi đợt này

```
SportHub.BuildingBlocks/
  Abstractions/
    Persistence/
      ISportHubDbContext.cs
  Infrastructure/
    Authentication/
      JwtOptions.cs           // POCO, không đổi
      JwtService.cs           // đổi signature: string role thay vì UserRole
      JwtBearerExtensions.cs  // chỉ phần JWT bearer wiring chung, KHÔNG có policy theo role
```

**Vì sao bỏ `DomainException`/`ExceptionHandlingMiddleware` khỏi v4.1:** cả 2 chưa tồn tại trong repo — không có exception class nào, `Middleware/` hiện chỉ `.gitkeep`. Tạo chúng bây giờ là **thêm type/behavior mới**, không phải "move code có sẵn", mâu thuẫn với chính nguyên tắc "thuần structural" ở mục 1. Cả 2 sẽ được tạo cùng lúc với `auth-register-login-plan.md` (khi đó mới có exception thật để kế thừa, có Controller thật để middleware bọc quanh) — đã cập nhật ghi chú này vào `auth-register-login-plan.md`.

**Package `SportHub.BuildingBlocks.csproj` cần thêm** (thiếu ở v4, sẽ build fail nếu bỏ qua — `ISportHubDbContext` dùng `DbSet<TEntity>`, JWT code dùng bearer/token types):
```xml
<ItemGroup>
  <FrameworkReference Include="Microsoft.AspNetCore.App" />
</ItemGroup>
<ItemGroup>
  <PackageReference Include="Microsoft.EntityFrameworkCore" Version="10.0.11" />
  <PackageReference Include="Microsoft.AspNetCore.Authentication.JwtBearer" Version="10.0.11" />
  <PackageReference Include="Microsoft.IdentityModel.Tokens" Version="8.19.2" />
  <PackageReference Include="System.IdentityModel.Tokens.Jwt" Version="8.19.2" />
</ItemGroup>
```
(`FrameworkReference` thêm vào vì `JwtBearerExtensions.AddSportHubJwtBearer` gọi `services.AddAuthentication(...)` — type này nằm trong shared framework, không tự có ở project kiểu class library nếu không khai báo.)

## 9. `SportHub.API` sau khi nhận lại các phần cross-cutting

```
SportHub.API/
  Program.cs
  appsettings*.json
  Controllers/
    HealthController.cs
  Persistence/
    SportHubDbContext.cs      // implement ISportHubDbContext, dùng ApplyConfigurationsFromAssembly
  Migrations/
  Extensions/
    CorsExtensions.cs
    SwaggerExtensions.cs
    AuthorizationPolicyExtensions.cs
```

`Middleware/` **không đổi** ở đợt này — vẫn giữ `.gitkeep` như hiện tại, `ExceptionHandlingMiddleware.cs` sẽ thêm vào đây khi làm task Auth (mục 8).

`SportHubDbContext.OnModelCreating`:
```csharp
protected override void OnModelCreating(ModelBuilder modelBuilder)
{
    base.OnModelCreating(modelBuilder);
    modelBuilder.HasPostgresExtension("citext");

    modelBuilder.ApplyConfigurationsFromAssembly(typeof(IdentityModuleMarker).Assembly);
    modelBuilder.ApplyConfigurationsFromAssembly(typeof(MembershipModuleMarker).Assembly);
    modelBuilder.ApplyConfigurationsFromAssembly(typeof(SchedulingModuleMarker).Assembly);
    modelBuilder.ApplyConfigurationsFromAssembly(typeof(TrainingModuleMarker).Assembly);
    modelBuilder.ApplyConfigurationsFromAssembly(typeof(PaymentModuleMarker).Assembly);
    modelBuilder.ApplyConfigurationsFromAssembly(typeof(AiModuleMarker).Assembly);
    modelBuilder.ApplyConfigurationsFromAssembly(typeof(NotificationModuleMarker).Assembly);
    modelBuilder.ApplyConfigurationsFromAssembly(typeof(AuditModuleMarker).Assembly);
}
```

`AddApplicationPart` chưa cần ở đợt này — chưa module nào có Controller thật.

**Yêu cầu bắt buộc khi di chuyển `SportHubDbContext` (mới ở v4.3, tránh bỏ sót khi tách configuration):** giữ nguyên 100% public surface hiện có — constructor (`DbContextOptions<SportHubDbContext>` và mọi overload đang có), toàn bộ `DbSet<T>` hiện khai báo, `HasPostgresExtension("citext")`, naming convention (`UseSnakeCaseNamingConvention()` hay tương đương ở `Program.cs`), seed 5 role trong `HasData()`, và mọi raw SQL trong check constraint/`HasFilter(...)`. Chỉ được thay các lời gọi `ConfigureXxx()` bằng `ApplyConfigurationsFromAssembly(...)` — không đổi, không bớt bất kỳ phần nào khác trong `OnModelCreating` hay constructor. Đối chiếu lại với `SportHubDbContext.cs` gốc (559 dòng) sau khi tách để đảm bảo không thiếu `DbSet` hay seed nào.

**Trước khi đổi `JwtService.GenerateAccessToken`/tách `JwtExtensions` (mục 8):** chạy `rg "GenerateAccessToken|AddSportHubJwtAuthentication"` trên toàn repo để liệt kê đủ caller, rồi giữ nguyên behavior/policy hiện tại ở từng nơi gọi — chỉ đổi kiểu tham số `role` (`UserRole` → `string`, gọi `.ToString()` ở call site), không đổi logic sinh token hay tên claim.

## 10. Package & Dockerfile phải sửa

- `SportHub.API.csproj` thêm: `Microsoft.EntityFrameworkCore`, `Npgsql.EntityFrameworkCore.PostgreSQL`, `EFCore.NamingConventions`, `Microsoft.EntityFrameworkCore.Design` (đang ở `SportHub.Repository.csproj`, project này sắp bị xoá).
- `SportHub.BuildingBlocks.csproj`: xem mục 8.
- Mỗi module có `Infrastructure/Persistence/Configurations/*.cs` (cả 8 module) thêm `PackageReference Microsoft.EntityFrameworkCore` (chỉ gói này, không cần Npgsql/Design).
- `SportHub.API/Dockerfile` — sửa từ:
  ```dockerfile
  COPY ["SportHub.API/SportHub.API.csproj", "SportHub.API/"]
  COPY ["SportHub.Service/SportHub.Service.csproj", "SportHub.Service/"]
  COPY ["SportHub.Repository/SportHub.Repository.csproj", "SportHub.Repository/"]
  ```
  thành:
  ```dockerfile
  COPY ["SportHub.API/SportHub.API.csproj", "SportHub.API/"]
  COPY ["SportHub.BuildingBlocks/SportHub.BuildingBlocks.csproj", "SportHub.BuildingBlocks/"]
  COPY ["SportHub.Identity/SportHub.Identity.csproj", "SportHub.Identity/"]
  COPY ["SportHub.Membership/SportHub.Membership.csproj", "SportHub.Membership/"]
  COPY ["SportHub.Scheduling/SportHub.Scheduling.csproj", "SportHub.Scheduling/"]
  COPY ["SportHub.Training/SportHub.Training.csproj", "SportHub.Training/"]
  COPY ["SportHub.Payment/SportHub.Payment.csproj", "SportHub.Payment/"]
  COPY ["SportHub.Notification/SportHub.Notification.csproj", "SportHub.Notification/"]
  COPY ["SportHub.AI/SportHub.AI.csproj", "SportHub.AI/"]
  COPY ["SportHub.Audit/SportHub.Audit.csproj", "SportHub.Audit/"]
  ```
  Phần `dotnet restore/build/publish` và base image không đổi.

## 11. Namespace & lệnh tạo project (PowerShell thuần — môi trường bạn là Windows/PowerShell, không trộn Bash nữa)

```csharp
namespace SportHub.<Module>.Domain.Entities;
namespace SportHub.<Module>.Domain.Enums;
namespace SportHub.<Module>.Application.Commands / .Queries / .DTOs / .Interfaces;
namespace SportHub.<Module>.Infrastructure.Persistence.Configurations / .Repositories;
namespace SportHub.<Module>.Api;
```

```powershell
# Toàn bộ khối lệnh dưới đây chạy TRONG backend/ (khác với Pre-flight/migration/docker compose ở repo root — xem mục 0)
Push-Location backend

dotnet new classlib -n SportHub.BuildingBlocks -o SportHub.BuildingBlocks
dotnet new classlib -n SportHub.Identity        -o SportHub.Identity
dotnet new classlib -n SportHub.Membership      -o SportHub.Membership
dotnet new classlib -n SportHub.Scheduling      -o SportHub.Scheduling
dotnet new classlib -n SportHub.Training        -o SportHub.Training
dotnet new classlib -n SportHub.Payment         -o SportHub.Payment
dotnet new classlib -n SportHub.Notification    -o SportHub.Notification
dotnet new classlib -n SportHub.AI              -o SportHub.AI
dotnet new classlib -n SportHub.Audit           -o SportHub.Audit

foreach ($p in @("BuildingBlocks","Identity","Membership","Scheduling","Training","Payment","Notification","AI","Audit")) {
  dotnet sln SportHub.sln add "SportHub.$p/SportHub.$p.csproj"
}

# dotnet new classlib tạo sẵn Class1.cs mặc định trong mỗi project — xoá trước khi thêm ModuleMarker,
# không để lẫn file rác không có ý nghĩa gì trong module
foreach ($p in @("BuildingBlocks","Identity","Membership","Scheduling","Training","Payment","Notification","AI","Audit")) {
  Remove-Item -LiteralPath "SportHub.$p/Class1.cs" -Force -ErrorAction SilentlyContinue
}

dotnet add SportHub.Identity/SportHub.Identity.csproj reference `
  SportHub.BuildingBlocks/SportHub.BuildingBlocks.csproj

dotnet add SportHub.Scheduling/SportHub.Scheduling.csproj reference `
  SportHub.Identity/SportHub.Identity.csproj `
  SportHub.Membership/SportHub.Membership.csproj `
  SportHub.BuildingBlocks/SportHub.BuildingBlocks.csproj

dotnet add SportHub.Membership/SportHub.Membership.csproj reference `
  SportHub.Identity/SportHub.Identity.csproj `
  SportHub.BuildingBlocks/SportHub.BuildingBlocks.csproj

dotnet add SportHub.Training/SportHub.Training.csproj reference `
  SportHub.Identity/SportHub.Identity.csproj `
  SportHub.Scheduling/SportHub.Scheduling.csproj `
  SportHub.BuildingBlocks/SportHub.BuildingBlocks.csproj

dotnet add SportHub.Payment/SportHub.Payment.csproj reference `
  SportHub.Identity/SportHub.Identity.csproj `
  SportHub.Membership/SportHub.Membership.csproj `
  SportHub.BuildingBlocks/SportHub.BuildingBlocks.csproj

dotnet add SportHub.AI/SportHub.AI.csproj reference `
  SportHub.Identity/SportHub.Identity.csproj `
  SportHub.BuildingBlocks/SportHub.BuildingBlocks.csproj

dotnet add SportHub.Notification/SportHub.Notification.csproj reference `
  SportHub.Identity/SportHub.Identity.csproj `
  SportHub.BuildingBlocks/SportHub.BuildingBlocks.csproj

dotnet add SportHub.Audit/SportHub.Audit.csproj reference `
  SportHub.Identity/SportHub.Identity.csproj `
  SportHub.BuildingBlocks/SportHub.BuildingBlocks.csproj

dotnet add SportHub.API/SportHub.API.csproj reference `
  SportHub.BuildingBlocks/SportHub.BuildingBlocks.csproj `
  SportHub.Identity/SportHub.Identity.csproj `
  SportHub.Membership/SportHub.Membership.csproj `
  SportHub.Scheduling/SportHub.Scheduling.csproj `
  SportHub.Training/SportHub.Training.csproj `
  SportHub.Payment/SportHub.Payment.csproj `
  SportHub.Notification/SportHub.Notification.csproj `
  SportHub.AI/SportHub.AI.csproj `
  SportHub.Audit/SportHub.Audit.csproj

Pop-Location
```

## 12. Thứ tự thực hiện (thuần structural)

1. **Pre-flight bắt buộc** (mục 0): (a) `git status --short` + `git diff --check`, commit/snapshot riêng phần dở của v2 nếu có — không `reset`/`checkout -- .`; (b) xác nhận DB thật + chạy `dotnet ef migrations script --project backend/SportHub.Repository ...` lưu `artifacts/refactor/baseline-before-refactor.sql` **ngay bây giờ**, trong khi `SportHub.Repository` còn nguyên và còn được `SportHub.API` reference.
2. Cập nhật `docs/00-Source-of-Truth.md` §2/§7: ghi nhận `Notification` và `Audit` là module chính thức — làm **cùng lúc với commit đầu tiên** của refactor, không chờ tới cuối, vì toàn bộ các bước sau đều coi 2 module này là chính thức.
3. Tạo 9 project mới + wiring reference (mục 11); xoá `Class1.cs` mặc định (mục 11) trước khi thêm `<Module>ModuleMarker.cs`.
4. Xoá 3 navigation property gây vòng lặp (mục 4) ở vị trí hiện tại, build lại `SportHub.Repository` cũ để chắc chưa lỗi trước khi dời tiếp.
5. Di chuyển Entity + Enum vào đúng module project (mục 7).
6. **Move nguyên văn `IAiRecommendationService.cs`** từ `SportHub.Service/Modules/AI/` sang `SportHub.AI/Application/Interfaces/`, đổi namespace, nội dung giữ nguyên (mục 7).
7. Viết `IEntityTypeConfiguration<T>` cho từng entity ở đúng module (chuyển 1-1 từ `ConfigureXxx()` trong `SportHubDbContext.cs` hiện tại).
8. Chạy `rg "GenerateAccessToken|AddSportHubJwtAuthentication"` để liệt kê caller (mục 9), rồi dựng `SportHub.BuildingBlocks` (mục 8): `ISportHubDbContext`, `JwtOptions`/`JwtService` (đổi signature, giữ behavior)/`JwtBearerExtensions` (đã tách khỏi policy) — thêm package theo mục 8, KHÔNG tạo `DomainException`.
9. Dựng phần còn lại của `SportHub.API` (mục 9): `Persistence/SportHubDbContext.cs` (giữ nguyên constructor/`DbSet`/`HasPostgresExtension`/naming convention/seed role/raw SQL filter — chỉ thay `ConfigureXxx()` bằng `ApplyConfigurationsFromAssembly`), `Extensions/{CorsExtensions,SwaggerExtensions,AuthorizationPolicyExtensions}.cs`, `Migrations/` — KHÔNG tạo `ExceptionHandlingMiddleware`.
10. Sửa `Program.cs`: `AddDbContext<SportHubDbContext>` + `AddScoped<ISportHubDbContext>`, `AddSportHubJwtBearer` (BuildingBlocks) + policy đăng ký ở `AuthorizationPolicyExtensions` (API), CORS/Swagger như cũ. Không có dòng `UseMiddleware<ExceptionHandlingMiddleware>()` ở đợt này.
11. Xoá `SportHub.API/Modules/Identity/User/UserController.cs` (0 byte, sai chỗ).
12. Sửa `SportHub.API/Dockerfile` theo mục 10.
13. **Gỡ reference cũ trước khi build solution mới** (nếu không, `SportHub.API` vẫn còn `ProjectReference` sang `SportHub.Service` đã hết nội dung, dễ gây lỗi build khó hiểu). **Baseline "before" ở bước 1 phải đã lưu xong trước khi chạy bước này** — sau bước này `dotnet ef` không còn build được `SportHub.Repository` qua `SportHub.API` nữa:
    ```powershell
    dotnet remove backend/SportHub.API/SportHub.API.csproj reference `
      backend/SportHub.Service/SportHub.Service.csproj

    dotnet sln backend/SportHub.sln remove backend/SportHub.Service/SportHub.Service.csproj
    dotnet sln backend/SportHub.sln remove backend/SportHub.Repository/SportHub.Repository.csproj
    ```
    Chỉ gỡ khỏi **solution/reference** ở bước này — vẫn giữ 2 thư mục vật lý làm rollback cho tới khi qua được bước 16.
14. `dotnet build` toàn solution, sửa lỗi biên dịch phát sinh. Không viết thêm Application/Api để né lỗi build — lỗi thuộc business logic thì dừng lại báo cáo.
15. Drop DB + migration lại, lưu `artifacts/refactor/baseline-after-refactor.sql`, so với `baseline-before-refactor.sql` đã lưu ở bước 1 (mục 14).
16. Xác nhận `docker compose build backend` pass (không dùng `docker build` trần từ repo root — build context thật là `./backend`, chạy sai context rất dễ fail ở các dòng `COPY`).
17. Chỉ sau khi bước 14–16 đều pass → xoá vật lý `SportHub.Service/` và `SportHub.Repository/` (mục 13).
18. Auth (`auth-register-login-plan.md`, gồm cả `DomainException`/`ExceptionHandlingMiddleware`) là task riêng, bắt đầu sau khi plan này nghiệm thu 100%.

## 13. Quy tắc dọn dẹp — không xoá sớm

> Sau khi build, migration verification và Docker build đều pass, xoá vật lý hai thư mục `SportHub.Service` và `SportHub.Repository`. Không được xoá trước khi xác nhận toàn bộ file đã được di chuyển.

## 14. Migration & database (baseline "before" đã lưu ở Pre-flight — mục 0/mục 12 bước 1)

```powershell
# artifacts/refactor/baseline-before-refactor.sql đã lưu ở Pre-flight, KHÔNG lưu lại ở đây
# (lưu lại ở đây sẽ fail — SportHub.Repository đã bị gỡ khỏi solution/reference ở bước 13)

docker compose up -d postgres

dotnet ef database drop --force `
  --project backend/SportHub.API --startup-project backend/SportHub.API

Get-ChildItem -LiteralPath "backend/SportHub.API/Migrations" -Filter "*.cs" | Remove-Item -Force

dotnet ef migrations add InitialCreate `
  --project backend/SportHub.API --startup-project backend/SportHub.API

# Lưu SQL của migration MỚI, so với artifacts/refactor/baseline-before-refactor.sql
dotnet ef migrations script `
  --project backend/SportHub.API --startup-project backend/SportHub.API `
  --output artifacts/refactor/baseline-after-refactor.sql

dotnet ef database update `
  --project backend/SportHub.API --startup-project backend/SportHub.API
```

**So sánh `artifacts/refactor/baseline-before-refactor.sql` với `baseline-after-refactor.sql`** (diff hoặc đọc tay) — chỉ so cột/FK/index/constraint trong SQL, **không so `.Designer.cs`** vì file đó nhúng full CLR type name, chắc chắn đổi theo namespace mới dù schema không đổi gì — so `.Designer.cs` sẽ cho kết quả "khác nhau" giả, gây hoang mang không cần thiết.

## 15. Checklist nghiệm thu

- [ ] Solution có đúng 10 project: `API`, `BuildingBlocks`, `Identity`, `Membership`, `Scheduling`, `Training`, `Payment`, `Notification`, `AI`, `Audit`; không còn `Service`/`Repository`.
- [ ] `SportHub.Scheduling.csproj` có reference cả `Identity` **và** `Membership`.
- [ ] `dotnet build` pass — không vòng lặp project reference.
- [ ] Đã xoá đúng 3 navigation property (mục 4); SQL migration mới giống schema cũ (so `baseline-*.sql`, không so `.Designer.cs`).
- [ ] `BuildingBlocks` không có `ProjectReference` tới bất kỳ module nào; có đủ 4 package ở mục 8.
- [ ] `ISportHubDbContext` tồn tại ở `BuildingBlocks`, `SportHubDbContext` (API) implement nó, DI đăng ký đủ cả 2.
- [ ] `JwtService.GenerateAccessToken` nhận `string role`, không còn `UserRole`.
- [ ] `CorsExtensions`, `SwaggerExtensions`, `AuthorizationPolicyExtensions` nằm ở `SportHub.API`.
- [ ] **Không có `DomainException` hay `ExceptionHandlingMiddleware` nào được tạo ở đợt này** — 2 file này thuộc task Auth.
- [ ] `AuditLog` nằm trong `SportHub.Audit`, không nằm trong `BuildingBlocks`.
- [ ] `IAiRecommendationService.cs` đã move sang `SportHub.AI/Application/Interfaces/`, nội dung không đổi.
- [ ] `SportHubDbContext.OnModelCreating` dùng `ApplyConfigurationsFromAssembly` cho đủ 8 module.
- [ ] `Dockerfile` đã liệt kê đủ 10 project, không còn dòng `COPY` Service/Repository.
- [ ] Đã gỡ `ProjectReference` từ `SportHub.API` sang `SportHub.Service` **trước khi** build solution mới (mục 12 bước 13) — và `artifacts/refactor/baseline-before-refactor.sql` đã lưu **trước** bước gỡ này (mục 12 bước 1).
- [ ] Không có **code nghiệp vụ mới** (use case, endpoint, business rule) trong `Application/`/`Api/` của module nào, kể cả `Identity` — **ngoại lệ duy nhất**: `IAiRecommendationService` + `WorkoutSuggestion` được move nguyên văn vào `SportHub.AI/Application/Interfaces/`.
- [ ] `Class1.cs` mặc định do `dotnet new classlib` sinh ra đã bị xoá ở cả 9 project mới.
- [ ] Migration `InitialCreate` mới có đủ seed 5 role.
- [ ] `docker compose build backend` pass — không dùng `docker build` trần (sai build context).
- [ ] `SportHub.Service`/`SportHub.Repository` chỉ bị xoá vật lý sau khi mọi mục trên pass.
- [ ] `docs/00-Source-of-Truth.md` đã cập nhật `Notification` + `Audit` là module chính thức — làm ở đầu quá trình (mục 12 bước 2), không phải cuối.
- [ ] `git status --short` sạch (hoặc mọi thay đổi ngoài phạm vi plan này đã được commit/snapshot riêng) trước khi bắt đầu bước 3 của mục 12.
- [ ] `artifacts/refactor/` đã được tạo (`New-Item -ItemType Directory -Force`) trước lần `dotnet ef migrations script --output` đầu tiên.
- [ ] `SportHubDbContext` mới có đủ 100% `DbSet` như bản gốc (đối chiếu 559 dòng gốc), giữ nguyên constructor, `HasPostgresExtension("citext")`, naming convention, seed 5 role, raw SQL filter — chỉ đổi `ConfigureXxx()` → `ApplyConfigurationsFromAssembly`.
- [ ] Đã chạy `rg "GenerateAccessToken|AddSportHubJwtAuthentication"` và xác nhận mọi caller vẫn hoạt động đúng behavior sau khi đổi signature `JwtService`.
- [ ] Plan này và `auth-register-login-plan.md` đã lưu vật lý trong repo (`docs/claude-plans/`).

**Chưa code bất kỳ Controller/Service/API/Middleware/Exception nào cho tới khi checklist trên đạt 100% và được xác nhận lại.**
