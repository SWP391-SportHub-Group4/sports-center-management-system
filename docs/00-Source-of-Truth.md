# 00 — Source of Truth (SSOT)

> Mục đích: 1 nơi duy nhất để AI / FE / BE tra cứu khi có mâu thuẫn giữa các tài liệu.
> Nếu file này và một doc khác nói khác nhau → **file này thắng**, trừ khi có ghi chú "xem chi tiết tại...".
> Cập nhật lần cuối: 18/09/2026 — bổ sung truy vết BR v1.3 và đặc tả bảo mật login qua Codex theo yêu cầu người dùng; chưa phải xác nhận hoàn tất triển khai.

---

## 0. Thứ tự ưu tiên tài liệu

Khi có mâu thuẫn, đọc theo thứ tự sau (trên > dưới):

1. `docs/00-Source-of-Truth.md` (file này) — quyết định đã chốt, không tranh cãi lại trong sprint hiện tại
2. `docs/SportManagement_BusinessRules.docx` — business rules chi tiết; bản hiện có là **v1.3 (bản hợp nhất), 14/09/2026**
3. `docs/Center-Management-System-Design-v2.md` — thiết kế kỹ thuật/kiến trúc
4. `docs/Requirements.md` — yêu cầu gốc từ đề bài
5. Mọi thứ khác (Slack/Zalo/note họp miệng) — **không tính là nguồn chính thức** trừ khi được chép lại vào 1 trong 4 file trên

**Quy tắc cứng:** Nếu 2 doc mâu thuẫn và chưa kịp cập nhật file này → dừng lại, hỏi trong nhóm, **không tự thêm/đổi entity, field, hay flow để "cho chạy được"**. Ghi lại câu hỏi vào mục 6 (Open Questions) thay vì tự quyết.

**Đối chiếu 18/09/2026:** tên `SportManagement_BusinessRules_v1.2.docx` ở ghi chú lịch sử bên dưới chỉ phiên bản cũ; file chính thức hiện có là mục 2. Trong bản hợp nhất, unique phone là **BR-62** (trước đây BR-54), unique role là **BR-63** (trước đây BR-55); không dùng các mã cũ cho hai ràng buộc này. BR-59/BR-60 về Google link/password đã có trong bản chính thức. Open Questions nằm ở **§7**.

---

## 1. MVP Scope

### 1.1 In-scope (bắt buộc — theo đề bài)

- [ ] Flow 1 — User & Membership management
- [ ] Flow 2 — Class booking & schedule management
- [ ] Flow 3 — Payment & report management

> **Bổ sung 18/09/2026 — Bộ môn (Discipline) trong scope:** 1 trung tâm duy nhất (không đa chi nhánh, xem §1.3), nhưng **đa bộ môn** — 4 bộ môn chính thức, chốt cùng ngày (chi tiết + lý do đầy đủ: `claude/citigym-multidiscipline-scope-plan.md`, Project doc):
>
> | Bộ môn | Cơ chế | `Class.Discipline` |
> |---|---|---|
> | Gym / Fitness | Ra vào tự do, KHÔNG đặt lịch — điểm danh qua entity mới `GymCheckIn` (xem §2) | Không xuất hiện — không có `Class` nào cho Gym |
> | Personal Training | Đặt lịch qua `Class`, `Capacity = 1`, gán 1 Coach | `"PersonalTraining"` |
> | Yoga | Đặt lịch qua `Class` (lớp nhóm) | `"Yoga"` |
> | Group X / Aerobic / HIIT | Đặt lịch qua `Class` (lớp nhóm) | `"GroupX"` |

### 1.2 In-scope (optional nhưng nhóm chọn làm)

- [ ] Flow 4 — Training & attendance management
- [ ] Flow 5 — AI workout recommendation

### 1.3 Out-of-scope (ghi rõ để khỏi cãi nhau giữa kỳ)

- [x] Đa chi nhánh / multi-tenant — 1 lần deploy SportHub = 1 trung tâm duy nhất, không có entity `Center`/`Branch`. Không nhầm với "đa bộ môn" (multi-discipline) — đa bộ môn trong CÙNG 1 trung tâm là IN-SCOPE, xem §1.1.
- [x] Các bộ môn ngoài 4 bộ môn đã chốt ở §1.1 (vd Boxing, Cầu lông, Bơi lội, Bóng rổ...)
- [ ] <ví dụ: thanh toán online qua cổng thật (VNPay/Momo) — MVP chỉ ghi nhận thủ công>
- [ ] <ví dụ: mobile app riêng>
- [ ] <ví dụ: notification qua SMS/email thật — MVP chỉ lưu trong DB / log>
- [ ] <thêm...>

### 1.4 Stretch (chỉ làm nếu còn thời gian sau khi xong Flow 1–5 — không tính vào scope cam kết)

- [ ] Flow 6 — AI assistant — **đã hạ khỏi optional cam kết ngày 09/09/2026**; chỉ triển khai nếu Flow 1–5 xong sớm và còn dư thời gian. Không code/API/entity nào cho flow này được coi là bắt buộc; xem `BR-27`–`BR-29` trong `SportManagement_BusinessRules_v1.2.docx` (đã đánh dấu tương ứng) và endpoint `POST /api/ai/chat` trong `Center-Management-System-Design-v2.md` §4.4 (đã đánh dấu tương ứng).

---

## 2. Entity đã chốt (Domain Model)

> Đồng bộ với ERD v2 (`Center-Management-System-Design-v2.md` §1) — nguồn field đầy đủ nhất là `entity-field-purpose.md`, bảng dưới chỉ tóm tắt để tra nhanh module sở hữu + enum dùng. Entity nào **chưa** nằm trong bảng này thì **chưa được coi là đã chốt**.
>
> **Cập nhật 09/09/2026:** bảng này trước đó là khung nháp, thiếu 11 entity đã có trong ERD v2 và dùng sai tên/module cho vài entity còn lại — đã đồng bộ lại đầy đủ theo ERD v2 hiện hành.

> **Cập nhật 10/09/2026:** tên field/property trong cột "PK" và "Field chính" đã đổi từ `PascalCase` sang `snake_case` (vd `RoleID` → `role_id`) theo quyết định naming mới ở §5.4. Tên Entity/Class (`Role`, `User`...) và tên Enum (`UserRole`...) giữ nguyên `PascalCase`, không đổi.

> **Cập nhật 10/09/2026 (2) — Google Login:** tách entity `User` thành 4 entity: `UserAccount` (định danh + vòng đời — email, role, status), `UserCredential` (auth nội bộ — password_hash, 1—1 với `UserAccount`), `UserProfile` (thông tin hiển thị — full_name, phone, 1—1 với `UserAccount`), `UserExternalLogin` (auth ngoài, vd Google — quan hệ 1—N vì 1 user có thể gắn nhiều provider). Lý do: hỗ trợ đăng nhập Google (đã chốt là flow bắt buộc, không còn stretch), và tách rõ dữ liệu có vòng đời khác nhau (identity/auth/profile) để giảm conflict khi nhiều người cùng sửa song song. **FK ở toàn bộ entity khác không đổi tên cột** (`member_id`, `coach_id`, `issued_by_user_id`, `received_by_user_id`, `requested_by_user_id`, `approved_by_user_id`, `user_id`...) — chỉ đổi entity đích từ `User` sang `UserAccount`. `UserCredential.password_hash` là nullable (account tạo thuần qua Google không có password nội bộ). Entity `User` (dòng cũ) coi như **đã bị thay thế**, không dùng nữa.

