# Hợp đồng API refactor đa môn (backend)

## Landing page content

- Media supports inline plain-text editing of titles and content by double-click (Enter/F2 also opens editing). Enter finishes, Shift+Enter inserts an intentional newline, Escape restores the prior value; blank edits revert. Catalog sport names and linked Coach profile details remain read-only. Draft text participates in Preview, Save changes, Cancel and revision conflict protection.
- `brand.logo.image` is the only supported brand field in `values`. Media's **Change logo** uploads JPG/PNG/WebP using the existing image API with `preset=logo`; this preset preserves the original aspect ratio and transparent pixels without a crop/JPEG conversion. It keeps the existing type/signature/size checks, storage limits and audit. The public homepage header and its draft preview display the published/draft logo respectively; the Manager navbar stays unchanged. Restore original removes the custom logo in the draft.

- `GET /api/landing-page`: public, no-store; returns `{ revision, values, updatedAt }`. With no published row, returns an empty GUID revision, empty overrides and null timestamp; the homepage keeps its existing editorial defaults.
- `PUT /api/landing-page`: CenterManager only. Sends the revision read by the editor and the complete `values` dictionary. Supported section prefixes: `hero`, `bookmarks`, `gallery`, `arena`, `booking`, `faq`. Text is plain text, 1–2,000 characters per field, maximum 300 fields and 256 KB request. Image fields accept HTTPS URLs or local `/sporthub/` assets. No HTML, routes, account counts or operational prices are edited through this API.
- Saving publishes immediately. A transaction-scoped lock serializes first creation and updates; a stale revision returns `409 landing_content_changed` without overwriting published content. `UPDATE_LANDING_PAGE` is audited in the same transaction.
- Manager UI: **Support & Communication → Media**, at `/manager/media` (the old `/manager/landing-page` URL redirects here). Text and images are grouped by card, gallery photo, sport zone or FAQ question. Section preview includes unsaved edits; **Restore section** only changes the draft until **Save & publish** is selected. Existing Coach/facility data still supplies bookmark defaults where available; editorial overrides take precedence for the corresponding display fields.
- `POST /api/manager/media/images`: CenterManager only, rate limited, multipart fields `file` and `preset` (`landscape`, default, or `booking`); JPG/PNG/WebP up to 10 MB, checked by content type and file signature. Media opens a crop dialog before uploading, drawing the crop directly from original image pixels without upscaling (JPEG quality 95%). Uses backend `CLOUDINARY_URL` and returns `{ url, publicId, width, height }`. Images are stored under `sporthub/media/<actor>/<unique-id>`, limited to 2,560 px while preserving aspect ratio; credentials never reach the browser. The API checks the stored dimensions against the selected preset; an invalid ratio returns `400 media_aspect_ratio_invalid` and attempts to remove the unused upload. Successful uploads are audited as `UPLOAD_MEDIA_IMAGE`. An upload failure keeps the previous image. An audit-save failure attempts to delete the new asset.
- Uploading updates only the local editor draft; **Save & publish** persists the image URL into the homepage document. Previously published or unused uploads remain in the Cloudinary Media Library for reuse; replacing or restoring a field does not delete shared assets. The editor blocks publishing or switching sections while an upload is pending.
- Media loads `/api/coaches` and `/api/public/overview` before enabling editing. It shares the homepage's live bookmark resolver, then applies the published overrides. Preview uses the same loaded Coach/facility snapshot and current draft. If either live source fails, the editor offers Retry instead of allowing edits against conflicting static defaults. Restoring a section removes its overrides and returns it to the same live defaults used on the homepage.
- Featured Coaches are saved as three ordered, distinct UUIDs in `values["bookmarks.coachIds"]`, comma-separated. `PUT /api/landing-page` requires exactly three active Coach accounts with profiles and rechecks eligibility during publishing (`400 featured_coaches_required` / `409 featured_coach_unavailable`). Media suggests Coaches with avatars first, supports name/sport search and explicit selection/reordering. Without a previously published selection, Media preselects up to three suggestions for review; publishing still requires three.
- Coach card names, avatars and sports always come from current Coach profiles. Legacy `bookmarks.0.items.*` overrides are ignored on the homepage and removed on save. Only the Coaches section title/description remain editable. If a featured Coach later becomes unavailable, the homepage omits that Coach instead of substituting a different identity into the same card; Media flags the selection for replacement. `/api/coaches` additionally returns `sportNames` and excludes accounts without a profile. No schema migration is needed for Coach selection.
- Coach portrait framing uses `bookmarks.coachFrame.<coach UUID without hyphens>.{fit,x,y,zoom}`. Fit is `contain` (default, full photo) or `cover`; x/y range from 0–100 and zoom from 1–2. Avatar uploads, homepage and Media use the same 1:1 square frame. Framing is saved with the homepage document, never written into the Coach profile. Media displays a warning for raster images smaller than 800 px; lost detail in previously reduced images requires re-uploading the original.
- Image ratios are shared in frontend `components/homepage/image-specs.ts`: Coach/avatar 1:1 (up to 1536×1536), card/banner/arena images 3:2 (up to 1800×1200), court-booking image 4:5 (up to 1200×1500). Upload crop, Media thumbnail, Preview and homepage frames use these presets on desktop and mobile. Existing images remain intact and are displayed inside the fixed frames; uploading again lets the Manager choose a new crop.
- User photo fallbacks share the local vector graphic `/sporthub/avatar-default.svg` across account menus, profiles, lists and homepage portraits; null/broken photos render this graphic without creating a fake uploaded-avatar URL. New avatar uploads render their crop directly from original image pixels at up to 1,536 px (without upscaling), instead of resampling the 240 px editor canvas. Cloudinary applies only a 1,536 px size limit. No data migration changes existing photos.
- Migration `20261020162921_AddLandingPageContent` adds only the singleton `landing_page_content` table. Cloudinary uploads require no additional schema migration and do not change the hero video.

## Manager workspace — 20 October 2026

This section defines Manager workspace scope and navigation. These rules supersede older cancellation, wallet-adjustment and next-cohort-link descriptions.

- `GET /api/manager/people?role&keyword&page&pageSize`: CenterManager only; restricts to Member/Coach before filtering and pagination, preserves activation metadata and excludes staff even when a staff role is supplied. UI uses one People directory; Schedule and Audit are accessed through the profile dropdown.
- `GET /api/manager/requests/summary`: CenterManager only; pending counts `{coach,refunds,support,avatar}`. Existing request types retain their own mutation APIs.
- `POST /api/avatars/reports`: authenticated account; `{targetUserId,avatarUrl,reason}` for another Member/Coach's current photo. Same reporter/photo/open report is deduplicated. Audit and Manager notifications commit with the report.
- `GET /api/manager/avatar-reports?status&search&page&pageSize`: Manager-only paged moderation inbox with target identity/role, reported/current photo and reason.
- `POST /api/manager/avatar-reports/{reportId}/dismiss`: Manager-only, idempotent after resolution.
- `DELETE /api/manager/users/{userId}/avatar`: Manager-only current Member/Coach photo removal; resolves open reports and retains history. Legacy member-only removal remains compatible.
- `POST /api/class-sessions/{sessionId}/incident-makeup`: Manager-only `{fenceId,reason,makeup}`; requires a held, matching, unexpired Incident fence and a valid future replacement. Allows enrolled classes. Ordinary `/cancel` still rejects active Confirmed enrollment; historical `/incident` permits whole-session makeup under its validated Incident window.
- Room create/update accepts direct `sportId`; rental setup no longer requires `roomTypeId` from the user. Room responses append nullable `sportId`. Legacy type/rate keys are retained internally. Existing scheduled/priced rooms cannot silently change sports.
- `GET /api/member-packages` adds optional `packageId`; `GET /api/manager/classes` adds `coachId`, including main and noncancelled session assignments.
- HTTP manual wallet adjustment creation and legacy point-credit approval/rejection return 403. Wallet read/ledger, payment and refund commands remain functional.

## Tạo Sport kèm Room Type tùy chọn — 19 October 2026

`POST /api/manager/sports` bổ sung `createRoomType` (mặc định false) và `roomTypeName` (tên do Manager nhập, tối đa 100 ký tự). Khi chọn true, tên sau trim phải có nội dung và không trùng Room Type hiện có (không phân biệt hoa/thường); lỗi `invalid_room_type_name` hoặc `room_type_name_taken` không tạo Sport. Sport, Room Type Active, liên kết SportRoomType và audit được lưu cùng transaction. Khi false/bỏ trống, tên Room Type được bỏ qua và không tạo/sửa Room Type hay liên kết. `PUT` không hỗ trợ tạo Room Type (`room_type_creation_only` nếu bật flag). Response Sport giữ nguyên; Room Type mới xuất hiện trong `/api/room-types` kèm sportIds. Không tạo sân vật lý. Không cần migration.

## Tạo sân cho thuê trọn gói — 19 October 2026

Manager-only `POST /api/rooms/rental` lưu sân, giờ hoạt động, giá riêng và bật dịch vụ thuê trong một transaction. Court-rate request/response bổ sung `roomId` nullable; giá riêng được ưu tiên hơn giá chung theo loại sân. Xem contract, validation và verification.

## M06 class opening decision — 18 October 2026

See confirmed policy and implementation. Existing threshold/respond/waive/cancel/reschedule endpoints are reused. Public class responses add boolean `openingConfirmed` without exposing costs or break-even counts. Only Met/Waived classes advance to teaching; late unconfirmed openings require a Manager decision or deferral. Response settings allow 1–48 hours and reviews at least 72 hours ahead, with a 24-hour pre-opening margin. Rescheduling an unconfirmed planned first session updates its opening date/review deadline and cannot cut into an existing response window. Attendance can return 409 `class_opening_not_confirmed`; retroactive waiver returns 409 `threshold_opening_time_passed`; invalid reschedule returns 409 `threshold_response_window_conflict`.

## Incident recovery with manual scheduling — 18 October 2026

Manager-only: POST `/api/class-sessions/{id}/incident`. The automatic slot-search UI and suggestions endpoint have been removed at the user's request. Manager enters the replacement time, room and Coach manually; save commands validate conflicts. Existing scheduling and incident routes are reused; ordinary past edits remain blocked. Historical class incidents can be reported with whole-session replacements, immutable facts and retry deduplication. Related incident routes are listed below.


## Coach–Member assignment lifecycle update — 18 October 2026

M02 reuses the existing relationship search/create/end routes. Manual creation now requires a confirmed enrollment in a Published/InProgress course led by that Coach (409 `relationship_requires_active_class`). Every relationship source ends automatically when its last supporting course/enrollment ends. Responses add `endReason` and `activeClasses: [{classId,className}]`; ended records remain historical. See lifecycle and transaction details. No new HTTP endpoints are added.

## Staff activation and audit policy update — 14 October 2026

The current policy is documented in [UsersController](../backend/SportHub.Administration/Api/UsersController.cs) and [AuditLogsController](../backend/SportHub.Administration/Api/AuditLogsController.cs). It supersedes account-only Admin audit restrictions. Staff links expire at account creation + 24 hours. Admin reads Manager/Admin/Coach/System events; Manager reads Manager/Receptionist/Coach/Member events, using immutable event-time roles. `GET /api/audit-logs` accepts an optional canonical `actorRole`; all filters and the action catalogue are scoped server-side. Responses add `actorRole` and user invitation metadata (`activationExpiresAtUtc`, `activationResendAvailableAtUtc`). Member activation also stays 24 hours.

## Admin account administration

- `GET /api/users/admin?status=ACTIVATION_REQUIRED` selects Active non-Member accounts without a password or external login. `status=ACTIVATION_EXPIRING` selects the same accounts whose fixed `CreatedAt + 24 hours` deadline is greater than server UTC now and no later than six hours ahead. These are filters, not new `UserStatus` values. Existing Active/Banned/Deactivated totals are unchanged; the invitation queues overlap Active.
- Role and status commands share a PostgreSQL transaction-scoped advisory lock `(105,24)` before locking the target account. The actor is re-read and must still be Active/SystemAdministrator after waiting; otherwise 403 `administrator_access_changed`. The guard preventing lock/deactivation of the last active Admin is checked within this boundary. Existing self-lock, immutable Admin role and Member/staff separation rules remain enforced.
- Effective status changes commit status, a new security stamp, audit and outbox together. `CoachCoverageRequired` uses a fresh `transitionId` as notification `SourceEntityId`; the same ID appears in the account-status audit `newValue`. It identifies the transition, not the Coach. Audit `targetId` remains the account ID. Repeating the current status is a no-op, while a later lock/deactivation creates a new event. Manager's coverage queue still resolves work through its existing API.
- Admin account detail links to `/admin/audit-log?targetEntity=UserAccount&targetId=<userId>`. Shared audit filters persist `dateFrom`/`dateTo` calendar dates in the page URL and send `fromUtc` (inclusive Vietnam midnight) / `toUtc` (exclusive midnight after the selected final day) to `GET /api/audit-logs`. Presets: All time, Today, Last 7 days, This month. Invalid/reversed ranges are rejected in the UI. Record type/ID, action, actor and event-role filters retain server-side visibility rules.
- Staff creation/resend/correction feedback states that email is queued. Resend/correction never extend `CreatedAt + 24 hours`; an expired invitation cannot be renewed through these operations. Eligible expired unactivated staff are removed by the existing expiry job before a new invitation can reuse their email. This refactor requires no migration and does not change staff activation deadlines or audit-read permissions.


SportHub là **hệ thống quản lý trung tâm thể thao với ba môn Gym, cầu lông và bóng rổ; có thể mở rộng thêm môn trong tương lai**.

Các bảng mô tả contract; phần route baseline chỉ để tra cứu đường đọc tương thích. Không dùng baseline để khôi phục luồng ghi legacy. Trạng thái triển khai và nghiệm thu xem mục 13 của thiết kế hệ thống.

## Contract giao diện nghiệp vụ

### Hồ sơ học viên Coach và lịch sử cùng môn

| Verb | Route | Contract |
|---|---|---|
| GET | `/api/coaches/me/teaching/students?page&search&sportId` | Coach; học viên duy nhất từ các lớp đang phân công, 12 mục/trang; `items[{memberId,memberName,email,classes[]}]`, `sports[]`, `page`, `pageSize`, `totalCount`. |
| GET | `/api/coaches/me/teaching/students/{memberId}` | Coach; thông tin học viên và lớp/môn hiện tại trong phạm vi phân công. |
| GET | `/api/coaches/me/teaching/students/{memberId}/history?classId&page` | Coach; `RESULT` của chính học viên từ lớp trước cùng môn, mới nhất trước, 20 mục/trang; mỗi mục gồm `record,className,sportName,coachName,sessionNo,sessionStartAtUtc`. Yêu cầu phân công hiện tại và ghi danh Confirmed tại classId; lịch sử chỉ đọc. |
| GET | `/api/coaches/me/teaching/students/{memberId}/history/classes?classId&page&search` | Coach; lớp có đánh giá trong phạm vi lịch sử hợp lệ, 8 lớp/trang, `classId,className,startDate,assessmentCount,averageScore,lastRecordedAtUtc`. Sắp xếp theo đánh giá gần nhất; điểm trung bình null nếu chưa có điểm. Endpoint `history` nhận thêm `sourceClassId` để tải đánh giá riêng cho lớp đã chọn. |

Các endpoint `teaching/classes/{classId}/members` và `records` hỗ trợ query `memberId` và `sessionId`. HLV dạy thay bắt buộc cung cấp `sessionId` đúng buổi được giao; records chỉ trả nội dung buổi đó. Không đổi schema/migration. Chi tiết quyền và route ở các mục Coach bên dưới.

### Sắp xếp danh sách Admin

- `GET /api/users/admin`: thêm query tùy chọn `sortBy=fullName|email|role|status`, `sortDirection=asc|desc`; mặc định `email/asc`.
- `GET /api/audit-logs`: thêm query tùy chọn `sortBy=timestamp|actorEmail|action|targetEntity`, `sortDirection=asc|desc`; mặc định `timestamp/desc`.
- Server sắp xếp trước `Skip/Take`, thêm ID làm khóa thứ hai để phân trang ổn định. Role/status dùng thứ tự enum nghiệp vụ. Cột hoặc chiều không hợp lệ trả 400 `invalid_sort_column`/`invalid_sort_direction`. Quyền và phạm vi Audit log giữ nguyên.

Các API dưới đây bổ sung đúng dependency của frontend P2.06–P2.10, không đổi schema/migration. Quy định mới về hủy khóa thay phần mô tả P1.05 bên dưới.

