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

---

## Module: Identity

> **Cập nhật 10/09/2026 (2) — Google Login:** entity `USERS` (dòng cũ, đã bỏ) được tách thành 4 entity dưới đây — `USER_ACCOUNTS` (định danh + vòng đời), `USER_CREDENTIALS` (auth nội bộ), `USER_PROFILES` (hiển thị), `USER_EXTERNAL_LOGINS` (auth ngoài, mới). Lý do: hỗ trợ đăng nhập Google (nay là flow bắt buộc) cần quan hệ 1-N thật cho provider ngoài, và tách rõ dữ liệu có vòng đời khác nhau để giảm conflict khi nhiều người cùng sửa song song. Chi tiết: `00-Source-of-Truth.md` §2.

### `USER_ACCOUNTS`
**Mục đích:** bảng định danh + vòng đời gốc — mọi vai trò (Manager, Coach, Member, Receptionist) đều là 1 row ở đây, phân biệt qua `role_id`. Không tách bảng riêng cho từng vai trò để tránh trùng lặp logic auth/login. Đây là bảng cha duy nhất mà gần như mọi entity khác (member, coach, staff...) trỏ FK vào — cố tình giữ tối giản (chỉ định danh + vòng đời) để hầu như không bao giờ cần đổi schema, tách khỏi phần auth (`USER_CREDENTIALS`/`USER_EXTERNAL_LOGINS`) và phần hiển thị (`USER_PROFILES`) vốn thay đổi thường xuyên hơn.

| Field | Vai trò |
|---|---|
| `user_id` (PK) | Định danh duy nhất, dùng làm khóa ngoại ở gần như mọi entity khác (member, coach, staff đều trỏ về đây) |
| `email` | Định danh đăng nhập/liên hệ — **unique không phân biệt hoa/thường** (BR-1, BR-49, index `LOWER(email)`). Đặt ở đây (không phải `USER_CREDENTIALS`) vì email là định danh, không phải bí mật — nhiều module (Invoice, Notification) cần đọc mà không nên phải đụng tới bảng chứa `password_hash` |
| `role_id` (FK → ROLES) | Quyết định phân quyền (RBAC) — 1 user chỉ có 1 role |
| `status` | `ACTIVE / BANNED / DEACTIVATED` — kiểm soát user có được login/thao tác hay không, không xóa cứng user (giữ lịch sử payment/attendance) |
| `created_at` | Audit, hiển thị "thành viên từ ngày..." |

### `USER_CREDENTIALS`
**Mục đích:** lưu thông tin xác thực **nội bộ** (local password) — tách khỏi `USER_ACCOUNTS` vì đây là dữ liệu nhạy cảm, muốn cô lập khỏi các query hiển thị/business thông thường (tránh vô tình `SELECT`/trả về `password_hash` trong response). Quan hệ 1–1 với `USER_ACCOUNTS` (chung PK) vì 1 user chỉ có đúng 1 password tại 1 thời điểm — khác `USER_EXTERNAL_LOGINS` (1-N thật).

| Field | Vai trò |
|---|---|
| `user_id` (PK, FK → USER_ACCOUNTS) | Cùng giá trị PK với `USER_ACCOUNTS.user_id` — quan hệ 1–1 |
| `password_hash` | Lưu hash, không bao giờ lưu plaintext — dùng để xác thực khi login. **Nullable**: account tạo thuần qua Google (chưa từng đặt password nội bộ) sẽ để trống; `POST /api/auth/login` chỉ cho phép khi field này khác null |

### `USER_PROFILES`
**Mục đích:** thông tin **hiển thị** của user — tách khỏi `USER_ACCOUNTS` vì đây là dữ liệu không liên quan đến cơ chế đăng nhập/phân quyền, thay đổi theo nhu cầu UX (đổi tên, thêm field liên hệ...) độc lập với logic auth. Quan hệ 1–1 với `USER_ACCOUNTS` (chung PK).

| Field | Vai trò |
|---|---|
| `user_id` (PK, FK → USER_ACCOUNTS) | Cùng giá trị PK với `USER_ACCOUNTS.user_id` — quan hệ 1–1 |
| `full_name` | Hiển thị UI, in hóa đơn, thông báo |
| `phone` | Liên hệ, có thể dùng cho notification kênh SMS sau này — **unique nếu có giá trị** (nullable, cho phép nhiều user cùng để trống; BR-54) |