> **Cập nhật 10/09/2026 (3) — Chuẩn hoá Attendance/WorkoutResult:** `Attendance` bỏ `session_id`/`member_id` — cả 2 suy ra được 100% qua `enrollment_id` (1—1 với `Enrollment`, nay có ràng buộc `UNIQUE`), tránh dữ liệu trùng lặp có thể lệch nhau; lý do denormalize "khỏi JOIN" cũ không còn hợp lý ở quy mô đồ án. `WorkoutResult` đổi `session_id` + `member_id` (2 FK độc lập, trước đây không có gì đảm bảo Member thực sự có đăng ký session đó) thành 1 FK duy nhất `enrollment_id` — DB giờ tự chặn được việc ghi kết quả tập cho 1 cặp (session, member) không tồn tại `Enrollment` khớp. `coach_id` trên `WorkoutResult` giữ nguyên (không suy ra được qua `Enrollment`).

> **Cập nhật 11/09/2026 — Đảo ngược naming property (xem §5.4):** cột **PK** và **Field chính** bên dưới đổi từ `snake_case` (quyết định 10/09/2026) trở lại `PascalCase` — đúng convention property C#. Đây là tên **property trong code** (`SportHub.Repository/Entities/*.cs`), không phải tên cột DB — cột DB (Postgres) vẫn `snake_case` như cũ nhờ package `EFCore.NamingConventions` (`.UseSnakeCaseNamingConvention()` cấu hình ở `Program.cs`), không cần đổi migration. Code (`Entities/*.cs`, `SportHubDbContext.cs`, `Program.cs`, `SportHub.Repository.csproj`) đã cập nhật trước, doc đồng bộ ở bước này.

> **Cập nhật 11/09/2026 (2) — Bổ sung role `SystemAdministrator` (5 role):** `SportManagement_BusinessRules_v1.2.docx` (BR-2, BR-3) và SRS v1.1 đã tách `System Administrator` thành vai trò riêng, độc lập với `Center Manager` — hệ thống hiện có **5 role**: `SystemAdministrator, CenterManager, Coach, Member, Receptionist` (bảng Entity/Enum bên dưới và enum `UserRole` trong code trước đó mới chỉ có 4 role, chưa đồng bộ với Business Rules). Theo BR-2: chỉ `SystemAdministrator` được tạo tài khoản `SystemAdministrator`/`CenterManager`/`Coach`/`Receptionist` và gán/đổi vai trò; theo BR-6: chỉ `SystemAdministrator` được khóa/mở khóa tài khoản — **2 quyền này chuyển từ `CenterManager` sang `SystemAdministrator`**, không còn là quyền của Manager như bản trước. Đã cập nhật bảng Entity (§2, dòng `Role`) và bảng Enum (§3, dòng `UserRole`) bên dưới; đồng bộ RBAC matrix + actor API trong `Center-Management-System-Design-v2.md` §4.1/§5. Phạm vi quyền `SystemAdministrator` ngoài 2 việc trên (vd có xem báo cáo doanh thu, Audit Log, cấu hình hệ thống hay không) **chưa được Business Rules chốt rõ** — xem Open Question mới ở §7. **Chỉ sửa doc ở bước này — migration/enum trong code (`UserRole.cs`, `AddRoleSeedData`) chưa cập nhật theo thay đổi này.**
>
> **Cập nhật 12/09/2026 — Chính thức hoá module `Notification` và `Audit`:** `Notification` và `AuditLog` trước đây chưa gán module (xem Open Question cũ ở §7), nay chính thức tách thành 2 module riêng — `Notification` (chứa `Notification`) và `Audit` (chứa `AuditLog`) — thay vì gộp vào 1 trong 6 module sẵn có. Lý do tách riêng `Audit` khỏi `Identity`/`BuildingBlocks`: `AuditLog.UserId` là FK thật sang `UserAccount` (Identity), nếu đặt `AuditLog` ở tầng hạ tầng dùng chung (`BuildingBlocks`) thì tầng đó sẽ phải phụ thuộc ngược vào module nghiệp vụ `Identity` — vi phạm nguyên tắc `BuildingBlocks` không phụ thuộc module nào. Quyết định này chốt tại `docs/claude-plans/monolith-refactor-plan.md` (mục 2, 5) khi tách `SportHub.Repository`/`SportHub.Service` thành project riêng theo module. Đã cập nhật cột "Module sở hữu" ở bảng Entity (§2, dòng `Notification`/`AuditLog`) và xoá Open Question tương ứng ở §7.

> **Cập nhật 18/09/2026 — Bộ môn (Discipline) + Gym Check-in:** chốt 4 bộ môn chính thức (Gym/Fitness, Personal Training, Yoga, Group X — xem §1.1). Gym/Fitness KHÔNG đặt lịch qua `Class` — thêm entity mới `GymCheckIn` (module Scheduling) để Lễ tân điểm danh khi Member đến tập tự do, tách khỏi `Enrollment`/`Attendance`. Chi tiết field/BR/API/RBAC: `claude/citigym-multidiscipline-scope-plan.md` (Project doc) §2.

