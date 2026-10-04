# Giao việc Khoa — Cấu hình, nhật ký và System Admin

SportHub là **hệ thống quản lý trung tâm thể thao với ba môn Gym (bao gồm PT), cầu lông và bóng rổ; có thể mở rộng**. PT là dịch vụ thuộc Gym, không phải môn thứ tư.

**Khoa có khối lượng ít nhất: 9 mục page/tab/flow, phạm vi rõ, chủ yếu dùng pattern có sẵn.** Không phụ trách điều phối API toàn nhóm hoặc toàn bộ nền tảng; chỉ triển khai Table/State nhỏ theo contract An. Không phụ trách checkout, report/export, tạo lớp, PT, incident hoặc AI. An giữ nền tảng kỹ thuật; Khôi là UI/UX Lead.

Đọc [DESIGN-SKILLS-GUIDE](../../DESIGN-SKILLS-GUIDE.md), [DESIGN-TOKENS](../../DESIGN-TOKENS.md), [PRODUCT](../../PRODUCT.md) và [nguồn nghiệp vụ](../00-Source-of-Truth.md). Dùng Impeccable UX → Taste UI phù hợp → critique/audit/polish theo guide; ChatGPT Plus để shape/review, Antigravity cùng bundle để code/test.

## Bắt đầu tuần 05–11/10

- **Làm trước:** Làm Table/FilterBar/StatusChip và các state theo contract An, dùng ngay trên mẫu Admin list; An vẫn giữ owner shared.
- **Thứ tự trang:** Admin tài khoản → Danh mục/giá → Settings/nhật ký → tự kiểm và sửa phần đã giao.
- Bảng tên trang, hạn mục tiêu và tiêu chí xong: [kế hoạch FE một tuần](KE-HOACH-FE-1-TUAN.md). Phần bên dưới giữ đặc tả đầy đủ để tra khi làm từng trang.
- Chỉ ghi “Hoàn thành” khi UI + API thật + kiểm chứng đạt; fixture có nhãn là “Xong UI – chờ API”. Không chờ toàn bộ backend/shared xong mới bắt đầu.


## 1. Phạm vi và phần đã chuyển

| Phạm vi trước đây | Owner hiện tại |
|---|---|
| Q01–Q07, Q13–Q18, Q28: tổng quan/lịch/lớp, HLV, sân/sự cố, notices, AI | [Khôi](02-KHOI-LANDING-PUBLIC.md) trực tiếp triển khai và nghiệm thu |
| Q08–Q12, Q19–Q23: nguyện vọng, PT/Member vận hành, finance/reports/export | [An](01-AN-MEMBER-SHARED.md) trực tiếp triển khai và nghiệm thu |
| Q24–Q27, Q29–Q33: danh mục/tham số/nhật ký và Admin | **Khoa** |
| G03/G06/G07/G13 | **Khôi**, theo page mới |
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
| Q31 | Tạo tài khoản nhân sự | `/admin/users/new` | Admin/Manager/Receptionist theo đề; tạo Coach đi luồng Manager; Member/ExternalCoach qua registration |
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

Endpoint chi tiết đọc [API contract](../api-contract.md) và controller hiện hành; không coi mọi user mutation đều cho mọi role. Khoa tạo nhân sự đúng scope đề, Coach đi luồng Manager của Khôi; Member/ExternalCoach dùng registration của Khôi.

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
4. Merge từng nhóm nhỏ; không chờ hoặc nhận thêm việc Manager khác khi chưa có phân công mới.


## 6. Checklist nghiệm thu

- [ ] Đủ 9 mục Q được giao và states loading/empty/no-results/error/forbidden/success.
- [ ] Danh mục không xóa dữ liệu đã tham chiếu; giá/version/validation theo server, Gym/PT theo CAT-01 An chốt.
- [ ] Settings giải thích tác động, không thay hold/OTP policy tùy ý.
- [ ] Admin list/detail reload được với G10; không đọc finance/training trái quyền khi sửa URL.
- [ ] Tạo/đổi role/khóa/mở có review, lý do và backend guard; không tự khóa hay khóa Admin cuối.
- [ ] Audit đúng actor/scope; Q27/Q33 không lộ dữ liệu role khác.
- [ ] Dùng tokens/shared đã thống nhất; mobile, keyboard, VI/EN, focus và lỗi dài đạt checklist guide.
- [ ] Bàn giao screenshot/state matrix, API thật đã nối, check đã/chưa chạy và blocker. Không cần ký duyệt phần người khác.

Code đầu vào: `features/catalog`, `features/administration`, routes catalog/settings/audit của Manager và `app/admin`. Phối hợp ở từng file với An/Khôi; không chiếm toàn bộ thư mục Manager.

Mapping routes cũ: sports/court-rates/membership-plans → Catalog; giữ alias/query/deep-link theo route contract An. Room-types Q16 và Facilities Q15 đã chuyển cho Khôi; Khoa chỉ tiêu thụ dữ liệu tham chiếu, không thiết kế hai trang loại sân.
