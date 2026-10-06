# Giao việc Khoa — Cấu hình, nhật ký, System Admin và vận hành Manager

SportHub là **hệ thống quản lý trung tâm thể thao với ba môn Gym (bao gồm PT), cầu lông và bóng rổ; có thể mở rộng**. PT là dịch vụ thuộc Gym, không phải môn thứ tư.

**Từ 05/10/2026 Khoa giữ 23 mục page/tab/flow: 9 mục cấu hình/nhật ký/Admin (KO-01…KO-03) và 14 mục Manager vận hành nhận từ Khôi (KO-04, KO-05: Q01–Q07, Q13–Q18, Q28).** Không phụ trách điều phối API toàn nhóm hoặc toàn bộ nền tảng; chỉ triển khai Table/State nhỏ theo contract An. Không phụ trách checkout, report/export, PT/Member vận hành (An). An giữ nền tảng kỹ thuật; Khôi là UI/UX Lead và review màn mẫu class/incident.

Đọc [DESIGN-SKILLS-GUIDE](../../DESIGN-SKILLS-GUIDE.md), [DESIGN-TOKENS](../../DESIGN-TOKENS.md), [PRODUCT](../../PRODUCT.md) và [nguồn nghiệp vụ](../00-Source-of-Truth.md). Dùng Impeccable UX → Taste UI phù hợp → critique/audit/polish theo guide; ChatGPT Plus để shape/review, Antigravity cùng bundle để code/test.

## Bắt đầu tuần 05–11/10

- **Làm trước:** Làm Table/FilterBar/StatusChip và các state theo contract An, dùng ngay trên mẫu Admin list; An vẫn giữ owner shared.
- **Thứ tự trang:** Admin tài khoản → Danh mục/giá → Settings/nhật ký → Manager lớp/lịch (KO-04) → HLV/sân/sự cố/notices/AI (KO-05) → tự kiểm và sửa phần đã giao.
- Bảng tên trang, hạn mục tiêu và tiêu chí xong: [kế hoạch FE một tuần](KE-HOACH-FE-1-TUAN.md). Phần bên dưới giữ đặc tả đầy đủ để tra khi làm từng trang.
- Chỉ ghi “Hoàn thành” khi UI + API thật + kiểm chứng đạt; fixture có nhãn là “Xong UI – chờ API”. Không chờ toàn bộ backend/shared xong mới bắt đầu.


## 1. Phạm vi và phần đã chuyển

| Phạm vi trước đây | Owner hiện tại |
|---|---|
| Q01–Q07, Q13–Q18, Q28: tổng quan/lịch/lớp, HLV, sân/sự cố, notices, AI | **Khoa** (nhận từ Khôi ngày 05/10/2026; mục 7) |
| Q08–Q12, Q19–Q23: nguyện vọng, PT/Member vận hành, finance/reports/export | [An](01-AN-MEMBER-SHARED.md) trực tiếp triển khai và nghiệm thu |
| Q24–Q27, Q29–Q33: danh mục/tham số/nhật ký và Admin | **Khoa** |
| G03/G06/G07/G13 | **Khoa**, theo page mới (mục 7) |
| D03/D04, CAT-01 và điều phối contract nền tảng | **An** |
| G10 Admin detail | **Khoa**; thay đổi hẹp, không mở rộng StaffRead |

Giữ tên file hiện tại để không làm hỏng link; **ID Q là ID truy vết màn Manager/Admin, không còn đồng nghĩa owner Khoa**. Không phải bàn giao lại phần đã chuyển ở cuối kỳ.

## 2. Page/subpage phải giao

