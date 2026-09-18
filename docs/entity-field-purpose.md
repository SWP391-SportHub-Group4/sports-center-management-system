# Mục đích các Entity & vai trò từng Field (SportHub)

> Rút ra từ ERD v2 (`docs/Center-Management-System-Design-v2.md` §1), state transition (§2) và bảng ràng buộc DB (§3).
> File tham khảo nhanh — **chưa** đưa vào `docs/`, không phải nguồn chính thức; nếu có sai lệch, `docs/Center-Management-System-Design-v2.md` và `docs/00-Source-of-Truth.md` mới là nguồn thật.
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
| `Phone` | Liên hệ, có thể dùng cho notification kênh SMS sau này — **unique nếu có giá trị** (nullable, cho phép nhiều user cùng để trống; BR-54) |

### `USER_EXTERNAL_LOGINS`
**Mục đích:** đăng nhập qua provider ngoài (Google, sau này có thể thêm Facebook...) — quan hệ **1-N thật** với `USER_ACCOUNTS` (khác `USER_CREDENTIALS`/`USER_PROFILES` là 1-1), vì 1 user có thể gắn nhiều provider theo thời gian. Đây là lý do entity này cần tách bảng riêng thay vì nhét thêm cột `google_id`/`google_refresh_token`... trực tiếp vào `USER_ACCOUNTS`.

| Field | Vai trò |
|---|---|
| `ExternalLoginId` (PK) | Định danh dòng link |
| `UserId` (FK → USER_ACCOUNTS) | Provider này thuộc về user nào |
| `Provider` | `GOOGLE` (enum `ExternalAuthProvider`, xem SSOT §3) — hiện chỉ Google, mở rộng provider khác không cần đổi entity |
| `ProviderUserId` | ID phía provider trả về (Google `sub`) — cùng `Provider` tạo **unique composite**, chặn 1 tài khoản Google bị link vào 2 `USER_ACCOUNTS` khác nhau |
| `RefreshToken` | Nullable, MVP **chưa mã hoá** — nợ kỹ thuật, xem Open Questions ở `00-Source-of-Truth.md` §7. Không lưu access token vì sống ngắn hạn, không cần persist |
| `CreatedAt` | Mốc link provider — cũng là mốc dùng để kiểm tra `(UserId, Provider)` unique (1 user không link trùng 1 provider 2 lần) |

**Business rule đăng nhập Google (chưa chép chính thức vào Business Rules v1.2 — xem Open Questions):** nếu `POST /api/auth/google` nhận email đã tồn tại ở `USER_ACCOUNTS` nhưng chưa có `USER_EXTERNAL_LOGINS` khớp → **không** tự tạo account mới, **không** tự link — trả lỗi yêu cầu đăng nhập password trước rồi link từ Cài đặt (`POST /api/auth/google/link`, cần JWT). Chặn kiểu tấn công account pre-hijacking.

### `ROLES`
**Mục đích:** danh mục cố định 4 vai trò trong hệ thống, tách riêng để RBAC dễ mở rộng (thêm role mới không cần đổi schema `USER_ACCOUNTS`).

| Field | Vai trò |
|---|---|
| `RoleId` (PK) | Khóa để `UserAccount.RoleId` trỏ vào |
| `RoleName` | `MANAGER, COACH, MEMBER, RECEPTIONIST` — dùng để check quyền ở middleware/policy — **unique** (4 giá trị cố định, seed data; BR-55) |

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
**Mục đích:** **danh mục** gói tập trung tâm bán ra (template) — KHÔNG phải gói của 1 Member cụ thể (đó là `MEMBER_PACKAGES` bên dưới). Ví dụ: "Gói 3 tháng không giới hạn", "Gói 10 buổi".

| Field | Vai trò |
|---|---|
| `PackageId` (PK) | Định danh gói |
| `Name` | Hiển thị cho Member chọn mua — **unique trong catalog** (BR-56) |
| `Price` | Giá bán — nguồn để tạo `InvoiceItem.Amount` khi Member mua |
| `DurationDays` | Thời hạn sử dụng gói (tính từ `MemberPackage.StartDate`) |
| `SessionLimit` | Giới hạn số buổi (`nullable` = không giới hạn) — nguồn gốc `MemberPackage.RemainingSessions` |

### `MEMBER_PACKAGES`
**Mục đích:** **instance thật** của 1 gói mà 1 Member đã mua/đang dùng — đây là entity trung tâm để kiểm tra "Member còn quyền đăng ký lớp không" (BR-16).

