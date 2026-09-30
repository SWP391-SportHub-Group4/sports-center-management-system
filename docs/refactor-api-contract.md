# Hợp đồng API refactor đa môn (backend)

Trạng thái: **P1.00 — baseline**. Phần A liệt kê route thực tế lúc khảo sát (30/09/2026, branch `develop`, commit `a5c480b`). Phần B là khung để mỗi chặng P1.xx bổ sung verb/path, actor, request/response/error, enum, transaction, idempotency, ownership. Plan 2 (frontend) chỉ được dựa vào các mục đã chuyển sang trạng thái *Đã triển khai*.

## Quy ước chung

- Enum wire hiện tại: `JsonStringEnumConverter` (tên PascalCase, ví dụ `Issued`). Plan yêu cầu chuẩn đích UPPER_SNAKE_CASE — **chưa đổi**, sẽ ghi vào đây khi thực hiện.
- Enum DB hiện tại: lưu int mặc định EF (không có `HasConversion`). Khi thêm giá trị phải append, không đổi số cũ. `UserRole` hiện: CenterManager=0, Coach=1, Member=2, Receptionist=3, SystemAdministrator=4 → ExternalCoach phải là 5.
- `InvoiceStatus` hiện: Issued=0, Paid=2, Void=3.
- Auth: JWT Bearer; policy trong `backend/SportHub.BuildingBlocks/Api/SportHubPolicies.cs`.

## Phần A — Route baseline (trước refactor)

### AuditLogsController — `api/audit-logs`

| Verb | Path |
|---|---|
| GET | `api/audit-logs` |

### ReportExportsController — `api/reports/exports`

| Verb | Path |
|---|---|
| GET | `api/reports/exports` |
| POST | `api/reports/exports` |
| GET | `api/reports/exports/{reportExportId:guid}/download` |
| POST | `api/reports/exports/{reportExportId:guid}/retry` |
| DELETE | `api/reports/exports/{reportExportId:guid}` |

### SystemSettingsController — `api/system-settings`

| Verb | Path |
|---|---|
| GET | `api/system-settings` |
| PUT | `api/system-settings/{key}` |

### UsersController — `api/users`

| Verb | Path |
|---|---|
| GET | `api/users` |
| GET | `api/users/admin` |
| GET | `api/users/{userId:guid}` |
| POST | `api/users` |
| PUT | `api/users/{userId:guid}/role` |
| POST | `api/users/{userId:guid}/lock` |
| POST | `api/users/{userId:guid}/unlock` |
| POST | `api/users/{userId:guid}/deactivate` |

### AiController — `api/ai`

| Verb | Path |
|---|---|
| POST | `api/ai/workout-suggestions/{memberId:guid}` |
| POST | `api/ai/chat` |
| GET | `api/ai/logs` |

### HealthController — `api/[controller]`

| Verb | Path |
|---|---|
| GET | `api/[controller]` |

### AccountController — `api/users/me`

| Verb | Path |
|---|---|
| GET | `api/users/me` |
| PUT | `api/users/me/profile` |
| POST | `api/users/me/password` |

### AuthController — `api/auth`

| Verb | Path |
|---|---|
| POST | `api/auth/register/otp` |
| POST | `api/auth/register` |
| POST | `api/auth/login` |

### GoogleAuthController — `api/auth`

| Verb | Path |
|---|---|
| POST | `api/auth/google` |
| POST | `api/auth/google/onboarding` |
| POST | `api/auth/google/link` |
| DELETE | `api/auth/google/link` |

### MemberPackagesController — `api`

| Verb | Path |
|---|---|
| GET | `api/members/me/packages` |
| GET | `api/members/{memberId:guid}/packages` |
| GET | `api/member-packages` |
| POST | `api/member-packages/{memberPackageId:guid}/cancel` |

### MembershipPackagesController — `api/membership-packages`

| Verb | Path |
|---|---|
| GET | `api/membership-packages` |
| POST | `api/membership-packages` |
| PUT | `api/membership-packages/{packageId:int}` |
| POST | `api/membership-packages/{packageId:int}/discontinue` |
| POST | `api/membership-packages/{packageId:int}/reactivate` |

### MembershipReportsController — `api/reports`

| Verb | Path |
|---|---|
| GET | `api/reports/membership-summary` |

### TrainingProfilesController — `api`