| Entity | Module sở hữu | PK | Field chính | Quan hệ chính | Enum dùng | Ghi chú |
|---|---|---|---|---|---|---|
| `Role` | Identity | `RoleId` (int) | RoleName (unique) | 1—N `UserAccount` | `UserRole` | seed data, **5 dòng cố định** (bổ sung `SystemAdministrator` theo BR-2/BR-3, cập nhật 11/09/2026); unique BR-63 (v1.3) |
| `UserAccount` | Identity | `UserId` (uuid) | Email (unique), RoleId, Status | N—1 `Role`; 1—1 `UserCredential`, `UserProfile`; 1—N `UserExternalLogin`, hầu hết entity khác (chủ thể thao tác) | `UserStatus` | email unique BR-1/BR-49; bảng định danh + vòng đời, tách khỏi Credential/Profile 10/09/2026 (2) |
| `UserCredential` | Identity | `UserId` (uuid, PK/FK) | PasswordHash (nullable) | 1—1 `UserAccount` | — | nullable vì account Google-only không có password; auth service chỉ cần query bảng này |
| `UserProfile` | Identity | `UserId` (uuid, PK/FK) | FullName, Phone (unique, nullable) | 1—1 `UserAccount` | — | phone unique BR-62 (v1.3); thông tin hiển thị, không liên quan cơ chế đăng nhập/phân quyền |
| `UserExternalLogin` | Identity | `ExternalLoginId` (uuid) | UserId, Provider, ProviderUserId, RefreshToken (nullable) | N—1 `UserAccount` | `ExternalAuthProvider` | unique (provider, provider_user_id) và (user_id, provider); refresh_token MVP chưa mã hoá — xem Open Questions |
| `MemberTrainingProfile` | Membership | `ProfileId` (uuid) | MemberId (unique), Goal, ExperienceLevel | 1—1 `UserAccount` (Member) | `ExperienceLevel` | input bắt buộc cho AI suggestion (BR-26) |
| `CoachMemberRelationship` | Training | `RelationshipId` (uuid) | CoachId, MemberId, SourceType, ClassId (nullable) | N—1 `UserAccount` (2 phía) | `RelationshipSourceType`, `RelationshipStatus` | unique khi ACTIVE (ràng buộc #7, BR-23/24) |
| `MembershipPackage` | Membership | `PackageId` (int) | Name (unique), Price, DurationDays, SessionLimit | 1—N `MemberPackage` | — | unique BR-56 |
| `MemberPackage` | Membership | `MemberPackageId` (uuid) | MemberId, PackageId, RemainingSessions, Version | N—1 `UserAccount`, N—1 `MembershipPackage`; 1—N `Enrollment` | `MemberPackageStatus` | state machine §4; optimistic concurrency qua `Version` |
| `Room` | Scheduling | `RoomId` (int) | Name (unique), Capacity | 1—N `Class`, `ClassSession` | — | unique BR-57 |
| `Class` | Scheduling | `ClassId` (int) | Name, Discipline, DefaultRoomId, DefaultCoachId | N—1 `Room`; 1—N `ClassRecurrence`, `ClassSession` | `ClassStatus` | |
| `ClassRecurrence` | Scheduling | `RecurrenceId` (int) | ClassId, DaysOfWeek, StartTimeLocal, EndTimeLocal, Timezone | N—1 `Class`; 1—N `ClassSession` | — | định nghĩa pattern, không phải buổi cụ thể |
| `ClassSession` | Scheduling | `SessionId` (uuid) | ClassId, RecurrenceId (nullable), RoomId, CoachId, StartAtUtc, EndAtUtc, ConfirmedCount | N—1 `Class`, `ClassRecurrence` (nullable), `Room`; 1—N `Enrollment`, `Attendance` | `ClassSessionStatus` | chưa có state diagram riêng — xem §4 |
| `Enrollment` | Scheduling | `EnrollmentId` (uuid) | SessionId, MemberId, MemberPackageId | N—1 `ClassSession`, `UserAccount`, `MemberPackage`; 1—1 `Attendance`, 1—N `WorkoutResult` | `EnrollmentStatus` | state machine §4; ràng buộc #1–#4 (Design v2 §3) |
| `Attendance` | Scheduling | `AttendanceId` (uuid) | EnrollmentId (unique), CheckInTime | 1—1 `Enrollment` | `AttendanceStatus` | state machine §4 (đã sửa 09/09/2026, thêm nhánh Absent); bỏ `session_id`/`member_id` 10/09/2026 (3) — suy ra qua `Enrollment`, không denormalize |
| `WorkoutPlan` | Training | `PlanId` (uuid) | MemberId, CoachId, RelationshipId, Goal, Level | N—1 `UserAccount` (2 phía), `CoachMemberRelationship`; 1—N `WorkoutPlanItem` | — | chỉ tạo được khi quan hệ ACTIVE (BR-23) |
| `WorkoutPlanItem` | Training | `ItemId` (uuid) | PlanId, Exercise, Sets, Reps | N—1 `WorkoutPlan` | — | |
| `WorkoutResult` | Training | `ResultId` (uuid) | EnrollmentId, CoachId, ProgressNote, CoachComment | N—1 `Enrollment`, `UserAccount` (coach) | — | chỉ Coach dạy buổi đó mới ghi được (BR-24); chỉ tạo được khi `Enrollment.Status = Confirmed` (BR mới, xem §7); bỏ `session_id`/`member_id` 10/09/2026 (3) — suy ra qua `Enrollment`, đảm bảo Member thực sự có đăng ký session đó |
| `Invoice` | Payment | `InvoiceId` (uuid) | InvoiceNumber (unique), MemberId, IssuedByUserId, MemberPackageId (nullable), TotalAmount | N—1 `UserAccount` (2 phía), `MemberPackage`; 1—N `InvoiceItem`, `Payment`, `PaymentAdjustment` | `InvoiceStatus` | state machine §4; không bao giờ bị xóa (BR-40); invoice_number unique BR-58 |
| `InvoiceItem` | Payment | `ItemId` (uuid) | InvoiceId, Description, Amount, RelatedEntityType | N—1 `Invoice` | `InvoiceItemRelatedEntityType` | |
| `Payment` | Payment | `PaymentId` (uuid) | InvoiceId, Amount, Method, ReferenceCode, ReceivedByUserId | N—1 `Invoice`, `UserAccount`; 1—N `PaymentAdjustment` | `PaymentMethod`, `PaymentStatus` | tổng SUCCESS không vượt Invoice.TotalAmount (BR-41) |
| `PaymentAdjustment` | Payment | `AdjustmentId` (uuid) | InvoiceId, PaymentId (nullable), Type, Amount, Reason, RequestedByUserId, ApprovedByUserId | N—1 `Invoice`, `Payment` (nullable), `UserAccount` (2 phía) | `PaymentAdjustmentType`, `PaymentAdjustmentStatus` | state machine §4; Manager duyệt, không tự duyệt (BR-42) |
| `Notification` | Notification | `NotificationId` (uuid) | UserId, Channel, SourceEventType, SourceEntityId (nullable), Message | N—1 `UserAccount` | `NotificationChannel`, `NotificationSourceEventType`, `NotificationStatus` | MVP: lưu trong DB, không gửi SMS/email thật (§1.3) |
| `AiLog` | AI | `LogId` (uuid) | UserId, QueryType, InputPayload, ResponsePayload, ResponseTimeMs | N—1 `UserAccount` | — | `QueryType` là chuỗi tự do (vd `WORKOUT_SUGGESTION`), không phải enum kín |
| `AuditLog` | Audit | `AuditId` (uuid) | UserId, Action, TargetEntity, TargetId, OldValue, NewValue | N—1 `UserAccount` | — | `Action` là chuỗi tự do (vd `UPDATE_PACKAGE_STATUS`), không phải enum kín |
| `GymCheckIn` | Scheduling | `CheckInId` (uuid) | MemberId, CheckedInByUserId, CheckInTime | N—1 `UserAccount` (2 phía: member, receptionist) | — | Mới 18/09/2026. Không qua `Class`/`Enrollment`/`Attendance`; điều kiện ≥1 `MemberPackage` Active (BR-64); không trừ `RemainingSessions`; chỉ Receptionist tạo được |

---

## 3. Enum đã chốt

> Đây là nơi DUY NHẤT định nghĩa enum — ERD (`Center-Management-System-Design-v2.md` §1) chỉ **tham chiếu** tên enum, không lặp lại danh sách giá trị. Không định nghĩa lại rải rác trong code/docs khác.
>
> **Quy ước:** tên member enum trong C# viết `PascalCase` (đúng convention §5.4). Chuỗi lưu DB / trả về qua API dùng `UPPER_SNAKE_CASE` (khớp toàn bộ giá trị mẫu đã có sẵn trong ERD/Business Rules trước đây) — ví dụ `MemberPackageStatus.PendingPayment` ↔ chuỗi `"PENDING_PAYMENT"`. Cơ chế serialize cụ thể (`JsonStringEnumConverter` + naming policy, hay map thủ công) **chưa chốt** — xem Open Questions.
>
> **Cập nhật 09/09/2026:** trước đó chỉ có 6/19 enum được liệt kê (5 enum còn lại toàn dấu `?`), và `UserRole` ghi giá trị không khớp ERD (`CenterManager` vs ERD ghi `MANAGER`). Đã điền đầy đủ 19 enum theo đúng giá trị đã dùng thống nhất trong ERD v2 / `entity-field-purpose.md` / Business Rules v1.2, và sửa `UserRole` cho khớp ERD.

> **Lưu ý naming:** cột "Dùng ở field" bên dưới dùng tên **property C#** `PascalCase` (đảo lại 11/09/2026 — xem §5.4; trước đó 10/09/2026 từng ghi `snake_case`); tên Entity trước dấu `.` (`Role`, `UserAccount`...) và tên Enum vẫn giữ `PascalCase`. Cột DB tương ứng vẫn `snake_case` (không đổi), tự động map qua `EFCore.NamingConventions`.

> **Cập nhật 10/09/2026 (2):** thêm enum `ExternalAuthProvider` (mới, phục vụ `UserExternalLogin` — xem §2); sửa 2 dòng "Dùng ở field" của `UserRole`/`UserStatus` từ `User.*` sang `UserAccount.*` cho khớp việc tách entity.

| Enum (C#) | Giá trị (PascalCase) | Dùng ở field | Ghi chú |
|---|---|---|---|
| `UserRole` | `SystemAdministrator, CenterManager, Coach, Member, Receptionist` | `Role.RoleName`, `UserAccount.RoleId` (FK), JWT role claim | **5 role theo Business Rules v1.2 (BR-2/BR-3), cập nhật 11/09/2026** — bổ sung `SystemAdministrator`, tách khỏi `CenterManager`; chuỗi DB tương ứng `SYSTEM_ADMINISTRATOR`. ERD trước đây ghi `MANAGER` — chuẩn hoá về `CENTER_MANAGER` để khớp tên enum |
| `UserStatus` | `Active, Banned, Deactivated` | `UserAccount.Status` | Không xoá cứng user (giữ lịch sử Payment/Attendance) |
| `ExperienceLevel` | `Beginner, Intermediate, Advanced` | `MemberTrainingProfile.ExperienceLevel` | |
| `RelationshipSourceType` | `ClassBased, Personal, AssignedByManager` | `CoachMemberRelationship.SourceType` | |
| `RelationshipStatus` | `Active, Ended` | `CoachMemberRelationship.Status` | Chỉ 1 quan hệ `Active` giữa 1 cặp Coach–Member tại 1 thời điểm (ràng buộc #7) |
| `MemberPackageStatus` | `PendingPayment, Active, Expired, Cancelled` | `MemberPackage.Status` | State machine: §4 / Design v2 §2.1 |
| `ClassStatus` | `Active, Archived` | `Class.Status` | |
| `ClassSessionStatus` | `Scheduled, Rescheduled, Cancelled, Completed` | `ClassSession.Status` | Chưa có state diagram riêng — xem §4 |
| `EnrollmentStatus` | `Confirmed, CancelledOnTime, CancelledLate` | `Enrollment.Status` | State machine: §4 / Design v2 §2.2 |
| `AttendanceStatus` | `Present, Absent, NoShow` | `Attendance.Status` | `Present`/`Absent` ghi tay, `NoShow` do `AttendanceFinalizerJob` tự sinh (BR-53). State machine: §4 / Design v2 §2.2 |
| `InvoiceStatus` | `Issued, PartiallyPaid, Paid, Void` | `Invoice.Status` | State machine: §4 / Design v2 §2.3 |
| `InvoiceItemRelatedEntityType` | `Package, ClassFee, Penalty` | `InvoiceItem.RelatedEntityType` | |
| `PaymentMethod` | `Cash, Card, Transfer, EWallet` | `Payment.Method` | MVP ghi nhận thủ công, không qua cổng thật (§1.3) |
| `PaymentStatus` | `Pending, Success, Failed` | `Payment.Status` | Chỉ `Success` tính vào tổng đã thu (BR-41) |
| `PaymentAdjustmentType` | `Refund, Correction, Discount` | `PaymentAdjustment.Type` | |
| `PaymentAdjustmentStatus` | `Requested, Approved, Rejected, Completed` | `PaymentAdjustment.Status` | State machine: §4 / Design v2 §2.4 |
| `NotificationChannel` | `InApp, Email, Sms` | `Notification.Channel` | MVP: chỉ `InApp` thật sự hoạt động, `Email`/`Sms` chỉ lưu log (§1.3) |
| `NotificationSourceEventType` | `ClassCancelled, ScheduleChanged, PackageExpiring, PaymentReceived` | `Notification.SourceEventType` | |
| `NotificationStatus` | `Pending, Sent, Failed, Read` | `Notification.Status` | |
| `ExternalAuthProvider` | `Google` | `UserExternalLogin.Provider` | Mới 10/09/2026 (2). Hiện chỉ `Google`; thêm provider khác sau (Facebook...) không cần đổi entity |

*(`AiLog.QueryType` và `AuditLog.Action` là chuỗi tự do, không phải enum kín — xem ghi chú ở bảng Entity mục 2.)*

---

## 4. State Machine đã chốt

> Sơ đồ Mermaid đầy đủ nằm ở `Center-Management-System-Design-v2.md` §2 — mục này chỉ tóm tắt luồng để tra nhanh, không lặp lại toàn bộ diagram (tránh 2 nơi có thể lệch nhau như đã xảy ra với `Attendance`, xem dòng dưới).
>
> **Cập nhật 09/09/2026:** trước đó mục này chỉ có 3 dòng placeholder `? → ? → ?` dù Design v2 §2 đã có diagram Mermaid đầy đủ từ trước — đã đồng bộ lại. Đồng thời phát hiện và sửa 1 lỗi thật: diagram `Attendance` trong Design v2 §2.2 thiếu hẳn nhánh `Absent` dù ERD và `entity-field-purpose.md` đều liệt kê `Absent` là 1 trong 3 giá trị hợp lệ của `AttendanceStatus` (đã bổ sung, xem Design v2 §2.2).

- **MemberPackage**: `PendingPayment → Active → (Expired | Cancelled)`, hoặc `PendingPayment → Cancelled` nếu hết hạn giữ chỗ trước khi thanh toán. Diagram: Design v2 §2.1.
- **Enrollment**: `Confirmed → (CancelledOnTime | CancelledLate)`, hoặc `Confirmed → [chuyển sang Attendance khi session kết thúc]`. Diagram: Design v2 §2.2.
- **Attendance**: `[Attendance] → (Present | Absent | NoShow)` — `Present`/`Absent`: Coach/Receptionist ghi tay; `NoShow`: `AttendanceFinalizerJob` tự sinh sau `end_at_utc` nếu không check-in và không có `Absent` ghi tay (BR-53). Diagram: Design v2 §2.2 (**đã sửa 09/09/2026** — thêm nhánh `Absent`).
- **Invoice**: `Issued → (PartiallyPaid → Paid | Paid)`; `Paid` giữ nguyên khi có Adjustment `Completed` (chỉ ghi thêm dòng, BR-40); `Issued → Void` chỉ khi Adjustment loại `Correction` toàn phần được duyệt. Diagram: Design v2 §2.3.
- **PaymentAdjustment**: `Requested → (Approved → Completed | Rejected)` — Manager duyệt, không được tự duyệt yêu cầu mình tạo (BR-42). Diagram: Design v2 §2.4.
- **ClassSession**: `Scheduled → (Rescheduled | Cancelled | Completed)` — **chưa có state diagram chi tiết trong Design v2, cần bổ sung** (xem Open Questions §7).
- **Payment**: `Pending → (Success | Failed)` — không có diagram riêng, được tổng hợp qua vòng đời Invoice (Design v2 §2.3).

---


## 5. Quy ước chung (Conventions)

### 5.1 ID
- Kiểu ID: `Guid` (uuid) cho mọi entity — **không** dùng auto-increment `int` để tránh lộ số lượng record / trùng khi merge dữ liệu demo.
- Sinh ở tầng nào: <DB default `gen_random_uuid()` hay generate ở app layer trước khi insert?> — chốt trong họp.

### 5.2 Tiền tệ (Money)
- Đơn vị: VND, lưu dạng số nguyên (không có phần thập phân) — **không dùng `float`/`double`**, dùng `decimal`.
- Không lưu ký hiệu tiền tệ trong DB (mặc định VND toàn hệ thống, MVP chưa multi-currency).
- Format hiển thị (dấu chấm/phẩy ngăn cách hàng nghìn) là việc của FE, không phải BE.

### 5.3 Thời gian (Timezone)
- Lưu DB: UTC (`timestamptz` trong Postgres).
- Hiển thị: convert sang `Asia/Ho_Chi_Minh` (UTC+7) ở tầng FE (hoặc BE trả kèm cả UTC, FE tự convert) — chốt 1 cách duy nhất trong họp, tránh chỗ convert chỗ không.
- Định dạng truyền qua API: ISO 8601 (`yyyy-MM-ddTHH:mm:ssZ`).

### 5.4 Naming
- Entity/Class: PascalCase (C# convention) — vd `UserAccount`, `ClassSession`.
- **Field/Property (thuộc tính entity trong code C#): `PascalCase`** — vd `UserId`, `ClassId`, `FullName`. **Đã đổi lại 11/09/2026** (10/09/2026 từng đổi sang `snake_case`, nay đảo ngược về đúng convention chuẩn của C#); áp dụng cho toàn bộ field liệt kê ở §2 (cột PK/Field chính) và cột "Dùng ở field" ở §3.
- **Cột DB (Postgres): vẫn `snake_case`** — vd `user_id`, `class_id`, `full_name` — không đổi so với trước, và **không cần tự map tay**: package `EFCore.NamingConventions` + `.UseSnakeCaseNamingConvention()` (cấu hình 1 dòng ở `SportHub.API/Program.cs`, `AddDbContext<SportHubDbContext>`) tự động convert property `PascalCase` → tên cột `snake_case` khi EF Core sinh SQL/migration. Raw SQL viết tay (check constraint, index filter trong `SportHubDbContext.cs`) vẫn tham chiếu tên cột `snake_case` như cũ, không cần sửa.
- Enum type name (`UserRole`...) và Entity/Class name không đổi, vẫn PascalCase.
- Enum member (C#): PascalCase (không đổi — xem §3).
- API route: `kebab-case` hoặc `camelCase`? — chốt 1 kiểu, ví dụ `/api/membership-packages`.
- DTO suffix: `...Request` / `...Response` (không dùng Entity trực tiếp làm response). Naming field bên trong DTO/JSON request-response **chưa chốt** (camelCase theo convention JS/TS phổ biến, hay `PascalCase`/`snake_case` đồng bộ với entity) — xem Open Questions §7.

### 5.5 Soft delete vs hard delete
- Mặc định: soft delete (`is_deleted` / `deleted_at`) cho entity có liên quan lịch sử (Payment, Attendance, Enrollment...).
- Entity thuần cấu hình (Room, Subject...) có thể hard delete nếu chưa được tham chiếu.
- Chốt danh sách entity nào soft-delete trong họp.

---

### 5.6 Bảo mật login và hiệu lực JWT — đặc tả bổ sung 18/09/2026

Nguồn nghiệp vụ: [Business Rules v1.3](SportManagement_BusinessRules.docx), BR-2–7, BR-35, BR-38, BR-49, BR-59–60. Chi tiết file/code/test: [plan bảo mật login](login-security-hardening-plan.md). Mục này ghi quyết định triển khai của task theo yêu cầu người dùng, không phải biên bản PO duyệt hoặc xác nhận code đã đạt nghiệm thu.

- **Lỗi login:** email không tồn tại, credential/hash thiếu hoặc password sai đều trả `401 invalid_credentials`, message `Invalid email or password`. BR-60 không bắt buộc trả 409; không dùng `password_not_set` để tiết lộ tài khoản chưa có password.
- **Timing:** login hợp lệ về DTO thực hiện một lần BCrypt thật hoặc dummy cùng cost, trước khi kết luận credential không hợp lệ. Không đặt password/credential mới khi dummy verify. Mục tiêu giảm khác biệt xử lý, không cam kết thời gian tuyệt đối bằng nhau.
- **Rate limit:** policy riêng `auth-login`, 10 request/IP/1 phút fixed window, không queue; vượt quota trả `429 too_many_requests`. Đây là cấu hình kỹ thuật ban đầu, không phải số liệu từ BR. Register giữ quota riêng. Limiter theo instance; khi có proxy phải cấu hình trusted proxy, không tin trực tiếp header client.
- **BR-6 trên request:** chỉ account `Active` được dùng JWT tại thời điểm kiểm tra DB sau validation token. Áp dụng cả 5 role, kể cả SystemAdministrator. Không cache trạng thái ở MVP. Account Banned/Deactivated/không tồn tại bị từ chối bằng challenge `401 unauthorized`; Active thiếu role vẫn `403 forbidden`. Login có password đúng nhưng account không Active giữ lỗi 403 như hợp đồng hiện tại.
- **Hiệu lực:** sau khi khóa commit, request xác thực tiếp theo bị chặn; không hủy request đã chạy. Mở khóa cho phép token cũ còn hạn dùng lại. Thu hồi token vĩnh viễn/security stamp/logout-all/kết nối dài thuộc scope riêng.
- **Đầy đủ BR-6/BR-7:** chỉ SystemAdministrator được khóa/mở khóa; không tự khóa hoặc khóa SystemAdministrator hoạt động cuối cùng; thao tác phải có Audit Log gồm actor, action, target, thời điểm và lý do. Các kiểm soát tại endpoint đổi trạng thái thuộc task quản lý tài khoản, không được báo hoàn thành chỉ từ JWT hook. Rate limit không tự đổi status thành Banned.
- **BR-35/BR-38:** yêu cầu API tiêu chuẩn trung bình ≤ 200 ms và HTTPS vẫn áp dụng. Đo overhead BCrypt/query DB, báo điều kiện đo và trường hợp chưa đạt; không tự giảm bảo mật hoặc tuyên bố login được miễn yêu cầu. Không coi HTTPS redirect đơn lẻ là bằng chứng deployment đã an toàn.
- **Kiến trúc/hợp đồng hiện tại:** wiring kiểm tra account ở API; BuildingBlocks không tham chiếu Identity. Giữ schema DB và token hiện có: user ID đọc từ `ClaimTypes.NameIdentifier`, role hiện phát theo tên enum PascalCase để khớp policy. Quy ước enum tổng thể ở §3 chưa được đổi bởi task này; không tự chuyển JWT sang UPPER_SNAKE_CASE hoặc `sub` chỉ dựa trên ví dụ thiết kế cũ.

Trạng thái tại lần cập nhật này (18/09/2026, sau khi có bằng chứng test):

- **Đã triển khai và đã kiểm chứng bằng test tự động** (`backend/SportHub.Security.Tests`, 65 test pass trên PostgreSQL 16-alpine thật qua Testcontainers): lỗi chung 401 cho cả 3 nhánh thất bại; dummy verification (`IPasswordHasher.VerifyDummy`, BCrypt cost 11 khớp `Hash`); policy `auth-login` 10 req/IP/phút độc lập với `auth-register`; kiểm tra `IsActiveAsync` trong `OnTokenValidated` áp dụng cho cả 5 role.
- **BR-35 — đo được, chưa kết luận cho môi trường production.** Máy đo: Windows 11, 20 logical CPU, PostgreSQL 16-alpine (Testcontainers), BCrypt cost 11, 30 request tuần tự sau 5 warm-up, concurrency 1, mỗi request một partition rate limit riêng. Kết quả: login email không tồn tại mean 149.7 ms / p95 192.9 ms; login sai password mean 137.9 ms / p95 159.5 ms; login thành công mean 130.0 ms / p95 152.1 ms; GET endpoint protected mean 3.4 ms / p95 4.7 ms. Thành phần: một lần BCrypt ≈ 133 ms, một query `IsActiveAsync` ≈ 1.1 ms. Mean của login vẫn dưới 200 ms nhưng **biên an toàn mỏng** — p95 đã chạm 193 ms; cần đo lại trên phần cứng deploy thật trước khi coi BR-35 là đạt. Không hạ BCrypt cost và không bỏ query `IsActiveAsync` để làm đẹp số liệu.
- **Chưa đáp ứng, thuộc task khác — không được báo hoàn thành:** phần còn lại của BR-6/BR-7 tại endpoint đổi trạng thái (chỉ SystemAdministrator được khóa/mở khóa, cấm tự khóa, bảo vệ SystemAdministrator Active cuối cùng, Audit Log kèm lý do trong cùng transaction); thu hồi token vĩnh viễn (security stamp/token version, logout-all, refresh token, WebSocket); nghiệm thu HTTPS thật tại deployment (BR-38) — test chạy trên HTTP của TestServer nên **không** phải bằng chứng cho mục này.

Tham chiếu mã BR trong plan là bản đồ truy vết, không thêm hay đánh số lại BR chính thức.

## 6. Quy tắc xử lý khi docs mâu thuẫn / thiếu

1. **Không tự thêm entity/field/enum mới** để "cho code chạy" — nếu thiếu, thêm vào mục **Open Questions** bên dưới và hỏi người phụ trách domain đó (BA/team lead) trước khi code.
2. Nếu 2 tài liệu mâu thuẫn nhau, ưu tiên theo thứ tự ở mục 0 — nhưng vẫn phải báo lại trong nhóm để cập nhật doc gốc bị sai, không âm thầm code theo rồi thôi.
3. Mọi thay đổi entity/enum/state đã chốt (mục 2/3/4) phải được cập nhật vào file này **trong cùng buổi** — không để trôi qua PR review mới biết.
4. AI (nếu dùng Claude/Copilot để code) **phải đọc file này trước khi sinh code liên quan đến entity/DTO/enum** — nếu file này chưa đủ thông tin, dừng và hỏi thay vì đoán.

---

## 7. Open Questions (chưa chốt — cần họp quyết định)

- [ ] Cơ chế serialize enum (JSON API response / lưu string trong DB): dùng `JsonStringEnumConverter` với naming policy `UPPER_SNAKE_CASE`, hay map thủ công ở DTO layer? (phát sinh khi điền §3 ngày 09/09/2026)
- [ ] `ClassSession` chưa có state diagram chi tiết (chỉ có 4 giá trị liệt kê trong ERD: `Scheduled, Rescheduled, Cancelled, Completed`) — cần vẽ rõ điều kiện chuyển trạng thái, đặc biệt `Rescheduled` (có tạo `ClassSession` mới hay chỉ đổi field tại chỗ — xem `RescheduledFromSessionId`)
- [ ] Naming field trong DTO/JSON API (request/response body) **vẫn CHƯA chốt** — property C# nay là `PascalCase` (§5.4, đảo lại 11/09/2026) nhưng đó là naming ở tầng entity, không tự quyết định naming JSON; cần chốt `camelCase` (phổ biến với FE Next.js/TS) hay đồng bộ `PascalCase`/`snake_case` với entity trước khi code Controller/DTO, tránh code xong rồi đổi lại
- [ ] `UserExternalLogin.RefreshToken` MVP chưa mã hoá tại rest — cần chốt có mã hoá (vd Data Protection API) trước khi lưu data thật hay chấp nhận nợ kỹ thuật cho scope đồ án (phát sinh khi thêm entity 10/09/2026 (2))
- [x] Business rule Google link và login password đã có chính thức ở BR-59/BR-60 trong `SportManagement_BusinessRules.docx` v1.3; đóng câu hỏi thiếu văn bản sau khi đối chiếu 18/09/2026. Đây không phải xác nhận code Google Login đã hoàn thành.
- [ ] `WorkoutResult` chỉ nên tạo được khi `Enrollment.Status = Confirmed` (member chưa hủy đăng ký) — FK `EnrollmentId` mới (10/09/2026 (3)) chỉ đảm bảo Enrollment *tồn tại*, không đảm bảo còn hợp lệ; cần chép rule này chính thức vào `SportManagement_BusinessRules_v1.2.docx`, và cân nhắc có nên yêu cầu thêm `Attendance.Status = Present` mới cho ghi WorkoutResult hay không (chưa quyết định)
- [ ] Phạm vi quyền `SystemAdministrator` ngoài BR-2 (tạo tài khoản `SystemAdministrator`/`CenterManager`/`Coach`/`Receptionist`, gán vai trò) và BR-6 (khóa/mở khóa tài khoản) — có được xem báo cáo doanh thu (`/reports/*`), Audit Log, hay cấu hình hệ thống (`cancellation_deadline_hours`...) hay không? Business Rules v1.2 chưa nói rõ; RBAC matrix tạm để `SystemAdministrator` = ❌ cho các mục ngoài 2 việc trên (xem `Center-Management-System-Design-v2.md` §5, cập nhật 11/09/2026) (phát sinh khi bổ sung role 11/09/2026)
- [ ] <câu hỏi khác>

---

## 8. Changelog

| Ngày | Thay đổi | Người sửa |
|---|---|---|
| 18/09/2026 | **Chốt 4 bộ môn chính thức** (Gym/Fitness, Personal Training, Yoga, Group X — §1.1) cho hướng "trung tâm thể thao đa bộ môn"; xác nhận đa chi nhánh vẫn ngoài scope (§1.3). Thêm entity mới `GymCheckIn` (§2, module Scheduling, BR-64 trong `SportManagement_BusinessRules.docx`) vì Gym không đặt lịch qua Class — Lễ tân điểm danh trực tiếp, điều kiện ≥1 MemberPackage Active, không trừ buổi. Chi tiết: `claude/citigym-multidiscipline-scope-plan.md` (Project doc). | Hồ Lê Thiên An (qua Claude) |
| 18/09/2026 | Triển khai §5.6: thêm `IPasswordHasher.VerifyDummy` (BCrypt cost 11) để mọi login hợp lệ DTO tốn đúng một phép BCrypt; thêm policy rate limit `auth-login` (10 req/IP/phút, 429 `too_many_requests`, quota tách khỏi register); thêm `IUserAccountRepository.IsActiveAsync` + hook `OnTokenValidated` tại `SportHub.API` để chặn JWT của tài khoản bị khóa/xóa (BR-6, phần request). Thêm project `SportHub.Security.Tests` (65 test, PostgreSQL thật qua Testcontainers). Cập nhật trạng thái §5.6 kèm số đo BR-35 và danh sách hạng mục CHƯA đạt. | Hồ Lê Thiên An (qua Claude) |
| 18/09/2026 | Đối chiếu Business Rules v1.3: sửa nguồn hiện hành và mã unique phone/role; đóng câu hỏi BR-59/60 đã có văn bản; bổ sung §5.6 và dẫn plan triển khai timing, rate limit, hiệu lực JWT. Ghi đầy đủ ranh giới BR-6/7, yêu cầu BR-35/38 và trạng thái chưa nghiệm thu. | Codex theo yêu cầu người dùng |
| 12/09/2026 | **Chính thức hoá module `Notification` và `Audit`** (§2, §7): `Notification`/`AuditLog` trước đây chưa gán module (Open Question cũ) — nay tách thành 2 module riêng thay vì gộp vào 6 module sẵn có, vì bắt đầu tách `SportHub.Repository`/`SportHub.Service` thành project riêng theo module (`docs/claude-plans/monolith-refactor-plan.md`) nên mỗi entity bắt buộc phải thuộc đúng 1 project/module. `Audit` tách riêng khỏi `Identity`/`BuildingBlocks` vì `AuditLog.UserId` là FK thật sang `UserAccount`, đặt ở `BuildingBlocks` (tầng hạ tầng dùng chung, không phụ thuộc module nghiệp vụ nào) sẽ gây phụ thuộc ngược. Cập nhật cột "Module sở hữu" (§2) cho 2 entity này, xoá Open Question tương ứng (§7). | Hồ Lê Thiên An (qua Claude) |
| 11/09/2026 | **Bổ sung role `SystemAdministrator` (5 role)** (§2, §3): đồng bộ Entity `Role` và enum `UserRole` theo Business Rules v1.2 (BR-2, BR-3) — trước đó doc/enum chỉ có 4 role (`CenterManager, Coach, Member, Receptionist`), chưa khớp Business Rules đã có `SystemAdministrator` từ trước. Quyền tạo tài khoản Staff/Coach (BR-2) và khóa/mở khóa tài khoản (BR-6) chuyển từ `CenterManager` sang `SystemAdministrator` — đồng bộ RBAC matrix + actor API trong `Center-Management-System-Design-v2.md` §4.1/§5. Thêm Open Question mới (§7): phạm vi quyền `SystemAdministrator` ngoài 2 việc trên chưa được Business Rules chốt rõ. **Chỉ sửa doc ở bước này — migration/enum trong code (`UserRole.cs`, `AddRoleSeedData`) chưa cập nhật.** | Hồ Lê Thiên An (qua Claude) |
| 11/09/2026 | **Đảo ngược naming property/field entity C# (§5.4) từ `snake_case` về `PascalCase`** (vd `user_id` → `UserId`, `class_id` → `ClassId`) — đúng convention chuẩn của C#, đảo ngược quyết định 10/09/2026. Cột **DB** (Postgres) **không đổi**, vẫn `snake_case` như trước — thêm package `EFCore.NamingConventions` + gọi `.UseSnakeCaseNamingConvention()` ở `Program.cs` để EF Core tự map property PascalCase ↔ cột snake_case, nên raw SQL viết tay (check constraint, filter) trong `SportHubDbContext.cs` không cần sửa. Áp dụng lại toàn bộ tên field ở bảng Entity (§2, cột PK/Field chính) và cột "Dùng ở field" trong bảng Enum (§3); cập nhật §7 (Open Questions) cho khớp. Đồng bộ 2 file liên quan: `entity-field-purpose.md` (đổi tương tự), `Center-Management-System-Design-v2.md` §1 (chỉ ghi chú thêm — ERD/bảng vật lý vẫn giữ `snake_case` vì đó là tên cột DB, không đổi). **Lần này code sửa TRƯỚC** (`SportHub.Repository/Entities/*.cs`, `SportHubDbContext.cs`, `Program.cs`, `SportHub.Repository.csproj`), doc cập nhật đồng bộ ở bước này (khác quy trình "doc trước, code sau" của lần đổi 10/09/2026). | Hồ Lê Thiên An (qua Claude) |
| 10/09/2026 | **Chuẩn hoá `Attendance`/`WorkoutResult`** (§2): `Attendance` bỏ `session_id`/`member_id`, chỉ giữ `enrollment_id` (thêm `UNIQUE` — enforce đúng quan hệ 1—1 với `Enrollment` mà ERD đã ghi nhưng trước đó chưa có ràng buộc DB). `WorkoutResult` đổi `session_id` + `member_id` (2 FK độc lập, không ràng buộc lẫn nhau) thành 1 FK `enrollment_id` — đảm bảo ở tầng DB rằng kết quả tập chỉ ghi được cho Member thực sự có đăng ký (Enrollment) session đó, giữ nguyên `coach_id`. Thêm Open Question mới (§7): có bắt buộc `Enrollment.status = Confirmed` (và cân nhắc `Attendance.status = Present`) mới cho tạo `WorkoutResult` hay không — cần chốt BR chính thức. Đồng bộ ERD (`Center-Management-System-Design-v2.md` §1, thêm constraint #17 ở §3) và `entity-field-purpose.md`. | Hồ Lê Thiên An (qua Claude) |
| 10/09/2026 | **Tách entity `User` thành 4 entity** (§2): `UserAccount` (định danh + vòng đời: email, role_id, status), `UserCredential` (auth nội bộ: password_hash, nullable, 1—1), `UserProfile` (hiển thị: full_name, phone, 1—1), `UserExternalLogin` (auth ngoài, vd Google, 1—N — thêm mới để hỗ trợ đăng nhập Google, nay là flow bắt buộc). Cập nhật toàn bộ cột "Quan hệ chính" của 13 entity khác (MemberTrainingProfile, CoachMemberRelationship, MemberPackage, Enrollment, Attendance, WorkoutPlan, WorkoutResult, Invoice, Payment, PaymentAdjustment, Notification, AiLog, AuditLog) từ tham chiếu `User` sang `UserAccount` — tên cột FK (`member_id`, `coach_id`, `issued_by_user_id`...) không đổi. Thêm enum `ExternalAuthProvider` (§3, giá trị `Google`) và sửa 2 dòng "Dùng ở field" của `UserRole`/`UserStatus` sang `UserAccount.*`. Thêm 2 Open Question mới (§7): mã hoá `refresh_token` và BR chính thức cho luồng Google login. **Chỉ sửa doc — ERD (`Center-Management-System-Design-v2.md` §1), `entity-field-purpose.md`, và code C#/EF Core sẽ cập nhật ở bước sau.** | Hồ Lê Thiên An (qua Claude) |
| 10/09/2026 | Bổ sung rule unique tường minh cho các field trước đây chưa ghi rõ: `User.phone` (BR-54), `Role.role_name` (BR-55), `MembershipPackage.name` (BR-56), `Room.name` (BR-57), `Invoice.invoice_number` (BR-58, formal hoá lại constraint #5 đã có) — cập nhật `SportManagement_BusinessRules_v1.2.docx` (bump nội bộ "1.2 draft 2", giữ nguyên tên file) với rule mới + mục L (Unique Constraints Summary) tổng hợp toàn bộ field/composite unique. Đồng bộ: đánh dấu `UK` cho các field này trong ERD (`Center-Management-System-Design-v2.md` §1) + thêm ràng buộc #11–#14 vào bảng DB constraint (§3); cập nhật cột "Field chính" ở bảng Entity (§2) bên dưới với tag `(unique)`. | Hồ Lê Thiên An |
| 10/09/2026 | Đổi convention naming field/property entity (§5.4) từ `PascalCase` sang `snake_case` (vd `UserID` → `user_id`, `ClassID` → `class_id`) — áp dụng lại toàn bộ tên field ở bảng Entity (§2) và cột "Dùng ở field" trong bảng Enum (§3). Entity/Class name và Enum type name **không đổi**, vẫn `PascalCase`. Đồng bộ 2 file liên quan: `entity-field-purpose.md`, `Center-Management-System-Design-v2.md` §1 (ERD)/§3 (phần prose tham chiếu field). **Chỉ sửa doc, chưa đụng code** — code C#/EF Core sẽ cập nhật ở bước sau khi doc đã ổn định hoàn toàn. Thêm Open Question mới (§7) về naming field trong DTO/JSON API (chưa chốt camelCase hay snake_case). | Hồ Lê Thiên An |
| 09/09/2026 | Điền đầy đủ Entity (§2, +11 entity), Enum (§3, 6→19 enum, sửa `UserRole` khớp ERD), State Machine (§4, đồng bộ từ Design v2 §2) — trước đó phần lớn là placeholder `?`/nháp dù ERD và diagram thật đã có sẵn trong `Center-Management-System-Design-v2.md`. Đồng thời sửa 1 lỗi thật: state diagram `Attendance` (Design v2 §2.2) thiếu nhánh `Absent` dù ERD/`entity-field-purpose.md` đều liệt kê 3 giá trị (Present/Absent/NoShow) — đã bổ sung. Cập nhật ERD (Design v2 §1): mọi field status/type đổi từ `string` sang tên enum tương ứng (tham chiếu SSOT §3), không lặp lại danh sách giá trị. | Hồ Lê Thiên An |
| 09/09/2026 | Hạ Flow 6 (AI assistant) từ "optional nhóm chọn làm" (§1.2) xuống "stretch — chỉ làm nếu còn thời gian" (§1.4 mới); cập nhật đồng bộ `Requirements.md`, `Center-Management-System-Design-v2.md` §4.4, `entity-field-purpose.md`, `README.md`, và đánh dấu BR-27/BR-28/BR-29 trong `SportManagement_BusinessRules_v1.2.docx` | Hồ Lê Thiên An |
| 08/09/2026 | Tạo sườn ban đầu | Hồ Lê Thiên An |
| 08/09/2026 | Thêm `Extensions/CorsExtensions.cs` (policy `Default`, đọc `Cors:AllowedOrigins`), `Extensions/SwaggerExtensions.cs`, `Extensions/JwtExtensions.cs` (stub) + `Middleware/` skeleton; bật CORS cho FE `http://localhost:3000` trong `Program.cs` | Hồ Lê Thiên An |
| 08/09/2026 | Nâng target framework 3 project backend từ `net8.0` lên `net10.0` (LTS) — .NET 8/9 EOL 10/11/2026; update NuGet: EFCore/JwtBearer 10.0.11, Npgsql.EFCore.PostgreSQL 10.0.3, Swashbuckle 10.2.3; Dockerfile SDK/runtime image → 10.0 | Hồ Lê Thiên An |
| 08/09/2026 | Sửa reference ở mục 0 từ `SportManagement_BusinessRules_v1.1.docx` (stale, file đã lên v1.2) → `SportManagement_BusinessRules_v1.2.docx`, khớp với `Center-Management-System-Design-v2.md` | Hồ Lê Thiên An |