| Field | Vai trò |
|---|---|
| `MemberPackageId` (PK) | Định danh |
| `MemberId` (FK) | Ai sở hữu gói này |
| `PackageId` (FK) | Mua theo template gói nào |
| `StartDate` / `EndDate` | Xác định gói còn hiệu lực theo thời gian hay không (điều kiện `EXPIRED`, BR-11) |
| `RemainingSessions` | Số buổi còn lại — **trừ nguyên tử (atomic)** mỗi lần Enrollment thành công (constraint #3), là điều kiện chặn overbooking theo buổi |
| `Status` | `PENDING_PAYMENT → ACTIVE → EXPIRED/CANCELLED` — xem state machine §2.1; chỉ gói `ACTIVE` mới được dùng để enroll |
| `Version` | Optimistic concurrency — tránh lost-update khi 2 request cùng sửa 1 gói cùng lúc (constraint #8) |

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
**Mục đích:** định nghĩa **loại lớp** (ví dụ "Yoga cơ bản") — là template, không phải 1 buổi học cụ thể (đó là `CLASS_SESSIONS`).

| Field | Vai trò |
|---|---|
| `ClassId` (PK) | Định danh lớp |
| `Name` | Hiển thị cho Member chọn |
| `Discipline` | Bộ môn — giá trị hợp lệ (chốt 18/09/2026): `PersonalTraining`, `Yoga`, `GroupX`. KHÔNG có `Gym` — Gym/Fitness ra vào tự do, không qua `Class`, xem `GYM_CHECKINS` bên dưới |
| `DefaultRoomId` (FK) | Phòng mặc định khi sinh session, có thể bị override ở từng session |
| `DefaultCoachId` (FK, nullable) | HLV mặc định phụ trách lớp, cũng có thể override ở từng session |
| `Capacity` | Sức chứa mặc định của lớp — 1 trong 2 yếu tố tính MIN(Room, Class) cho session (BR-51) |
| `Status` | `ACTIVE/ARCHIVED` — lớp ngừng mở không xóa cứng (giữ lịch sử session/enrollment cũ) |

### `CLASS_RECURRENCE`
**Mục đích:** định nghĩa **quy luật lặp lại** của 1 lớp (ví dụ "Thứ 2-4-6, 18h-19h30") — tách riêng khỏi session cụ thể để 1 job nền có thể sinh trước hàng loạt `CLASS_SESSIONS` mà không phải nhập tay từng buổi.

| Field | Vai trò |
|---|---|
| `RecurrenceId` (PK) | Định danh pattern |
| `ClassId` (FK) | Pattern này thuộc lớp nào |
| `DaysOfWeek` | Các thứ trong tuần lặp lại (vd `MON,WED,FRI`) |
| `StartTimeLocal` / `EndTimeLocal` | Giờ bắt đầu/kết thúc theo giờ địa phương (không phải UTC — vì lịch lặp theo "giờ trong ngày", không theo mốc tuyệt đối) |
| `Timezone` | Neo giờ local về đúng múi giờ (`Asia/Ho_Chi_Minh`) khi convert sang `StartAtUtc`/`EndAtUtc` của session |
| `EffectiveFrom` / `EffectiveTo` | Khoảng thời gian pattern này còn áp dụng — cho phép đổi lịch theo kỳ mà không xóa lịch sử session cũ |

### `CLASS_SESSIONS`
**Mục đích:** **1 buổi học cụ thể**, có ngày giờ thật — là entity Member thực sự đăng ký vào (không đăng ký vào `CLASSES`). Được sinh tự động từ `CLASS_RECURRENCE`, hoặc tạo ad-hoc.

| Field | Vai trò |
|---|---|
| `SessionId` (PK) | Định danh buổi học |
| `ClassId` (FK) | Buổi học thuộc lớp nào |
| `RecurrenceId` (FK, nullable) | Sinh ra từ pattern nào — `null` nghĩa là session ad-hoc hoặc đã bị reschedule tách khỏi pattern |
| `RoomId` (FK) | Phòng thực tế của buổi này (có thể khác `Class.DefaultRoomId` nếu đổi phòng) |
| `CoachId` (FK) | HLV thực tế dạy buổi này (có thể khác default nếu đổi HLV) |
| `StartAtUtc` / `EndAtUtc` | Mốc thời gian tuyệt đối (UTC) — dùng để check trùng lịch, tính deadline hủy, tính No-show |
| `Capacity` | Sức chứa thực tế buổi này (≤ MIN(Room, Class) tại thời điểm tạo — Manager chỉ được hạ, BR-51) |
| `ConfirmedCount` | **Denormalized**, tăng/giảm nguyên tử mỗi khi có Enrollment CONFIRMED/hủy — dùng để chặn overbooking bằng 1 UPDATE có điều kiện thay vì COUNT() (constraint #2) |
| `Status` | `SCHEDULED/RESCHEDULED/CANCELLED/COMPLETED` — vòng đời của chính buổi học |
| `RescheduledFromSessionId` (FK, nullable) | Nếu buổi này là kết quả dời lịch từ buổi khác, trỏ về buổi gốc — giữ vết lịch sử đổi lịch |

### `ENROLLMENTS`
**Mục đích:** ghi nhận **1 Member đăng ký vào 1 session cụ thể**, gắn với gói nào bị trừ buổi — là entity trung tâm của flow "Đặt lớp".

| Field | Vai trò |
|---|---|
| `EnrollmentId` (PK) | Định danh lượt đăng ký |
| `SessionId` (FK) | Đăng ký vào buổi nào |
| `MemberId` (FK) | Ai đăng ký |
| `MemberPackageId` (FK) | Gói nào bị trừ `RemainingSessions` cho lượt đăng ký này — cần thiết vì 1 Member có thể có nhiều gói cùng lúc |
| `Status` | `CONFIRMED/CANCELLED_ON_TIME/CANCELLED_LATE` — quyết định có hoàn credit hay không (BR-17/18), xem state machine §2.2 |
| `RegisteredAt` | Mốc đăng ký, dùng tính thứ tự/độ ưu tiên nếu cần |
| `CancelledAt` | Mốc hủy — so với deadline (đọc từ cấu hình, BR-50) để phân loại ON_TIME/LATE |
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
**Mục đích:** ghi nhận Member ra vào tập Gym/Fitness **tự do, không qua đặt lịch** — tách hẳn khỏi `CLASS_SESSIONS`/`ENROLLMENTS`/`ATTENDANCE` (những entity đó chỉ dùng cho Personal Training/Yoga/Group X, xem field `Discipline` ở `CLASSES` phía trên). Chỉ Lễ tân (Receptionist) tạo được — xem BR-64.

| Field | Vai trò |
|---|---|
| `CheckInId` (PK) | Định danh |
| `MemberId` (FK) | Ai check-in |
| `CheckedInByUserId` (FK, not null) | Lễ tân nào thực hiện — luôn có giá trị, không phải self-service |
| `CheckInTime` | Mốc check-in (UTC) |

Điều kiện tạo (BR-64): Member phải có ≥1 `MemberPackage` đang `Active` tại thời điểm check-in; không giới hạn số lần/ngày; **không** trừ `RemainingSessions` của bất kỳ gói nào (khác `Enrollment`). Không lưu `MemberPackageId` — chỉ cần kiểm tra tồn tại, không cần biết dùng gói nào.

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
| `EnrollmentId` (FK) | Kết quả của lượt đăng ký nào — thay cho `session_id` + `member_id` cũ (2 FK độc lập, không ràng buộc lẫn nhau — trước đây DB không chặn được việc ghi kết quả cho 1 Member chưa từng đăng ký session đó). Đổi 10/09/2026 (4): dùng `EnrollmentId` khiến DB tự đảm bảo tính toàn vẹn này; `SessionId`/`MemberId` suy ra qua JOIN `ENROLLMENTS` khi cần. **Lưu ý:** FK chỉ đảm bảo Enrollment tồn tại, chưa đảm bảo còn hợp lệ (`Status = CONFIRMED`) — service layer phải tự check thêm (xem Open Questions) |
| `CoachId` (FK) | Ai ghi nhận — không suy ra được qua Enrollment nên vẫn giữ FK riêng |
| `ProgressNote` | Ghi chú tiến độ (khách quan — vd "nâng được thêm 5kg") |
| `CoachComment` | Nhận xét của Coach (định tính) |
| `RecordedAt` | Mốc ghi nhận |

---

## Module: Payment

### `INVOICES`
**Mục đích:** hóa đơn — **bất biến** (BR-40), tạo **ngay khi Member chọn gói/dịch vụ**, TRƯỚC khi thanh toán (BR-30 v1.2). Không bao giờ bị xóa, chỉ chuyển trạng thái `VOID` khi cần hủy toàn phần.

| Field | Vai trò |
|---|---|
| `InvoiceId` (PK) | Định danh nội bộ |
| `InvoiceNumber` | Mã hóa đơn dễ đọc, **unique**, sinh từ DB sequence (không random ở app) để tránh trùng khi 2 request song song (constraint #5, BR-58) |
| `MemberId` (FK) | Hóa đơn xuất cho ai |
| `IssuedByUserId` (FK) | Nhân viên nào xuất (thường Receptionist) — audit |
| `MemberPackageId` (FK, nullable) | Nếu hóa đơn gắn với 1 gói cụ thể thì trỏ tới đó (nullable vì có thể là phí khác, vd penalty) |
| `TotalAmount` | Tổng tiền phải thu — chuẩn để so sánh với tổng `Payment.Amount` (constraint #6, BR-41) |
| `Status` | `ISSUED → PARTIALLY_PAID → PAID` hoặc `→ VOID` — xem state machine §2.3 |
| `IssuedAt` | Mốc xuất hóa đơn |

### `INVOICE_ITEMS`
**Mục đích:** dòng chi tiết trong hóa đơn — 1 Invoice có thể có nhiều dòng (vd: tiền gói + phí phạt trong cùng 1 hóa đơn).

| Field | Vai trò |
|---|---|
| `ItemId` (PK) | Định danh dòng |
| `InvoiceId` (FK) | Thuộc hóa đơn nào |
| `Description` | Diễn giải hiển thị trên hóa đơn |
| `Amount` | Số tiền của dòng này — tổng các dòng phải khớp `Invoice.TotalAmount` |
| `RelatedEntityType` | `PACKAGE/CLASS_FEE/PENALTY` — dòng này phát sinh từ nguồn nào |
| `RelatedEntityId` (nullable) | Trỏ tới entity nguồn cụ thể (vd `MemberPackageId`) để truy vết |

### `PAYMENTS`
**Mục đích:** từng **giao dịch thu tiền** thật cho 1 Invoice — tách khỏi Invoice vì có thể trả nhiều lần/nhiều phương thức (Invoice bất biến, Payment là các lần thu nối tiếp).

| Field | Vai trò |
|---|---|
| `PaymentId` (PK) | Định danh giao dịch |
| `InvoiceId` (FK) | Thanh toán cho hóa đơn nào |
| `Amount` | Số tiền của lần thu này — tổng các `Amount` (status SUCCESS) không được vượt `Invoice.TotalAmount` (BR-41, constraint #6) |
| `Method` | `CASH/CARD/TRANSFER/EWALLET` — MVP chủ yếu ghi nhận thủ công |
| `ReferenceCode` (nullable) | Mã tham chiếu từ cổng thanh toán ngoài (nếu có) |
| `Status` | `PENDING/SUCCESS/FAILED` — chỉ `SUCCESS` mới tính vào tổng đã thu |
| `ReceivedByUserId` (FK) | Nhân viên nào nhận tiền — audit, thường Receptionist |
| `PaidAt` | Mốc thanh toán — dùng cho báo cáo doanh thu theo thời gian |

### `PAYMENT_ADJUSTMENTS`
**Mục đích:** điều chỉnh sau khi đã có Invoice/Payment — hoàn tiền, sửa sai, chiết khấu — có **workflow duyệt riêng** (không ai tự ý sửa hóa đơn/thanh toán gốc, giữ đúng nguyên tắc Invoice bất biến).

| Field | Vai trò |
|---|---|
| `AdjustmentId` (PK) | Định danh |
| `InvoiceId` (FK) | Điều chỉnh cho hóa đơn nào |
| `PaymentId` (FK, nullable) | Nếu liên quan 1 giao dịch thu tiền cụ thể thì trỏ tới đó |
| `Type` | `REFUND/CORRECTION/DISCOUNT` — loại điều chỉnh, quyết định công thức tính (BR-52 cho REFUND) |
| `Amount` | Số tiền điều chỉnh |
| `Reason` | Lý do — bắt buộc để Manager duyệt có căn cứ |
| `Status` | `REQUESTED → APPROVED/REJECTED → COMPLETED` — Receptionist tạo, **Manager phải duyệt, không được tự duyệt** (BR-42), xem state machine §2.4 |
| `RequestedByUserId` (FK) | Ai yêu cầu |
| `ApprovedByUserId` (FK, nullable) | Ai duyệt — null nếu chưa duyệt/bị từ chối |
| `CreatedAt` / `ResolvedAt` (nullable) | Mốc tạo yêu cầu / mốc xử lý xong — SLA, báo cáo |

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
