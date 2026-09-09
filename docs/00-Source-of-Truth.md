# 00 — Source of Truth (SSOT)

> Mục đích: 1 nơi duy nhất để AI / FE / BE tra cứu khi có mâu thuẫn giữa các tài liệu.
> Nếu file này và một doc khác nói khác nhau → **file này thắng**, trừ khi có ghi chú "xem chi tiết tại...".
> Cập nhật lần cuối: 09/09/2026 — người cập nhật: Hồ Lê Thiên An

---

## 0. Thứ tự ưu tiên tài liệu

Khi có mâu thuẫn, đọc theo thứ tự sau (trên > dưới):

1. `docs/00-Source-of-Truth.md` (file này) — quyết định đã chốt, không tranh cãi lại trong sprint hiện tại
2. `docs/SportManagement_BusinessRules_v1.2.docx` — business rules chi tiết
3. `docs/Center-Management-System-Design-v2.md` — thiết kế kỹ thuật/kiến trúc
4. `docs/Requirements.md` — yêu cầu gốc từ đề bài
5. Mọi thứ khác (Slack/Zalo/note họp miệng) — **không tính là nguồn chính thức** trừ khi được chép lại vào 1 trong 4 file trên

**Quy tắc cứng:** Nếu 2 doc mâu thuẫn và chưa kịp cập nhật file này → dừng lại, hỏi trong nhóm, **không tự thêm/đổi entity, field, hay flow để "cho chạy được"**. Ghi lại câu hỏi vào mục 6 (Open Questions) thay vì tự quyết.

---

## 1. MVP Scope

### 1.1 In-scope (bắt buộc — theo đề bài)

- [ ] Flow 1 — User & Membership management
- [ ] Flow 2 — Class booking & schedule management
- [ ] Flow 3 — Payment & report management

### 1.2 In-scope (optional nhưng nhóm chọn làm)

- [ ] Flow 4 — Training & attendance management
- [ ] Flow 5 — AI workout recommendation

### 1.3 Out-of-scope (ghi rõ để khỏi cãi nhau giữa kỳ)

- [ ] <ví dụ: multi-center / multi-tenant>
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

