# Hợp đồng API refactor đa môn (backend)

SportHub là **hệ thống quản lý trung tâm thể thao với ba môn Gym (bao gồm PT), cầu lông và bóng rổ; có thể mở rộng thêm môn trong tương lai**. PT là dịch vụ thuộc Gym, không phải môn thứ tư.

Các bảng mô tả contract; phần route baseline chỉ để tra cứu đường đọc tương thích. Không dùng baseline để khôi phục luồng ghi legacy. Trạng thái triển khai và nghiệm thu xem mục 13 của thiết kế hệ thống.

## Contract giao diện nghiệp vụ

### Sắp xếp danh sách Admin

- `GET /api/users/admin`: thêm query tùy chọn `sortBy=fullName|email|role|status`, `sortDirection=asc|desc`; mặc định `email/asc`.
- `GET /api/audit-logs`: thêm query tùy chọn `sortBy=timestamp|actorEmail|action|targetEntity`, `sortDirection=asc|desc`; mặc định `timestamp/desc`.
- Server sắp xếp trước `Skip/Take`, thêm ID làm khóa thứ hai để phân trang ổn định. Role/status dùng thứ tự enum nghiệp vụ. Cột hoặc chiều không hợp lệ trả 400 `invalid_sort_column`/`invalid_sort_direction`. Quyền và phạm vi Audit log giữ nguyên.

Các API dưới đây bổ sung đúng dependency của frontend P2.06–P2.10, không đổi schema/migration. Quy định mới về hủy khóa thay phần mô tả P1.05 bên dưới.

| Verb | Route | Actor / contract |
|---|---|---|
| GET | `/api/gym-checkins/inside?page&pageSize` | FrontDesk; PagedResult gồm `checkInId,memberId,memberName,checkInTime`; chỉ lượt chưa checkout, pageSize tối đa 100. |
| POST | `/api/gym-checkins` | Receptionist; `{targetMemberId}`. Nếu Member còn lượt `CheckOutTime=null` (kể cả ngày trước), trả 409 `gym_already_checked_in`: “Member đã được ghi nhận vào Gym, vui lòng ghi nhận ra trước.” Không tạo thêm lượt; yêu cầu đồng thời chỉ một lượt thành công. Sau check-out được vào lại, không giới hạn số lượt trong ngày. |
| PUT | `/api/manager/coaches/{userId}` | Manager; bổ sung `fullName?` (2–100 ký tự, validator hiện có), `phone?` (đúng định dạng, unique); null giữ giá trị cũ, chuỗi phone rỗng xóa số. Không đổi email/role/UserStatus. |
| GET | `/api/manager/classes?thresholdStatus=AT_RISK` | Manager; thêm filter threshold, giữ sport/lifecycle/search/pagination hiện có. Enum wire UPPER_SNAKE_CASE. |
| GET | `/api/manager/classes/{classId}/holds` | Manager; paged `holdId,memberId,memberName,invoiceId,status,expiresAtUtc,createdAt`. |
| GET | `/api/manager/classes/{classId}/enrollments` | Manager; paged `enrollmentId,memberId,memberName,invoiceItemId,status,enrolledAt`; lấy invoice bằng endpoint by-item hiện có. |
| GET | `/api/manager/classes/{classId}/threshold-responses` | Manager; paged `responseId,memberId,memberName,choice,targetClassId,resolutionStatus,additionalInvoiceId,deadlineUtc`. Không trả token/hash. |
| GET | `/api/manager/classes/{classId}/cancellation-preview` | Manager; `canCancel,version,totalSessions,sessionsNotProvided,confirmedCount,activeHoldCount,refundPoints,previewToken,members[]`. Member quote gồm enrollment/member/item ID, remaining paid value VND, refund points. |
| POST | `/api/manager/classes/{classId}/cancel` | Manager; `{reason,previewToken?}`; có paid enrollment/active hold phải gửi token preview mới. Server khóa và tính lại; stale/concurrent trả 409 `class_cancellation_changed`. Nhả pending checkout/holds/điểm giữ, hoàn phần chưa cung cấp vào wallet + kết thúc enrollment + hủy buổi Scheduled + occupancy + audit/outbox cùng transaction. Hủy lặp khóa Cancelled không hoàn thêm. |
| POST | `/api/manager/notices` | Manager; body hiện có, thêm header `Idempotency-Key` UUID. Cùng Manager/key/payload nhận cùng noticeId và không tạo thêm outbox; đổi payload trả 409 `notice_idempotency_conflict`. Client cũ không có key vẫn được hỗ trợ. |
| GET | `/api/manager/notices/{noticeId}` | Manager đã gửi; `{noticeId,delivery}`. Manager khác nhận 404. |
| GET | `/api/manager/notices/by-key/{key}` | Manager đã gửi; phục hồi receipt sau timeout/F5, chờ transaction gửi cùng key hoàn tất. |
| GET | `/api/manager/incidents/{incidentId}/notifications` | Manager; delivery tổng các notice IncidentResolution của rental thuộc incident. |
| GET | `/api/court-rentals/policy` | Member; `slotMinutes,maxHours,advanceDays,cancelFreeHours,serverNow`; không mở quyền đọc mọi system setting. |
| GET | `/api/court-rentals/{rentalId}` | Member chủ thuê; `rental,roomName,sportName,blocks,cancelReason,cancelledAtUtc,refundedPoints`. Rental summary thêm nullable invoiceId kể cả PendingPayment. Người khác 404; blocks là snapshot giá, refundedPoints từ ledger SystemEvent. |

Hủy khóa tính `floor(remainingPaidValueVnd × sessionsNotProvided / totalSessions / 1000)`; giá trị còn lại trừ các lần refund/transfer trước. Buổi gốc hoặc buổi bù đã Completed được coi đã cung cấp theo authority scheduling; không lấy giờ browser để tính hoàn. Ghi danh legacy thiếu paid item chặn hủy để tránh hoàn sai. Pending/AwaitingPayment threshold responses được hết hạn cùng transaction, tiền gateway đến muộn đi qua cơ chế compensation hiện có.

Delivery có `total,pending,sending,sent,failed,read`; đây là trạng thái outbox/in-app. SMTP vẫn at-least-once; receipt/idempotency không có nghĩa người nhận đã đọc email hoặc exactly-once SMTP.

## Contract tích hợp frontend

Các endpoint dưới đây phục vụ frontend API-backed. Không thay schema/migration. ID lớp/package/room/sport là int; ID invoice/enrollment/PT/request là UUID. Backend tiếp tục kiểm role, ownership, trạng thái và đồng thời.

