# Kế hoạch BE-4 — Personal Training session, result, progress và homework

> Ngày lập: 29/09/2026  
> Phạm vi: backend Personal Training 1:1 cho `PersonalTrainer`, chuẩn bị contract để Payment tích hợp sau.  
> Không thuộc phạm vi: Payment, Invoice, Refund, VNPay, revenue, payroll và frontend.

## 0. Mục tiêu và thứ tự thực hiện

BE-4 đóng khoảng trống đang chặn Phase 8 của `frontend-pt-manager-ux-redesign-plan.md`:

1. Có entity PT session 1 Coach : 1 Member, không dùng `Class`, `ClassSession` hoặc `Enrollment`.
2. Có quota PT độc lập với quota Membership và xử lý đúng booking/cancel/reschedule/no-show.
3. `WorkoutResult` gắn với PT session thật; có API timeline tiến độ.
4. Có dữ liệu homework thật; Notification chỉ là thông báo, không phải nguồn dữ liệu.
5. Manager xếp lịch; PT xem lịch và ghi kết quả; Member xem lịch/kết quả/homework.
6. Cung cấp application contract để nhánh Payment sau này tạo/kích hoạt/hủy quyền lợi PT mà không query ngược vào controller.

Thứ tự bắt buộc:

```text
BE-1 Google onboarding
  → BE-2 cancellation policy
  → BE-3 manager reporting
  → BE-4 PT domain/API/tests
  → Payment do người dùng triển khai
  → FE PT/Manager Phase 8
```

Không bắt đầu FE result/progress/homework trước khi BE-4 merge và contract API ổn định.

## 1. Nguồn yêu cầu và thứ tự ưu tiên

Đọc trước khi sửa code:

1. `docs/00-Source-of-Truth.md`.
2. `docs/SportManagement_BusinessRules.docx`, đặc biệt BR-23–26, BR-61, BR-65–66 và BR-70–77.
3. `docs/Requirements.md`.
4. `docs/Center-Management-System-Design-v2.md`.
5. `docs/entity-field-purpose.md`.
6. `docs/coach-specialization-code-implementation-plan.md`.
7. `docs/frontend-pt-manager-ux-redesign-plan.md`.

Nếu code hiện hành trái các nguồn trên, không giữ hành vi cũ chỉ để tránh migration. Sửa tài liệu SSOT trước, sau đó mới sửa schema/code.

## 2. Hiện trạng và lỗi thiết kế phải loại bỏ

- `WorkoutResult.EnrollmentId` đang trỏ vào Enrollment của Yoga/Group X.
- `WorkoutService.SaveResultAsync` kiểm Coach của `ClassSession`, nên chưa phải kết quả buổi PT 1:1.
- `/coach/schedule` đang dùng `class-sessions/mine`; đây không phải lịch PT.
- `Class`/`ClassSession` vẫn cho `Discipline = PersonalTraining` dù SSOT đã chốt PT không dùng Class lifecycle.
- Demo seeder tạo lớp `PT 1 kèm 1` và tạo `WorkoutResult` từ Yoga Enrollment bằng Yoga Coach.
- Chưa có entity quyền lợi/quota PT đã mua, PT session, coach-change request, session-change request hoặc homework.
- Chưa có project integration test riêng cho module Training.

BE-4 không được giữ hai mô hình PT song song. Sau migration, Yoga/Group X tiếp tục dùng Scheduling; PT chỉ dùng Training.

## 3. Decision gate bắt buộc trước khi code

### 3.1 Chốt mô hình PT riêng

Quyết định đề xuất:

- Dùng `PtEntitlement` cho quyền lợi/quota PT đã mua.
- Dùng `PtSession` cho từng buổi 90 phút.
- `WorkoutResult` đổi FK từ `EnrollmentId` sang `PtSessionId` và quan hệ 1–1.
- Không tạo PT dưới dạng `Class`, `ClassSession`, `Enrollment` hoặc recurrence.

### 3.2 Chốt quyền xếp lịch và chọn Coach

Để đồng thời đáp ứng yêu cầu “Manager xếp lịch/phân công” và BR-74 “Member được chọn Coach”:

- Member chọn `PersonalTrainer` khi mua PT; Payment sau này truyền Coach đã chọn vào entitlement.
- Manager là actor tạo/reschedule/cancel PT session và phân công Coach đã chọn vào session.
- Manager không được tự đổi sang Coach khác nếu chưa có coach-change request được duyệt.
- PT chỉ xem lịch của mình, ghi trạng thái/kết quả; không tự tạo hoặc đổi lịch.
- Member gửi yêu cầu cancel/reschedule/đổi Coach; Manager duyệt và hệ thống áp dụng rule.

### 3.3 Chốt homework

Quyết định đề xuất:

- `HomeworkAssignment` là aggregate riêng, có nhiều `HomeworkAssignmentItem`.
- Có thể snapshot từ `WorkoutPlan`, nhưng không phụ thuộc Notification.
- Member chỉ cập nhật tiến độ/feedback của bài mình; PT phụ trách mới tạo/review/cancel.

### 3.4 Kiểm tra dữ liệu cũ trước migration

Chạy read-only audit:

```sql
SELECT COUNT(*) FROM classes WHERE discipline = 'PersonalTraining';
SELECT COUNT(*) FROM workout_results;
```

- Nếu chỉ có demo data: sửa seeder và reset database development.
- Nếu có dữ liệu thật: dừng migration, xuất danh sách để người dùng quyết định archive/map thủ công.
- Không tự map `Enrollment` Yoga/Group X thành `PtSession`.
- Không tự xóa dữ liệu thật trong migration.

## 4. Phạm vi BE-4

### 4.1 Trong phạm vi

- Entity, enum, EF configuration và migration cho PT.
- Quota reservation/consumption và concurrency.
- Booking/schedule/cancel/reschedule/no-show/completion.
- Coach-change request và session-change request.
- Workout Plan CRUD có archive thay cho hard delete.
- Workout Result gắn PT session và progress timeline.
- Homework assignment/items/status/feedback/review.
- Notification khi giao homework, đổi lịch hoặc duyệt/từ chối request.
- Swagger metadata, audit log và integration/security tests.
- Contract nội bộ để Payment tích hợp sau.

### 4.2 Ngoài phạm vi

- Giá PT, PT catalog, checkout, tạo Invoice/InvoiceItem.
- VNPay Return/IPN/QueryDR, reconciliation.
- Refund eligibility/payout và revenue.
- Sửa bất kỳ file nào dưới `SportHub.Payment` hoặc `SportHub.Payment.Tests`.
- Payroll, lương, hoa hồng, chi phí nhân sự.
- Trang FE PT/Manager.
- Các chỉ số sức khỏe mới chưa có requirement như cân nặng, BMI, body fat.

## 5. Domain model đề xuất

### 5.1 `PtEntitlement`

Đại diện quyền lợi PT được Payment tạo ở trạng thái chờ và kích hoạt sau thanh toán.

| Field | Ý nghĩa |
|---|---|
| `EntitlementId` | UUID PK; `InvoiceItem.RelatedEntityId` sẽ trỏ logic tới ID này ở nhánh Payment |
| `ActivationReference` | UUID opaque, nullable khi PendingPayment và unique khi có giá trị; Payment sau này có thể dùng InvoiceItemId để activate idempotent |
| `MemberId` | Member hưởng quyền lợi |
| `OriginMemberPackageId` | Membership Active lúc checkout PT |
| `CurrentMemberPackageId` | Membership đang cấp validity, có thể đổi khi carry-over |
| `CoachId` | `PersonalTrainer` Member đã chọn |
| `FrequencyPerWeek` | Chỉ nhận 1, 2 hoặc 3; dùng tính quota, không giới hạn lịch theo tuần |
| `TotalQuota` | 4/8/12 × số tháng Membership tương ứng BR-71 |
| `ReservedSessions` | Session đang giữ quota nhưng chưa consume |
| `ConsumedSessions` | Completed, late cancel, no-show, old leg của late reschedule |
| `ValidityStartDate` / `ValidityEndDate` | Snapshot period của Membership hiện hành, inclusive |
| `CarryOverUntilDate` | `ValidityEndDate + 30 ngày` theo BR-66 |
| `Status` | `PendingPayment`, `Active`, `AwaitingCarryOver`, `Exhausted`, `Expired`, `Cancelled` |
| `ActivatedAt` / `CancelledAt` | Audit thời gian |
| `Version` | Optimistic concurrency token |

