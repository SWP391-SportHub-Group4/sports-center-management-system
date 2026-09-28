# Kế hoạch triển khai BE-1, BE-2, BE-3 cho Cursor

> Ngày lập: 29/09/2026  
> Phạm vi: Google password onboarding, chính sách hủy lớp cố định 30 phút, API báo cáo dành cho Center Manager.  
> Không thuộc phạm vi: Payment, Refund, Invoice, VNPay, PT session/result/progress/homework và thiết kế lại FE PT/Manager.

## 0. Chỉ dẫn bắt buộc cho Cursor trước khi code

1. Đọc đầy đủ theo thứ tự:
   - `docs/00-Source-of-Truth.md`
   - `docs/Requirements.md`
   - `docs/Center-Management-System-Design-v2.md`
   - `docs/frontend-pt-manager-ux-redesign-plan.md`
   - file kế hoạch này.
2. Không triển khai cả ba phần trong một PR. Tạo ba branch/PR độc lập theo thứ tự BE-1 → BE-2 → BE-3.
3. Branch `feature/frontend-i18n-foundation` hiện có thay đổi FE chưa commit. Không code backend trên working tree bẩn đó. Chỉ bắt đầu khi:
   - PR FE foundation đã được commit/merge; hoặc
   - tạo Git worktree sạch từ `develop` cho từng branch backend.
4. Không sửa các vùng sau:
   - `backend/SportHub.Payment/**`
   - migration hoặc test chỉ phục vụ Payment/Refund/Invoice/VNPay
   - logic tính revenue
   - các page/component Payment ở frontend.
5. Chỉ tạo migration bằng EF Core sau khi domain/configuration đã hoàn chỉnh. Không sửa tay migration cũ đã được áp dụng; tạo migration mới tiến về phía trước.
6. Mỗi PR phải có test tự động, migration/model snapshot đồng bộ, build sạch và mô tả rõ API contract thay đổi.
7. Không đưa mã `BR-xx` hoặc nội dung kỹ thuật vào API message hướng tới người dùng. Mã BR được giữ trong comment/test/docs khi cần truy vết.

---

# BE-1 — Google onboarding bắt buộc nhập mật khẩu

## 1. Mục tiêu

Google user có email mới phải tự nhập và xác nhận mật khẩu trước khi:

- tài khoản được tạo/hoàn tất;
- trạng thái account trở thành `Active`;
- hệ thống cấp application JWT;
- người dùng được điều hướng vào ứng dụng.

Loại bỏ hoàn toàn cơ chế `SuggestedPassword`.

Không thay đổi hai rule:

- Google identity đã link được đăng nhập bình thường.
- Email đã tồn tại nhưng Google identity chưa link vẫn trả `409 google_account_not_linked`; không auto-link theo email.

## 2. Thiết kế API

### 2.1 `POST /api/auth/google`

Request giữ nguyên:

```json
{
  "idToken": "google-id-token"
}
```

Hai kết quả hợp lệ:

1. Google identity đã link:
   - HTTP `200 OK`.
   - Trả session/auth response hiện hành: `accessToken`, `user`, `isNewAccount = false`.
2. Email Google hoàn toàn mới:
   - HTTP `202 Accepted`.
   - Không tạo `UserAccount`, không tạo `UserCredential`, không tạo `UserExternalLogin`, không cấp JWT.
   - Trả:

```json
{
  "requiresOnboarding": true,
  "onboardingToken": "opaque-one-time-token",
  "email": "user@example.com",
  "fullName": "Google User",
  "expiresAt": "2026-09-29T00:10:00Z"
}
```

Không trả Google subject, token hash hoặc thông tin nội bộ.

### 2.2 `POST /api/auth/google/onboarding`

Anonymous nhưng dùng rate-limit phù hợp với auth/register.

Request:

```json
{
  "onboardingToken": "opaque-one-time-token",
  "fullName": "Nguyễn Văn A",
  "phone": "0901234567",
  "password": "user-entered-password",
  "confirmPassword": "user-entered-password"
}
```

Response thành công:

- HTTP `201 Created` hoặc `200 OK`; chọn một kiểu và khóa bằng contract test. Khuyến nghị `201 Created`.
- Trả auth response không còn `suggestedPassword`.
- `isNewAccount = true` được phép giữ để FE điều hướng onboarding-complete.

Error codes tối thiểu:

| HTTP | Code | Trường hợp |
|---:|---|---|
| 400 | `password_confirmation_mismatch` | Password và confirmPassword khác nhau |
| 400 | `password_policy_failed` | Không đạt policy mật khẩu hiện hành |
| 400/401 | `google_onboarding_token_invalid` | Token sai hash/format |
| 410 | `google_onboarding_token_expired` | Token hết hạn |
| 409 | `google_onboarding_token_used` | Token đã consume |
| 409 | `email_already_exists` | Email được tạo bởi request khác trong thời gian onboarding |
| 409 | `phone_already_exists` | Phone đã thuộc tài khoản khác |

Không tiết lộ Google token, hash hoặc password trong message/log/audit.

## 3. Dữ liệu onboarding

Tạo entity thuộc module Identity, tên khuyến nghị `GoogleOnboardingTicket`:

| Field | Kiểu | Ghi chú |
|---|---|---|
| `TicketId` | `Guid` | PK nội bộ |
| `TokenHash` | `string` | unique; SHA-256/Base64 hoặc hex của opaque token, không lưu raw token |
| `ProviderUserId` | `string` | Google subject đã verify |
| `Email` | `string`/citext | email Google đã verify |
| `SuggestedFullName` | `string?` | dữ liệu prefill, không phải giá trị bắt buộc cuối cùng |
| `CreatedAt` | `DateTime` | UTC |
| `ExpiresAt` | `DateTime` | UTC; khuyến nghị 10 phút |
| `ConsumedAt` | `DateTime?` | null khi còn dùng được |

Quy tắc bảo mật:

- Sinh token bằng CSPRNG tối thiểu 256 bit; trả raw token đúng một lần.
- DB chỉ lưu hash token.
- Không lưu Google `idToken` hoặc refresh token trong ticket.
- Ticket one-time; consume nguyên tử để hai request song song không tạo hai account.
- Tạo `UserAccount`, `UserCredential`, `UserProfile`, `UserExternalLogin` và consume ticket trong cùng transaction.
- Trước khi commit phải kiểm lại unique email, phone, `(provider, provider_user_id)`.
- Account tạo mới có role `Member`, status `Active`, password được hash bằng service hiện hành.
- Có thể invalidate ticket chưa dùng cũ của cùng Google subject khi phát ticket mới; phải test hành vi đã chọn.

## 4. Thay đổi code dự kiến

Tối thiểu kiểm tra/sửa:

- `backend/SportHub.Identity/Application/Services/GoogleAuthService.cs`
- `backend/SportHub.Identity/Application/Interfaces/IGoogleAuthService.cs`
- `backend/SportHub.Identity/Api/GoogleAuthController.cs`
- `backend/SportHub.Identity/Application/DTOs/AuthResponse.cs`
- command/DTO mới cho onboarding request/response
- entity/configuration mới trong `SportHub.Identity/Domain` và `Infrastructure/Persistence`
- `backend/SportHub.API/Persistence/SportHubDbContext.cs`
- EF migration + model snapshot
- wiring nếu có service/token generator mới
- `backend/SportHub.Security.Tests/Integration/GoogleLoginTests.cs`

Xóa:

- dependency `IPasswordGenerator` khỏi `GoogleAuthService` nếu không còn consumer khác;
- `SuggestedPassword` khỏi `AuthResponse` và mọi response builder;
- test khẳng định password suggestion dài 14 ký tự;
- comment/doc code mô tả suggestion.

Không xóa endpoint Google link/unlink backend trong PR này. Việc bỏ card link/unlink là công việc FE sau.

## 5. Test bắt buộc BE-1

1. Google identity đã link → `200`, có JWT, không onboarding token.
2. Google email mới → `202`, có opaque onboarding token, DB chưa có UserAccount/ExternalLogin.
3. Complete onboarding hợp lệ → tạo đúng một account + credential hash + profile + external login, consume ticket và cấp JWT.
4. Password và confirm khác nhau → không tạo dữ liệu.
5. Token hết hạn/sai/đã dùng → không tạo dữ liệu.
6. Hai completion request đồng thời → chỉ một request thành công.
7. Email tồn tại chưa link → giữ `409 google_account_not_linked`.
8. Phone trùng → rollback toàn transaction; ticket chưa bị consume hoặc có quy tắc retry rõ ràng.
9. Account/external login unique conflict → rollback toàn transaction.
10. Password login bằng password người dùng vừa đặt → thành công.
11. Response/error/log không có `suggestedPassword`, password plaintext, token hash hoặc Google ID token.

## 6. Definition of Done BE-1

- User Google mới không nhận JWT trước khi tự nhập và confirm password.
- Không còn `SuggestedPassword` trong source, serialized contract hoặc tests.
- Migration lên/xuống chạy được trên database test.
- Security integration tests pass.
- Backend solution build pass.

