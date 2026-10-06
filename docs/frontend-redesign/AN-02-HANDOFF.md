# AN-02 — Trang chính Member

Cập nhật 06/10/2026 · nhánh `feat/fe-An`, tạo từ `develop` local tại `1fbdbec`.

**Trạng thái: đang tích hợp, chưa nghiệm thu toàn bộ AN-02.** Frontend gọi API hiện có; các kiểm thử trình duyệt dùng mock, không chứng minh backend triển khai/quyền runtime đã đạt.

## Phần đã triển khai

| Page | Route và hành vi |
|---|---|
| A01 | `/member`: buổi tiếp theo trong 30 ngày (lớp + PT), ví, Membership, quota PT, thông báo chưa đọc và hóa đơn ISSUED. Lỗi từng vùng có retry, không thay bằng dữ liệu giả. |
| A02 | Khám phá ở `/member/discover`, chi tiết `/member/discover/[id]`, cả hai giữ MemberShell. Tái sử dụng CourseCatalog/CourseDetail của Khôi qua `detailBasePath`; route public `/courses` giữ riêng, không tạo bản sao catalog. |
| A03 | `/member/schedule`: adapter lên Calendar chung của Hào, ngày/tuần/danh sách, giờ Việt Nam; tải đủ trang PT trong khoảng xem; Drawer chi tiết và điểm danh của chính mình từ schedule API. |
| A04 | `/member/courses`: Sắp học/Đang học/Lịch sử/Tất cả; tải đủ trang enrollment trước lọc; `/member/courses/[classId]`: ghi danh, lịch buổi, Coach/phòng/buổi bù và link invoice item. Kiểm ownership vẫn thuộc backend. |
| A05–A06 | `/member/services?tab=gym|pt|visits`: Membership, ngày hiệu lực, mua/gia hạn qua component hiện hữu; quota PT remaining/reserved/consumed và hạn bảo lưu; lịch vào ra Gym phân trang từ endpoint self. |
| A17 | `/notifications?tab=all|unread`: đọc/đọc tất cả qua API; disable khi mutation chạy, giữ unread khi lỗi; đồng bộ badge chuông. Endpoint self dùng cho mọi role, link nghiệp vụ Member chỉ hiện với Member. |

Alias `/member/class-schedule`, `/member/my-registrations`, `/member/my-plans` chuyển đến route mới và giữ query (kể cả query lặp). Tabs giữ URL và Back/Forward. Shell bổ sung entry và sửa nút ngôn ngữ trong menu mobile.

Notification link chỉ map các nguồn đã biết. `PAYMENT_RECEIVED` dẫn đến danh sách hóa đơn vì publisher legacy có thể dùng package ID; không mặc định mọi sourceEntityId là invoice ID. Thông báo thủ công không được gán link lịch tùy ý.

## Kiểm tra đã chạy

- `npm run typecheck`, `npm run build`, `npm run check:i18n`: đạt.
- `npm run lint`: không lỗi; còn 5 warning unused import có sẵn ở trang Coach AI.
- Chrome, video off: `npx playwright test tests/member-main.spec.ts tests/member-finance.spec.ts --reporter=list`: 15 case đạt (11 AN-02, 4 hồi quy AN-01).
- Bao phủ phân trang PT và enrollment, chi tiết buổi, ID không có trong enrollment self, alias giữ query, tab/Back/reload, lịch lỗi, notification mutation thành công/thất bại, quota/lịch sử Gym và responsive.
- Đã xem ảnh [desktop 1440px](evidence/an02/desktop.png) và [mobile tiếng Việt 390px](evidence/an02/mobile-vi.png); kiểm tràn ngang mobile đạt. Ảnh dùng dữ liệu mock có trong test, không phải tài khoản thật.

## Việc còn lại để đóng AN-02

- **Hào / Calendar chung:** chưa có chế độ tháng trong `CalendarView`; không dựng Calendar thứ hai. Chưa thêm export `.ics` ở adapter Member.
- **Backend A04:** `GET /api/members/me/classes/{classId}/sessions` hiện trả `ClassSessionResponse`, không có attendance của Member. Điểm danh hiện xem được trong Drawer lịch qua `/members/me/schedule`; chưa có bảng điểm danh đầy đủ trong chi tiết khóa, nhất là enrollment đã kết thúc.
- **Backend A06:** `PtEntitlementResponse` không có `memberPackageId`/tên Membership liên kết; UI không suy đoán liên kết từ ngày gói.
- **Tích hợp thật:** đã kiểm dashboard và My Account với Member An trên backend local, có Gym/PT/lớp/ví/notifications. Còn kiểm quyền khi đổi ID và invoice/refund links; refund flow tiếp tục thuộc AN-04.
- **Review shared:** cần owner Calendar/catalog review adapter và Khôi review UI trước merge.