Invariant:

```text
RemainingQuota = TotalQuota - ReservedSessions - ConsumedSessions
0 <= ReservedSessions
0 <= ConsumedSessions
ReservedSessions + ConsumedSessions <= TotalQuota
```

Không dùng `MemberPackage.RemainingSessions` cho PT; field đó không được trừ khi booking Yoga/Group X và không phải nguồn quota PT.

Duration Membership được suy ra bằng cách đối chiếu cặp `StartDate/EndDate` với 1/3/6/12 tháng theo công thức inclusive của BR hiện hành; không đổi ngược thành số ngày cố định.

### 5.2 `PtSession`

| Field | Ý nghĩa |
|---|---|
| `SessionId` | UUID PK |
| `EntitlementId` | FK đến `PtEntitlement` |
| `MemberId` | Snapshot/FK để query và ràng buộc overlap; phải khớp entitlement |
| `CoachId` | Coach thực tế của session; giữ lịch sử khi đổi Coach |
| `StartAtUtc` / `EndAtUtc` | UTC; `EndAtUtc = StartAtUtc + 90 phút` |
| `Status` | `Scheduled`, `Completed`, `CancelledOnTime`, `CancelledLate`, `NoShow`, `RescheduledOnTime`, `RescheduledLate` |
| `QuotaState` | `Reserved`, `Consumed`, `Released` |
| `RescheduledFromSessionId` | Self-FK nullable; replacement trỏ về session cũ |
| `CreatedByUserId` | Manager tạo lịch |
| `CompletedAt` / `CancelledAt` | Thời điểm nghiệp vụ |
| `CancellationReason` | Lý do cancel/no-show/correction |
| `Version` | Concurrency token |

Quy tắc:

- Chỉ `Scheduled` chặn slot thời gian.
- Khoảng giao nhau dùng `[StartAtUtc, EndAtUtc)`.
- Không cho Coach hoặc Member có hai `Scheduled` PT session giao nhau.
- Session phải nằm hoàn toàn trong validity hiện hành theo giờ Việt Nam.
- Session luôn đúng 90 phút; API chỉ nhận `StartAtUtc`, server tự tính `EndAtUtc`.

### 5.3 `PtSessionChangeRequest`

Member yêu cầu `Cancel` hoặc `Reschedule`; Manager duyệt/từ chối.

Field tối thiểu:

- `RequestId`, `SessionId`, `RequestedByUserId`.
- `RequestType`: `Cancel`, `Reschedule`.
- `RequestedStartAtUtc` cho reschedule.
- `RequestedAt`, `Reason`.
- `TimingClassification`: `OnTime`, `Late` — tính tại `RequestedAt`, không tính tại lúc Manager duyệt.
- `RequestsException` để Member xin ngoại lệ late rule.
- `Status`: `Pending`, `Approved`, `Rejected`, `Withdrawn`.
- `ReviewedByUserId`, `ReviewedAt`, `ReviewNote`.

Mỗi session chỉ có tối đa một request Pending. Request đã duyệt phải áp dụng thay đổi session và quota trong cùng transaction.

### 5.4 `PtCoachChangeRequest`

Field tối thiểu:

- `RequestId`, `EntitlementId`, `MemberId`.
- `CurrentCoachId`, `RequestedCoachId`.
- `Reason`, `RequestedAt`.
- `Status`: `Pending`, `Approved`, `Rejected`.
- `ReviewedByUserId`, `ReviewedAt`, `ReviewNote`.

Khi approve:

1. Kiểm Coach mới là `PersonalTrainer`, account active.
2. Đổi `PtEntitlement.CoachId`.
3. Kết thúc relationship cũ và tạo/đảm bảo relationship mới.
4. Với từng session tương lai `Scheduled`: chuyển sang Coach mới nếu không conflict.
5. Session conflict giữ Coach cũ và trả danh sách `unmovedSessionIds` cho Manager xử lý.
6. Tất cả thay đổi và quyết định phải có audit.