| Verb | Path |
|---|---|
| GET | `api/members/me/training-profile` |
| PUT | `api/members/me/training-profile` |
| GET | `api/members/{memberId:guid}/training-profile` |

### NotificationsController — `api/notifications`

| Verb | Path |
|---|---|
| GET | `api/notifications` |
| GET | `api/notifications/unread-count` |
| POST | `api/notifications/{notificationId:guid}/read` |
| POST | `api/notifications/read-all` |

### InvoicesController — `api`

| Verb | Path |
|---|---|
| GET | `api/invoices` |
| GET | `api/members/me/invoices` |
| GET | `api/invoices/{invoiceId:guid}` |
| POST | `api/member-packages/purchase` |
| POST | `api/invoices/{invoiceId:guid}/payments` |
| POST | `api/invoices/{invoiceId:guid}/adjustments` |

### PaymentAdjustmentsController — `api/payment-adjustments`

| Verb | Path |
|---|---|
| GET | `api/payment-adjustments` |
| POST | `api/payment-adjustments/{adjustmentId:guid}/approve` |
| POST | `api/payment-adjustments/{adjustmentId:guid}/complete` |
| POST | `api/payment-adjustments/{adjustmentId:guid}/reject` |

### RevenueReportsController — `api/reports`

| Verb | Path |
|---|---|
| GET | `api/reports/revenue` |

### AttendanceController — `api/attendance`

| Verb | Path |
|---|---|
| POST | `api/attendance/{enrollmentId:guid}` |
| GET | `api/attendance/sessions/{sessionId:guid}` |

### ClassesController — `api/classes`

| Verb | Path |
|---|---|
| GET | `api/classes` |
| GET | `api/classes/{classId:int}` |
| POST | `api/classes` |
| PUT | `api/classes/{classId:int}` |
| POST | `api/classes/{classId:int}/archive` |
| POST | `api/classes/{classId:int}/reactivate` |
| POST | `api/classes/{classId:int}/recurrences` |
| DELETE | `api/classes/{classId:int}/recurrences/{recurrenceId:int}` |
| POST | `api/classes/{classId:int}/generate-sessions` |

### ClassSessionsController — `api/class-sessions`

| Verb | Path |
|---|---|
| GET | `api/class-sessions` |
| GET | `api/class-sessions/mine` |
| GET | `api/class-sessions/{sessionId:guid}` |
| GET | `api/class-sessions/{sessionId:guid}/roster` |
| POST | `api/class-sessions` |
| PUT | `api/class-sessions/{sessionId:guid}` |
| POST | `api/class-sessions/{sessionId:guid}/cancel` |
| POST | `api/class-sessions/{sessionId:guid}/reschedule` |

### ClassUtilizationReportsController — `api/reports`

| Verb | Path |
|---|---|
| GET | `api/reports/class-utilization` |

### EnrollmentsController — `api`

| Verb | Path |
|---|---|
| POST | `api/enrollments` |
| POST | `api/enrollments/{enrollmentId:guid}/cancel` |
| GET | `api/members/me/enrollments` |
| GET | `api/members/me/schedule` |
| GET | `api/members/{memberId:guid}/enrollments` |

### GymCheckInsController — `api/gym-checkins`

| Verb | Path |
|---|---|
| POST | `api/gym-checkins` |

### MemberGymCheckInsController — `api/members`

| Verb | Path |
|---|---|
| GET | `api/members/me/gym-checkins` |
| GET | `api/members/{memberId:guid}/gym-checkins` |

### RoomsController — `api/rooms`

| Verb | Path |
|---|---|
| GET | `api/rooms` |
| POST | `api/rooms` |
| PUT | `api/rooms/{roomId:int}` |
| DELETE | `api/rooms/{roomId:int}` |

### CoachMemberRelationshipsController — `api/coach-member-relationships`

| Verb | Path |
|---|---|
| GET | `api/coach-member-relationships` |
| POST | `api/coach-member-relationships` |
| POST | `api/coach-member-relationships/{relationshipId:guid}/end` |

### HomeworkController — `api`

| Verb | Path |
|---|---|
| GET | `api/coaches/me/homework` |
| POST | `api/coaches/me/homework` |
| PUT | `api/coaches/me/homework/{assignmentId:guid}` |
| POST | `api/coaches/me/homework/{assignmentId:guid}/review` |
| POST | `api/coaches/me/homework/{assignmentId:guid}/cancel` |
| GET | `api/members/me/homework` |
| PATCH | `api/members/me/homework/{assignmentId:guid}` |

