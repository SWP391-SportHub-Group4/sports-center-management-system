# Plan: Auth (Register + Login email/password) — SportHub

> **⏸ Đang tạm dừng — chưa code.** `monolith-refactor-plan.md` (v4) yêu cầu hoàn tất + nghiệm thu 100% checklist structural refactor (10 project, hết vòng lặp dependency, build + migrate + Docker build pass) **trước khi** bắt đầu bất kỳ dòng code Auth nào. Đừng tạo `AuthController`/`AuthService`/`IUserAccountRepository` cho tới khi plan kia được xác nhận xong.
>
> **Cập nhật 12/09/2026 (2):** đổi mục 1 (đường dẫn file) + mục 2 cho khớp v4 của `monolith-refactor-plan.md`: `JwtService.GenerateAccessToken` nay nhận `string role` (không phải `UserRole`); `ExceptionHandlingMiddleware` nằm ở `SportHub.API/Middleware/` (không phải BuildingBlocks); `AddApplicationPart` dùng `IdentityModuleMarker`. Toàn bộ quyết định nghiệp vụ ở mục 0, 3, 4, 5 **giữ nguyên không đổi**.

## 0. Các quyết định đã chốt

| Vấn đề | Quyết định |
|---|---|
| Hash password | `BCrypt.Net-Next` |
| JSON naming | camelCase toàn bộ qua `JsonNamingPolicy.CamelCase` trong `Program.cs` — property C# vẫn PascalCase |
| Tài khoản Banned/Deactivated login | Chặn, 403, message cụ thể theo từng trạng thái |
| Tài khoản Google-only cố login bằng password | Chặn, báo lỗi **rõ ràng, cụ thể** — `409 Conflict` (xem giải thích mục 4) |
| Độ dài password tối thiểu | 8 ký tự, không bắt buộc ký tự đặc biệt (MVP scope) |
| Register thành công | Trả `accessToken` + thông tin user đầy đủ ngay (auto-login, không bắt FE gọi thêm Login) |
| Login thành công trả về | `accessToken` + thông tin cơ bản user (userId, email, fullName, role) |
| Refresh token | Không làm — chỉ access token 60' như `JwtOptions` hiện tại |
| Migration | Đã update DB thủ công xong |
| Xử lý exception → HTTP status | Tập trung qua 1 middleware chung (mục 2), không rải `try/catch` trong từng Controller |

## 1. Kiến trúc file — theo cấu trúc module mới (`SportHub.Identity` là 1 project riêng)

Toàn bộ code Auth nằm trong project `SportHub.Identity` (xem `monolith-refactor-plan.md` mục 4), chia theo 4 layer Domain/Application/Infrastructure/Api thay vì 3 project cũ (Repository/Service/API). Vẫn giữ tinh thần feature-based bên trong `Application/` (Register/Login), phần dùng chung để riêng ở `DTOs/`:

```
SportHub.Identity/
  Domain/
    Exceptions/
      EmailAlreadyExistsException.cs
      PhoneAlreadyExistsException.cs
      InvalidCredentialsException.cs
      AccountBlockedException.cs
      ExternalOnlyCredentialException.cs   // account Google-only cố login password
      // mỗi exception kế thừa SportHub.BuildingBlocks.SharedKernel.Exceptions.DomainException
      // (constructor set sẵn Message + override StatusCode) — xem ghi chú cuối mục này

  Application/
    Commands/
      RegisterRequest.cs
      LoginRequest.cs
    DTOs/
      AuthResponse.cs          // { AccessToken, UserSummaryDto User } — dùng chung cho cả Register & Login
      UserSummaryDto.cs
    Interfaces/
      IAuthService.cs
      IUserAccountRepository.cs
    AuthService.cs

  Infrastructure/
    Repositories/
      UserAccountRepository.cs
    Security/
      PasswordHasher.cs        // static class, cùng style với JwtService.cs (nay ở SportHub.BuildingBlocks/Infrastructure/Authentication)

  Api/
    AuthController.cs
```

Register/Login trả cùng 1 shape (`AuthResponse`) nên không cần 2 DTO response trùng nhau — mỗi feature chỉ giữ `Request` riêng trong `Commands/`, `Response` dùng chung ở `DTOs/`.

Package cần thêm: `BCrypt.Net-Next` vào `SportHub.Identity.csproj` (`dotnet add SportHub.Identity package BCrypt.Net-Next`).

**Middleware xử lý exception** không còn nằm trong `SportHub.Identity` — nó là hạ tầng dùng chung mọi module, đặt ở `SportHub.BuildingBlocks/Infrastructure/Middleware/ExceptionHandlingMiddleware.cs` (xem `monolith-refactor-plan.md` mục 8). Vì middleware này không được phép reference `SportHub.Identity` (tránh vòng lặp — mọi module → BuildingBlocks, không ngược lại), cách map exception → HTTP status đổi nhẹ so với thiết kế "switch-case theo từng loại exception" ban đầu:

- Mỗi exception trong `Domain/Exceptions/` (của bất kỳ module nào, không riêng Identity) kế thừa `DomainException` (định nghĩa 1 lần trong `BuildingBlocks/SharedKernel/Exceptions/`), tự mang theo `StatusCode` + `Message` của chính nó qua constructor.
- `ExceptionHandlingMiddleware` chỉ cần bắt `catch (DomainException ex)` và trả `{ error, message = ex.Message }` với `ex.StatusCode`, không cần biết cụ thể là `EmailAlreadyExistsException` hay `AccountBlockedException` — nhờ vậy dùng chung được cho Membership/Payment/... sau này mà không phải sửa lại `BuildingBlocks` mỗi khi module mới thêm exception riêng.
- Bảng mã lỗi ở mục 5 **không đổi** — chỉ đổi *cách* mỗi exception khai báo `StatusCode` của mình (constructor), không đổi giá trị status code hay message nào.

## 2. Program.cs — các việc cần thêm

```csharp
builder.Services.AddControllers()
    .AddApplicationPart(typeof(SportHub.Identity.IdentityModuleMarker).Assembly)   // marker, không reference thẳng AuthController — xem monolith-refactor-plan.md mục 9
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
    });

builder.Services.AddScoped<IUserAccountRepository, UserAccountRepository>();
builder.Services.AddScoped<IAuthService, AuthService>();

// đăng ký sớm trong pipeline để bắt được exception của mọi middleware/controller phía sau
app.UseMiddleware<ExceptionHandlingMiddleware>();  // SportHub.API/Middleware — không phải BuildingBlocks (v4 mục 8)
```

`ExceptionHandlingMiddleware` giờ chỉ cần 1 `try/catch` bao toàn bộ `_next(context)`, bắt `DomainException` → đọc `StatusCode`/`Message` của chính exception đó dựng JSON (`{ error, message }`) — viết 1 lần dùng chung cho toàn bộ project, đặt trong `SportHub.API/Middleware/` (nó chỉ cần biết `DomainException` ở `BuildingBlocks`, không cần reference module nào), không phải sửa lại khi Membership/Payment/... thêm exception riêng, chỉ cần exception đó kế thừa `DomainException`.

**Gotcha quan trọng:** `JwtExtensions.cs` (nay ở `SportHub.BuildingBlocks/Infrastructure/Authentication/`) đã set `SetFallbackPolicy(RequireAuthenticatedUser)` — mọi controller mặc định yêu cầu JWT. `AuthController` bắt buộc phải có `[AllowAnonymous]`, không thì Register/Login luôn trả 401 dù code đúng.

## 3. Register — `POST /api/auth/register`

Request:
```json
{ "email": "a@b.com", "password": "Abc12345", "fullName": "Nguyen Van A", "phone": "0901234567" }
```
(`phone` optional/nullable, `password` tối thiểu 8 ký tự — `[MinLength(8)]`)

Luồng xử lý (`AuthService.RegisterAsync`):
1. Validate DTO (email đúng định dạng, password ≥ 8 ký tự, fullName không rỗng) — sai thì `[ApiController]` tự trả 400.
2. Email đã tồn tại → ném `EmailAlreadyExistsException` → middleware trả 409 "Email đã được sử dụng".
3. Có `phone` và đã tồn tại (BR-54) → ném `PhoneAlreadyExistsException` → 409 "Số điện thoại đã được sử dụng".
4. Lấy `Role` có `RoleName == UserRole.Member` từ DB (query theo enum, **không hardcode RoleId**).
5. Tạo `UserAccount`: `Email`, `RoleId` = Member, `Status = Active`, `CreatedAt = DateTime.UtcNow`.
6. Tạo `UserCredential.PasswordHash = PasswordHasher.Hash(password)`.
7. Tạo `UserProfile { FullName, Phone }`.
8. `SaveChangesAsync` 1 lần (cùng DbContext, 3 bảng).
9. Generate token luôn (giống Login bước 7) → trả `AuthResponse`.

Response (201):
```json
{ "accessToken": "...", "user": { "userId": "...", "email": "...", "fullName": "...", "role": "Member" } }
```

## 4. Login — `POST /api/auth/login`

Request:
```json
{ "email": "a@b.com", "password": "Abc12345" }
```

