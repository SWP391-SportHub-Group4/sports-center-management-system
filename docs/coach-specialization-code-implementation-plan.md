# Kế hoạch triển khai code — Coach specialization

> Ngày lập: 28/09/2026  
> Trạng thái: kế hoạch cho AI triển khai; **chưa phải xác nhận code đã hoàn thành**  
> Phạm vi: phân loại `Coach` thành `PersonalTrainer` và `ClassInstructor` dưới **một** `UserRole.Coach`  
> Ngoại lệ bắt buộc: **không sửa Payment/Invoice/Refund/VNPay/revenue** vì phần này đang được triển khai riêng.

## 1. Mục tiêu cuối cùng

Giữ nguyên năm role hiện tại. Mỗi tài khoản có role `Coach` có đúng một `CoachProfile` với:

- `CoachCategory = PersonalTrainer`; hoặc
- `CoachCategory = ClassInstructor` (Yoga/Group X).

Quyền nghiệp vụ sau khi hoàn thành:

| Chức năng                                     |                          PersonalTrainer | ClassInstructor |    Receptionist |                           Center Manager |
| --------------------------------------------- | ---------------------------------------: | --------------: | --------------: | ---------------------------------------: |
| Xem lịch được phân công của chính mình        |                                       Có |              Có |           Không | Xem/quản lý toàn bộ theo quyền hiện hành |
| Xem hội viên PT được phân công                |                                       Có |           Không |           Không |                Có thể quản lý quan hệ PT |
| Tạo/sửa Workout Plan                          |                 Có, trong quan hệ Active |           Không |           Không |                        Không làm thay PT |
| Ghi Workout Result/progress                   | Có, sau khi mô hình PT session được chốt |           Không |           Không |                        Không làm thay PT |
| Gọi AI workout suggestion                     |                 Có, trong quan hệ Active |           Không |           Không |              Chỉ quyền đọc log nếu đã có |
| Xem roster Yoga/Group X                       |                           Không mặc định |           Không | Có để điểm danh |                   Có theo quyền vận hành |
| Điểm danh Yoga/Group X                        |                                    Không |           Không |              Có |                                    Không |
| Tự tạo/sửa/hủy/publish lịch Yoga/Group X      |                                    Không |           Không |           Không |                                       Có |
| Sửa tên/số điện thoại/mật khẩu của chính mình |                                       Có |              Có |              Có |                                       Có |

Kết quả frontend phải có hai trải nghiệm tách biệt:

- trang PT: lịch PT/phạm vi học viên, kế hoạch tập, kết quả/progress và AI;
- trang Yoga/Group X Instructor: chỉ lịch Yoga/Group X được Manager giao và trang tài khoản chung.

Ẩn menu chỉ là UX. Backend phải trả `403` khi `ClassInstructor` gọi trực tiếp API của PT.

## 2. Nguồn yêu cầu và thứ tự ưu tiên

AI triển khai phải đọc trước:

1. `docs/00-Source-of-Truth.md`, đặc biệt §1.1, §1.3, §2, §3, §4, §7;
2. `docs/SportManagement_BusinessRules.docx` v1.9, BR-96 đến BR-101;
3. `docs/Center-Management-System-Design-v2.md`, các phần `CoachProfile`, RBAC và API;
4. `docs/entity-field-purpose.md`;
5. `docs/Requirements.md` và `docs/RUNBOOK.md` để đối chiếu UI/demo.

Nếu code hiện tại mâu thuẫn với các nguồn trên thì sửa code, không sửa tài liệu để hợp thức hóa code cũ.

## 3. Ranh giới tuyệt đối: không đụng Payment

### 3.1 Không được sửa