### PtCoachChangeRequestsController — `api`

| Verb | Path |
|---|---|
| GET | `api/manager/pt-coach-change-requests` |
| POST | `api/manager/pt-coach-change-requests/{requestId:guid}/approve` |
| POST | `api/manager/pt-coach-change-requests/{requestId:guid}/reject` |
| POST | `api/members/me/pt-entitlements/{entitlementId:guid}/coach-change-requests` |

### PtEntitlementsController — `api`

| Verb | Path |
|---|---|
| GET | `api/manager/pt-entitlements` |
| GET | `api/members/me/pt-entitlements` |

### PtSessionChangeRequestsController — `api`

| Verb | Path |
|---|---|
| GET | `api/manager/pt-session-change-requests` |
| POST | `api/manager/pt-session-change-requests/{requestId:guid}/approve` |
| POST | `api/manager/pt-session-change-requests/{requestId:guid}/reject` |
| POST | `api/members/me/pt-sessions/{sessionId:guid}/change-requests` |

### PtSessionsController — `api`

| Verb | Path |
|---|---|
| GET | `api/manager/pt-sessions` |
| POST | `api/manager/pt-sessions` |
| POST | `api/manager/pt-sessions/{sessionId:guid}/cancel` |
| POST | `api/manager/pt-sessions/{sessionId:guid}/reschedule` |
| GET | `api/coaches/me/pt-sessions` |
| GET | `api/coaches/me/pt-sessions/{sessionId:guid}` |
| POST | `api/coaches/me/pt-sessions/{sessionId:guid}/complete` |
| POST | `api/coaches/me/pt-sessions/{sessionId:guid}/no-show` |
| GET | `api/members/me/pt-sessions` |

### WorkoutController — `api`

| Verb | Path |
|---|---|
| GET | `api/members/me/workout-plans` |
| GET | `api/members/me/workout-results` |
| GET | `api/coaches/me/workout-plans` |
| POST | `api/workout-plans` |
| PUT | `api/workout-plans/{planId:guid}` |
| POST | `api/workout-plans/{planId:guid}/activate` |
| POST | `api/workout-plans/{planId:guid}/archive` |
| GET | `api/coaches/me/workout-results` |
| POST | `api/workout-results` |
| PUT | `api/workout-results/{ptSessionId:guid}` |
| GET | `api/coaches/me/progress` |
| GET | `api/members/me/progress` |
| GET | `api/members/{memberId:guid}/workout-results` |

## Phần B — Contract đích theo chặng

| Chặng | Trạng thái | Ghi chú |
|---|---|---|
| P1.01 Ports | Một phần | Ports khai báo trong BuildingBlocks (chưa có implementation); role ExternalCoach=5 và policy mới đã đăng ký. Route chưa đổi. |
| P1.02 Model & migration | Identity/Catalog/Course/Wallet đã có | Còn schema checkout/retry, threshold/rentals theo các phase sau. |
| P1.03 Identity/ExternalCoach | Phần lớn xong | Mật khẩu, OTP, security stamp, ExternalCoach, CoachAdminService và specialty đã có. Outbox email nâng cao thuộc P1.11. |
| P1.04 Catalog & occupancy | Xong | Phần D; lớp và PT đã dùng occupancy, thuê sân nối ở P1.10. |
| P1.05 Lớp/điểm danh/Gym/PT | Gate xong | Phần F; thanh toán/fulfillment khóa thật do P1.07 nối tiếp. |
| P1.06 Wallet & OTP quầy | Đã triển khai ví và xác nhận/giữ điểm | Phần E; QR, Spend + fulfillment và checkout retry do P1.07 nối tiếp. |
| P1.07 Checkout/VNPay | Chưa làm | |
| P1.08 Refund điểm | Chưa làm | |
| P1.09 Ngưỡng & chuyển lớp | Chưa làm | |
| P1.10 Thuê sân | Chưa làm | |
| P1.11 Incident/outbox/settings | Chưa làm | |
| P1.12 Báo cáo/seed/config | Chưa làm | |
| P1.13 Kiểm thử | Chưa làm | |

AI (`api/ai/*`) nằm ngoài gate của hai plan; chỉ sửa tối thiểu để build.

## Phần C — Route mới đã triển khai (P1.03)