| Verb | Route | Hợp đồng / authority |
|---|---|---|
| GET / PUT | `/api/users/me`, `/api/users/me/profile` | Thêm `sportIds: number[]`, `isPersonalTrainer: boolean` (Coach có qualification dịch vụ PT, không suy ra từ chuyên môn Gym), nullable `approvalStatus`. Role UPPER_SNAKE_CASE. F5 refresh profile trước cấp quyền trên UI; regression Security đã pass. |
| GET | `/api/membership-packages/public` | Anonymous, chỉ catalog active; endpoint quản trị/auth cũ giữ chính sách riêng. |
| GET | `/api/classes?fromDate=&toDate=&sportId=&page=&pageSize=` | DateOnly YYYY-MM-DD theo startDate khóa; validate khoảng ngày; danh sách public chỉ Published. |
| GET | `/api/classes/{classId}/public-sessions` | Anonymous, chỉ khóa Published, lịch buổi/room/coach không có roster/attendance. |
| GET | `/api/members/me/classes/{classId}/sessions` | Member đã có enrollment của chính mình, kể cả lịch sử; không trả roster. Own enrollment thêm `invoiceItemId`. |
| GET | `/api/coaches?sportId=&service=PERSONAL_TRAINING` | Member/Receptionist/Manager: Coach active cùng specialty (`sportId`) hoặc có qualification PT (`service`), chỉ userId/fullName/sportIds. Không trả email hoặc credential. |
| GET | `/api/checkouts/by-key?key=`, `/api/checkouts/by-reference?reference=` | Recovery timeout/return theo invoice của beneficiary hoặc initiator; kiểm scope lại. Query VNPay không là chứng cứ Paid. |
| POST | `/api/checkouts/{invoiceId}/confirm-points` | Xác nhận cash=0, invoice lock, ownership, hold còn hạn, không reconciliation/verified pending; idempotent Paid, không tạo gateway attempt. |
| GET | `/api/checkouts/{invoiceId}` | Thêm beneficiaryUserId/initiatorUserId/serverNowUtc và ptMemberPackageId/ptCoachId/ptFrequency để resume/re-quote khi retry. |
| POST | `/api/checkouts/{invoiceId}/attempts` | Response thêm gatewayMode MOCK/VNPAY theo provider thực. Cash>0 mới có QR/link. Cả attempts và confirm-points chặn `point_confirmation_pending`. |
| GET | `/api/invoices/{invoiceId}/point-confirmations/current` | Receptionist; audited beneficiary, revision, points, failedAttempts, expiry/resendAtUtc và status PENDING/LOCKED/EXPIRED; không trả code/hash/salt. |
| GET | `/api/invoices/by-item/{itemId}` | Lookup invoice từ own enrollment invoiceItemId; dùng lại quyền đọc invoice. Own invoice list hỗ trợ filter status. |
| GET | `/api/refunds/quote/{itemId}` | Ownership + paid/benefit eligibility; `{systemCalculatedPoints}` do backend tính. |
| POST | `/api/refunds` | Item lock và tối đa một request REQUESTED chưa xử lý trên item; submit lặp trả request hiện có. Không cho FE tự gửi số điểm duyệt. |
| GET | `/api/class-threshold-responses/mine`, `/{id}`, `/by-token?token=` | Member owner; course/sport/remaining paid value/deadline/choice/status/additionalInvoiceId/serverNowUtc. Token chỉ hash ở backend, không ghi analytics. |
| GET | `/api/class-threshold-responses/{id}/transfer-quote?targetClassId=` | Owner, response còn mở; cùng môn, target Published/chưa bắt đầu. Backend tính cashDifference/walletCreditPoints; giá trị chia hết cho 1.000. |
| POST | `/api/class-threshold-responses/{id}` | `{choice:REFUND|TRANSFER,targetClassId}`; dùng cùng transaction/lock/idempotent-final-choice như token route. Retry AwaitingPayment giữ nguyên đích. |
| GET | `/api/members/me/pt-session-change-requests`, `/api/members/me/pt-coach-change-requests` | Chỉ owner, 100 request gần nhất với trạng thái/reviewNote. |
| GET | `/api/coach-member-relationships` | Member/Coach/Manager; Member/Coach bị clamp theo owner. Không có endpoint members/me/relationships giả. |
| GET | `/api/wallet/me/ledger?page=&pageSize=&entryType=` | Array WalletLedgerResponse, không Paged; timestamp createdAtUtc. Filter HOLD/RELEASE/SPEND/EARN/ADJUSTMENT áp trước pagination; filter sai 400. Ledger staff cũng hỗ trợ filter; chỉ Receptionist ghi audit lần xem. |

## Quy ước chung

- Enum JSON hiện tại: **UPPER_SNAKE_CASE** (`ISSUED`, `PAID_AFTER_RECONCILIATION`, `GROUP_COURSE`, `VN_PAY`). Enum số không được chấp nhận. DTO string biểu diễn enum có `WireEnum` converter; query enum chấp nhận canonical và tên nội bộ để tương thích. JWT role claim vẫn dùng tên nội bộ, không tự chuyển JWT.
- Enum DB hiện tại: lưu int mặc định EF (không có `HasConversion`). Khi thêm giá trị phải append, không đổi số cũ. `UserRole` hiện: CenterManager=0, Coach=1, Member=2, Receptionist=3, SystemAdministrator=4 (đúng 5 role, BR-140).
- `InvoiceStatus` DB: Issued=0, Paid=2, Void=3, PaidAfterReconciliation=4. Wire: `ISSUED`, `PAID`, `VOID`, `PAID_AFTER_RECONCILIATION`.
- Auth: JWT Bearer; policy trong `backend/SportHub.BuildingBlocks/Api/SportHubPolicies.cs`.
- Error body thông thường `{error,message}`, mã lỗi chữ thường snake_case; lỗi occupancy có thêm `conflicts[]`. ID vẫn đúng kiểu int/Guid, thời gian UTC ISO-8601; tham số ngày báo cáo/lịch dùng ngày Việt Nam.

## Bản chốt API — lịch sân, incident, payment và snapshot

[api-examples.json](api-examples.json) chứa response thật từ HTTP integration test: POST membership checkout (201), GET invoice (200), GET checkout của người khác (403 `checkout_not_owned`). Fixture đã kiểm thanh toán mock và snapshot; ID/email trong ví dụ chỉ thuộc database test.

### Lịch sân và xử lý sự cố

| Verb | Route / request | Actor | Response / lỗi |
|---|---|---|---|
| GET | `/api/manager/court-schedule?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD&roomId=` | Manager, Receptionist | 200 `CourtScheduleEntry[]`; hai ngày inclusive, tối đa 31 ngày; 400 `invalid_range`, 403 `court_schedule_forbidden`. |
| GET | `/api/coaches/me/court-schedule?fromDate=&toDate=&roomId=` | Coach | 200 cùng DTO nhưng chỉ lớp được giao; PT dùng lịch PT owner-scoped hiện hữu. |
| POST | `/api/manager/incidents/preview` body `{scope:"ROOM"|"CENTER",roomId?,startAtUtc,endAtUtc,reason}` | Manager | 200 `{scope,roomId,startAtUtc,endAtUtc,impacts[],canResolve,blockReason}`. Mỗi impact có `{sourceType,sourceId,startAtUtc,endAtUtc,resolutionOptions[]}`. |
| POST | `/api/manager/incidents/resolve` body như preview | Manager | 200 `{incidentId}`; 409 `incident_requires_schedule_resolution` nếu còn lớp/PT/block, `incident_schedule_changed` hoặc `occupancy_conflict` nếu lịch đổi; lỗi 400 `invalid_incident_scope`, `incident_reason_required`, `invalid_incident_range`; 404 `incident_room_not_found`. |