Luồng xử lý (`AuthService.LoginAsync`) — thứ tự check quan trọng:
1. Validate DTO rỗng → 400 (tự động).
2. Tìm `UserAccount` theo email, `Include(Credential)`, `Include(Role)` (cột `email` là `citext` + unique index nên so sánh **không phân biệt hoa/thường** ở tầng DB, không cần tự `ToLower()`).
3. Không tìm thấy → ném `InvalidCredentialsException` → 401 "Email hoặc mật khẩu không đúng".
4. Tìm thấy nhưng `Credential == null || Credential.PasswordHash == null` (account Google-only, đúng BR Design v2 §3.1) → ném `ExternalOnlyCredentialException` → **409 Conflict**, message cụ thể: *"Tài khoản này đã đăng ký qua Google, chưa thiết lập mật khẩu. Vui lòng đăng nhập bằng Google."*
   → Chọn 409 (không phải 400) vì đây không phải lỗi định dạng request — mà là **trạng thái tài khoản xung đột với hành động đang thực hiện** (giống cách 409 đang dùng cho email/phone trùng), nhất quán trong cả API.
5. `PasswordHasher.Verify(password, credential.PasswordHash)` sai → ném `InvalidCredentialsException` → 401 "Email hoặc mật khẩu không đúng".
6. Check `UserAccount.Status` (chỉ tới bước này mới check, sau khi credential đã đúng):
   - `Banned` → ném `AccountBlockedException("Banned")` → 403 "Tài khoản đã bị khóa."
   - `Deactivated` → ném `AccountBlockedException("Deactivated")` → 403 "Tài khoản đã bị vô hiệu hóa."
7. `JwtService.GenerateAccessToken(userAccount.UserId, userAccount.Role.RoleName.ToString(), jwtOptions)` — `JwtService` nay nhận `string role` (đổi theo v4 để hết phụ thuộc `UserRole` từ `BuildingBlocks`), gọi ở đây chỉ cần `.ToString()` thêm vào.
8. Trả 200 + `AuthResponse`.

Response (200): giống hệt shape Register ở mục 3.

## 5. Bảng mã lỗi tổng hợp

| Case | HTTP | Exception | Message gợi ý |
|---|---|---|---|
| DTO thiếu/sai định dạng | 400 | (ModelState — tự động) | theo field lỗi |
| Register: email đã tồn tại | 409 | `EmailAlreadyExistsException` | "Email đã được sử dụng" |
| Register: phone đã tồn tại | 409 | `PhoneAlreadyExistsException` | "Số điện thoại đã được sử dụng" |
| Login: sai email hoặc sai password | 401 | `InvalidCredentialsException` | "Email hoặc mật khẩu không đúng" |
| Login: tài khoản Google-only | 409 | `ExternalOnlyCredentialException` | "Tài khoản này đã đăng ký qua Google..." |
| Login: Banned | 403 | `AccountBlockedException` | "Tài khoản đã bị khóa" |
| Login: Deactivated | 403 | `AccountBlockedException` | "Tài khoản đã bị vô hiệu hóa" |

Tất cả map qua `ExceptionHandlingMiddleware` (nay đọc `StatusCode` từ chính exception, xem mục 1) — Controller/Service chỉ `throw`, không tự set status code.

## 6. Thứ tự implement (map ra từng commit theo GIT_WORKFLOW.md)

Nhánh: `feature/auth-login-register` (tạo từ `develop` đã pull mới nhất — **sau khi** nhánh `refactor/backend-modular-structure` đã merge, để Auth code từ đầu đã nằm đúng cấu trúc module mới, không phải dời lại).

1. `feat: add BCrypt.Net-Next package and camelCase JSON config`
2. `feat: add UserAccountRepository for identity module`
3. `feat: add DomainException base + exception handling middleware` (nếu `BuildingBlocks` chưa có sẵn từ refactor)
4. `feat: add auth DTOs (Commands: Register/Login, DTOs: AuthResponse/UserSummaryDto)`
5. `feat: add AuthService with register and login logic`
6. `feat: add AuthController with register and login endpoints`
7. `test: add auth service tests` (nếu kịp — ít nhất: sai password, tài khoản banned, tài khoản Google-only, email trùng)

## 7. Checklist test thủ công qua Swagger (`/swagger`)

- [ ] Register email mới → 201, kiểm tra DB: `user_credentials.password_hash` không phải plaintext, `user_profiles` có đủ dữ liệu, response có `accessToken`.
- [ ] Register lại email vừa tạo → 409.
- [ ] Register với phone đã dùng ở account khác → 409.
- [ ] Login đúng email/password vừa tạo → 200, decode `accessToken` (jwt.io) thấy đúng `userId`, `role`.
- [ ] Login sai password → 401.
- [ ] Login email không tồn tại → 401 (message giống hệt case sai password).
- [ ] Tạo/sửa 1 user Google-only (`user_credentials.password_hash = NULL`) → login bằng password → 409 đúng message.
- [ ] Đổi `Status` 1 user thành `Banned` → login → 403 đúng message.
- [ ] Gọi 1 endpoint có `[Authorize]` bất kỳ không kèm token → 401 (xác nhận fallback policy hoạt động, `AuthController` không bị chặn nhầm).
