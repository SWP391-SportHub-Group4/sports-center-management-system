# Kế hoạch chỉnh sửa FE cho Personal Trainer và Center Manager

> Cập nhật: 28/09/2026  
> Mục tiêu: chuẩn hóa nghiệp vụ, kiến trúc thông tin, UI/UX và song ngữ cho khu vực Personal Trainer, Center Manager và trang tài khoản chung.  
> Nguồn ưu tiên: `docs/00-Source-of-Truth.md` → `docs/Requirements.md` → `docs/Center-Management-System-Design-v2.md` → code hiện tại.

## 1. Kết luận nghiệp vụ cần giữ cố định

1. Hệ thống chỉ có một RBAC role `Coach`; `CoachProfile.CoachCategory` phân loại:
   - `PersonalTrainer`: lịch PT, hội viên được phân công, kế hoạch, kết quả, tiến độ, bài tập về nhà và AI.
   - `ClassInstructor`: chỉ xem lịch Yoga/Group X do Center Manager phân công và dùng trang tài khoản chung.
2. Center Manager là người tạo lớp, cấu hình lịch và phân công Coach. Coach không tự tạo, sửa, hủy, publish lớp hoặc tự đổi lịch.
3. Tất cả Coach được dùng trang tài khoản chung để sửa tên, số điện thoại và đặt/đổi mật khẩu.
4. Center Manager chỉ quản lý chính sách vận hành của trung tâm. System Administrator quản lý tài khoản, role, trạng thái tài khoản và các thiết lập bảo mật/nền tảng nếu sau này có.
5. Không đưa mã `BR-xx`, `SSOT §...`, tên field kỹ thuật hoặc giải thích dành cho developer lên giao diện người dùng.
6. Không sửa logic, endpoint, số liệu, trạng thái hoặc UI nghiệp vụ Payment/Refund/Reconciliation trong kế hoạch này. Riêng màn hình Report/Export chỉ được chỉnh bố cục, nội dung và trải nghiệm; không đổi cách tính doanh thu.

## 2. Audit hiện trạng và độ phủ yêu cầu

### 2.1 Personal Trainer

| Yêu cầu | Hiện trạng | Kết luận |
|---|---|---|
| Lịch PT | Có `/coach/schedule`, hiện đọc `class-sessions/mine` | Có UI nhưng chưa chứng minh được đây là model phiên PT 1:1 đúng nghiệp vụ; cần nối với model PT session khi model đó được chốt |
| Hội viên được phân công | Có `/coach/members` và `CoachMemberRelationship` | Có; cần sửa nội dung, bộ lọc và layout |
| Kế hoạch tập | Có `/coach/training-plans` | Có chức năng tạo/xem; cần thiết kế lại form và localization |
| Kết quả buổi PT | `/coach/attendance` hiện chỉ là thông báo “chưa có” | Thiếu; `WorkoutResult` đang phụ thuộc `Enrollment`, chưa có luồng phiên PT 1:1 phù hợp |
| Tiến độ | Chưa có trang/tổng hợp độc lập | Thiếu; cần model kết quả PT trước, sau đó mới dựng timeline/chỉ số tiến độ |
| Bài tập về nhà | Requirement có nhưng không có entity/API/source event tương ứng | Thiếu; không dựng UI giả. Phải chốt dữ liệu và API trước |
| AI workout suggestion | Có `/coach/ai-suggestions` và đã chặn theo category ở backend | Có; cần chuẩn hóa UX/localization và chỉ cho PT |
| Hồ sơ và mật khẩu | Có `/account`, endpoint self-service dùng chung | Đúng hướng; cần bỏ khối Google linking ở cuối và chuẩn hóa song ngữ |

### 2.2 Center Manager