`CourtScheduleEntry`: `{sourceType,sourceId,roomId,startAtUtc,endAtUtc,coachId,coachName,title,status,classId,participants[]}`. Source type: `CLASS_SESSION`, `PT_SESSION`, `COURT_RENTAL`, `ROOM_BLOCK`. Participant: `{memberId,memberName,enrollmentId,attendanceStatus,recordedAtUtc}`. Rental/block không có roster; Member chỉ gọi availability và lịch thuê của mình, không gọi hai endpoint lịch nội bộ.

`resolutionOptions` trả `{action,method,path}`. Action identifiers: `Reschedule`, `CancelWithMakeup`, `CancelByCenter`, `RemoveExistingBlock`, `AutoCancelAndRefundOnResolve`; đây là identifier thao tác, giữ đúng chuỗi API trả, không phải enum. Frontend mở form tương ứng và gọi route được trả: class reschedule/cancel kèm makeup, Manager PT reschedule/cancel hoặc xóa block không gắn incident. Sau khi xử lý, gọi preview lại rồi resolve. Resolve không tự chọn lịch thay người dùng; chỉ hủy/hoàn rental và tạo incident/block khi kiểm lại không còn conflict. Email và audit cùng transaction với bước nghiệp vụ tương ứng.

### Checkout và invoice

POST checkout trả 201 `CheckoutResponse`, yêu cầu header `Idempotency-Key` (không rỗng, tối đa 120 ký tự):

| Route | Body | Actor |
|---|---|---|
| `/api/checkouts/membership` | `{packageId,targetMemberId?,allowStacking:false,stackingApprovalReason?}` | Member hoặc FrontDesk; stacking cần quyền Manager và lý do. |
| `/api/checkouts/class` | `{classId,targetMemberId?}` | Member hoặc FrontDesk. |
| `/api/checkouts/pt` | `{memberPackageId,coachId,frequencyPerWeek:1..3,priceVersion,targetMemberId?}` | Member hoặc FrontDesk; lấy version từ PT quote. |
| `/api/checkouts/court-rental` | `{sportId,roomId,startUtc,endUtc}` | Member tự mua. |

FrontDesk là Manager/Lễ tân; staff mua cho Member phải có targetMemberId, Member chỉ mua cho mình. Lỗi chung: 400 `idempotency_key_required`/`target_member_required`, 403 `target_member_forbidden`/`checkout_not_owned`; conflict nghiệp vụ trả 409. GET checkout trả 200; attempts trả 200 `PaymentAttemptResponse` (`paymentAttemptId,invoiceId,transactionReference,cashAmount,pointsApplied,expiresAtUtc,paymentUrl,state`); không gửi giá do client tính.

`CheckoutResponse`: `{invoiceId,checkoutSessionId,revision,kind,state,totalAmount,pointsApplied,cashAmount,expiresAtUtc,resourceHoldId,invoiceStatus,fulfillmentOutcome,reconciliationRequired}`. Số tiền server quyết định; FE không tự đánh dấu paid từ redirect return hoặc chỉ từ `state`.

| fulfillmentOutcome | Ý nghĩa |
|---|---|
| `PENDING` | Chưa cấp quyền lợi; xem thêm invoiceStatus/state để biết đã hủy/hết hạn hay còn chờ. |
| `FULFILLED` | Đã cấp quyền lợi, kể cả thanh toán muộn reacquire thành công. |
| `COMPENSATED` | Tiền được xác minh nhưng không cấp được quyền lợi; đã bồi hoàn bằng điểm. |
| `RECONCILIATION_REQUIRED` | Cần đối soát thủ công; không hiển thị như đã mua thành công. |

`InvoiceSummaryResponse` có `beneficiaryUserId` (Member), alias cũ `memberId`, `fulfillmentOutcome` cùng các field tiền/trạng thái hiện có. `paidVia` canonical: `POINTS`, `VN_PAY`, `VN_PAY_AND_POINTS`, `VN_PAY_AFTER_RECONCILIATION`, `VN_PAY_COMPENSATED`, `VN_PAY_MANUAL_COMPENSATION`. Không suy quyền lợi chỉ từ `PAID_AFTER_RECONCILIATION`.

`InvoiceItemResponse` bổ sung nullable `classId`, `courtRentalId`, `ptEntitlementId`, `memberPackageId`, `sportId`, `sportName`, `ptFrequencyPerWeek`, `sourceInvoiceItemId`. `relatedEntityId` vẫn đọc được cho lịch sử. Giá/item, sport name và thời hạn Membership được snapshot khi tạo checkout; sửa catalog không đổi hợp đồng đã mua. Không có sport riêng cho Membership; PT chưa xác định được môn giữ null.

Membership catalog mới từ chối `sessionLimit != null` bằng 400 `membership_session_limit_removed`; giá phải dương, bội số 1.000 VND (400 `membership_price_invalid`). Những field quota legacy còn đọc được nhưng không ảnh hưởng access/expiry.

Invoice lịch sử vẫn đọc theo ownership/FrontDesk. Discount/correction không còn tạo/approve/reject (409 `legacy_adjustment_read_only`); refund dùng `/api/refunds`, không payout tiền mặt. Gửi payment thủ công trả 409 `checkout_requires_verified_payment`. Email invoice created/payment received/refund completed được queue cùng transaction; API không chờ gửi SMTP.

## Phần I — P1.10 Court Rental (đã có PostgreSQL regression ở P1.13)

| Verb | Path | Actor / contract |
|---|---|---|
| POST | `/api/checkouts/court-rental` | Member; `Idempotency-Key`; body `{sportId, roomId, startUtc, endUtc}` (không khai báo số người). Giá server tính theo giờ, giữ occupancy rồi trả checkout; payment mới chuyển Confirmed. |
| GET | `/api/court-rentals/availability?sportId&startUtc&endUtc` | Member; chỉ trả sân trống + báo giá giờ, không trả lớp/Member/nguồn lịch bận. |
| GET | `/api/court-rentals/mine?fromUtc&toUtc` | Member; lượt thuê của chính họ. |
| POST | `/api/court-rentals/{rentalId}/cancel` | Chủ thuê; ≥24h trước giờ bắt đầu hoàn 100%, dưới 24h 0%; cùng transaction hủy occupancy. |
| GET | `/api/manager/court-schedule/rentals?roomId&fromUtc&toUtc` | Manager/Receptionist qua `FrontDesk`; chỉ metadata thuê cần cho lịch, không roster Member. |
| POST | `/api/manager/court-rentals/{rentalId}/cancel` | CenterManager; body `{reason}`; center fault hoàn 100% bằng điểm và release occupancy nguyên tử. |