| Verb | Route | Actor / contract |
|---|---|---|
| POST | `/api/gym-checkins` | Receptionist; `{targetMemberId}`. Member cần gói Gym còn hiệu lực; Gym đóng trả 409 `gym_closed`. Mỗi Member chỉ được ghi thêm lượt sau ít nhất 10 giây; gửi đồng thời hoặc trong cooldown trả 409 `gym_checkin_cooldown`. Lịch sử chỉ ghi thời điểm vào, không có thao tác check-out. |
| PUT | `/api/manager/coaches/{userId}` | Manager; bổ sung `fullName?` (2–100 ký tự, validator hiện có), `phone?` (đúng định dạng, unique); null giữ giá trị cũ, chuỗi phone rỗng xóa số. Không đổi email/role/UserStatus. |
| GET | `/api/manager/classes?thresholdStatus=AT_RISK` | Manager; thêm filter threshold, giữ sport/lifecycle/search/pagination hiện có. Enum wire UPPER_SNAKE_CASE. |
| GET | `/api/manager/classes/{classId}/holds` | Manager; paged `holdId,memberId,memberName,invoiceId,status,expiresAtUtc,createdAt`. |
| GET | `/api/manager/classes/{classId}/enrollments` | Manager; paged `enrollmentId,memberId,memberName,invoiceItemId,status,enrolledAt`; lấy invoice bằng endpoint by-item hiện có. |
| GET | `/api/manager/classes/{classId}/threshold-responses` | Manager; paged `responseId,memberId,memberName,choice,targetClassId,resolutionStatus,additionalInvoiceId,deadlineUtc`. Không trả token/hash. |
| GET | `/api/manager/classes/{classId}/cancellation-preview` | Manager; `canCancel,version,totalSessions,sessionsNotProvided,confirmedCount,activeHoldCount,refundPoints,previewToken,members[],requiresMemberDecision`. Enrolled classes normally cannot be cancelled. Exception: Published + AtRisk + confirmed count below threshold, no Completed sessions, paid items present. The exception quotes refundable points and requires Member choices after cancellation. |
| POST | `/api/manager/classes/{classId}/cancel` | Manager; `{reason,previewToken?}`. Ordinary active enrollment: 409 `class_has_enrollments`. Below-threshold exception requires a fresh preview, cancels sessions/releases occupancy and holds, queues bell/email decisions for each remaining paid Member atomically. Existing keep-place/pending-transfer responses become fresh Pending decisions, with the configured full response period (1–48 hours, default 48) starting at cancellation. Only REFUND or WAIT_NEXT_COURSE are allowed on a cancelled class; both refund the remaining value as points, WAIT additionally subscribes to Course interests. No response: automatic points refund after deadline. Retry cancellation/choice is idempotent. Stale preview: 409 `class_cancellation_changed`. |
| POST | `/api/manager/classes/{classId}/enrollment/close` | Manager; body `{reason}` bắt buộc, 3–500 ký tự (thiếu/ngắn → 400 `enrollment_close_reason_required`). Chỉ đóng tuyển sinh lớp Published: checkout mới nhận 409 `enrollment_closed`; hold Active và ghi danh hiện có không bị hủy, hold hợp lệ vẫn hoàn tất thanh toán. Luôn gửi thông báo + email tiếng Anh cho Member đã ghi danh. Response `ClassManagerResponse` thêm `enrollmentClosedReason`, `enrollmentClosedAtUtc`. Đóng lặp là no-op; không hủy lớp hoặc hoàn điểm. |
| POST | `/api/manager/classes/{classId}/enrollment/open` | Legacy compatibility; không còn nút trong giao diện Manager. Không mở lại lớp đủ sĩ số (`class_full`). |
| GET | `/api/members/me/class-holds` | Member; danh sách hold lớp còn hiệu lực của chính Member: `[{classId,invoiceId,expiresAtUtc}]` (Active, chưa hết hạn, có invoice). UI dùng để hiện “Hoàn tất thanh toán” cho lớp đã đóng tuyển sinh sau khi Member giữ chỗ; hold vẫn thanh toán được tới `expiresAtUtc`. |
| POST | `/api/manager/notices` | Manager; body hiện có, thêm header `Idempotency-Key` UUID. Cùng Manager/key/payload nhận cùng noticeId và không tạo thêm outbox; đổi payload trả 409 `notice_idempotency_conflict`. Client cũ không có key vẫn được hỗ trợ. |
| GET | `/api/manager/notices` | Manager; lịch sử của chính mình, query `search` theo tiêu đề, `fromDate`/`toDate` theo ngày Việt Nam (bao gồm hai đầu), `page`/`pageSize` (tối đa 50). Trả `PagedResult` với tiêu đề, người gửi, thời điểm, số người nhận và kênh đã chọn; mới nhất trước, tie-break bằng noticeId. |
| GET | `/api/manager/notices/{noticeId}` | Manager đã gửi; giữ `{noticeId,delivery}`, thêm `subject,message,createdAtUtc,senderName,recipientCount,sendInApp,sendEmail,isLegacy`. Manager khác nhận 404. |
| GET | `/api/manager/notices/{noticeId}/recipients` | Manager đã gửi; phân trang `page`/`pageSize` (tối đa 50). Mỗi người có `userId,name,email,inApp,emailDelivery`; mỗi kênh có `status,retryCount,sentAt,lastAttemptAt`, hoặc null khi không có bản ghi. Không trả payload email hay lỗi kỹ thuật của SMTP. Manager khác nhận 404. |
| GET | `/api/manager/notices/by-key/{key}` | Manager đã gửi; phục hồi receipt sau timeout/F5, chờ transaction gửi cùng key hoàn tất. |

**Manager cancellation rule:** A class with any active `Confirmed` enrollment (`EndedAt == null`) cannot be cancelled by a Manager. Preview returns `canCancel=false`, `refundPoints=0` and `members=[]`. Both `POST /api/manager/classes/{classId}/cancel` and cancellation-with-makeup paths (including Coach request resolution and incident replacement) return HTTP `409`, error `class_has_enrollments`. The check runs after locking the class row and does not trust cached counts or a prior preview. Rescheduling, changing room, and assigning another qualified Coach remain available. Automatic below-threshold resolution uses its existing separate services and is unchanged.

Migration `AddManualNoticeHistory` tạo `manual_notice_records`. Lần gửi mới lưu nguyên văn nội dung và snapshot tên/email người nhận/người gửi trong cùng transaction với audit/outbox; thay hồ sơ sau này không đổi lịch sử. Khôi phục lịch sử cũ từ audit `SEND_MANUAL_NOTICE` và outbox ManualNotice: tiêu đề/ngày gửi/người gửi, người nhận còn có dữ liệu và nội dung in-app nếu còn; không giải mã email. Bản cũ có `isLegacy=true`, `message=null` nếu không khôi phục được, tên có thể lấy từ hồ sơ hiện tại. Không gửi lại thông báo trong migration. `recipientCount` là số người; `delivery.total` và các trạng thái đếm theo từng kênh, không phải số người. `Read` của chuông không chứng minh email đã được mở.
| GET | `/api/manager/incidents/{incidentId}/notifications` | Manager; delivery tổng các notice IncidentResolution của rental thuộc incident. |
| GET | `/api/manager/incidents?page=1&pageSize=20` | Manager; danh sách sự cố đã ghi nhận, mới nhất trước, paging (pageSize 1–100). Mọi Manager xem được; trả `{items,page,pageSize,totalCount}`. |
| GET | `/api/manager/incidents/{incidentId}` | Manager; chi tiết `{incidentId,scope,roomId,roomName,startAtUtc,endAtUtc,reason,resolutionSummary,createdAtUtc}`; 404 `incident_not_found` khi không tồn tại. Trang Incident dùng bảng cuộn để chọn sự cố và mở chi tiết/trạng thái gửi thông báo. |
| GET | `/api/court-rentals/policy` | Member; `slotMinutes,maxHours,advanceDays,cancelFreeHours,serverNow`; không mở quyền đọc mọi system setting. |
| GET | `/api/court-rentals/{rentalId}` | Member chủ thuê; `rental,roomName,sportName,blocks,cancelReason,cancelledAtUtc,refundedPoints`. Rental summary thêm nullable invoiceId kể cả PendingPayment. Người khác 404; blocks là snapshot giá, refundedPoints từ ledger SystemEvent. |

Hủy khóa tính `floor(remainingPaidValueVnd × sessionsNotProvided / totalSessions / 1000)`; giá trị còn lại trừ các lần refund/transfer trước. Buổi gốc hoặc buổi bù đã Completed được coi đã cung cấp theo authority scheduling; không lấy giờ browser để tính hoàn. Ghi danh legacy thiếu paid item chặn hủy để tránh hoàn sai. Pending/AwaitingPayment threshold responses được hết hạn cùng transaction, tiền gateway đến muộn đi qua cơ chế compensation hiện có.

Delivery có `total,pending,sending,sent,failed,read`; đây là trạng thái outbox/in-app. SMTP vẫn at-least-once; receipt/idempotency không có nghĩa người nhận đã đọc email hoặc exactly-once SMTP.

## Contract tích hợp frontend

Các endpoint dưới đây phục vụ frontend API-backed. Không thay schema/migration. ID lớp/package/room/sport là int; ID invoice/enrollment/request là UUID. Backend tiếp tục kiểm role, ownership, trạng thái và đồng thời.

| Verb | Route | Hợp đồng / authority |
|---|---|---|
| GET / PUT | `/api/users/me`, `/api/users/me/profile` | Thêm `sportIds: number[]`, nullable `approvalStatus`. Role UPPER_SNAKE_CASE. F5 refresh profile trước cấp quyền trên UI; regression Security đã pass. |
| GET | `/api/membership-packages/public` | Anonymous, chỉ catalog active; endpoint quản trị/auth cũ giữ chính sách riêng. |
| GET | `/api/classes?fromDate=&toDate=&sportId=&page=&pageSize=` | DateOnly YYYY-MM-DD theo startDate khóa; validate khoảng ngày; danh sách public gồm khóa Published và InProgress (nhận ghi danh giữa chừng khi còn chỗ). Mỗi khóa có `sessionsPassed` (buổi đã bắt đầu, không tính buổi hủy) và `sessionsRemaining` (buổi Scheduled sắp tới). Đăng ký/checkout lớp không bị chặn vì đã qua buổi nào; chỉ trả 409 `class_started` khi không còn buổi sắp tới. Giá luôn là cả khóa; hạn giữ chỗ không vượt quá giờ bắt đầu buổi kế tiếp. |
| GET | `/api/classes/{classId}/public-sessions` | Anonymous, chỉ khóa Published, lịch buổi/room/coach không có roster/attendance. |
| GET | `/api/members/me/classes/{classId}/sessions` | Member có ghi danh còn hiệu lực (`Confirmed`, chưa `EndedAt`) trong khóa Published/InProgress/Completed (xem lại lịch sử sau khi lớp kết thúc); khóa Cancelled/Draft hoặc ghi danh đã kết thúc trả 403 `class_access_ended`. Không trả roster. |
| GET | `/api/coaches?sportId=` | Member/Receptionist/Manager: Coach active cùng specialty (`sportId`), chỉ userId/fullName/sportIds. Không trả email hoặc credential. |
| GET | `/api/checkouts/by-key?key=`, `/api/checkouts/by-reference?reference=` | Recovery timeout/return theo invoice của beneficiary hoặc initiator; kiểm scope lại. Query VNPay không là chứng cứ Paid. |
| POST | `/api/checkouts/{invoiceId}/confirm-points` | Xác nhận cash=0, invoice lock, ownership, hold còn hạn, không reconciliation/verified pending; idempotent Paid, không tạo gateway attempt. |
| GET | `/api/checkouts/{invoiceId}` | Thêm beneficiaryUserId/initiatorUserId/serverNowUtc và ptMemberPackageId/ptCoachId/ptFrequency để resume/re-quote khi retry. |
| POST | `/api/checkouts/{invoiceId}/attempts` | Response thêm gatewayMode MOCK/VNPAY theo provider thực. Cash>0 mới có QR/link. Cả attempts và confirm-points chặn `point_confirmation_pending`. |
| GET | `/api/invoices/{invoiceId}/point-confirmations/current` | Receptionist; audited beneficiary, revision, points, failedAttempts, expiry/resendAtUtc và status PENDING/LOCKED/EXPIRED; không trả code/hash/salt. |
| GET | `/api/invoices/by-item/{itemId}` | Lookup invoice từ own enrollment invoiceItemId; dùng lại quyền đọc invoice. Own invoice list hỗ trợ filter status. |
| GET | `/api/refunds/quote/{itemId}` | Ownership + paid/benefit eligibility; `{systemCalculatedPoints}` do backend tính. |
| POST | `/api/refunds/class-cancellations` | Body `{invoiceItemId}`. Member hủy ghi danh của mình, Lễ tân/Manager hủy thay. Chỉ trước buổi đầu: còn ≥ 5 ngày hoàn 100%, dưới 5 ngày hoàn 50% (tự động bằng điểm, ghi `PaymentAdjustment` Completed). Lớp đã bắt đầu → 409 `class_already_started`, dùng `POST /api/refunds` để Manager quyết định. |
| POST | `/api/refunds/membership-cancellations` | Body `{invoiceItemId}`. Hủy Membership đang hiệu lực (Member, hoặc Lễ tân/Manager thay): còn từ 2/3 thời hạn hoàn 50% bằng điểm, ít hơn 409 `refund_points_zero`; còn gói gia hạn nối tiếp → 409 `membership_has_renewal` (hủy gói nối tiếp trước). |
| POST | `/api/refunds` | Item lock và tối đa một request REQUESTED chưa xử lý trên item; submit lặp trả request hiện có. Không cho FE tự gửi số điểm duyệt. |
| GET | `/api/class-threshold-responses/mine`, `/{id}`, `/by-token?token=` | Member owner; course/sport/remaining paid value/deadline/choice/status/additionalInvoiceId/serverNowUtc. Token chỉ hash ở backend, không ghi analytics. |
| GET | `/api/class-threshold-responses/{id}/transfer-quote?targetClassId=` | Owner, response còn mở; cùng môn, target Published/chưa bắt đầu. Backend tính cashDifference/walletCreditPoints; giá trị chia hết cho 1.000. |
| POST | `/api/class-threshold-responses/{id}` | `{choice:REFUND|TRANSFER,targetClassId}`; dùng cùng transaction/lock/idempotent-final-choice như token route. Retry AwaitingPayment giữ nguyên đích. |
| GET | `/api/coach-member-relationships` | Member/Coach/Manager; Member/Coach bị clamp theo owner. Không có endpoint members/me/relationships giả. |
| GET | `/api/wallet/me/ledger?page=&pageSize=&entryType=` | Array WalletLedgerResponse, không Paged; timestamp createdAtUtc. Filter HOLD/RELEASE/SPEND/EARN/ADJUSTMENT áp trước pagination; filter sai 400. Ledger staff cũng hỗ trợ filter; chỉ Receptionist ghi audit lần xem. |

## API bổ sung cho Coach lớp nhóm

Các endpoint được giới hạn theo lớp/buổi được phân công, hỗ trợ lưu giáo án, kết quả, bài tập/thông báo, điểm danh và Gemini suggestion. Coach chủ nhiệm chỉ đọc hồ sơ học viên Confirmed của lớp Published/InProgress; HLV dạy thay chỉ đọc roster và bản ghi của buổi được giao. Member có feed khi Enrollment Confirmed, `EndedAt` rỗng và lớp Published/InProgress/Completed, kể cả sau buổi cuối; lớp Cancelled/Draft hoặc ghi danh đã kết thúc bị chặn. Có migration `AddClassTeachingWorkspace`; extension này được chủ sản phẩm xác nhận cho phép Coach ghi điểm danh lớp nhóm qua route mới.

`hold.minutes` cho checkout mới: Manager đặt số nguyên **10–30**, mặc định **15**. Hạn lưu trên checkout/attempt hiện có là snapshot, không thay đổi khi Manager cập nhật setting. Lớp, sân và chuyển lớp có thể cắt hạn sớm theo giờ bắt đầu hoặc deadline nghiệp vụ; client dùng `expiresAtUtc` trả về, không tự cộng số phút cấu hình.

## Quy ước wire và dữ liệu