- toàn bộ `backend/SportHub.Payment/**`;
- toàn bộ `backend/SportHub.Payment.Tests/**`;
- các trang Payment/Invoice/Refund/revenue ở frontend, gồm tối thiểu:
  - `frontend/src/app/member/invoices/**`;
  - `frontend/src/app/receptionist/invoices/**`;
  - `frontend/src/app/receptionist/sell-plans/**`;
  - `frontend/src/app/manager/payment-adjustments/**`;
  - `frontend/src/app/manager/reports/**`;
- business rules, DTO, API hoặc UI liên quan `Invoice`, `InvoiceItem`, `Payment`, `PaymentAttempt`, `PaymentAdjustment`, `Refund`, VNPay và revenue;
- migration Payment đang tồn tại; không rename, reorder, squash hoặc sửa nội dung migration đó;
- phần seed tạo package/invoice/payment/refund trong `DemoDataSeeder`.

Không thêm payroll, lương, hoa hồng, thưởng/phạt, phụ cấp, hợp đồng nhân sự, staff-cost hoặc profit report ở bất kỳ module nào.

### 3.2 Quy tắc migration để tránh kéo nhầm Payment

`SportHubDbContextModelSnapshot` là file dùng chung, nên bước migration Coach phải làm **sau cùng**:

1. Hoàn thành entity/configuration/service/tests trước nhưng chưa tạo migration.
2. Chờ nhánh hoặc working tree Payment của người dùng ổn định/đã merge.
3. Đồng bộ với commit Payment mới nhất.
4. Tạo đúng một migration tên gần nghĩa `AddCoachProfiles`.
5. Đọc thủ công `Up`/`Down`: `Up` chỉ được tạo bảng/index/FK của `CoachProfile` và dữ liệu backfill Coach nếu đã được duyệt.
6. Nếu migration sinh DDL cho Payment/Invoice/Refund/VNPay, dừng lại, xóa migration vừa sinh bằng cơ chế EF phù hợp và báo người dùng; không tự sửa DDL để che vấn đề.

Việc snapshot thay đổi do thêm `CoachProfile` là bình thường; việc snapshot làm mất hoặc tự ý đổi model Payment là không hợp lệ.

## 4. Hai quyết định đang mở — không được tự đoán

### 4.1 Entity đại diện PT session/result

Code hiện tại lưu `WorkoutResult.EnrollmentId`, trong khi `Enrollment` thuộc Yoga/Group X. SSOT §7 cấm tự xem Enrollment lớp nhóm là PT session.

Trong đợt triển khai này:

- được thêm kiểm tra category để chỉ `PersonalTrainer` truy cập code Training hiện tại;
- được sửa Workout Plan và Coach–Member relationship theo category;
- **không đổi schema `WorkoutResult`, không tạo PT Session giả, không tái sử dụng Enrollment Yoga/Group X**;
- UI không được tuyên bố luồng ghi kết quả PT đã hoàn chỉnh nếu entity PT session chưa được chốt;
- tạo issue/TODO có liên kết SSOT §7 và ghi rõ acceptance test nào đang bị block.

Chỉ triển khai lại `WorkoutResult` sau khi người dùng chốt entity PT session, trạng thái, booking/cancel/reschedule/no-show và liên kết quota.

### 4.2 Vòng đời CoachProfile khi đổi role

Chưa chốt soft-disable hay giữ record lịch sử. Không cascade delete `CoachProfile`.

Trước khi code `ChangeRoleAsync` cho chuyển vào/ra role Coach, AI phải hỏi người dùng chọn một trong hai hướng:

- giữ `CoachProfile` làm lịch sử, role hiện tại quyết định profile có hiệu lực; hoặc
- thêm trạng thái/soft-disable có quy tắc rõ ràng.

Cho đến khi được chốt, không thêm `IsActive`, `DeletedAt` hay tự xóa record. Tạo Coach mới vẫn phải có category ngay trong cùng transaction.

## 5. Khoảng cách giữa code hiện tại và yêu cầu

Các điểm đã thấy khi lập plan:

- chưa có `CoachProfile`/`CoachCategory` trong Identity hoặc `SportHubDbContext`;
- `CreateStaffAccountRequest` chỉ nhận role, chưa bắt category khi tạo Coach;
- `UserAdminResponse`, `/api/users/me`, login response và frontend session chưa trả category;
- policy `Coach` hiện chỉ kiểm role, nên cả hai loại Coach đều gọi được Training/AI;
- `AttendanceCheckIn` hiện cho `Coach` hoặc `Receptionist`, trái BR-98 mới;
- `AttendanceService` còn cho Coach được gán buổi điểm danh;
- endpoint roster hiện cho Coach xem roster buổi mình dạy;
- `BuildSessionAsync` chỉ kiểm role Coach, chưa bắt `ClassInstructor` cho Yoga/Group X;
- `CoachMemberRelationshipService` có thể tạo quan hệ cho mọi Coach và còn tự sinh `ClassBased` từ đăng ký lớp;
- `WorkoutService` và `AiController` chưa kiểm `CoachCategory`;
- frontend dùng một menu Coach chung, để lộ attendance/members/plans/AI cho `ClassInstructor`;
- demo seed đã có ba Coach đúng tên (`coach.yoga`, `coach.groupx`, `coach.pt`) nhưng chưa có category.

## 6. Trình tự triển khai

### Phase 0 — Bảo vệ working tree và tạo baseline

1. Chụp `git status --short`; không reset hay ghi đè thay đổi đang có của người dùng.
2. Liệt kê chính xác file Payment đang được sửa và đưa vào danh sách không chạm.
3. Chạy baseline build/test ngoài Payment:
   - `dotnet build backend/SportHub.sln` nếu working tree hiện tại build được;
   - test Identity/Security, Scheduling, Training/AI liên quan;
   - `npm`/`pnpm` lint, typecheck và các Playwright test không phụ thuộc Payment.
4. Nếu baseline hỏng do nhánh Payment đang làm dở, ghi nhận lỗi có sẵn; không sửa Payment để làm xanh.

**Điều kiện qua phase:** có danh sách lỗi baseline và danh sách file cấm chạm.

### Phase 1 — Domain Identity: CoachProfile

Tạo trong `SportHub.Identity`:

- `Domain/Enums/CoachCategory.cs` với đúng hai giá trị `PersonalTrainer`, `ClassInstructor`;
- `Domain/Entities/CoachProfile.cs`:
  - `UserId` là PK đồng thời FK đến `UserAccount.UserId`;
  - `CoachCategory` bắt buộc;
  - không có email, tên, phone, password, salary, rate, commission hay contract;
- navigation `UserAccount.CoachProfile`;
- `Infrastructure/Persistence/Configurations/CoachProfileConfiguration.cs`:
  - bảng `coach_profiles` theo convention hiện tại;
  - quan hệ 1–1;
  - không cascade delete lịch sử nếu chưa có quyết định ở §4.2.

Thêm `DbSet<CoachProfile>` vào `SportHubDbContext`, nhưng chưa tạo migration ở phase này.

Tạo một service/query dùng chung trong Identity, ví dụ `ICoachProfileReader`, có các thao tác:

- lấy category của một user;
- bắt buộc user là Coach và có profile;
- bắt buộc category cụ thể, trả `403 coach_category_forbidden` khi sai category;
- phân biệt dữ liệu lỗi (`Coach` thiếu profile) với người dùng không đủ quyền để log/monitor được invariant hỏng.

Không đưa category thành role mới và không thay `UserRole`.

**Acceptance:** model tạo được; mỗi `UserId` tối đa một profile; enum serialize theo convention API hiện tại.

### Phase 2 — Admin account và self-service contract

Sửa các contract quản trị:

- `CreateStaffAccountRequest` thêm `CoachCategory? CoachCategory` hoặc string được validate;
- khi `Role = Coach`: category bắt buộc và chỉ nhận hai giá trị hợp lệ;
- khi role khác Coach: từ chối category thừa để tránh dữ liệu mơ hồ;
- `UserAdminService.CreateStaffAsync` tạo `UserAccount`, `UserProfile`, credential và `CoachProfile` trong cùng transaction/`SaveChanges`;
- audit `CREATE_STAFF_ACCOUNT` ghi thêm category khi role Coach;
- `UserAdminResponse` thêm `CoachCategory?`;
- `MyAccountResponse` và response đăng nhập/Google đăng nhập thêm `CoachCategory?`, nhưng **không thêm category vào JWT role claim**;
- category phải được đọc lại từ DB tại các action nhạy cảm; không tin localStorage hoặc body client.

Admin frontend:

- `frontend/src/lib/types.ts` thêm type `CoachCategory` và field nullable;
- màn hình `admin/users` chỉ hiện select category khi chọn role Coach;
- không submit category với role khác;
- bảng/list/detail hiển thị badge `Personal Trainer` hoặc `Class Instructor` cho Coach;
- form đổi role chỉ thêm xử lý Coach sau khi §4.2 được người dùng chốt.

Trang `/account` vẫn dùng chung cho hai category và chỉ sửa profile/password hiện có; category là read-only.

**Acceptance:** không thể tạo Coach thiếu category; tạo non-Coach không sinh `CoachProfile`; response self/admin nhất quán.

### Phase 3 — Authorization theo category ở backend

Giữ policy role-level hiện tại để chặn thô, sau đó kiểm category trong service/controller. Không chỉ dựa vào menu frontend.

Nguyên tắc:

- role claim xác nhận user là `Coach`;
- DB `CoachProfile` xác nhận user là `PersonalTrainer` hay `ClassInstructor`;
- ownership/relationship xác nhận user được thao tác đúng record;
- cả ba lớp kiểm tra đều cần thiết cho Training/AI.

Không tạo policy giả chỉ đọc category từ JWT vì category có thể thay đổi trong DB trong khi token cũ còn hạn.

Nếu muốn tạo authorization handler tùy chỉnh, handler phải query scoped service/DB và có integration test; không nhét logic domain vào frontend.

### Phase 4 — Scheduling và Attendance

Backend Scheduling:

1. Khi Manager tạo/sửa/sinh session Yoga/Group X, validate `coachId`:
   - role phải là Coach;
   - có `CoachProfile`;
   - category phải là `ClassInstructor`;
   - vẫn kiểm conflict như hiện tại.
2. Endpoint lịch của tôi phải lấy `coachId` từ JWT, không nhận target Coach từ client.
3. Tạo DTO lịch Coach tối thiểu cho endpoint `mine`, đặc biệt với `ClassInstructor`: bộ môn, tên lớp, ngày/giờ, phòng, trạng thái. Không trả roster hoặc hồ sơ Member.
4. Đổi quyền ghi attendance Yoga/Group X thành **Receptionist only**:
   - sửa `SportHubPolicies.AttendanceCheckIn` và mapping policy;
   - bỏ nhánh Coach ghi điểm danh trong `AttendanceController`/`AttendanceService`;
   - vẫn chỉ nhận `Present`/`Absent`; `NoShow` do finalizer hiện hành;
   - Center Manager không tự động kế thừa quyền ghi.
5. Quyền đọc roster/attendance để Receptionist thực hiện điểm danh phải tách khỏi `StaffRead`; `ClassInstructor` không được xem roster/hồ sơ Member.
6. Không để booking Yoga/Group X tự sinh `CoachMemberRelationship` cho `ClassInstructor`.

Frontend:

- giữ màn hình `/receptionist/attendance` là nơi điểm danh Yoga/Group X;
- bỏ link/action attendance khỏi ClassInstructor;
- manager class/session form chỉ liệt kê Coach category `ClassInstructor` trong selector Yoga/Group X;
- nếu backend chưa có endpoint filter coach theo category, mở rộng API admin/staff-read theo cách không lộ dữ liệu nhạy cảm.