Invoice checkout giữ phòng bằng cùng occupancy constraints với class/PT/block. Hết hạn/hủy nhả đúng một lần; IPN muộn không Spend lại điểm đã release, chỉ reacquire khi slot còn hợp lệ; nếu không thì theo cơ chế bồi hoàn khoản cash đã xác minh. Migration và PostgreSQL concurrency/ownership đã qua gate; chưa áp migration trên DB phát triển/chia sẻ.

## Phần A — Route baseline (trước refactor)

### AuditLogsController — `api/audit-logs`

| Verb | Path |
|---|---|
| GET | `api/audit-logs` |

Với sự kiện `targetEntity = UserAccount`, mỗi item bổ sung `targetFullName`,
`targetEmail` (thông tin hiện tại của tài khoản đích) và `targetAccountExists`.
Các trường này không phải snapshot tại thời điểm sự kiện. Tài khoản không còn
tồn tại trả `targetAccountExists = false`, tên/email null; sự kiện trên entity
khác trả cả ba trường null. `targetId` vẫn được giữ để đối chiếu.
Việc bổ sung không thay đổi quyền đọc audit, scope tài khoản của Admin hay policy G10.

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
| GET | `api/members/me/pt-entitlements/{entitlementId:guid}/availability?fromDate&toDate` |
| POST | `api/members/me/pt-sessions` |

Tự đặt lịch PT (G05). `availability` (Member, ngày giờ Việt Nam, mặc định 7 ngày, tối đa 14) trả `{entitlementId, coachId, coachName, sessionMinutes: 90, remainingQuota, bookableReason, policy{minLeadHours:12, advanceDays:30, stepMinutes:30, changeDeadlineHours:24}, slots[{startAtUtc, endAtUtc, rooms[{roomId,name}]}]}`. `bookableReason` null khi đặt được, hoặc `pt_entitlement_not_active`, `pt_quota_exhausted`, `pt_relationship_required`, `pt_no_room_configured` (khi đó `slots` rỗng). Khung trống = lưới 30 phút trong giờ mở cửa của ít nhất một phòng PT còn trống, Coach và Member đều không bận, trong hiệu lực gói, cách hiện tại ≥12 giờ và ≤30 ngày. `POST` nhận `{entitlementId, startAtUtc, roomId?}` (bỏ trống phòng thì hệ thống gán phòng trống đầu tiên theo tên) và trả 201 `PtSessionResponse`. Lỗi: 400 `pt_start_not_aligned` `pt_booking_too_soon` `pt_booking_too_far`; 404 `pt_entitlement_not_found` (kể cả quyền lợi của người khác); 409 `pt_entitlement_not_active` `pt_quota_exhausted` `pt_relationship_required` `pt_session_outside_membership_validity` `pt_coach_conflict` `pt_member_conflict` `pt_slot_unavailable`. Không có Idempotency-Key: đặt lại cùng giờ trả 409 `pt_member_conflict`, không giữ quota hai lần. Cùng khoá advisory Coach/Member, quota và occupancy với Manager xếp lịch.

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
| P1.01–P1.02 Ports/model/migration | Hoàn tất backend | Typed FK và snapshots; giữ lịch sử, nâng cấp và DB trắng qua gate. |
| P1.03–P1.05 Identity/catalog/course/Gym/PT | Hoàn tất backend | Phần C/D/F; JSON enum theo quy ước chốt ở đầu tài liệu. |
| P1.06–P1.08 Wallet/checkout/refund | Hoàn tất backend | Phần E/G/H; sandbox VNPay thật do người dùng phụ trách. |
| P1.09 Threshold/transfer | Hoàn tất backend | Phần I, expiry/transfer/late payment integration đã chạy. |
| P1.10–P1.11 Rental/calendar/incident/outbox | Hoàn tất backend | Bản chốt ở đầu tài liệu và Phần J. |
| P1.12 Báo cáo/seed/config | Hoàn tất backend | Xem phần Contract báo cáo và tích hợp. |
| P1.13 Kiểm thử | 465/465 pass | Xem evidence cuối; frontend và dịch vụ bên ngoài chưa thuộc chứng nhận này. |

AI (`api/ai/*`) chỉ sửa tối thiểu để build.

## Phần C — Route mới đã triển khai (P1.03)

| Verb | Path | Actor | Request | Response / lỗi chính |
|---|---|---|---|---|
| POST | `api/auth/password/forgot` | ẩn danh, 3/phút/IP | `{email}` | 204 luôn (trung tính; có tài khoản Active thì gửi email chứa link `/reset-password?email=&token=`) |
| POST | `api/auth/password/reset` | ẩn danh, 3/phút/IP | `{email, token, newPassword, confirmNewPassword}` | 204; 400 `otp_invalid` `otp_expired` `otp_already_used` `otp_attempts_exceeded` `password_*` |
| POST | `api/users/me/password` | đã đăng nhập | `{currentPassword?, newPassword, confirmNewPassword}` | 200 `{accessToken}`; 400 `current_password_required` `new_password_same_as_current` `password_*`; 401 `invalid_credentials` |

JWT có thêm claim `sst`; middleware từ chối token thiếu/sai `sst` hoặc sai role (401).
Ghi chú: `coachCategory` trong response là DEPRECATED.

## Phần D — Route mới đã triển khai (P1.04)

Actor viết tắt: **M** = CenterManager (policy `CatalogManage`), **FD** = Manager + Receptionist, **Staff** = Manager, Receptionist, Coach, **Auth** = mọi người đã đăng nhập.