---

# BE-2 — Deadline hủy lớp cố định 30 phút

## 7. Mục tiêu

Đồng bộ code với rule hiện hành:

- Yoga/Group X được hủy tại hoặc trước 30 phút trước giờ bắt đầu.
- Deadline là hằng số nghiệp vụ, không phải SystemSetting.
- Không snapshot số giờ vào `Enrollment`.
- Center Manager không được cấu hình deadline này.

BE-2 chỉ áp dụng class booking Yoga/Group X. Không áp dụng rule 24 giờ của PT session và không đụng PT/Payment.

## 8. Domain rule

Tại `SessionRules`:

```text
CancellationDeadlineMinutes = 30
deadlineUtc = sessionStartAtUtc - 30 minutes
cancelledAtUtc <= deadlineUtc  => CancelledOnTime
cancelledAtUtc > deadlineUtc   => CancelledLate
```

Giữ semantics “tại deadline vẫn đúng hạn”.

Thay signature nhận `cancellationDeadlineHours` bằng rule không nhận tham số cấu hình. Nên expose helper tính `CancellationDeadlineUtc` để projection và test dùng chung, tránh nhân bản `AddMinutes(-30)`.

## 9. Xóa setting và snapshot lỗi thời

### 9.1 SystemSetting

- Xóa `SystemSettingKeys.CancellationDeadlineHours`.
- Xóa seed `cancellation_deadline_hours` khỏi `SystemSettingConfiguration`.
- Xóa validation range của key này trong `SystemSettingService`.
- `GET /api/system-settings` không còn trả key trên.
- `PUT /api/system-settings/cancellation_deadline_hours` phải trả `404 setting_not_found` hoặc error contract hiện hành.
- Giữ nguyên `package_expiring_reminder_days` và `ISystemSettingProvider` vì expiry job còn sử dụng.

### 9.2 Enrollment

- Xóa property `Enrollment.CancellationDeadlineHours`.
- Xóa column DB `enrollments.cancellation_deadline_hours` bằng migration mới.
- Xóa cấu hình/check/default/index liên quan nếu có.
- Xóa assignment khi tạo Enrollment.
- Xóa việc inject/đọc `ISystemSettingProvider` trong `EnrollmentService` nếu service không còn cần dependency này.
- Audit cancellation không ghi `deadlineHours`; có thể ghi `deadlineMinutes: 30` hoặc `deadlineUtc` tính từ session.

### 9.3 API response

`EnrollmentResponse`:

- Xóa `CancellationDeadlineHours`.
- Giữ `CancellationDeadlineUtc`, tính từ `Session.StartAtUtc - 30 phút`.
- Nếu FE cần hiển thị policy, thêm `CancellationDeadlineMinutes = 30`; không giữ field “hours” sai nghĩa.

Đây là breaking contract có chủ ý; ghi rõ trong PR để FE cập nhật sau.

## 10. Migration BE-2

Migration mới phải:

1. Xóa row `cancellation_deadline_hours` khỏi `system_settings`.
2. Drop column `cancellation_deadline_hours` khỏi `enrollments`.
3. Cập nhật model snapshot.

Không sửa migration `20260921134322_AddBusinessRuleSupportTables` hoặc migration lịch sử khác.

`Down` có thể khôi phục column với default lịch sử hợp lý và seed row để migration reversible; ghi rõ việc down chỉ phục vụ rollback schema, không khôi phục semantics mới.

## 11. Test bắt buộc BE-2

Unit test boundary:

- Hủy trước deadline 1 tick → on-time.
- Hủy đúng `start - 30 phút` → on-time.
- Hủy sau deadline 1 tick → late.
- Không cho hủy sau/đúng khi session đã bắt đầu theo rule hiện hành.

Integration test:

- Booking mới không cần đọc cancellation setting.
- Cancellation hoàn/không hoàn lượt đúng boundary hiện hành.
- `GET /api/system-settings` chỉ còn policy được phép cấu hình.
- PUT key cancellation cũ bị từ chối.
- Enrollment response trả deadline UTC đúng 30 phút.
- Migration tạo database mới và upgrade database hiện hành thành công.

## 12. Definition of Done BE-2

- Không còn reference runtime tới `cancellation_deadline_hours` ngoài migration lịch sử/docs changelog.
- Enrollment không còn snapshot deadline hours.
- Rule 30 phút có một nguồn duy nhất trong domain.
- Tests Scheduling + Administration liên quan pass.
- Không thay đổi PT cancellation và Payment.