### `USER_EXTERNAL_LOGINS`
**Mục đích:** đăng nhập qua provider ngoài (Google, sau này có thể thêm Facebook...) — quan hệ **1-N thật** với `USER_ACCOUNTS` (khác `USER_CREDENTIALS`/`USER_PROFILES` là 1-1), vì 1 user có thể gắn nhiều provider theo thời gian. Đây là lý do entity này cần tách bảng riêng thay vì nhét thêm cột `google_id`/`google_refresh_token`... trực tiếp vào `USER_ACCOUNTS`.

| Field | Vai trò |
|---|---|
| `external_login_id` (PK) | Định danh dòng link |
| `user_id` (FK → USER_ACCOUNTS) | Provider này thuộc về user nào |
| `provider` | `GOOGLE` (enum `ExternalAuthProvider`, xem SSOT §3) — hiện chỉ Google, mở rộng provider khác không cần đổi entity |
| `provider_user_id` | ID phía provider trả về (Google `sub`) — cùng `provider` tạo **unique composite**, chặn 1 tài khoản Google bị link vào 2 `USER_ACCOUNTS` khác nhau |
| `refresh_token` | Nullable, MVP **chưa mã hoá** — nợ kỹ thuật, xem Open Questions ở `00-Source-of-Truth.md` §7. Không lưu access token vì sống ngắn hạn, không cần persist |
| `created_at` | Mốc link provider — cũng là mốc dùng để kiểm tra `(user_id, provider)` unique (1 user không link trùng 1 provider 2 lần) |

**Business rule đăng nhập Google (chưa chép chính thức vào Business Rules v1.2 — xem Open Questions):** nếu `POST /api/auth/google` nhận email đã tồn tại ở `USER_ACCOUNTS` nhưng chưa có `USER_EXTERNAL_LOGINS` khớp → **không** tự tạo account mới, **không** tự link — trả lỗi yêu cầu đăng nhập password trước rồi link từ Cài đặt (`POST /api/auth/google/link`, cần JWT). Chặn kiểu tấn công account pre-hijacking.

### `ROLES`
**Mục đích:** danh mục cố định 4 vai trò trong hệ thống, tách riêng để RBAC dễ mở rộng (thêm role mới không cần đổi schema `USER_ACCOUNTS`).

| Field | Vai trò |
|---|---|
| `role_id` (PK) | Khóa để `USER_ACCOUNTS.role_id` trỏ vào |
| `role_name` | `MANAGER, COACH, MEMBER, RECEPTIONIST` — dùng để check quyền ở middleware/policy — **unique** (4 giá trị cố định, seed data; BR-55) |

---

## Module: Training (hồ sơ & quan hệ — nền tảng cho AI/Workout)

### `MEMBER_TRAINING_PROFILE`
**Mục đích:** hồ sơ tập luyện của Member — **bắt buộc phải có dữ liệu thật** để AI gợi ý bài tập (BR-26 yêu cầu đủ 3 tham số: goal, level, lịch sử) thay vì để client tự gửi tham số (dễ bị giả mạo/không chính xác).

| Field | Vai trò |
|---|---|
| `profile_id` (PK) | Định danh hồ sơ |
| `member_id` (FK, unique) | 1 Member chỉ có 1 hồ sơ — ràng buộc 1–1 |
| `goal` | Mục tiêu tập (giảm cân, tăng cơ...) — input cho AI suggestion & để Coach tạo Workout Plan |
| `experience_level` | `BEGINNER/INTERMEDIATE/ADVANCED` — input cho AI + Coach điều chỉnh độ khó bài tập |
| `notes` | Ghi chú tự do (chấn thương, hạn chế...) — Coach tham khảo khi lên plan |
| `updated_at` | Biết hồ sơ có đang cũ/stale không (AI dựa vào profile cũ có thể gợi ý sai) |

### `COACH_MEMBER_RELATIONSHIP`
**Mục đích:** ghi nhận **ai là HLV phụ trách ai**, và **vì sao** (qua lớp học, cá nhân, hay Manager gán tay) — cần thiết vì 1 Coach chỉ được tạo Workout Plan / xem thông tin của Member mà mình thực sự phụ trách (BR-23/BR-24), không phải mọi Member.

