# 00 — Source of Truth (SSOT)

> Mục đích: 1 nơi duy nhất để AI / FE / BE tra cứu khi có mâu thuẫn giữa các tài liệu.
> Nếu file này và một doc khác nói khác nhau → **file này thắng**, trừ khi có ghi chú "xem chi tiết tại...".
<<<<<<< Updated upstream
> Cập nhật lần cuối: 10/09/2026 — người cập nhật: Hồ Lê Thiên An
=======
> Cập nhật lần cuối: 11/09/2026 — Codex theo yêu cầu người dùng (đồng bộ bản BR người dùng cung cấp; lịch sử tác giả xem §8)
>>>>>>> Stashed changes

---

## 0. Thứ tự ưu tiên tài liệu

Khi có mâu thuẫn, đọc theo thứ tự sau (trên > dưới):

1. `docs/00-Source-of-Truth.md` (file này) — quyết định đã chốt, không tranh cãi lại trong sprint hiện tại
2. `docs/SportManagement_BusinessRules_v1.2.docx` — business rules chi tiết; `docs/Business-Rules.md` là bản văn bản đồng nội dung để review GitHub
3. `docs/Center-Management-System-Design-v2.md` — thiết kế kỹ thuật/kiến trúc
4. `docs/Requirements.md` — yêu cầu gốc từ đề bài
5. Mọi thứ khác (Slack/Zalo/note họp miệng) — **không tính là nguồn chính thức** trừ khi được chép lại vào 1 trong 4 file trên

**Quy tắc cứng:** Nếu 2 doc mâu thuẫn và chưa kịp cập nhật file này → dừng lại, hỏi trong nhóm, **không tự thêm/đổi entity, field, hay flow để "cho chạy được"**. Ghi lại câu hỏi vào mục 7 (Open Questions) thay vì tự quyết.

---

### 0.1 Phân loại lại yêu cầu ngày 11/09/2026

Theo yêu cầu chuyển các mục phân loại nhầm ra khỏi Business Rules, xem chi tiết tại [Non-Functional-Requirements.md](Non-Functional-Requirements.md). Đây là nguồn quản lý được SSOT ủy quyền riêng cho nội dung trước đây mang mã **BR-34, BR-35, BR-36, BR-37, BR-38 và BR-48**, có ưu tiên trên nội dung lịch sử tương ứng trong Word và Design v2; không ghi đè SSOT.

- BR-34 → NFR-NOTIFY-01; giải pháp kỹ thuật → Design v2 §6 (ARCH-NOTIFY-01).
- BR-35/36/37/38 → NFR-PERF-API-01 / NFR-AVAIL-01 / NFR-BACKUP-01 / NFR-SEC-01.
- BR-48 → NFR-PERF-REPORT-01 và FR-REPORT-RETRY-01.
- Giữ mã BR cũ làm chỉ dẫn lịch sử, không tái sử dụng hoặc đánh lại các BR còn lại. Giữ các ngưỡng gốc; điều kiện nghiệm thu chưa rõ phải được chốt riêng.
- Phân loại này không chốt thêm scope, role, entity, enum hoặc state. `FAILED` trong yêu cầu xuất báo cáo chưa phải enum được chốt. Outbox/job trong Design v2 là thiết kế kỹ thuật; các entity phụ thuộc vẫn phải được chốt theo §2 trước khi code.
- Mật khẩu lưu bằng băm, thống nhất BR-5; tác vụ xuất báo cáo chỉ bị coi là thất bại khi thực sự thất bại, không suy ra từ mất kết nối phía người dùng.

---

### 0.2 Quyết định nghiệp vụ đồng bộ ngày 11/09/2026

Nguồn được chấp nhận cho đợt đồng bộ này: bản BR do người dùng cung cấp, đã chép vào Word và [Business-Rules.md](Business-Rules.md). Sáu mục chuyển NFR vẫn theo §0.1. Các quyết định sau ghi đè mô tả cũ trong tài liệu phụ:

- **BR-2/3/6/7/39:** năm vai trò; System Administrator tạo tài khoản đặc quyền, gán/đổi vai trò và khóa/mở khóa. Administrator đầu tiên khởi tạo lúc triển khai; Administrator hiện có được tạo thêm Administrator. Không tự khóa hoặc khóa Administrator hoạt động cuối cùng. Audit bao gồm Administrator và lý do khóa/mở khóa. Manager giữ cấu hình nghiệp vụ, không quản lý vai trò; báo cáo doanh thu vẫn Manager-only (BR-32/43).
- **BR-50:** chính sách hạn hủy gắn với thời điểm xác nhận đăng ký; thay đổi cấu hình không hồi tố. Hủy tại hoặc trước deadline là đúng hạn. Cách lưu chính sách/phiên bản cần thiết kế, chưa tự chốt field mới.
- **BR-20/21/53:** tối đa một Attendance cho mỗi Member–ClassSession. Chỉ tạo No-show sau buổi thực tế diễn ra và kết thúc, với đăng ký còn hiệu lực chưa có Attendance; không ghi đè Present/Absent, không ghi No-show cho đăng ký đã hủy. Coach được phân công hoặc Receptionist ghi Present/Absent.
- **BR-54/33:** Manager chỉ hủy/dời buổi chưa bắt đầu. Hệ thống hủy các đăng ký còn hiệu lực, hoàn lượt đã trừ, không phạt trễ/No-show, giữ lịch sử. Dời lịch tạo buổi thay thế liên kết buổi cũ; không tự chuyển đăng ký hoặc giữ chỗ. Thông báo nêu việc hủy, hoàn lượt và cần đăng ký lại. Tên enum hủy do trung tâm chưa chốt.
- **BR-30/55:** Invoice + InvoiceItem tạo trước thu tiền; chỉ nhận đủ mới kích hoạt gói. Hạn ban đầu hai tháng từ phát hành; cọc đầu tiên trong hạn đặt lại hạn tất toán thành 12 tháng từ khoản cọc đầu tiên; các khoản sau không gia hạn. Không tự thêm trạng thái quá hạn, tự hủy, mất cọc hoặc nhận tiền muộn khi BR chưa quy định.

Bản BR mới không chứa mọi đề xuất đã trao đổi: quyền thu hồi vai trò Administrator cuối cùng, hạn hủy cá nhân sau khi buổi bắt đầu, xử lý gói hết hạn và tiền quá hạn vẫn được ghi mở tại §7. Quyết định nghiệp vụ đã chốt không đồng nghĩa mọi schema trong Design v2 đã được duyệt.

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

<<<<<<< Updated upstream
> **Cập nhật 10/09/2026:** tên field/property trong cột "PK" và "Field chính" đã đổi từ `PascalCase` sang `snake_case` (vd `RoleID` → `role_id`) theo quyết định naming mới ở §5.4. Tên Entity/Class (`Role`, `User`...) và tên Enum (`UserRole`...) giữ nguyên `PascalCase`, không đổi.
=======
| Entity | Module sở hữu | Field chính (nháp) | Quan hệ chính | Ghi chú |
|---|---|---|---|---|
| User | Identity | Id, Email, PasswordHash, Role | 1—1 với Member/Coach/Staff profile? | Role: xem Enum §3 |
| Member | Membership | Id, UserId, ... | N—1 User; 1—N MemberPackage | Gói mua theo BR-9/10 |
| MemberPackage | Membership | Id; các field chi tiết chờ đối soát | N—1 Member, N—1 MembershipPackage | BR-9/10/16/30; chưa chốt schema đầy đủ |
| MembershipPackage | Membership | Id, Name, Price, DurationDays | 1—N MemberPackage | Danh mục gói |
| Class | Scheduling | Id, SubjectId, RoomId, CoachId (nullable) | N—1 Room, N—1 Coach (tùy chọn) | |
| ClassSession | Scheduling | Id, ClassId, StartTime, EndTime | N—1 Class | |
| Enrollment | Scheduling | Id, MemberId, SessionId, Status | N—1 Member, N—1 ClassSession | BR-16/19/54; Class suy ra qua Session, enum hủy do trung tâm chờ chốt |
| Payment | Payment | Id, InvoiceId, Amount, Method, Status | N—1 Invoice | BR-30/41; một khoản thu thuộc đúng một hóa đơn |
| Invoice | Payment | Id; field hạn thanh toán chờ chốt | 1—N Payment, 1—N InvoiceItem; liên kết MemberPackage | BR-30/55 |
| InvoiceItem | Payment | Id, InvoiceId; field chi tiết chờ chốt | N—1 Invoice | BR-30 |
| Attendance | Training | Id; các FK chi tiết chờ chốt; Status | N—1 ClassSession; tối đa 1 bản ghi/Member/Session | BR-21; optional flow |
| TrainingPlan | Training | Id, MemberId, CoachId, Content | N—1 Member, N—1 Coach | optional flow |
| WorkoutSuggestion | AI | (xem `IAiRecommendationService`) | — | optional flow, không phải bảng DB bắt buộc |
>>>>>>> Stashed changes