| Verb | Path | Actor | Request | Response / lỗi chính |
|---|---|---|---|---|
| POST | `api/auth/password/forgot` | ẩn danh, 3/phút/IP | `{email}` | 204 luôn |
| POST | `api/auth/password/reset` | ẩn danh, 3/phút/IP | `{email, otpCode, newPassword, confirmNewPassword}` | 204; 400 `otp_invalid` `otp_expired` `otp_already_used` `otp_attempts_exceeded` `password_*` |
| POST | `api/users/me/password` | đã đăng nhập | `{currentPassword?, newPassword, confirmNewPassword}` | 200 `{accessToken}`; 400 `current_password_required` `new_password_same_as_current` `password_*`; 401 `invalid_credentials` |
| POST | `api/auth/external-coach/otp` | ẩn danh | `{email}` | 204; 409 `email_already_exists`; 429 `otp_resend_too_soon`; 503 `otp_email_send_failed` |
| POST | `api/auth/external-coach/register` | ẩn danh | `{email, password, confirmPassword, fullName, phone?, otpCode, bio?, sportIds[1..10]}` | 201 `AuthResponse` (`user.approvalStatus`, `user.sportIds`); 400 `invalid_sport` `otp_*` `password_*`; 409 |
| GET, PUT | `api/external-coaches/me` | ExternalCoach (mọi trạng thái) | PUT `{bio}` | `ExternalCoachResponse` |
| GET | `api/manager/external-coaches` | CenterManager | query `status, keyword, page, pageSize` | `PagedResult<ExternalCoachResponse>` |
| GET | `api/manager/external-coaches/{userId}` | CenterManager | — | `ExternalCoachResponse`; 404 |
| POST | `api/manager/external-coaches/{userId}/approve`, `/reject`, `/suspend`, `/reactivate` | CenterManager | `{note}` (bắt buộc cho reject và suspend) | 200; 400 `review_note_required`; 409 `invalid_approval_transition` |

Máy trạng thái duyệt: PendingApproval → Approved hoặc Rejected; Approved → Suspended; Suspended → Approved.
`ExternalCoachResponse`: `userId, email, fullName, phone, bio, approvalStatus, sportIds[], reviewedByUserId, reviewedAt, reviewNote, createdAt`.
JWT có thêm claim `sst`; middleware từ chối token thiếu/sai `sst` hoặc sai role (401).
Ghi chú: `POST api/users` và `PUT api/users/{id}/role` từ chối role `ExternalCoach` (400 `external_coach_managed_separately`); `coachCategory` trong response là DEPRECATED.

## Phần D — Route mới đã triển khai (P1.04)

Actor viết tắt: **M** = CenterManager (policy `CatalogManage`), **FD** = Manager + Receptionist, **Staff** = Manager, Receptionist, Coach, **Auth** = mọi người đã đăng nhập.

