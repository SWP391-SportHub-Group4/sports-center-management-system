# Mục đích các Entity & vai trò từng Field (SportHub)

> Rút ra từ ERD v2 (`docs/Center-Management-System-Design-v2.md` §1), state transition (§2) và bảng ràng buộc DB (§3).
> File tham khảo nhanh — **chưa** đưa vào `docs/`, không phải nguồn chính thức; nếu có sai lệch, `docs/Center-Management-System-Design-v2.md` và `docs/00-Source-of-Truth.md` mới là nguồn thật.

---

## Module: Identity

### `USERS`
**Mục đích:** bảng người dùng gốc — mọi vai trò (Manager, Coach, Member, Receptionist) đều là 1 row ở đây, phân biệt qua `RoleID`. Không tách bảng riêng cho từng vai trò để tránh trùng lặp logic auth/login.

| Field | Vai trò |
|---|---|
| `UserID` (PK) | Định danh duy nhất, dùng làm khóa ngoại ở gần như mọi entity khác (member, coach, staff đều trỏ về đây) |
| `FullName` | Hiển thị UI, in hóa đơn, thông báo |
| `Email` | Định danh đăng nhập — **unique không phân biệt hoa/thường** (BR-49, index `LOWER(email)`) |
| `PasswordHash` | Lưu hash, không bao giờ lưu plaintext — dùng để xác thực khi login |
| `Phone` | Liên hệ, có thể dùng cho notification kênh SMS sau này |
| `RoleID` (FK → ROLES) | Quyết định phân quyền (RBAC) — 1 user chỉ có 1 role |
| `Status` | `ACTIVE / BANNED / DEACTIVATED` — kiểm soát user có được login/thao tác hay không, không xóa cứng user (giữ lịch sử payment/attendance) |
| `CreatedAt` | Audit, hiển thị "thành viên từ ngày..." |

### `ROLES`
**Mục đích:** danh mục cố định 4 vai trò trong hệ thống, tách riêng để RBAC dễ mở rộng (thêm role mới không cần đổi schema `USERS`).

| Field | Vai trò |
|---|---|
| `RoleID` (PK) | Khóa để `USERS.RoleID` trỏ vào |
| `RoleName` | `MANAGER, COACH, MEMBER, RECEPTIONIST` — dùng để check quyền ở middleware/policy |

---

## Module: Training (hồ sơ & quan hệ — nền tảng cho AI/Workout)

### `MEMBER_TRAINING_PROFILE`
**Mục đích:** hồ sơ tập luyện của Member — **bắt buộc phải có dữ liệu thật** để AI gợi ý bài tập (BR-26 yêu cầu đủ 3 tham số: goal, level, lịch sử) thay vì để client tự gửi tham số (dễ bị giả mạo/không chính xác).

| Field | Vai trò |
|---|---|
| `ProfileID` (PK) | Định danh hồ sơ |
| `MemberID` (FK, unique) | 1 Member chỉ có 1 hồ sơ — ràng buộc 1–1 |
| `Goal` | Mục tiêu tập (giảm cân, tăng cơ...) — input cho AI suggestion & để Coach tạo Workout Plan |
| `ExperienceLevel` | `BEGINNER/INTERMEDIATE/ADVANCED` — input cho AI + Coach điều chỉnh độ khó bài tập |
| `Notes` | Ghi chú tự do (chấn thương, hạn chế...) — Coach tham khảo khi lên plan |
| `UpdatedAt` | Biết hồ sơ có đang cũ/stale không (AI dựa vào profile cũ có thể gợi ý sai) |

### `COACH_MEMBER_RELATIONSHIP`
**Mục đích:** ghi nhận **ai là HLV phụ trách ai**, và **vì sao** (qua lớp học, cá nhân, hay Manager gán tay) — cần thiết vì 1 Coach chỉ được tạo Workout Plan / xem thông tin của Member mà mình thực sự phụ trách (BR-23/BR-24), không phải mọi Member.

