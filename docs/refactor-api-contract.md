# Hợp đồng API refactor đa môn (backend)

Trạng thái hiện tại: **đã triển khai đến P1.12 và bổ sung regression P1.13**. Xem “Cập nhật P1.12/P1.13 — 01/10/2026” cuối tài liệu và evidence mới nhất. Phần A là route lịch sử trước refactor (30/09/2026, commit `a5c480b`); các ghi chú “chưa có” ở checkpoint cũ không thay thế contract mới. Chưa chứng minh VNPay sandbox thật; không coi toàn bộ plan 1 đã đóng khi còn phần lịch/incident lớp/PT được ghi ở progress.

## Quy ước chung

- Enum wire hiện tại: `JsonStringEnumConverter` (tên PascalCase, ví dụ `Issued`). Plan yêu cầu chuẩn đích UPPER_SNAKE_CASE — **chưa đổi**, sẽ ghi vào đây khi thực hiện.
- Enum DB hiện tại: lưu int mặc định EF (không có `HasConversion`). Khi thêm giá trị phải append, không đổi số cũ. `UserRole` hiện: CenterManager=0, Coach=1, Member=2, Receptionist=3, SystemAdministrator=4 → ExternalCoach phải là 5.
- `InvoiceStatus` hiện: Issued=0, Paid=2, Void=3.
- Auth: JWT Bearer; policy trong `backend/SportHub.BuildingBlocks/Api/SportHubPolicies.cs`.

## Phần I — P1.10 Court Rental (đã có PostgreSQL regression ở P1.13)

| Verb | Path | Actor / contract |
|---|---|---|
| POST | `/api/checkouts/court-rental` | ExternalCoach Approved; `Idempotency-Key`; body `{sportId, roomId, startUtc, endUtc, expectedAttendees}`. Giá server tính theo giờ, giữ occupancy rồi trả checkout; payment mới chuyển Confirmed. |
| GET | `/api/court-rentals/availability?sportId&startUtc&endUtc` | ExternalCoach; chỉ trả sân trống + báo giá giờ, không trả lớp/Member/nguồn lịch bận. |
| GET | `/api/court-rentals/mine?fromUtc&toUtc` | ExternalCoach; lượt thuê của chính họ. |
| POST | `/api/court-rentals/{rentalId}/cancel` | Chủ thuê; ≥24h trước giờ bắt đầu hoàn 100%, dưới 24h 0%; cùng transaction hủy occupancy. |
| GET | `/api/manager/court-schedule/rentals?roomId&fromUtc&toUtc` | Manager/Receptionist/Coach qua `StaffRead`; chỉ metadata thuê cần cho lịch, không roster Member. |
| POST | `/api/manager/court-rentals/{rentalId}/cancel` | CenterManager; body `{reason}`; center fault hoàn 100% bằng điểm và release occupancy nguyên tử. |

Invoice checkout giữ phòng + ExternalCoach bằng cùng occupancy constraints với class/PT/block. Hết hạn/hủy nhả đúng một lần; IPN muộn không Spend lại điểm đã release, chỉ reacquire khi slot còn hợp lệ; nếu không thì theo cơ chế bồi hoàn khoản cash đã xác minh. Migration `CourtRentalWorkflow` đã sinh nhưng chưa áp DB. Chưa chạy PostgreSQL concurrency/IDOR tests; xem checkpoint P1.10 ở `refactor-progress.md`.

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
| POST | `api/payment-adjustments/{adjustmentId:guid}/reject` |