| Verb | Path | Actor | Request | Response / lỗi chính |
|---|---|---|---|---|
| GET | `api/sports` | ẩn danh | — | `SportResponse[]` chỉ môn active |
| GET | `api/manager/sports` | M | — | mọi môn |
| POST | `api/manager/sports` | M | `{name, operationType(WalkIn\|OneOnOne\|GroupCourse), defaultSessionMinutes?, defaultMaxCapacity?, description?, imageUrl?, sortOrder}` | 201; 400 `invalid_operation_type` `sport_group_course_defaults_required`; 409 `sport_name_taken` |
| PUT | `api/manager/sports/{id}` | M | như trên | 200; 400 `sport_operation_type_immutable`; 404 `sport_not_found` |
| POST | `api/manager/sports/{id}/deactivate`, `/activate` | M | — | `SportResponse` |
| GET | `api/room-types` | Auth | — | `[{roomTypeId, name, sportIds[]}]` |
| POST | `api/manager/room-types` | M | `{name}` | 201; 409 `room_type_name_taken` |
| PUT | `api/manager/room-types/{id}` | M | `{name}` | 200 |
| PUT | `api/manager/room-types/{id}/sports` | M | `{sportIds[]}` (thay toàn bộ) | 200; 400 `invalid_sport` |
| DELETE | `api/manager/room-types/{id}` | M | — | 204; 409 `room_type_in_use` |
| GET | `api/rooms` | Staff | — | `RoomResponse` thêm `roomTypeId`, `isActive` |
| POST, PUT | `api/rooms`, `api/rooms/{id}` | M | `{name, capacity, roomTypeId?, isActive?}` (isActive null = giữ nguyên) | 400 `invalid_room_type`; 409 `room_name_taken` |
| DELETE | `api/rooms/{id}` | M | — | 204; 409 `room_in_use` |
| GET | `api/rooms/{roomId}/opening-hours` | Auth | — | `[{dayOfWeek(0=CN..6), openTimeLocal "HH:mm", closeTimeLocal}]` |
| PUT | `api/manager/rooms/{roomId}/opening-hours` | M | `{hours:[{dayOfWeek, openTimeLocal, closeTimeLocal}]}` (thay toàn bộ, ≤7) | 200; 400 `invalid_opening_hours` `duplicate_opening_day` `invalid_time` |
| GET | `api/manager/room-blocks?roomId&fromUtc&toUtc` | FD | — | `RoomBlockResponse[]` (mặc định 31 ngày, tối đa 62) |
| POST | `api/manager/room-blocks` | M | `{roomId, startAtUtc, endAtUtc, reason}` | 201; **409 `occupancy_conflict` + `conflicts[]`** `{resource, conflictSourceType, conflictSourceId, startUtc, endUtc}`; 400 `block_in_the_past` `invalid_range` |
| DELETE | `api/manager/room-blocks/{blockId}` | M | — | 204; 409 `room_block_from_incident` |
| GET | `api/court-rates?roomTypeId` | Auth | — | khung giá active |
| GET | `api/manager/court-rates?roomTypeId` | M | — | gồm cả inactive |
| POST, PUT | `api/manager/court-rates`, `.../{rateId}` | M | `{roomTypeId, sportId?, daysOfWeek["MON".."SUN"], startTimeLocal, endTimeLocal, pricePerHour, isActive}` | 400 `invalid_price` `invalid_rate_window` `invalid_days` `sport_not_compatible`; 409 `court_rate_overlap` |
| DELETE | `api/manager/court-rates/{rateId}` | M | — | 204 |
| GET | `api/availability/rooms?sportId&startUtc&endUtc` | Staff | — | `[{roomId,name,roomTypeId,capacity}]`; khoảng tối đa 12 giờ |
| GET | `api/availability/coaches?sportId&startUtc&endUtc` | Staff | — | `[{coachId, fullName}]` |
| GET | `api/availability/rooms/{roomId}/busy?fromUtc&toUtc` | FD | — | `[{resource, sourceType, sourceId, startAtUtc, endAtUtc}]`; tối đa 31 ngày |

Mã lỗi DB chưa được service bắt (mọi endpoint): 409 `occupancy_conflict`, 409 `duplicate_value`, 409 `reference_violation`, 409 `concurrency_conflict`, 400 `constraint_violation`.
Mọi thời điểm trong request/response là UTC; giờ mở cửa và khung giá là giờ địa phương Asia/Ho_Chi_Minh (UTC+7 cố định).

## Phần E — P1.06 Wallet và xác nhận dùng điểm

Các endpoint sau đã có source và integration test PostgreSQL. 1 điểm = 1.000 VND; điểm là integer, tiền là decimal. `Confirmed` ở xác nhận điểm chưa phải Invoice Paid.

| Verb | Path | Actor | Request / Response |
|---|---|---|---|
| GET | `api/wallet/me` | Member/ExternalCoach | `{ownerUserId, availablePoints, heldPoints, vndPerPoint}`; subject lấy từ JWT |
| GET | `api/wallet/me/ledger?page&pageSize` | Member/ExternalCoach | Mảng ledger, mới nhất trước; page >=1, pageSize 1..100 |
| GET | `api/members/{memberId}/points`, `.../points/ledger` | Receptionist/Manager | Chỉ Member; ghi audit lần xem |
| POST | `api/wallets/{ownerId}/adjustments` | Manager | `{idempotencyKey:guid, points:int>0, direction:"Credit"|"Debit", reason}`; trả WalletResult. Cùng key khác payload → 409; Debit chỉ tiêu available |
| GET | `api/invoices/{invoiceId}/point-selection` | Chủ invoice hoặc Receptionist | `{invoiceId, memberId, pointsApplied, cashAmount, holdExpiresAtUtc, status, revision}`; Receptionist chỉ xem Member, có audit |
| POST | `api/invoices/{invoiceId}/point-confirmations` | Receptionist | `{memberId, points:int>0, revision:int}`; trả `{confirmationId, invoiceId, memberId, points, expiresAtUtc, holdExpiresAtUtc, status:"Pending", revision}` |
| POST | `api/point-confirmations/{confirmationId}/verify` | Lễ tân đã yêu cầu mã | `{code:"6 digits"}`; trả PointSelectionResponse, status `Confirmed`; giữ điểm đúng một lần |
| POST | `api/invoices/{invoiceId}/point-confirmations/clear` | Receptionist | `{memberId, revision}`; release điểm của cycle cũ, vô hiệu OTP, tăng revision; dùng khi bỏ chọn/đổi Member tại UI |
| POST | `api/wallet/me/checkouts/{invoiceId}/points` | Member/ExternalCoach | `{points:int>=0}`; 0 = bỏ điểm; invoice phải thuộc JWT subject, không nhận owner từ client, không cần OTP |