| Yêu cầu trong `Requirements.md` | Hiện trạng | Việc cần làm |
|---|---|---|
| Xem danh sách Member, Coach và staff | `GET /api/users` cho StaffRead đã có; Manager chưa có page danh bạ riêng | Thêm trang **Người dùng trung tâm / Center directory**, chỉ xem/tìm/lọc/đi tới chi tiết; không cho tạo account, đổi role, khóa/mở khóa |
| Quản lý lớp, bộ môn, phòng, lịch | Có `classes`, `training-rooms`, `class-schedule` | Giữ nghiệp vụ, thiết kế lại form/table/dialog. Bộ môn là catalog cố định theo SSOT, không tạo CRUD bộ môn tùy ý |
| Phân công Coach | Có default coach trong lớp, sửa session và `coaching-relationships` | Tách rõ: Yoga/Group X chỉ chọn `ClassInstructor`; quan hệ PT chỉ chọn `PersonalTrainer`; nhãn và empty state phải nói đúng nghiệp vụ |
| Báo cáo số hội viên | Có API/export member summary nhưng chưa có dashboard/report hiển thị rõ | Bổ sung card/chart/table summary trên trang Reports, ngoài Payment logic |
| Báo cáo đăng ký/mức sử dụng lớp | Chưa có UI report hoàn chỉnh | Bổ sung báo cáo class utilization/enrollment; nếu API thiếu thì làm backend dependency trước |
| Báo cáo doanh thu | Có trang Revenue Report | Có; chỉ chỉnh presentation/localization, không sửa logic Payment |
| Quản lý MembershipPackage | Có `membership-plans` | Có; thiết kế lại form/table/localization |
| Cấu hình chính sách nghiệp vụ | Có `settings` nhưng hiển thị raw key, BR text và setting hủy lớp đã lỗi thời | Đổi thành **Chính sách vận hành / Operational policies**; chỉ hiện tham số thực sự được phép cấu hình |
| Phân quyền hệ thống | Đã chuyển sang System Administrator theo cập nhật 11/09/2026 | Không thêm lại vào Manager; ghi rõ đây không phải thiếu scope |
| Lịch sử thao tác | Có `audit-log` | Có; chuẩn hóa tiêu đề, bộ lọc, tên hành động và chi tiết before/after |

### 2.3 Hai khoảng trống backend không được che bằng FE

1. **PT result/progress:** phải chốt entity đại diện PT session 1:1 và liên kết của `WorkoutResult`. FE chỉ triển khai đầy đủ sau khi endpoint danh sách phiên, ghi kết quả và đọc lịch sử tiến độ tồn tại.
2. **Homework:** chọn một thiết kế chính thức trước khi code:
   - Khuyến nghị: mở rộng kế hoạch tập bằng khái niệm assignment có `AssignedAt`, `DueAt`, `Status`, `CoachNote`, `MemberFeedback`, thay vì dùng chuỗi notification làm dữ liệu gốc.
   - Notification chỉ báo cho Member biết có bài mới; không thay thế bản ghi homework.
   - Chỉ PT có quan hệ active được tạo/xem; Member chỉ xem/cập nhật bài của chính mình.

Không tự thêm entity/migration trong phase FE nếu quyết định backend trên chưa được duyệt.

## 3. Kiến trúc thông tin đề xuất

### 3.1 Menu Personal Trainer

| Thứ tự | VI | EN | Route đề xuất | Nội dung chính |
|---:|---|---|---|---|
| 1 | Tổng quan | Overview | `/coach` | Lịch hôm nay, lịch sắp tới, hội viên active, tác vụ cần xử lý |
| 2 | Lịch PT | PT schedule | `/coach/schedule` | Calendar/list, lọc ngày và hội viên, chỉ các lịch được Manager phân công |
| 3 | Hội viên phụ trách | Assigned members | `/coach/members` | Search/list, hồ sơ tập luyện được phép xem, quick actions |
| 4 | Kế hoạch tập | Training plans | `/coach/training-plans` | Danh sách plan, tạo/sửa plan cho member active |
| 5 | Kết quả & tiến độ | Results & progress | `/coach/progress` | Timeline phiên PT, kết quả, nhận xét, tiến độ theo hội viên |
| 6 | Bài tập về nhà | Homework | `/coach/homework` | Giao bài, hạn hoàn thành, trạng thái và phản hồi |
| 7 | Gợi ý AI | AI suggestions | `/coach/ai-suggestions` | Gợi ý theo mục tiêu/trình độ/lịch sử của member active |

`ClassInstructor` tiếp tục chỉ thấy `Overview`, `Teaching schedule` và link `My account`; không render các route PT. Route guard và backend authorization vẫn là lớp bảo vệ bắt buộc.

### 3.2 Menu Center Manager

Nhóm menu để giảm độ dài và phản ánh công việc:

- **Tổng quan:** Dashboard.
- **Vận hành:** Lịch lớp, Lớp học, Phòng tập, Phân công PT.
- **Con người:** Danh bạ trung tâm (Member/Coach/Receptionist/Manager, read-only đối với account administration).
- **Sản phẩm:** Gói hội viên.
- **Báo cáo:** Tổng quan hội viên, sử dụng lớp, doanh thu và export.
- **Quản trị vận hành:** Chính sách vận hành, Nhật ký thao tác.

