# Mục đích các Entity & vai trò từng Field (SportHub)

SportHub là **hệ thống quản lý trung tâm thể thao với ba môn Gym (bao gồm PT), cầu lông và bóng rổ; có thể mở rộng thêm môn trong tương lai**. PT là dịch vụ thuộc Gym, không phải môn thứ tư.

## Ánh xạ backend

Phần này chốt tên field thực tế sau refactor; các bảng logic cũ bên dưới cần đọc theo BR v2.0/Design v3 và ánh xạ này. Quyết định tương thích và API ở [api-contract.md](api-contract.md).

| Entity.field thực tế | Mục đích |
|---|---|
| Invoice.MemberId | Beneficiary UserAccount của hóa đơn, có thể là Member hoặc ExternalCoach. DB giữ `member_id`; API dùng `beneficiaryUserId` và alias tương thích `memberId`. |
| InvoiceItem.ClassId/CourtRentalId/PtEntitlementId/MemberPackageId | Typed FK nullable theo loại item, thay việc suy kiểu từ một Guid polymorphic. Nullable cho legacy chưa xác định được; các FK tài chính dùng Restrict. |
| InvoiceItem.RelatedEntityId | Legacy reference giữ để đọc/backfill/fallback; không xóa lịch sử hoặc đoán entity đích. |
| InvoiceItem.SportId/SportNameSnapshot/PtFrequencyPerWeek | Chiều môn/tên môn/tần suất PT tại lúc mua. Báo cáo ưu tiên snapshot; Membership sport null; PT chưa xác định duy nhất môn cũng null. |
| InvoiceItem.SourceInvoiceItemId | Item nguồn của phần chênh chuyển lớp; tính cap refund theo chuỗi giá trị đã trả. |
| MemberPackage.DurationDaysSnapshot | Thời hạn đã mua tại checkout; activation không bị thay đổi bởi catalog sửa sau đó. Dữ liệu legacy không có snapshot dùng fallback thời hạn catalog. |
| MembershipPackage.SessionLimit/MemberPackage.RemainingSessions | Cột lịch sử được giữ; không dùng làm quota/expiry cho Membership. Request catalog mới không nhận SessionLimit khác null. |
| CheckoutSession | Lịch sử cycle/retry, owner, loại mua, reservation và thời hạn; không ghi đè mất cycle cũ. |
| PaymentAttempt/Payment.PaymentAttemptId | Attempt snapshot VNPay amount/points; payment đã xác minh trỏ lại attempt để đối soát. Payment legacy có thể null. |
| VerifiedGatewayEvent | Inbox bền vững cho callback/query đã xác minh, dedup capture và replay. |
| PaymentAdjustment.InvoiceItemId/SystemCalculatedPoints/ApprovedPoints | Refund theo item, hệ thống tính điểm, approval thực hiện credit và cancel nguyên tử. Không dùng payout tiền mặt. |
| ThresholdResponse | Token hash/deadline/choice/resolution cho lớp dưới ngưỡng; tên bảng `class_threshold_responses`. |
| Enrollment.TransferDifferenceInvoiceItemId | Liên kết phần chênh đã trả khi chuyển lớp; giữ lịch sử hoàn điểm đúng cap. |
| CourtRental.SportId/InvoiceId/InvoiceItemId | Môn thuê và hóa đơn/item nguồn; cho price snapshot, fulfillment, report và refund. |
| Notification email fields | Payload được mã hóa, attempt/lease/retry và Sent state; không đưa email vào feed InApp. |

`fulfillmentOutcome` trong DTO là giá trị tính từ trạng thái/PaidVia/reconciliation, không phải cột DB độc lập. JSON enum dùng UPPER_SNAKE_CASE; enum DB giữ số cũ. Migration typed schema và backfill tách riêng; khi triển khai phải kiểm DB trắng và upgrade có lịch sử.

> Thứ tự ưu tiên: `SportManagement_BusinessRules_v2.0` → `Center-Management-System-Design-v3.md` → `00-Source-of-Truth.md` (phần chưa bị v3 thay thế) → tài liệu field này. Không duy trì bản Markdown mirror của Business Rules.
---

## Module: Identity

### `USER_ACCOUNTS`
**Mục đích:** bảng định danh + vòng đời gốc — mọi vai trò (System Administrator, Center Manager, Coach, **ExternalCoach**, Member, Receptionist) đều là 1 row ở đây, phân biệt qua `role_id`. Không tách bảng riêng cho từng vai trò để tránh trùng lặp logic auth/login. Đây là bảng cha duy nhất mà gần như mọi entity khác (member, coach, staff...) trỏ FK vào — cố tình giữ tối giản (chỉ định danh + vòng đời) để hầu như không bao giờ cần đổi schema, tách khỏi phần auth (`USER_CREDENTIALS`/`USER_EXTERNAL_LOGINS`) và phần hiển thị (`USER_PROFILES`) vốn thay đổi thường xuyên hơn.

**Quy tắc:** quan hệ 1–1 **tùy chọn** với `COACH_PROFILES` — được tạo cho Coach; khi đổi role vẫn giữ record lịch sử, role hiện tại quyết định hiệu lực.

| Field | Vai trò |
|---|---|
| `UserId` (PK) | Định danh duy nhất, dùng làm khóa ngoại ở gần như mọi entity khác (member, coach, staff đều trỏ về đây) |
| `Email` | Định danh đăng nhập/liên hệ — **unique không phân biệt hoa/thường** (BR-1, BR-49, index `LOWER(email)`). Đặt ở đây (không phải `USER_CREDENTIALS`) vì email là định danh, không phải bí mật — nhiều module (Invoice, Notification) cần đọc mà không nên phải đụng tới bảng chứa `PasswordHash` |
| `RoleId` (FK → ROLES) | Quyết định phân quyền (RBAC) — 1 user chỉ có 1 role (6 role sau v3) |
| `Status` | `ACTIVE / BANNED / DEACTIVATED` — kiểm soát user có được login/thao tác hay không, không xóa cứng user (giữ lịch sử payment/attendance) |
| `CreatedAt` | Audit, hiển thị "thành viên từ ngày..." |
| `SecurityStamp` (uuid, ) | Đổi mỗi khi reset/đổi mật khẩu hoặc đổi vai trò (BR-103/104). JWT mang claim `sst`; middleware so với DB nên mọi phiên/token cũ bị vô hiệu ngay sau khi đổi mật khẩu — không cần blacklist token |

Quan hệ 1–1 tùy chọn với `EXTERNAL_COACH_PROFILES` (chỉ khi role = `ExternalCoach`) và quan hệ 1–N với `USER_SPORT_SPECIALTIES` (Coach và ExternalCoach); Member và ExternalCoach có thêm 1 `POINT_WALLETS` (tạo tự động khi tạo tài khoản).

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
| `Provider` | `GOOGLE` (enum `ExternalAuthProvider`, xem [SSOT](00-Source-of-Truth.md)) — hiện chỉ Google, mở rộng provider khác không cần đổi entity |
| `ProviderUserId` | ID phía provider trả về (Google `sub`) — cùng `Provider` tạo **unique composite**, chặn 1 tài khoản Google bị link vào 2 `USER_ACCOUNTS` khác nhau |
| `RefreshToken` | Nullable; scope Google login hiện không lưu refresh token. Nếu bổ sung lưu trữ phải thiết kế bảo vệ riêng, không lưu thô |
| `CreatedAt` | Mốc link provider — cũng là mốc dùng để kiểm tra `(UserId, Provider)` unique (1 user không link trùng 1 provider 2 lần) |

**Business rule đăng nhập Google (BR-59/60 chính thức):** nếu `POST /api/auth/google` nhận email đã tồn tại nhưng chưa link thì không tự tạo/tự link. Với email mới, hệ thống tạo account ở trạng thái chờ thiết lập mật khẩu; chính người dùng phải nhập và xác nhận mật khẩu mạnh trước khi hoàn tất onboarding. Không sinh hoặc gửi mật khẩu gợi ý.

### `ROLES`
**Mục đích:** danh mục cố định 6 vai trò trong hệ thống, tách riêng để RBAC dễ mở rộng (thêm role mới không cần đổi schema `USER_ACCOUNTS`).