---

# BE-3 — API báo cáo cho Center Manager

## 13. Mục tiêu

Bổ sung API đọc để FE Center Manager hiển thị:

1. Tổng quan hội viên và trạng thái Membership.
2. Mức sử dụng/đăng ký lớp Yoga và Group X theo khoảng ngày.

Không sửa API revenue và không query Payment/Invoice/Refund trong các service mới.

`GET /api/users` hiện đủ cho Center Directory read-only, vì vậy không tạo thêm API quản trị tài khoản cho Manager.

## 14. API membership summary

Route theo Design v2:

```http
GET /api/reports/membership-summary?asOfDate=2026-09-29
Authorization: CenterManager
```

- `asOfDate` optional, mặc định ngày Việt Nam hiện tại.
- Đây là báo cáo snapshot read-only.
- Module sở hữu khuyến nghị: Membership.

Response đề xuất:

```json
{
  "asOfDate": "2026-09-29",
  "totalMembers": 120,
  "membersWithActiveMembership": 84,
  "membersWithoutActiveMembership": 36,
  "packagesByStatus": {
    "pendingPayment": 3,
    "active": 89,
    "expired": 41,
    "cancelled": 7
  }
}
```

Định nghĩa đếm:

- `totalMembers`: distinct `UserAccount` có role hiện tại là Member; xác định rõ có/không bao gồm Banned/Deactivated. Khuyến nghị bao gồm tất cả account Member và để status account cho directory, vì đây là tổng số member đã đăng ký.
- `membersWithActiveMembership`: distinct Member có ít nhất một `MemberPackage.Status = Active` và `StartDate <= asOfDate <= EndDate`.
- `membersWithoutActiveMembership = totalMembers - membersWithActiveMembership`.
- `packagesByStatus`: số record MemberPackage theo status; không phải distinct member.
- Không gọi Payment để tính `totalSpent` trong endpoint này.

Nếu team muốn thống kê account status, thêm một object riêng `membersByAccountStatus`; không trộn account status với package status.

## 15. API class utilization

Route theo Design v2:

```http
GET /api/reports/class-utilization?fromDate=2026-09-01&toDate=2026-09-30&discipline=Yoga
Authorization: CenterManager
```

Query:

- `fromDate`, `toDate` optional; mặc định 30 ngày tính theo giờ Việt Nam.
- `discipline` optional, chỉ chấp nhận `Yoga` hoặc `GroupX` theo constants hiện hành.
- Chặn `toDate < fromDate` bằng `400 invalid_date_range`; không tự swap trong report.
- Khoảng tối đa khuyến nghị 366 ngày.

Response đề xuất:

```json
{
  "fromDate": "2026-09-01",
  "toDate": "2026-09-30",
  "totalSessions": 40,
  "scheduledSessions": 8,
  "completedSessions": 28,
  "cancelledSessions": 4,
  "totalCapacity": 600,
  "totalConfirmed": 420,
  "utilizationRate": 70.0,
  "byClass": [
    {
      "classId": 1,
      "className": "Yoga buổi sáng",
      "discipline": "Yoga",
      "sessionCount": 10,
      "totalCapacity": 150,
      "totalConfirmed": 120,
      "utilizationRate": 80.0
    }
  ],
  "daily": [
    {
      "date": "2026-09-01",
      "sessionCount": 2,
      "totalCapacity": 30,
      "totalConfirmed": 21,
      "utilizationRate": 70.0
    }
  ]
}
```

Quy tắc tính:

- Biên ngày dùng `VietnamTime.StartOfDayUtc` và `EndOfDayExclusiveUtc`.
- Chỉ Yoga/Group X; không đưa PT vào Class utilization vì PT không dùng Class/ClassSession.
- `totalSessions` gồm các session trong khoảng; status breakdown phải cộng khớp tổng.
- `totalCapacity` và `totalConfirmed` dùng snapshot trên `ClassSession`.
- Khuyến nghị loại `Cancelled` khỏi mẫu số utilization nhưng vẫn trả `cancelledSessions` riêng. Khi đó:
  - usable sessions = `Scheduled + Completed`;
  - utilization = tổng confirmed của usable sessions / tổng capacity usable sessions × 100;
  - nếu capacity = 0 thì rate = 0, không chia cho 0.
- `Rescheduled` cũ không được tính như một buổi usable độc lập; replacement `Scheduled/Completed` được tính bình thường.
- Làm tròn rate nhất quán, khuyến nghị 2 chữ số thập phân ở backend.