| ID | Page → subpage | Route đề xuất | Chức năng / cấu trúc |
|---|---|---|---|
| Q24 | Danh mục → Bộ môn | `/manager/catalog?tab=sports` | Name, operation type, duration/capacity mặc định, room types, active; không xóa dữ liệu đã tham chiếu |
| Q25 | Danh mục → Gói Gym / Giá PT / Giá thuê sân | `/manager/catalog?tab=...` | Gói, thời hạn, giá; PT price/version; court rates giờ cao/thấp điểm; giá dương bội số 1.000 |
| Q26 | Tham số vận hành | `/manager/settings` | Hold deadline, chốt ngưỡng, hạn phản hồi, giờ hoạt động/nhắc hạn theo contract; helper mô tả tác động |
| Q27 | Nhật ký → Chi tiết sự kiện | `/manager/audit-log` | Actor/time/object/reason/before-after theo dữ liệu thật; liên kết đối tượng còn tồn tại |
| Q29 | Tổng quan Admin | `/admin` | Lối tắt tài khoản, trạng thái và hoạt động quản trị gần đây; không KPI revenue |
| Q30 | Tài khoản → Danh sách → Chi tiết | `/admin/users`, `/admin/users/[id]` | Tìm/lọc role/status, identity đúng quyền; **G10** detail hiện vướng policy |
| Q31 | Tạo tài khoản nhân sự | `/admin/users/new` | Admin/Manager/Receptionist theo đề; tạo Coach đi luồng Manager; Member qua registration |
| Q32 | Đổi role / Khóa / Mở khóa | Dialog trong Q30 | Review target/role/lý do/hệ quả; không tự khóa hoặc khóa Admin cuối |
| Q33 | Nhật ký Admin → Chi tiết | `/admin/audit-log` | Actor/action/reason/time; filter theo endpoint thực tế |

Menu Admin riêng: **Tổng quan · Tài khoản & vai trò · Nhật ký**; không menu doanh thu/thanh toán/điều chỉnh điểm. Q24–Q27 nằm trong menu Manager do An tích hợp route config, không phải portal riêng của Khoa.

## 3. Pattern dùng chung bắt buộc

- Khoa triển khai Table/FilterBar/StatusChip và Loading/Empty/Error/Forbidden/Conflict theo contract An trong task N-KO; An giữ owner kỹ thuật, Khôi review visual. Form/Dialog/AppShell/Header/Notification dùng của An, AccountMenu dùng của Khôi. Không tự viết palette/component thứ hai.
- Khôi review một màn mẫu `Danh mục` và một màn `Admin user detail`; sau đó Khoa reuse pattern cho các màn còn lại.
- Q24–Q25 chỉ là form danh mục theo schema/API đã chốt. **An sở hữu CAT-01**, Khoa không phải tự thiết kế migration Gym/PT.
- Q26 hiển thị giá trị và tác động đúng contract; không tự thêm setting chưa có hoặc quyết định lại hold/OTP policy.
- Q27/Q33 có thể dùng cùng AuditLogTable nhưng dataset/policy đúng actor. Không nhầm dùng chung component với gộp quyền truy cập.

## 4. API gắn với page

Đối chiếu tĩnh, chưa xác nhận runtime/security. Khoa chỉ làm contract/API cần cho 9 mục trên; không tổng hợp hay nghiệm thu thay An/Khôi/Hào.

| Page | API hiện có / dependency | Việc cần làm |
|---|---|---|
| `Q24` | Catalog sports; **CAT-01 An** | List/form/active theo contract; bảo toàn ID/FK |
| `Q25` | Membership packages, PT pricing, court rates; **CAT-01 An** | Form/validation/version/giá theo server; không sửa snapshot invoice |
| `Q26` | System settings, opening hours theo controller hiện hành | Hiển thị quyền, helper tác động, lỗi/conflict; không thêm setting giả |
| `Q27/Q33` | Audit logs | Filter/pagination/detail theo quyền, không tự tạo audit event từ FE |
| `Q29` | Admin APIs hiện có | Dashboard lối tắt/trạng thái; không KPI finance |
| `Q30` | GET /api/users/admin + **G10** | List và deep-link detail đúng quyền Admin |
| `Q31/Q32` | User create/mutations đúng policy | Review target/role/reason; xử lý backend denial rõ ràng |

Endpoint chi tiết đọc [API contract](../api-contract.md) và controller hiện hành; không coi mọi user mutation đều cho mọi role. Khoa tạo nhân sự đúng scope đề, Coach đi luồng Manager của Khôi; Member dùng registration của Khôi.

### Backlog chính được giao

#### G10 — Chi tiết tài khoản cho System Admin [P1; Khoa]