| Field | Vai trò |
|---|---|
| `RoleId` (PK) | Khóa để `UserAccount.RoleId` trỏ vào |
| `RoleName` | **6 giá trị cố định** theo thiết kế hệ thống `UserRole`: `SystemAdministrator`, `CenterManager`, `Coach`, `ExternalCoach`, `Member`, `Receptionist`; API UPPER_SNAKE_CASE, JWT PascalCase. Seed unique (BR-63) — seed thêm dòng `ExternalCoach` |

### `COACH_PROFILES`
**Mục đích:** chỉ lưu thông tin **nghiệp vụ bổ sung** của tài khoản role `Coach` (huấn luyện viên của trung tâm) — không lưu profile chung (tên/SĐT ở `USER_PROFILES`, mật khẩu ở `USER_CREDENTIALS`) và **không lưu dữ liệu lương/hoa hồng/hợp đồng**. Từ v3 bảng này **không còn phân loại Coach**: năng lực giảng dạy nằm ở `USER_SPORT_SPECIALTIES` (Coach dạy được môn nào), nên 1 Coach có thể dạy nhiều môn.

| Field | Vai trò |
|---|---|
| `UserId` (PK, FK → USER_ACCOUNTS) | Cùng giá trị PK với `UserAccount.UserId` — quan hệ 1–1, chỉ tồn tại khi `UserAccount.RoleId` là `Coach` |
| `Bio` (nullable, ) | Giới thiệu ngắn hiển thị ở trang lớp/khóa học cho Member |

**Quy tắc:** khi tài khoản đổi khỏi role `Coach`, giữ record `COACH_PROFILES` làm lịch sử — không cascade delete, không thêm field trạng thái. `UserAccount.RoleId` hiện tại quyết định hiệu lực. **Sửa v3:** khi đổi lại role `Coach`, không cần chọn category; Manager gán lại specialty nếu cần.

### `EXTERNAL_COACH_PROFILES`
**Mục đích:** hồ sơ của **huấn luyện viên tự do** (ExternalCoach) tự đăng ký để thuê sân theo giờ. Tách khỏi `COACH_PROFILES` vì ExternalCoach không thuộc biên chế trung tâm, cần luồng duyệt riêng và bị giới hạn quyền (không điểm danh/quản lý học viên riêng). Quan hệ 1–1 với `USER_ACCOUNTS` role `ExternalCoach`. Module Identity.

| Field | Vai trò |
|---|---|
| `UserId` (PK, FK → USER_ACCOUNTS) | 1–1 với tài khoản role `ExternalCoach` |
| `Bio` (nullable) | Mô tả bản thân/kinh nghiệm để Manager xét duyệt |
| `ApprovalStatus` | Enum `ExternalCoachApprovalStatus`: `PendingApproval`, `Approved`, `Rejected`, `Suspended`. Chỉ `Approved` mới được thuê sân |
| `ReviewedByUserId` (FK, nullable) / `ReviewedAt` (nullable) | Manager đã duyệt/từ chối/đình chỉ và thời điểm — phục vụ audit |
| `ReviewNote` (nullable) | Lý do; **bắt buộc khi `Rejected`/`Suspended`** |

### `USER_SPORT_SPECIALTIES`
**Mục đích:** bảng nối Coach/ExternalCoach ↔ Sport — cho biết ai dạy được môn nào. **Thay thế `CoachCategory`.** Hàm `CoachCanTeach(userId, sportId)` là điều kiện để phân công Coach vào lớp (`CLASSES.CoachId`) và chọn Coach PT (môn có `OperationType = OneOnOne`). Với ExternalCoach đây là môn giảng dạy tự khai báo, không dùng để phân công lớp của trung tâm.

| Field | Vai trò |
|---|---|
| `UserId` (FK → USER_ACCOUNTS) | Coach hoặc ExternalCoach |
| `SportId` (FK → SPORTS) | Môn được khai báo/gán. PK ghép `(UserId, SportId)` — không gán trùng |

### `EMAIL_OTPS`
**Mục đích:** lưu OTP email dùng chung cho nhiều mục đích. Field gốc (`Email`, `CodeHash`, `ExpiresAt`, `Attempts`, `ConsumedAt`) giữ nguyên như bảng ở cuối tài liệu; v3 chỉ thêm 1 field:

| Field | Vai trò |
|---|---|
| `Purpose` () | Enum `EmailOtpPurpose`: `Register`, `ResetPassword` (quên mật khẩu, không hỏi mật khẩu cũ — BR-103), `ExternalCoachRegister` (BR-105). Cho phép mỗi mục đích có OTP còn hiệu lực riêng cho cùng 1 email; đăng ký/ExternalCoach dùng OTP 6 số; **reset dùng token link ngẫu nhiên 256-bit (base64url)** — `CodeHash` luôn là SHA-256 của mã/token, không lưu bản rõ |

> OTP xác nhận dùng điểm tại quầy **không** dùng bảng này mà dùng `POINT_CONFIRMATIONS` (hiệu lực 5 phút, tối đa 5 lần sai, BR-139).

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

**Quy tắc:** chỉ tạo cho Coach **có specialty PT** (`USER_SPORT_SPECIALTIES` chứa môn `OneOnOne`). Không tự tạo relationship kiểu này từ việc Member ghi danh (`ENROLLMENTS`) khóa Cầu lông/Bóng rổ — ghi danh khóa học và quan hệ huấn luyện cá nhân là 2 khái niệm khác nhau; ExternalCoach không có relationship này.

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

> **Scope v3:** Membership chỉ áp dụng cho **Gym** (+ là điều kiện để mua PT). Membership **không** liên quan lớp nhóm: ghi danh Cầu lông/Bóng rổ không kiểm tra Membership và không trừ quota. Các bảng dưới đây **giữ nguyên**.

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

> Môn thể thao là **dữ liệu cấu hình** (`SPORTS`) do Manager CRUD, không còn enum `Yoga/GroupX`. Lớp Cầu lông/Bóng rổ là **khóa học cố định** (ví dụ "Cầu lông 01"): Member mua gói của đúng lớp đó và ghi danh cả khóa (`ENROLLMENTS.ClassId`, không còn đăng ký từng buổi). Sĩ số thuộc `CLASSES`, không thuộc session. Chống trùng phòng/Coach do DB đảm bảo bằng `ROOM_OCCUPANCIES`/`COACH_OCCUPANCIES` (exclusion constraint).
> Catalog (Sport, RoomType, Room, giờ hoạt động, block, CourtRate) nằm trong module Scheduling (`Catalog/`), không tách project.

### `SPORTS`
**Mục đích:** danh mục môn thể thao của trung tâm. Thay cho chuỗi `Class.Discipline`; thêm/sửa môn không cần đổi code. Seed: Gym (bao gồm PT), Cầu lông, Bóng rổ.

| Field | Vai trò |
|---|---|
| `SportId` (PK) | Định danh môn |
| `Name` | Tên hiển thị — **unique không phân biệt hoa/thường** (`LOWER(name)`) |
| `OperationType` | Enum `SportOperationType`: `WalkIn` (Gym — ra vào tự do), `OneOnOne` (PT — 1 Coach : 1 Member), `GroupCourse` (khóa học nhóm cố định). Quyết định luồng nghiệp vụ nào áp dụng cho môn |
| `DefaultSessionMinutes` (nullable) | Thời lượng 1 buổi; **bắt buộc khi `GroupCourse`** (gợi ý seed: Cầu lông 90, Bóng rổ 120) — `CLASS_SESSIONS.EndAtUtc` suy ra từ đây |
| `DefaultMaxCapacity` (nullable) | Trần sĩ số lớp của môn; **bắt buộc khi `GroupCourse`**; `Class.Capacity` không được vượt (BR-51) |
| `Description` / `ImageUrl` (nullable) | Hiển thị landing page |
| `SortOrder` | Thứ tự hiển thị |
| `IsActive` | Ngừng hoạt động thay cho xóa cứng (giữ lịch sử lớp/hóa đơn) |

### `ROOM_TYPES`
**Mục đích:** loại sân/phòng (Phòng Gym, Phòng PT, Sân cầu lông, Sân bóng rổ) — đơn vị gắn giá thuê sân (`COURT_RATES`) và ràng buộc môn nào chơi được ở đâu.