| Verb | Path | Actor | Request | Response / lỗi chính |
|---|---|---|---|---|
| GET | `api/sports?service=` | ẩn danh | — | `SportResponse[]` chỉ môn active, mỗi môn chỉ gồm service đang bật, không có `readiness`. `service` lọc theo `MEMBERSHIP_ACCESS`, `GROUP_COURSE`, `COURT_RENTAL` hoặc `PERSONAL_TRAINING`. `SportResponse`: `{sportId, code, name, description, imageUrl, sortOrder, isActive, services[{serviceType,isEnabled,defaultSessionMinutes?,defaultMaxCapacity?}], readiness?[{serviceType,ready,missing[]}]}` với `missing` gồm `room_type`, `room`, `opening_hours`, `court_rate`. CAT-01: không còn `operationType`; Personal Training không còn là môn riêng, PT là dịch vụ của Gym. |
| GET | `api/manager/sports?service=` | M | — | mọi môn, đủ service và `readiness` (chỉ GROUP_COURSE và COURT_RENTAL) |
| POST | `api/manager/sports` | M | `{code, name, description?, imageUrl?, services[{serviceType,isEnabled,defaultSessionMinutes?,defaultMaxCapacity?}]}` | 201; 400 `sport_code_invalid` `service_type_invalid` `service_not_allowed_for_sport` (Membership/PT ngoài môn Gym) `sport_group_course_defaults_required` `service_defaults_not_allowed`; 409 `sport_code_taken` `sport_name_taken` |
| PUT | `api/manager/sports/{id}` | M | như trên, không nhận đổi `code`. Service không liệt kê bị TẮT, không bị xóa | 200; 400 `sport_code_immutable` và các lỗi như trên; 404 `sport_not_found` |
| POST | `api/manager/sports/{id}/deactivate`, `/activate` | M | — | `SportResponse` |
| POST | `api/manager/sports/{id}/services/{serviceType}/enable`, `/disable` | M | — | `SportResponse`; 404 `service_not_configured`. Tắt chỉ chặn giao dịch mới |
| PUT | `api/manager/sports/{id}/services/PERSONAL_TRAINING/room-types` | M | `{roomTypeIds[]}` (thay toàn bộ; rỗng nghĩa là PT không gắn phòng) | 200 `{roomTypeIds}`; 400 `service_room_types_not_supported` `invalid_room_type` `room_type_not_linked_to_sport`; 409 `service_in_use_by_future_schedule` (còn buổi PT tương lai trong phòng thuộc loại bị gỡ) |
| GET / PUT | `api/manager/coaches/{userId}/service-qualifications` | M | PUT `{offeringIds[]}` (thay toàn bộ; hiện chỉ offering PT của Gym) | 200 `{offeringIds}`; 400 `qualification_not_supported` `service_not_enabled` `coach_missing_sport_specialty`; 404 `coach_not_found`; 409 `qualification_in_use` (còn buổi PT tương lai) |
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

CourtRate audit snapshots (`CREATE_COURT_RATE`, `UPDATE_COURT_RATE`, `DELETE_COURT_RATE`) contain `roomTypeId`, `roomTypeName`, nullable `sportId`/`sportName`, `days` (comma-separated day codes), `startTimeLocal`/`endTimeLocal` (`HH:mm`, Vietnam local time), `price` and `active`. Names and times are recorded at the event; historical snapshots are not backfilled from the current catalog. Older snapshots may omit names/times. Updates preserve both old and new snapshots; create has only new, delete only old. No schema migration or pricing request/response changes.
| GET | `api/availability/rooms?sportId&startUtc&endUtc` | Staff | — | `[{roomId,name,roomTypeId,capacity}]`; khoảng tối đa 12 giờ |
| GET | `api/availability/coaches?sportId&startUtc&endUtc` | Staff | — | `[{coachId, fullName}]` |
| GET | `api/availability/rooms/{roomId}/busy?fromUtc&toUtc` | FD | — | `[{resource, sourceType, sourceId, startAtUtc, endAtUtc}]`; tối đa 31 ngày |

Mã lỗi DB chưa được service bắt (mọi endpoint): 409 `occupancy_conflict`, 409 `duplicate_value`, 409 `reference_violation`, 409 `concurrency_conflict`, 400 `constraint_violation`.
Mọi thời điểm trong request/response là UTC; giờ mở cửa và khung giá là giờ địa phương Asia/Ho_Chi_Minh (UTC+7 cố định).

## Phần E — P1.06 Wallet và xác nhận dùng điểm

Các endpoint sau đã có source và integration test PostgreSQL. 1 điểm = 1.000 VND; điểm là integer, tiền là decimal. `Confirmed` ở xác nhận điểm chưa phải Invoice Paid.

| Verb | Path | Actor | Request / Response |
|---|---|---|---|
| GET | `api/wallet/me` | Member | `{ownerUserId, availablePoints, heldPoints, vndPerPoint}`; subject lấy từ JWT |
| GET | `api/wallet/me/ledger?page&pageSize` | Member | Mảng ledger, mới nhất trước; page >=1, pageSize 1..100 |
| GET | `api/members/{memberId}/points`, `.../points/ledger` | Receptionist/Manager | Chỉ Member; Receptionist ghi audit lần xem, Manager chỉ đọc và không ghi audit |
| GET | `api/manager/wallets/{ownerId}`, `.../ledger` | Manager | Số dư/lịch sử của Member; xem, refresh, lọc và phân trang không ghi audit |
| POST | `api/wallets/{ownerId}/adjustments` | Manager | `{idempotencyKey:guid, points:int>0, direction:"CREDIT"|"DEBIT", reason}`; trả WalletResult. Cùng key khác payload → 409; Debit chỉ tiêu available |
| GET | `api/invoices/{invoiceId}/point-selection` | Chủ invoice hoặc Receptionist | `{invoiceId, memberId, pointsApplied, cashAmount, holdExpiresAtUtc, status, revision}`; Receptionist chỉ xem Member, có audit |
| POST | `api/invoices/{invoiceId}/point-confirmations` | Receptionist | `{memberId, points:int>0, revision:int}`; trả `{confirmationId, invoiceId, memberId, points, expiresAtUtc, holdExpiresAtUtc, status:"Pending", revision}` |
| POST | `api/point-confirmations/{confirmationId}/verify` | Lễ tân đã yêu cầu mã | `{code:"6 digits"}`; trả PointSelectionResponse, status `Confirmed`; giữ điểm đúng một lần |
| POST | `api/invoices/{invoiceId}/point-confirmations/clear` | Receptionist | `{memberId, revision}`; release điểm của cycle cũ, vô hiệu OTP, tăng revision; dùng khi bỏ chọn/đổi Member tại UI |
| POST | `api/wallet/me/checkouts/{invoiceId}/points` | Member | `{points:int>=0}`; 0 = bỏ điểm; invoice phải thuộc JWT subject, không nhận owner từ client, không cần OTP |

Ledger trả `id, entryType, points, availableDelta, heldDelta, availableAfter, heldAfter, referenceType, referenceId, note, createdAtUtc`. Entry types: `HOLD/RELEASE/SPEND/EARN/ADJUSTMENT`. Actor được lưu ở ledger; không có endpoint nạp/rút/chuyển điểm.

Cột **Tham chiếu** trên lịch sử điểm hiển thị `referenceType · referenceId`: loại và mã nguồn của giao dịch, không phải mã chủ ví hay ID dòng ledger. Với `ManagerAdjustment`, `referenceId` là `idempotencyKey` của yêu cầu điều chỉnh; retry cùng key/payload dùng lại kết quả, không cộng/trừ hay ghi audit lần nữa. `id`/`ledgerEntryId` là ID bút toán riêng. Ví dụ nguồn khác: `RefundRequest` (yêu cầu hoàn), `SystemEvent` (hoàn do sự kiện hệ thống), `Invoice`/`CheckoutSession` (hóa đơn/chu kỳ checkout tùy luồng).

Theo yêu cầu cập nhật 07/10/2026, Manager mở/xem ví không ghi `VIEW_OWNER_WALLET` hoặc `VIEW_MEMBER_WALLET`. Điều chỉnh lưu thành công ghi `ADJUST_POINTS` cùng transaction; validation/thất bại/retry đã áp dụng không sinh thêm log điều chỉnh. Các log xem ví đã ghi trước thay đổi vẫn giữ nguyên lịch sử. Quyền truy cập và audit xem ví của Receptionist không đổi.