### 5.5 `WorkoutResult`

Thay đổi:

- Bỏ `EnrollmentId` và navigation `Enrollment`.
- Thêm `PtSessionId`, unique, FK đến `PtSession`.
- Giữ `CoachId`, `ProgressNote`, `CoachComment`, `RecordedAt`.
- CoachId phải bằng Coach thực tế của PT session.
- Chỉ ghi result khi session thuộc Coach đang đăng nhập và đã/đang được chuyển `Completed`.
- Ghi lại cùng session là update idempotent, không tạo bản ghi thứ hai.

Progress không cần entity mới: timeline là projection từ `PtSession + WorkoutResult`, sắp theo `StartAtUtc`, có lọc ngày/member và pagination.

### 5.6 Workout Plan lifecycle

Thêm `WorkoutPlanStatus`: `Draft`, `Active`, `Archived` và `UpdatedAt`, `Version`.

- PT có active relationship được create/update/activate/archive.
- Không hard delete plan đã giao hoặc đã dùng làm nguồn homework.
- Member chỉ đọc plan của mình.
- Update items thực hiện transaction, không để partial plan.

### 5.7 `HomeworkAssignment` và `HomeworkAssignmentItem`

`HomeworkAssignment`:

- `AssignmentId`, `MemberId`, `CoachId`, `RelationshipId`.
- `SourceWorkoutPlanId` nullable.
- `Title`, `CoachNote`.
- `AssignedAt`, `DueAt`, `CompletedAt`, `ReviewedAt`.
- `Status`: `Assigned`, `InProgress`, `Completed`, `Reviewed`, `Cancelled`.
- `MemberFeedback`, `Version`.

`HomeworkAssignmentItem` snapshot:

- `ItemId`, `AssignmentId`, `Exercise`, `Sets`, `Reps`, `Notes`.

Authorization:

- PT chỉ tạo/update/cancel/review cho Member có relationship Active với chính mình.
- Member chỉ đọc và cập nhật `InProgress`/`Completed` + feedback của chính mình.
- ClassInstructor luôn bị 403 ở backend.
- Relationship kết thúc không xóa homework cũ; chỉ chặn assignment mới.

## 6. State machine và quota

### 6.1 Booking

Trong một database transaction:

1. Lock entitlement/version.
2. Kiểm `Status = Active`, Member/Coach/category hợp lệ.
3. Kiểm `RemainingQuota > 0`.
4. Kiểm session nằm trong validity và đúng 90 phút.
5. Kiểm conflict Coach + Member.
6. Tăng `ReservedSessions` nguyên tử.
7. Tạo `PtSession(Status=Scheduled, QuotaState=Reserved)`.

Không dùng mẫu `SELECT remaining` rồi `INSERT` tách transaction.

### 6.2 Hoàn thành và No-show

- `Scheduled → Completed`: `ReservedSessions - 1`, `ConsumedSessions + 1`, quota state thành `Consumed`.
- `Scheduled → NoShow`: cùng cách consume.
- Không transition lần hai; retry phải idempotent.
- Khi `Reserved + Consumed = TotalQuota`, entitlement thành `Exhausted` nhưng session đã reserve vẫn xử lý được.

### 6.3 Cancel

- Request tại hoặc trước `StartAtUtc - 24 giờ`: `CancelledOnTime`, release reservation.
- Request sau deadline: `CancelledLate`, chuyển reserved thành consumed.
- Exception approved có thể phục hồi consumed quota đúng một lần và phải audit.

### 6.4 Reschedule

- On-time: old session `RescheduledOnTime/Released`; replacement `Scheduled/Reserved`; tổng quota net không đổi.
- Late: old session `RescheduledLate/Consumed`; replacement cần reserve thêm một quota còn lại.
- Nếu late reschedule không còn quota, trả `409 pt_quota_exhausted`; không thay đổi session cũ.
- Old + replacement + counters commit trong cùng transaction.

### 6.5 Carry-over