Không đưa chức năng User/Role administration vào menu Center Manager. Không thay đổi các mục Payment đang được phát triển ở nhánh khác.

### 3.3 Trang tài khoản chung

Trang `/account` dùng chung cho mọi role, gồm hai card:

1. **Thông tin cá nhân / Personal information:** email chỉ đọc, họ tên, số điện thoại.
2. **Mật khẩu & bảo mật / Password & security:** mật khẩu hiện tại (nếu đã có), mật khẩu mới, xác nhận mật khẩu.

Loại bỏ toàn bộ card **Sign in with Google / Link Google / Unlink Google** ở cuối trang Account và các đoạn giải thích cấu hình kỹ thuật. Backend link/unlink có thể được giữ lại để tránh phá API, nhưng không còn entry point trong UI ở scope này.

## 4. Quy chuẩn localization bắt buộc

### 4.1 Nguyên tắc

- `vi`: 100% tiếng Việt có dấu; `en`: 100% tiếng Anh tự nhiên.
- Không dịch kiểu word-by-word làm sai nghĩa như “Episode room”, “The births are still in place”, “Reduced Roles”, “Sto”.
- Không hardcode chuỗi hiển thị trong page/component nghiệp vụ. Tất cả đi qua dictionary typed (`vi.ts`/`en.ts`) hoặc dictionary theo feature.
- Không dùng map dịch tạm trong `AppShell`; nav, action, validation, status, empty state và toast cùng dùng một nguồn translation.
- Enum/status/error code được map sang label người dùng; không hiển thị raw API code.
- Các key kỹ thuật như `cancellation_deadline_hours` không xuất hiện trên UI.
- Mã BR chỉ nằm trong docs, comment code và test name; không nằm trong title, hint, alert, empty state hoặc toast.

### 4.2 Cấu trúc dictionary

Tách namespace tối thiểu:

```text
common
navigation
account
coach.dashboard / schedule / members / plans / progress / homework / ai
manager.dashboard / directory / rooms / classes / schedule / assignments
manager.memberships / reports / exports / policies / audit
validation
apiErrors
statuses
```

Thêm check CI để bắt:

- key có ở EN nhưng thiếu VI hoặc ngược lại;
- chuỗi JSX hardcode trong các route thuộc scope;
- text chứa `BR-\d+` hoặc `SSOT` trong bundle UI;
- tiếng Việt không dấu đã biết và bản EN còn cụm tiếng Việt (allowlist cho tên riêng).

## 5. Design system và quy tắc bố cục form

### 5.1 Bố cục chung

- Content container căn trái, `max-width` thống nhất; form tác vụ khoảng 720–880 px, table/report có thể rộng hơn.
- Không đặt một input nhỏ giữa một card toàn màn hình như ảnh hiện tại.
- Desktop dùng grid 12 cột; các field có quan hệ cùng nằm một hàng. Tablet/mobile tự xuống một cột.
- Label nằm trên control, left-aligned. Dùng dấu `*` và legend để thể hiện bắt buộc; hint chỉ giải thích điều người dùng cần biết.
- Chiều rộng input phản ánh dữ liệu dự kiến: tên rộng, số lượng hẹp, ngày bắt đầu/kết thúc cùng độ rộng.
- Error đặt ngay dưới field và focus vào field lỗi đầu tiên sau submit.
- Action row nằm dưới form, cùng trục trái với field: primary trước, secondary sau; destructive action tách xa và cần confirm.
- Không dùng placeholder thay label. Không dùng màu làm tín hiệu duy nhất.