| Field | Vai trò |
|---|---|
| `RoomTypeId` (PK) | Định danh |
| `Name` | Tên loại — unique |

### `SPORT_ROOM_TYPES`
**Mục đích:** bảng nối cho biết môn nào chơi/tập được ở loại sân/phòng nào; dùng kiểm tra khi Manager gán `Class.DefaultRoomId`/`ClassSession.RoomId` hoặc gán phòng cho PT.

| Field | Vai trò |
|---|---|
| `SportId` (FK) / `RoomTypeId` (FK) | PK ghép — cặp môn–loại sân hợp lệ |

### `ROOMS`
**Mục đích:** danh mục phòng/sân vật lý của trung tâm (không chỉ phòng tập).

| Field | Vai trò |
|---|---|
| `RoomId` (PK) | Định danh phòng/sân |
| `Name` | Hiển thị lịch/booking — **unique toàn trung tâm** (BR-57) |
| `RoomTypeId` (FK, ) | Loại sân/phòng; quyết định môn nào dùng được và bảng giá thuê |
| `IsActive` () | Ngừng dùng thay cho xóa; sân ngừng hoạt động không nhận lịch mới |

### `ROOM_OPENING_HOURS`
**Mục đích:** giờ mở/đóng cửa của từng sân theo thứ trong tuần; lịch lớp, PT trong phòng và lượt thuê sân phải nằm trong khung này. Múi giờ cố định `Asia/Ho_Chi_Minh`.

| Field | Vai trò |
|---|---|
| `RoomId` (FK) / `DayOfWeek` (0–6) | PK ghép — mỗi sân tối đa 1 khung/ngày |
| `OpenTimeLocal` / `CloseTimeLocal` | Giờ mở/đóng theo giờ địa phương |

### `ROOM_BLOCKS`
**Mục đích:** khung giờ **khóa sân** vì bảo trì, sự kiện hoặc sự cố. Mỗi block sinh 1 dòng `ROOM_OCCUPANCIES` (`SourceType = RoomBlock`) nên tự động chặn đặt lịch/thuê sân chồng lên.

| Field | Vai trò |
|---|---|
| `BlockId` (PK) | Định danh |
| `RoomId` (FK) | Sân bị khóa |
| `StartAtUtc` / `EndAtUtc` | Khoảng thời gian khóa |
| `Reason` | Lý do khóa |
| `IncidentId` (FK, nullable) | Trỏ tới `INCIDENT_NOTICES` nếu block do sự cố |
| `CreatedByUserId` (FK) | Manager tạo — audit |

### `INCIDENT_NOTICES`
**Mục đích:** thông báo sự cố/đóng cửa (một sân hoặc toàn trung tâm) — căn cứ để hủy lượt thuê sân, dời buổi học và gửi thông báo `IncidentNotice`.

| Field | Vai trò |
|---|---|
| `IncidentId` (PK) | Định danh |
| `ScopeType` | `Room` hoặc `Center` |
| `RoomId` (FK, nullable) | Bắt buộc khi `ScopeType = Room` |
| `StartAtUtc` / `EndAtUtc` | Thời gian ảnh hưởng |
| `Reason` | Nội dung sự cố |
| `CreatedByUserId` / `CreatedAt` | Ai tạo, khi nào |

### `COURT_RATES`
**Mục đích:** bảng giá thuê sân theo loại sân và khung giờ; giá được **snapshot** vào `COURT_RENTALS` khi đặt.

| Field | Vai trò |
|---|---|
| `RateId` (PK) | Định danh |
| `RoomTypeId` (FK) | Loại sân áp dụng |
| `DaysOfWeek` | Chuỗi thứ áp dụng (vd `MON,TUE`) |
| `StartTimeLocal` / `EndTimeLocal` | Khung giờ áp dụng; **không chồng nhau** trong cùng loại sân + ngày (kiểm tra ở service) |
| `PricePerHour` | Đơn giá/giờ, **bội số 1.000 VND** (BR-113) |
| `IsActive` | Ngừng áp dụng mà không sửa lịch sử |

### `CLASSES`

| Field | Vai trò |
|---|---|
| `ClassId` (PK) | Định danh lớp |
| `Code` | Mã lớp **unique** (vd `CAULONG-01`) |
| `Name` | Tên hiển thị ("Cầu lông 01") |
| `CoachId` (FK, nullable) | Coach phụ trách; **bắt buộc trước khi publish** và phải có specialty khớp môn (`CoachCanTeach`) |
| `DefaultRoomId` (FK) | Phòng/sân mặc định; phải thuộc loại sân hợp lệ với môn (`SPORT_ROOM_TYPES`) |
| `StartDate` | Ngày của buổi đầu tiên |
| `NumSessions` | Tổng số buổi của khóa |
| `Price` | Giá gói lớp, **bội số 1.000 VND** (BR-113); snapshot vào `INVOICE_ITEMS` (`ItemType = ClassPackage`) |
| `CostAmount` | Chi phí vận hành do Manager nhập tay (BR-118) — cơ sở tính ngưỡng hoàn vốn |
| `BreakEvenThreshold` (nullable) | `ceil(CostAmount / Price)`, snapshot khi publish — số học viên tối thiểu để lớp mở |
| `ThresholdStatus` | `NotEvaluated`, `Met`, `AtRisk`, `WaivedByManager` (Manager miễn ngưỡng) |
| `ThresholdDeadlineUtc` | Hạn chốt ngưỡng = giờ bắt đầu buổi đầu − N ngày (`class.threshold_days_before_start`, mặc định 3) |
| `ThresholdResponseDeadlineUtc` (nullable) | Hạn Member phản hồi khi lớp chuyển `AtRisk` (mặc định 48 giờ) |
| `ConfirmedCount` | Số ghi danh `Confirmed` (chuyển từ `ClassSession.ConfirmedCount` lên lớp) |
| `ReservedCount` | `ConfirmedCount` + số `SEAT_HOLDS` đang `Active`; tăng/giảm nguyên tử bằng 1 UPDATE có điều kiện — **chốt chặn chống bán vượt sĩ số** (`ReservedCount ≤ Capacity`) |
| `CreatedByAi` | Lớp `Draft` do chatbot đề xuất xếp lịch (BR-123) — Manager phải xác nhận |
| `Version` | Optimistic concurrency token |

### `CLASS_THRESHOLD_RESPONSES` (implementation P1.09)
Một quyết định riêng cho từng ghi danh được thông báo AtRisk. Token ngẫu nhiên gửi qua outbox; DB chỉ lưu SHA-256 hash. Unique `(ClassId, EnrollmentId)` tránh gửi nhiều link cho cùng ghi danh; lựa chọn đã gửi là cuối cùng. `TargetClassId` chỉ có khi chọn Transfer; `AdditionalInvoiceId` dành cho checkout phần chênh. Migration P1.09 chưa được áp DB.

| Field | Vai trò |
|---|---|
| `ThresholdResponseId` (PK) | ID ổn định dùng làm event/idempotency key |
| `ClassId`, `EnrollmentId`, `MemberId` (FK) | Lớp/ghi danh/người sở hữu lựa chọn |
| `TokenHash` (unique) | SHA-256 của secure token, không lưu token gốc |
| `DeadlineUtc` | Hạn riêng của phản hồi, snapshot lúc tạo |
| `Choice`, `TargetClassId` | Refund hoặc Transfer và lớp đích tùy chọn |
| `ResolutionStatus`, `AdditionalInvoiceId` | Pending/Completed/AwaitingPayment/Expired/Failed và invoice phần chênh |
| `CreatedAtUtc`, `RespondedAtUtc`, `ResolvedAtUtc` | Dấu thời gian vòng đời |

**`CLASS_SCHEDULE_RULES`** — mục đích: lịch lặp theo tuần của khóa (thứ + giờ bắt đầu); khi publish, hệ thống sinh `NumSessions` dòng `CLASS_SESSIONS` từ `StartDate` theo các rule này. Thời lượng buổi lấy từ `Sport.DefaultSessionMinutes`, múi giờ cố định `Asia/Ho_Chi_Minh`.