- Hết validity còn quota: chuyển `AwaitingCarryOver`, không cho book/use session.
- Renewal trong 30 calendar days: cập nhật `CurrentMemberPackageId`, validity mới và quay lại `Active` nếu còn quota.
- Quá `CarryOverUntilDate`: `Expired`; unused quota không dùng lại.
- BE-4 triển khai service nội bộ idempotent; Payment/Membership workflow sau này gọi service đó.

## 7. Database constraints và indexes

Bắt buộc có:

- Unique `PtEntitlement.ActivationReference`.
- Check frequency `IN (1,2,3)`.
- Check counters không âm và không vượt quota.
- Check `EndAtUtc = StartAtUtc + interval '90 minutes'`.
- Alternate key `(EntitlementId, MemberId)` và composite FK từ `PtSession` để DB bảo đảm session thuộc đúng Member của entitlement.
- Unique `WorkoutResult.PtSessionId`.
- Partial unique một Pending request cho mỗi session/entitlement theo loại request.
- Index lịch theo `(CoachId, StartAtUtc)`, `(MemberId, StartAtUtc)`.
- Index entitlement theo `(MemberId, Status)`.
- Index homework theo `(MemberId, Status, DueAt)` và `(CoachId, Status, DueAt)`.

Khuyến nghị dùng PostgreSQL `btree_gist` + exclusion constraint cho overlap của session `Scheduled`, với enum PT lưu string để migration/filter dễ đọc. Nếu không dùng exclusion constraint, phải dùng transaction/advisory lock và integration test concurrency; không chấp nhận chỉ query `AnyAsync` không lock.

## 8. API contract

Tất cả endpoint trả DTO, không trả EF entity; có Swagger metadata và error code ổn định.

### 8.1 Manager

| Method | Route | Mục đích |
|---|---|---|
| `GET` | `/api/manager/pt-entitlements` | Tìm entitlement theo member/coach/status |
| `GET` | `/api/manager/pt-sessions` | Calendar/list theo range, member, coach, status |
| `POST` | `/api/manager/pt-sessions` | Tạo session 90 phút |
| `POST` | `/api/manager/pt-sessions/{id}/cancel` | Manager cancel với reason, áp dụng timing rule |
| `POST` | `/api/manager/pt-sessions/{id}/reschedule` | Manager reschedule |
| `GET` | `/api/manager/pt-session-change-requests` | Queue yêu cầu cancel/reschedule |
| `POST` | `/api/manager/pt-session-change-requests/{id}/approve` | Áp dụng request + quota atomically |
| `POST` | `/api/manager/pt-session-change-requests/{id}/reject` | Reject có lý do |
| `GET` | `/api/manager/pt-coach-change-requests` | Queue đổi Coach |
| `POST` | `/api/manager/pt-coach-change-requests/{id}/approve` | Chuyển Coach và future sessions không conflict |
| `POST` | `/api/manager/pt-coach-change-requests/{id}/reject` | Reject có lý do |

### 8.2 Personal Trainer

| Method | Route | Mục đích |
|---|---|---|
| `GET` | `/api/coaches/me/pt-sessions` | Chỉ lịch PT của chính Coach từ JWT |
| `GET` | `/api/coaches/me/pt-sessions/{id}` | Chi tiết session thuộc Coach |
| `POST` | `/api/coaches/me/pt-sessions/{id}/complete` | Hoàn thành và consume quota |
| `POST` | `/api/coaches/me/pt-sessions/{id}/no-show` | Ghi No-show và consume quota |
| `PUT` | `/api/workout-results/{ptSessionId}` | Create/update result cho session của mình |
| `GET` | `/api/coaches/me/progress?memberId=...` | Timeline tiến độ member đang phụ trách |
| `PUT` | `/api/workout-plans/{id}` | Update plan của chính PT |
| `POST` | `/api/workout-plans/{id}/activate` | Activate plan |
| `POST` | `/api/workout-plans/{id}/archive` | Soft delete/archive |
| `GET/POST` | `/api/coaches/me/homework` | List/create homework |
| `PUT` | `/api/coaches/me/homework/{id}` | Update trước khi completed/reviewed |
| `POST` | `/api/coaches/me/homework/{id}/review` | Review member submission |
| `POST` | `/api/coaches/me/homework/{id}/cancel` | Cancel có lý do |