Không đổi API/schema hoặc nhúng dữ liệu giả vào UI. Dữ liệu demo local được seed riêng qua API theo yêu cầu người dùng. Các kỹ năng đã áp dụng: Impeccable Operate/craft floor và nguyên tắc thị giác phù hợp của Taste theo DESIGN-SKILLS-GUIDE.

## Dashboard và sửa Discover — cập nhật theo phản hồi

- User chọn ưu tiên lịch tập. Dashboard dùng buổi tiếp theo làm trọng tâm với ngày/giờ/phòng và CTA mở đúng ngày trong Calendar; danh sách ba buổi kế tiếp phía dưới. Quyền lợi Gym/PT và WalletBalance compact ở bên phải. Thông báo và hóa đơn cần xem lại đặt dưới lịch, không chừa khoảng trắng theo chiều cao cột quyền lợi khi lịch trống.
- Impeccable: giữ mode Operate, thứ tự tác vụ, empty/error có hướng đi, từng API lỗi độc lập. Taste: Court & Volt, typography Barlow/Be Vietnam Pro, ngày lịch làm điểm nhấn, dùng divider thay cho sáu card giống nhau; không đổi palette hoặc thêm KPI giả.
- Mọi entry Khám phá của Member (menu, dashboard, khóa học và thông báo khóa mới) dẫn đến `/member/discover`. Link chi tiết catalog có context Member, còn route public vẫn dẫn đến `/courses/[id]`. Active nav dùng `aria-current`.
- Kiểm thử thêm: Discover → chi tiết → reload/back vẫn giữ MemberShell, catalog public giữ URL cũ; dashboard empty/error; link Calendar có ngày đúng giờ Việt Nam. Filter catalog không còn select quá hẹp như ảnh báo lỗi.

## My Account và dữ liệu xem thử — 06/10/2026

- `/account` chọn MemberShell cho Member, bỏ sidebar cũ, nội dung căn giữa như Fitness Profile. Giữ đầy đủ thông tin cá nhân và form đổi mật khẩu luôn mở theo xác nhận của người dùng. Các vai trò khác giữ AppShell và bố cục hai cột.
- PasswordInput chung có nút hiện/ẩn độc lập, tên trợ năng EN/VI, không submit form. Áp dụng cho account, form mật khẩu quản trị/coach, external coach và Google onboarding; login/register/reset-password đã có AuthPasswordField với nút con mắt.
- `node scripts/seed-member-dashboard.mjs` chạy trên API local (mặc định `127.0.0.1:5000`), dùng tài khoản demo có sẵn. Chạy lại cùng dữ liệu không cộng điểm hoặc mua trùng; không đổi mật khẩu. Có thể cấu hình `SPORT_HUB_API`, `SPORT_HUB_DEMO_PASSWORD`.
- Đã seed `an.member@sporthub.vn`: Gym tháng và gói Gym/PT đủ một tháng lịch, PT 8 buổi với 2 lịch đặt lúc 17:00 ngày 06/10 và 08/10, khóa cầu lông 8 buổi từ 13/10, 4 hóa đơn đã thanh toán bằng điểm; ví còn 16.400 điểm. Bổ sung chuyên môn PT/cầu lông cho coach demo và phòng demo có giờ mở cửa. Gói 30 ngày cũ không đủ quy tắc một tháng lịch của PT trong tháng 10 nên có gói Gym/PT riêng.
- Kiểm thử Member: 12/12 đạt; build, typecheck, i18n và ESLint các file thay đổi đạt. Kiểm trình duyệt thật tại localhost:3000 với API local, desktop 1536px và mobile 390px không tràn ngang.
- Ảnh dữ liệu thật: [My Account desktop](evidence/an02/account-desktop.png), [My Account mobile](evidence/an02/account-mobile.png), [dashboard đã seed](evidence/an02/dashboard-seeded.png).