- Enum JSON hiện tại: **UPPER_SNAKE_CASE** (`ISSUED`, `PAID_AFTER_RECONCILIATION`, `GROUP_COURSE`, `VN_PAY`). Enum số không được chấp nhận. DTO string biểu diễn enum có `WireEnum` converter; query enum chấp nhận canonical và tên nội bộ để tương thích. JWT role claim vẫn dùng tên nội bộ, không tự chuyển JWT.
- Enum DB hiện tại: lưu int mặc định EF (không có `HasConversion`). Khi thêm giá trị phải append, không đổi số cũ. `UserRole` hiện: CenterManager=0, Coach=1, Member=2, Receptionist=3, SystemAdministrator=4 (đúng 5 role, BR-140).
- `InvoiceStatus` DB: Issued=0, Paid=2, Void=3, PaidAfterReconciliation=4. Wire: `ISSUED`, `PAID`, `VOID`, `PAID_AFTER_RECONCILIATION`.
- Auth: JWT Bearer; policy trong `backend/SportHub.BuildingBlocks/Api/SportHubPolicies.cs`.
- Error body thông thường `{error,message}`, mã lỗi chữ thường snake_case; lỗi occupancy có thêm `conflicts[]`. ID vẫn đúng kiểu int/Guid, thời gian UTC ISO-8601; tham số ngày báo cáo/lịch dùng ngày Việt Nam.

## Bản chốt API — lịch sân, incident, payment và snapshot


### Lịch sân và xử lý sự cố

| Verb | Route / request | Actor | Response / lỗi |
|---|---|---|---|
| GET | `/api/manager/court-schedule?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD&roomId=` | Manager, Receptionist | 200 `CourtScheduleEntry[]`; hai ngày inclusive, tối đa 31 ngày; 400 `invalid_range`, 403 `court_schedule_forbidden`. |
| GET | `/api/coaches/me/court-schedule?fromDate=&toDate=&roomId=` | Coach | 200 cùng DTO nhưng chỉ lớp được giao. |
| POST | `/api/manager/incidents/preview` body `{scope:"ROOM"|"CENTER",roomId?,startAtUtc,endAtUtc,reason}` | Manager | 200 `{scope,roomId,startAtUtc,endAtUtc,impacts[],canResolve,blockReason,members[],expectedRefundPointsTotal}`. Mỗi impact có `{sourceType,sourceId,startAtUtc,endAtUtc,resolutionOptions[]}`. `members[]` do server tính: `{memberId,memberName,sourceType,sourceId,outcome,expectedRefundPoints?}`; `outcome` = `REFUNDED_AS_POINTS` (rental đã thanh toán, hoàn 100% = floor(giá trị còn lại/1.000) điểm), `CHECKOUT_RELEASED` (đơn chưa thanh toán, nhả hold), `AWAITS_SCHEDULE_DECISION` (hội viên lớp có buổi bị ảnh hưởng, chờ dời/bù, `expectedRefundPoints` null). Số điểm là báo giá tại thời điểm preview; resolve tính lại và khớp công thức. |
| POST | `/api/manager/incidents/resolve` body như preview | Manager | 200 `{incidentId}`; 409 `incident_requires_schedule_resolution` nếu còn lớp/block, `incident_schedule_changed` hoặc `occupancy_conflict` nếu lịch đổi; lỗi 400 `invalid_incident_scope`, `incident_reason_required`, `invalid_incident_range`; 404 `incident_room_not_found`. |
| POST | `/api/manager/incidents/fences` body như preview | Manager | 200 `IncidentFence`. Bắt đầu xử lý: giữ khung giờ (phòng hoặc toàn trung tâm) để không ai đặt mới trong lúc dời/bù lớp. Hiệu lực 2 giờ, mở lại cùng khung giờ là gia hạn chứ không tạo thêm. Mọi đặt mới (thuê sân, buổi lớp, dời buổi) chồng khung giờ bị `409 room_under_incident_review`; room block của chính sự cố được miễn. |
| GET | `/api/manager/incidents/fences` | Manager | Các khung giờ đang giữ: `{fenceId,scope,roomId,roomName,startAtUtc,endAtUtc,reason,createdAtUtc,expiresAtUtc,isExpired,remainingImpacts,affectedMemberCount,canResolve}`. `remainingImpacts` được đọc lại lúc gọi nên Manager thấy còn gì phải xử lý; `isExpired` = hết giữ (cho đặt lại) nhưng vẫn liệt kê để làm tiếp. |
| POST | `/api/manager/incidents/fences/{fenceId}/extend` | Manager | Giữ thêm 2 giờ; 409 `incident_fence_closed` nếu đã resolve/nhả hoặc khung giờ đã qua. |
| POST | `/api/manager/incidents/fences/{fenceId}/release` | Manager | 204. Nhả khung giờ không resolve; lặp lại là no-op; 409 `incident_fence_closed` nếu đã resolve. `resolve` tự đóng các fence nằm trong khung giờ của nó. |
| GET | `/api/manager/incidents/fences/{fenceId}/steps` | Manager | Các thay đổi lịch đã làm khi khung giờ đang được giữ (dời buổi, hủy kèm buổi bù): `{stepId,kind,className,sessionNo,beforeStartUtc,afterStartUtc,state,undoNote,canUndo}`, `state` = `APPLIED`/`UNDONE`/`UNDO_FAILED`. Chỉ ghi khi slot GỐC của buổi nằm trong một fence đang mở; thay đổi làm ngoài khung giờ đang giữ không được ghi và không bị hoàn tác. |
| POST | `/api/manager/incidents/fences/{fenceId}/abandon` | Manager | Bỏ hẳn sự cố trong một transaction: nhả khung giờ rồi hoàn tác các bước từ mới nhất về cũ nhất. Mỗi bước chỉ hoàn tác khi buổi vẫn đúng như bước đó để lại và phòng/coach gốc còn trống; ngược lại giữ nguyên và trả trong `notUndone[]` kèm `undoNote`. Trả `{fenceId,undone,notUndone[]}`. Hội viên được báo khi buổi quay lại giờ ban đầu hoặc buổi bù bị hủy. 409 `incident_fence_closed` nếu đã resolve/nhả. Không hoàn tác việc gỡ room block. |
| GET | `/api/reports/revenue/reconciliation?fromDate&toDate` | Manager | Đối soát: tính lại từng số của báo cáo doanh thu trực tiếp từ payment, ledger điểm, refund và `checks[{name,reported,actual,delta,ok}]`, cùng hóa đơn Paid có tiền mặt/điểm không khớp thanh toán (`invoiceMismatchCount`, mẫu tối đa 50). Chỉ dùng aggregate trong DB; chạy theo yêu cầu, không tự chạy. |

**Hợp đồng đích cho sự cố Gym tạm thời (25/10/2026; chưa triển khai):** danh sách ứng viên của một `incidentId` chỉ gồm Member có Membership hiệu lực trong khoảng Gym bị đóng; Manager có thể lọc theo tên/email/mã Member, gói/trạng thái Membership và khoảng thời gian bị ảnh hưởng. Kết quả lọc không tự chọn người nhận. Manager chọn Member, nhập điểm nguyên dương cho từng người (có thể đặt mức chung rồi sửa từng người), lý do, xem lại danh sách và tổng điểm trước khi gửi. Mỗi yêu cầu CREDIT cần tham chiếu `incidentId` + `memberId`, idempotency và kiểm tra chống tặng trùng; Manager khác duyệt thì mới cộng điểm và gửi thông báo. Route `incidents/resolve` hiện còn tự gia hạn Membership và route `wallets/{ownerId}/adjustments` chưa mang tham chiếu sự cố; cần đổi cả hai trước khi công bố API tặng điểm theo sự cố là đã có.


**Hợp đồng đích cho Manager tặng điểm (25/10/2026; chưa triển khai):** ngoài sự cố Gym, Manager được tặng điểm cho Member theo cách giống phát voucher. Màn hình giống **Add points** của Member nhưng thêm **lý do (bắt buộc)** và **bộ lọc chọn nhóm hoặc từng Member** nhận; Manager tự nhập số điểm nguyên dương và điều kiện của đợt tặng, xem lại danh sách người nhận và tổng điểm trước khi gửi. Dùng quy trình CREDIT hiện có (idempotency, Manager khác duyệt, ledger `Adjustment`); audit ghi người thực hiện, danh sách người nhận, số điểm, lý do và bộ lọc đã dùng. Receptionist không có quyền này (403).
| GET | `/api/manager/operations/health` | Manager | Sức khỏe vận hành: `status` Healthy/Degraded/Unhealthy, `jobs[]` (lần thành công/lỗi cuối, số lỗi liên tiếp, `unhealthy` khi im lặng quá 3 chu kỳ hoặc lỗi ≥3 lần; lịch sử job nằm trong bộ nhớ, reset khi khởi động lại), `outbox` (pending, kẹt khi gửi, failed, failed ≥5 lần), `payments` (sự kiện cổng chưa xử lý/lỗi, hóa đơn đã thanh toán nhưng chưa kích hoạt (`paidNotActivated`, đếm duy nhất theo hóa đơn trong hàng đợi Unactivated), attempt chờ đối soát, hóa đơn bị đánh dấu, seat hold hết hạn chưa nhả), `support.overdueRequests` (SLA đã đến hạn, chưa DONE/CLOSED/REJECTED). Hai chỉ số tồn đọng mới làm health Degraded; bỏ `manualCompensationRequired`. |
`CourtScheduleEntry`: `{sourceType,sourceId,roomId,startAtUtc,endAtUtc,coachId,coachName,title,status,classId,participants[]}`. Source type: `CLASS_SESSION`, `COURT_RENTAL`, `ROOM_BLOCK`. Participant: `{memberId,memberName,enrollmentId,attendanceStatus,recordedAtUtc}`. Rental/block không có roster; Member chỉ gọi availability và lịch thuê của mình, không gọi hai endpoint lịch nội bộ.

`resolutionOptions` trả `{action,method,path}`. Action identifiers: `Reschedule`, `CancelWithMakeup`, `CancelByCenter`, `RemoveExistingBlock`, `AutoCancelAndRefundOnResolve`; đây là identifier thao tác, giữ đúng chuỗi API trả, không phải enum. Frontend mở form tương ứng và gọi route được trả: class reschedule/cancel kèm makeup, xóa block không gắn incident. Sau khi xử lý, gọi preview lại rồi resolve. Resolve không tự chọn lịch thay người dùng; chỉ hủy/hoàn rental và tạo incident/block khi kiểm lại không còn conflict. Email và audit cùng transaction với bước nghiệp vụ tương ứng.

### Checkout và invoice

POST checkout trả 201 `CheckoutResponse`, yêu cầu header `Idempotency-Key` (không rỗng, tối đa 120 ký tự):

| Route | Body | Actor |
|---|---|---|
| `/api/checkouts/membership` | `{packageId,targetMemberId?,allowStacking:false,stackingApprovalReason?}` | Member hoặc FrontDesk; stacking cần quyền Manager và lý do. |
| `/api/checkouts/class` | `{classId,targetMemberId?}` | Member hoặc FrontDesk. |
| `/api/checkouts/court-rental` | `{sportId,roomId,startUtc,endUtc}` | Member tự mua. |
| `/api/checkouts/wallet-top-up` | `{points,targetMemberId?}` (1–10.000) | Member tự nạp, hoặc Receptionist nạp hộ một Member được chọn rõ ràng tại quầy (quyết định 25/10/2026: `targetMemberId` bắt buộc với staff, 400 `target_member_required`; điểm vào ví Member đó, audit ghi Receptionist, Member, số điểm, invoice). Cùng luồng và giới hạn với Member tự nạp; 1 điểm = 1.000 VND, chỉ thanh toán VNPay. Receptionist không tặng, trừ hay điều chỉnh điểm (403). |

FrontDesk là Manager/Lễ tân; staff mua cho Member phải có targetMemberId, Member chỉ mua cho mình. Lỗi chung: 400 `idempotency_key_required`/`target_member_required`, 403 `target_member_forbidden`/`checkout_not_owned`; conflict nghiệp vụ trả 409. GET checkout trả 200; attempts trả 200 `PaymentAttemptResponse` (`paymentAttemptId,invoiceId,transactionReference,cashAmount,pointsApplied,expiresAtUtc,paymentUrl,state`); không gửi giá do client tính.

`CheckoutResponse`: `{invoiceId,checkoutSessionId,revision,kind,state,totalAmount,pointsApplied,cashAmount,expiresAtUtc,resourceHoldId,invoiceStatus,fulfillmentOutcome,reconciliationRequired}`. Số tiền server quyết định; FE không tự đánh dấu paid từ redirect return hoặc chỉ từ `state`.

Wallet top-up dùng checkout/invoice/attempt/IPN/QueryDR và ledger hiện có. Chỉ cộng điểm sau khi VNPay xác minh khoản thu; callback lặp không cộng lại. Member không thể dùng điểm để thanh toán top-up. Giới hạn FE: 10.000–10.000.000 ₫ (bội số 1.000 ₫; BE chấp nhận 1–10.000 điểm). Mỗi Member chỉ có một top-up mở: `POST /api/checkouts/wallet-top-up` với key mới sẽ hủy top-up `Issued` chưa thanh toán trước đó (trả 409 `payment_reconciliation_pending` nếu top-up cũ đang chờ đối soát); cùng `Idempotency-Key` trả lại đúng checkout. "Change amount" ở FE gọi `POST /api/checkouts/{id}/cancel` rồi tạo checkout mới; thanh toán muộn trên checkout đã hủy vẫn được cộng điểm một lần. FE phục hồi bước thanh toán từ `?invoice=<id>` trên `/member/wallet/top-up` và chỉ tin trạng thái từ server (poll `GET /api/checkouts/{id}`). Khoản thu xác minh sau khi checkout hết hạn vẫn cộng điểm vào đúng ví và ghi `PAID_AFTER_RECONCILIATION` với `FULFILLED`.

| fulfillmentOutcome | Ý nghĩa |
|---|---|
| `PENDING` | Chưa cấp quyền lợi; xem thêm invoiceStatus/state để biết đã hủy/hết hạn hay còn chờ. |
| `FULFILLED` | Đã cấp quyền lợi, kể cả thanh toán muộn reacquire thành công. |
| `COMPENSATED` | Tiền được xác minh nhưng không cấp được quyền lợi; đã bồi hoàn bằng điểm. |
| `RECONCILIATION_REQUIRED` | Cần đối soát thủ công; không hiển thị như đã mua thành công. |

`InvoiceSummaryResponse` có `beneficiaryUserId` (Member), alias cũ `memberId`, `fulfillmentOutcome` cùng các field tiền/trạng thái hiện có. `paidVia` canonical: `POINTS`, `VN_PAY`, `VN_PAY_AND_POINTS`, `VN_PAY_AFTER_RECONCILIATION`, `VN_PAY_COMPENSATED`, `VN_PAY_MANUAL_COMPENSATION`. Không suy quyền lợi chỉ từ `PAID_AFTER_RECONCILIATION`.

`InvoiceItemResponse` bổ sung nullable `classId`, `courtRentalId`, `memberPackageId`, `sportId`, `sportName`, `sourceInvoiceItemId`. `relatedEntityId` vẫn đọc được cho lịch sử. Giá/item, sport name và thời hạn Membership được snapshot khi tạo checkout; sửa catalog không đổi hợp đồng đã mua. Membership không có sport riêng.

Membership catalog mới từ chối `sessionLimit != null` bằng 400 `membership_session_limit_removed`; giá phải dương, bội số 1.000 VND (400 `membership_price_invalid`). Những field quota legacy còn đọc được nhưng không ảnh hưởng access/expiry.

Invoice lịch sử vẫn đọc theo ownership/FrontDesk. Discount/correction không còn tạo/approve/reject (409 `legacy_adjustment_read_only`); refund dùng `/api/refunds`, không payout tiền mặt. Gửi payment thủ công trả 409 `checkout_requires_verified_payment`. Email invoice created/payment received/refund completed được queue cùng transaction; API không chờ gửi SMTP.

## Phần I — P1.10 Court Rental (đã có PostgreSQL regression ở P1.13)