**Luồng và lỗi:**
- Đọc point-selection lấy revision trước khi yêu cầu OTP. Stale revision → 409 `checkout_revision_changed`. Hóa đơn legacy không có cycle, đã Paid/Void hoặc quá hạn → 409 `checkout_unavailable`; khác Member → 403 `invoice_not_owned`.
- OTP 6 số, PBKDF2 có salt, hết hạn `min(now+5 phút, holdExpiresAtUtc)`. Gửi lại bằng POST request với revision mới; cùng lựa chọn trong 60s → 409 `point_confirmation_cooldown`. Rate limit request 3/phút theo IP + token → 429. Đổi điểm/gửi lại/bỏ chọn không kéo dài hạn invoice.
- Chỉ lễ tân yêu cầu mã được verify. Sai mã → 400 `point_confirmation_invalid`; 5 lần sai đã commit → 409 `point_confirmation_locked`; hết hạn/vô hiệu → 409 `point_confirmation_expired`. Gọi đúng mã lặp/song song không Hold hai lần.
- Verify kiểm lại role/active Member, revision/cycle, invoice chưa trả, hạn và số dư. Thiếu điểm → 409 `insufficient_points`; OTP chưa consumed. Invoice/hold/OTP rollback cùng nhau khi lỗi sau Hold.
- Đã có payment/attempt/adjustment → 409 `payment_already_started`, không sửa số tiền của QR cũ. Thu tiền thủ công khi đang chọn/giữ điểm → 409 `point_checkout_requires_gateway`.
- Self selection chỉ đổi điểm trên invoice của chính mình; points > total/1000 bị 400 `invalid_points`. Đổi/bỏ điểm release cycle cũ và tạo reference mới, không âm available/held.
- Job mỗi phút release điểm trên hóa đơn Issued đã quá hạn hoặc Void. Expired state được suy từ thời gian server ngay cả khi job chưa xử lý.

Chu kỳ có snapshot trên Invoice (`CheckoutCycleId/CheckoutRevision/HoldExpiresAtUtc`) và lịch sử trong CheckoutSession. `PointsApplied` là điểm chọn/giữ; `CashAmount=TotalAmount-PointsApplied*1000`. Endpoint attempts thực hiện Spend + fulfillment nguyên tử khi cash=0, không phát QR 0đ. Course/rental dùng quote/reserve ports; callback/reconcile và Spend/Release gắn reference CheckoutSession + cycle ID. Xem Phần G và bản chốt outcome ở đầu tài liệu.

**Email:** dùng SMTP; chỉ Development có `Email:DemoLoggingEnabled=true` mới được log nội dung demo. Gửi thất bại thì revoke mã vừa tạo; không tự giữ điểm hoặc báo xác nhận thành công. Outbox email/retry bền vững thuộc P1.11.

## Phần F — P1.05 Lớp theo khóa, điểm danh, Gym và PT

| Verb | Path | Actor | Hành vi chính |
|---|---|---|---|
| GET | `api/classes`, `api/classes/{classId}` | Public | Chỉ `Published`, không trả chi phí/ngưỡng nội bộ; giá và chỗ còn theo cả khóa. |
| GET/POST/PUT | `api/manager/classes`, `api/manager/classes/{classId}`, `api/manager/classes/{classId}/publish`, `.../cancel` | Manager | Soạn Draft; publish khóa + đủ buổi + occupancy + audit + thông báo Coach cùng transaction; hủy với preview/refund/hold release theo bổ sung P2.06–P2.10 đầu tài liệu. |
| GET | `api/classes/{classId}/sessions`, `api/class-sessions/{sessionId}`, `.../roster` | Nhân viên; Coach đúng lớp | Buổi của cả khóa và roster Confirmed; Coach chỉ đọc lớp được giao. |
| POST | `api/class-sessions/{sessionId}/reschedule`, `.../cancel` | Manager | Kiểm lại room/coach/opening/capacity/lịch Member; hủy buộc có buổi bù hợp lệ. |
| PUT | `api/class-sessions/{sessionId}/attendance/{enrollmentId}` | Receptionist | `{status:"Present"|"Absent"}`; từ đầu buổi đến hết 24 giờ sau cuối buổi; ghi audit khi thay đổi. |
| GET | `api/members/me/enrollments`, `.../schedule` | Member | Ghi danh và lịch cá nhân; không có endpoint tự ghi danh từng buổi. |
| POST | `api/gym-checkins/{checkInId}/checkout` | Receptionist | Giờ server, idempotent; checkin chưa tồn tại/giờ vào tương lai bị từ chối. |

`IClassEnrollmentFulfillment` cung cấp quote, giữ chỗ, confirm, release và cancel trong transaction của checkout/fulfillment caller. PT giữ các endpoint lịch/workout/homework, thêm `roomId` tùy chọn và chống trùng occupancy. Job NoShow chỉ xử lý buổi PT đã kết thúc; lớp nhóm không tự tạo Present/Absent.

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

Route ghi payment thủ công không còn tạo khoản thu mới. `PAID_AFTER_RECONCILIATION` biểu thị khoản thu muộn, cần đọc `fulfillmentOutcome`: `FULFILLED` khi reacquire/cấp quyền lợi được; `COMPENSATED` khi bồi hoàn điểm; `RECONCILIATION_REQUIRED` khi không thể đổi chính xác tiền thực thu sang điểm. `CheckoutSession` và `VerifiedGatewayEvent` giữ lịch sử/idempotency. CourtRental dùng `/api/checkouts/court-rental`.

## Phần H — P1.08 Refund bằng điểm

Refund dùng `PaymentAdjustment` hiện có, không thêm bảng Refund; refund mới có `InvoiceItemId`, `SystemCalculatedPoints`, `ApprovedPoints`, `CenterFault` và ledger reference. `Amount`/`RequestedAmount` là 0 cho refund mới, để không bị tính nhầm thành tiền hoàn trong báo cáo legacy. Approval ghi `Completed`, cộng điểm vào ví và hủy entitlement trong cùng transaction. Không có xác nhận chi tiền hay VNPay refund.

| Verb | Path | Actor | Hành vi mục tiêu |
|---|---|---|---|
| GET | `api/refunds?status=&invoiceId=&invoiceItemId=&page=&pageSize=` | Receptionist, Manager | Trả item, điểm tính/duyệt, ledger reference và trạng thái. |
| POST | `api/refunds` | Item owner (Member), Receptionist, Manager | Body `{invoiceItemId, reason}`; item owner chỉ yêu cầu item của mình. Server tính điểm, không nhận điểm từ client. |
| POST | `api/refunds/{adjustmentId}/approve` | Manager khác người yêu cầu | Body `{centerFault, reason}`. Khóa invoice/item/refund; tính lại tỷ lệ/cap; Earn + hủy quyền lợi + Completed nguyên tử. |
| POST | `api/refunds/{adjustmentId}/reject` | Manager khác người yêu cầu | Body `{reason}`; từ chối yêu cầu chưa xử lý. |