Các quyết định này theo hướng dẫn input có chiều rộng phù hợp với nội dung của [GOV.UK Design System](https://design-system.service.gov.uk/components/text-input/), nhóm field liên quan bằng fieldset của [GOV.UK Design System](https://design-system.service.gov.uk/components/fieldset/) và inline validation của [U.S. Web Design System](https://designsystem.digital.gov/components/form/).

### 5.2 Create/Edit Class

Desktop chia như sau:

```text
Tên lớp [8 cột]                 Bộ môn [4 cột]
Phòng [6 cột]                  Coach [6 cột]
Sức chứa [4 cột]               Trạng thái/ghi chú [8 cột nếu có]
[Tạo lớp/Lưu thay đổi] [Hủy]
```

- Form và heading cùng căn trái.
- Khi chọn Yoga/Group X, dropdown Coach chỉ có `ClassInstructor`.
- Khi chọn Personal Training, chỉ có `PersonalTrainer`, capacity khóa ở 1; nếu PT không còn dùng Class entity sau khi chốt model PT session thì loại lựa chọn này theo backend decision, không tự đoán trong FE.
- “Chưa phân công” là lựa chọn rõ ràng, kèm nhắc rằng phải phân công trước khi publish/generate session nếu rule yêu cầu.
- Recurrence và generate session dùng dialog/drawer có date range cùng một hàng: `Từ ngày | Đến ngày`.

### 5.3 Add/Edit Training Room và các subpage tương tự

```text
Tên phòng [8 cột]              Sức chứa [4 cột]
[Thêm phòng/Lưu thay đổi] [Hủy]
```

Áp dụng cùng primitive `FormSection`, `FormGrid`, `FormActions` cho room, membership package, coaching relationship và policy editor để tránh mỗi page tự căn CSS.

### 5.4 Table/list

- Toolbar phía trên: search, filter chính, sort và action cấp trang.
- Header và cell thống nhất casing; số căn phải, text căn trái, action cố định bên phải.
- Mobile chuyển table dày thành horizontal scroll có nhãn hoặc card list, không bóp chữ thành nhiều dòng khó đọc.
- Empty/loading/error state nằm trong vùng data, không làm biến mất toolbar hoặc page context.

## 6. Thiết kế lại Report và Export Data

### 6.1 Report landing

Tách ba tab/section:

1. **Hội viên / Members:** tổng số, active/expiring/expired và trend.
2. **Lớp học / Classes:** số lượt đăng ký, capacity, utilization, cancellation/no-show nếu API hỗ trợ.
3. **Doanh thu / Revenue:** giữ dữ liệu backend hiện tại; chỉ sửa label/format/layout.

Không trộn KPI payment đang pending vào phase FE này. Nếu endpoint summary hoặc utilization chưa có, tạo backend ticket riêng trước khi hiển thị card.

### 6.2 Export flow

Thay các pill lộn xộn bằng một flow rõ ràng:

1. **Chọn báo cáo:** Loại báo cáo.
2. **Chọn khoảng thời gian:** Từ ngày và Đến ngày cùng một hàng; validate `from <= to`.
3. **Chọn định dạng:** CSV/PDF bằng radio hoặc select có mô tả đúng (`CSV`, không phải `CBS/DSV`).
4. **Chọn cột:** checkbox list theo nhóm, có `Chọn tất cả`, `Bỏ chọn tất cả`, hiển thị số cột đã chọn. Tên cột là label nghiệp vụ, không phải raw field.
5. **Tóm tắt:** loại báo cáo, thời gian, định dạng và số cột; nút `Tạo file xuất`.
6. **Lịch sử xuất:** table trạng thái `Đang xử lý / Hoàn tất / Thất bại`, thời điểm, người tạo, format, download, retry và delete theo quyền hiện tại.

Export là action toàn cục của dataset nên đặt trong toolbar/report header, phù hợp pattern data-table toolbar của [IBM Carbon Design System](https://v10.carbondesignsystem.com/components/data-table/usage/). File name theo mẫu `sporthub_<report>_<from>_<to>_<generated-at>.<ext>`; giữ giới hạn PDF và job async đang có.

## 7. Chính sách vận hành hay Cài đặt hệ thống?

### 7.1 Quyết định ownership

- **Center Manager:** chính sách nghiệp vụ/vận hành trung tâm, ví dụ số ngày nhắc gói sắp hết hạn, giới hạn nghiệp vụ đã được requirement cho phép cấu hình.
- **System Administrator:** account, role, lock/unlock, auth/security/platform configuration. Không mặc nhiên được xem/sửa chính sách kinh doanh chỉ vì là admin kỹ thuật.

Vì vậy route hiện tại `/manager/settings` có thể giữ để tránh đổi link, nhưng UI đổi tên:

- VI: **Chính sách vận hành**
- EN: **Operational policies**

Không gọi là “System Configuration” hoặc “System settings”. Nếu sau này có trang platform settings thật, đặt dưới `/admin/settings` và định nghĩa requirement riêng.

### 7.2 Sửa màn hình hiện tại

- Card `parameter` đổi thành `Tham số` / `Parameters`, nhưng ưu tiên tiêu đề page “Chính sách vận hành”.
- Header chuẩn:
  - VI: `Chính sách | Giá trị | Mô tả | Cập nhật lần cuối | Thao tác`
  - EN: `Policy | Value | Description | Last updated | Actions`
- Raw key được map sang tên thân thiện; key chỉ dùng trong request.
- Nút `Sto` đổi thành `Lưu` / `Save`.
- Xóa mô tả BR khỏi UI.
- Loại `cancellation_deadline_hours` khỏi màn hình: rule hiện hành là cố định 30 phút, không còn là setting 12 giờ và không snapshot theo booking.
- `package_expiring_reminder_days` có thể giữ nếu backend/SSOT vẫn cho Manager cấu hình.

## 8. Google login và password onboarding

### 8.1 Kết quả kiểm tra code hiện tại

Hiện trạng **chưa đạt Requirement dòng 103**:

- `GoogleAuthService.LoginAsync` tạo ngay `UserAccount` trạng thái Active, lưu external login, `SaveChanges`, cấp JWT và trả `SuggestedPassword`.
- FE login/register nhận JWT rồi điều hướng vào hệ thống ngay.
- Người dùng chỉ có thể đặt mật khẩu sau đó tại `/account` khi đã authenticated.
- Không có page onboarding bắt nhập và xác nhận mật khẩu trước khi account hoàn tất.
- Card “Sign in with Google” cuối `/account` là flow link/unlink account đã tồn tại, không phải first-login onboarding.

### 8.2 Flow cần triển khai

1. Google xác minh ID token.
2. Nếu external login đã link: login bình thường.
3. Nếu email đã tồn tại nhưng chưa link: tiếp tục chặn theo BR-59; không auto-link.
4. Nếu email mới: backend trả **onboarding ticket ngắn hạn, one-time**, chưa cấp access token ứng dụng và chưa tạo account Active hoàn chỉnh.
5. FE chuyển tới `/auth/google/onboarding` với form:
   - Email Google: read-only.
   - Họ tên: prefill, cho sửa.
   - Số điện thoại: optional/required theo requirement cuối cùng.
   - Mật khẩu.
   - Xác nhận mật khẩu.
   - Đồng ý điều khoản nếu registration thường cũng yêu cầu.
6. Submit ticket + form. Backend transaction tạo account, credential hash, profile và external login; sau thành công mới cấp JWT.
7. Ticket hết hạn/đã dùng/token sai trả lỗi generic và quay về login.

Không sinh hoặc hiển thị `SuggestedPassword`; chính người dùng phải nhập. Bổ sung integration tests cho new email, existing linked, existing unlinked, ticket reuse/expiry, password mismatch/strength và transaction rollback.

## 9. Các phase triển khai cho AI coding

### Phase 0 — Baseline và chống conflict

- Tạo branch riêng từ commit mới nhất sau khi merge phần Coach specialization.
- Ghi nhận file đang sửa dở của Payment; không chạm `backend/SportHub.Payment/**`, payment migrations, payment tests và các component payment-specific.
- Chạy baseline: frontend lint/typecheck/build và test liên quan; lưu lỗi có sẵn.

### Phase 1 — i18n foundation

- Chuẩn hóa typed dictionaries/namespaces.
- Chuyển `AppShell`, common UI, status, validation, toast và API errors sang `t(...)`.
- Thêm check parity VI/EN và forbidden UI text (`BR-`, `SSOT`).
- Chưa thay nghiệp vụ.

### Phase 2 — Shared UI primitives

- Tạo/chuẩn hóa `PageHeader`, `FormSection`, `FormGrid`, `FormActions`, `FilterToolbar`, `DataTableToolbar`, `EmptyState`, `DateRangeField`.
- Sửa responsive, focus, error, required indicator và field widths.
- Không tạo một design system thứ hai nếu `components/ui` hiện tại mở rộng được.

### Phase 3 — Account chung

- Localize `/account` hoàn toàn.
- Giữ update name/phone/password cho tất cả role.
- Bỏ Google link/unlink block và developer copy khỏi UI.
- Test Coach thuộc cả hai category truy cập và cập nhật được.

### Phase 4 — PT navigation và các page đã có backend

- Chuẩn hóa dashboard, schedule, assigned members, training plans, AI.
- Chỉ render cho `PersonalTrainer`; giữ ClassInstructor navigation tối giản.
- Sửa layout/form/table/localization; không giả lập result/homework.

### Phase 5 — Center Manager core UI

- Sửa Rooms, Classes, Class Schedule, Coaching Relationships, Membership Plans.
- Thêm Center Directory read-only từ endpoint hiện có.
- Áp dụng category filter đúng chỗ và layout form căn trái/related fields cùng hàng.
- Không sửa payment-adjustments hoặc payment dashboard logic.

### Phase 6 — Reports, export, policies và audit

- Thêm member/class report UI khi API sẵn sàng.
- Thiết kế lại export flow và history.
- Đổi Settings thành Operational policies; bỏ setting cancellation 12 giờ.
- Chuẩn hóa Audit Log.

### Phase 7 — Google onboarding bắt buộc

- Làm backend pending ticket + completion endpoint trước.
- Thêm `/auth/google/onboarding` và sửa login/register redirect.
- Xóa `SuggestedPassword` khỏi contract sau khi tất cả consumer đã chuyển.
- Security/integration/E2E tests trước khi merge.

### Phase 8 — PT session, result, progress, homework

- Chỉ bắt đầu sau khi decision về PT session và homework data model được duyệt.
- Implement backend/domain/API/test trước, sau đó mới mở route `/coach/progress` và `/coach/homework`.
- Không dùng Enrollment Yoga/Group X để “chạy tạm” cho WorkoutResult PT.

### Phase 9 — QA và nghiệm thu

- Chạy lint, typecheck, build, integration tests và Playwright.
- Visual QA ở 360, 768, 1280 và 1440 px; EN và VI cho mỗi route scope.
- Keyboard-only, visible focus, label association, error announcement, dialog focus trap, contrast và table overflow.
- Kiểm tra role/category bằng deep link, không chỉ bằng menu ẩn.
- Smoke test Payment để chắc rằng thay đổi shared UI/i18n không gây regression, nhưng không sửa Payment trong PR này.

## 10. File/area dự kiến bị tác động

### Frontend

- `frontend/src/components/AppShell.tsx`
- `frontend/src/components/ui.*` hoặc các primitive tương ứng
- `frontend/src/lib/language.tsx`
- `frontend/src/locales/en.ts`, `frontend/src/locales/vi.ts`
- `frontend/src/app/account/page.tsx`
- `frontend/src/app/coach/**`
- `frontend/src/app/manager/**` trừ implementation payment-specific
- `frontend/src/app/login/page.tsx`, `frontend/src/app/register/page.tsx`
- route mới `frontend/src/app/auth/google/onboarding/page.tsx`
- Playwright/unit checks liên quan localization, authorization và responsive layout

### Backend dependency

- Identity Google onboarding contract/service/controller/tests.
- Read-only Center Directory có thể dùng endpoint hiện tại; chỉ thêm DTO/endpoint nếu data hiện tại không đủ.
- Member summary/class utilization API nếu thiếu.
- PT session/result/progress/homework chỉ sau decision riêng.

## 11. Definition of Done

- Chuyển VI/EN không còn chuỗi ngôn ngữ còn sót trong toàn bộ route thuộc scope.
- Không còn `BR-xx`, `SSOT`, raw parameter key hoặc developer instructions trên UI.
- Các form chính căn trái; field liên quan cùng hàng ở desktop và xuống một cột hợp lý trên mobile.
- PT và ClassInstructor nhìn thấy đúng menu/quyền; deep link sai category bị chặn.
- Manager tạo lớp, tạo lịch và phân công đúng category Coach; không có quyền account/role administration.
- Center Manager coverage matrix không còn mục “thiếu” trừ các dependency được ghi ticket và được Product chấp nhận.
- Export có selection rõ ràng, validation, progress/history và nhãn CSV/PDF đúng.
- Operational policies không còn cancellation setting 12 giờ.
- Account chung sửa được tên, số điện thoại, mật khẩu; không còn Google linking block ở cuối.
- Google user mới bắt buộc tự nhập + confirm password trước khi nhận app JWT/hoàn tất account.
- Không có thay đổi nghiệp vụ Payment và không gây regression lên flow Payment hiện có.

## 12. Thứ tự PR khuyến nghị

Không gom toàn bộ vào một PR lớn. Tách tối thiểu:

1. `i18n + shared UI primitives`
2. `common account + PT existing pages`
3. `manager core pages + directory`
4. `manager reports/export/policies/audit`
5. `Google onboarding`
6. `PT session/result/progress/homework` sau khi chốt domain

Mỗi PR phải độc lập build/test được; không trộn migration PT/Google với refactor layout để giảm conflict và dễ review.