| Verb | Path | Actor / contract |
|---|---|---|
| POST | `/api/checkouts/court-rental` | Member; `Idempotency-Key`; body `{sportId, roomId, startUtc, endUtc}` (không khai báo số người). Giá server tính theo giờ, giữ occupancy rồi trả checkout; payment mới chuyển Confirmed. |
| GET | `/api/court-rentals/availability?sportId&startUtc&endUtc` | Member; chỉ trả sân trống + báo giá giờ, không trả lớp/Member/nguồn lịch bận. |
| GET | `/api/court-rentals/calendar?sportId&date&hours` | Member đang hoạt động; ngày Việt Nam `yyyy-MM-dd`, thời lượng nguyên giờ (mặc định 1). Trả `{sportId,date,serverNowUtc,rooms:[{roomId,name,slots:[{startUtc,endUtc,status,totalPrice,blocks}]}]}`. Trạng thái `AVAILABLE/BOOKED/HELD/SCHEDULED/BLOCKED/UNAVAILABLE/NO_RATE`; chỉ `AVAILABLE` có báo giá và được chọn. Không trả danh tính khách, ID lượt đặt hay nguồn lịch bận. Checkout vẫn kiểm tra lại giá, giờ mở cửa và tranh chấp occupancy. UI chỉ báo thành công khi invoice `PAID` hoặc `PAID_AFTER_RECONCILIATION` và `fulfillmentOutcome=FULFILLED`. |
| GET | `/api/court-rentals/mine?fromUtc&toUtc` | Member; lượt thuê của chính họ. |
| POST | `/api/court-rentals/{rentalId}/check-in` | Receptionist/CenterManager qua `FrontDesk`; chỉ lượt `Confirmed`, từ 5 phút trước giờ bắt đầu đến trước giờ kết thúc. Chuyển sang `InUse`; ngoài cửa sổ hoặc bấm lặp trả 409. Tách biệt check-in Gym. |
| POST | `/api/court-rentals/{rentalId}/cancel` | Chủ thuê; ≥24h trước giờ bắt đầu hoàn 100%, dưới 24h 0%; cùng transaction hủy occupancy. |
| GET | `/api/manager/court-schedule/rentals?roomId&fromUtc&toUtc` | Manager/Receptionist qua `FrontDesk`; chỉ metadata thuê cần cho lịch, không roster Member. |
| POST | `/api/manager/court-rentals/{rentalId}/cancel` | CenterManager; body `{reason}`; center fault hoàn 100% bằng điểm và release occupancy nguyên tử. |

Invoice checkout giữ phòng bằng cùng occupancy constraints với class/block. Hết hạn/hủy nhả đúng một lần; IPN muộn không Spend lại điểm đã release, chỉ reacquire khi slot còn hợp lệ; nếu không thì theo cơ chế bồi hoàn khoản cash đã xác minh. Migration và PostgreSQL concurrency/ownership đã qua gate; chưa áp migration trên DB phát triển/chia sẻ.

Job trạng thái chạy mỗi phút: lượt `InUse` hết giờ thành `Completed`, lượt `Confirmed` chưa nhận sân hết giờ thành `NoShow`. Cả hai đều nhả occupancy; `NoShow` không tự hoàn tiền.

## Phần A — Route baseline (trước refactor)

### AuditLogsController — `api/audit-logs`

| Verb | Path |
|---|---|
| GET | `api/audit-logs` |
| GET | `api/audit-logs/actions` |

`GET api/audit-logs/actions` trả mảng mã Action khác nhau, bỏ mã rỗng/chỉ khoảng trắng và sắp xếp tăng dần, không phụ thuộc phân trang của bảng. Chỉ CenterManager/SystemAdministrator được gọi. Admin nhận đầy đủ danh mục `AccountAuditActions`, kể cả mã chưa phát sinh log, cộng các mã đã ghi trong phạm vi Manager/Admin/Coach/System. Manager nhận các mã đã ghi trong phạm vi Manager/Receptionist/Coach/Member. Chọn Action chưa có log trả bảng rỗng hợp lệ; danh mục không giới hạn vào `UserAccount`, không tạo log giả và không mở rộng quyền đọc.

Danh mục Admin hiện có: `CREATE_STAFF_ACCOUNT`, `CHANGE_USER_ROLE`, `LOCK_USER_ACCOUNT`, `UNLOCK_USER_ACCOUNT`, `RESEND_STAFF_ACTIVATION`, `CHANGE_PENDING_STAFF_EMAIL`, `FRONT_DESK_CREATE_MEMBER`, `RESEND_MEMBER_ACTIVATION`, `CHANGE_PENDING_MEMBER_EMAIL`, `EXPIRE_UNACTIVATED_STAFF_ACCOUNT`, `UPDATE_COACH_SPECIALTIES`.

Ô Action mở danh sách cuộn khi focus/click, hỗ trợ gõ để thu hẹp gợi ý không phân biệt hoa/thường (nhiều từ có thể nhập khác thứ tự), chọn bằng chuột hoặc ArrowUp/ArrowDown + Enter, Escape/Tab đóng danh sách. Chọn mã rồi Apply filters gửi nguyên mã đó; backend vẫn lọc Action bằng so sánh chính xác. All actions/ô trống không lọc Action. Danh sách có trạng thái tải, lỗi/thử lại và rỗng; quyền đọc audit không được mở rộng.

Với sự kiện `targetEntity = UserAccount`, mỗi item bổ sung `targetFullName`,
`targetEmail` (thông tin hiện tại của tài khoản đích) và `targetAccountExists`.
Các trường này không phải snapshot tại thời điểm sự kiện. Tài khoản không còn
tồn tại trả `targetAccountExists = false`, tên/email null; sự kiện trên entity
khác trả cả ba trường null. `targetId` vẫn được giữ để đối chiếu.
Việc bổ sung không thay đổi quyền đọc audit theo role tại thời điểm sự kiện hay policy G10.

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
| POST | `api/users/admin/staff` |
| POST | `api/users/{userId:guid}/resend-activation` |
| PUT | `api/users/{userId:guid}/email` |
| PUT | `api/users/{userId:guid}/role` |
| POST | `api/users/{userId:guid}/lock` |
| POST | `api/users/{userId:guid}/unlock` |
| POST | `api/users/{userId:guid}/deactivate` |

`POST api/users/admin/staff` (SystemAdministrator; `{email, fullName, phone?, roleId, specialties?}`): tạo tài khoản staff **không có mật khẩu**, gửi email kích hoạt (link dùng một lần, 24 giờ). Với Coach (`roleId` 2) bắt buộc `specialties` chứa **ít nhất một môn đang hoạt động**; **một Coach có thể được gán nhiều môn ngay khi tạo tài khoản**. Role khác không được gửi `specialties`. **Manager không tạo được Coach** (không còn `POST api/manager/coaches`): Manager chỉ sửa hồ sơ/chuyên môn (`PUT api/manager/coaches/{id}`).

**Đã đồng bộ:** `UserAdminService.CreateStaffAsync` chấp nhận 1–10 môn khi tạo Coach (không còn trả `coach_single_specialty_required`). Mỗi môn phải đang hoạt động và có dịch vụ `GROUP_COURSE` đang bật; môn Gym (chỉ `MEMBERSHIP_ACCESS`) hoặc môn chỉ thuê sân bị từ chối `400 sport_not_coachable`. Môn thêm sau này tự đủ điều kiện khi bật lớp nhóm, không cần sửa mã. UI chỉ liệt kê các môn đủ điều kiện.

`UserAdminResponse.activationPending` (bool): tài khoản (staff hoặc Member đăng ký tại quầy) chưa đặt mật khẩu và chưa liên kết Google. Hai thao tác dưới đây chỉ dành cho SystemAdministrator và chỉ áp dụng cho tài khoản `activationPending`; Member hoặc staff đã kích hoạt trả **409 `account_not_pending_activation`**.

- `POST api/users/{userId}/resend-activation` (không body): phát hành link mới, vẫn hết hạn tại `CreatedAt + 24 giờ`, vô hiệu link cũ; còn trong 60 giây kể từ lần gửi trước trả **429 `activation_resend_too_soon`**; ghi audit `RESEND_STAFF_ACTIVATION`.
- `PUT api/users/{userId}/email` (`{email, reason}`, lý do 3–500 ký tự): sửa email gõ sai. Email trùng (không phân biệt hoa thường) trả 409 `email_already_exists`, email không đổi trả 400 `email_unchanged`. Link gửi tới email cũ bị vô hiệu ngay (người nhận nhầm không kích hoạt được), link mới gửi tới email mới; ghi audit `CHANGE_PENDING_STAFF_EMAIL` kèm email cũ/mới và lý do.

Đăng nhập Google với email của staff chưa kích hoạt bị từ chối (401), vì staff chỉ vào được sau khi tự đặt mật khẩu bằng link.

`PUT api/users/{userId}/role` (SystemAdministrator; body `{role, reason, sportIds?}`; `sportIds` bắt buộc khi đổi sang Coach). Chỉ đổi **giữa các role staff** (SystemAdministrator, CenterManager, Receptionist, Coach).

Khi tài khoản đã là Coach và `role` vẫn là `COACH`, gửi `sportIds` để lưu chuyên môn (1–10 môn hợp lệ, có GroupCourse). Ghi audit `UPDATE_COACH_SPECIALTIES` kèm lý do và danh sách trước/sau; giữ nguyên phiên đăng nhập và lớp đã phân công, giống cập nhật chuyên môn của Manager. Nếu không gửi `sportIds` hoặc danh sách không đổi thì không ghi thay đổi.

- **Member ↔ Staff không được phép:** đổi từ Member sang bất kỳ role staff nào, hoặc từ staff về Member, trả **409 `member_staff_role_change_not_allowed`**. Người muốn làm staff phải được Admin tạo tài khoản staff bằng **email khác** (`POST api/users/admin/staff`, luồng kích hoạt qua email); tài khoản Member cũ giữ nguyên.
- **Coach → role staff khác:** trả **409 `role_change_blocked`** kèm `reasons: string[]` khi còn lớp chưa kết thúc do Coach làm chính, buổi lớp tương lai còn chiếm lịch (`CoachOccupancy`), hoặc quan hệ huấn luyện Active.
- **Mọi tài khoản hiện là SystemAdministrator:** không được đổi sang role khác, gồm chính Admin đang thao tác và Admin khác, không phụ thuộc số lượng Admin hoặc trạng thái tài khoản (409 `administrator_role_change_not_allowed`). Chỉ gửi lại role hiện tại thì không thay đổi dữ liệu. Quy tắc khóa/vô hiệu hóa Admin cuối cùng vẫn giữ riêng như cũ.

Khi đổi thành công: rời Coach thì giữ `CoachProfile` làm lịch sử nhưng xóa chuyên môn (`UserSportSpecialty`); đổi sang Coach thì Admin phải chọn chuyên môn; `SecurityStamp` đổi nên token cũ mất hiệu lực.

### FrontDeskMembersController — `api/members/front-desk`

Receptionist và CenterManager (policy `FrontDesk`) đăng ký Member mới tại quầy. Chỉ tạo role **Member** (role không nhận từ body); staff chỉ do SystemAdministrator tạo.

| Verb | Path |
|---|---|
| POST | `api/members/front-desk` |
| POST | `api/members/front-desk/{userId:guid}/resend-activation` |
| PUT | `api/members/front-desk/{userId:guid}/email` |

- `POST api/members/front-desk` (`{email, fullName, phone?}`): email nhập **một lần** (không còn `confirmEmail`; gõ sai thì dùng luồng sửa email bên dưới). Tạo Member **không mật khẩu**, tạo ví điểm 0 (BR-134), gửi email kích hoạt (link dùng một lần, 24 giờ, `setup=member`), audit `FRONT_DESK_CREATE_MEMBER`. Trả 201 `UserAdminResponse` với `activationPending=true`. Email trùng (không phân biệt hoa thường) 409 `email_already_exists`; số điện thoại trùng 409 `phone_already_exists`.
- `POST api/members/front-desk/{userId}/resend-activation`: chỉ Member chờ kích hoạt. Cooldown 60 giây (429 `activation_resend_too_soon`), link cũ bị vô hiệu, audit `RESEND_MEMBER_ACTIVATION`.
- `PUT api/members/front-desk/{userId}/email` (`{email, reason}`): sửa email gõ sai khi Member chờ kích hoạt (giống Admin sửa email staff chờ kích hoạt); link cũ bị vô hiệu ngay, link mới gửi tới email mới, audit `CHANGE_PENDING_MEMBER_EMAIL` (email cũ, mới, lý do). 400 `email_unchanged`, 409 `email_already_exists`.
- Member chờ kích hoạt quá **7 ngày kể từ lúc đăng ký** (không có mật khẩu, không liên kết Google) bị gỡ khỏi hệ thống, email được giải phóng, audit `EXPIRE_UNACTIVATED_MEMBER_ACCOUNT` (actor `SYSTEM`, giữ bản ghi đăng ký). Sửa email không kéo dài 7 ngày. Tài khoản đã có hóa đơn, ghi danh, thuê sân, gói hoặc giao dịch điểm **không** bị gỡ vì dữ liệu đó thuộc trung tâm; tài khoản đó tiếp tục chờ kích hoạt. Job `MemberInvitationExpiryJob` chạy mỗi 10 phút. Link kích hoạt vẫn hết hạn sau 24 giờ; hết link thì lễ tân gửi lại.
- Member đã kích hoạt trả 409 `account_not_pending_activation`; tài khoản không phải Member trả 404 `user_not_found`.
- Trước khi kích hoạt Member chưa đăng nhập được bằng mật khẩu nhưng tài khoản Active, nên quầy vẫn tìm (`GET api/users?role=Member`), ghi nhận thanh toán và bán dịch vụ. Member kích hoạt bằng link (đặt mật khẩu qua `POST api/auth/password/reset`) hoặc đăng nhập Google bằng chính email đó.

### Vé Gym 1 ngày (day pass) và mã check-in

- Vé ngày là gói Membership `packageId = 50000`, 1 ngày, seed mặc định 50.000đ bằng migration `GymDayPass`. Mua qua `POST api/checkouts/membership` như gói thường. Manager sửa được giá/tên/mô tả qua `PUT api/membership-packages/50000`; đổi thời hạn trả 409 `day_pass_duration_fixed`, ngừng bán trả 409 `day_pass_fixed`.
- Hiệu lực (quyết định 24/10/2026): chỉ bán từ 06:00 đến trước 22:00 giờ Việt Nam, ngoài khung trả 409 `day_pass_outside_hours`; hết hạn 22:00 cùng ngày mua (`expiresAtUtc` trong `MemberPackageResponse`; `endDate` chỉ là ngày giờ Việt Nam của mốc này; check-in, `isUsable` và job hết hạn đều xét `expiresAtUtc`; không cộng dồn với gói dài). Đã có vé hôm nay mà mua thêm trả 409 `day_pass_already_active`. Gym đang đóng cửa vì sự cố (mọi phòng Gym bị block) trả 409 `gym_closed_today`.
- Thanh toán xong: thông báo và email "SportHub - Your Gym day pass" nhắc vé hết hạn lúc 22:00 cùng ngày. Trong 60 phút cuối trước 22:00 checkout ghi chú Gym đóng cửa lúc 22:00 (cờ `closingSoon`, `closesAtUtc`). Thanh toán thành công sau 22:00 không cấp vé (đi theo `RECONCILIATION_REQUIRED`).
- Check-in: chỉ lễ tân thực hiện qua `POST api/gym-checkins` (Member không tự check-in; endpoint `api/gym-checkins/self` đã gỡ). Mã QR do server cấp và ký: Member gọi `GET api/members/me/checkin-code` (`{code, expiresAtUtc}`, mã dạng `SPORTHUB-CODE:{memberId}.{exp}.{chữ ký}`, hết hạn 00:00 giờ Việt Nam hôm sau, client không tự dựng được); lễ tân/Manager (policy `FrontDesk`) quét mã rồi gọi `POST api/members/checkin-code/resolve` (`{code}`) nhận `{memberId}`; mã giả/sai chữ ký trả 400 `checkin_code_invalid`, mã hết hạn 409 `checkin_code_expired`. Mã chỉ định danh Member; quyền vào Gym vẫn do check-in kiểm gói Active hôm nay.
- Không nhắc hết hạn (`PackageExpiring`), không gia hạn khi sự cố đóng Gym, không hoàn trả (`RefundCalculator` trả 0).
- Báo cáo: `GET api/reports/membership-summary` và `membership-period` không tính vé ngày vào hội viên Membership; thêm `membersWithDayPassToday` và `dayPassesSold`.

### AiController — `api/ai`

| Verb | Path |
|---|---|
| POST | `api/ai/workout-suggestions/{memberId:guid}` |
| POST | `api/ai/chat` |
| GET | `api/ai/logs` |