Ledger trả `id, entryType, points, availableDelta, heldDelta, availableAfter, heldAfter, referenceType, referenceId, note, createdAtUtc`. Entry types: `HOLD/RELEASE/SPEND/EARN/ADJUSTMENT`. Actor được lưu ở ledger; không có endpoint nạp/rút/chuyển điểm.

**Luồng và lỗi:**
- Đọc point-selection lấy revision trước khi yêu cầu OTP. Stale revision → 409 `checkout_revision_changed`. Hóa đơn legacy không có cycle, đã Paid/Void hoặc quá hạn → 409 `checkout_unavailable`; khác Member → 403 `invoice_not_owned`.
- OTP 6 số, PBKDF2 có salt, hết hạn `min(now+5 phút, holdExpiresAtUtc)`. Gửi lại bằng POST request với revision mới; cùng lựa chọn trong 60s → 409 `point_confirmation_cooldown`. Rate limit request 3/phút theo IP + token → 429. Đổi điểm/gửi lại/bỏ chọn không kéo dài hạn invoice.
- Chỉ lễ tân yêu cầu mã được verify. Sai mã → 400 `point_confirmation_invalid`; 5 lần sai đã commit → 409 `point_confirmation_locked`; hết hạn/vô hiệu → 409 `point_confirmation_expired`. Gọi đúng mã lặp/song song không Hold hai lần.
- Verify kiểm lại role/active Member, revision/cycle, invoice chưa trả, hạn và số dư. Thiếu điểm → 409 `insufficient_points`; OTP chưa consumed. Invoice/hold/OTP rollback cùng nhau khi lỗi sau Hold.
- Đã có payment/attempt/adjustment → 409 `payment_already_started`, không sửa số tiền của QR cũ. Thu tiền thủ công khi đang chọn/giữ điểm → 409 `point_checkout_requires_gateway`.
- Self selection chỉ đổi điểm trên invoice của chính mình; points > total/1000 bị 400 `invalid_points`. Đổi/bỏ điểm release cycle cũ và tạo reference mới, không âm available/held.
- Job mỗi phút release điểm trên hóa đơn Issued đã quá hạn hoặc Void. Expired state được suy từ thời gian server ngay cả khi job chưa xử lý.

**Bàn giao P1.07:** chu kỳ hiện snapshot trên Invoice (`CheckoutCycleId/CheckoutRevision/HoldExpiresAtUtc`). `PointsApplied` là điểm đang Hold; `CashAmount=TotalAmount-PointsApplied*1000`. Cash=0 vẫn chờ P1.07 thực hiện Spend + fulfillment atomic; không phát QR, không tự mark Paid. P1.07 cần entity CheckoutSession/lịch sử retry, nối quote/reserve course/rental, tạo attempt, callback/reconcile và Spend/Release với reference `CheckoutSession` + cycle ID. Đây chưa phải checkout v3 hoàn chỉnh.

**Email:** dùng SMTP; chỉ Development có `Email:DemoLoggingEnabled=true` mới được log nội dung demo. Gửi thất bại thì revoke mã vừa tạo; không tự giữ điểm hoặc báo xác nhận thành công. Outbox email/retry bền vững thuộc P1.11.

## Phần F — P1.05 Lớp theo khóa, điểm danh, Gym và PT