| Entity | Module sở hữu | PK | Field chính | Quan hệ chính | Enum dùng | Ghi chú |
|---|---|---|---|---|---|---|
| `Role` | Identity | `RoleID` (int) | RoleName | 1—N `User` | `UserRole` | seed data, 4 dòng cố định |
| `User` | Identity | `UserID` (uuid) | FullName, Email, PasswordHash, Phone, RoleID | N—1 `Role`; 1—N hầu hết entity khác (chủ thể thao tác) | `UserStatus` | |
| `MemberTrainingProfile` | Membership | `ProfileID` (uuid) | MemberID (unique), Goal, ExperienceLevel | 1—1 `User` (Member) | `ExperienceLevel` | input bắt buộc cho AI suggestion (BR-26) |
| `CoachMemberRelationship` | Training | `RelationshipID` (uuid) | CoachID, MemberID, SourceType, ClassID (nullable) | N—1 `User` (2 phía) | `RelationshipSourceType`, `RelationshipStatus` | unique khi ACTIVE (ràng buộc #7, BR-23/24) |
| `MembershipPackage` | Membership | `PackageID` (int) | Name, Price, DurationDays, SessionLimit | 1—N `MemberPackage` | — | |
| `MemberPackage` | Membership | `MemberPackageID` (uuid) | MemberID, PackageID, RemainingSessions, Version | N—1 `User`, N—1 `MembershipPackage`; 1—N `Enrollment` | `MemberPackageStatus` | state machine §4; optimistic concurrency qua `Version` |
| `Room` | Scheduling | `RoomID` (int) | Name, Capacity | 1—N `Class`, `ClassSession` | — | |
| `Class` | Scheduling | `ClassID` (int) | Name, Discipline, DefaultRoomID, DefaultCoachID | N—1 `Room`; 1—N `ClassRecurrence`, `ClassSession` | `ClassStatus` | |
| `ClassRecurrence` | Scheduling | `RecurrenceID` (int) | ClassID, DaysOfWeek, StartTimeLocal, EndTimeLocal, Timezone | N—1 `Class`; 1—N `ClassSession` | — | định nghĩa pattern, không phải buổi cụ thể |
| `ClassSession` | Scheduling | `SessionID` (uuid) | ClassID, RecurrenceID (nullable), RoomID, CoachID, StartAtUtc, EndAtUtc, ConfirmedCount | N—1 `Class`, `ClassRecurrence` (nullable), `Room`; 1—N `Enrollment`, `Attendance` | `ClassSessionStatus` | chưa có state diagram riêng — xem §4 |
| `Enrollment` | Scheduling | `EnrollmentID` (uuid) | SessionID, MemberID, MemberPackageID | N—1 `ClassSession`, `User`, `MemberPackage`; 1—1 `Attendance` | `EnrollmentStatus` | state machine §4; ràng buộc #1–#4 (Design v2 §3) |
| `Attendance` | Scheduling | `AttendanceID` (uuid) | EnrollmentID, SessionID, MemberID, CheckInTime | N—1 `Enrollment`, `ClassSession`, `User` | `AttendanceStatus` | state machine §4 (đã sửa 09/09/2026, thêm nhánh Absent) |
| `WorkoutPlan` | Training | `PlanID` (uuid) | MemberID, CoachID, RelationshipID, Goal, Level | N—1 `User` (2 phía), `CoachMemberRelationship`; 1—N `WorkoutPlanItem` | — | chỉ tạo được khi quan hệ ACTIVE (BR-23) |
| `WorkoutPlanItem` | Training | `ItemID` (uuid) | PlanID, Exercise, Sets, Reps | N—1 `WorkoutPlan` | — | |
| `WorkoutResult` | Training | `ResultID` (uuid) | SessionID, MemberID, CoachID, ProgressNote, CoachComment | N—1 `ClassSession`, `User` (2 phía) | — | chỉ Coach dạy buổi đó mới ghi được (BR-24) |
| `Invoice` | Payment | `InvoiceID` (uuid) | InvoiceNumber (unique), MemberID, IssuedByUserID, MemberPackageID (nullable), TotalAmount | N—1 `User` (2 phía), `MemberPackage`; 1—N `InvoiceItem`, `Payment`, `PaymentAdjustment` | `InvoiceStatus` | state machine §4; không bao giờ bị xóa (BR-40) |
| `InvoiceItem` | Payment | `ItemID` (uuid) | InvoiceID, Description, Amount, RelatedEntityType | N—1 `Invoice` | `InvoiceItemRelatedEntityType` | |
| `Payment` | Payment | `PaymentID` (uuid) | InvoiceID, Amount, Method, ReferenceCode, ReceivedByUserID | N—1 `Invoice`, `User`; 1—N `PaymentAdjustment` | `PaymentMethod`, `PaymentStatus` | tổng SUCCESS không vượt Invoice.TotalAmount (BR-41) |
| `PaymentAdjustment` | Payment | `AdjustmentID` (uuid) | InvoiceID, PaymentID (nullable), Type, Amount, Reason, RequestedByUserID, ApprovedByUserID | N—1 `Invoice`, `Payment` (nullable), `User` (2 phía) | `PaymentAdjustmentType`, `PaymentAdjustmentStatus` | state machine §4; Manager duyệt, không tự duyệt (BR-42) |
| `Notification` | *(chưa gán — không thuộc 6 module hiện có ở backend, xem Open Questions)* | `NotificationID` (uuid) | UserID, Channel, SourceEventType, SourceEntityID (nullable), Message | N—1 `User` | `NotificationChannel`, `NotificationSourceEventType`, `NotificationStatus` | MVP: lưu trong DB, không gửi SMS/email thật (§1.3) |
| `AiLog` | AI | `LogID` (uuid) | UserID, QueryType, InputPayload, ResponsePayload, ResponseTimeMs | N—1 `User` | — | `QueryType` là chuỗi tự do (vd `WORKOUT_SUGGESTION`), không phải enum kín |
| `AuditLog` | *(chưa gán — không thuộc 6 module hiện có ở backend, xem Open Questions)* | `AuditID` (uuid) | UserID, Action, TargetEntity, TargetID, OldValue, NewValue | N—1 `User` | — | `Action` là chuỗi tự do (vd `UPDATE_PACKAGE_STATUS`), không phải enum kín |

---

## 3. Enum đã chốt

> Đây là nơi DUY NHẤT định nghĩa enum — ERD (`Center-Management-System-Design-v2.md` §1) chỉ **tham chiếu** tên enum, không lặp lại danh sách giá trị. Không định nghĩa lại rải rác trong code/docs khác.
>
> **Quy ước:** tên member enum trong C# viết `PascalCase` (đúng convention §5.4). Chuỗi lưu DB / trả về qua API dùng `UPPER_SNAKE_CASE` (khớp toàn bộ giá trị mẫu đã có sẵn trong ERD/Business Rules trước đây) — ví dụ `MemberPackageStatus.PendingPayment` ↔ chuỗi `"PENDING_PAYMENT"`. Cơ chế serialize cụ thể (`JsonStringEnumConverter` + naming policy, hay map thủ công) **chưa chốt** — xem Open Questions.
>
> **Cập nhật 09/09/2026:** trước đó chỉ có 6/19 enum được liệt kê (5 enum còn lại toàn dấu `?`), và `UserRole` ghi giá trị không khớp ERD (`CenterManager` vs ERD ghi `MANAGER`). Đã điền đầy đủ 19 enum theo đúng giá trị đã dùng thống nhất trong ERD v2 / `entity-field-purpose.md` / Business Rules v1.2, và sửa `UserRole` cho khớp ERD.

| Enum (C#) | Giá trị (PascalCase) | Dùng ở field | Ghi chú |
|---|---|---|---|
| `UserRole` | `CenterManager, Coach, Member, Receptionist` | `Role.RoleName`, `User.RoleID` (FK), JWT role claim | Khớp 4 vai trò trong đề bài. **Sửa:** ERD trước đây ghi `MANAGER` — chuẩn hoá về `CENTER_MANAGER` để khớp tên enum |
| `UserStatus` | `Active, Banned, Deactivated` | `User.Status` | Không xoá cứng user (giữ lịch sử Payment/Attendance) |
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

*(`AiLog.QueryType` và `AuditLog.Action` là chuỗi tự do, không phải enum kín — xem ghi chú ở bảng Entity mục 2.)*

---

## 4. State Machine đã chốt

> Sơ đồ Mermaid đầy đủ nằm ở `Center-Management-System-Design-v2.md` §2 — mục này chỉ tóm tắt luồng để tra nhanh, không lặp lại toàn bộ diagram (tránh 2 nơi có thể lệch nhau như đã xảy ra với `Attendance`, xem dòng dưới).
>
> **Cập nhật 09/09/2026:** trước đó mục này chỉ có 3 dòng placeholder `? → ? → ?` dù Design v2 §2 đã có diagram Mermaid đầy đủ từ trước — đã đồng bộ lại. Đồng thời phát hiện và sửa 1 lỗi thật: diagram `Attendance` trong Design v2 §2.2 thiếu hẳn nhánh `Absent` dù ERD và `entity-field-purpose.md` đều liệt kê `Absent` là 1 trong 3 giá trị hợp lệ của `AttendanceStatus` (đã bổ sung, xem Design v2 §2.2).

- **MemberPackage**: `PendingPayment → Active → (Expired | Cancelled)`, hoặc `PendingPayment → Cancelled` nếu hết hạn giữ chỗ trước khi thanh toán. Diagram: Design v2 §2.1.
- **Enrollment**: `Confirmed → (CancelledOnTime | CancelledLate)`, hoặc `Confirmed → [chuyển sang Attendance khi session kết thúc]`. Diagram: Design v2 §2.2.
- **Attendance**: `[Attendance] → (Present | Absent | NoShow)` — `Present`/`Absent`: Coach/Receptionist ghi tay; `NoShow`: `AttendanceFinalizerJob` tự sinh sau `EndAtUtc` nếu không check-in và không có `Absent` ghi tay (BR-53). Diagram: Design v2 §2.2 (**đã sửa 09/09/2026** — thêm nhánh `Absent`).
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
- Entity/Class: PascalCase (C# convention).
- API route: `kebab-case` hoặc `camelCase`? — chốt 1 kiểu, ví dụ `/api/membership-packages`.
- DTO suffix: `...Request` / `...Response` (không dùng Entity trực tiếp làm response).

### 5.5 Soft delete vs hard delete
- Mặc định: soft delete (`IsDeleted` / `DeletedAt`) cho entity có liên quan lịch sử (Payment, Attendance, Enrollment...).
- Entity thuần cấu hình (Room, Subject...) có thể hard delete nếu chưa được tham chiếu.
- Chốt danh sách entity nào soft-delete trong họp.

---

## 6. Quy tắc xử lý khi docs mâu thuẫn / thiếu

1. **Không tự thêm entity/field/enum mới** để "cho code chạy" — nếu thiếu, thêm vào mục **Open Questions** bên dưới và hỏi người phụ trách domain đó (BA/team lead) trước khi code.
2. Nếu 2 tài liệu mâu thuẫn nhau, ưu tiên theo thứ tự ở mục 0 — nhưng vẫn phải báo lại trong nhóm để cập nhật doc gốc bị sai, không âm thầm code theo rồi thôi.
3. Mọi thay đổi entity/enum/state đã chốt (mục 2/3/4) phải được cập nhật vào file này **trong cùng buổi** — không để trôi qua PR review mới biết.
4. AI (nếu dùng Claude/Copilot để code) **phải đọc file này trước khi sinh code liên quan đến entity/DTO/enum** — nếu file này chưa đủ thông tin, dừng và hỏi thay vì đoán.

---

## 7. Open Questions (chưa chốt — cần họp quyết định)

- [ ] Cơ chế serialize enum (JSON API response / lưu string trong DB): dùng `JsonStringEnumConverter` với naming policy `UPPER_SNAKE_CASE`, hay map thủ công ở DTO layer? (phát sinh khi điền §3 ngày 09/09/2026)
- [ ] `ClassSession` chưa có state diagram chi tiết (chỉ có 4 giá trị liệt kê trong ERD: `Scheduled, Rescheduled, Cancelled, Completed`) — cần vẽ rõ điều kiện chuyển trạng thái, đặc biệt `Rescheduled` (có tạo `ClassSession` mới hay chỉ đổi field tại chỗ — xem `RescheduledFromSessionID`)
- [ ] `Notification` và `AuditLog` không thuộc 6 module backend hiện có (Identity/Membership/Scheduling/Payment/Training/AI) — cần quyết định: tạo module `Shared`/`Notification` riêng, hay gộp vào 1 module sẵn có?
- [ ] <câu hỏi khác>

---

## 8. Changelog

| Ngày | Thay đổi | Người sửa |
|---|---|---|
| 09/09/2026 | Điền đầy đủ Entity (§2, +11 entity), Enum (§3, 6→19 enum, sửa `UserRole` khớp ERD), State Machine (§4, đồng bộ từ Design v2 §2) — trước đó phần lớn là placeholder `?`/nháp dù ERD và diagram thật đã có sẵn trong `Center-Management-System-Design-v2.md`. Đồng thời sửa 1 lỗi thật: state diagram `Attendance` (Design v2 §2.2) thiếu nhánh `Absent` dù ERD/`entity-field-purpose.md` đều liệt kê 3 giá trị (Present/Absent/NoShow) — đã bổ sung. Cập nhật ERD (Design v2 §1): mọi field status/type đổi từ `string` sang tên enum tương ứng (tham chiếu SSOT §3), không lặp lại danh sách giá trị. | Hồ Lê Thiên An |
| 09/09/2026 | Hạ Flow 6 (AI assistant) từ "optional nhóm chọn làm" (§1.2) xuống "stretch — chỉ làm nếu còn thời gian" (§1.4 mới); cập nhật đồng bộ `Requirements.md`, `Center-Management-System-Design-v2.md` §4.4, `entity-field-purpose.md`, `README.md`, và đánh dấu BR-27/BR-28/BR-29 trong `SportManagement_BusinessRules_v1.2.docx` | Hồ Lê Thiên An |
| 08/09/2026 | Tạo sườn ban đầu | Hồ Lê Thiên An |
| 08/09/2026 | Thêm `Extensions/CorsExtensions.cs` (policy `Default`, đọc `Cors:AllowedOrigins`), `Extensions/SwaggerExtensions.cs`, `Extensions/JwtExtensions.cs` (stub) + `Middleware/` skeleton; bật CORS cho FE `http://localhost:3000` trong `Program.cs` | Hồ Lê Thiên An |
| 08/09/2026 | Nâng target framework 3 project backend từ `net8.0` lên `net10.0` (LTS) — .NET 8/9 EOL 10/11/2026; update NuGet: EFCore/JwtBearer 10.0.11, Npgsql.EFCore.PostgreSQL 10.0.3, Swashbuckle 10.2.3; Dockerfile SDK/runtime image → 10.0 | Hồ Lê Thiên An |
| 08/09/2026 | Sửa reference ở mục 0 từ `SportManagement_BusinessRules_v1.1.docx` (stale, file đã lên v1.2) → `SportManagement_BusinessRules_v1.2.docx`, khớp với `Center-Management-System-Design-v2.md` | Hồ Lê Thiên An |
