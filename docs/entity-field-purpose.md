# Mục đích các Entity & vai trò từng Field (SportHub)

> Rút ra từ ERD v2 (`docs/Center-Management-System-Design-v2.md` §1), state transition (§2) và bảng ràng buộc DB (§3).
> Thứ tự ưu tiên: `00-Source-of-Truth.md` → `SportManagement_BusinessRules.docx` v1.8 → `Center-Management-System-Design-v2.md` → tài liệu field này. Không duy trì bản Markdown mirror của Business Rules.
>
> **Cập nhật 26/09/2026:** Đồng bộ Business Rules v1.8 cho Identity, Membership/PT và Payment. Các field bên dưới là thiết kế logic tối thiểu để đáp ứng nghiệp vụ đã chốt; tên vật lý cuối cùng có thể được map khi sửa code/migration.
>
> **Cập nhật 10/09/2026:** tên field trong cột "Field" (và mọi tham chiếu `Entity.Field` trong phần Mục đích) đã đổi từ `PascalCase` sang `snake_case` (vd `RoleID` → `role_id`) theo quyết định naming mới ở `00-Source-of-Truth.md` §5.4. Tên bảng (`USERS`, `MEMBER_TRAINING_PROFILE`...) và tên class/job (`AttendanceFinalizerJob`...) giữ nguyên, không đổi. **Chỉ sửa doc, chưa đụng code.**
>
> **Cập nhật 10/09/2026 (2):** đánh dấu **unique** tường minh cho các field trước đây chưa ghi rõ — `email` (BR-1/BR-49), `phone` (BR-54, nullable), `role_name` (BR-55), `name` của `MEMBERSHIP_PACKAGES` (BR-56), `name` của `ROOMS` (BR-57). Danh sách đầy đủ mọi field/composite unique: `SportManagement_BusinessRules_v1.2.docx` §L (Unique Constraints Summary) và `Center-Management-System-Design-v2.md` §1 (marker `UK` trong ERD) + §3 (constraint #9, #11–#14).
>
> **Cập nhật 10/09/2026 (3) — Google Login:** entity `USERS` tách thành `USER_ACCOUNTS`/`USER_CREDENTIALS`/`USER_PROFILES`/`USER_EXTERNAL_LOGINS` (module Identity bên dưới); mọi `member_id`/`coach_id`/`user_id`... ở các entity khác trong file này vẫn giữ nguyên tên, chỉ hiểu là trỏ về `USER_ACCOUNTS.user_id` thay vì `USERS.user_id`. Thêm constraint #15/#16 (composite unique cho `USER_EXTERNAL_LOGINS`) — xem `Center-Management-System-Design-v2.md` §3.
>
> **Cập nhật 10/09/2026 (4) — Chuẩn hoá Attendance/WorkoutResult:** `ATTENDANCE` bỏ `session_id`/`member_id`, chỉ giữ `enrollment_id` (nay unique). `WORKOUT_RESULTS` đổi `session_id` + `member_id` thành 1 FK `enrollment_id`. Chi tiết lý do ở mục Module tương ứng bên dưới; xem thêm `00-Source-of-Truth.md` §2 (cập nhật 10/09/2026 (3)) và `Center-Management-System-Design-v2.md` §3 (constraint #17).
>
> **Cập nhật 11/09/2026 — Đảo ngược naming property (đọc lại quyết định 10/09/2026):** tên field trong cột "Field" (và mọi tham chiếu `Entity.Field` trong phần Mục đích) đổi từ `snake_case` trở lại `PascalCase` (vd `role_id` → `RoleId`), khớp `00-Source-of-Truth.md` §5.4 (đã đảo ngược). Đây là tên **property C#** trong code (`SportHub.Repository/Entities/*.cs`) — **cột DB Postgres không đổi**, vẫn `snake_case` như trước, vì đã thêm package `EFCore.NamingConventions` (`.UseSnakeCaseNamingConvention()` ở `Program.cs`) để EF Core tự map property PascalCase ↔ cột snake_case. Tên bảng (`USER_ACCOUNTS`, `MEMBER_TRAINING_PROFILE`...) vẫn giữ nguyên style ALL_CAPS (mô tả bảng vật lý), không đổi. **Code đã sửa trước, doc đồng bộ ở bước này.**

---

## Module: Identity

> **Cập nhật 10/09/2026 (2) — Google Login:** entity `USERS` (dòng cũ, đã bỏ) được tách thành 4 entity dưới đây — `USER_ACCOUNTS` (định danh + vòng đời), `USER_CREDENTIALS` (auth nội bộ), `USER_PROFILES` (hiển thị), `USER_EXTERNAL_LOGINS` (auth ngoài, mới). Lý do: hỗ trợ đăng nhập Google (nay là flow bắt buộc) cần quan hệ 1-N thật cho provider ngoài, và tách rõ dữ liệu có vòng đời khác nhau để giảm conflict khi nhiều người cùng sửa song song. Chi tiết: `00-Source-of-Truth.md` §2.

### `USER_ACCOUNTS`
**Mục đích:** bảng định danh + vòng đời gốc — mọi vai trò (Manager, Coach, Member, Receptionist) đều là 1 row ở đây, phân biệt qua `role_id`. Không tách bảng riêng cho từng vai trò để tránh trùng lặp logic auth/login. Đây là bảng cha duy nhất mà gần như mọi entity khác (member, coach, staff...) trỏ FK vào — cố tình giữ tối giản (chỉ định danh + vòng đời) để hầu như không bao giờ cần đổi schema, tách khỏi phần auth (`USER_CREDENTIALS`/`USER_EXTERNAL_LOGINS`) và phần hiển thị (`USER_PROFILES`) vốn thay đổi thường xuyên hơn.

| Field | Vai trò |
|---|---|
| `UserId` (PK) | Định danh duy nhất, dùng làm khóa ngoại ở gần như mọi entity khác (member, coach, staff đều trỏ về đây) |
| `Email` | Định danh đăng nhập/liên hệ — **unique không phân biệt hoa/thường** (BR-1, BR-49, index `LOWER(email)`). Đặt ở đây (không phải `USER_CREDENTIALS`) vì email là định danh, không phải bí mật — nhiều module (Invoice, Notification) cần đọc mà không nên phải đụng tới bảng chứa `PasswordHash` |
| `RoleId` (FK → ROLES) | Quyết định phân quyền (RBAC) — 1 user chỉ có 1 role |
| `Status` | `ACTIVE / BANNED / DEACTIVATED` — kiểm soát user có được login/thao tác hay không, không xóa cứng user (giữ lịch sử payment/attendance) |
| `CreatedAt` | Audit, hiển thị "thành viên từ ngày..." |

### `USER_CREDENTIALS`
**Mục đích:** lưu thông tin xác thực **nội bộ** (local password) — tách khỏi `USER_ACCOUNTS` vì đây là dữ liệu nhạy cảm, muốn cô lập khỏi các query hiển thị/business thông thường (tránh vô tình `SELECT`/trả về `password_hash` trong response). Quan hệ 1–1 với `USER_ACCOUNTS` (chung PK) vì 1 user chỉ có đúng 1 password tại 1 thời điểm — khác `USER_EXTERNAL_LOGINS` (1-N thật).

| Field | Vai trò |
|---|---|
| `UserId` (PK, FK → USER_ACCOUNTS) | Cùng giá trị PK với `UserAccount.UserId` — quan hệ 1–1 |
| `PasswordHash` | Lưu hash, không bao giờ lưu plaintext — dùng để xác thực khi login. **Nullable**: account tạo thuần qua Google (chưa từng đặt password nội bộ) sẽ để trống; `POST /api/auth/login` chỉ cho phép khi field này khác null |

### `USER_PROFILES`
**Mục đích:** thông tin **hiển thị** của user — tách khỏi `USER_ACCOUNTS` vì đây là dữ liệu không liên quan đến cơ chế đăng nhập/phân quyền, thay đổi theo nhu cầu UX (đổi tên, thêm field liên hệ...) độc lập với logic auth. Quan hệ 1–1 với `USER_ACCOUNTS` (chung PK).

| Field | Vai trò |
|---|---|
| `UserId` (PK, FK → USER_ACCOUNTS) | Cùng giá trị PK với `UserAccount.UserId` — quan hệ 1–1 |
| `FullName` | Hiển thị UI, in hóa đơn, thông báo |
| `Phone` | Liên hệ, có thể dùng cho notification kênh SMS sau này — **unique nếu có giá trị** (nullable, cho phép nhiều user cùng để trống; BR-62) |

### `USER_EXTERNAL_LOGINS`
**Mục đích:** đăng nhập qua provider ngoài (Google, sau này có thể thêm Facebook...) — quan hệ **1-N thật** với `USER_ACCOUNTS` (khác `USER_CREDENTIALS`/`USER_PROFILES` là 1-1), vì 1 user có thể gắn nhiều provider theo thời gian. Đây là lý do entity này cần tách bảng riêng thay vì nhét thêm cột `google_id`/`google_refresh_token`... trực tiếp vào `USER_ACCOUNTS`.

| Field | Vai trò |
|---|---|
| `ExternalLoginId` (PK) | Định danh dòng link |
| `UserId` (FK → USER_ACCOUNTS) | Provider này thuộc về user nào |
| `Provider` | `GOOGLE` (enum `ExternalAuthProvider`, xem SSOT §3) — hiện chỉ Google, mở rộng provider khác không cần đổi entity |
| `ProviderUserId` | ID phía provider trả về (Google `sub`) — cùng `Provider` tạo **unique composite**, chặn 1 tài khoản Google bị link vào 2 `USER_ACCOUNTS` khác nhau |
| `RefreshToken` | Nullable; scope Google login hiện không lưu refresh token. Nếu bổ sung lưu trữ phải thiết kế bảo vệ riêng, không lưu thô |
| `CreatedAt` | Mốc link provider — cũng là mốc dùng để kiểm tra `(UserId, Provider)` unique (1 user không link trùng 1 provider 2 lần) |

**Business rule đăng nhập Google (BR-59/60 chính thức):** nếu `POST /api/auth/google` nhận email đã tồn tại nhưng chưa link thì không tự tạo/tự link. Với email mới, hệ thống tạo account ở trạng thái chờ thiết lập mật khẩu; chính người dùng phải nhập và xác nhận mật khẩu mạnh trước khi hoàn tất onboarding. Không sinh hoặc gửi mật khẩu gợi ý.

### `ROLES`
**Mục đích:** danh mục cố định 4 vai trò trong hệ thống, tách riêng để RBAC dễ mở rộng (thêm role mới không cần đổi schema `USER_ACCOUNTS`).

| Field | Vai trò |
|---|---|
| `RoleId` (PK) | Khóa để `UserAccount.RoleId` trỏ vào |
| `RoleName` | 5 giá trị cố định theo SSOT UserRole; API UPPER_SNAKE_CASE, JWT PascalCase. Seed unique (BR-63), không phải 4 role |

---

## Module: Training (hồ sơ & quan hệ — nền tảng cho AI/Workout)

### `MEMBER_TRAINING_PROFILE`
**Mục đích:** hồ sơ tập luyện của Member — **bắt buộc phải có dữ liệu thật** để AI gợi ý bài tập (BR-26 yêu cầu đủ 3 tham số: goal, level, lịch sử) thay vì để client tự gửi tham số (dễ bị giả mạo/không chính xác).

| Field | Vai trò |
|---|---|
| `ProfileId` (PK) | Định danh hồ sơ |
| `MemberId` (FK, unique) | 1 Member chỉ có 1 hồ sơ — ràng buộc 1–1 |
| `Goal` | Mục tiêu tập (giảm cân, tăng cơ...) — input cho AI suggestion & để Coach tạo Workout Plan |
| `ExperienceLevel` | `BEGINNER/INTERMEDIATE/ADVANCED` — input cho AI + Coach điều chỉnh độ khó bài tập |
| `Notes` | Ghi chú tự do (chấn thương, hạn chế...) — Coach tham khảo khi lên plan |
| `UpdatedAt` | Biết hồ sơ có đang cũ/stale không (AI dựa vào profile cũ có thể gợi ý sai) |

### `COACH_MEMBER_RELATIONSHIP`
**Mục đích:** ghi nhận **ai là HLV phụ trách ai**, và **vì sao** (qua lớp học, cá nhân, hay Manager gán tay) — cần thiết vì 1 Coach chỉ được tạo Workout Plan / xem thông tin của Member mà mình thực sự phụ trách (BR-23/BR-24), không phải mọi Member.

| Field | Vai trò |
|---|---|
| `RelationshipId` (PK) | Định danh quan hệ |
| `CoachId` (FK) | HLV phụ trách |
| `MemberId` (FK) | Học viên được phụ trách |
| `SourceType` | `CLASS_BASED / PERSONAL / ASSIGNED_BY_MANAGER` — nguồn gốc quan hệ, dùng để audit/giải trình sao có quyền truy cập |
| `ClassId` (FK, nullable) | Nếu quan hệ phát sinh từ 1 lớp cụ thể (`CLASS_BASED`) thì trỏ tới lớp đó |
| `Status` | `ACTIVE/ENDED` — chỉ quan hệ ACTIVE mới cho phép Coach thao tác trên Member đó (constraint #7: không được có 2 quan hệ ACTIVE trùng) |
| `StartedAt` / `EndedAt` | Mốc thời gian bắt đầu/kết thúc phụ trách — phục vụ lịch sử, không xóa cứng khi kết thúc |

---

## Module: Membership

### `MEMBERSHIP_PACKAGES`
**Mục đích:** **danh mục** Membership trung tâm bán ra (template) — KHÔNG phải Membership record của 1 Member cụ thể (đó là `MEMBER_PACKAGES` bên dưới).

| Field | Vai trò |
|---|---|
| `PackageId` (PK) | Định danh gói |
| `Name` | Hiển thị cho Member chọn mua — **unique trong catalog** (BR-56) |
| `Price` | Giá niêm yết hiện tại; khi checkout phải snapshot vào `INVOICE_ITEMS`, thay đổi giá sau đó không sửa Invoice cũ |
| `DurationInMonths` | Chỉ nhận 1, 3, 6 hoặc 12 tháng; dùng công thức calendar date của BR-9 |
| `IsActive` / `Description` | Ngừng bán không làm mất quyền lợi Membership đã tạo; Description tùy chọn |

### `MEMBER_PACKAGES`
**Mục đích:** Membership record của một Member. Tên entity code hiện tại vẫn là `MEMBER_PACKAGES`; tài liệu không tự đổi tên entity khi chưa có quyết định schema.

| Field | Vai trò |
|---|---|
| `MemberPackageId` (PK) | Định danh |
| `MemberId` (FK) | Ai sở hữu gói này |
| `PackageId` (FK) | Mua theo template gói nào |
| `StartDate` / `EndDate` | Calendar date, đều inclusive; lần mua mới lấy StartDate theo ngày Việt Nam của `vnp_PayDate` đã xác minh; early renewal bắt đầu sau EndDate hiện tại |
| `Status` | `ACTIVE`, `EXPIRED`, `CANCELLED`; chỉ tạo/kích hoạt sau Payment thành công trong cùng transaction; Refund Completed hủy quyền lợi tương ứng |
| PT plan / frequency / quota | PT là dịch vụ trả phí riêng; chỉ checkout khi Membership `ACTIVE`. Frequency 1/2/3 chỉ tính tổng quota theo BR-71; PT không được vượt EndDate Membership liên kết |
| Liên kết renewal/carry-over | Early renewal tạo record mới; PT sessions chưa dùng carry over theo BR-65/66. Tên field kỹ thuật cần chốt trong thiết kế trước khi code |

---

## Module: Scheduling

### `ROOMS`
**Mục đích:** danh mục phòng tập vật lý của trung tâm.

| Field | Vai trò |
|---|---|
| `RoomId` (PK) | Định danh phòng |
| `Name` | Hiển thị lịch/booking — **unique toàn trung tâm** (BR-57) |
| `Capacity` | Trần sức chứa vật lý — dùng để tính `ClassSession.Capacity` = MIN(Room, Class) (BR-51) |

### `CLASSES`
**Mục đích:** class Yoga hoặc Group X cụ thể theo lịch. Không chia Beginner/Advanced; PT không dùng `Class.Discipline`.

| Field | Vai trò |
|---|---|
| `ClassId` (PK) | Định danh lớp |
| `Discipline` | Chỉ `Yoga` hoặc `GroupX` |
| `Date` / `StartTime` / `EndTime` | Class kéo dài đúng 60 phút; `EndTime = StartTime + 60 minutes` |
| `Coach` | Coach do Center Manager phân công hoặc phân công lại |
| `Capacity` | Số nguyên dương, tối đa 20; Manager có thể đặt thấp hơn 20 |
| `Slot` | `Morning` hoặc `Afternoon` do Manager chọn, không suy ra từ giờ hard-code |
| `Status` | `DRAFT → PUBLISHED → CLOSED`; chỉ `PUBLISHED` nhận booking |

### `CLASS_RECURRENCE`
**Trạng thái:** cấu trúc kỹ thuật cũ, chưa được Business Rules v1.6 chốt lại. Không dùng recurrence engine cho PT và không được sinh lịch Yoga/Group X vi phạm giới hạn Morning/Afternoon, tối đa 2 class mỗi discipline và 4 class tổng mỗi calendar date.

| Field | Vai trò |
|---|---|
| `RecurrenceId` (PK) | Định danh pattern |
| `ClassId` (FK) | Pattern này thuộc lớp nào |
| `DaysOfWeek` | Các thứ trong tuần lặp lại (vd `MON,WED,FRI`) |
| `StartTimeLocal` / `EndTimeLocal` | Giờ bắt đầu/kết thúc theo giờ địa phương (không phải UTC — vì lịch lặp theo "giờ trong ngày", không theo mốc tuyệt đối) |
| `Timezone` | Neo giờ local về đúng múi giờ (`Asia/Ho_Chi_Minh`) khi convert sang `StartAtUtc`/`EndAtUtc` của session |
| `EffectiveFrom` / `EffectiveTo` | Khoảng thời gian pattern này còn áp dụng — cho phép đổi lịch theo kỳ mà không xóa lịch sử session cũ |

### `CLASS_SESSIONS`
**Trạng thái:** mô hình kỹ thuật hiện có cần được map lại với Class v1.6 trước khi code. Không dùng `SCHEDULED/RESCHEDULED/CANCELLED/COMPLETED` để thay cho lifecycle `DRAFT/PUBLISHED/CLOSED` đã duyệt.

| Field | Vai trò |
|---|---|
| `SessionId` (PK) | Định danh buổi học |
| `ClassId` (FK) | Buổi học thuộc lớp nào |
| `RecurrenceId` (FK, nullable) | Sinh ra từ pattern nào — `null` nghĩa là session ad-hoc hoặc đã bị reschedule tách khỏi pattern |
| `RoomId` (FK) | Phòng thực tế của buổi này (có thể khác `Class.DefaultRoomId` nếu đổi phòng) |
| `CoachId` (FK) | HLV thực tế dạy buổi này (có thể khác default nếu đổi HLV) |
| `StartAtUtc` / `EndAtUtc` | Mốc thời gian tuyệt đối (UTC) — dùng để check trùng lịch, tính deadline hủy, tính No-show |
| `Capacity` | Không vượt quá Capacity của class và không vượt trần 20 members theo BR-51 |
| `ConfirmedCount` | **Denormalized**, tăng/giảm nguyên tử mỗi khi có Enrollment CONFIRMED/hủy — dùng để chặn overbooking bằng 1 UPDATE có điều kiện thay vì COUNT() (constraint #2) |
| `Status` | Cần thiết kế lại để không mâu thuẫn `DRAFT/PUBLISHED/CLOSED`; chưa tự chốt mapping |
| `RescheduledFromSessionId` (FK, nullable) | Nếu buổi này là kết quả dời lịch từ buổi khác, trỏ về buổi gốc — giữ vết lịch sử đổi lịch |

### `ENROLLMENTS`
**Mục đích:** ghi nhận một Member booking Yoga hoặc Group X. Booking không trừ Membership session credit.

| Field | Vai trò |
|---|---|
| `EnrollmentId` (PK) | Định danh lượt đăng ký |
| `SessionId` (FK) | Đăng ký vào buổi nào |
| `MemberId` (FK) | Ai đăng ký |
| `MemberPackageId` (FK) | Field kỹ thuật cũ; business rule chỉ yêu cầu có Membership Active và class date nằm trong validity. Có giữ field này hay không cần quyết định thiết kế, không tự suy diễn |
| `Status` | `CONFIRMED/CANCELLED` theo rule hiện hành; không phân nhánh hoàn/không hoàn Membership credit |
| `RegisteredAt` | Mốc đăng ký, dùng tính thứ tự/độ ưu tiên nếu cần |
| `CancelledAt` | Mốc hủy — chỉ cho phép khi `CancellationTime <= ClassStartTime - 30 minutes` |
| `CancelledByUserId` (FK, nullable) | Ai bấm hủy — có thể khác Member (vd Receptionist hủy giúp) — phục vụ audit |

### `ATTENDANCE`
**Mục đích:** kết quả điểm danh của 1 Enrollment sau khi session diễn ra — phân biệt rõ được điểm danh tay (`PRESENT`/`ABSENT`) và No-show tự động (BR-53). Quan hệ 1-1 với `ENROLLMENTS` (1 lượt đăng ký chỉ điểm danh 1 lần).

| Field | Vai trò |
|---|---|
| `AttendanceId` (PK) | Định danh |
| `EnrollmentId` (FK, **unique**) | Điểm danh cho lượt đăng ký nào — **unique** enforce đúng quan hệ 1-1 (constraint #17). `SessionId`/`MemberId` **không** lưu riêng nữa (bỏ 10/09/2026 (4)) — Enrollment đã đại diện "Member tham gia Session" nên 2 field này suy ra 100% qua `EnrollmentId`, giữ lại chỉ tạo rủi ro lệch dữ liệu mà không có lợi ích thật ở quy mô đồ án |
| `Status` | `PRESENT/ABSENT/NO_SHOW` — `PRESENT`/`ABSENT` do người ghi tay, `NO_SHOW` do `AttendanceFinalizerJob` tự sinh sau `EndAtUtc` nếu không có check-in |
| `CheckInTime` (nullable) | Thời điểm check-in thật (nếu có) |
| `CheckedInByUserId` (FK, nullable) | Ai thực hiện check-in (Coach/Receptionist) — null nếu do job tự động tạo (NO_SHOW) |

### `GYM_CHECKINS` (mới, 18/09/2026)
**Mục đích:** ghi nhận Member ra vào tập Gym/Fitness **tự do, không qua đặt lịch** — tách khỏi Class booking. Chỉ Receptionist ghi nhận — xem BR-64.

| Field | Vai trò |
|---|---|
| `CheckInId` (PK) | Định danh |
| `MemberId` (FK) | Ai check-in |
| `CheckedInByUserId` (FK, not null) | Lễ tân nào thực hiện — luôn có giá trị, không phải self-service |
| `CheckInTime` | Mốc check-in (UTC) |
| `CheckOutTime` | Mốc check-out theo BR-64 |

Điều kiện tạo (BR-64): Member phải có Membership `Active`; Gym không giới hạn trong Membership validity và không trừ quota/session.

---

## Module: Training (Workout)

### `WORKOUT_PLANS`
**Mục đích:** kế hoạch tập do Coach lập cho 1 Member — chỉ được tạo nếu Coach có `COACH_MEMBER_RELATIONSHIP` ACTIVE với Member đó (đảm bảo đúng quyền phụ trách).

| Field | Vai trò |
|---|---|
| `PlanId` (PK) | Định danh kế hoạch |
| `MemberId` (FK) | Kế hoạch dành cho ai |
| `CoachId` (FK) | Ai lập |
| `RelationshipId` (FK) | Trỏ về đúng quan hệ Coach–Member cho phép hành động này — dùng để authorize + audit |
| `Goal` / `Level` | Copy/snapshot mục tiêu & trình độ tại thời điểm lập plan (có thể khác `MEMBER_TRAINING_PROFILE` hiện tại nếu profile đã update sau đó) |
| `CreatedAt` | Mốc tạo plan |

### `WORKOUT_PLAN_ITEMS`
**Mục đích:** từng bài tập cụ thể trong 1 kế hoạch — tách bảng con vì 1 plan có nhiều bài tập (1–N).

| Field | Vai trò |
|---|---|
| `ItemId` (PK) | Định danh dòng bài tập |
| `PlanId` (FK) | Thuộc plan nào |
| `Exercise` | Tên bài tập |
| `Sets` / `Reps` | Số hiệp / số lần — thông số tập luyện cụ thể |
| `Notes` | Ghi chú thêm (tempo, nghỉ giữa hiệp...) |

### `WORKOUT_RESULTS`
**Mục đích:** ghi nhận **kết quả tập thực tế** sau 1 session — khác `WORKOUT_PLANS` (kế hoạch, việc *sẽ* làm) ở chỗ đây là log việc *đã* xảy ra, gắn với đúng buổi học **mà Member thực sự có đăng ký** (qua `ENROLLMENTS`).

| Field | Vai trò |
|---|---|
| `ResultId` (PK) | Định danh |
| `EnrollmentId` (FK) | Kết quả của lượt đăng ký nào — thay cho `session_id` + `member_id` cũ (2 FK độc lập, không ràng buộc lẫn nhau — trước đây DB không chặn được việc ghi kết quả cho 1 Member chưa từng đăng ký session đó). Đổi 10/09/2026 (4): dùng `EnrollmentId` khiến DB tự đảm bảo tính toàn vẹn này; `SessionId`/`MemberId` suy ra qua JOIN `ENROLLMENTS` khi cần. **Lưu ý:** FK chỉ đảm bảo Enrollment tồn tại, chưa đảm bảo còn hợp lệ (`Status = CONFIRMED`) — service phải kiểm tra BR-61; không thêm điều kiện Present |
| `CoachId` (FK) | Ai ghi nhận — không suy ra được qua Enrollment nên vẫn giữ FK riêng |
| `ProgressNote` | Ghi chú tiến độ (khách quan — vd "nâng được thêm 5kg") |
| `CoachComment` | Nhận xét của Coach (định tính) |
| `RecordedAt` | Mốc ghi nhận |

---

## Module: Payment

> **Đã chốt theo BR-79–BR-95.** Invoice được tạo tại checkout, chỉ thanh toán đủ một lần bằng VNPay-QR và tối đa một Payment thành công. PaymentAttempt có thể tạo lại; Refund tách theo InvoiceItem và chỉ backend gọi VNPay.

### `INVOICES`
**Mục đích:** chứng từ checkout bất biến sau khi Paid, giữ người thụ hưởng, người khởi tạo và tổng tiền snapshot.

| Field | Vai trò |
|---|---|
| `InvoiceId` (PK) | Định danh nội bộ |
| `InvoiceNumber` | Mã hóa đơn dễ đọc, **unique**, sinh từ DB sequence (không random ở app) để tránh trùng khi 2 request song song (constraint #5, BR-58) |
| `BeneficiaryMemberId` (FK) | Member nhận Membership/PT; tách khỏi người checkout |
| `CreatedByUserId` (FK) | Member tự checkout hoặc Receptionist thao tác hộ |
| `TotalAmount` | Tổng snapshot các InvoiceItem; VND, phải trả đủ một lần, không cọc/trả góp/thiếu/thừa |
| `Status` | `PENDING_PAYMENT`, `PAID`, `PAID_AFTER_RECONCILIATION`, `EXPIRED`, `CANCELLED`; Paid không sửa/xóa/void |
| `IssuedAt` | Mốc tạo Invoice tại checkout; gửi email qua outbox |

### `INVOICE_ITEMS`
**Mục đích:** snapshot từng Membership/PT item và là đơn vị tính eligibility/số tiền Refund.

| Field | Vai trò |
|---|---|
| `ItemId` (PK) | Định danh dòng |
| `InvoiceId` (FK) | Thuộc hóa đơn nào |
| `ItemType` / `RelatedEntityId` | `MEMBERSHIP` hoặc `PT`; tham chiếu catalog/plan tại checkout |
| `Description` / `UnitPrice` / `Quantity` / `LineAmount` | Snapshot tên gói, đơn giá, số lượng và thành tiền; tổng LineAmount phải bằng Invoice.TotalAmount |

### `PAYMENT_ATTEMPTS`
**Mục đích:** mỗi lần mở thanh toán VNPay cho một Invoice, cho phép retry mà không tạo Payment thành công trùng.

| Field | Vai trò |
|---|---|
| `PaymentAttemptId` (PK) / `InvoiceId` (FK) | Định danh attempt và Invoice được thanh toán |
| `VnpTxnRef` | Unique toàn hệ thống; ký request và đối chiếu IPN/QueryDR |
| `Amount` | Phải khớp chính xác Invoice.TotalAmount |
| `ExpiresAt` | Lấy theo `vnp_ExpireDate` Sandbox/merchant hỗ trợ, không hard-code 24 giờ |
| `Status` | `PENDING`, `EXPIRED`, `SUCCEEDED`, `FAILED`, `RECONCILIATION_REQUIRED` |
| Gateway payload/timestamps | Lưu dữ liệu cần đối soát, không lưu secret |

### `PAYMENTS`
**Mục đích:** bản ghi thu tiền đã được backend xác minh qua IPN hoặc QueryDR; mỗi Invoice tối đa một Payment `SUCCESS`.

| Field | Vai trò |
|---|---|
| `PaymentId` (PK) | Định danh giao dịch |
| `InvoiceId` (FK) | Thanh toán cho hóa đơn nào |
| `PaymentAttemptId` (FK) | Attempt đã được xác minh thành công |
| `Amount` | Bằng Invoice.TotalAmount |
| `Method` | `VNPAY_QR` |
| `VnpTransactionNo` | Unique khi có giá trị; mã giao dịch VNPay dùng đối soát |
| `Status` | `SUCCESS`; không cho Receptionist cập nhật thủ công |
| `PaidAt` / `VnpPayDate` | Mốc thu tiền; dùng ngày Việt Nam để ghi nhận doanh thu và StartDate lần mua mới |

### `REFUNDS`
**Mục đích:** yêu cầu và kết quả hoàn tiền theo một InvoiceItem; không gộp với correction/discount.

| Field | Vai trò |
|---|---|
| `RefundId` (PK) / `InvoiceItemId` / `PaymentId` | Định danh Refund, item được hoàn và nguồn tiền đã thu |
| `RequestedByUserId` / `OnBehalfOfMemberId` | Member tự yêu cầu hoặc Receptionist tạo hộ; trường hợp tạo hộ bắt buộc lý do |
| `Reason` / `CenterFault` | Lý do audit; lỗi trung tâm mở ngoại lệ theo phần quyền lợi chưa dùng |
| `SystemCalculatedAmount` / `ApprovedAmount` | Chuẩn là 50% InvoiceItem đủ điều kiện; Manager không được vượt mức hệ thống tính |
| `Status` | `REQUESTED → APPROVED/REJECTED`; sau duyệt: `PROCESSING → COMPLETED/FAILED/RECONCILIATION_REQUIRED` |
| `ApprovedByUserId` / `ApprovedAt` | Chỉ Center Manager approve/reject |
| `VnpRequestId` / gateway reference | Unique/idempotent; chỉ backend gọi VNPay Refund API |
| `CompletedAt` | Mốc thực hoàn, dùng ghi `Refunded` và `NetCollected`; không ghi giảm doanh thu khi mới approve |

---

## Module: hỗ trợ hệ thống (Notification, AI, Audit)

### `NOTIFICATIONS`
**Mục đích:** hàng đợi thông báo gửi cho user (đổi lịch, sắp hết hạn gói, nhận thanh toán...) — MVP có thể chỉ lưu trong DB (chưa gửi SMS/email thật), nhưng schema đã tính sẵn kênh + retry.

| Field | Vai trò |
|---|---|
| `NotificationId` (PK) | Định danh |
| `UserId` (FK) | Gửi cho ai |
| `Channel` | `IN_APP/EMAIL/SMS` — kênh gửi |
| `SourceEventType` | `CLASS_CANCELLED/SCHEDULE_CHANGED/PACKAGE_EXPIRING/PAYMENT_RECEIVED` — loại sự kiện sinh ra thông báo này |
| `SourceEntityId` (nullable) | Trỏ tới entity gây ra sự kiện (vd `SessionId` nếu là `CLASS_CANCELLED`) |
| `Message` | Nội dung hiển thị |
| `Status` | `PENDING/SENT/FAILED/READ` — vòng đời gửi + đã đọc chưa |
| `RetryCount` | Số lần đã thử gửi lại (khi `FAILED`) |
| `LastAttemptAt` / `SentAt` | Mốc lần thử gần nhất / mốc gửi thành công |

### `AI_LOGS`
**Mục đích:** log mọi lượt gọi tính năng AI (gợi ý bài tập — Flow 5) — phục vụ debug, đo hiệu năng, và audit việc AI trả lời gì cho ai. *(AI assistant/chat — Flow 6 — đã hạ xuống stretch, chỉ log nếu flow đó thực sự được triển khai; xem `00-Source-of-Truth.md` §1.4.)*

| Field | Vai trò |
|---|---|
| `LogId` (PK) | Định danh |
| `UserId` (FK) | Ai gọi AI |
| `QueryType` | Loại truy vấn (vd `WORKOUT_SUGGESTION`; `CHAT` chỉ áp dụng nếu Flow 6 — stretch — được triển khai) |
| `InputPayload` (jsonb) | Input thực tế gửi cho AI — debug khi kết quả sai |
| `ResponsePayload` (jsonb) | Kết quả AI trả về |
| `ResponseTimeMs` | Đo hiệu năng, phát hiện AI chậm/timeout |
| `CreatedAt` | Mốc gọi |

### `AUDIT_LOGS`
**Mục đích:** nhật ký thao tác quan trọng trên hệ thống (yêu cầu của Center Manager: "xem lịch sử thao tác quan trọng") — ai đổi gì, từ giá trị nào sang giá trị nào.

| Field | Vai trò |
|---|---|
| `AuditId` (PK) | Định danh |
| `UserId` (FK) | Ai thực hiện thao tác |
| `Action` | Loại hành động (vd `UPDATE_PACKAGE_STATUS`) |
| `TargetEntity` / `TargetId` | Thao tác tác động lên entity/record nào |
| `OldValue` / `NewValue` (jsonb, nullable) | Giá trị trước/sau — truy vết thay đổi thực tế, không chỉ ghi "đã sửa" chung chung |
| `IpAddress` | Nguồn thực hiện — phục vụ điều tra bảo mật nếu cần |
| `Timestamp` | Mốc thời gian |

---

*Nguồn: `docs/Center-Management-System-Design-v2.md` §1 (ERD), §2 (state transition), §3 (constraints). Field nào còn dấu `?` hoặc chưa rõ nghiệp vụ — hỏi lại BA/team lead trước khi code, đừng tự suy diễn (đúng nguyên tắc ở `docs/00-Source-of-Truth.md` §6).*

## Bổ sung field đã duyệt ngày 22/09/2026

Phần này là ghi chú lịch sử của schema v1.4. Các dòng Payment cũ đã được thay bằng module Payment theo Business Rules v1.8 ở trên.

| Entity.Field | Mục đích và ràng buộc |
|---|---|
| Enrollment.CancellationDeadlineHours | **Không dùng:** deadline class cố định 30 phút, không snapshot theo booking |
| SystemSetting.Key/Value/ValueType | Không dùng để cấu hình deadline class 12 giờ; các setting khác giữ theo rule tương ứng |
| SystemSetting.UpdatedAt/UpdatedByUserId | UTC và FK actor, actor có thể null cho seed; chỉnh qua UI có audit |
| ClassSession.BaselineCapacity | Thiết kế cũ; rule hiện hành chỉ chốt Capacity class là số dương và tối đa 20 |
| Invoice.DueDateUtc/FirstDepositAtUtc | **Không dùng:** không cọc; expiry đặt trên từng PaymentAttempt theo `vnp_ExpireDate` được hỗ trợ |
| MemberPackage.StackingApprovedByUserId/StackingApprovedAtUtc/StackingApprovalReason | Thiết kế cũ, không có trong Membership rules v1.6; không dùng làm yêu cầu code |
| MembershipPackage.IsActive/Description | bool bán mới, mô tả nullable; ngừng bán không tước quyền gói đã bán |
| AuditLog.TargetId | string cùng TargetEntity để ghi entity có khóa Guid/int/string; không phải một FK chung tới mọi bảng |
| PaymentAdjustment.* | **Không dùng cho Refund:** thay bằng entity `REFUNDS` theo InvoiceItem và workflow BR-90–BR-95 |
| ReportExport.ReportExportId/RequestedByUserId | Guid ID, FK chủ sở hữu; download qua API kiểm quyền |
| ReportExport.ReportType/ParametersJson/Format | loại report whitelist, filter và cột đã chọn, string format Csv/Pdf; không nhận storage path từ client |
| ReportExport.Status/FailureReason | ReportExportStatus theo SSOT; Failed lưu lỗi an toàn, retry; Completed chỉ khi file sẵn sàng |
| ReportExport.RowCount/SizeBytes | số dòng và kích thước file thành công |
| ReportExport.CreatedAt/CompletedAt/ExpiresAt | thời điểm UTC; giữ file thành công ít nhất 6 tháng kể từ CompletedAt |
| ReportExport.IsDeleted/DeletedAt | chỉ xóa sau retention; list/download phải chặn link cũ; file riêng tư suy ra từ ID/format dưới storage root |

Các đại lượng báo cáo đã duyệt: `GrossCollected` là tổng Payment thành công theo ngày thu tiền; `Refunded` là tổng Refund `COMPLETED` theo ngày hoàn tất; `NetCollected = GrossCollected - Refunded`. Không giảm revenue khi Refund mới Requested/Approved/Processing.

## Field Identity đã duyệt — 26/09/2026

Các field này mô tả yêu cầu BR-60/BR-78; trạng thái code/migration được đánh giá riêng khi triển khai.

| Entity.Field | Mục đích và ràng buộc |
|---|---|
| EmailOtp (entity mới, module Identity) | 1 dòng/email (unique). Phục vụ BR-78 — xác thực OTP khi Register bằng email/mật khẩu |
| EmailOtp.Email | Email chuẩn hóa; chỉ OTP mới nhất còn hiệu lực; rate limit theo email và IP |
| EmailOtp.CodeHash | Hash của mã OTP 6 số; không lưu hoặc log plaintext |
| EmailOtp.ExpiresAt | Mã hết hạn sau 10 phút kể từ lần yêu cầu gần nhất |
| EmailOtp.Attempts | Số lần verify sai liên tiếp cho mã hiện tại; vượt 5 lần → phải yêu cầu mã mới |
| EmailOtp.ConsumedAt | null = còn dùng được; set khi verify đúng, mã không dùng lại được lần 2 |
| Google onboarding state | Email mới qua Google tạo account chờ thiết lập password; user phải nhập/confirm password mạnh trước khi dùng chức năng protected |
| AuthResponse.SuggestedPassword | **Không sử dụng.** Hệ thống không sinh hoặc gửi mật khẩu gợi ý theo BR-60 v1.8 |