## 16. Cấu trúc module BE-3

Không tạo một service Administration khổng lồ query xuyên Payment.

Khuyến nghị:

- Membership module sở hữu `MembershipSummaryService`, DTO/interface/controller action.
- Scheduling module sở hữu `ClassUtilizationReportService`, DTO/interface/controller action.
- Hai controller có thể cùng prefix `/api/reports` nhưng action route khác nhau; xác nhận không trùng route khi app discover assembly.
- Cả hai action dùng `[Authorize(Policy = SportHubPolicies.CenterManager)]`.
- Query `AsNoTracking`, aggregate tại DB, không load toàn bộ rows rồi group trong memory.
- Không trả EF entity trực tiếp.

Không thay đổi `RevenueReportsController` trong Payment ngoài trường hợp build bắt buộc; nếu cần chạm, dừng và báo conflict thay vì tự sửa.

## 17. Test bắt buộc BE-3

RBAC cho cả hai endpoint:

- CenterManager → `200`.
- SystemAdministrator, Coach, Receptionist, Member → `403` theo policy hiện hành.
- Anonymous → `401`.

Membership summary:

- Member không có package.
- Member có nhiều package nhưng chỉ đếm một lần trong active members.
- Package Active ngoài validity date không được tính active tại `asOfDate`.
- Package status counts đúng và không query Payment.
- Boundary `StartDate`/`EndDate` inclusive.

Class utilization:

- Biên ngày Việt Nam, gồm đúng session đầu/cuối ngày.
- Lọc Yoga/GroupX.
- Reject discipline khác.
- Reject inverted/too-large date range.
- Cancelled/Rescheduled không làm sai mẫu số.
- Không chia cho 0.
- Aggregate tổng bằng tổng các group `byClass`/`daily` theo định nghĩa đã chọn.
- Không có N+1 query rõ ràng; kiểm tra projection/grouping.

## 18. Definition of Done BE-3

- Hai endpoint đúng route/contract/RBAC và có Swagger metadata.
- Không có reference mới từ Membership/Scheduling sang Payment.
- Center Directory dùng API hiện hành, không mở quyền quản trị account cho Manager.
- Tests module và integration pass.
- Revenue report hiện hành không đổi kết quả.

---

# 19. Thứ tự branch và PR

## PR 1

```text
branch: feature/google-password-onboarding
scope: BE-1 only
```

Breaking contract: Google email mới nhận `202 onboarding required`; `SuggestedPassword` bị xóa.

## PR 2

```text
branch: feature/fixed-class-cancellation-deadline
scope: BE-2 only
```

Breaking schema/API: xóa enrollment snapshot hours và system setting cũ; response dùng deadline UTC/30 minutes.

## PR 3

```text
branch: feature/manager-reporting-apis
scope: BE-3 only
```

Additive contract: thêm membership summary và class utilization; revenue không đổi.

# 20. Lệnh kiểm tra cuối mỗi PR

Cursor phải dùng solution/project thực tế trong repo, tối thiểu:

```bash
dotnet build backend/SportHub.sln
dotnet test backend/SportHub.Security.Tests/SportHub.Security.Tests.csproj
dotnet test backend/SportHub.Scheduling.Tests/SportHub.Scheduling.Tests.csproj
```

Với BE-2/BE-3, chạy thêm project test Administration/Membership tương ứng nếu tồn tại hoặc tạo project test đúng module khi chưa có coverage. Test tích hợp dùng PostgreSQL/Testcontainers theo pattern hiện hành; không thay bằng EF InMemory cho logic unique, transaction hoặc date aggregation.

# 21. Prompt ngắn để giao cho Cursor

```text
Đọc toàn bộ docs/backend-be1-be2-be3-implementation-plan.md và các tài liệu nguồn được liệt kê ở mục 0. Trước tiên kiểm tra git status; không làm việc trên branch feature/frontend-i18n-foundation đang có FE chưa commit. Triển khai riêng BE-1 trên branch feature/google-password-onboarding từ develop sạch. Không triển khai BE-2/BE-3 trong cùng PR, không sửa Payment/Refund/Invoice/VNPay hoặc frontend. Thực hiện đầy đủ migration, contract, integration/security tests và Definition of Done của BE-1. Nếu phát hiện yêu cầu buộc phải chạm Payment hoặc mâu thuẫn SSOT, dừng và báo lại thay vì tự mở rộng scope.
```

Sau khi PR BE-1 được review/merge, đổi `BE-1` và tên branch trong prompt thành BE-2, rồi BE-3.