| Field | Vai trò |
|---|---|
| `RuleId` (PK) | Định danh |
| `ClassId` (FK) | Rule thuộc lớp nào |
| `DayOfWeek` | Thứ trong tuần |
| `StartTimeLocal` | Giờ bắt đầu (giờ địa phương) |

### `CLASS_SESSIONS`
**Mục đích:** một buổi học cụ thể của khóa, sinh khi publish. Là đơn vị ghi phòng/Coach vào `ROOM_OCCUPANCIES`/`COACH_OCCUPANCIES` và là đơn vị điểm danh. Không còn là đơn vị đăng ký (Member ghi danh cả lớp).

| Field | Vai trò |
|---|---|
| `SessionId` (PK) | Định danh buổi |
| `ClassId` (FK) / `SessionNo` | Thuộc lớp nào, buổi thứ mấy — **unique `(ClassId, SessionNo)`** |
| `RoomId` (FK) | Phòng thực tế (có thể khác `DefaultRoomId` khi Manager dời/đổi phòng, BR-54) |
| `CoachId` (FK) | Coach thực tế (có thể khác Coach lớp khi đổi/dạy thay) |
| `StartAtUtc` / `EndAtUtc` | Mốc tuyệt đối UTC — dùng check trùng lịch, tính hạn sửa điểm danh |
| `RescheduledFromSessionId` (self-FK, nullable) | Buổi gốc khi đây là buổi dời lịch — giữ vết |
| `IsMakeup` () | Buổi bù thêm ở cuối lịch của khóa |

### `ENROLLMENTS`

| Field | Vai trò |
|---|---|
| `EnrollmentId` (PK) | Định danh |
| `MemberId` (FK) | Ai ghi danh |
| `SourceEnrollmentId` (self-FK, nullable) | Ghi danh này là kết quả chuyển lớp từ ghi danh nào (BR-120) |
| `TransferDifferenceInvoiceItemId` (nullable FK) | Dòng invoice chênh lệch đã thanh toán cho chuyển sang khóa đắt hơn |

Ràng buộc: unique một phần `(ClassId, MemberId) WHERE Status = 'Confirmed'` — không ghi danh trùng cùng lớp.

### `SEAT_HOLDS`
**Mục đích:** giữ chỗ tạm trong lúc Member checkout để không bán vượt sĩ số. Tạo cùng Invoice `PendingPayment` (tăng `Class.ReservedCount`); hết hạn hoặc hủy thì trả chỗ; thanh toán xong thì chuyển thành `Enrollment` `Confirmed`.

| Field | Vai trò |
|---|---|
| `HoldId` (PK) | Định danh |
| `ClassId` (FK) / `MemberId` (FK) / `InvoiceId` (FK) | Giữ chỗ cho ai, ở lớp nào, thuộc checkout nào |
| `ExpiresAt` | Bằng hạn `PAYMENT_ATTEMPTS`, tối đa `hold.minutes` (mặc định 15) — job nền hết hạn giữ chỗ |
| `Status` | `SeatHoldStatus`: `Active`, `Converted`, `Expired`, `Released` |

Ràng buộc: unique một phần `(ClassId, MemberId) WHERE Status = 'Active'`.

### `CLASS_THRESHOLD_RESPONSES`
**Mục đích:** khi lớp dưới ngưỡng hoàn vốn (`ThresholdStatus = AtRisk`), mỗi học viên nhận email và chọn **chuyển lớp** hoặc **hoàn điểm**; bảng này lưu lựa chọn và hạn phản hồi. Quá hạn không phản hồi → tự hoàn điểm.

| Field | Vai trò |
|---|---|
| `ResponseId` (PK) | Định danh |
| `ClassId` (FK) / `MemberId` (FK) | Lớp AtRisk và học viên |
| `EnrollmentId` (FK, **unique**) | Mỗi ghi danh chỉ có 1 phản hồi |
| `TokenHash` | Băm token trong liên kết email phản hồi — bảo mật, không lưu plaintext |
| `DeadlineUtc` | Hạn phản hồi (mặc định 48 giờ, `class.threshold_response_hours`) |
| `Choice` | `ThresholdChoice`: `Pending`, `Transfer`, `RefundPoints`, `AutoRefund` |
| `TargetClassId` (FK, nullable) / `TransferInvoiceId` (FK, nullable) | Lớp đích và Invoice chênh lệch giá khi chuyển lớp |
| `ResolvedAt` (nullable) | Khi đã xử lý xong |

### `ATTENDANCE`
**Mục đích:** kết quả điểm danh của một học viên ở **một buổi của lớp**. Do **Receptionist** điểm danh lớp nhóm (Coach chỉ xem); PT có bảng/trạng thái riêng (`PT_SESSIONS` giữ `NoShow`).

| Field | Vai trò |
|---|---|
| `AttendanceId` (PK) | Định danh |
| `EnrollmentId` (FK) | Ghi danh nào |
| `LastModifiedAt` | Mốc sửa gần nhất — cho phép sửa sau buổi **≤ 24 giờ**, có Audit (BR-98) |

> ExternalCoach **không có** bảng điểm danh: lượt thuê sân không điểm danh học viên riêng của họ (chỉ có `CourtRentals.ExpectedAttendees` do coach tự khai, BR-131).

### `ROOM_OCCUPANCIES`
**Mục đích:** nơi **duy nhất** database kiểm tra trùng phòng/sân (PostgreSQL không cho exclusion constraint chạy chéo nhiều bảng). Mỗi buổi lớp, buổi PT có phòng, lượt thuê sân và block đều ghi 1 dòng ở đây.

| Field | Vai trò |
|---|---|
| `OccupancyId` (PK) | Định danh |
| `RoomId` (FK) | Phòng/sân bị chiếm |
| `Period` (`tstzrange`) | Khoảng thời gian chiếm |
| `SourceType` / `SourceId` | `OccupancySourceType`: `ClassSession`, `PtSession`, `CourtRental`, `RoomBlock`; `SourceId` (text) trỏ về bản ghi nguồn |
| `IsActive` | `false` khi hủy/dời/hết hạn thay vì xóa dòng |

Ràng buộc: `EXCLUDE USING gist (RoomId WITH =, Period WITH &&) WHERE (IsActive)` (cần extension `btree_gist`). Vi phạm trả `23P01` → service trả `409 conflict` kèm mô tả xung đột. Dòng occupancy phải được ghi/vô hiệu cùng transaction với thao tác nguồn.

### `COACH_OCCUPANCIES`
**Mục đích:** chống trùng lịch **Coach** (cả Coach và ExternalCoach): một người không thể ở hai nơi cùng lúc giữa buổi lớp, buổi PT và lượt thuê sân.

| Field | Vai trò |
|---|---|
| `OccupancyId` (PK) | Định danh |
| `CoachId` (FK → USER_ACCOUNTS) | Coach hoặc ExternalCoach |
| `Period` (`tstzrange`) | Khoảng thời gian bận |
| `SourceType` / `SourceId` | `ClassSession`, `PtSession`, `CourtRental` (không có `RoomBlock`) |
| `IsActive` | `false` khi hủy/dời |

Ràng buộc: `EXCLUDE USING gist (CoachId WITH =, Period WITH &&) WHERE (IsActive)`.

### `COURT_RENTALS`
**Mục đích:** lượt **thuê sân theo giờ** của ExternalCoach (dạy học viên riêng của họ). Thanh toán qua Invoice item `CourtRental` (điểm và/hoặc VNPay). Giữ chỗ khi `PendingPayment`.

| Field | Vai trò |
|---|---|
| `RentalId` (PK) | Định danh |
| `ExternalCoachId` (FK) / `RoomId` (FK) | Ai thuê, sân nào |
| `StartAtUtc` / `EndAtUtc` | **Bội số 60 phút** (`rental.slot_minutes`), tối đa `rental.max_hours` (4), đặt trước tối đa `rental.advance_days` (30), phải nằm trong giờ hoạt động |
| `HourlyRateSnapshot` / `TotalAmount` | Đơn giá snapshot từ `COURT_RATES` và tổng tiền — đổi giá sau không ảnh hưởng lượt đã đặt |
| `Status` | `CourtRentalStatus`: `PendingPayment`, `Confirmed`, `Expired`, `CancelledByCoach`, `CancelledByCenter`, `Completed` |
| `HoldExpiresAt` (nullable) | Hạn giữ sân khi `PendingPayment` |
| `InvoiceId` (FK) | Hóa đơn item `CourtRental` |
| `ExpectedAttendees` (nullable) | Số học viên coach tự khai (BR-131) — chỉ để tham khảo, **không điểm danh** |
| `CancelledAt` / `CancelReason` (nullable) | Hủy: miễn phí nếu trước `rental.cancel_free_hours` (24) |