| Verb | Path | Actor | Hành vi chính |
|---|---|---|---|
| GET | `api/classes`, `api/classes/{classId}` | Public | Chỉ `Published`, không trả chi phí/ngưỡng nội bộ; giá và chỗ còn theo cả khóa. |
| GET/POST/PUT | `api/manager/classes`, `api/manager/classes/{classId}`, `api/manager/classes/{classId}/publish`, `.../cancel` | Manager | Soạn Draft; publish khóa + đủ buổi + occupancy + audit + thông báo Coach cùng transaction; hủy chặn nếu đã có ghi danh/giữ chỗ. |
| GET | `api/classes/{classId}/sessions`, `api/class-sessions/{sessionId}`, `.../roster` | Nhân viên; Coach đúng lớp | Buổi của cả khóa và roster Confirmed; Coach chỉ đọc lớp được giao. |
| POST | `api/class-sessions/{sessionId}/reschedule`, `.../cancel` | Manager | Kiểm lại room/coach/opening/capacity/lịch Member; hủy buộc có buổi bù hợp lệ. |
| PUT | `api/class-sessions/{sessionId}/attendance/{enrollmentId}` | Receptionist | `{status:"Present"|"Absent"}`; từ đầu buổi đến hết 24 giờ sau cuối buổi; ghi audit khi thay đổi. |
| GET | `api/members/me/enrollments`, `.../schedule` | Member | Ghi danh và lịch cá nhân; không có endpoint tự ghi danh từng buổi. |
| POST | `api/gym-checkins/{checkInId}/checkout` | Receptionist | Giờ server, idempotent; checkin chưa tồn tại/giờ vào tương lai bị từ chối. |

`IClassEnrollmentFulfillment` cung cấp quote, giữ chỗ, confirm, release và cancel trong transaction của caller; chưa có checkout course gọi port này để thu tiền thật. PT giữ endpoint ở Phần A, thêm `roomId` tùy chọn và chống trùng occupancy. Job NoShow chỉ xử lý buổi PT đã kết thúc; lớp nhóm không tự tạo Present/Absent.

## Phần G — P1.07 Checkout hiện hành

| Verb | Path | Actor | Hành vi |
|---|---|---|---|
| POST | `api/checkouts/membership`, `api/checkouts/class`, `api/checkouts/pt` | Member, Receptionist, Manager | Bắt buộc `Idempotency-Key`; staff chỉ định `targetMemberId`, Member chỉ mua cho mình. Trả CheckoutResponse với invoice/cycle/hạn/số tiền. |
| GET | `api/checkouts/{invoiceId}` | Chủ invoice hoặc staff | Trạng thái chu kỳ checkout hiện tại. |
| POST | `api/checkouts/{invoiceId}/attempts` | Chủ invoice hoặc staff | Tạo/đọc PaymentAttempt snapshot tiền/điểm và URL VNPay; 100% điểm hoàn tất ngay, không tạo attempt VNPay 0đ. |
| POST | `api/checkouts/{invoiceId}/cancel`, `.../retry` | Chủ invoice hoặc staff | Hủy nhả hold; retry sau hết hạn cấp invoice/cycle mới và `Idempotency-Key` mới. PT retry cần `priceVersion` mới. |
| GET/POST | `api/pt-pricing`, `api/checkouts/pt/quote` | Người dùng đã xác thực / Member hoặc staff | Giá PT và quote có version; checkout PT từ chối version cũ. |
| PUT | `api/manager/pt-pricing` | Manager | Đổi đơn giá PT hợp lệ. |
| GET | `api/payments/vnpay/return`, `api/payments/vnpay/ipn` | Public (VNPay) | Return chỉ đọc; IPN xác minh chữ ký/tham chiếu/số tiền rồi lưu event và thực hiện fulfillment. |
| POST | `api/invoices/{invoiceId}/reconcile` | FrontDesk | QueryDR xác minh giao dịch theo attempt mới nhất. |
| POST | `api/dev/payments/{reference}/simulate` | FrontDesk, Development | Mock callback qua cùng pipeline IPN; không có ở môi trường khác. |

Invoice checkout mới chặn route ghi payment thủ công. `PaidAfterReconciliation` biểu thị khoản thu đến muộn/không thể cấp quyền lợi; `VnPayCompensated` là đã bồi hoàn điểm đúng số tiền, còn `VnPayManualCompensation` + `ReconciliationRequired=true`/event `ManualCompensationRequired` cần xử lý tiền thực thu ngoài hệ thống khi không đổi chính xác sang điểm. `CheckoutSession` và `VerifiedGatewayEvent` giữ lịch sử/idempotency; các checkpoint E/F ở trên mô tả trạng thái khi mới triển khai từng phase. Thuê sân chưa có route checkout vì chờ CourtRental của P1.10.