Đã có calculator cho Membership (50% khi RemainingDays×3 >= TotalDays×2), PT (50% khi chưa consume; các buổi Scheduled tương lai được hủy/nhả quota cùng approval), Class (trước buổi đầu 100%, center cancellation theo buổi chưa cung cấp, loại buổi hủy đã có buổi bù khỏi tỷ lệ), Rental (>=24h 100%, dưới 24h/no-show 0, center cancel 100%). Quy đổi trên giá trị item đã trả gồm cash + points trừ refund trước, floor VND/1.000. `RefundCreditService` hỗ trợ SystemEvent credit, threshold/incident/rental caller và ghi InvoiceItemId trên ledger.

Manager không nhập số điểm tùy ý, chỉ chọn center-fault có lý do rồi server tính lại. PostgreSQL gate cho refund/cap/concurrency/rollback và migration upgrade đã qua; xem evidence.

## Phần I — P1.09 Ngưỡng hoàn vốn và phản hồi

| Verb | Path | Actor | Hành vi hiện có |
|---|---|---|---|
| PUT | `api/manager/classes/{classId}/threshold/pricing` | Manager | Body `{price,costAmount,reason}`; chỉ lớp Published trước deadline, tính lại ceil(cost/price), không đổi invoice snapshot. |
| POST | `api/manager/classes/{classId}/threshold/waive` | Manager | Body `{reason}`; đặt WaivedByManager có audit. |
| POST | `api/class-threshold-responses` | Member chủ ghi danh | Body `{token,choice,targetClassId?}`; token SHA-256 được lưu hash; lựa chọn cuối cùng, kiểm member sở hữu và deadline. Refund tự động cộng điểm; chuyển bằng/rẻ hơn đổi enrollment nguyên tử và hoàn chênh; chuyển đắt hơn trả `additionalInvoiceId`, giữ ghi danh nguồn đến khi invoice difference được fulfill. Gửi lại Transfer trả checkout đang mở hoặc tạo retry khi invoice cũ Void/expired. |

Job evaluator đặt AtRisk sau deadline nếu ConfirmedCount thấp ngưỡng, snapshot response deadline theo setting và queue secure link cho mỗi member (kể cả ghi danh mới khi AtRisk). Job expiry hoàn điểm response Pending quá hạn, sau đó reevaluate và hủy khóa/hoàn các ghi danh còn lại nếu chưa đạt ngưỡng và không được waive. Hết hạn AtRisk thì không nhận thêm ghi danh.

Invoice `CLASS_TRANSFER_DIFFERENCE` giữ chỗ lớp đích, release/retry khi hết hạn và chỉ đổi enrollment sau payment fulfillment. Add-on invoice item trỏ item gốc; hoàn lớp đích tính item chênh đã trả trừ refund chênh trước. PostgreSQL gate đã qua, gồm transfer thấp/bằng/cao, ownership/replay và expiry.

## Phần J — P1.10/P1.11 Thuê sân, sự cố và outbox

| Verb | Path | Actor | Contract |
|---|---|---|---|
| POST | `api/checkouts/court-rental` | Member | `Idempotency-Key`, body gồm môn/phòng/start/end; invoice/item giữ snapshot giá và occupancy cho tới fulfill/cancel/expiry. |
| GET | `api/court-rentals/availability` | Member | `sportId,startUtc,endUtc`; chỉ phòng trống + giá, không trả lịch Member/lớp/PT. |
| GET | `api/court-rentals/mine` | Member | Rental của chính người gọi, lọc `fromUtc/toUtc`. |
| POST | `api/court-rentals/{rentalId}/cancel` | Chủ rental | Self-cancel theo ngưỡng setting 24 giờ; trả 204. |
| GET | `api/manager/court-schedule/rentals` | FrontDesk | Rental theo khoảng thời gian/phòng; lịch tổng hợp dùng `/api/manager/court-schedule`. |
| POST | `api/manager/court-rentals/{rentalId}/cancel` | Manager | `{reason}`; center-fault cancel/refund 100% điểm. |
| POST | `api/manager/incidents/preview`, `api/manager/incidents/resolve` | Manager | `IncidentRequest` gồm scope, room/time, lý do; resolve kiểm tra tác động lại, rental cancel/refund + block nguyên tử; class/PT chồng thời gian trả conflict để xử lý lịch trước. |
| POST | `api/manager/notices` | Manager | `{subject,message,recipientUserIds,sendInApp,sendEmail}`; in-app/email vào outbox theo người nhận, giới hạn 1–200 người. |

Email không xuất hiện trong danh sách/read-all InApp. OTP email được mã hóa ở outbox và gửi bởi dispatcher; status email Sent chỉ sau sender thành công, retry có backoff/lease và gửi at-least-once.

`GET /api/reports/revenue` giữ các field legacy, đồng thời thêm `legacyCashCollected`, `reconciliationCashCollected`, `reconciliationCashCount`, `pointsRedeemed`, `pointsRedeemedVnd` (điểm×1.000 VND), `pointsIssued`, `managerPointAdjustment`, `outstandingPoints` (available+held tại lúc chạy), và `bySource[{source,cashCollected,pointsRedeemed}]`. Daily rows thêm `legacyCashCollected` và `reconciliationCashCollected`; `totalCollected` cộng cả cash reconciliation đã xác minh để đối soát. Group-by-Sport và export dùng cùng tổng hợp theo phần P1.12/P1.13 bên dưới.

Lịch phòng tổng hợp và incident workflow hiện hành được mô tả ở bản chốt đầu tài liệu; PostgreSQL concurrency/privacy đã qua gate. Manager cần chọn phương án dời/hủy/bù hợp lệ trước khi resolve incident có lớp/PT.
# Contract báo cáo và tích hợp

Phần này thay thế các ghi chú “chưa có” về báo cáo/export và seed trong checkpoint lịch sử bên dưới.

| Verb | Route | Actor | Hợp đồng |
|---|---|---|---|
| GET | `/api/reports/revenue?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD` | CenterManager | Thêm `bySportAndSource[]`: `source`, nullable `sportId/sportName/memberId`, `cashCollected`, `legacyCashCollected`, `pointsRedeemed`. Tổng các dòng cash khớp `totalCollected`, gồm `Reconciliation` và `LegacyUnclassified`. |
| GET | `/api/reports/court-rental-revenue?fromDate=...&toDate=...` | CenterManager | `{fromDate,toDate,rows}`; lấy các dòng Rental của cùng bộ tổng hợp doanh thu, theo ngày thực thu VN. |
| GET | `/api/reports/membership-period?fromDate=...&toDate=...` | CenterManager | `{fromDate,toDate,newMembers,activeMembersAtPeriodEnd}`; đăng ký theo `[00:00 VN,00:00 VN ngày sau)`, active theo validity và trạng thái Active/Expired, loại Cancelled/PendingPayment. |
| GET | `/api/reports/class-enrollment?fromDate=...&toDate=...&sportId=3` | CenterManager | `activeHoldCount` chỉ đếm Active có expiry lớn hơn server clock; `availableSeats=capacity-confirmed-activeHold`. |
| POST | `/api/reports/exports` | Theo policy export hiện hữu | `{reportType,fromDate,toDate,columns,format:"Csv" hoặc "Pdf",sportId?:3}`. `sportId` áp dụng cho `CLASS_ENROLLMENT`. |