Mọi route Coach phải gọi `RequireCategoryAsync(...PersonalTrainer...)` trước khi query dữ liệu member/session để không lộ tồn tại dữ liệu cho ClassInstructor.

### 8.3 Member

| Method | Route | Mục đích |
|---|---|---|
| `GET` | `/api/members/me/pt-entitlements` | Quota/status/validity của chính mình |
| `GET` | `/api/members/me/pt-sessions` | Lịch sử và lịch sắp tới |
| `POST` | `/api/members/me/pt-sessions/{id}/change-requests` | Xin cancel/reschedule |
| `POST` | `/api/members/me/pt-coach-change-requests` | Xin đổi Coach |
| `GET` | `/api/members/me/progress` | Timeline kết quả của chính mình |
| `GET` | `/api/members/me/homework` | Homework của chính mình |
| `PATCH` | `/api/members/me/homework/{id}` | In-progress/completed + feedback |

Không nhận `memberId` từ body/query cho endpoint `/me`.

## 9. Contract bàn giao cho Payment

BE-4 tạo interface application nội bộ trong Training, không tạo public HTTP endpoint:

```csharp
public interface IPtEntitlementLifecycle
{
    Task<Guid> CreatePendingAsync(CreatePendingPtEntitlement command, CancellationToken ct);
    Task ActivateAsync(Guid entitlementId, Guid activationReference, CancellationToken ct);
    Task CancelAsync(Guid entitlementId, string reason, CancellationToken ct);
    Task CarryOverAsync(Guid entitlementId, Guid renewedMemberPackageId, CancellationToken ct);
}
```

Yêu cầu contract:

- Idempotent theo `EntitlementId`/`ActivationReference`.
- Không tự mở transaction riêng nếu caller Payment đang có transaction; dùng cùng scoped DbContext.
- `CreatePendingAsync` chỉ kiểm domain PT/Member/Coach/Membership; không tạo Invoice.
- `ActivateAsync` chỉ thành công khi linked Membership đang Active và quota/validity hợp lệ.
- Payment sau này chịu trách nhiệm giá, InvoiceItem, payment success và gọi lifecycle trong cùng transaction fulfillment.
- Refund sau này gọi `CancelAsync`; eligibility/refund amount vẫn thuộc Payment.

Không thêm project reference từ Training sang Payment.

## 10. Thay đổi code theo phase

### Phase 0 — cập nhật tài liệu trước code

- Cập nhật SSOT §2/§3/§4/§7 để đóng open question PT session/result.
- Cập nhật ERD Design v2 cho các entity/relationship/state mới.
- Cập nhật `entity-field-purpose.md`.
- Cập nhật API/RBAC matrix.
- Ghi rõ Payment handoff, không tuyên bố Payment đã hỗ trợ PT.

Acceptance: không còn câu “PT session/result chưa chốt” hoặc mô tả WorkoutResult dùng Enrollment.

### Phase 1 — Training test foundation

- Tạo `backend/SportHub.Training.Tests` theo pattern PostgreSQL/Testcontainers hiện hành.
- Tạo factory seed đúng category PT/ClassInstructor/Member/Manager.
- Add project vào solution.
- Viết characterization tests cho plan/relationship hiện hành trước refactor.

### Phase 2 — domain/schema/migration

- Thêm entities/enums/configurations ở mục 5–7.
- Thêm project reference `SportHub.Training → SportHub.Membership` để kiểm MemberPackage/validity; tuyệt đối không reference Payment.
- Thêm DbSet vào `SportHubDbContext`.
- Refactor `WorkoutResult` sang `PtSessionId`.
- Thêm migration có tên mô tả, kiểm migration chỉ chứa DDL/data migration BE-4.
- Loại `PersonalTraining` khỏi Class creation/validation và demo seeder.
- Seeder tạo entitlement/session PT thật, không tạo Yoga WorkoutResult.
- Chạy `dotnet ef migrations has-pending-model-changes` sau migration.

### Phase 3 — entitlement/quota/session lifecycle

- Implement lifecycle contract Payment handoff.
- Implement manager scheduling + conflict/quota validation.
- Implement completion/no-show.
- Implement change request, cancel/reschedule và exception review.
- Audit mọi transition/correction.
- Notification sau khi transaction lưu thành công.