**Bằng chứng:** [UsersController](../../backend/SportHub.Administration/Api/UsersController.cs) list `/api/users/admin` dành Admin, nhưng GET `/api/users/{id}` dùng StaffRead; [policy mappings](../../backend/SportHub.API/Extensions/AuthorizationPolicyExtensions.cs) StaffRead không chứa SystemAdministrator. Deep-link detail Q30 không gọi được bằng quyền Admin theo khai báo hiện tại.

Đề xuất `GET /api/users/admin/{id}` với policy Admin và DTO administration; hoặc policy riêng ở detail hiện có. Không thêm Admin vào toàn bộ StaffRead vì sẽ mở rộng nhiều quyền nghiệp vụ. Test direct detail reload, role changes, no revenue/Member training access.

### Dependency và API không được tự retire

- **CAT-01**: [An](01-AN-MEMBER-SHARED.md) chốt contract/migration; Khoa nối Q24/Q25 và báo lỗi mapping, không ôm migration.
- **G12**: [Hào](03-HAO-RECEPTION-COACH.md) chủ trì StaffRead/Coach scope, An nối Q12; Khoa chỉ regression Q30 để sửa G10 không mở rộng quyền.
- Không còn D03/D04 ở phần Khoa: An sở hữu Q20/legacy refund. Không xóa GET lịch sử hoặc routes khác role vì thấy URL tương tự.
- Không mở Admin vào toàn bộ StaffRead để sửa lỗi detail. Giữ actor/ownership và negative auth tests.

## 5. Thứ tự triển khai và dependency

1. Bắt đầu ngay: đọc assignment, kiểm API, dựng flow/state matrix và mẫu danh mục/Admin detail.
2. Sau khi An bàn giao primitives/shell và Khôi review mẫu: triển khai Q24–Q27, Q29–Q33 bằng pattern đã có.
3. Q24/Q25 chờ contract CAT-01 nếu thay schema; trong lúc chờ tiếp tục Admin/audit/settings. G10 cần hoàn thành trước nghiệm thu detail.
4. Sau nhóm KO-01…KO-03, làm KO-04 (Q01–Q07) rồi KO-05 (Q13–Q18, Q28) theo mục 7; merge từng nhóm nhỏ. Hạn KO-03 và KO-04 cùng 08/10: báo sớm nếu không kịp để chốt lại phạm vi, không tự bỏ page.


## 6. Checklist nghiệm thu

- [ ] Đủ 9 mục Q gốc (mục 2) cộng 14 mục Manager vận hành (mục 7) và states loading/empty/no-results/error/forbidden/success.
- [ ] Danh mục không xóa dữ liệu đã tham chiếu; giá/version/validation theo server, Gym/PT theo CAT-01 An chốt.
- [ ] Settings giải thích tác động, không thay hold/OTP policy tùy ý.
- [ ] Admin list/detail reload được với G10; không đọc finance/training trái quyền khi sửa URL.
- [ ] Tạo/đổi role/khóa/mở có review, lý do và backend guard; không tự khóa hay khóa Admin cuối.
- [ ] Audit đúng actor/scope; Q27/Q33 không lộ dữ liệu role khác.
- [ ] Dùng tokens/shared đã thống nhất; mobile, keyboard, VI/EN, focus và lỗi dài đạt checklist guide.
- [ ] Bàn giao screenshot/state matrix, API thật đã nối, check đã/chưa chạy và blocker. Không cần ký duyệt phần người khác.

Code đầu vào: `features/catalog`, `features/administration`, routes catalog/settings/audit của Manager và `app/admin`. Phối hợp ở từng file với An/Khôi; không chiếm toàn bộ thư mục Manager.

Mapping routes cũ: sports/court-rates/membership-plans → Catalog; giữ alias/query/deep-link theo route contract An. Room-types Q16 và Facilities Q15 do Khoa làm trong KO-05 (mục 7): một trang sân/phòng có tab loại, không thiết kế hai trang trùng.

## 7. Phần nhận thêm từ Khôi — Manager vận hành (KO-04, KO-05)

**14 mục Q chuyển từ Khôi sang Khoa (task KH-03/KH-04 cũ nay là KO-04/KO-05), giữ nguyên ID/route để truy vết.** Dùng AppShell An và Calendar/AI wrapper Hào; cùng design language với Guest nhưng mật độ dành cho vận hành.