**Acceptance:** Receptionist điểm danh thành công; cả PT và ClassInstructor gọi API điểm danh lớp đều nhận 403; Manager không điểm danh; ClassInstructor chỉ xem session của mình và không đọc roster.

### Phase 5 — Training và quan hệ PT

Trong `CoachMemberRelationshipService`:

- `CreateAsync` chỉ nhận target Coach category `PersonalTrainer`;
- `EnsureClassBasedAsync` không tạo relationship cho `ClassInstructor`;
- vì Yoga/Group X chỉ gán `ClassInstructor`, booking lớp nhóm không được dùng làm nguồn cấp quyền Training;
- search của Coach vẫn ép `coachId` theo JWT như hiện tại và bổ sung kiểm category PT.

Trong `WorkoutService` và `WorkoutController`:

- tất cả action Coach đọc/tạo/sửa plan phải yêu cầu `PersonalTrainer` trước khi kiểm relationship;
- mọi truy vấn Coach phải tiếp tục filter theo Coach hiện tại, không nhận `coachId` tùy ý;
- Member vẫn được đọc plan/result của chính mình theo BR-25;
- `ClassInstructor` gọi trực tiếp endpoint plan/result nhận 403;
- không đổi schema/result flow đang bị block ở §4.1.

Manager frontend `coaching-relationships` chỉ liệt kê `PersonalTrainer`; không cho chọn `ClassInstructor`.

**Acceptance:** PT có quan hệ Active dùng plan được; PT ngoài quan hệ bị 403; ClassInstructor luôn bị 403 và không tạo ra relationship/plan mới.

### Phase 6 — AI workout suggestion

Sửa `AiController`/service:

- trước khi đọc Member profile/history hoặc gọi provider, bắt buộc requester là `PersonalTrainer`;
- sau đó mới kiểm `CoachMemberRelationship.Status = Active`;
- `ClassInstructor` nhận 403 và không tạo `AiLog`;
- PT hợp lệ tiếp tục dùng đủ input BR-26 và logging BR-27 hiện tại;
- không mở chatbot Flow 6.

Frontend chỉ hiển thị AI page/menu cho `PersonalTrainer`. Direct navigation của `ClassInstructor` cần chuyển về dashboard Instructor hoặc hiện trang không đủ quyền, nhưng backend vẫn là lớp bảo vệ quyết định.

**Acceptance:** PT hợp lệ tạo suggestion/log; ClassInstructor không gọi provider và không ghi log giả.

### Phase 7 — Hai trải nghiệm frontend Coach

Đề xuất route rõ ràng:

- `/coach` là dispatcher theo `user.coachCategory`;
- `/coach/pt` là dashboard PT;
- `/coach/pt/schedule`, `/coach/pt/members`, `/coach/pt/training-plans`, `/coach/pt/ai-suggestions`;
- `/coach/class-instructor` là dashboard Yoga/Group X;
- `/coach/class-instructor/schedule` là lịch được Manager giao;
- `/account` tiếp tục là profile/password chung.

Có thể giữ redirect từ các URL Coach cũ để không phá bookmark, nhưng redirect phải xét category. Không copy nguyên các page thành hai bộ trùng logic; tách component dùng chung cho bảng lịch.

Thay `NAV_BY_ROLE` cố định bằng hàm tạo navigation theo `SessionUser`:

- PT: overview, schedule, assigned members, training plans, AI; result page chỉ bật theo phạm vi không bị §4.1 block;
- ClassInstructor: overview và schedule; link account chung được AppShell thêm như hiện tại;
- không có attendance, members, training plan hoặc AI trên menu Instructor.

Session/local storage có thể lưu `coachCategory` để render UX, nhưng không được dùng nó làm bằng chứng authorization.

Dashboard Instructor chỉ hiển thị dữ liệu lịch an toàn; không hiển thị `confirmedCount`, roster hoặc link chi tiết Member nếu API contract đã được thu hẹp.