### Phase 4 — coach change

- Implement member request + manager queue/review.
- Chuyển entitlement/relationship/future sessions theo BR-74/75.
- Response approve phải nêu rõ moved và unmoved session IDs.
- Không cancel session conflict tự động.

### Phase 5 — plan/result/progress

- Bổ sung plan update/activate/archive.
- Đổi WorkoutResult service/controller/DTO sang `PtSessionId`.
- Không giữ endpoint nhận `EnrollmentId` sau khi consumer được migrate.
- Thêm progress timeline có pagination và date filter.
- AI suggestion tiếp tục đọc history mới qua projection, không query Enrollment PT giả.

### Phase 6 — homework

- Implement aggregate, endpoints, authorization và notification.
- Validate `DueAt > AssignedAt`.
- Member không sửa coach note/items.
- PT không sửa member feedback.
- Dữ liệu cũ giữ khi relationship kết thúc.

### Phase 7 — hardening

- Swagger response metadata.
- Pagination/max date range cho list/timeline.
- Audit payload không chứa dữ liệu nhạy cảm quá mức.
- N+1/query projection review.
- Concurrency tests cho booking/quota/conflict.
- Security regression cho ClassInstructor/deep link/ownership.

## 11. Test bắt buộc

### 11.1 RBAC và ownership

- CenterManager tạo/xử lý lịch và request; actor khác bị 403.
- PT chỉ xem/complete/result session của chính mình.
- PT khác không đọc được member/session/result/homework.
- ClassInstructor bị 403 trước khi query dữ liệu.
- Member chỉ xem/cập nhật dữ liệu của chính mình.
- Anonymous 401.

### 11.2 Quota và validity

- Frequency 1/2/3 cho duration 1/3/6/12 tháng ra đúng bảng BR-71.
- Không schedule trước StartDate hoặc kết thúc sau EndDate inclusive theo giờ Việt Nam.
- Booking đồng thời ở quota cuối chỉ một request thành công.
- Completed/no-show/late cancel consume đúng một lần.
- On-time cancel trả quota.
- On-time reschedule net một reservation.
- Late reschedule cần thêm quota; thiếu quota trả 409 và rollback toàn bộ.
- Retry transition không double-consume/release.

### 11.3 Conflict

- Cùng Coach overlap bị chặn.
- Cùng Member overlap bị chặn.
- Hai session chạm biên, session A end đúng lúc B start, được phép.
- Request đồng thời vẫn bị DB/transaction chặn.

### 11.4 Coach change

- Chỉ PersonalTrainer active được chọn.
- Future session available được move.
- Future session conflict giữ Coach cũ.
- Past/completed/cancelled không đổi Coach.
- Relationship và audit đúng.

### 11.5 Result/progress

- Result chỉ cho session PT của Coach thực tế.
- Một result/session; ghi lại là update.
- Không ghi cho Yoga/Group X Enrollment.
- Member/PT timeline chỉ trả đúng ownership và thứ tự.
- AI history đọc kết quả PT mới.

### 11.6 Homework

- PT có relationship Active tạo được; PT cũ/khác bị chặn.
- Member chỉ update status/feedback hợp lệ.
- State transition invalid trả 409.
- Review/cancel và optimistic concurrency đúng.
- Notification được tạo nhưng xóa notification không mất homework.

### 11.7 Regression

- Yoga/Group X class booking/attendance không đổi.
- BE-1 Google onboarding pass.
- BE-2 cancellation pass.
- BE-3 reports pass.
- Payment test hiện hành pass mà không sửa Payment source.

## 12. Error codes tối thiểu

```text
pt_entitlement_not_found
pt_entitlement_not_active
pt_quota_exhausted
pt_session_not_found
pt_session_outside_membership_validity
pt_session_duration_invalid
pt_coach_conflict
pt_member_conflict
pt_change_request_already_pending
pt_change_request_invalid_state
pt_coach_change_already_pending
pt_session_not_owned
pt_session_not_completable
homework_not_found
homework_invalid_state
no_active_relationship
coach_must_be_personal_trainer
```