| ID | Page → subpage | Route đề xuất | Chức năng / cấu trúc |
|---|---|---|---|
| Q01 | Tổng quan | `/manager` | Việc cần xử lý trước: lớp AtRisk, refund/request chờ duyệt, incident, lịch hôm nay; KPI có khoảng thời gian và link |
| Q02 | Lịch vận hành → Theo sân / Coach / lớp → Chi tiết | `/manager/schedule?view=...` | Ngày/tuần/list; nhận diện lớp/PT/rental/block; filter giữ trên URL; thay đổi lịch mở form review |
| Q03 | Khóa học → Danh sách | `/manager/classes` | Status, môn, keyword, threshold; các saved view Draft/Đang tuyển/AtRisk/Đang học/Lịch sử |
| Q04 | Khóa học → Tạo/sửa | `/manager/classes/new`, `/manager/classes/[id]/edit` | Các bước nội dung → Coach/sân/lịch → giá/chi phí/sĩ số → xem lịch sinh ra → lưu nháp/publish riêng |
| Q05 | Khóa học → Chi tiết | `/manager/classes/[id]` | Tab Tổng quan, Lịch buổi, Học viên, Giữ chỗ, Điều kiện mở lớp, Lịch sử |
| Q06 | Chi tiết lớp → Publish / Dời buổi / Hủy buổi-bù / Hủy lớp | F từ Q05 | Preview xung đột/tác động, lý do, lịch mới, hoàn điểm nếu hủy cả lớp; gửi thông báo qua server |
| Q07 | Điều kiện mở lớp → Xử lý ngưỡng | Tab Q05 hoặc saved view Q03 | Giá/chi phí/ngưỡng/số Confirmed, deadline, phản hồi Member; waive có lý do, không coi hold là đã ghi danh |
| Q13 | HLV trung tâm → Tạo/sửa → Chi tiết | `/manager/coaches`, `/manager/coaches/[id]` | Account Coach, chuyên môn, mô tả, lịch phân công; cảnh báo chuyên môn thay đổi ảnh hưởng lớp hiện tại |
| Q15 | Sân & cơ sở vật chất → Sân/phòng → Chi tiết | `/manager/facilities`, `/manager/facilities/[id]` | Môn tương thích, trạng thái, opening-hours, lịch block; block có hoạt động ảnh hưởng dẫn IncidentWorkbench |
| Q16 | Loại sân/phòng | Tab Q15 hoặc Danh mục | Loại và môn tương thích, validation tham chiếu; không xóa lịch sử |
| Q17 | Sự cố → Tạo/preview/xử lý → Chi tiết | `/manager/incidents`, `/manager/incidents/[id]` | IncidentWorkbench bên dưới; history/detail **G06** |
| Q18 | Thông báo → Soạn/xem trước → Theo dõi gửi | `/manager/notices`, detail | Chọn nhóm đúng quyền, review nội dung/người nhận, idempotency; lịch sử danh sách **G07** |
| Q28 | AI xếp lịch | Drawer từ Q04/Q02 | Gợi ý → Xem lại & Chỉnh sửa → Lưu nháp; **G03**; không tự publish |

### Tạo lớp và xử lý ngưỡng — Q03–Q07

Form nhiều bước trên page riêng, draft dễ quay lại. Review sinh lịch phải thấy tất cả buổi, sân/Coach, xung đột, ngày ngoài giờ mở cửa. Giá/chi phí/sĩ số cùng phần, ngưỡng = ceil(cost/price) là preview; server xác nhận lại và chặn ngưỡng vượt capacity.

Chi tiết lớp ưu tiên status và tác vụ tiếp theo; table học viên/holds tách vì ý nghĩa khác nhau. Khách công khai không thấy cost nội bộ. Công khai giải thích điều kiện mở lớp theo nội dung được duyệt, không render nguyên manager DTO.

Các lựa chọn của Member:

- Chuyển lớp: cùng môn, hợp lệ, còn chỗ, quote chênh; nếu phải trả thêm thì chờ checkout.
- **Chờ đợt sau: hoàn 100% điểm ngay và lưu nguyện vọng nhận tin khóa phù hợp.** Không giữ tiền/ghế và không tự đăng ký khóa mới; giá khóa mới theo checkout mới.
- Hoàn điểm: hoàn 100% theo event/quy tắc, không lưu nguyện vọng nhận tin.