`PendingPayment` và `Confirmed` giữ dòng `ROOM_OCCUPANCIES` + `COACH_OCCUPANCIES`; `Expired`/hủy vô hiệu hóa chúng.

### `GYM_CHECKINS`
**Mục đích:** ghi nhận Member ra vào tập Gym/Fitness **tự do, không qua đặt lịch** — tách khỏi ghi danh lớp. Chỉ Receptionist ghi nhận — xem BR-64. **Giữ nguyên ở v3** (Gym là môn `WalkIn` trong `SPORTS`; đảm bảo có `CheckOutTime`).

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

**Quy tắc:** thêm `Status`/`UpdatedAt`/`Version` để có lifecycle archive thay vì hard delete — plan đã giao cho Member hoặc đã dùng làm nguồn `HOMEWORK_ASSIGNMENTS` không được xóa cứng.

| Field | Vai trò |
|---|---|
| `PlanId` (PK) | Định danh kế hoạch |
| `MemberId` (FK) | Kế hoạch dành cho ai |
| `CoachId` (FK) | Ai lập |
| `RelationshipId` (FK) | Trỏ về đúng quan hệ Coach–Member cho phép hành động này — dùng để authorize + audit |
| `Goal` / `Level` | Copy/snapshot mục tiêu & trình độ tại thời điểm lập plan (có thể khác `MEMBER_TRAINING_PROFILE` hiện tại nếu profile đã update sau đó) |
| `CreatedAt` | Mốc tạo plan |
| `Status` (mới BE-4) | `Draft/Active/Archived` — archive thay hard delete |
| `UpdatedAt` (mới BE-4) | Mốc sửa gần nhất |
| `Version` (mới BE-4) | Optimistic concurrency token cho update items theo transaction |

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
**Mục đích:** ghi nhận **kết quả tập thực tế** sau 1 buổi PT — khác `WORKOUT_PLANS` (kế hoạch, việc *sẽ* làm) ở chỗ đây là log việc *đã* xảy ra.

**Quy tắc:** `EnrollmentId` → `PtSessionId` (unique, 1–1). Lớp nhóm (Cầu lông/Bóng rổ) không dùng `WORKOUT_RESULTS` — mô hình PT session cũ ép qua `Enrollment` đã bị loại bỏ hoàn toàn .

| Field | Vai trò |
|---|---|
| `ResultId` (PK) | Định danh |
| `PtSessionId` (FK, unique) | Kết quả của buổi PT nào — 1–1 với `PT_SESSIONS`. DB tự chặn ghi 2 result cho cùng 1 session |
| `CoachId` (FK) | Ai ghi nhận — phải bằng `PT_SESSIONS.CoachId` thực tế của session đó tại thời điểm ghi |
| `ProgressNote` | Ghi chú tiến độ (khách quan — vd "nâng được thêm 5kg") |
| `CoachComment` | Nhận xét của Coach (định tính) |
| `RecordedAt` | Mốc ghi nhận |

**Progress timeline** không cần entity riêng: là projection từ `PT_SESSIONS + WORKOUT_RESULTS`, sắp theo `StartAtUtc`, lọc theo ngày/member và pagination.

### `PT_ENTITLEMENTS`
**Mục đích:** quyền lợi/quota PT mà Member đã mua — do Payment tạo ở `PendingPayment` và kích hoạt sau thanh toán qua contract nội bộ `IPtEntitlementLifecycle` (không phải HTTP endpoint).

| Field | Vai trò |
|---|---|
| `EntitlementId` (PK) | Định danh; `INVOICE_ITEMS.RelatedEntityId` của Payment sẽ trỏ tới ID này |
| `ActivationReference` | UUID opaque, nullable khi `PendingPayment`, unique khi có giá trị — Payment dùng để activate idempotent (vd theo `InvoiceItemId`) |
| `MemberId` (FK) | Member hưởng quyền lợi |
| `OriginMemberPackageId` / `CurrentMemberPackageId` (FK `MEMBER_PACKAGES`) | Membership Active lúc checkout PT / Membership đang cấp validity hiện hành (đổi khi carry-over) |
| `CoachId` (FK) | Coach có specialty PT (môn `OneOnOne`) mà Member đã chọn |
| `FrequencyPerWeek` | Chỉ 1, 2 hoặc 3 — chỉ dùng tính `TotalQuota`, không giới hạn số buổi/tuần thực tế |
| `TotalQuota` | Tổng số buổi PT theo BR-71 (4/8/12 × số tháng Membership) |
| `ReservedSessions` / `ConsumedSessions` | Đang giữ quota chưa dùng / đã dùng (Completed, late cancel, no-show, old leg của late reschedule) |
| `ValidityStartDate` / `ValidityEndDate` | Snapshot period của Membership hiện hành, inclusive |
| `CarryOverUntilDate` | `ValidityEndDate + 30 ngày` theo BR-66 |
| `Status` | `PendingPayment/Active/AwaitingCarryOver/Exhausted/Expired/Cancelled` |
| `ActivatedAt` / `CancelledAt` | Audit thời gian |
| `Version` | Optimistic concurrency token — bắt buộc dùng thật (khác `MEMBER_PACKAGES.Version` hiện tại chưa từng được tăng) |

Ràng buộc: `RemainingQuota = TotalQuota - ReservedSessions - ConsumedSessions`; `0 <= ReservedSessions`, `0 <= ConsumedSessions`, `ReservedSessions + ConsumedSessions <= TotalQuota`. Không dùng `MEMBER_PACKAGES.RemainingSessions` cho PT.

### `PT_SESSIONS`
**Mục đích:** từng buổi PT 90 phút, 1 Coach : 1 Member — thay thế hoàn toàn việc dùng `CLASSES`/`CLASS_SESSIONS`/`ENROLLMENTS` cho PT.

| Field | Vai trò |
|---|---|
| `SessionId` (PK) | Định danh |
| `EntitlementId` (FK) | Buổi thuộc quyền lợi PT nào |
| `MemberId` (FK) | Snapshot/FK để query và ràng buộc overlap — phải khớp `EntitlementId.MemberId` |
| `CoachId` (FK) | Coach thực tế của buổi — giữ nguyên khi đã diễn ra, chỉ đổi cho session tương lai khi coach-change được duyệt |
| `StartAtUtc` / `EndAtUtc` | UTC; `EndAtUtc = StartAtUtc + 90 phút`, server tự tính, API chỉ nhận `StartAtUtc` |
| `RoomId` (FK, nullable, ) | Phòng PT (loại Phòng PT/Gym hợp lệ với môn PT); nếu có thì phát sinh dòng `ROOM_OCCUPANCIES`; luôn phát sinh `COACH_OCCUPANCIES` cho Coach |
| `Status` | `Scheduled/Completed/CancelledOnTime/CancelledLate/NoShow/RescheduledOnTime/RescheduledLate` |
| `QuotaState` | `Reserved/Consumed/Released` — theo dõi quota gắn với session để transition không double-consume/release |
| `RescheduledFromSessionId` (self-FK, nullable) | Trỏ về session cũ khi đây là session thay thế |
| `CreatedByUserId` | Manager tạo lịch |
| `CompletedAt` / `CancelledAt` / `CancellationReason` | Audit thời gian và lý do |
| `Version` | Optimistic concurrency token |

Chỉ `Scheduled` chặn slot thời gian; không cho cùng Coach hoặc cùng Member có 2 session `Scheduled` giao nhau (`[StartAtUtc, EndAtUtc)`). phần chống trùng Coach còn được đảm bảo ở DB bằng `COACH_OCCUPANCIES` (gồm cả buổi lớp và thuê sân); PT vẫn có `NoShow` (là nơi duy nhất còn No-show).