Refund mới không còn tạo/duyệt qua route adjustment chung; refund legacy vẫn được đọc để đối soát. Không còn endpoint xác nhận payout tiền.

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
| P1.07 Checkout/VNPay | Đã triển khai phần chính; còn CourtRental (P1.10), sandbox merchant thật và migrate DB dev | Phần G; xem checkpoint/evidence P1.07. |
| P1.08 Refund điểm | Đang triển khai; workflow Membership/PT/Class đã nối, rental chờ P1.10; integration gate chưa chạy được do Docker engine không truy cập | Runtime `/api/refunds`, migration mới chưa áp DB; chi tiết Phần H. |
| P1.09 Threshold/transfer | Đang triển khai; automatic threshold, owner response, waive/pricing routes; transfer bằng/rẻ hơn thực hiện ngay, đắt hơn dùng checkout phần chênh | Migrations `ClassThresholdResponsesAndTransferRebooking`, `ClassTransferInvoiceChain` chưa áp DB; PostgreSQL gate chưa chạy. |
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

## Phần H — P1.08 Refund bằng điểm (runtime hiện tại và gate còn lại)

Refund dùng `PaymentAdjustment` hiện có, không thêm bảng Refund; refund mới có `InvoiceItemId`, `SystemCalculatedPoints`, `ApprovedPoints`, `CenterFault` và ledger reference. `Amount`/`RequestedAmount` là 0 cho refund mới, để không bị tính nhầm thành tiền hoàn trong báo cáo legacy. Approval ghi `Completed`, cộng điểm vào ví và hủy entitlement trong cùng transaction. Không có xác nhận chi tiền hay VNPay refund.

| Verb | Path | Actor | Hành vi mục tiêu |
|---|---|---|---|
| GET | `api/refunds?status=&invoiceId=&invoiceItemId=&page=&pageSize=` | Receptionist, Manager | Trả item, điểm tính/duyệt, ledger reference và trạng thái. |
| POST | `api/refunds` | Item owner (Member/ExternalCoach), Receptionist, Manager | Body `{invoiceItemId, reason}`; item owner chỉ yêu cầu item của mình. Server tính điểm, không nhận điểm từ client. |
| POST | `api/refunds/{adjustmentId}/approve` | Manager khác người yêu cầu | Body `{centerFault, reason}`. Khóa invoice/item/refund; tính lại tỷ lệ/cap; Earn + hủy quyền lợi + Completed nguyên tử. |
| POST | `api/refunds/{adjustmentId}/reject` | Manager khác người yêu cầu | Body `{reason}`; từ chối yêu cầu chưa xử lý. |

Đã có calculator cho Membership (50% khi RemainingDays×3 >= TotalDays×2), PT (50% khi chưa consume; các buổi Scheduled tương lai được hủy/nhả quota cùng approval), Class (trước buổi đầu 100%, center cancellation theo buổi chưa cung cấp, loại buổi hủy đã có buổi bù khỏi tỷ lệ), Rental (>=24h 100%, dưới 24h/no-show 0, center cancel 100%). Quy đổi trên giá trị item đã trả gồm cash + points trừ refund trước, floor VND/1.000. `RefundCreditService` hỗ trợ SystemEvent credit và ghi InvoiceItemId trên ledger; chưa có threshold/incident/rental caller để tích hợp.

**Gate còn lại:** `GET api/refunds`/Request/Approve/Reject, calculation and system credit đã có code; Manager không nhập số điểm tùy ý, chỉ chọn center-fault có lý do rồi server tính lại. Rental fulfillment chờ P1.10; phải chạy PostgreSQL integration tests (rollback, concurrency, cumulative cap, split, migration upgrade) trước khi đánh dấu P1.08 hoàn tất. Docker Testcontainers hiện thất bại do quyền truy cập Docker engine. Các migration P1.08 chưa áp vào DB nào.

## Phần I — P1.09 Ngưỡng hoàn vốn và phản hồi

| Verb | Path | Actor | Hành vi hiện có |
|---|---|---|---|
| PUT | `api/manager/classes/{classId}/threshold/pricing` | Manager | Body `{price,costAmount,reason}`; chỉ lớp Published trước deadline, tính lại ceil(cost/price), không đổi invoice snapshot. |
| POST | `api/manager/classes/{classId}/threshold/waive` | Manager | Body `{reason}`; đặt WaivedByManager có audit. |
| POST | `api/class-threshold-responses` | Member chủ ghi danh | Body `{token,choice,targetClassId?}`; token SHA-256 được lưu hash; lựa chọn cuối cùng, kiểm member sở hữu và deadline. Refund tự động cộng điểm; chuyển bằng/rẻ hơn đổi enrollment nguyên tử và hoàn chênh; chuyển đắt hơn trả `additionalInvoiceId`, giữ ghi danh nguồn đến khi invoice difference được fulfill. Gửi lại Transfer trả checkout đang mở hoặc tạo retry khi invoice cũ Void/expired. |