Manager thấy khác nhau giữa “Hoàn điểm” và “Hoàn điểm + nhận tin khóa sau”; không hiển thị cả hai như Transfer pending. Khóa mới publish kích hoạt thông báo matching theo G02, không tự thu điểm.

Q08 nguyện vọng và G02 backend do **An** làm; Khoa gắn entry/status vào Q07. Đóng tuyển sinh G13 là command riêng, không map sang cancel hoặc sửa capacity giả. Khoa sở hữu ClassEditor/ThresholdManager và validation UI; server xác nhận ngưỡng/giá/conflict.

### IncidentWorkbench — Q15/Q17

Một page thực hiện từ preview tới xử lý, không rải ra năm màn mất ngữ cảnh:

1. **Phạm vi:** một sân hoặc toàn trung tâm, thời gian, lý do.
2. **Preview:** tự tải danh sách bị ảnh hưởng; nhóm lớp/PT/rental/pending/block; tổng số buổi/người/lượt thuê và giá trị bồi hoàn khi API cung cấp. Không dùng con số tự ước lượng như quote chính thức.
3. **Phương án từng dòng:** lớp dời hoặc hủy kèm buổi bù; PT dời/hủy theo rule; confirmed rental hủy và hoàn 100% điểm; pending rental hủy và release điểm/slot; existing block xử lý theo resolution option hợp lệ.
4. **Review:** lịch cũ/mới, người nhận, điểm hoàn, thao tác còn chặn; cho Xem lại & Chỉnh sửa. Nút rõ “Xác nhận xử lý và khóa sân”.
5. **Kết quả:** trạng thái từng thao tác, ledger/refund reference, block, thông báo queued/sent/failed. Email fail không phải nghiệp vụ rollback; retry giao hàng không hoàn điểm lại.

**Hiện trạng quan trọng:** backend preview/resolve đã có nhưng `resolve` từ chối khi còn class/PT/block cần xử lý. UI hiện tại có thể dùng các API dời/bù trong cùng workbench rồi preview lại; các bước này không phải một transaction chung. Phải ghi nhận bước đã hoàn thành khi bước sau lỗi, không nói “tất cả đã rollback”. G06 đề xuất enrichment/history và reservation fence để tránh người khác đặt vào khung đang xử lý trước lúc block cuối.

Không gửi thêm manual notice trùng với thông báo tự động cùng sự kiện. Trường hợp cần thông báo bổ sung chỉ cho chọn người/nội dung rõ ràng. Preview cũ khi lịch thay đổi phải reload; không tin `canResolve` cũ sau vài phút.

### HLV, thông báo và AI — Q13/Q14/Q18/Q28

Q13 quản lý HLV nội bộ và specialty theo CAT-01 của An. Q18 là composer/history thông báo; dùng Notification Panel chung của An, không dựng một inbox thứ hai. Q28 dùng AI Drawer của Hào: Xem lại & Chỉnh sửa → lưu nháp bằng ClassEditor; không tự publish.

### API đi cùng phần việc nhận thêm

| Nghiệp vụ | Endpoint hiện có | Consumer / lưu ý |
|---|---|---|
| Lịch sân/availability staff | `GET /api/manager/court-schedule`, `/rentals`; `/api/coaches/me/court-schedule`; `/api/availability/rooms`, `/coaches`, `/rooms/{id}/busy` | Quyền khác nhau, public không dùng trực tiếp |
| Attendance | `GET /api/class-sessions/{id}/roster`; `PUT /api/class-sessions/{id}/attendance/{enrollmentId}` | Lễ tân ghi từng dòng; Coach/Manager đọc theo quyền |
| Lớp Manager | `/api/manager/classes` CRUD/detail/publish/cancel/cancellation-preview/holds/enrollments/threshold-responses/threshold waive/pricing | G13 nếu cần manual close enrollment |
| Incident | `POST /api/manager/incidents/preview`, `/resolve`; `GET /{id}/notifications` | Đã có, còn hạn chế tại G06 |
| Manual notice | `POST /api/manager/notices`; `GET /{id}`, `/by-key/{key}` | Đã gửi/theo dõi được; G07 thiếu history list/preview recipients |
| Catalog/coaches | sports/room-types/rooms/opening-hours/room-blocks/court-rates/membership-packages, manager coaches, system-settings | Tái dùng, gom UI không buộc gom API |