Workout suggestions include `items: [{ exercise, sets, reps, notes }]` with numeric
sets/reps for each exercise. The existing `exercises: string[]` remains available
for older clients. Timed exercises use reps as the number of holds/rounds;
duration belongs in `notes` (e.g. plank: 3 sets × 1 hold, 30 seconds per hold).
General coaching advice belongs in `rationale`, rather than becoming an exercise.
The editor reads `items` directly and lets the coach adjust values before saving.
The optional `sport` query parameter selects `Gym` (default), `Badminton`, or
`Basketball`; unsupported values return 400. The selected sport is included in
the response and AI log input. Coach ownership (an Active relationship with the member) remains
required. Every generated item includes positive sets/reps, including warm-up
and cool-down. Group coach suggestions include these values in exercise lines.

### HealthController — `api/[controller]`

| Verb | Path |
|---|---|
| GET | `api/[controller]` |

### Coach credentials and awards — `api/coaches`

- Coach-only `GET /api/coaches/me/credentials` lists the current coach's non-deleted documents, including items not displayed publicly. `POST /api/coaches/me/credentials` accepts multipart `file`, `kind` (`CERTIFICATE` or `AWARD`), required `title` (up to 200 characters), optional `issuer` (200), optional ISO `issuedOn`, and `isPublished` (default true). Accepts JPG/PNG/WebP/PDF with matching content signatures, nonempty and at most 10 MiB; at most 20 non-deleted documents per coach. Uploads use backend `CLOUDINARY_URL`, preserve originals, and never use avatar cropping. PDF assets use the raw resource type and include `.pdf` in their public ID. Cloudinary Free accounts may need **Allow delivery of PDF and ZIP files** enabled in Security settings before visitors can open PDFs.
- `PUT /api/coaches/me/credentials/{credentialId}` accepts metadata plus the last returned `version`. Stale edits return `409 credential_changed`. `DELETE` hides the document immediately and removes its Cloudinary asset; failed deletion remains queued in the credential record for the ten-minute cleanup job. Only the owner can edit/delete; another coach gets 404 and non-Coach roles cannot access the self-management endpoints. Successful changes are audited. A failed database write after upload attempts to clean up the unused asset.
- Anonymous `GET /api/coaches/{coachId}/credentials` returns only published, non-deleted documents belonging to a currently Active Coach. Missing, inactive or non-Coach profiles return 404. Response items contain `credentialId,kind,title,issuer,issuedOn,fileName,fileUrl,contentType,sizeBytes,isPublished,version,createdAtUtc`; Cloudinary API secrets and internal `filePublicId` are not returned. Public document links are intended for sharing; turning off display removes them from the profile, not from existing visitors' copies of the public URL. These are coach-provided documents, with no verification status or verification workflow.
- `/api/coaches` adds `credentialCount` counting only publicly displayed documents. The account profile supports upload, edit, hide and removal; public coach profiles show a document gallery with uncropped image viewing and original-file links. Coach hover previews link to that gallery when credentials exist.
- Migration `20261023162010_CoachCredentials` adds the `coach_credentials` table, owner FK, file ID index, publication state, edit version and durable asset-cleanup timestamps. It does not alter existing coach profiles or create sample achievements.

### Avatar Cloudinary — `api/avatars`

Quy tắc nghiệp vụ, quyền xem, xóa ảnh cũ và Google avatar: [AvatarsController](../backend/SportHub.Identity/Api/AvatarsController.cs). `GET /api/users/me`, response đăng nhập và danh sách Coach có `avatarUrl` nullable. Member/Coach/Center Manager tự tải multipart `file` qua `POST /api/avatars/me` (JPG/PNG/WebP, tối đa 5 MiB) và xóa qua `DELETE /api/avatars/me`. `GET /api/avatars/{userId}` chỉ công khai avatar Coach; avatar Member/Manager yêu cầu đăng nhập. Center Manager gỡ trực tiếp ảnh hiện tại của Member qua `DELETE /api/manager/members/{memberId}/avatar`; hệ thống ghi audit và xếp tác vụ dọn ảnh cũ trên Cloudinary. Endpoint này không áp dụng cho ảnh Coach.

### AccountController — `api/users/me`

| Verb | Path |
|---|---|
| GET | `api/users/me` |
| PUT | `api/users/me/profile` |
| POST | `api/users/me/password/otp` |
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
| POST | `api/auth/google/link` |

### MemberPackagesController — `api`

| Verb | Path |
|---|---|
| GET | `api/members/me/packages` |
| GET | `api/members/{memberId:guid}/packages` |
| GET | `api/member-packages` |

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
| GET | `api/notifications/inbox?unreadOnly=false&search=&page=1&pageSize=25` |
| GET | `api/notifications/{notificationId:guid}` |
| GET | `api/notifications/unread-count` |
| POST | `api/notifications/{notificationId:guid}/read` |
| POST | `api/notifications/read-all` |

Inbox and detail are available to every authenticated role and return only the current user's InApp messages; email/OTP payloads are never exposed. Inbox returns `{items,totalCount,page,pageSize}`, newest first; `page` is 1–100000, `pageSize` is 1–50 and `search` is at most 150 characters. Search matches message text and the subject of a linked manual notice. The original list endpoint retains its latest-100 behavior for the bell preview. Notification DTOs additionally include nullable `title` and `senderName` from a referenced manual notice's send-time record; system events use the UI's event label and SportHub sender. Detail returns 404 for missing, other-user or non-InApp IDs. Reading detail does not change its status; the UI sends the existing read command after opening it.

The bell opens `/notifications?message=<notificationId>` for all messages, including those without `actionUrl`. The inbox presents full text before a separate related-action link, constrained to the recipient's role workspace. Unread/read state is persisted through the existing commands and synchronized with the bell; a failed read receipt leaves the message readable and offers retry. Browser Back/Forward restores the selected message, filter, search and page. No migration is required.

`COACH_ATTENDANCE_REMINDER` is an InApp end-of-day summary for an active Coach with missing attendance in ended, actionable sessions. The minute worker queues at most one message per Coach/Vietnam-local day after 22:00 by default (`CoachAttendanceReminders:HourLocal`). It can catch up yesterday after downtime, only within each session's 24-hour attendance window. The message lists affected classes/sessions, missing entry counts and deadlines; its `actionUrl` is `/coach/schedule` and the inbox action is **Complete attendance**. The existing notification receipt, unique event/recipient/source index and producer lock prevent repeat messages across retries/restarts/replicas. It never records absence or sends email; no new migration or public endpoint is required.

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

Enrollment is opened automatically in the publish transaction. The final confirmed, paid enrollment closes the class at capacity. A withdrawn enrollment reopens a class that was automatically closed as full only if its first session has not started. Active checkout holds still count against availability, and releasing or expiring a hold does not require a Manager action. The Manager UI no longer exposes manual enrollment controls. Existing published, upcoming classes are normalized by the AutomaticClassEnrollment data migration.

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

### MemberCheckInCodesController — `api/members`

| Verb | Path |
|---|---|
| GET | `api/members/me/checkin-code` |
| POST | `api/members/checkin-code/resolve` |

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


## Phần B — Contract đích theo chặng

| Chặng | Trạng thái | Ghi chú |
|---|---|---|
| P1.01–P1.02 Ports/model/migration | Hoàn tất backend | Typed FK và snapshots; giữ lịch sử, nâng cấp và DB trắng qua gate. |
| P1.03–P1.05 Identity/catalog/course/Gym | Hoàn tất backend | Phần C/D/F; JSON enum theo quy ước chốt ở đầu tài liệu. |
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
| GET | `api/sports?service=` | ẩn danh | — | `SportResponse[]` chỉ môn active, mỗi môn chỉ gồm service đang bật, không có `readiness`. `service` lọc theo `MEMBERSHIP_ACCESS`, `GROUP_COURSE`, `COURT_RENTAL`. `SportResponse`: `{sportId, code, name, description, imageUrl, sortOrder, isActive, services[{serviceType,isEnabled,defaultSessionMinutes?,defaultMaxCapacity?}], readiness?[{serviceType,ready,missing[]}]}` với `missing` gồm `room_type`, `room`, `opening_hours`, `court_rate`. CAT-01: không còn `operationType`. |
| GET | `api/manager/sports?service=` | M | — | mọi môn, đủ service và `readiness` (chỉ GROUP_COURSE và COURT_RENTAL) |
| POST | `api/manager/sports` | M | `{code, name, description?, imageUrl?, services[{serviceType,isEnabled,defaultSessionMinutes?,defaultMaxCapacity?}]}` | 201; 400 `sport_code_invalid` `service_type_invalid` `service_not_allowed_for_sport` (Membership ngoài môn Gym) `sport_group_course_defaults_required` `service_defaults_not_allowed`; 409 `sport_code_taken` `sport_name_taken` |
| PUT | `api/manager/sports/{id}` | M | như trên, không nhận đổi `code`. Service không liệt kê bị TẮT, không bị xóa | 200; 400 `sport_code_immutable` và các lỗi như trên; 404 `sport_not_found` |
| POST | `api/manager/sports/{id}/deactivate`, `/activate` | M | — | `SportResponse` |
| POST | `api/manager/sports/{id}/services/{serviceType}/enable`, `/disable` | M | — | `SportResponse`; 404 `service_not_configured`. Tắt chỉ chặn giao dịch mới |
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
| GET | `api/manager/room-blocks?roomId&fromUtc&toUtc` | FD | — | `RoomBlockResponse[]`; chỉ `roomId` không kèm ngày: tất cả block chưa kết thúc của sân; truy vấn lịch: mặc định 31 ngày, tối đa 62 |
| POST | `api/manager/room-blocks` | M | `{roomId, startAtUtc, endAtUtc, reason}` | 201; **409 `occupancy_conflict` + `conflicts[]`** `{resource, conflictSourceType, conflictSourceId, startUtc, endUtc}`; 400 `block_in_the_past` `invalid_range` |
| PUT | `api/manager/room-blocks/{blockId}` | M | `{roomId, startAtUtc, endAtUtc, reason}` | 200 `RoomBlockResponse`; sửa thời gian/lý do trên cùng sân, giữ nguyên ID; kiểm tra occupancy và cập nhật nguyên tử; 409 `occupancy_conflict`, `room_block_from_incident`, `room_under_incident_review`; không thành công giữ block cũ |
| DELETE | `api/manager/room-blocks/{blockId}` | M | — | 204; 409 `room_block_from_incident` |
| GET | `api/court-rates?roomTypeId` | Auth | — | khung giá active |
| GET | `api/manager/court-rates?roomTypeId` | M | — | gồm cả inactive |
| POST, PUT | `api/manager/court-rates`, `.../{rateId}` | M | `{roomTypeId, sportId?, daysOfWeek["MON".."SUN"], startTimeLocal, endTimeLocal, pricePerHour, isActive}` | 400 `invalid_price` `invalid_rate_window` `invalid_days` `sport_not_compatible`; 409 `court_rate_overlap` |
| DELETE | `api/manager/court-rates/{rateId}` | M | — | 204 |

CourtRate audit snapshots (`CREATE_COURT_RATE`, `UPDATE_COURT_RATE`, `DELETE_COURT_RATE`) contain `roomTypeId`, `roomTypeName`, nullable `sportId`/`sportName`, `days` (comma-separated day codes), `startTimeLocal`/`endTimeLocal` (`HH:mm`, Vietnam local time), `price` and `active`. Names and times are recorded at the event; historical snapshots are not backfilled from the current catalog. Older snapshots may omit names/times. Updates preserve both old and new snapshots; create has only new, delete only old. No schema migration or pricing request/response changes.
| GET | `api/availability/rooms?sportId&startUtc&endUtc` | Staff | — | `[{roomId,name,roomTypeId,capacity}]`; khoảng tối đa 12 giờ |
| GET | `api/availability/coaches?sportId&startUtc&endUtc&excludeSessionId?` | Staff | — | `[{coachId, fullName}]` |
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
| POST | `api/wallets/{ownerId}/adjustments` | Manager | `{idempotencyKey:guid, points:int>0, direction:"CREDIT"|"DEBIT", reason}`. Credit trả 202 và `PointCreditRequestResponse` trạng thái Pending, chưa cộng ví; Debit trả 200 `WalletResult` và chỉ trừ available. Cùng key khác payload → 409. |
| GET | `api/point-credit-requests?status=Pending&page=1&pageSize=20` | Manager | `PagedResult<PointCreditRequestResponse>` gồm người nhận, người yêu cầu, điểm, lý do, trạng thái và tên/email hiện tại để người duyệt kiểm tra. |
| POST | `api/point-credit-requests/{requestId}/approve` | Manager khác người yêu cầu | Chỉ yêu cầu Pending của Manager còn hiệu lực; cộng điểm, lưu ledger và audit trong cùng transaction. Retry của cùng người duyệt không cộng lại. |
| POST | `api/point-credit-requests/{requestId}/reject` | Manager khác người yêu cầu | `{reason}` 3–500 ký tự; đóng yêu cầu, không cộng điểm. |
| GET | `api/invoices/{invoiceId}/point-selection` | Chủ invoice hoặc Receptionist | `{invoiceId, memberId, pointsApplied, cashAmount, holdExpiresAtUtc, status, revision}`; Receptionist chỉ xem Member, có audit |
| POST | `api/invoices/{invoiceId}/point-confirmations` | Receptionist | `{memberId, points:int>0, revision:int}`; trả `{confirmationId, invoiceId, memberId, points, expiresAtUtc, holdExpiresAtUtc, status:"Pending", revision}` |
| POST | `api/point-confirmations/{confirmationId}/verify` | Lễ tân đã yêu cầu mã | `{code:"6 digits"}`; trả PointSelectionResponse, status `Confirmed`; giữ điểm đúng một lần |
| POST | `api/invoices/{invoiceId}/point-confirmations/clear` | Receptionist | `{memberId, revision}`; release điểm của cycle cũ, vô hiệu OTP, tăng revision; dùng khi bỏ chọn/đổi Member tại UI |
| POST | `api/wallet/me/checkouts/{invoiceId}/points` | Member | `{points:int>=0}`; 0 = bỏ điểm; invoice phải thuộc JWT subject, không nhận owner từ client, không cần OTP |

Ledger trả `id, entryType, points, availableDelta, heldDelta, availableAfter, heldAfter, referenceType, referenceId, note, createdAtUtc`. Entry types: `HOLD/RELEASE/SPEND/EARN/ADJUSTMENT`. Actor được lưu ở ledger; không có endpoint rút/chuyển điểm. Nạp điểm chỉ qua `POST /api/checkouts/wallet-top-up` (Member, hoặc Receptionist nạp hộ); tặng điểm chỉ qua CREDIT của Manager.

Cột **Tham chiếu** trên lịch sử điểm hiển thị `referenceType · referenceId`: loại và mã nguồn của giao dịch, không phải mã chủ ví hay ID dòng ledger. Với `ManagerAdjustment`, `referenceId` là `idempotencyKey` của yêu cầu điều chỉnh; Credit chỉ có ledger sau khi Manager thứ hai duyệt. Retry cùng key/payload dùng lại kết quả, không cộng/trừ hay ghi audit lần nữa. `id`/`ledgerEntryId` là ID bút toán riêng. Ví dụ nguồn khác: `RefundRequest` (yêu cầu hoàn), `SystemEvent` (hoàn do sự kiện hệ thống), `Invoice`/`CheckoutSession` (hóa đơn/chu kỳ checkout tùy luồng).

Manager mở/xem ví không ghi `VIEW_OWNER_WALLET` hoặc `VIEW_MEMBER_WALLET`. Credit ghi `REQUEST_POINT_CREDIT`, sau đó `APPROVE_POINT_CREDIT` hoặc `REJECT_POINT_CREDIT`; Debit thành công ghi `ADJUST_POINTS`. Validation/thất bại/retry đã áp dụng không sinh thêm log điều chỉnh. Các log xem ví đã ghi trước thay đổi vẫn giữ nguyên lịch sử. Quyền truy cập và audit xem ví của Receptionist không đổi.

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

## Phần F — P1.05 Lớp theo khóa, điểm danh và Gym