**Acceptance:** đăng nhập bằng ba tài khoản demo đưa tới đúng trải nghiệm; gõ URL PT bằng tài khoản Instructor không sử dụng được chức năng.

### Phase 8 — Demo seed không đụng seed Payment

Không sửa các hàm seed invoice/payment/refund đang có.

Ưu tiên tạo seeder nhỏ riêng, ví dụ `CoachProfileDemoSeeder`, chạy sau `DemoDataSeeder` và upsert theo email:

- `coach.yoga@sporthub.vn` → `ClassInstructor`;
- `coach.groupx@sporthub.vn` → `ClassInstructor`;
- `coach.pt@sporthub.vn` → `PersonalTrainer`.

Seeder phải idempotent và không đổi email/password/profile/Payment của tài khoản đã tồn tại. Nếu cần backfill production, làm trong migration/data migration riêng sau khi người dùng duyệt mapping; không suy đoán category từ tên/email ngoài ba tài khoản demo đã biết.

### Phase 9 — Migration sau khi Payment ổn định

Thực hiện đúng quy trình §3.2. Migration dự kiến chỉ gồm:

- bảng `coach_profiles`;
- PK/FK 1–1 tới `user_accounts`;
- cột enum/category theo convention PostgreSQL hiện tại;
- dữ liệu seed/backfill chỉ khi có mapping được duyệt.

Kiểm tra `database update` trên DB mới và DB đã có dữ liệu. Không xóa Coach lịch sử và không cascade vào Training/Scheduling.

### Phase 10 — Test bắt buộc

Backend integration tests tối thiểu:

1. Admin tạo Coach thiếu/sai category → 400.
2. Admin tạo PT/Instructor hợp lệ → account và profile cùng tồn tại.
3. Non-Coach không có profile; category thừa → 400.
4. Manager chỉ gán `ClassInstructor` vào Yoga/Group X session.
5. `GET class-sessions/mine` chỉ trả lịch của chính Coach.
6. Instructor không xem roster và không ghi attendance.
7. Receptionist ghi Present/Absent được; Manager/Coach bị 403.
8. Manager tạo relationship với PT được; với Instructor bị từ chối.
9. Instructor bị 403 ở mọi Coach action của Training.
10. PT có Active relationship tạo plan được; PT khác bị 403.
11. Instructor gọi AI → 403, provider không chạy, `AiLog` không tăng.
12. PT hợp lệ gọi AI → success và có log.
13. `/api/users/me` và login response trả đúng category/null.
14. Role-change test theo quyết định được duyệt ở §4.2.

Frontend/component/Playwright:

- PT thấy menu PT; Instructor chỉ thấy overview/schedule/account;
- admin bắt category khi tạo Coach;
- manager selector phân biệt Instructor và PT;
- receptionist attendance flow vẫn chạy;
- Instructor gõ thẳng URL PT không thao tác được;
- không sửa snapshot/test Payment để làm xanh giả.

Chạy test theo tầng:

1. targeted tests Identity/Admin;
2. targeted tests Scheduling;
3. targeted tests Training/AI;
4. frontend typecheck/lint;
5. Playwright role flows;
6. full backend/frontend suite sau khi đã đồng bộ nhánh Payment.

Nếu full suite hỏng do Payment đang làm dở, báo riêng; không sửa Payment trong task này.

## 7. Danh sách file dự kiến

### Tạo mới

- `backend/SportHub.Identity/Domain/Enums/CoachCategory.cs`
- `backend/SportHub.Identity/Domain/Entities/CoachProfile.cs`
- `backend/SportHub.Identity/Infrastructure/Persistence/Configurations/CoachProfileConfiguration.cs`
- service/interface đọc và kiểm category trong Identity;
- integration tests cho category/RBAC;
- component/route frontend tách PT và ClassInstructor;
- seeder CoachProfile riêng nếu dùng;
- migration `AddCoachProfiles` ở phase cuối.