| Mục | Page/subpage | Việc Khoa chịu trách nhiệm |
|---|---|---|
| G03 | Q02/Q04/Q28 | Suggestion chỉ đọc, review/edit rồi tạo nháp; Hào cung cấp wrapper |
| G06 | Q15/Q17; K21–K23 consumer | Incident preview/history/fence/recovery; trạng thái từng bước thật |
| G07 | Q18 | Notice list/recipient preview/delivery không gửi trùng |
| G13 | Q03/Q05/Q06 | Chốt đóng tuyển sinh độc lập hủy lớp, xử lý hold đang tồn tại |
| G02 (consumer) | Q07 | An giữ spec và Q08; tích hợp trạng thái ngưỡng/interest |
| CAT-01 (consumer) | K01–K05/Q13 | An giữ schema/migration; kiểm public catalog và Coach specialty |

### Backlog API Manager vận hành

#### G03 — Manager AI hỗ trợ xếp lịch [P1; Khoa + Hào]

**Bằng chứng:** [AiController](../../backend/SportHub.AI/Api/AiController.cs) `POST chat` chỉ Member; suggestions chỉ Coach PT. Availability và create class đã có, thiếu orchestration gợi ý Manager.

Đề xuất `POST /api/manager/ai/class-schedule-suggestions` body sportId, numSessions, date range, preferred times, optional room/coach IDs; trả `suggestionId`, generatedAt, proposals, proposed fields, warnings/conflicts. Chỉ đọc, không ghi class. Lọc Coach specialty, giờ hoạt động/room compatibility ngay trong service, không tin model tự kiểm.

FE mở review/edit; sau xác nhận dùng **POST `/api/manager/classes` đang có** để lưu nháp. Có thể thêm optional suggestionId làm provenance, không cần thêm endpoint AI có quyền publish. Backend validate lại occupancy tại thời điểm create/save. Nếu cần function-calling theo BR-123, tool registry cũng phải giới hạn và buộc explicit confirmation token/action riêng.

Test role, conflict phát sinh sau suggestion, thiếu provider/dữ liệu, request trễ không ghi đè draft mới, không ghi DB chỉ vì sinh gợi ý. Member/Coach chat không được gọi route Manager.

#### G06 — Sự cố: history/detail, preview đầy đủ và bảo vệ khung giờ đang xử lý [P1; Khoa]

**Bằng chứng:** [IncidentsController](../../backend/SportHub.Scheduling/Rental/Api/IncidentsController.cs) chỉ notifications/preview/resolve; [IncidentService](../../backend/SportHub.Scheduling/Rental/Application/IncidentService.cs) preview trả sourceType/sourceId/time/resolutionOptions, resolve chặn class/PT/block; confirmed rentals hoàn điểm, pending rentals release, cuối cùng mới tạo room block. Không có list/detail route hay preview refund/recipient breakdown đầy đủ.

Đề xuất `GET /api/manager/incidents?from&to&roomId&page&pageSize`, `GET /api/manager/incidents/{id}`; persist initial impacts/outcomes để lịch sử không phải suy từ occupancy đã xóa. Enrich preview: room/class/coach display names, beneficiary counts, confirmed-vs-pending, computed refund points theo item, notification recipients summary (data scoped), required resolution actions và version/fingerprint.

Nâng workflow theo thứ tự: preview → tạo incident draft/fence riêng chặn booking mới vào phạm vi → thực hiện phương án lớp/PT có checkpoint → preview lại → commit rental refunds/final block → outbox. Fence không thể là room occupancy block đè lên occupancy đang tồn tại; thiết kế status/range guard riêng được mọi write kiểm tra trong transaction. Cần release/expiry/recovery fence nếu bỏ dở; không treo sân vô hạn. Đây là phần backend bổ sung, không tuyên bố current resolve đã làm.

Có thể giao giai đoạn đầu chỉ dùng current preview + action riêng + recheck và ghi rõ nguy cơ lịch thay đổi; không nói mọi bước atomic. Mutation cuối nên nhận preview version + idempotency key, trả outcomes/ledger refs/notice IDs để resume sau timeout. Gửi thủ công bổ sung không trùng automated event.