Job evaluator đặt AtRisk sau deadline nếu ConfirmedCount thấp ngưỡng, snapshot response deadline theo setting và queue secure link cho mỗi member (kể cả ghi danh mới khi AtRisk). Job expiry hoàn điểm response Pending quá hạn, sau đó reevaluate và hủy khóa/hoàn các ghi danh còn lại nếu chưa đạt ngưỡng và không được waive. Hết hạn AtRisk thì không nhận thêm ghi danh.

**Chưa hoàn P1.09:** code đã tạo invoice `ClassTransferDifference`, giữ chỗ lớp đích, release/retry khi hết hạn và chỉ đổi enrollment sau payment fulfillment. Add-on invoice item trỏ item gốc; hoàn lớp đích tính item chênh đã trả trừ refund chênh trước. Cần PostgreSQL tests cho response replay/ownership, checkout retry/expiry, cạnh tranh jobs, deadline, transfer thấp/bằng/cao, late payment và rollback trước khi coi gate đạt. Migration chưa áp DB.

## Phần J — P1.10/P1.11 Thuê sân, sự cố và outbox

| Verb | Path | Actor | Contract |
|---|---|---|---|
| POST | `api/checkouts/court-rental` | ExternalCoach đã Approved | `Idempotency-Key`, body gồm môn/phòng/start/end/attendees; invoice/item giữ snapshot giá và occupancy cho tới fulfill/cancel/expiry. |
| GET | `api/court-rentals/availability` | ExternalCoach đã Approved | `sportId,startUtc,endUtc`; chỉ phòng trống + giá, không trả lịch Member/lớp/PT. |
| GET | `api/court-rentals/mine` | ExternalCoach | Rental của chính người gọi, lọc `fromUtc/toUtc`. |
| POST | `api/court-rentals/{rentalId}/cancel` | Chủ rental | Self-cancel theo ngưỡng setting 24 giờ; trả 204. |
| GET | `api/manager/court-schedule/rentals` | StaffRead | Rental theo khoảng thời gian/phòng; không phải lịch nguồn tổng hợp class/PT. |
| POST | `api/manager/court-rentals/{rentalId}/cancel` | Manager | `{reason}`; center-fault cancel/refund 100% điểm. |
| POST | `api/manager/incidents/preview`, `api/manager/incidents/resolve` | Manager | `IncidentRequest` gồm scope, room/time, lý do; resolve kiểm tra tác động lại, rental cancel/refund + block nguyên tử; class/PT chồng thời gian trả conflict để xử lý lịch trước. |
| POST | `api/manager/notices` | Manager | `{subject,message,recipientUserIds,sendInApp,sendEmail}`; in-app/email vào outbox theo người nhận, giới hạn 1–200 người. |

Email không xuất hiện trong danh sách/read-all InApp. OTP email được mã hóa ở outbox và gửi bởi dispatcher; status email Sent chỉ sau sender thành công, retry có backoff/lease và gửi at-least-once.

`GET /api/reports/revenue` giữ các field legacy, đồng thời thêm `legacyCashCollected`, `reconciliationCashCollected`, `reconciliationCashCount`, `pointsRedeemed`, `pointsRedeemedVnd` (điểm×1.000 VND), `pointsIssued`, `managerPointAdjustment`, `outstandingPoints` (available+held tại lúc chạy), và `bySource[{source,cashCollected,pointsRedeemed}]`. Daily rows thêm `legacyCashCollected` và `reconciliationCashCollected`; `totalCollected` cộng cả cash reconciliation đã xác minh để đối soát. Đây chưa phải group-by-Sport và export hiện chưa dùng chung tổng hợp mới.