### `PT_SESSION_CHANGE_REQUESTS`
**Mục đích:** Member xin `Cancel`/`Reschedule` một `PT_SESSIONS`; Manager duyệt/từ chối.

| Field | Vai trò |
|---|---|
| `RequestId` (PK) | Định danh |
| `SessionId` (FK) | Session bị/được yêu cầu đổi |
| `RequestedByUserId` | Member gửi yêu cầu |
| `RequestType` | `Cancel/Reschedule` |
| `RequestedStartAtUtc` (nullable) | Giờ mong muốn khi `Reschedule` |
| `RequestedAt` / `Reason` | Thời điểm gửi và lý do |
| `TimingClassification` | `OnTime/Late` — tính tại `RequestedAt` (đối chiếu deadline 24 giờ), không tính tại lúc Manager duyệt |
| `RequestsException` | Member xin ngoại lệ rule trễ hạn |
| `Status` | `Pending/Approved/Rejected/Withdrawn` |
| `ReviewedByUserId` / `ReviewedAt` / `ReviewNote` | Manager xử lý |

Mỗi session tối đa 1 request `Pending`; request `Approved` phải áp dụng thay đổi session + quota trong cùng transaction.

### `PT_COACH_CHANGE_REQUESTS`
**Mục đích:** Member xin đổi Coach PT đang phụ trách entitlement của mình.

| Field | Vai trò |
|---|---|
| `RequestId` (PK) | Định danh |
| `EntitlementId` (FK) | Entitlement muốn đổi Coach |
| `MemberId` | Người yêu cầu |
| `CurrentCoachId` / `RequestedCoachId` | Coach hiện tại / Coach mong muốn (phải là Coach active có specialty PT) |
| `Reason` / `RequestedAt` | Lý do và thời điểm |
| `Status` | `Pending/Approved/Rejected` |
| `ReviewedByUserId` / `ReviewedAt` / `ReviewNote` | Manager xử lý |

Khi `Approved`: đổi `PT_ENTITLEMENTS.CoachId`, kết thúc `COACH_MEMBER_RELATIONSHIP` cũ và tạo/đảm bảo quan hệ mới, chuyển từng `PT_SESSIONS` tương lai `Scheduled` sang Coach mới nếu không conflict (session conflict giữ Coach cũ, trả `unmovedSessionIds` cho Manager xử lý thủ công) — không tự hủy session conflict.

### `HOMEWORK_ASSIGNMENTS`
**Mục đích:** bài tập về nhà PT giao cho Member — nguồn dữ liệu thật thay vì dùng chuỗi `NOTIFICATIONS` làm nguồn.

| Field | Vai trò |
|---|---|
| `AssignmentId` (PK) | Định danh |
| `MemberId` / `CoachId` / `RelationshipId` (FK) | Ai giao cho ai, theo đúng quan hệ đang `Active` |
| `SourceWorkoutPlanId` (FK, nullable) | Snapshot từ `WORKOUT_PLANS` nếu có, không phụ thuộc ngược khi plan nguồn đổi sau |
| `Title` / `CoachNote` | Tiêu đề và ghi chú của Coach |
| `AssignedAt` / `DueAt` / `CompletedAt` / `ReviewedAt` | Mốc thời gian theo từng bước |
| `Status` | `Assigned/InProgress/Completed/Reviewed/Cancelled` |
| `MemberFeedback` | Phản hồi của Member — chỉ Member sửa, PT không sửa |
| `Version` | Optimistic concurrency token |

Chỉ PT có quan hệ `Active` với Member mới tạo/sửa/hủy/review; Member chỉ đọc và cập nhật `InProgress`/`Completed` + feedback của chính mình; Coach không có specialty PT (và ExternalCoach) luôn bị 403; relationship kết thúc không xóa homework cũ, chỉ chặn assignment mới. `NOTIFICATIONS` chỉ báo "có bài mới", không thay thế bản ghi này.

### `HOMEWORK_ASSIGNMENT_ITEMS`
**Mục đích:** snapshot từng bài tập trong 1 `HOMEWORK_ASSIGNMENTS` — tách bảng con như `WORKOUT_PLAN_ITEMS`.

| Field | Vai trò |
|---|---|
| `ItemId` (PK) | Định danh |
| `AssignmentId` (FK) | Thuộc assignment nào |
| `Exercise` / `Sets` / `Reps` / `Notes` | Thông số bài tập, snapshot tại thời điểm giao |

---

## Module: Payment

> Invoice được tạo tại checkout và trả **đủ một lần** trong một checkout, nhưng có thể **chia**: một phần bằng **điểm** (`PointsApplied`) và phần còn lại bằng **VNPay-QR** (`CashAmount`). Tối đa một Payment thành công cho phần tiền. PaymentAttempt có thể tạo lại. **Hoàn trả chỉ bằng điểm** — không hoàn tiền mặt/chuyển khoản, **không gọi VNPay Refund API** (BR-135). Quy đổi **1 điểm = 1.000 VND, không hết hạn, không rút tiền mặt** (BR-134).
> **Implementation:** checkout, wallet, VNPay adapter/IPN/QueryDR và refund điểm đã có mã. Sandbox thật chưa được nghiệm thu trong đợt rà soát; xem mục 13 của thiết kế hệ thống.
> Người thụ hưởng Invoice có thể là **Member hoặc ExternalCoach** (thuê sân).

### `INVOICES`
**Mục đích:** chứng từ checkout bất biến sau khi Paid, giữ người thụ hưởng, người khởi tạo, tổng tiền snapshot và cách chia điểm/tiền.