### Sửa chính

- `backend/SportHub.Identity/Domain/Entities/UserAccount.cs`
- `backend/SportHub.API/Persistence/SportHubDbContext.cs`
- `backend/SportHub.Administration/Application/Commands/UserAdmin/CreateStaffAccountRequest.cs`
- `backend/SportHub.Administration/Application/DTOs/UserAdmin/UserAdminResponse.cs`
- `backend/SportHub.Administration/Application/Services/UserAdminService.cs`
- Identity account/auth DTO projections;
- `backend/SportHub.BuildingBlocks/Api/SportHubPolicies.cs`
- `backend/SportHub.API/Extensions/AuthorizationPolicyExtensions.cs`
- Scheduling session/attendance controllers and services;
- Training relationship/workout controllers and services;
- `backend/SportHub.AI/Api/AiController.cs` và/hoặc application service;
- `frontend/src/lib/auth.tsx`, `frontend/src/lib/types.ts`;
- `frontend/src/components/AppShell.tsx`;
- admin users, manager class/relationship, receptionist attendance và Coach pages liên quan.

Danh sách này không cho phép sửa file Payment chỉ vì chúng cùng được tham chiếu từ composition root.

## 8. Chia commit để dễ review và tránh conflict

Khuyến nghị tách:

1. `feat(identity): add coach profile domain and contracts` — chưa migration;
2. `feat(admin): require coach category for coach accounts`;
3. `fix(scheduling): restrict class assignment and attendance by coach category`;
4. `fix(training-ai): enforce personal trainer category`;
5. `feat(frontend): split PT and class instructor experiences`;
6. `test: cover coach category authorization`;
7. `chore(db): add coach profiles migration` — chỉ sau khi Payment đã đồng bộ.

Không gộp migration Coach với commit Payment. Không format hàng loạt hoặc đổi tên file ngoài scope.

## 9. Definition of Done

Chỉ đánh dấu hoàn thành khi:

- một role Coach duy nhất vẫn được giữ;
- mọi Coach mới có exactly one `CoachProfile` và category hợp lệ;
- PT/Instructor có UI khác nhau;
- backend từ chối Instructor ở Training/AI/attendance/roster dù gọi API trực tiếp;
- chỉ Receptionist ghi attendance Yoga/Group X;
- Manager chỉ gán Instructor vào lịch Yoga/Group X và chỉ gán PT vào relationship cá nhân;
- không tạo relationship PT từ booking lớp nhóm;
- profile/password self-service hoạt động cho cả hai category;
- không có field/module payroll;
- không có file/behavior Payment bị thay đổi;
- migration Coach chỉ chứa DDL CoachProfile;
- targeted tests xanh; full suite được chạy sau khi nhánh Payment ổn định;
- các phần bị chặn bởi PT session và CoachProfile role-change được ghi rõ, không được báo hoàn thành giả.

## 10. Prompt bàn giao ngắn cho AI triển khai

> Triển khai `docs/coach-specialization-code-implementation-plan.md` theo đúng thứ tự phase. Đọc SSOT và BR-96–BR-101 trước khi sửa. Giữ một `UserRole.Coach`, thêm `CoachProfile.CoachCategory` để phân biệt `PersonalTrainer` và `ClassInstructor`; backend phải kiểm category + ownership, không chỉ ẩn menu. Không sửa bất kỳ Payment/Invoice/Refund/VNPay/revenue/payroll nào. Không tạo migration cho tới khi nhánh Payment của người dùng ổn định và migration Coach đã được kiểm tra chỉ chứa DDL CoachProfile. Không tự quyết định mô hình PT session/result hoặc vòng đời CoachProfile khi đổi role; dừng và hỏi người dùng tại hai decision gate đó. Bảo toàn mọi thay đổi đang có trong working tree, triển khai/test theo từng phase và báo rõ file đã sửa, test đã chạy, phần còn bị block.