**Giới hạn API hiện tại:** chưa có endpoint lịch phòng tổng hợp class/PT/rental/block; chỉ có lịch rental StaffRead. Incidents không hỗ trợ tự dời/hủy class/PT: preview/resolve báo conflict nếu có giao cắt để tránh khóa giả. PostgreSQL concurrency/privacy chưa được kiểm chứng do Testcontainers không kết nối Docker ở host này.
# Cập nhật P1.12/P1.13 — 01/10/2026

Phần này thay thế các ghi chú “chưa có” về báo cáo/export và seed trong checkpoint lịch sử bên dưới.

| Verb | Route | Actor | Hợp đồng |
|---|---|---|---|
| GET | `/api/reports/revenue?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD` | CenterManager | Thêm `bySportAndSource[]`: `source`, nullable `sportId/sportName/externalCoachId`, `cashCollected`, `legacyCashCollected`, `pointsRedeemed`. Tổng các dòng cash khớp `totalCollected`, gồm `Reconciliation` và `LegacyUnclassified`. |
| GET | `/api/reports/court-rental-revenue?fromDate=...&toDate=...` | CenterManager | `{fromDate,toDate,rows}`; lấy các dòng Rental của cùng bộ tổng hợp doanh thu, theo ngày thực thu VN. |
| GET | `/api/reports/membership-period?fromDate=...&toDate=...` | CenterManager | `{fromDate,toDate,newMembers,activeMembersAtPeriodEnd}`; đăng ký theo `[00:00 VN,00:00 VN ngày sau)`, active theo validity và trạng thái Active/Expired, loại Cancelled/PendingPayment. |
| GET | `/api/reports/class-enrollment?fromDate=...&toDate=...&sportId=3` | CenterManager | `activeHoldCount` chỉ đếm Active có expiry lớn hơn server clock; `availableSeats=capacity-confirmed-activeHold`. |
| POST | `/api/reports/exports` | Theo policy export hiện hữu | `{reportType,fromDate,toDate,columns,format:"Csv" hoặc "Pdf",sportId?:3}`. `sportId` áp dụng cho `CLASS_ENROLLMENT`. |

Các loại export mới:

- `REVENUE_DAILY`: `date,collectedAmount,refundedAmount,obligationReduction,netCollected,legacyCashCollected,reconciliationCashCollected`.
- `REVENUE_DIMENSIONS` / `COURT_RENTAL_REVENUE`: `source,sportId,sportName,externalCoachId,collectedAmount,legacyCashCollected,pointsRedeemed,pointsRedeemedVnd`.
- `MEMBERSHIP_PERIOD`: `fromDate,toDate,newMembers,activeMembersAtPeriodEnd`.
- `CLASS_ENROLLMENT`: `classId,code,name,sportId,sportName,status,capacity,confirmedCount,activeHoldCount,availableSeats,fillRatio,breakEvenThreshold,thresholdStatus,firstSessionStartUtc`.

`REVENUE` cũ vẫn là danh sách hóa đơn theo ngày phát hành; không dùng loại này để so với tổng thu theo ngày thanh toán. `MEMBER_SUMMARY` cũ giữ tương thích. Export mới gọi cùng service API, không nhân bản truy vấn tài chính. Phạm vi doanh thu tối đa 366 ngày, trả `range_too_large`; report export thất bại giữ trạng thái Failed và failure reason theo contract hiện hữu. Điểm không cộng thành cash; outstanding là available+held hiện tại. Membership sport null; PT legacy chưa có sport reference chỉ được phân loại khi có đúng một môn OneOnOne.

- `REVENUE_SUMMARY`: `fromDate,toDate,collectedAmount,refundedAmount,netCollected,legacyCashCollected,reconciliationCashCollected,pointsRedeemed,pointsRedeemedVnd,pointsIssued,managerPointAdjustment,outstandingPoints`.