Không đưa `BR-xx` vào message UI; BR chỉ để XML comment/test name/tài liệu nội bộ.

## 13. Branch, commit và conflict policy

Branch đề xuất:

```text
feature/pt-training-workflow
```

Base từ commit đã chứa BE-1, BE-2, BE-3. Không base từ branch FE đang dở.

Commit gợi ý:

1. `docs(training): approve PT session and homework model`
2. `test(training): add PostgreSQL integration test foundation`
3. `feat(training): add PT entitlement and session schema`
4. `feat(training): implement PT scheduling and quota lifecycle`
5. `feat(training): add PT coach and session change requests`
6. `feat(training): migrate workout results and progress timeline`
7. `feat(training): add homework workflow`
8. `test(training): cover authorization concurrency and regressions`

Nếu branch Payment đã tồn tại, không merge/cherry-pick Payment vào giữa BE-4 để “tiện test”. Chỉ rebase/merge BE-4 vào Payment sau khi BE-4 được review.

## 14. Lệnh kiểm tra

```powershell
dotnet build backend/SportHub.sln --no-restore
dotnet test backend/SportHub.Training.Tests/SportHub.Training.Tests.csproj --no-restore
dotnet test backend/SportHub.Scheduling.Tests/SportHub.Scheduling.Tests.csproj --no-restore
dotnet test backend/SportHub.Security.Tests/SportHub.Security.Tests.csproj --no-restore
dotnet test backend/SportHub.Administration.Tests/SportHub.Administration.Tests.csproj --no-restore
dotnet test backend/SportHub.Payment.Tests/SportHub.Payment.Tests.csproj --no-restore
dotnet ef migrations has-pending-model-changes --project backend/SportHub.API --startup-project backend/SportHub.API
git diff --check
git diff --name-only -- backend/SportHub.Payment backend/SportHub.Payment.Tests
```

Lệnh cuối phải không có output.

## 15. Definition of Done

- PT không còn dùng Class/ClassSession/Enrollment.
- `WorkoutResult` gắn duy nhất với `PtSession`.
- Manager tạo/xử lý lịch; PT chỉ xem lịch và ghi trạng thái/kết quả; Member chỉ thao tác request/dữ liệu của mình.
- Quota đúng BR-71/73/76/77 và an toàn khi concurrent.
- Coach change đúng BR-74/75, không tự cancel conflict.
- Progress timeline và homework có nguồn dữ liệu thật.
- ClassInstructor không thể dùng API PT kể cả gọi trực tiếp.
- Migration được review, không xóa/map dữ liệu thật mơ hồ.
- Không file Payment/Invoice/Refund/VNPay/revenue nào bị sửa.
- Build và toàn bộ test ở mục 14 pass.
- Có contract rõ để người dùng tiếp tục phần Payment sau BE-4.

## 16. Prompt giao cho AI triển khai

```text
Đọc toàn bộ docs/backend-be4-pt-training-implementation-plan.md và các nguồn ở mục 1. Trước khi code, kiểm tra git status và thực hiện đầy đủ decision gate mục 3; nếu database có dữ liệu PT Class/WorkoutResult thật thì dừng, báo số liệu và không tự xóa/map. Tạo branch feature/pt-training-workflow từ commit đã chứa BE-1/BE-2/BE-3. Triển khai BE-4 theo đúng Phase 0→7: PT dùng PtEntitlement/PtSession riêng, WorkoutResult chuyển sang PtSessionId, Manager xếp lịch, PersonalTrainer ghi trạng thái/kết quả, Member dùng request/progress/homework, và thêm PostgreSQL integration tests/concurrency tests. Không dùng Class/ClassSession/Enrollment cho PT. Không sửa frontend hoặc bất kỳ file nào trong SportHub.Payment, SportHub.Payment.Tests, Invoice, Refund, VNPay, revenue hay payroll. Chỉ tạo application contract IPtEntitlementLifecycle để nhánh Payment tích hợp sau. Sau mỗi phase chạy test liên quan; cuối cùng chạy toàn bộ lệnh mục 14 và báo rõ migration, API contract, test, file thay đổi và phần bàn giao cho Payment.
```