| Field | Vai trò |
|---|---|
| `RelationshipID` (PK) | Định danh quan hệ |
| `CoachID` (FK) | HLV phụ trách |
| `MemberID` (FK) | Học viên được phụ trách |
| `SourceType` | `CLASS_BASED / PERSONAL / ASSIGNED_BY_MANAGER` — nguồn gốc quan hệ, dùng để audit/giải trình sao có quyền truy cập |
| `ClassID` (FK, nullable) | Nếu quan hệ phát sinh từ 1 lớp cụ thể (`CLASS_BASED`) thì trỏ tới lớp đó |
| `Status` | `ACTIVE/ENDED` — chỉ quan hệ ACTIVE mới cho phép Coach thao tác trên Member đó (constraint #7: không được có 2 quan hệ ACTIVE trùng) |
| `StartedAt` / `EndedAt` | Mốc thời gian bắt đầu/kết thúc phụ trách — phục vụ lịch sử, không xóa cứng khi kết thúc |

---

## Module: Membership

### `MEMBERSHIP_PACKAGES`
**Mục đích:** **danh mục** gói tập trung tâm bán ra (template) — KHÔNG phải gói của 1 Member cụ thể (đó là `MEMBER_PACKAGES` bên dưới). Ví dụ: "Gói 3 tháng không giới hạn", "Gói 10 buổi".

| Field | Vai trò |
|---|---|
| `PackageID` (PK) | Định danh gói |
| `Name` | Hiển thị cho Member chọn mua |
| `Price` | Giá bán — nguồn để tạo `InvoiceItems.Amount` khi Member mua |
| `DurationDays` | Thời hạn sử dụng gói (tính từ `MemberPackages.StartDate`) |
| `SessionLimit` | Giới hạn số buổi (`nullable` = không giới hạn) — nguồn gốc `MemberPackages.RemainingSessions` |

### `MEMBER_PACKAGES`
**Mục đích:** **instance thật** của 1 gói mà 1 Member đã mua/đang dùng — đây là entity trung tâm để kiểm tra "Member còn quyền đăng ký lớp không" (BR-16).

| Field | Vai trò |
|---|---|
| `MemberPackageID` (PK) | Định danh |
| `MemberID` (FK) | Ai sở hữu gói này |
| `PackageID` (FK) | Mua theo template gói nào |
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
| `RoomID` (PK) | Định danh phòng |
| `Name` | Hiển thị lịch/booking |
| `Capacity` | Trần sức chứa vật lý — dùng để tính `CLASS_SESSIONS.Capacity` = MIN(Room, Class) (BR-51) |

### `CLASSES`
**Mục đích:** định nghĩa **loại lớp** (ví dụ "Yoga cơ bản") — là template, không phải 1 buổi học cụ thể (đó là `CLASS_SESSIONS`).

| Field | Vai trò |
|---|---|
| `ClassID` (PK) | Định danh lớp |
| `Name` | Hiển thị cho Member chọn |
| `Discipline` | Bộ môn (Yoga, Gym, Boxing...) — filter/tìm kiếm |
| `DefaultRoomID` (FK) | Phòng mặc định khi sinh session, có thể bị override ở từng session |
| `DefaultCoachID` (FK, nullable) | HLV mặc định phụ trách lớp, cũng có thể override ở từng session |
| `Capacity` | Sức chứa mặc định của lớp — 1 trong 2 yếu tố tính MIN(Room, Class) cho session (BR-51) |
| `Status` | `ACTIVE/ARCHIVED` — lớp ngừng mở không xóa cứng (giữ lịch sử session/enrollment cũ) |

### `CLASS_RECURRENCE`
**Mục đích:** định nghĩa **quy luật lặp lại** của 1 lớp (ví dụ "Thứ 2-4-6, 18h-19h30") — tách riêng khỏi session cụ thể để 1 job nền có thể sinh trước hàng loạt `CLASS_SESSIONS` mà không phải nhập tay từng buổi.

| Field | Vai trò |
|---|---|
| `RecurrenceID` (PK) | Định danh pattern |
| `ClassID` (FK) | Pattern này thuộc lớp nào |
| `DaysOfWeek` | Các thứ trong tuần lặp lại (vd `MON,WED,FRI`) |
| `StartTimeLocal` / `EndTimeLocal` | Giờ bắt đầu/kết thúc theo giờ địa phương (không phải UTC — vì lịch lặp theo "giờ trong ngày", không theo mốc tuyệt đối) |
| `Timezone` | Neo giờ local về đúng múi giờ (`Asia/Ho_Chi_Minh`) khi convert sang `StartAtUtc`/`EndAtUtc` của session |
| `EffectiveFrom` / `EffectiveTo` | Khoảng thời gian pattern này còn áp dụng — cho phép đổi lịch theo kỳ mà không xóa lịch sử session cũ |

### `CLASS_SESSIONS`
**Mục đích:** **1 buổi học cụ thể**, có ngày giờ thật — là entity Member thực sự đăng ký vào (không đăng ký vào `CLASSES`). Được sinh tự động từ `CLASS_RECURRENCE`, hoặc tạo ad-hoc.

| Field | Vai trò |
|---|---|
| `SessionID` (PK) | Định danh buổi học |
| `ClassID` (FK) | Buổi học thuộc lớp nào |
| `RecurrenceID` (FK, nullable) | Sinh ra từ pattern nào — `null` nghĩa là session ad-hoc hoặc đã bị reschedule tách khỏi pattern |
| `RoomID` (FK) | Phòng thực tế của buổi này (có thể khác `Classes.DefaultRoomID` nếu đổi phòng) |
| `CoachID` (FK) | HLV thực tế dạy buổi này (có thể khác default nếu đổi HLV) |
| `StartAtUtc` / `EndAtUtc` | Mốc thời gian tuyệt đối (UTC) — dùng để check trùng lịch, tính deadline hủy, tính No-show |
| `Capacity` | Sức chứa thực tế buổi này (≤ MIN(Room, Class) tại thời điểm tạo — Manager chỉ được hạ, BR-51) |
| `ConfirmedCount` | **Denormalized**, tăng/giảm nguyên tử mỗi khi có Enrollment CONFIRMED/hủy — dùng để chặn overbooking bằng 1 UPDATE có điều kiện thay vì COUNT() (constraint #2) |
| `Status` | `SCHEDULED/RESCHEDULED/CANCELLED/COMPLETED` — vòng đời của chính buổi học |
| `RescheduledFromSessionID` (FK, nullable) | Nếu buổi này là kết quả dời lịch từ buổi khác, trỏ về buổi gốc — giữ vết lịch sử đổi lịch |

### `ENROLLMENTS`
**Mục đích:** ghi nhận **1 Member đăng ký vào 1 session cụ thể**, gắn với gói nào bị trừ buổi — là entity trung tâm của flow "Đặt lớp".

| Field | Vai trò |
|---|---|
| `EnrollmentID` (PK) | Định danh lượt đăng ký |
| `SessionID` (FK) | Đăng ký vào buổi nào |
| `MemberID` (FK) | Ai đăng ký |
| `MemberPackageID` (FK) | Gói nào bị trừ `RemainingSessions` cho lượt đăng ký này — cần thiết vì 1 Member có thể có nhiều gói cùng lúc |
| `Status` | `CONFIRMED/CANCELLED_ON_TIME/CANCELLED_LATE` — quyết định có hoàn credit hay không (BR-17/18), xem state machine §2.2 |
| `RegisteredAt` | Mốc đăng ký, dùng tính thứ tự/độ ưu tiên nếu cần |
| `CancelledAt` | Mốc hủy — so với deadline (đọc từ cấu hình, BR-50) để phân loại ON_TIME/LATE |
| `CancelledByUserID` (FK, nullable) | Ai bấm hủy — có thể khác Member (vd Receptionist hủy giúp) — phục vụ audit |

### `ATTENDANCE`
**Mục đích:** kết quả điểm danh của 1 Enrollment sau khi session diễn ra — phân biệt rõ được điểm danh tay (`PRESENT`/`ABSENT`) và No-show tự động (BR-53).

| Field | Vai trò |
|---|---|
| `AttendanceID` (PK) | Định danh |
| `EnrollmentID` (FK) | Điểm danh cho lượt đăng ký nào |
| `SessionID` / `MemberID` (FK) | Denormalize để query nhanh (khỏi join qua Enrollment) |
| `Status` | `PRESENT/ABSENT/NO_SHOW` — `PRESENT`/`ABSENT` do người ghi tay, `NO_SHOW` do `AttendanceFinalizerJob` tự sinh sau `EndAtUtc` nếu không có check-in |
| `CheckInTime` (nullable) | Thời điểm check-in thật (nếu có) |
| `CheckedInByUserID` (FK, nullable) | Ai thực hiện check-in (Coach/Receptionist) — null nếu do job tự động tạo (NO_SHOW) |

---

## Module: Training (Workout)

### `WORKOUT_PLANS`
**Mục đích:** kế hoạch tập do Coach lập cho 1 Member — chỉ được tạo nếu Coach có `COACH_MEMBER_RELATIONSHIP` ACTIVE với Member đó (đảm bảo đúng quyền phụ trách).

| Field | Vai trò |
|---|---|
| `PlanID` (PK) | Định danh kế hoạch |
| `MemberID` (FK) | Kế hoạch dành cho ai |
| `CoachID` (FK) | Ai lập |
| `RelationshipID` (FK) | Trỏ về đúng quan hệ Coach–Member cho phép hành động này — dùng để authorize + audit |
| `Goal` / `Level` | Copy/snapshot mục tiêu & trình độ tại thời điểm lập plan (có thể khác `MEMBER_TRAINING_PROFILE` hiện tại nếu profile đã update sau đó) |
| `CreatedAt` | Mốc tạo plan |

### `WORKOUT_PLAN_ITEMS`
**Mục đích:** từng bài tập cụ thể trong 1 kế hoạch — tách bảng con vì 1 plan có nhiều bài tập (1–N).

| Field | Vai trò |
|---|---|
| `ItemID` (PK) | Định danh dòng bài tập |
| `PlanID` (FK) | Thuộc plan nào |
| `Exercise` | Tên bài tập |
| `Sets` / `Reps` | Số hiệp / số lần — thông số tập luyện cụ thể |
| `Notes` | Ghi chú thêm (tempo, nghỉ giữa hiệp...) |

### `WORKOUT_RESULTS`
**Mục đích:** ghi nhận **kết quả tập thực tế** sau 1 session — khác `WORKOUT_PLANS` (kế hoạch, việc *sẽ* làm) ở chỗ đây là log việc *đã* xảy ra, gắn với đúng buổi học.

| Field | Vai trò |
|---|---|
| `ResultID` (PK) | Định danh |
| `SessionID` (FK) | Kết quả của buổi tập nào |
| `MemberID` (FK) | Của học viên nào |
| `CoachID` (FK) | Ai ghi nhận |
| `ProgressNote` | Ghi chú tiến độ (khách quan — vd "nâng được thêm 5kg") |
| `CoachComment` | Nhận xét của Coach (định tính) |
| `RecordedAt` | Mốc ghi nhận |

---

## Module: Payment

### `INVOICES`
**Mục đích:** hóa đơn — **bất biến** (BR-40), tạo **ngay khi Member chọn gói/dịch vụ**, TRƯỚC khi thanh toán (BR-30 v1.2). Không bao giờ bị xóa, chỉ chuyển trạng thái `VOID` khi cần hủy toàn phần.

| Field | Vai trò |
|---|---|
| `InvoiceID` (PK) | Định danh nội bộ |
| `InvoiceNumber` | Mã hóa đơn dễ đọc, **unique**, sinh từ DB sequence (không random ở app) để tránh trùng khi 2 request song song (constraint #5) |
| `MemberID` (FK) | Hóa đơn xuất cho ai |
| `IssuedByUserID` (FK) | Nhân viên nào xuất (thường Receptionist) — audit |
| `MemberPackageID` (FK, nullable) | Nếu hóa đơn gắn với 1 gói cụ thể thì trỏ tới đó (nullable vì có thể là phí khác, vd penalty) |
| `TotalAmount` | Tổng tiền phải thu — chuẩn để so sánh với tổng `PAYMENTS.Amount` (constraint #6, BR-41) |
| `Status` | `ISSUED → PARTIALLY_PAID → PAID` hoặc `→ VOID` — xem state machine §2.3 |
| `IssuedAt` | Mốc xuất hóa đơn |

### `INVOICE_ITEMS`
**Mục đích:** dòng chi tiết trong hóa đơn — 1 Invoice có thể có nhiều dòng (vd: tiền gói + phí phạt trong cùng 1 hóa đơn).

| Field | Vai trò |
|---|---|
| `ItemID` (PK) | Định danh dòng |
| `InvoiceID` (FK) | Thuộc hóa đơn nào |
| `Description` | Diễn giải hiển thị trên hóa đơn |
| `Amount` | Số tiền của dòng này — tổng các dòng phải khớp `Invoices.TotalAmount` |
| `RelatedEntityType` | `PACKAGE/CLASS_FEE/PENALTY` — dòng này phát sinh từ nguồn nào |
| `RelatedEntityID` (nullable) | Trỏ tới entity nguồn cụ thể (vd `MemberPackageID`) để truy vết |

### `PAYMENTS`
**Mục đích:** từng **giao dịch thu tiền** thật cho 1 Invoice — tách khỏi Invoice vì có thể trả nhiều lần/nhiều phương thức (Invoice bất biến, Payment là các lần thu nối tiếp).

| Field | Vai trò |
|---|---|
| `PaymentID` (PK) | Định danh giao dịch |
| `InvoiceID` (FK) | Thanh toán cho hóa đơn nào |
| `Amount` | Số tiền của lần thu này — tổng các `Amount` (status SUCCESS) không được vượt `Invoices.TotalAmount` (BR-41, constraint #6) |
| `Method` | `CASH/CARD/TRANSFER/EWALLET` — MVP chủ yếu ghi nhận thủ công |
| `ReferenceCode` (nullable) | Mã tham chiếu từ cổng thanh toán ngoài (nếu có) |
| `Status` | `PENDING/SUCCESS/FAILED` — chỉ `SUCCESS` mới tính vào tổng đã thu |
| `ReceivedByUserID` (FK) | Nhân viên nào nhận tiền — audit, thường Receptionist |
| `PaidAt` | Mốc thanh toán — dùng cho báo cáo doanh thu theo thời gian |

### `PAYMENT_ADJUSTMENTS`
**Mục đích:** điều chỉnh sau khi đã có Invoice/Payment — hoàn tiền, sửa sai, chiết khấu — có **workflow duyệt riêng** (không ai tự ý sửa hóa đơn/thanh toán gốc, giữ đúng nguyên tắc Invoice bất biến).

| Field | Vai trò |
|---|---|
| `AdjustmentID` (PK) | Định danh |
| `InvoiceID` (FK) | Điều chỉnh cho hóa đơn nào |
| `PaymentID` (FK, nullable) | Nếu liên quan 1 giao dịch thu tiền cụ thể thì trỏ tới đó |
| `Type` | `REFUND/CORRECTION/DISCOUNT` — loại điều chỉnh, quyết định công thức tính (BR-52 cho REFUND) |
| `Amount` | Số tiền điều chỉnh |
| `Reason` | Lý do — bắt buộc để Manager duyệt có căn cứ |
| `Status` | `REQUESTED → APPROVED/REJECTED → COMPLETED` — Receptionist tạo, **Manager phải duyệt, không được tự duyệt** (BR-42), xem state machine §2.4 |
| `RequestedByUserID` (FK) | Ai yêu cầu |
| `ApprovedByUserID` (FK, nullable) | Ai duyệt — null nếu chưa duyệt/bị từ chối |
| `CreatedAt` / `ResolvedAt` (nullable) | Mốc tạo yêu cầu / mốc xử lý xong — SLA, báo cáo |

---

## Module: hỗ trợ hệ thống (Notification, AI, Audit)

### `NOTIFICATIONS`
**Mục đích:** hàng đợi thông báo gửi cho user (đổi lịch, sắp hết hạn gói, nhận thanh toán...) — MVP có thể chỉ lưu trong DB (chưa gửi SMS/email thật), nhưng schema đã tính sẵn kênh + retry.

| Field | Vai trò |
|---|---|
| `NotificationID` (PK) | Định danh |
| `UserID` (FK) | Gửi cho ai |
| `Channel` | `IN_APP/EMAIL/SMS` — kênh gửi |
| `SourceEventType` | `CLASS_CANCELLED/SCHEDULE_CHANGED/PACKAGE_EXPIRING/PAYMENT_RECEIVED` — loại sự kiện sinh ra thông báo này |
| `SourceEntityID` (nullable) | Trỏ tới entity gây ra sự kiện (vd `SessionID` nếu là `CLASS_CANCELLED`) |
| `Message` | Nội dung hiển thị |
| `Status` | `PENDING/SENT/FAILED/READ` — vòng đời gửi + đã đọc chưa |
| `RetryCount` | Số lần đã thử gửi lại (khi `FAILED`) |
| `LastAttemptAt` / `SentAt` | Mốc lần thử gần nhất / mốc gửi thành công |

### `AI_LOGS`
**Mục đích:** log mọi lượt gọi tính năng AI (gợi ý bài tập — Flow 5) — phục vụ debug, đo hiệu năng, và audit việc AI trả lời gì cho ai. *(AI assistant/chat — Flow 6 — đã hạ xuống stretch, chỉ log nếu flow đó thực sự được triển khai; xem `00-Source-of-Truth.md` §1.4.)*

| Field | Vai trò |
|---|---|
| `LogID` (PK) | Định danh |
| `UserID` (FK) | Ai gọi AI |
| `QueryType` | Loại truy vấn (vd `WORKOUT_SUGGESTION`; `CHAT` chỉ áp dụng nếu Flow 6 — stretch — được triển khai) |
| `InputPayload` (jsonb) | Input thực tế gửi cho AI — debug khi kết quả sai |
| `ResponsePayload` (jsonb) | Kết quả AI trả về |
| `ResponseTimeMs` | Đo hiệu năng, phát hiện AI chậm/timeout |
| `CreatedAt` | Mốc gọi |

### `AUDIT_LOGS`
**Mục đích:** nhật ký thao tác quan trọng trên hệ thống (yêu cầu của Center Manager: "xem lịch sử thao tác quan trọng") — ai đổi gì, từ giá trị nào sang giá trị nào.

| Field | Vai trò |
|---|---|
| `AuditID` (PK) | Định danh |
| `UserID` (FK) | Ai thực hiện thao tác |
| `Action` | Loại hành động (vd `UPDATE_PACKAGE_STATUS`) |
| `TargetEntity` / `TargetID` | Thao tác tác động lên entity/record nào |
| `OldValue` / `NewValue` (jsonb, nullable) | Giá trị trước/sau — truy vết thay đổi thực tế, không chỉ ghi "đã sửa" chung chung |
| `IPAddress` | Nguồn thực hiện — phục vụ điều tra bảo mật nếu cần |
| `Timestamp` | Mốc thời gian |

---

*Nguồn: `docs/Center-Management-System-Design-v2.md` §1 (ERD), §2 (state transition), §3 (constraints). Field nào còn dấu `?` hoặc chưa rõ nghiệp vụ — hỏi lại BA/team lead trước khi code, đừng tự suy diễn (đúng nguyên tắc ở `docs/00-Source-of-Truth.md` §6).*