Test incident một sân/toàn trung tâm, PT không room, pending/paid rental, class bù, schedule race giữa preview và commit, failure giữa các bước, repeated resolve, email retry, no double credit, history sau reload. Không lấy preview tổng tiền do FE tự cộng làm nguồn hoàn chính thức.

#### G07 — Lịch sử thông báo thủ công và preview người nhận [P1; Khoa]

**Bằng chứng:** [NoticesController](../../backend/SportHub.Notification/Api/NoticesController.cs) có send/detail/by-key, chưa thấy GET root list hay POST preview. Có thể gửi đúng theo service hiện tại nhưng màn history/review đầy đủ thiếu contract.

Đề xuất `GET /api/manager/notices?status&from&to&page&pageSize`; `POST /api/manager/notices/preview` nhận cùng selector, trả tổng/người nhận được phép/channel và thời điểm; server tính lại khi send. Không cho FE tự upload danh sách email bất kỳ để bypass selector. Dùng Idempotency-Key hiện có khi send, status gắn outbox, retry delivery có dedup.

Test selector Member theo lớp/Coach/Member có rental theo rental window; preview khác actual recipients khi dữ liệu đổi phải giải thích; không resend trùng do timeout.

#### G13 — Đóng tuyển sinh thủ công mà vẫn giữ lớp [P1; Khoa]

**Bằng chứng:** ClassesController có publish/cancel và enum ClassStatus chỉ lifecycle; chưa có close-enrollment command. Sơ đồ UI trước đó có “close”, nhưng cancel không tương đương.

Đề xuất tách enrollment availability khỏi class lifecycle, thêm `POST /api/manager/classes/{id}/enrollment/close {reason}` và reopen nếu nghiệp vụ cho phép. Kiểm tra hold/attempt đang tồn tại, late payment, threshold transfer, public CTA. Chính sách đề xuất: chặn checkout mới, giữ quyền lợi Confirmed; hold cũ xử lý theo deadline/quote đã cam kết, không tự hủy khi chưa chốt rule. Đưa chính sách này vào BR trước implementation command. Trong lúc chưa có, bỏ action active khỏi production UI, vẫn giữ thiết kế/gap ID.

### Checklist nhận thêm

- [ ] Q01 KPI có kỳ đo/nguồn/link; ưu tiên việc cần xử lý, không tự tạo aggregate API cho mọi card.
- [ ] Q02 filter/calendar giữ context; Q04 thấy đủ buổi, conflict và trạng thái draft/publish.
- [ ] Holds khác Confirmed; ngưỡng không vượt capacity; public không thấy cost nội bộ.
- [ ] Dời/hủy buổi xử lý bù và thông báo đúng; hủy lớp có preview, không hoàn điểm hai lần.
- [ ] Q13/Q14 đúng lifecycle/role; suspend không làm mất lịch sử rental.
- [ ] Q15/Q17 liệt kê đủ impacts, không báo đã khóa khi còn class/PT chưa xử lý; email fail không đồng nghĩa refund fail.
- [ ] Q18 preview người nhận và trạng thái delivery; timeout/retry không gửi trùng.
- [ ] Q28 bắt buộc review/edit; conflict khi lưu giữ dữ liệu form.
- [ ] Khôi (UI/UX Lead) review visual của màn mẫu; An review thay đổi shared/financial contract, Hào review calendar/AI contract.

### File triển khai, route và thứ tự phần Manager

Code đầu vào: `app/manager` theo route được giao; `features/courses`, `features/coaches`, `features/incidents` và phần facilities/notices tương ứng. Class/court schedule cũ gom thành Q02 nhưng giữ redirect/query/deep-link. Khoa bàn giao cấu hình navigation cho An, không tự tạo AppShell riêng.

Triển khai mẫu class/incident cùng landing mẫu → Q01–Q07 → HLV/sân → incident/notices/AI theo API. Có thể làm UI states bằng fixture có nhãn trong lúc chờ G03/G06/G07/G13; không báo production complete. API và sự cố tài chính review cùng An; Calendar/AI interaction review cùng Hào.