| Field | Vai trò |
|---|---|
| `InvoiceId` (PK) | Định danh nội bộ |
| `InvoiceNumber` | Mã hóa đơn dễ đọc, **unique**, sinh từ DB sequence (không random ở app) để tránh trùng khi 2 request song song (constraint #5, BR-58) |
| `MemberId` (FK), API `beneficiaryUserId` | Member (Membership/PT/gói lớp) hoặc ExternalCoach (thuê sân) hưởng dịch vụ; tách khỏi người checkout |
| `IssuedByUserId` (FK) | Member/ExternalCoach tự checkout hoặc Receptionist thao tác hộ |
| `TotalAmount` | Tổng snapshot các InvoiceItem; VND, trả đủ trong một checkout, không cọc/trả góp/thiếu/thừa |
| `PointsApplied` (int, mặc định 0, ) | Số điểm dùng thanh toán (BR-136). Điểm được **giữ** (`Hold`) lúc checkout và **trừ** (`Spend`) khi Invoice Paid |
| `CashAmount` () | Phần phải thu tiền = `TotalAmount − PointsApplied × 1000`. Khi `= 0` **không tạo `PAYMENT_ATTEMPTS`** và Invoice chuyển `Paid` ngay trong transaction fulfillment (BR-85) |
| `PaidVia` (nullable, ) | Chuỗi persistence; wire `POINTS`, `VN_PAY`, `VN_PAY_AND_POINTS` và các giá trị đối soát theo API contract; null khi chưa Paid |
| `HoldExpiresAtUtc` | Hạn giữ chỗ/giữ điểm của checkout (`hold.minutes`, mặc định 15) |
| `Status` | `ISSUED`, `PAID`, `VOID`, `PAID_AFTER_RECONCILIATION`; expiry thuộc checkout/attempt; Paid không sửa/xóa/void |
| `IssuedAt` | Mốc tạo Invoice tại checkout; gửi email qua outbox |

### `INVOICE_ITEMS`
**Mục đích:** snapshot từng dòng hàng và là đơn vị tính eligibility/số điểm hoàn.

| Field | Vai trò |
|---|---|
| `ItemId` (PK) | Định danh dòng |
| `InvoiceId` (FK) | Thuộc hóa đơn nào |
| `ItemType` / `RelatedEntityId` | `InvoiceItemType` = `Membership`, `PT`, `ClassPackage`, `CourtRental`, `ClassTransferDifference`. `RelatedEntityId` trỏ catalog/plan hoặc `ThresholdResponseId` với chênh chuyển lớp |
| `SourceInvoiceItemId` (nullable self-FK) | Item gốc của lớp được chuyển; gom invoice chênh đã trả vào refund cap theo item gốc |
| `Description` / `UnitPrice` / `Quantity` / `LineAmount` | Snapshot tên, đơn giá, số lượng, thành tiền; tổng LineAmount phải bằng `Invoice.TotalAmount`; giá lớp/giá sân là bội số 1.000 VND |

### `PAYMENT_ATTEMPTS`
**Mục đích:** mỗi lần mở thanh toán **VNPay-QR** cho phần tiền của một Invoice, cho phép retry mà không tạo Payment thành công trùng. **Chỉ tạo khi `Invoice.CashAmount > 0`.** Đã có CheckoutService và gateway/reconciliation sử dụng attempt; thanh toán sandbox thật cần nghiệm thu riêng.

| Field | Vai trò |
|---|---|
| `PaymentAttemptId` (PK) / `InvoiceId` (FK) | Định danh attempt và Invoice được thanh toán |
| `VnpTxnRef` | Unique toàn hệ thống; ký request và đối chiếu IPN/QueryDR |
| `Amount` | khớp chính xác `Invoice.CashAmount` (không phải TotalAmount) |
| `ExpiresAt` | Lấy theo `vnp_ExpireDate` Sandbox/merchant hỗ trợ; đồng thời là hạn `SEAT_HOLDS`/giữ sân/giữ điểm, tối đa `hold.minutes` |
| `Status` | `PENDING`, `EXPIRED`, `SUCCEEDED`, `FAILED`, `RECONCILIATION_REQUIRED` |
| Gateway payload/timestamps | Lưu dữ liệu cần đối soát, không lưu secret |

### `PAYMENTS`
**Mục đích:** bản ghi thu tiền đã được backend xác minh qua IPN hoặc QueryDR; mỗi Invoice tối đa một Payment `SUCCESS`. **Chỉ ghi phần tiền thu**, không ghi phần thanh toán bằng điểm (điểm nằm ở `POINT_LEDGER`).

| Field | Vai trò |
|---|---|
| `PaymentId` (PK) / `InvoiceId` (FK) / `PaymentAttemptId` (FK) | Giao dịch, hóa đơn và attempt đã xác minh |
| `Amount` | bằng `Invoice.CashAmount` (phần tiền), không phải TotalAmount |
| `Method` | `PaymentMethod.VnPay` cho gateway; Cash/Card/Transfer/EWallet giữ để đọc lịch sử. Điểm được ghi ở ledger, không tạo payment tiền cho phần điểm. |
| `VnpTransactionNo` | Unique khi có giá trị; mã giao dịch VNPay dùng đối soát |
| `Status` | `SUCCESS`; không cho Receptionist cập nhật thủ công |
| `PaidAt` / `VnpPayDate` | Mốc thu tiền; dùng ngày Việt Nam để ghi nhận doanh thu và StartDate lần mua mới |

### `PAYMENT_ADJUSTMENTS` — hoàn điểm theo invoice item

| Field | Vai trò |
|---|---|
| `RequestedByUserId` / `OnBehalfOfMemberId` | Member tự yêu cầu hoặc Receptionist tạo hộ; trường hợp tạo hộ bắt buộc lý do |
| `Reason` / `CenterFault` | Lý do audit; lỗi trung tâm mở ngoại lệ theo phần quyền lợi chưa dùng |
| `SystemCalculatedPoints` / `ApprovedPoints` | Số điểm (làm tròn xuống): 50% Membership đủ điều kiện, PT chưa dùng, gói lớp trước khai giảng 100% (`RefundCalculator`); Manager không được duyệt vượt mức hệ thống tính |
| `ApprovedByUserId` / `ApprovedAt` | Chỉ Center Manager approve/reject |
| `PointLedgerEntryId` (FK, nullable, ) | Dòng ghi điểm `Earn` sinh ra khi `Completed` |
| `RequestedAt` / `CompletedAt` | Mốc yêu cầu và hoàn tất; ghi nhận điểm phát hành (`PointsIssued`) khi `Completed` |

> Hoàn do **hệ thống** (hủy lớp, lớp dưới ngưỡng và Member chọn/tự hoàn, hủy sân do trung tâm/sự cố) **không tạo `REFUNDS`**: ghi thẳng `POINT_LEDGER` với `ReferenceType = SystemEvent`.
> Refund dùng PaymentAdjustment hiện có; không tạo bảng REFUNDS riêng. Luồng ghi Discount/Correction và payout tiền mặt legacy bị chặn; giữ lịch sử đọc.

**Persistence:** `PaymentAdjustment` là persistence chung: Refund mới yêu cầu `InvoiceItemId`, ghi `CenterFault`, `SystemCalculatedPoints`, `ApprovedPoints`, `PointLedgerEntryId`; `Amount`/`RequestedAmount` để 0. `RefundMethod`, `RefundReferenceCode`, `LegacyPayoutUnverified`, `CompletedByUserId` được giữ để đọc dữ liệu legacy, nhưng endpoint payout đã gỡ. Legacy Refund không tự backfill item khi invoice có nhiều item; migration chỉ gắn item nếu chính xác một item. Manager hoàn điểm và module entitlement hủy quyền lợi trong cùng transaction.

### `POINT_WALLETS`
**Mục đích:** ví điểm của Member/ExternalCoach; điểm là công cụ hoàn trả và thanh toán nội bộ, không rút được thành tiền, **không hết hạn**. Module Payment (`Wallet/`). Tạo tự động khi tạo tài khoản Member/ExternalCoach.

| Field | Vai trò |
|---|---|
| `WalletId` (PK) | Định danh |
| `OwnerUserId` (FK, **unique**) | Chủ ví — mỗi tài khoản đúng 1 ví |
| `AvailablePoints` (≥ 0) | Điểm còn dùng được |
| `HeldPoints` (≥ 0) | Điểm đang giữ cho checkout `PendingPayment` |
| `Version` | Optimistic concurrency token — chống dùng điểm đồng thời |

### `POINT_LEDGER` (`PointLedgerEntry` — BR-94, 137)
**Mục đích:** sổ cái giao dịch điểm, **chỉ ghi thêm** (không UPDATE/DELETE — chặn bằng trigger hoặc quyền DB); là nguồn để đối soát số dư và báo cáo `PointsIssued`/`PointsRedeemed`/`OutstandingPoints`. Không có cột hết hạn.

| Field | Vai trò |
|---|---|
| `EntryId` (PK) / `WalletId` (FK) | Định danh dòng và ví |
| `EntryType` | `PointEntryType`: `Earn` (cộng — hoàn trả), `Hold` (giữ khi checkout), `Release` (nhả giữ khi hết hạn/hủy), `Spend` (trừ khi Paid), `Adjustment` (Manager điều chỉnh, có lý do) |
| `Points` | Số dương; chiều tăng/giảm suy ra từ `EntryType` |
| `AvailableAfter` / `HeldAfter` | Số dư sau giao dịch — đối soát và hiển thị lịch sử |
| `ReferenceType` / `ReferenceId` | `RefundRequest`, `SystemEvent`, `Invoice`, `ManagerAdjustment` và id tương ứng |
| `InvoiceItemId` (FK, nullable; quyết định kỹ thuật P1.08) | Item tạo ra điểm refund; dùng giới hạn hoàn lũy kế qua user-request/SystemEvent, không suy luận từ free-form note |
| `InvoiceId` (FK, nullable) | Invoice liên quan (Hold/Spend/Release) |
| `CreatedByUserId` / `Reason` | Ai/lý do — bắt buộc lý do với `Adjustment` |

Ràng buộc: **unique `(ReferenceId, EntryType)`** để idempotent (không cộng/trừ hai lần cùng một sự kiện).

### `POINT_CONFIRMATIONS`
**Mục đích:** xác nhận của Member khi **Receptionist dùng điểm thanh toán thay** tại quầy. **OTP bắt buộc** — 6 chữ số gửi email Member, hiệu lực 5 phút, tối đa 5 lần nhập sai; không có cách xác nhận khác tại quầy. Member tự checkout khi đã đăng nhập chỉ bấm xác nhận số điểm (`ConfirmedVia = MemberSession`), không cần OTP.

| Field | Vai trò |
|---|---|
| `ConfirmationId` (PK) | Định danh |
| `InvoiceId` (FK) / `MemberId` (FK) | Hóa đơn và Member phải xác nhận |
| `RequestedByUserId` (FK) | Receptionist đề nghị dùng điểm |
| `Points` | Số điểm xin dùng |
| `OtpHash` | Băm OTP, không lưu/log plaintext |
| `ExpiresAt` | Hết hạn sau 5 phút (`points.confirm_otp_minutes`) |
| `FailedAttempts` | Số lần sai; tối đa 5 thì `Failed` |
| `Status` | `PointConfirmationStatus`: `Pending`, `Confirmed`, `Expired`, `Failed`, `Cancelled` |
| `ConfirmedAt` (nullable) / `ConfirmedVia` (nullable) | `Otp` (quầy) hoặc `MemberSession` (Member tự checkout) |

---

## Module: hỗ trợ hệ thống (Notification, AI, Audit)

### `NOTIFICATIONS`
**Mục đích:** hàng đợi thông báo gửi cho user (đổi lịch, sắp hết hạn gói, nhận thanh toán...) — MVP có thể chỉ lưu trong DB (chưa gửi SMS/email thật), nhưng schema đã tính sẵn kênh + retry.

| Field | Vai trò |
|---|---|
| `NotificationId` (PK) | Định danh |
| `UserId` (FK) | Gửi cho ai |
| `Channel` | `IN_APP/EMAIL/SMS` — kênh gửi |
| `SourceEventType` | `CLASS_CANCELLED/SCHEDULE_CHANGED/PACKAGE_EXPIRING/PAYMENT_RECEIVED` (giữ) — loại sự kiện sinh ra thông báo này. **Thêm v3** (thiết kế hệ thống): `ClassThresholdAtRisk`, `ClassTransferResult`, `ClassCancelledByCenter`, `PointsCredited`, `RentalConfirmed`, `RentalCancelled`, `IncidentNotice`, `ExternalCoachDecision`, `PasswordChanged`, `PointConfirmationOtp`, `PasswordResetOtp` (email OTP/thông báo đi qua outbox) |
| `SourceEntityId` (nullable) | Trỏ tới entity gây ra sự kiện (vd `SessionId` nếu là `CLASS_CANCELLED`) |
| `Message` | Nội dung hiển thị |
| `Status` | `PENDING/SENT/FAILED/READ` — vòng đời gửi + đã đọc chưa |
| `RetryCount` | Số lần đã thử gửi lại (khi `FAILED`) |
| `LastAttemptAt` / `SentAt` | Mốc lần thử gần nhất / mốc gửi thành công |

### `AI_LOGS`
**Mục đích:** log mọi lượt gọi tính năng AI (gợi ý bài tập — Flow 5; **chatbot function calling — Flow 6, nhóm làm ở v3**, BR-123/124) — phục vụ debug, đo hiệu năng, và audit việc AI trả lời/gọi hàm gì cho ai. Từ v3 chatbot có tool registry (Member xem lịch hôm nay; Manager gợi ý xếp lịch tạo lớp `Draft` chờ xác nhận) nên mỗi lượt ghi thêm tool call.

| Field | Vai trò |
|---|---|
| `LogId` (PK) | Định danh |
| `UserId` (FK) | Ai gọi AI |
| `QueryType` | Loại truy vấn (vd `WORKOUT_SUGGESTION`, `CHAT`) — `CHAT` nay được triển khai (Flow 6, nhóm làm) |
| `InputPayload` (jsonb) | Input thực tế gửi cho AI — debug khi kết quả sai |
| `ResponsePayload` (jsonb) | Kết quả AI trả về |
| `ResponseTimeMs` | Đo hiệu năng, phát hiện AI chậm/timeout |
| `CreatedAt` | Mốc gọi |
| `ToolCalls` (jsonb, nullable, ) | Danh sách hàm chatbot đã gọi (tên, tham số, kết quả) — tối đa 2 vòng/lượt; ghi để audit vì hàm ghi chỉ tạo **đề xuất** chờ Manager xác nhận |
| `ConversationId` () | Gom các lượt chat cùng một cuộc hội thoại |

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

### `SYSTEM_SETTINGS`
**Mục đích:** cấu hình vận hành dạng key/value do Manager chỉnh qua UI (có audit). Cấu trúc field giữ nguyên; v3 chỉ **thêm các khóa** để các ngưỡng/thời hạn mới không bị hard-code:

| Key | Mặc định | BR | Vai trò |
|---|---|---|---|
| `class.threshold_days_before_start` | 3 | 119 | Chốt ngưỡng hoàn vốn trước giờ buổi đầu N ngày |
| `class.threshold_response_hours` | 48 | 120 | Hạn Member phản hồi chuyển lớp/hoàn điểm khi lớp AtRisk |
| `hold.minutes` | 15 | 115 | Thời gian giữ chỗ/giữ điểm/giữ sân lúc checkout |
| `points.vnd_per_point` | 1000 | 134 | Quy đổi 1 điểm = 1.000 VND |
| `points.confirm_otp_minutes` | 5 | 139 | Hiệu lực OTP xác nhận dùng điểm tại quầy |
| `rental.slot_minutes` | 60 | 126 | Đơn vị thuê sân |
| `rental.max_hours` | 4 | 128 | Số giờ tối đa mỗi lượt thuê |
| `rental.advance_days` | 30 | 128 | Đặt trước tối đa |
| `rental.cancel_free_hours` | 24 | 129 | Hủy miễn phí nếu trước giờ thuê tối thiểu |
| `membership.expiry_notice_days` | 7 | 33 | Báo sắp hết hạn Membership |

---

## Field Identity

Các field này mô tả yêu cầu BR-60/BR-78; trạng thái code/migration được đánh giá riêng khi triển khai.

| Entity.Field | Mục đích và ràng buộc |
|---|---|
| EmailOtp (entity mới, module Identity) | Theo email và purpose; chỉ mã hiện hành có hiệu lực. Phục vụ BR-78 — xác thực OTP khi Register bằng email/mật khẩu. thêm `Purpose` (`Register`/`ResetPassword`/`ExternalCoachRegister`) — mỗi mục đích một OTP còn hiệu lực cho cùng email (xem `EMAIL_OTPS`) |
| EmailOtp.Purpose () | Enum `EmailOtpPurpose`; dùng cho đăng ký, quên mật khẩu (BR-103, bằng link email) và đăng ký ExternalCoach (BR-105) |
| EmailOtp.Email | Email chuẩn hóa; chỉ OTP mới nhất còn hiệu lực; rate limit theo email và IP |
| EmailOtp.CodeHash | Hash của mã OTP 6 số; không lưu hoặc log plaintext |
| EmailOtp.ExpiresAt | Mã hết hạn sau 10 phút kể từ lần yêu cầu gần nhất |
| EmailOtp.Attempts | Số lần verify sai liên tiếp cho mã hiện tại; vượt 5 lần → phải yêu cầu mã mới |
| EmailOtp.ConsumedAt | null = còn dùng được; set khi verify đúng, mã không dùng lại được lần 2 |
| Google onboarding state | Email mới qua Google tạo account chờ thiết lập password; user phải nhập/confirm password mạnh trước khi dùng chức năng protected |
| AuthResponse.SuggestedPassword | **Không sử dụng.** Hệ thống không sinh hoặc gửi mật khẩu gợi ý theo BR-60 v1.8 |

## Field chuyên môn Coach

| Entity.Field | Mục đích và ràng buộc |
|---|---|
| CoachProfile (entity, module Identity) | 1–1 `UserAccount`, được tạo cho Coach, giữ record lịch sử khi đổi role. Không nhân bản email/họ tên/số điện thoại/mật khẩu. chỉ còn `UserId` + `Bio` |
| CoachProfile.Salary/HourlyRate/CommissionRate/EmploymentContract | **Không dùng (giữ).** Payroll/hợp đồng nhân sự ngoài phạm vi (BR-101, kể cả chia doanh thu với coach ngoài) |
| Vòng đời CoachProfile khi đổi role | **Quy tắc:** giữ làm lịch sử, không cascade delete, không soft-disable; role hiện tại trên `UserAccount` quyết định hiệu lực |

---