| Verb | Path | Actor | Hành vi chính |
|---|---|---|---|
| GET | `api/classes`, `api/classes/{classId}` | Public | Chỉ `Published`, không trả chi phí/ngưỡng nội bộ; giá và chỗ còn theo cả khóa. |
| GET/POST/PUT | `api/manager/classes`, `api/manager/classes/{classId}`, `api/manager/classes/{classId}/publish`, `.../cancel` | Manager | Soạn Draft; publish khóa + đủ buổi + occupancy + audit + thông báo Coach cùng transaction; hủy với preview/refund/hold release theo bổ sung P2.06–P2.10 đầu tài liệu. |
| GET | `api/classes/{classId}/sessions`, `api/class-sessions/{sessionId}`, `.../roster` | Nhân viên; Coach đúng lớp | Buổi của cả khóa và roster Confirmed; Coach chỉ đọc lớp được giao. |
| POST | `api/class-sessions/{sessionId}/reschedule`, `.../cancel` | Manager | Kiểm lại room/coach/opening/capacity/lịch Member; hủy buộc có buổi bù hợp lệ. |
| PUT | `api/class-sessions/{sessionId}/attendance/{enrollmentId}` | Receptionist | `{status:"Present"|"Absent"}`; từ 5 phút trước đầu buổi đến hết 24 giờ sau cuối buổi; ghi audit khi thay đổi. |
| GET | `api/members/me/enrollments`, `.../schedule` | Member | Ghi danh và lịch cá nhân; không có endpoint tự ghi danh từng buổi. |

`IClassEnrollmentFulfillment` cung cấp quote, giữ chỗ, confirm, release và cancel trong transaction của checkout/fulfillment caller. Lớp nhóm không tự tạo Present/Absent; điểm danh do Receptionist hoặc Coach được phân công ghi.

## Phần G — P1.07 Checkout hiện hành

| Verb | Path | Actor | Hành vi |
|---|---|---|---|
| POST | `api/checkouts/membership`, `api/checkouts/class` | Member, Receptionist, Manager | Bắt buộc `Idempotency-Key`; staff chỉ định `targetMemberId`, Member chỉ mua cho mình. Trả CheckoutResponse với invoice/cycle/hạn/số tiền. PT 1:1 không thuộc phạm vi hiện hành. |
| GET | `api/checkouts/{invoiceId}` | Chủ invoice hoặc staff | Trạng thái chu kỳ checkout hiện tại. |
| POST | `api/checkouts/verify-reference` | Chủ checkout hoặc staff | Body `{reference}` lấy từ `vnp_TxnRef` trên Return URL. Backend kiểm ownership rồi gọi QueryDR cho đúng attempt; chỉ phản hồi VNPay đã xác minh mới cập nhật payment. Trả CheckoutResponse mới nhất. Rate limited. |
| POST | `api/checkouts/cancel-reference` | Chủ checkout hoặc staff | Body `{fields}` là toàn bộ query của Return URL. Backend kiểm ownership và chữ ký VNPay; chỉ khi `vnp_ResponseCode=24` (khách hủy) mới đóng attempt `Pending` (chưa có verified event) thành `Failed/Cancelled` để lần thanh toán sau tạo `vnp_TxnRef` mới. Hóa đơn vẫn `Issued` đến khi hết hạn. Sai chữ ký → 400, mã khác 24 → 409. Rate limited. |
| POST | `api/checkouts/{invoiceId}/attempts` | Chủ invoice hoặc staff | Tạo/đọc PaymentAttempt snapshot tiền/điểm và URL VNPay; 100% điểm hoàn tất ngay, không tạo attempt VNPay 0đ. |
| POST | `api/checkouts/{invoiceId}/cancel`, `.../retry` | Chủ invoice hoặc staff | Hủy nhả hold; retry sau hết hạn cấp invoice/cycle mới và `Idempotency-Key` mới. |
| GET | `api/payments/vnpay/return`, `api/payments/vnpay/ipn` | Public (VNPay) | Return chỉ đọc; IPN xác minh chữ ký/tham chiếu/số tiền rồi lưu event và thực hiện fulfillment. |
| POST | `api/invoices/{invoiceId}/reconcile` | FrontDesk | QueryDR xác minh giao dịch theo attempt mới nhất. |
| POST | `api/dev/payments/{reference}/simulate` | FrontDesk, Development | Mock callback qua cùng pipeline IPN; không có ở môi trường khác. |

Lỗi truyền tải QueryDR trả `502 vnp_query_http_error` (message chứa HTTP status upstream), `502 vnp_query_connection_failed`, `502 vnp_query_invalid_response` hoặc `504 vnp_query_timeout`. Đây là lỗi xác minh, không phải kết luận giao dịch thất bại. Không trả raw response, chữ ký hoặc secret của gateway; chữ ký, merchant, reference và số tiền vẫn phải được xác minh trước khi ghi payment.

Request QueryDR gửi `User-Agent: SportHub/1.0` và `Accept: application/json`. Kiểm tra sandbox ngày 15/10/2026 cho thấy cùng POST JSON rỗng nhận HTTP 403 với HttpClient không có User-Agent, và HTTP 200 kèm JSON lỗi nghiệp vụ khi có header này; probe rỗng chỉ kiểm tra khả năng truy cập, không xác nhận một giao dịch thanh toán.

Route ghi payment thủ công không còn tạo khoản thu mới. `PAID_AFTER_RECONCILIATION` biểu thị khoản thu muộn, cần đọc `fulfillmentOutcome`: `FULFILLED` khi reacquire/cấp quyền lợi được; `COMPENSATED` khi bồi hoàn điểm; `RECONCILIATION_REQUIRED` khi không thể đổi chính xác tiền thực thu sang điểm. Khi hold lớp hết hạn, thanh toán kết hợp điểm và VNPay không được tự tái giữ chỗ; hệ thống nhả điểm đã giữ và bù phần tiền VNPay thực thu vào ví theo 1.000đ/điểm. Hóa đơn đã đóng không còn số tiền cần thanh toán (`outstanding = 0`), còn `totalAmount` giữ nguyên giá trị đơn ban đầu. `CheckoutSession` và `VerifiedGatewayEvent` giữ lịch sử/idempotency. CourtRental dùng `/api/checkouts/court-rental`.

## Phần H — P1.08 Refund bằng điểm

Refund dùng `PaymentAdjustment` hiện có, không thêm bảng Refund; refund mới có `InvoiceItemId`, `SystemCalculatedPoints`, `ApprovedPoints`, `CenterFault` và ledger reference. `Amount`/`RequestedAmount` là 0 cho refund mới, để không bị tính nhầm thành tiền hoàn trong báo cáo legacy. Approval ghi `Completed`, cộng điểm vào ví và hủy entitlement trong cùng transaction. Không có xác nhận chi tiền hay VNPay refund.

| Verb | Path | Actor | Hành vi mục tiêu |
|---|---|---|---|
| GET | `api/refunds?status=&invoiceId=&invoiceItemId=&page=&pageSize=` | Receptionist, Manager | Trả item, điểm tính/duyệt, ledger reference và trạng thái. |
| POST | `api/refunds` | Item owner (Member), Receptionist, Manager | Body `{invoiceItemId, reason}`; item owner chỉ yêu cầu item của mình. Server tính điểm, không nhận điểm từ client. |
| POST | `api/refunds/{adjustmentId}/approve` | Manager khác người yêu cầu | Body `{centerFault, percent?, reason}`. `percent` (0–100) chỉ được giảm so với số điểm hệ thống tính lại cho dịch vụ, không được vượt cap; cần căn cứ ≥ 10 ký tự. Bỏ trống thì theo quy tắc. Khóa invoice/item/refund; Earn + hủy quyền lợi + Completed nguyên tử. |
| POST | `api/refunds/{adjustmentId}/reject` | Manager khác người yêu cầu | Body `{reason}`; từ chối yêu cầu chưa xử lý. |

Đã có calculator cho Membership (50% khi RemainingDays×3 >= TotalDays×2; lỗi trung tâm theo phần ngày chưa dùng; vé Gym 1 ngày không hoàn), Class (trước buổi đầu 100%, center cancellation theo buổi chưa cung cấp, loại buổi hủy đã có buổi bù khỏi tỷ lệ), Rental (>=24h 100%, dưới 24h 0, center cancel 100%). Quy đổi trên giá trị item đã trả gồm cash + points trừ refund trước, floor VND/1.000. `RefundCreditService` hỗ trợ SystemEvent credit, threshold/incident/rental caller và ghi InvoiceItemId trên ledger.

Membership theo BR-91 tính cả ngày đầu/cuối: `TotalDays = EndDate − StartDate + 1`, `RemainingDays = clamp(EndDate − RefundRequestedDate + 1, 0, TotalDays)`, theo ngày Việt Nam. "Đã dùng quá mức" ở Membership là đã qua hơn 1/3 thời hạn, không tính số lần tới Gym hoặc số buổi còn lại. Gói gia hạn chưa bắt đầu vẫn được xét hoàn chuẩn tối đa 50%; gói Expired/Cancelled không có điểm hoàn. Khi duyệt, dùng ngày tạo yêu cầu, không thay bằng ngày duyệt. Ngoại lệ Center Fault cần lý do và căn cứ, hoàn theo phần ngày chưa dùng. Theo quyết định 25/10/2026, đóng Gym tạm thời để sửa chữa không gia hạn Membership và không phải refund Membership; Manager chọn người bị ảnh hưởng và đề xuất tặng điểm theo luồng CREDIT có Manager khác phê duyệt. API sự cố hiện vẫn nhận `membershipExtensionDays` và tự gia hạn; đây là khoảng trống triển khai, không phải hợp đồng đích.

Trong luồng **refund** Membership, Manager không nhập số điểm tùy ý: chỉ chọn center-fault có lý do rồi server tính lại theo cap. Khoản **tặng điểm do sự cố Gym tạm thời** ở trên là luồng CREDIT riêng; Manager được đặt số điểm cho từng người nhận và Manager khác phải duyệt trước khi cộng ví. PostgreSQL gate cho refund/cap/concurrency/rollback và migration upgrade đã qua; xem evidence.

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
| GET | `api/court-rentals/availability` | Member | `sportId,startUtc,endUtc`; chỉ phòng trống + giá, không trả lịch Member/lớp. |
| GET | `api/court-rentals/mine` | Member | Rental của chính người gọi, lọc `fromUtc/toUtc`. |
| POST | `api/court-rentals/{rentalId}/cancel` | Chủ rental | Self-cancel theo ngưỡng setting 24 giờ; trả 204. |
| GET | `api/manager/court-schedule/rentals` | FrontDesk | Rental theo khoảng thời gian/phòng; lịch tổng hợp dùng `/api/manager/court-schedule`. |
| POST | `api/manager/court-rentals/{rentalId}/cancel` | Manager | `{reason}`; center-fault cancel/refund 100% điểm. |
| POST | `api/manager/incidents/preview`, `api/manager/incidents/resolve` | Manager | `IncidentRequest` gồm scope, room/time, lý do; resolve kiểm tra tác động lại, rental cancel/refund + block nguyên tử; lớp chồng thời gian trả conflict để xử lý lịch trước. |
| POST | `api/manager/notices` | Manager | `{subject,message,recipientUserIds,sendInApp,sendEmail}`; in-app/email vào outbox theo người nhận, giới hạn 1–200 người. |

Email không xuất hiện trong danh sách/read-all InApp. OTP email được mã hóa ở outbox và gửi bởi dispatcher; status email Sent chỉ sau sender thành công, retry có backoff/lease và gửi at-least-once.

`GET /api/reports/revenue` giữ các field legacy, đồng thời thêm `legacyCashCollected`, `reconciliationCashCollected`, `reconciliationCashCount`, `pointsRedeemed`, `pointsRedeemedVnd` (điểm×1.000 VND), `pointsIssued` (mọi khoản điểm cộng vào ví: hoàn điểm + bù cổng thanh toán), `pointsRefunded` (chỉ phần hoàn điểm: yêu cầu hoàn, huỷ do trung tâm, chênh lệch chuyển lớp; tập con của `pointsIssued`), `managerPointAdjustment`, `outstandingPoints` (available+held tại lúc chạy), và `bySource[{source,cashCollected,pointsRedeemed}]`. Daily rows thêm `legacyCashCollected` và `reconciliationCashCollected`; từ 24/10/2026 thêm `bankRefundPaid` và `bankRefundCount` (tiền hoàn chuyển khoản Manager ghi nhận qua Support Request, theo ngày ghi payout giờ VN; dòng riêng, không trừ vào `totalCollected`/`netRevenue`, không cộng vào `pointsRefunded`; daily row có `bankRefundPaid`; export thêm cột cùng tên); `totalCollected` cộng cả cash reconciliation đã xác minh để đối soát. Group-by-Sport và export dùng cùng tổng hợp theo phần P1.12/P1.13 bên dưới.

Lịch phòng tổng hợp và incident workflow hiện hành được mô tả ở bản chốt đầu tài liệu; PostgreSQL concurrency/privacy đã qua gate. Manager cần chọn phương án dời/hủy/bù hợp lệ trước khi resolve incident có lớp.
# Contract báo cáo và tích hợp


| Verb | Route | Actor | Hợp đồng |
|---|---|---|---|
| GET | `/api/reports/revenue?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD&sportId=&source=&memberId=` | CenterManager | Optional dimension filters apply to totals, daily rows, `bySource` and `bySportAndSource` together. Dimensions contain `source`, nullable `sportId/sportName/memberId`, `cashCollected`, `legacyCashCollected`, `pointsRedeemed`. Cash rows sum to `totalCollected`, including Reconciliation and LegacyUnclassified exactly once. |
| GET | `/api/reports/court-rental-revenue?fromDate=...&toDate=...` | CenterManager | `{fromDate,toDate,rows}`; lấy các dòng Rental của cùng bộ tổng hợp doanh thu, theo ngày thực thu VN. |
| GET | `/api/reports/membership-period?fromDate=...&toDate=...` | CenterManager | Existing period fields plus `membersPurchasingMembershipInPeriod`, `dayPassesSold`, `daily[{date,buyers}]`. Buyers are unique members with paid Membership invoices, excluding day passes; daily buyers are distinct within each Vietnam day and may repeat across days. Day passes count paid linked passes with Active/Expired status by invoice payment date. Legacy passes without payment evidence do not count as sold. |
| GET | `/api/reports/class-enrollment?fromDate=...&toDate=...&sportId=3` | CenterManager | `activeHoldCount` chỉ đếm Active có expiry lớn hơn server clock; `availableSeats=capacity-confirmed-activeHold`. |
| POST | `/api/reports/exports` | Theo policy export hiện hữu | `{reportType,fromDate,toDate,columns,format:"Csv" hoặc "Pdf",sportId?:3}`. `sportId` áp dụng cho `CLASS_ENROLLMENT`. |

Các loại export mới:

- `REVENUE_DAILY`: `date,collectedAmount,refundedAmount,obligationReduction,netCollected,legacyCashCollected,reconciliationCashCollected`.
- `REVENUE_DIMENSIONS` / `COURT_RENTAL_REVENUE`: `source,sportId,sportName,memberName,memberId,collectedAmount,legacyCashCollected,pointsRedeemed,pointsRedeemedVnd`. Manager chọn cột `memberName` (Member) để xuất tên hội viên trong CSV/PDF. `memberId` (Member ID) còn được API hỗ trợ để tương thích; bộ lọc vẫn dùng ID. Tên đọc từ hồ sơ tại thời điểm xuất, truy vấn chung cho các hội viên trong kết quả; không thay đổi cách nhóm hay tổng tiền/điểm. Dòng `memberId = null` để trống tên, không gán một hội viên cho dòng tổng hợp. Nếu có ID nhưng thiếu tên, hiện `Name unavailable`. File đã xuất giữ nguyên dữ liệu tại thời điểm tạo.
- `MEMBERSHIP_PERIOD`: `fromDate,toDate,newMembers,membersPurchasingMembershipInPeriod,activeMembersAtPeriodEnd`. `newMembers` đếm tài khoản Member tạo trong kỳ. `membersPurchasingMembershipInPeriod` đếm MemberId riêng biệt trên hóa đơn có InvoiceItem Membership, đã fulfillment thành công (`Paid` hoặc `PaidAfterReconciliation` với `PaidVia=VnPayAfterReconciliation`), theo `Invoice.PaidAtUtc` trong kỳ theo ngày Việt Nam; bao gồm thanh toán bằng điểm, không tính giao dịch chỉ bù điểm và không dùng ngày dự phòng khi PaidAtUtc null.
- Overview dùng `GET /api/reports/membership-summary?asOfDate=YYYY-MM-DD` với ngày hôm nay theo giờ Việt Nam cho **Active Gym members**: số Member riêng biệt có gói Active với `StartDate <= asOfDate <= EndDate`, loại vé ngày, PendingPayment, Expired và Cancelled. Không phải số người đến trung tâm hay số người có gói từng hiệu lực trong tháng. Giữ nguyên báo cáo Membership theo kỳ và các cột export hiện có.
- `GET /api/reports/class-status` is CenterManager-only. Optional `fromDate` and `toDate` (both or neither, up to 366 inclusive days) filter class start dates; optional `sportId` filters sport. It returns `{open,completed,unpublished,classes[]}`. Each class has `classId,name,sportId,sportName,startDate,status,capacity,confirmedCount,thresholdStatus`. Open = Published + InProgress; Completed = Completed; Unpublished = Draft; Cancelled excluded. Without dates, Overview retains the existing all-classes meaning. Enrollment sums confirmed seats/capacity over non-Draft classes; unpaid seat holds are excluded. Comparing periods compares start-date cohorts using current statuses, not historical snapshots.
- `CLASS_ENROLLMENT`: `classId,code,name,sportId,sportName,status,capacity,confirmedCount,activeHoldCount,availableSeats,fillRatio,breakEvenThreshold,thresholdStatus,firstSessionStartUtc`.