| Field | Vai trò |
|---|---|
| `relationship_id` (PK) | Định danh quan hệ |
| `coach_id` (FK) | HLV phụ trách |
| `member_id` (FK) | Học viên được phụ trách |
| `source_type` | `CLASS_BASED / PERSONAL / ASSIGNED_BY_MANAGER` — nguồn gốc quan hệ, dùng để audit/giải trình sao có quyền truy cập |
| `class_id` (FK, nullable) | Nếu quan hệ phát sinh từ 1 lớp cụ thể (`CLASS_BASED`) thì trỏ tới lớp đó |
| `status` | `ACTIVE/ENDED` — chỉ quan hệ ACTIVE mới cho phép Coach thao tác trên Member đó (constraint #7: không được có 2 quan hệ ACTIVE trùng) |
| `started_at` / `ended_at` | Mốc thời gian bắt đầu/kết thúc phụ trách — phục vụ lịch sử, không xóa cứng khi kết thúc |

---

## Module: Membership

### `MEMBERSHIP_PACKAGES`
**Mục đích:** **danh mục** gói tập trung tâm bán ra (template) — KHÔNG phải gói của 1 Member cụ thể (đó là `MEMBER_PACKAGES` bên dưới). Ví dụ: "Gói 3 tháng không giới hạn", "Gói 10 buổi".

| Field | Vai trò |
|---|---|
| `package_id` (PK) | Định danh gói |
| `name` | Hiển thị cho Member chọn mua — **unique trong catalog** (BR-56) |
| `price` | Giá bán — nguồn để tạo `InvoiceItems.amount` khi Member mua |
| `duration_days` | Thời hạn sử dụng gói (tính từ `MemberPackages.start_date`) |
| `session_limit` | Giới hạn số buổi (`nullable` = không giới hạn) — nguồn gốc `MemberPackages.remaining_sessions` |

### `MEMBER_PACKAGES`
**Mục đích:** **instance thật** của 1 gói mà 1 Member đã mua/đang dùng — đây là entity trung tâm để kiểm tra "Member còn quyền đăng ký lớp không" (BR-16).

| Field | Vai trò |
|---|---|
| `member_package_id` (PK) | Định danh |
| `member_id` (FK) | Ai sở hữu gói này |
| `package_id` (FK) | Mua theo template gói nào |
| `start_date` / `end_date` | Xác định gói còn hiệu lực theo thời gian hay không (điều kiện `EXPIRED`, BR-11) |
| `remaining_sessions` | Số buổi còn lại — **trừ nguyên tử (atomic)** mỗi lần Enrollment thành công (constraint #3), là điều kiện chặn overbooking theo buổi |
| `status` | `PENDING_PAYMENT → ACTIVE → EXPIRED/CANCELLED` — xem state machine §2.1; chỉ gói `ACTIVE` mới được dùng để enroll |
| `version` | Optimistic concurrency — tránh lost-update khi 2 request cùng sửa 1 gói cùng lúc (constraint #8) |

---

## Module: Scheduling

### `ROOMS`
**Mục đích:** danh mục phòng tập vật lý của trung tâm.

| Field | Vai trò |
|---|---|
| `room_id` (PK) | Định danh phòng |
| `name` | Hiển thị lịch/booking — **unique toàn trung tâm** (BR-57) |
| `capacity` | Trần sức chứa vật lý — dùng để tính `CLASS_SESSIONS.capacity` = MIN(Room, Class) (BR-51) |

### `CLASSES`
**Mục đích:** định nghĩa **loại lớp** (ví dụ "Yoga cơ bản") — là template, không phải 1 buổi học cụ thể (đó là `CLASS_SESSIONS`).

| Field | Vai trò |
|---|---|
| `class_id` (PK) | Định danh lớp |
| `name` | Hiển thị cho Member chọn |
| `discipline` | Bộ môn (Yoga, Gym, Boxing...) — filter/tìm kiếm |
| `default_room_id` (FK) | Phòng mặc định khi sinh session, có thể bị override ở từng session |
| `default_coach_id` (FK, nullable) | HLV mặc định phụ trách lớp, cũng có thể override ở từng session |
| `capacity` | Sức chứa mặc định của lớp — 1 trong 2 yếu tố tính MIN(Room, Class) cho session (BR-51) |
| `status` | `ACTIVE/ARCHIVED` — lớp ngừng mở không xóa cứng (giữ lịch sử session/enrollment cũ) |

### `CLASS_RECURRENCE`
**Mục đích:** định nghĩa **quy luật lặp lại** của 1 lớp (ví dụ "Thứ 2-4-6, 18h-19h30") — tách riêng khỏi session cụ thể để 1 job nền có thể sinh trước hàng loạt `CLASS_SESSIONS` mà không phải nhập tay từng buổi.

| Field | Vai trò |
|---|---|
| `recurrence_id` (PK) | Định danh pattern |
| `class_id` (FK) | Pattern này thuộc lớp nào |
| `days_of_week` | Các thứ trong tuần lặp lại (vd `MON,WED,FRI`) |
| `start_time_local` / `end_time_local` | Giờ bắt đầu/kết thúc theo giờ địa phương (không phải UTC — vì lịch lặp theo "giờ trong ngày", không theo mốc tuyệt đối) |
| `timezone` | Neo giờ local về đúng múi giờ (`Asia/Ho_Chi_Minh`) khi convert sang `start_at_utc`/`end_at_utc` của session |
| `effective_from` / `effective_to` | Khoảng thời gian pattern này còn áp dụng — cho phép đổi lịch theo kỳ mà không xóa lịch sử session cũ |

### `CLASS_SESSIONS`
**Mục đích:** **1 buổi học cụ thể**, có ngày giờ thật — là entity Member thực sự đăng ký vào (không đăng ký vào `CLASSES`). Được sinh tự động từ `CLASS_RECURRENCE`, hoặc tạo ad-hoc.

| Field | Vai trò |
|---|---|
| `session_id` (PK) | Định danh buổi học |
| `class_id` (FK) | Buổi học thuộc lớp nào |
| `recurrence_id` (FK, nullable) | Sinh ra từ pattern nào — `null` nghĩa là session ad-hoc hoặc đã bị reschedule tách khỏi pattern |
| `room_id` (FK) | Phòng thực tế của buổi này (có thể khác `Classes.default_room_id` nếu đổi phòng) |
| `coach_id` (FK) | HLV thực tế dạy buổi này (có thể khác default nếu đổi HLV) |
| `start_at_utc` / `end_at_utc` | Mốc thời gian tuyệt đối (UTC) — dùng để check trùng lịch, tính deadline hủy, tính No-show |
| `capacity` | Sức chứa thực tế buổi này (≤ MIN(Room, Class) tại thời điểm tạo — Manager chỉ được hạ, BR-51) |
| `confirmed_count` | **Denormalized**, tăng/giảm nguyên tử mỗi khi có Enrollment CONFIRMED/hủy — dùng để chặn overbooking bằng 1 UPDATE có điều kiện thay vì COUNT() (constraint #2) |
| `status` | `SCHEDULED/RESCHEDULED/CANCELLED/COMPLETED` — vòng đời của chính buổi học |
| `rescheduled_from_session_id` (FK, nullable) | Nếu buổi này là kết quả dời lịch từ buổi khác, trỏ về buổi gốc — giữ vết lịch sử đổi lịch |

### `ENROLLMENTS`
**Mục đích:** ghi nhận **1 Member đăng ký vào 1 session cụ thể**, gắn với gói nào bị trừ buổi — là entity trung tâm của flow "Đặt lớp".

| Field | Vai trò |
|---|---|
| `enrollment_id` (PK) | Định danh lượt đăng ký |
| `session_id` (FK) | Đăng ký vào buổi nào |
| `member_id` (FK) | Ai đăng ký |
| `member_package_id` (FK) | Gói nào bị trừ `remaining_sessions` cho lượt đăng ký này — cần thiết vì 1 Member có thể có nhiều gói cùng lúc |
| `status` | `CONFIRMED/CANCELLED_ON_TIME/CANCELLED_LATE` — quyết định có hoàn credit hay không (BR-17/18), xem state machine §2.2 |
| `registered_at` | Mốc đăng ký, dùng tính thứ tự/độ ưu tiên nếu cần |
| `cancelled_at` | Mốc hủy — so với deadline (đọc từ cấu hình, BR-50) để phân loại ON_TIME/LATE |
| `cancelled_by_user_id` (FK, nullable) | Ai bấm hủy — có thể khác Member (vd Receptionist hủy giúp) — phục vụ audit |

### `ATTENDANCE`
**Mục đích:** kết quả điểm danh của 1 Enrollment sau khi session diễn ra — phân biệt rõ được điểm danh tay (`PRESENT`/`ABSENT`) và No-show tự động (BR-53). Quan hệ 1-1 với `ENROLLMENTS` (1 lượt đăng ký chỉ điểm danh 1 lần).

| Field | Vai trò |
|---|---|
| `attendance_id` (PK) | Định danh |
| `enrollment_id` (FK, **unique**) | Điểm danh cho lượt đăng ký nào — **unique** enforce đúng quan hệ 1-1 (constraint #17). `session_id`/`member_id` **không** lưu riêng nữa (bỏ 10/09/2026 (4)) — Enrollment đã đại diện "Member tham gia Session" nên 2 field này suy ra 100% qua `enrollment_id`, giữ lại chỉ tạo rủi ro lệch dữ liệu mà không có lợi ích thật ở quy mô đồ án |
| `status` | `PRESENT/ABSENT/NO_SHOW` — `PRESENT`/`ABSENT` do người ghi tay, `NO_SHOW` do `AttendanceFinalizerJob` tự sinh sau `end_at_utc` nếu không có check-in |
| `check_in_time` (nullable) | Thời điểm check-in thật (nếu có) |
| `checked_in_by_user_id` (FK, nullable) | Ai thực hiện check-in (Coach/Receptionist) — null nếu do job tự động tạo (NO_SHOW) |

---

## Module: Training (Workout)

### `WORKOUT_PLANS`
**Mục đích:** kế hoạch tập do Coach lập cho 1 Member — chỉ được tạo nếu Coach có `COACH_MEMBER_RELATIONSHIP` ACTIVE với Member đó (đảm bảo đúng quyền phụ trách).

| Field | Vai trò |
|---|---|
| `plan_id` (PK) | Định danh kế hoạch |
| `member_id` (FK) | Kế hoạch dành cho ai |
| `coach_id` (FK) | Ai lập |
| `relationship_id` (FK) | Trỏ về đúng quan hệ Coach–Member cho phép hành động này — dùng để authorize + audit |
| `goal` / `level` | Copy/snapshot mục tiêu & trình độ tại thời điểm lập plan (có thể khác `MEMBER_TRAINING_PROFILE` hiện tại nếu profile đã update sau đó) |
| `created_at` | Mốc tạo plan |

### `WORKOUT_PLAN_ITEMS`
**Mục đích:** từng bài tập cụ thể trong 1 kế hoạch — tách bảng con vì 1 plan có nhiều bài tập (1–N).

| Field | Vai trò |
|---|---|
| `item_id` (PK) | Định danh dòng bài tập |
| `plan_id` (FK) | Thuộc plan nào |
| `exercise` | Tên bài tập |
| `sets` / `reps` | Số hiệp / số lần — thông số tập luyện cụ thể |
| `notes` | Ghi chú thêm (tempo, nghỉ giữa hiệp...) |

### `WORKOUT_RESULTS`
**Mục đích:** ghi nhận **kết quả tập thực tế** sau 1 session — khác `WORKOUT_PLANS` (kế hoạch, việc *sẽ* làm) ở chỗ đây là log việc *đã* xảy ra, gắn với đúng buổi học **mà Member thực sự có đăng ký** (qua `ENROLLMENTS`).

| Field | Vai trò |
|---|---|
| `result_id` (PK) | Định danh |
| `enrollment_id` (FK) | Kết quả của lượt đăng ký nào — thay cho `session_id` + `member_id` cũ (2 FK độc lập, không ràng buộc lẫn nhau — trước đây DB không chặn được việc ghi kết quả cho 1 Member chưa từng đăng ký session đó). Đổi 10/09/2026 (4): dùng `enrollment_id` khiến DB tự đảm bảo tính toàn vẹn này; `session_id`/`member_id` suy ra qua JOIN `ENROLLMENTS` khi cần. **Lưu ý:** FK chỉ đảm bảo Enrollment tồn tại, chưa đảm bảo còn hợp lệ (`status = CONFIRMED`) — service layer phải tự check thêm (xem Open Questions) |
| `coach_id` (FK) | Ai ghi nhận — không suy ra được qua Enrollment nên vẫn giữ FK riêng |
| `progress_note` | Ghi chú tiến độ (khách quan — vd "nâng được thêm 5kg") |
| `coach_comment` | Nhận xét của Coach (định tính) |
| `recorded_at` | Mốc ghi nhận |

---

## Module: Payment

### `INVOICES`
**Mục đích:** hóa đơn — **bất biến** (BR-40), tạo **ngay khi Member chọn gói/dịch vụ**, TRƯỚC khi thanh toán (BR-30 v1.2). Không bao giờ bị xóa, chỉ chuyển trạng thái `VOID` khi cần hủy toàn phần.

| Field | Vai trò |
|---|---|
| `invoice_id` (PK) | Định danh nội bộ |
| `invoice_number` | Mã hóa đơn dễ đọc, **unique**, sinh từ DB sequence (không random ở app) để tránh trùng khi 2 request song song (constraint #5, BR-58) |
| `member_id` (FK) | Hóa đơn xuất cho ai |
| `issued_by_user_id` (FK) | Nhân viên nào xuất (thường Receptionist) — audit |
| `member_package_id` (FK, nullable) | Nếu hóa đơn gắn với 1 gói cụ thể thì trỏ tới đó (nullable vì có thể là phí khác, vd penalty) |
| `total_amount` | Tổng tiền phải thu — chuẩn để so sánh với tổng `PAYMENTS.amount` (constraint #6, BR-41) |
| `status` | `ISSUED → PARTIALLY_PAID → PAID` hoặc `→ VOID` — xem state machine §2.3 |
| `issued_at` | Mốc xuất hóa đơn |

### `INVOICE_ITEMS`
**Mục đích:** dòng chi tiết trong hóa đơn — 1 Invoice có thể có nhiều dòng (vd: tiền gói + phí phạt trong cùng 1 hóa đơn).

| Field | Vai trò |
|---|---|
| `item_id` (PK) | Định danh dòng |
| `invoice_id` (FK) | Thuộc hóa đơn nào |
| `description` | Diễn giải hiển thị trên hóa đơn |
| `amount` | Số tiền của dòng này — tổng các dòng phải khớp `Invoices.total_amount` |
| `related_entity_type` | `PACKAGE/CLASS_FEE/PENALTY` — dòng này phát sinh từ nguồn nào |
| `related_entity_id` (nullable) | Trỏ tới entity nguồn cụ thể (vd `member_package_id`) để truy vết |

### `PAYMENTS`
**Mục đích:** từng **giao dịch thu tiền** thật cho 1 Invoice — tách khỏi Invoice vì có thể trả nhiều lần/nhiều phương thức (Invoice bất biến, Payment là các lần thu nối tiếp).

| Field | Vai trò |
|---|---|
| `payment_id` (PK) | Định danh giao dịch |
| `invoice_id` (FK) | Thanh toán cho hóa đơn nào |
| `amount` | Số tiền của lần thu này — tổng các `amount` (status SUCCESS) không được vượt `Invoices.total_amount` (BR-41, constraint #6) |
| `method` | `CASH/CARD/TRANSFER/EWALLET` — MVP chủ yếu ghi nhận thủ công |
| `reference_code` (nullable) | Mã tham chiếu từ cổng thanh toán ngoài (nếu có) |
| `status` | `PENDING/SUCCESS/FAILED` — chỉ `SUCCESS` mới tính vào tổng đã thu |
| `received_by_user_id` (FK) | Nhân viên nào nhận tiền — audit, thường Receptionist |
| `paid_at` | Mốc thanh toán — dùng cho báo cáo doanh thu theo thời gian |

### `PAYMENT_ADJUSTMENTS`
**Mục đích:** điều chỉnh sau khi đã có Invoice/Payment — hoàn tiền, sửa sai, chiết khấu — có **workflow duyệt riêng** (không ai tự ý sửa hóa đơn/thanh toán gốc, giữ đúng nguyên tắc Invoice bất biến).

| Field | Vai trò |
|---|---|
| `adjustment_id` (PK) | Định danh |
| `invoice_id` (FK) | Điều chỉnh cho hóa đơn nào |
| `payment_id` (FK, nullable) | Nếu liên quan 1 giao dịch thu tiền cụ thể thì trỏ tới đó |
| `type` | `REFUND/CORRECTION/DISCOUNT` — loại điều chỉnh, quyết định công thức tính (BR-52 cho REFUND) |
| `amount` | Số tiền điều chỉnh |
| `reason` | Lý do — bắt buộc để Manager duyệt có căn cứ |
| `status` | `REQUESTED → APPROVED/REJECTED → COMPLETED` — Receptionist tạo, **Manager phải duyệt, không được tự duyệt** (BR-42), xem state machine §2.4 |
| `requested_by_user_id` (FK) | Ai yêu cầu |
| `approved_by_user_id` (FK, nullable) | Ai duyệt — null nếu chưa duyệt/bị từ chối |
| `created_at` / `resolved_at` (nullable) | Mốc tạo yêu cầu / mốc xử lý xong — SLA, báo cáo |

---

## Module: hỗ trợ hệ thống (Notification, AI, Audit)

### `NOTIFICATIONS`
**Mục đích:** hàng đợi thông báo gửi cho user (đổi lịch, sắp hết hạn gói, nhận thanh toán...) — MVP có thể chỉ lưu trong DB (chưa gửi SMS/email thật), nhưng schema đã tính sẵn kênh + retry.

| Field | Vai trò |
|---|---|
| `notification_id` (PK) | Định danh |
| `user_id` (FK) | Gửi cho ai |
| `channel` | `IN_APP/EMAIL/SMS` — kênh gửi |
| `source_event_type` | `CLASS_CANCELLED/SCHEDULE_CHANGED/PACKAGE_EXPIRING/PAYMENT_RECEIVED` — loại sự kiện sinh ra thông báo này |
| `source_entity_id` (nullable) | Trỏ tới entity gây ra sự kiện (vd `session_id` nếu là `CLASS_CANCELLED`) |
| `message` | Nội dung hiển thị |
| `status` | `PENDING/SENT/FAILED/READ` — vòng đời gửi + đã đọc chưa |
| `retry_count` | Số lần đã thử gửi lại (khi `FAILED`) |
| `last_attempt_at` / `sent_at` | Mốc lần thử gần nhất / mốc gửi thành công |

### `AI_LOGS`
**Mục đích:** log mọi lượt gọi tính năng AI (gợi ý bài tập — Flow 5) — phục vụ debug, đo hiệu năng, và audit việc AI trả lời gì cho ai. *(AI assistant/chat — Flow 6 — đã hạ xuống stretch, chỉ log nếu flow đó thực sự được triển khai; xem `00-Source-of-Truth.md` §1.4.)*

| Field | Vai trò |
|---|---|
| `log_id` (PK) | Định danh |
| `user_id` (FK) | Ai gọi AI |
| `query_type` | Loại truy vấn (vd `WORKOUT_SUGGESTION`; `CHAT` chỉ áp dụng nếu Flow 6 — stretch — được triển khai) |
| `input_payload` (jsonb) | Input thực tế gửi cho AI — debug khi kết quả sai |
| `response_payload` (jsonb) | Kết quả AI trả về |
| `response_time_ms` | Đo hiệu năng, phát hiện AI chậm/timeout |
| `created_at` | Mốc gọi |

### `AUDIT_LOGS`
**Mục đích:** nhật ký thao tác quan trọng trên hệ thống (yêu cầu của Center Manager: "xem lịch sử thao tác quan trọng") — ai đổi gì, từ giá trị nào sang giá trị nào.

| Field | Vai trò |
|---|---|
| `audit_id` (PK) | Định danh |
| `user_id` (FK) | Ai thực hiện thao tác |
| `action` | Loại hành động (vd `UPDATE_PACKAGE_STATUS`) |
| `target_entity` / `target_id` | Thao tác tác động lên entity/record nào |
| `old_value` / `new_value` (jsonb, nullable) | Giá trị trước/sau — truy vết thay đổi thực tế, không chỉ ghi "đã sửa" chung chung |
| `ip_address` | Nguồn thực hiện — phục vụ điều tra bảo mật nếu cần |
| `timestamp` | Mốc thời gian |

---

*Nguồn: `docs/Center-Management-System-Design-v2.md` §1 (ERD), §2 (state transition), §3 (constraints). Field nào còn dấu `?` hoặc chưa rõ nghiệp vụ — hỏi lại BA/team lead trước khi code, đừng tự suy diễn (đúng nguyên tắc ở `docs/00-Source-of-Truth.md` §6).*