> **Cập nhật 10/09/2026 (2) — Google Login:** tách entity `User` thành 4 entity: `UserAccount` (định danh + vòng đời — email, role, status), `UserCredential` (auth nội bộ — password_hash, 1—1 với `UserAccount`), `UserProfile` (thông tin hiển thị — full_name, phone, 1—1 với `UserAccount`), `UserExternalLogin` (auth ngoài, vd Google — quan hệ 1—N vì 1 user có thể gắn nhiều provider). Lý do: hỗ trợ đăng nhập Google (đã chốt là flow bắt buộc, không còn stretch), và tách rõ dữ liệu có vòng đời khác nhau (identity/auth/profile) để giảm conflict khi nhiều người cùng sửa song song. **FK ở toàn bộ entity khác không đổi tên cột** (`member_id`, `coach_id`, `issued_by_user_id`, `received_by_user_id`, `requested_by_user_id`, `approved_by_user_id`, `user_id`...) — chỉ đổi entity đích từ `User` sang `UserAccount`. `UserCredential.password_hash` là nullable (account tạo thuần qua Google không có password nội bộ). Entity `User` (dòng cũ) coi như **đã bị thay thế**, không dùng nữa.

> **Cập nhật 10/09/2026 (3) — Chuẩn hoá Attendance/WorkoutResult:** `Attendance` bỏ `session_id`/`member_id` — cả 2 suy ra được 100% qua `enrollment_id` (1—1 với `Enrollment`, nay có ràng buộc `UNIQUE`), tránh dữ liệu trùng lặp có thể lệch nhau; lý do denormalize "khỏi JOIN" cũ không còn hợp lý ở quy mô đồ án. `WorkoutResult` đổi `session_id` + `member_id` (2 FK độc lập, trước đây không có gì đảm bảo Member thực sự có đăng ký session đó) thành 1 FK duy nhất `enrollment_id` — DB giờ tự chặn được việc ghi kết quả tập cho 1 cặp (session, member) không tồn tại `Enrollment` khớp. `coach_id` trên `WorkoutResult` giữ nguyên (không suy ra được qua `Enrollment`).