`REVENUE` cũ vẫn là danh sách hóa đơn theo ngày phát hành; không dùng loại này để so với tổng thu theo ngày thanh toán. `MEMBER_SUMMARY` cũ giữ tương thích. Export mới gọi cùng service API, không nhân bản truy vấn tài chính. Phạm vi doanh thu tối đa 366 ngày, trả `range_too_large`; report export thất bại giữ trạng thái Failed và failure reason theo contract hiện hữu. Điểm không cộng thành cash; outstanding là available+held hiện tại. Membership sport null; item chưa có sport reference chỉ được phân loại khi có đúng một môn OneOnOne.

- `REVENUE_SUMMARY`: `fromDate,toDate,collectedAmount,refundedAmount,netCollected,legacyCashCollected,reconciliationCashCollected,pointsRedeemed,pointsRedeemedVnd,pointsIssued,managerPointAdjustment,outstandingPoints`.

Report presentation: `pointsRedeemed` is the number of points spent in the selected period; `pointsRedeemedVnd` is its VND equivalent, never additional cash revenue. `pointsIssued` counts every wallet credit in the period (refunds and gateway compensation); `pointsRefunded` counts refund credits only. Neither is cash, and `netRevenue`/`netCollected` = cash collected − cash refunds, so it excludes point movements and is not total revenue. Manager adjustments remain separate. Current wallet balance (`outstandingPoints`, available + held) is shown separately from period movements. `/api/reports/revenue` also returns `outstandingPointsAsOfUtc`, the UTC observation time of that current balance; `REVENUE_SUMMARY` supports this optional export column. It is not a historical closing balance. The legacy period response retains `activeMembersAtPeriodEnd`; the Reports dashboard instead labels Active Gym members using the separate summary for today. Legacy `REVENUE` is titled "Invoices by issue date". Legacy `refundedAmount` and `netCollected` retain their existing numeric semantics but PDF labels explicitly identify cash refunds and exclude point refunds; the main Manager export column picker does not present these legacy columns. Existing exported files remain unchanged.

## Manager operations read contracts