Các loại export mới:

- `REVENUE_DAILY`: `date,collectedAmount,refundedAmount,obligationReduction,netCollected,legacyCashCollected,reconciliationCashCollected`.
- `REVENUE_DIMENSIONS` / `COURT_RENTAL_REVENUE`: `source,sportId,sportName,memberId,collectedAmount,legacyCashCollected,pointsRedeemed,pointsRedeemedVnd`.
- `MEMBERSHIP_PERIOD`: `fromDate,toDate,newMembers,activeMembersAtPeriodEnd`.
- `CLASS_ENROLLMENT`: `classId,code,name,sportId,sportName,status,capacity,confirmedCount,activeHoldCount,availableSeats,fillRatio,breakEvenThreshold,thresholdStatus,firstSessionStartUtc`.

`REVENUE` cũ vẫn là danh sách hóa đơn theo ngày phát hành; không dùng loại này để so với tổng thu theo ngày thanh toán. `MEMBER_SUMMARY` cũ giữ tương thích. Export mới gọi cùng service API, không nhân bản truy vấn tài chính. Phạm vi doanh thu tối đa 366 ngày, trả `range_too_large`; report export thất bại giữ trạng thái Failed và failure reason theo contract hiện hữu. Điểm không cộng thành cash; outstanding là available+held hiện tại. Membership sport null; PT legacy chưa có sport reference chỉ được phân loại khi có đúng một môn OneOnOne.

- `REVENUE_SUMMARY`: `fromDate,toDate,collectedAmount,refundedAmount,netCollected,legacyCashCollected,reconciliationCashCollected,pointsRedeemed,pointsRedeemedVnd,pointsIssued,managerPointAdjustment,outstandingPoints`.

## Manager operations read contracts — 07/10/2026

- `GET /api/audit-logs` accepts optional `targetId` together with existing `targetEntity` filters. Exact target filtering happens before pagination/count. Existing role restrictions remain: Manager can read operational audit; Admin remains restricted to account events; Member/Coach/Receptionist cannot gain audit access through this parameter.
- `GET /api/manager/sports` service rows include the actual `offeringId`. The Manager PT qualification editor sends these IDs to `/api/manager/coaches/{id}/service-qualifications`; it must not derive an offering ID from a sport ID. Public `GET /api/sports` omits `offeringId`.
- This adds no migration and implements no new G03/G06/G07/G13 command. Current incident preview/action/recheck/resolve remains a sequence of separate operations; timeout resolve requires reconciliation before a fresh attempt.

## Audit target display context

`GET /api/audit-logs` adds optional `currentTargetLabel` and `referenceNames` (`Entity:ID` → current display name) for Manager results. Names are resolved only for targets and allowed references on the filtered, paginated page, with one bounded query per relevant entity type. Administrator results remain limited to account events and keep the existing target-account fields. This change does not grant access to any additional audit records or account/detail endpoints.

The Manager UI prefers recorded identity (`name`, `targetName`, court-rate room-type name, notification subject or report type). If no identity was captured, it displays the current label and marks it as current. Missing/deleted/invalid targets retain their type and ID with an unavailable-name message. Reference names are also current display context, not historical evidence. Neither `oldValue` nor `newValue` is rewritten or backfilled. Changed prices, statuses, times, capacities and other operation values come exclusively from the event.

Metadata uses an explicit field allowlist, localizes labels, compares recorded values, and understands legacy arrays for room opening hours and room-type sport links, PascalCase service fields, and `{value, reason}` wrappers. Unknown objects and secret fields are omitted. Empty details explicitly state that no details were recorded. Legacy missing values are shown as not recorded, never inferred from the current entity.

New sport snapshots include name/code, description/image URL, activity/order and service duration/capacity; activity changes record name/code as well. Service compatibility logs include both previous and next room-type lists. Opening-hours and room-type compatibility snapshots now record the room/type name and their arrays. Room-block creation/deletion snapshots record the room name, room ID, start/end time and reason. Report export audits record the report type alongside the original parameters. These payload additions do not alter the operations themselves and require no audit-table migration.

## Automatic sport display order


`sortOrder` remains in `SportResponse` but is no longer a create/update input. Legacy requests containing `sortOrder` are ignored. The backend assigns consecutive positive ranks `1..N` across all sports: active first, inactive last. Creating or reactivating a sport appends it to the active group; deactivating appends it to the inactive group and compacts the ranks. Repeating activate/deactivate has no effect on position. Editing a name or service does not move the sport. Manager status/search filters preserve these global ranks; they do not renumber filtered results. Public/member lists include only active sports. Create and activity changes are serialized in one database transaction, including audit writes. No sport deletion or changes to sport IDs/codes are introduced.

Migration `20261007110000_AutomaticSportOrder` normalizes negative, duplicate and sparse legacy ranks while preserving prior relative order within each activity group (`sortOrder`, name, ID). Historical audit snapshots are unchanged.

## Manager class-slot preview — 07/10/2026

`GET /api/manager/class-schedule/availability` is Manager-only. Query: `sportId`, `roomId`, `coachId` (optional), positive `capacity`, UTC `startUtc`/`endUtc`, optional `excludeSessionId`. The slot must have positive duration and be at most 12 hours. Response:

```json
{"available":false,"roomName":"Court A","coachName":"Coach Linh","reasons":["outside_opening_hours","coach_busy"]}
```

Reasons: `sport_inactive`, `room_not_found`, `room_inactive`, `room_incompatible`, `room_capacity_exceeded`, `outside_opening_hours`, `room_busy`, `coach_required`, `coach_inactive`, `coach_specialty_mismatch`, `coach_busy`. Names describe current records. The room must cover the entire slot under Vietnam-local opening hours. Both room and coach occupancy use overlapping active reservations across all source types.

`excludeSessionId` must identify an existing Scheduled class session belonging to the requested sport; otherwise the endpoint returns `400 invalid_preview_session`. It excludes only occupancies whose source type is ClassSession and source ID is that session, allowing review of its replacement without treating its existing reservation as a conflict. Other reservations remain checked. Missing sport returns `404 sport_not_found`; invalid duration/capacity returns `400`.

This endpoint does not reserve resources, change sessions, write audit events or require a migration. It checks resource availability, not all final command rules. Publish/reschedule/makeup still validate lifecycle, students, dates and occupancy in their existing transactions. The frontend also marks overlaps within the proposed draft as `draft_overlap`; that is a local validation code, not an API reason. Existing `/api/availability/rooms`, `/coaches` and room-busy contracts are unchanged.