| Entity | Module sở hữu | PK | Field chính | Quan hệ chính | Enum dùng | Ghi chú |
|---|---|---|---|---|---|---|
| `Role` | Identity | `role_id` (int) | role_name (unique) | 1—N `UserAccount` | `UserRole` | seed data, 4 dòng cố định; unique BR-55 |
| `UserAccount` | Identity | `user_id` (uuid) | email (unique), role_id, status | N—1 `Role`; 1—1 `UserCredential`, `UserProfile`; 1—N `UserExternalLogin`, hầu hết entity khác (chủ thể thao tác) | `UserStatus` | email unique BR-1/BR-49; bảng định danh + vòng đời, tách khỏi Credential/Profile 10/09/2026 (2) |
| `UserCredential` | Identity | `user_id` (uuid, PK/FK) | password_hash (nullable) | 1—1 `UserAccount` | — | nullable vì account Google-only không có password; auth service chỉ cần query bảng này |
| `UserProfile` | Identity | `user_id` (uuid, PK/FK) | full_name, phone (unique, nullable) | 1—1 `UserAccount` | — | phone unique BR-54; thông tin hiển thị, không liên quan cơ chế đăng nhập/phân quyền |
| `UserExternalLogin` | Identity | `external_login_id` (uuid) | user_id, provider, provider_user_id, refresh_token (nullable) | N—1 `UserAccount` | `ExternalAuthProvider` | unique (provider, provider_user_id) và (user_id, provider); refresh_token MVP chưa mã hoá — xem Open Questions |
| `MemberTrainingProfile` | Membership | `profile_id` (uuid) | member_id (unique), goal, experience_level | 1—1 `UserAccount` (Member) | `ExperienceLevel` | input bắt buộc cho AI suggestion (BR-26) |
| `CoachMemberRelationship` | Training | `relationship_id` (uuid) | coach_id, member_id, source_type, class_id (nullable) | N—1 `UserAccount` (2 phía) | `RelationshipSourceType`, `RelationshipStatus` | unique khi ACTIVE (ràng buộc #7, BR-23/24) |
| `MembershipPackage` | Membership | `package_id` (int) | name (unique), price, duration_days, session_limit | 1—N `MemberPackage` | — | unique BR-56 |
| `MemberPackage` | Membership | `member_package_id` (uuid) | member_id, package_id, remaining_sessions, version | N—1 `UserAccount`, N—1 `MembershipPackage`; 1—N `Enrollment` | `MemberPackageStatus` | state machine §4; optimistic concurrency qua `version` |
| `Room` | Scheduling | `room_id` (int) | name (unique), capacity | 1—N `Class`, `ClassSession` | — | unique BR-57 |
| `Class` | Scheduling | `class_id` (int) | name, discipline, default_room_id, default_coach_id | N—1 `Room`; 1—N `ClassRecurrence`, `ClassSession` | `ClassStatus` | |
| `ClassRecurrence` | Scheduling | `recurrence_id` (int) | class_id, days_of_week, start_time_local, end_time_local, timezone | N—1 `Class`; 1—N `ClassSession` | — | định nghĩa pattern, không phải buổi cụ thể |
| `ClassSession` | Scheduling | `session_id` (uuid) | class_id, recurrence_id (nullable), room_id, coach_id, start_at_utc, end_at_utc, confirmed_count | N—1 `Class`, `ClassRecurrence` (nullable), `Room`; 1—N `Enrollment`, `Attendance` | `ClassSessionStatus` | chưa có state diagram riêng — xem §4 |
| `Enrollment` | Scheduling | `enrollment_id` (uuid) | session_id, member_id, member_package_id | N—1 `ClassSession`, `UserAccount`, `MemberPackage`; 1—1 `Attendance`, 1—N `WorkoutResult` | `EnrollmentStatus` | state machine §4; ràng buộc #1–#4 (Design v2 §3) |
| `Attendance` | Scheduling | `attendance_id` (uuid) | enrollment_id (unique), check_in_time | 1—1 `Enrollment` | `AttendanceStatus` | state machine §4 (đã sửa 09/09/2026, thêm nhánh Absent); bỏ `session_id`/`member_id` 10/09/2026 (3) — suy ra qua `Enrollment`, không denormalize |
| `WorkoutPlan` | Training | `plan_id` (uuid) | member_id, coach_id, relationship_id, goal, level | N—1 `UserAccount` (2 phía), `CoachMemberRelationship`; 1—N `WorkoutPlanItem` | — | chỉ tạo được khi quan hệ ACTIVE (BR-23) |
| `WorkoutPlanItem` | Training | `item_id` (uuid) | plan_id, exercise, sets, reps | N—1 `WorkoutPlan` | — | |
| `WorkoutResult` | Training | `result_id` (uuid) | enrollment_id, coach_id, progress_note, coach_comment | N—1 `Enrollment`, `UserAccount` (coach) | — | chỉ Coach dạy buổi đó mới ghi được (BR-24); chỉ tạo được khi `Enrollment.status = Confirmed` (BR mới, xem §7); bỏ `session_id`/`member_id` 10/09/2026 (3) — suy ra qua `Enrollment`, đảm bảo Member thực sự có đăng ký session đó |
| `Invoice` | Payment | `invoice_id` (uuid) | invoice_number (unique), member_id, issued_by_user_id, member_package_id (nullable), total_amount | N—1 `UserAccount` (2 phía), `MemberPackage`; 1—N `InvoiceItem`, `Payment`, `PaymentAdjustment` | `InvoiceStatus` | state machine §4; không bao giờ bị xóa (BR-40); invoice_number unique BR-58 |
| `InvoiceItem` | Payment | `item_id` (uuid) | invoice_id, description, amount, related_entity_type | N—1 `Invoice` | `InvoiceItemRelatedEntityType` | |
| `Payment` | Payment | `payment_id` (uuid) | invoice_id, amount, method, reference_code, received_by_user_id | N—1 `Invoice`, `UserAccount`; 1—N `PaymentAdjustment` | `PaymentMethod`, `PaymentStatus` | tổng SUCCESS không vượt invoice.total_amount (BR-41) |
| `PaymentAdjustment` | Payment | `adjustment_id` (uuid) | invoice_id, payment_id (nullable), type, amount, reason, requested_by_user_id, approved_by_user_id | N—1 `Invoice`, `Payment` (nullable), `UserAccount` (2 phía) | `PaymentAdjustmentType`, `PaymentAdjustmentStatus` | state machine §4; Manager duyệt, không tự duyệt (BR-42) |
| `Notification` | *(chưa gán — không thuộc 6 module hiện có ở backend, xem Open Questions)* | `notification_id` (uuid) | user_id, channel, source_event_type, source_entity_id (nullable), message | N—1 `UserAccount` | `NotificationChannel`, `NotificationSourceEventType`, `NotificationStatus` | MVP: lưu trong DB, không gửi SMS/email thật (§1.3) |
| `AiLog` | AI | `log_id` (uuid) | user_id, query_type, input_payload, response_payload, response_time_ms | N—1 `UserAccount` | — | `query_type` là chuỗi tự do (vd `WORKOUT_SUGGESTION`), không phải enum kín |
| `AuditLog` | *(chưa gán — không thuộc 6 module hiện có ở backend, xem Open Questions)* | `audit_id` (uuid) | user_id, action, target_entity, target_id, old_value, new_value | N—1 `UserAccount` | — | `action` là chuỗi tự do (vd `UPDATE_PACKAGE_STATUS`), không phải enum kín |

---

## 3. Enum đã chốt

> Đây là nơi DUY NHẤT định nghĩa enum — ERD (`Center-Management-System-Design-v2.md` §1) chỉ **tham chiếu** tên enum, không lặp lại danh sách giá trị. Không định nghĩa lại rải rác trong code/docs khác.
>
> **Quy ước:** tên member enum trong C# viết `PascalCase` (đúng convention §5.4). Chuỗi lưu DB / trả về qua API dùng `UPPER_SNAKE_CASE` (khớp toàn bộ giá trị mẫu đã có sẵn trong ERD/Business Rules trước đây) — ví dụ `MemberPackageStatus.PendingPayment` ↔ chuỗi `"PENDING_PAYMENT"`. Cơ chế serialize cụ thể (`JsonStringEnumConverter` + naming policy, hay map thủ công) **chưa chốt** — xem Open Questions.
>
> **Cập nhật 09/09/2026:** trước đó chỉ có 6/19 enum được liệt kê (5 enum còn lại toàn dấu `?`), và `UserRole` ghi giá trị không khớp ERD (`CenterManager` vs ERD ghi `MANAGER`). Đã điền đầy đủ 19 enum theo đúng giá trị đã dùng thống nhất trong ERD v2 / `entity-field-purpose.md` / Business Rules v1.2, và sửa `UserRole` cho khớp ERD.

<<<<<<< Updated upstream
> **Lưu ý naming:** cột "Dùng ở field" bên dưới dùng tên field `snake_case` (khớp §5.4/§2 sau cập nhật 10/09/2026); tên Entity trước dấu `.` (`Role`, `UserAccount`...) và tên Enum vẫn giữ `PascalCase`.

> **Cập nhật 10/09/2026 (2):** thêm enum `ExternalAuthProvider` (mới, phục vụ `UserExternalLogin` — xem §2); sửa 2 dòng "Dùng ở field" của `UserRole`/`UserStatus` từ `User.*` sang `UserAccount.*` cho khớp việc tách entity.

| Enum (C#) | Giá trị (PascalCase) | Dùng ở field | Ghi chú |
|---|---|---|---|
| `UserRole` | `CenterManager, Coach, Member, Receptionist` | `Role.role_name`, `UserAccount.role_id` (FK), JWT role claim | Khớp 4 vai trò trong đề bài. **Sửa:** ERD trước đây ghi `MANAGER` — chuẩn hoá về `CENTER_MANAGER` để khớp tên enum |
| `UserStatus` | `Active, Banned, Deactivated` | `UserAccount.status` | Không xoá cứng user (giữ lịch sử Payment/Attendance) |
| `ExperienceLevel` | `Beginner, Intermediate, Advanced` | `MemberTrainingProfile.experience_level` | |
| `RelationshipSourceType` | `ClassBased, Personal, AssignedByManager` | `CoachMemberRelationship.source_type` | |
| `RelationshipStatus` | `Active, Ended` | `CoachMemberRelationship.status` | Chỉ 1 quan hệ `Active` giữa 1 cặp Coach–Member tại 1 thời điểm (ràng buộc #7) |
| `MemberPackageStatus` | `PendingPayment, Active, Expired, Cancelled` | `MemberPackage.status` | State machine: §4 / Design v2 §2.1 |
| `ClassStatus` | `Active, Archived` | `Class.status` | |
| `ClassSessionStatus` | `Scheduled, Rescheduled, Cancelled, Completed` | `ClassSession.status` | Chưa có state diagram riêng — xem §4 |
| `EnrollmentStatus` | `Confirmed, CancelledOnTime, CancelledLate` | `Enrollment.status` | State machine: §4 / Design v2 §2.2 |
| `AttendanceStatus` | `Present, Absent, NoShow` | `Attendance.status` | `Present`/`Absent` ghi tay, `NoShow` do `AttendanceFinalizerJob` tự sinh (BR-53). State machine: §4 / Design v2 §2.2 |
| `InvoiceStatus` | `Issued, PartiallyPaid, Paid, Void` | `Invoice.status` | State machine: §4 / Design v2 §2.3 |
| `InvoiceItemRelatedEntityType` | `Package, ClassFee, Penalty` | `InvoiceItem.related_entity_type` | |
| `PaymentMethod` | `Cash, Card, Transfer, EWallet` | `Payment.method` | MVP ghi nhận thủ công, không qua cổng thật (§1.3) |
| `PaymentStatus` | `Pending, Success, Failed` | `Payment.status` | Chỉ `Success` tính vào tổng đã thu (BR-41) |
| `PaymentAdjustmentType` | `Refund, Correction, Discount` | `PaymentAdjustment.type` | |
| `PaymentAdjustmentStatus` | `Requested, Approved, Rejected, Completed` | `PaymentAdjustment.status` | State machine: §4 / Design v2 §2.4 |
| `NotificationChannel` | `InApp, Email, Sms` | `Notification.channel` | MVP: chỉ `InApp` thật sự hoạt động, `Email`/`Sms` chỉ lưu log (§1.3) |
| `NotificationSourceEventType` | `ClassCancelled, ScheduleChanged, PackageExpiring, PaymentReceived` | `Notification.source_event_type` | |
| `NotificationStatus` | `Pending, Sent, Failed, Read` | `Notification.status` | |
| `ExternalAuthProvider` | `Google` | `UserExternalLogin.provider` | Mới 10/09/2026 (2). Hiện chỉ `Google`; thêm provider khác sau (Facebook...) không cần đổi entity |

*(`AiLog.query_type` và `AuditLog.action` là chuỗi tự do, không phải enum kín — xem ghi chú ở bảng Entity mục 2.)*
=======
| Enum | Giá trị | Ghi chú |
|---|---|---|
| `UserRole` | SystemAdministrator, CenterManager, Coach, Member, Receptionist | BR-2/3 bản cập nhật; đúng một vai trò mỗi tài khoản |
| `MembershipStatus` | ? | Active / Expired / Cancelled... — chốt trong họp |
| `EnrollmentStatus` | ? | Pending / Confirmed / Cancelled... |
| `PaymentStatus` | ? | Pending / Paid / Failed / Refunded... |
| `PaymentMethod` | ? | Cash / BankTransfer / Card... (MVP thủ công, xem §1.3) |
| `AttendanceStatus` | Present, Absent, NoShow | BR-20/21/53; NoShow là cách viết mã của No-show, không có Late |
>>>>>>> Stashed changes

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
- **Field/Property (thuộc tính entity, cột DB): `snake_case`** — vd `user_id`, `class_id`, `full_name`. **Đã đổi 10/09/2026** (trước đó PascalCase); áp dụng cho toàn bộ field liệt kê ở §2 và cột "Dùng ở field" ở §3. Enum type name (`UserRole`...) và Entity/Class name không đổi, vẫn PascalCase.
- Enum member (C#): PascalCase (không đổi — xem §3).
- API route: `kebab-case` hoặc `camelCase`? — chốt 1 kiểu, ví dụ `/api/membership-packages`.
- DTO suffix: `...Request` / `...Response` (không dùng Entity trực tiếp làm response). Naming field bên trong DTO/JSON request-response **chưa chốt** (camelCase theo convention JS/TS phổ biến, hay đồng bộ `snake_case` với entity/DB) — xem Open Questions §7.

### 5.5 Soft delete vs hard delete
- Mặc định: soft delete (`is_deleted` / `deleted_at`) cho entity có liên quan lịch sử (Payment, Attendance, Enrollment...).
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

<<<<<<< Updated upstream
- [ ] Cơ chế serialize enum (JSON API response / lưu string trong DB): dùng `JsonStringEnumConverter` với naming policy `UPPER_SNAKE_CASE`, hay map thủ công ở DTO layer? (phát sinh khi điền §3 ngày 09/09/2026)
- [ ] `ClassSession` chưa có state diagram chi tiết (chỉ có 4 giá trị liệt kê trong ERD: `Scheduled, Rescheduled, Cancelled, Completed`) — cần vẽ rõ điều kiện chuyển trạng thái, đặc biệt `Rescheduled` (có tạo `ClassSession` mới hay chỉ đổi field tại chỗ — xem `rescheduled_from_session_id`)
- [ ] `Notification` và `AuditLog` không thuộc 6 module backend hiện có (Identity/Membership/Scheduling/Payment/Training/AI) — cần quyết định: tạo module `Shared`/`Notification` riêng, hay gộp vào 1 module sẵn có?
- [ ] Naming field trong DTO/JSON API (request/response body) có đồng bộ `snake_case` theo entity/DB (đã chốt §5.4 ngày 10/09/2026) hay dùng `camelCase` riêng cho JSON (phổ biến hơn với FE Next.js/TS) — cần chốt trước khi code Controller/DTO, tránh code xong rồi đổi lại
- [ ] `UserExternalLogin.refresh_token` MVP chưa mã hoá tại rest — cần chốt có mã hoá (vd Data Protection API) trước khi lưu data thật hay chấp nhận nợ kỹ thuật cho scope đồ án (phát sinh khi thêm entity 10/09/2026 (2))
- [ ] Business rule chi tiết cho luồng Google login (không tự tạo/tự link account trùng email khi chưa xác thực, chặn account pre-hijacking) — cần chép chính thức vào `SportManagement_BusinessRules_v1.2.docx` dưới dạng BR mới, hiện mới chỉ thống nhất miệng/chat nhóm (phát sinh khi thêm entity 10/09/2026 (2))
- [ ] `WorkoutResult` chỉ nên tạo được khi `Enrollment.status = Confirmed` (member chưa hủy đăng ký) — FK `enrollment_id` mới (10/09/2026 (3)) chỉ đảm bảo Enrollment *tồn tại*, không đảm bảo còn hợp lệ; cần chép rule này chính thức vào `SportManagement_BusinessRules_v1.2.docx`, và cân nhắc có nên yêu cầu thêm `Attendance.status = Present` mới cho ghi WorkoutResult hay không (chưa quyết định)
- [ ] <câu hỏi khác>
=======
- [x] **CS-01:** dùng tên ClassSession cho buổi học trong bộ tài liệu đồng bộ.
- [x] **CS-02:** Enrollment đăng ký theo ClassSession (BR-16/19/54); Class suy ra qua Session.
- [ ] **CS-03:** chốt FK và schema Attendance; tính duy nhất Member–Session và ba trạng thái đã chốt theo BR-21.
- [ ] **CS-04:** chốt field mở rộng ClassSession, lịch lặp, room/coach thực tế, capacity và enum hủy do trung tâm trước khi code; ERD là đề xuất.
- [ ] **CS-05:** Coach có thể trống lúc tạo Class (BR-12); còn cần chốt điều kiện phân công trước khi buổi diễn ra.
- [x] **CS-06:** dời lịch tạo buổi thay thế, giữ liên kết buổi cũ theo BR-54; không sửa tại chỗ để tiếp tục đăng ký cũ. Tên enum và cơ chế kết thúc buổi còn theo CS-04/07.
- [ ] **CS-07:** giới hạn Manager hủy/dời trước giờ bắt đầu đã chốt. Cần chốt tác nhân hoàn tất buổi, sửa điểm danh sớm hoặc sai và mở lại trạng thái cuối.
- [x] **CS-08:** BR-54/33 chốt hủy đăng ký còn hiệu lực, hoàn lượt, thông báo và học viên tự đăng ký lại; không giữ chỗ. Khả năng dùng lượt trên gói hết hạn theo MEM-01.
- [ ] **AUTH-01:** BR-6 cấm khóa Administrator cuối cùng nhưng chưa cấm thu hồi vai trò cuối cùng; chốt bảo vệ thao tác đổi vai trò và quyền xem audit của Administrator.
- [ ] **BOOK-01:** BR-17 bản gửi chưa giới hạn hủy cá nhân trước giờ bắt đầu; chốt hạn cuối hủy, quy tắc chống trùng lịch và gói phải bao phủ ngày buổi học hay chỉ ngày đăng ký.
- [ ] **MEM-01:** gói hết lượt được hoàn có trở lại Active không; lượt hoàn về gói hết thời hạn sử dụng thế nào; thời điểm bắt đầu gói sau thanh toán.
- [ ] **PAY-01:** BR-55 đã chốt hai tháng/12 tháng; còn cách tính tháng/ngày cuối tháng, hạn chính xác, mức cọc tối thiểu, nhận tiền muộn, mất cọc và tiền nộp thêm. Không tự hủy hóa đơn hoặc tạo enum quá hạn.
- [ ] **PAY-02:** đối soát BR-41/43/52 về tổng đã thu, tổng đã hoàn, điều chỉnh và giới hạn hoàn. Ví dụ thu đủ 1.000.000 rồi hoàn 200.000 làm công thức hiện tại BR-41 không còn đúng nếu tổng Payment lịch sử không đổi. Giữ nguyên BR để nhóm sửa, không triển khai công thức mâu thuẫn.
- [ ] **AI-01:** xử lý hội viên chưa đủ 30 ngày lịch sử theo BR-26. BR-28 vẫn là NFR hiệu năng còn trong bản gửi; chốt đợt phân loại tiếp theo cho BR-4/5/7/27/28, chưa tự di chuyển thêm.
- [ ] **NFR-REVIEW-01:** chốt điều kiện đo API/PDF, kỳ đo uptime, tiêu chí sao lưu/khôi phục và cách xác định tác vụ xuất báo cáo thất bại; xem `Non-Functional-Requirements.md` §2–3.
>>>>>>> Stashed changes

---

## 8. Changelog

| Ngày | Thay đổi | Người sửa |
|---|---|---|
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
| 11/09/2026 | Phân loại lại BR-34–38 và BR-48; ủy quyền tài liệu NFR tại §0.1, giữ chỉ dẫn trong Word và đồng bộ Design v2. Không thay đổi domain/RBAC. | Codex theo yêu cầu người dùng |
| 11/09/2026 | Đồng bộ bản BR mới: năm vai trò, BR-50/54/55, điểm danh; đối soát quan hệ domain cốt lõi và ghi rõ các chính sách còn mở. | Codex theo bản người dùng cung cấp |