- `GET /api/audit-logs` accepts optional `targetId` together with `targetEntity` (the UI's Target filter). `targetEntity` uses case-insensitive substring matching with SQL `LIKE '%term%'`; surrounding whitespace is trimmed and `%`, `_`, and `\` in user input are treated literally. For example, `court` matches `CourtRate` and `CourtRental`. `targetId` remains an exact match. Both filters apply before pagination/count. Visibility uses event-time actor roles: Admin reads Manager/Admin/Coach/System events, Manager reads Manager/Receptionist/Coach/Member events. Member/Coach/Receptionist cannot gain audit access through these parameters.
- `GET /api/manager/sports` service rows include the actual `offeringId`. The client must not derive an offering ID from a sport ID. Public `GET /api/sports` omits `offeringId`.
- This adds no migration and implements no new G03/G06/G07/G13 command. Current incident preview/action/recheck/resolve remains a sequence of separate operations; timeout resolve requires reconciliation before a fresh attempt.

## Audit target display context

`GET /api/audit-logs` adds optional `currentTargetLabel` and `referenceNames` (`Entity:ID` → current display name) for visible Admin and Manager results. Names are resolved only for targets and allowed references on the filtered, paginated page, with one bounded query per relevant entity type. Both readers keep the existing target-account fields. Display resolution does not bypass event-role visibility or grant access to operational detail endpoints.

The Manager UI prefers recorded identity (`name`, `targetName`, court-rate room-type name, notification subject or report type). If no identity was captured, it displays the current label and marks it as current. Missing/deleted/invalid targets retain their type and ID with an unavailable-name message. Reference names are also current display context, not historical evidence. Neither `oldValue` nor `newValue` is rewritten or backfilled. Changed prices, statuses, times, capacities and other operation values come exclusively from the event.

Metadata uses an explicit field allowlist, localizes labels, compares recorded values, and understands legacy arrays for room opening hours and room-type sport links, PascalCase service fields, and `{value, reason}` wrappers. Unknown objects and secret fields are omitted. Empty details explicitly state that no details were recorded. Legacy missing values are shown as not recorded, never inferred from the current entity.

New sport snapshots include name/code, description/image URL, activity/order and service duration/capacity; activity changes record name/code as well. Service compatibility logs include both previous and next room-type lists. Opening-hours and room-type compatibility snapshots now record the room/type name and their arrays. Room-block creation/deletion snapshots record the room name, room ID, start/end time and reason. Report export audits record the report type alongside the original parameters. These payload additions do not alter the operations themselves and require no audit-table migration.

## Automatic sport display order


`sortOrder` remains in `SportResponse` but is no longer a create/update input. Legacy requests containing `sortOrder` are ignored. The backend assigns consecutive positive ranks `1..N` across all sports: active first, inactive last. Creating or reactivating a sport appends it to the active group; deactivating appends it to the inactive group and compacts the ranks. Repeating activate/deactivate has no effect on position. Editing a name or service does not move the sport. Manager status/search filters preserve these global ranks; they do not renumber filtered results. Public/member lists include only active sports. Create and activity changes are serialized in one database transaction, including audit writes. No sport deletion or changes to sport IDs/codes are introduced.

Migration `20261007110000_AutomaticSportOrder` normalizes negative, duplicate and sparse legacy ranks while preserving prior relative order within each activity group (`sortOrder`, name, ID). Historical audit snapshots are unchanged.

## Manager class-slot preview

`GET /api/manager/class-schedule/availability` is Manager-only. Query: `sportId`, `roomId`, `coachId` (optional), positive `capacity`, UTC `startUtc`/`endUtc`, optional `excludeSessionId`. The slot must have positive duration and be at most 12 hours. Response:

```json
{"available":false,"roomName":"Court A","coachName":"Coach Linh","reasons":["outside_opening_hours","coach_busy"]}
```

Reasons: `sport_inactive`, `room_not_found`, `room_inactive`, `room_incompatible`, `room_capacity_exceeded`, `outside_opening_hours`, `room_busy`, `coach_required`, `coach_inactive`, `coach_specialty_mismatch`, `coach_busy`. Names describe current records. The room must cover the entire slot under Vietnam-local opening hours. Both room and coach occupancy use overlapping active reservations across all source types.

`excludeSessionId` must identify an existing Scheduled class session belonging to the requested sport; otherwise the endpoint returns `400 invalid_preview_session`. It excludes only occupancies whose source type is ClassSession and source ID is that session, allowing review of its replacement without treating its existing reservation as a conflict. Other reservations remain checked. Missing sport returns `404 sport_not_found`; invalid duration/capacity returns `400`.

Coach-list availability also accepts excludeSessionId: it must identify a Scheduled class session of the same sport (400 invalid_preview_session otherwise). Only that source’s ClassSession occupancy is excluded; other overlaps still count. Both availability endpoints are advisory. This endpoint does not reserve resources, change sessions, write audit events or require a migration. It checks resource availability, not all final command rules. Publish/reschedule/makeup still validate lifecycle, students, dates and occupancy in their existing transactions. The frontend also marks overlaps within the proposed draft as `draft_overlap`; that is a local validation code, not an API reason. Existing `/api/availability/rooms`, `/coaches` and room-busy contracts are unchanged.

## Coach yêu cầu thay đổi buổi học lớp nhóm

Phạm vi đã chốt: Coach chỉ gửi báo vắng `{type:"ABSENCE",reason}` và rút báo vắng `PENDING`; không có thao tác sửa báo vắng hoặc đề xuất phương án từ Coach trên giao diện hiện hành. Center Manager chọn dạy thay, dời lịch hoặc hủy kèm học bù, kiểm tra lại Coach thay đang Active, đúng chuyên môn và còn trống trong toàn bộ buổi trước khi lưu. JWT xác định Coach thao tác; `sessionId` là ID buổi để kiểm tra phân công. Lịch và trạng thái yêu cầu cập nhật nguyên tử. Các API yêu cầu hiện có và dữ liệu lịch sử loại cũ được mô tả tại Yêu cầu vắng buổi học. PUT sửa yêu cầu đã được gỡ. Backend hiện còn nhận ba loại đề xuất cũ cho tạo mới; yêu cầu chặn chúng từ mọi client được theo dõi tại [COACH-01, thiết kế §13.2](Center-Management-System-Design-v3.md#132-chức-năng-và-contract-còn-thiếu). Giữ lịch sử/rút Pending và các phương án xử lý của Manager là yêu cầu độc lập với việc chặn tạo mới loại cũ. Migration nền: `20261011025932_AddClassSessionChangeRequests`.

Policy update, 2026-10-18: submitted Coach requests are immutable. The edit button/form, client update method, service UpdateAsync and PUT route have been removed. PUT to the existing GET request URL returns 405 Method Not Allowed. The owner may still POST `.../{id}/withdraw` while Pending, without the six-hour creation deadline. An already handled request returns `409 class_change_not_pending`; another owner’s request returns `404 class_change_not_found`. Creating a different request after withdrawal requires a new requestId and valid creation conditions; historical content is never rewritten.

The Manager request dialog now uses GET /api/availability/coaches with sportId, target startUtc/endUtc and optional excludeSessionId. SUBSTITUTION uses the original full interval and excludes the absent Coach from choices. Reschedule/makeup uses the new interval with the original duration and clears the prior selection when it changes. Missing time, loading/error, or unavailable selection blocks confirmation; empty results suggest another time/resolution. Lookup errors support refresh. A save-time 409 retains the reason, clears the selection and refreshes candidates. The backend still validates target/occupancy transactionally; conflicts preserve Pending and schedule.

Coach UI now submits `{requestId,type:"ABSENCE",reason,proposedStartAtUtc:null,proposedEndAtUtc:null}`. Create requires at least 6 hours before the assigned Scheduled session (`409 class_absence_deadline`); absence proposals containing times return `400 absence_proposal_not_allowed`. Withdraw remains available while Pending. Existing proposal types remain accepted for old clients with their former validation; request history is not rewritten. Manager resolve accepts only `SUBSTITUTE`, `RESCHEDULE`, `CANCEL_WITH_MAKEUP`, or uses the separate reject endpoint. Migration `20261017090000_AddCoachAbsenceRequests` extends request-type constraints; Absence is not a resolution type.

Request responses additionally return nullable `outcome: {action,sessionId,sessionNo,startAtUtc,endAtUtc,coachId,coachName,roomId,roomName,handledBy,reason,source,sessionStatus}`. Migration `20261017100000_AddClassRequestOutcomeSnapshots` preserves the schedule and decision details transactionally for reviews and direct Manager changes (`source: DECISION`), including `ROOM_CHANGED` and `COURSE_CANCELLED`. Later schedule changes do not overwrite these snapshots. Earlier requests without a snapshot may return only their referenced current schedule (`source: CURRENT_SCHEDULE`), explicitly labeled by the UI; no historical dates/names are invented. Automatic closure remains WITHDRAWN/SCHEDULE_UPDATED (UI: Closed), and is distinguished from Coach withdrawal and approval.

## Hợp đồng bàn giao An/Hào

### Coach assignment access and schedule updates (2026-10-15)

- Coach access to student identity, health, packages and AI context requires a primary assignment to a Published/InProgress class with Confirmed enrollment. Stale/manual Coach–Member relationships do not grant student access. Ending one enrollment does not remove access through another eligible class. Ended-class teaching endpoints still return 403.
- Substitute assignment grants access only to non-cancelled sessions assigned to that Coach, their current roster and session records. It does not grant student-directory, health-profile, previous-assessment or student AI access. Both `GET /api/coaches/me/teaching/classes/{classId}/members` and `.../records` require `sessionId` for substitutes (`403 session_scope_required` if missing; `403 session_not_assigned` if another class, another Coach or Cancelled). Substitute records contain only that session's content and exclude whole-course plans; roster results omit health goal/level/notes and count only that session's attendance. Confirmed enrollments with a non-null `EndedAt` are excluded from Coach student/profile/roster/individual-record access and teaching writes. Primary Coaches may omit `sessionId` for whole-class access; with `sessionId`, records include that session and whole-course PLAN context. List/get/roster/session-write APIs enforce the same assignment boundaries. The frontend class URL opens assigned substitute sessions instead of the whole-class management screen. Public course listings and public session previews remain separate from protected teaching data.
- Teaching-record POST/PUT additionally checks write scope in `ClassTeachingService.SaveAsync`: a supplied session must belong to the class (`400 session_not_in_class`), be assigned to the actor (`403 session_not_assigned`) and not be Cancelled (`409 session_cancelled`). Without `sessionId` (omitted or null), only the primary class Coach may write; a substitute receives `403 class_plan_not_assigned`, including for PLAN/NOTICE and a personal PLAN with memberId. RESULT requires sessionId/memberId (`400 result_scope_required`); HOMEWORK requires sessionId (`400 homework_session_required`). PUT also checks record authorship/version and preserves kind/session/member scope; NOTICE/HOMEWORK cannot be edited. See the teaching write-scope contract.
- Session results require the student to have Confirmed, active enrollment and persisted Present attendance in that session. Both RESULT POST and PUT return 409 `result_attendance_required` when attendance is missing or Absent. Coach Record and the result editor stay disabled until Present is confirmed and the session has started. Coach and Receptionist attendance commands return 409 `attendance_result_exists` when Absent is requested for a student/session with a saved RESULT. Result writes and attendance writes serialize on the same session-row lock, preventing conflicting concurrent saves. Existing records are not rewritten and no migration is required.
- There is no Coach request update endpoint. `POST /api/coaches/me/teaching/change-requests/{id}/withdraw` is the only mutation on an existing request exposed to its Coach owner. It requires Pending and shares transaction locking with review/direct schedule changes. A completed review/direct schedule update wins first: withdrawal returns 409 and the UI refreshes; if withdrawal wins, Manager cannot resolve it.
- Successful direct reschedule, substitution, cancel-with-makeup or whole-course cancellation automatically closes affected Pending requests as `WITHDRAWN`, with `resolutionType: "SCHEDULE_UPDATED"`, reviewer/time/note and result session. Normal approvals remain `RESOLVED`. Closure, schedule, audit and bell/email outbox commit atomically. Conflicts preserve Pending.
- Schedule changes notify primary, outgoing and incoming coaches once per recipient/channel, as well as enrolled Members. Bell actions lead to `/coach/schedule`; request results lead to `/coach/change-requests`. Incident-related manual class dispositions use the same commands. No new migration is required.



### Member class communication and content access — 2026-10-16

- `CheckoutResponse.isDayPass` is computed from the invoice's membership item. It survives refresh/recovery and makes the checkout show the same-day/non-refundable terms before payment, including direct `/checkout/{invoiceId}` entry.
- `GET /api/invoices/{invoiceId}/receipt.pdf` remains authenticated and owner scoped for Members. Billing details and confirmed payment results now expose **Download invoice**.
- Member sessions and teaching records require Confirmed enrollment, no `endedAt`, and a Published/InProgress/Completed class. A Member may read their own lesson history after the final session or when the class is Completed. Ended enrollment or a Cancelled/Draft class returns `403 class_access_ended`; enrollment/financial history remains independent. Open Member class views recheck permission on focus and every 30 seconds. The narrower ongoing-class query for reminders and AI context still requires a future non-cancelled lesson.
- The one-minute Member communication job creates bell reminders at the 24-hour and 1-hour windows. It skips cancelled lessons, inactive enrollments and reminder windows preceding enrollment. Unique `(session,member,start,hours)` receipts and transaction-scoped worker locks prevent duplicate outbox writes across replicas/restarts. Rescheduled starts have fresh reminder identities.
- Member AI receives the current user's health profile, permitted course/individual lesson plans, recent assessments/coach comments, homework/notices, attendance summary and enrolled upcoming lessons. Bounded context includes source IDs/dates and truncation flags. It excludes other students and ended-class content. Provider continuation IDs are accepted only when an own successful interaction has the same current enrollment scope; otherwise a fresh context starts.
- Schema: `20261016045838_MemberClassCommunication`, following the existing original-price migration. No operational rows are deleted. The access rules are described in this section.

- **Removed:** course interests (`/api/course-interests`, `/api/members/me/course-interests`, `/api/manager/course-interests`), threshold choice `WAIT_NEXT_COURSE`, `continuationOfClassId`, `NextCourseAvailable`/`CourseInterestOpened` notifications. Migration `RemoveCourseInterest` drops the tables/columns, converts stored `WAIT_NEXT_COURSE` responses to `REFUND` and deletes those notifications. Threshold responses accept `REFUND`, `TRANSFER` and `KEEP_PLACE` only.
- When the response deadline passes below threshold without a waiver, `ThresholdResponseExpiryService` cancels the class, refunds 100% of the remaining refundable value as points and queues one bell/email `CLASS_CANCELLED` notice per Member stating the points returned and up to 3 similar courses at that moment (same sport, Published, enrollment open, seats left, not started, Member not enrolled; closest price first). Suggestions are not stored or resent.

## Hỗ trợ Member và đối soát

| Verb | Route | Hợp đồng / authority |
|---|---|---|
| GET | `/api/member-support-requests/queue?status&search&assignedToUserId&page&pageSize` | FrontDesk xem toàn bộ; Admin/Coach chỉ yêu cầu được giao; `status` ∈ OPEN/ASSIGNED/IN_PROGRESS/CLOSED. Search tối đa 200 ký tự trong subject/description/tên/email Member, không phân biệt hoa thường. Response đọc thêm memberName/memberEmail/assignedToName hiện tại. |
| GET | `/api/member-support-requests/assignees` | FrontDesk; Receptionist/CenterManager đang Active. Chỉ người gọi CenterManager được nhận thêm SystemAdministrator đang Active trong danh sách. |
| POST | `/api/member-support-requests/{id}/assign`, `/progress`, `/close` | FrontDesk; khóa dòng `FOR UPDATE`, ghi audit. Progress/close yêu cầu đã phân công. CLOSED chặn assign/progress với 409 `support_request_closed`; close lặp trả 200 kết quả cũ, không đổi kết quả/audit. Mọi nhân viên FrontDesk đều thao tác được, không giới hạn theo người được giao (FR-22). |
| POST | `/api/member-support-requests` | FrontDesk tạo hộ member: `memberId, category, channel (COUNTER/PHONE/FANPAGE), description`, `subject` tùy chọn (tự sinh từ loại + mô tả), tùy chọn `assigneeUserId` + `handoverNote` để bàn giao ngay khi tạo. |
| POST | `/api/member-support-requests/{id}/assign` (body `assigneeUserId, note`) | Chuyển lên vai trò cao hơn người thao tác (Receptionist → Manager → Administrator) bắt buộc `note` ≥ 3 ký tự, lỗi 400 `support_transfer_note_required`. |
| GET | `/api/member-support-requests/{id}/events` | FrontDesk hoặc Admin/Coach được giao; lịch sử xử lý (CREATED, ASSIGNED, PROGRESS, DONE, REJECTED) kèm người thực hiện, ghi chú và thời điểm. |
| POST | `/api/support/requests` (multipart) | Member tự gửi từ trang Trợ giúp: `category, description, files[]` (tối đa 3 ảnh JPG/PNG/WebP, 5 MB/ảnh); kênh ONLINE; tạo thông báo và email xác nhận. |
| GET | `/api/support/requests/mine`, `/api/support/attachments/{id}` | Member xem yêu cầu của mình; ảnh đính kèm chỉ chủ yêu cầu, Receptionist, CenterManager hoặc Admin/Coach đang được phân công xem được. |

**Quyết định 24/10/2026 (đề xuất, chưa triển khai):** SLA 48 giờ (`slaDueAtUtc`), `POST /api/support/requests/{id}/remind`, request PAYMENT có `invoiceId` và 1–3 ảnh bắt buộc (không có trường ngân hàng; Lễ tân tạo hộ Member qua `POST /api/member-support-requests` kèm `invoiceId`, gọi được `POST /api/member-support-requests/{id}/remind` giúp Member, không xử lý được: 403 `payment_request_manager_only`), `POST /api/member-support-requests/{id}/payout` chỉ CenterManager (`amount`, `note` bắt buộc, 1–3 ảnh chứng từ), Member `confirm-received` hoặc `report-not-received`, `GET /api/members/me/unactivated-payments`, `POST /api/invoices/{invoiceId}/convert-to-points`, báo cáo `bankRefundPaid`. Hợp đồng đầy đủ, mã lỗi và dữ liệu: [Payment-Support-Workflow](Payment-Support-Workflow.md) mục 6–7. Không dùng như endpoint hiện hữu cho đến khi được triển khai.

Assign cho SystemAdministrator chỉ cho phép người gọi CenterManager; Receptionist bị từ chối 403 `support_admin_assignment_forbidden`, không thay đổi yêu cầu hoặc ghi audit phân công. Các role ngoài FrontDesk vẫn bị chặn bởi policy. Người nhận phải đang Active.

Admin/Coach inbox displays three statuses: **Not started** (OPEN/ASSIGNED), **In progress** (IN_PROGRESS), **Done** (DONE/CLOSED and legacy REJECTED, whose rejection reason remains visible). `queue?status=NOT_STARTED` combines OPEN/ASSIGNED; `stats.notStarted` returns their sum. Receiver Done filters/stats include historical rejected requests; FrontDesk retains the existing workflow. Progress and Done require a 3–1000 character note, lock the row, recheck ownership and reject finalized requests. No schema change. Public profile avatars no longer show the Report photo button; existing moderation records remain intact.

Khi Manager phân công cho admin, giao dịch lưu thêm thông báo InApp `SUPPORT_REQUEST_ASSIGNED` cho đúng admin đó, gồm tên Manager/Member, tiêu đề, loại và nội dung yêu cầu. Admin đọc qua chuông và `/notifications`; chỉ chủ thông báo được xem/đánh dấu đã đọc. Gán lặp cùng người nhận không tạo thêm thông báo/audit và không đưa tiến độ về ASSIGNED. Chuyển đi rồi gán lại là lần phân công mới. Thông báo mở `/admin/support?request={id}` khi yêu cầu vẫn được giao cho Admin đó; Coach mở `/coach/support?request={id}`. Admin và Coach được đọc hàng đợi, chi tiết, thống kê, lịch sử, ảnh đính kèm và gọi `/progress`, `/done` chỉ với yêu cầu được phân công; quyền này không mở rộng sang hồ sơ/gói tập Member. Không gửi email cho Admin.
| GET | `/api/users`, `/api/users/{userId}` | Receptionist luôn bị ép `role=Member`; xem chi tiết tài khoản khác Member trả 404. |
| GET | `/api/front-desk/payment-reconciliation?memberId&page&pageSize` | FrontDesk; gồm thanh toán đã xác minh chưa cấp dịch vụ và giao dịch chờ xác minh, kể cả sau khi hold hết hạn. |
| POST | `/api/front-desk/payment-reconciliation/{invoiceId}/retry` | FrontDesk; thử cấp lại dịch vụ hoặc xác minh với cổng; ghi audit `FRONT_DESK_PAYMENT_RECONCILIATION_RETRY`. |
| GET | `/api/members/me/class-holds` | Member; các giữ chỗ còn hạn có hóa đơn để tiếp tục thanh toán. |

### Recorded attendance

- `GET /api/reports/recorded-attendance?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD` is CenterManager-only. Defaults to month to date in Vietnam time; invalid, future-ending, or ranges longer than 366 days return `400 invalid_date_range`.
- Response: `{fromDate,toDate,daily:[{date,uniqueMembers,gymCheckIns,classAttendances}]}`. Every day in the range is included, including zero-activity days. `uniqueMembers` deduplicates Member IDs across Gym check-ins and Present class attendance on that day. Individual check-ins and lesson attendances remain separate event counts and must not be added to estimate unique people.
- Class attendance is assigned to the session's Vietnam start date, not the date of entry/edit. Future sessions and future check-ins are excluded; later attendance edits can revise earlier daily totals. Rental visitors and unrecorded arrivals are not estimated. No profile-level data is returned and no migration is required.

### Court booking volume

- `GET /api/reports/court-bookings?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD` is CenterManager-only, defaults to the full current calendar month in Vietnam time, and accepts up to 366 calendar days including future rental dates. Invalid ranges return `400 invalid_date_range`. Manager Overview requests the full month for this section; collections and recorded attendance remain month to date.
- Response: `{fromDate,toDate,totalBookings,totalBookedHours,bySport:[{sportId,sportName,bookings,bookedHours}]}`. Count Confirmed/Completed rentals once each by their Vietnam rental start date, not order/payment date. Exclude PendingPayment/Cancelled. Hours are the sum of full booked durations, including confirmed bookings for upcoming dates within the selected range; they do not establish physical attendance or elapsed usage.
- Include current active rental sports with zero activity and historical sports with qualifying rentals even when no longer offered. No schema migration is required.

### Manager Reports dashboard — filtered analysis

- All report periods use inclusive Vietnam calendar dates, up to 366 days. Reports defaults to the full current month for rental dates and class start dates. Financial/purchase requests end at today; future dates are not presented as zero revenue. `Compare with: Previous month` aligns elapsed financial days when the primary period is the current month, while operational comparisons use complete calendar months. Explicit custom comparison periods retain their selected dates (financial end dates still capped today). Unequal durations and zero baselines show absolute differences only; enrollment differences use percentage points.
- Revenue cash uses payment date; cash refunds use completed payout date even when the original payment was in another period. A linked invoice-item refund uses that item's dimensions; invoice-level refunds with no reliable attribution remain LegacyUnclassified. Point-ledger-backed refunds do not reduce `netRevenue`. Current wallet balance is scoped only by member (when selected), not by date, sport or source.
- Court bookings accepts optional `sportId` and `memberId`, returns `daily[{date,bookings,bookedHours}]` as well as existing totals/bySport. Only Confirmed/Completed rentals count, grouped by Vietnam rental start date; full scheduled duration counts as booked hours, not measured use. Future rental dates in the selected period are included. Rental collections use the separately elapsed payment-date range.
- Active Gym members uses `/api/reports/membership-summary?asOfDate=<today>` independently of selected/comparison periods: unique members with Active Membership valid today, excluding day passes. It has no prior-period delta.
- Export types `COURT_BOOKINGS` (`sportName,bookings,bookedHours`) and `CLASS_STATUS` (`name,sportName,startDate,status,confirmedCount,capacity,thresholdStatus`) share readers with their APIs. `MEMBERSHIP_PERIOD` additionally supports `dayPassesSold`. Revenue summary/daily/dimension exports accept Sport/Source/Member using the same aggregation as the dashboard. PDF and CSV use identical rows; primary and comparison exports are separate files with their actual period and applied filters. No schema or migration change.
- Reports labels: `Money received` = `totalCollected`; `Cash refunded` = `totalRefunded`; `After refunds` = `netRevenue`. After refunds excludes point movements and does not subtract operating costs. API field names and Overview presentation remain unchanged.

Membership-period `daily[]` additionally returns `dayPassesSold`: paid valid day-pass packages counted once per package by payment date in Vietnam time, using the same eligibility as the period Day passes sold total. `buyers` remains unique membership purchasers per day, excluding day passes. The Members Gym purchases by day chart shows separate people and passes series; neither measures attendance. Missing daily day-pass data from older APIs is displayed as Unavailable, not zero. No schema/migration change.

Public coach profiles group published documents into **Certificates** (professional qualifications) and **Awards** (recognition/achievements), with explicit empty states when no documents are shared. Coach upload management groups the two types and shows the combined limit: 20 non-deleted documents, at most 10 MiB per file (JPG/PNG/WebP/PDF). Unpublished/deleted documents remain excluded from the public API and gallery.

The public Coach profile uses the current Court & Volt interface with Overview, Certificates and Awards bookmarks (`?tab=overview|certificates|awards`). Overview displays saved introduction and coaching approach. Certificate/award bookmarks show the matching published documents; the coach hover preview links directly to Certificates. The former profile layout is replaced.

Public Coach detail is a standalone view without the homepage navbar. Its Back action uses a validated local `returnTo` path; links from coach previews preserve the source pathname/query/hash, account preview returns to `/account`. Changing profile bookmarks preserves `returnTo`. External/invalid targets and links back to the same profile fall back to the homepage SportHub section (`/#sporthub`). The `/coaches` directory page is removed; individual `/coaches/{coachId}` public profiles remain available.

Coach names/portraits in class views remain hover/focus previews and are real links to the public Coach profile. Clicking/tapping or pressing Enter opens the profile; `returnTo` preserves the originating class/service/schedule URL. Avatar and name inside the preview also link to the profile.

Admin account detail exposes **Remove photo** only for Member/Coach accounts with an uploaded avatar. A confirmation dialog calls `DELETE /api/admin/users/{userId}/avatar`; on success the account is reloaded and displays the default avatar. Backend role/target restrictions, audit logging and durable Cloudinary cleanup remain enforced; no report is required before removal.

### Private avatar images in Admin audit details

- New UPDATE_AVATAR, DELETE_AVATAR, IMPORT_GOOGLE_AVATAR and MANAGER_REMOVE_MEMBER_AVATAR entries record private before/after image identifiers and expiry metadata alongside the same database save as the avatar change. The image bytes are kept in `avatar_audit_images`, never in JSON audit values or public Cloudinary URLs. Maximum 5 MiB per image, JPG/PNG/WebP only; after upload the submitted image is retained, and an existing image is copied from retained evidence or the configured Cloudinary tenant before its normal deletion. Unavailable older images do not prevent avatar moderation; they display Image no longer available.
- Admin-only GET `/api/admin/audit-avatar-images/{imageId}` returns an image with `Cache-Control: private, no-store` and nosniff. Missing/expired images return 404. Authentication and the SystemAdministrator policy are required, including when an image ID is known. Access expires after 30 days; the existing avatar cleanup worker deletes expired rows every ten minutes. Normal avatar URLs continue to be removed through the existing durable Cloudinary deletion queue.
- Admin Audit log → View details displays Before/After image panels, with authenticated blob fetches and memory URLs revoked on close. A removed/default avatar is shown as No profile photo. Legacy events without image evidence remain readable but cannot recover files already deleted. Member avatar events are added to Admin audit visibility only; other Member operational events remain outside that scope. Manager cannot access the private images.
- Apply migration `AvatarAuditImages` before deploying this feature. It adds only the image archive table and indexes; it does not backfill or change existing audit records.

### Manager avatar, support settings and current operational health

- Center Manager can upload/change/remove their own avatar in Account through the existing Cloudinary crop editor and avatar APIs (5 MiB, JPG/PNG/WebP). Their image is not available anonymously. Private audit image retention uses the same avatar evidence flow. This does not grant managers permission to edit another manager's photo.
- Operating settings exposes exactly the three existing support keys: `support.sla_hours` (1–168 hours, default 48), `support.remind_cooldown_hours` (1–168 hours, default 48), `support.payout_confirm_days` (1–30 days, default 3). No fourth key, new schema or seed is added. Reopened payout requests use the configured SLA; existing stored deadlines remain unchanged.
- Manager operations health replaces the legacy gateway-event compensation count with `payments.paidNotActivated`, counting distinct invoices that have verified successful Unactivated events, matching the front-desk queue. `support.overdueRequests` counts requests whose SLA deadline has passed and which are not DONE/CLOSED/REJECTED. Health is at least Degraded while either backlog is nonzero. Existing health read permission stays Manager-only.
- Audit names explicitly cover PAYMENT_NOT_ACTIVATED, REMIND_SUPPORT_REQUEST, SUPPORT_PAYOUT_RECORDED/CONFIRMED/NOT_RECEIVED/AUTO_CONFIRMED, COMPLETE/REJECT_SUPPORT_REQUEST and CONVERT_UNACTIVATED_PAYMENT_TO_POINTS. New payout/receipt/reminder/point-conversion events include safe request/invoice references, amount/points, confirmation outcome or reminder count, without bank details. Admin can see the narrowly scoped Member receipt, reminder and point-conversion events alongside photo events; unrelated Member operations remain excluded. Legacy event labels are readable even when older events lack details.
