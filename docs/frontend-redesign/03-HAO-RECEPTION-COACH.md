# Giao việc Hào — Receptionist, Coach, Calendar và AI Drawer

SportHub là **hệ thống quản lý trung tâm thể thao với ba môn Gym (bao gồm PT), cầu lông và bóng rổ; có thể mở rộng thêm môn trong tương lai**. PT là dịch vụ thuộc Gym, không phải môn thứ tư.

Mục tiêu: lễ tân phục vụ nhanh, ít chọn nhầm người; Coach làm việc trong ngữ cảnh lớp/học viên/buổi tập; AI không làm mất lịch hoặc tự ghi dữ liệu.

Đọc bắt buộc: [DESIGN-SKILLS-GUIDE](../../DESIGN-SKILLS-GUIDE.md), [DESIGN-TOKENS](../../DESIGN-TOKENS.md), [PRODUCT](../../PRODUCT.md) và [nguồn nghiệp vụ](../00-Source-of-Truth.md). Kế hoạch API nằm ngay cuối file này. **Dùng cả Impeccable (UX) và Taste (UI) theo guide; DESIGN-TOKENS là chuẩn duy nhất.**

## Bắt đầu tuần 05–11/10

- **Làm trước:** Bàn giao Calendar/EventDrawer và MemberSearch/QuickActions/AttendanceBoard; chốt contract AI Drawer.
- **Thứ tự trang:** Quầy/Member/Gym → Bán dịch vụ/điểm danh/tài chính quầy → Coach/lớp/học viên → Training/PT → AI.
- Bảng tên trang, hạn mục tiêu và tiêu chí xong: [kế hoạch FE một tuần](KE-HOACH-FE-1-TUAN.md). Phần bên dưới giữ đặc tả đầy đủ để tra khi làm từng trang.
- Chỉ ghi “Hoàn thành” khi UI + API thật + kiểm chứng đạt; fixture có nhãn là “Xong UI – chờ API”. Không chờ toàn bộ backend/shared xong mới bắt đầu.


## 1. Quyền sở hữu

- Hào: route Receptionist/Coach, shared Calendar/CalendarEventDrawer/MemberSearch/QuickActions/AttendanceBoard, AI Drawer experience và review wrapper.
- An: tokens, AppShell, Dialog/Drawer primitive, checkout/OTP/ví/invoice. Không fork các component này.
- Khôi: auth/onboarding/account/public catalog; lễ tân hỗ trợ đăng ký qua flow thật của Khôi, không gọi Admin CreateStaff để tạo Member.
- Khoa: lớp/HLV/sự cố và AI Manager (nhận từ Khôi 05/10); An: PT/Member vận hành. Hào chỉ dẫn link/gửi yêu cầu theo quyền; không cho Coach tự tạo lớp hoặc đổi lịch.

## 2. Receptionist sitemap

Menu: **Quầy hôm nay · Hội viên · Bán dịch vụ · Điểm danh · Lịch sân · Giao dịch**. Không có menu chỉnh điểm hay báo cáo doanh thu.

| ID | Page → subpage | Route đề xuất | Nội dung và action |
|---|---|---|---|
| H01 | Quầy hôm nay | `/receptionist` | Search nổi bật, Member đang chọn, 3 quick actions, buổi lớp sắp tới, đang ở Gym, giao dịch cần theo dõi |
| H02 | Hội viên → Danh sách → Hồ sơ vận hành | `/receptionist/members`, `/receptionist/members/[id]` | Tên/SĐT/mã, Membership, ghi danh, lịch sử check-in, ví/hóa đơn; chỉ dữ liệu phục vụ quầy |
| H03 | Hội viên → Hỗ trợ đăng ký | F từ search không có kết quả | Form Member/OTP thật, người thụ hưởng rõ ràng; không đọc OTP tự động từ log hoặc bypass xác thực |
| H04 | Gym check-in/out → Danh sách đang ở Gym | `/receptionist/gym-checkin` hoặc tab dashboard | Tìm → chọn người → check-in/out 1 chạm hợp lệ; kết quả và trạng thái hiện tại |
| H05 | Bán dịch vụ → Chọn Member → Chọn sản phẩm | `/receptionist/sales` | Membership/PT/khóa; PT yêu cầu Membership Active; chọn khóa rồi xem lịch/giá/chỗ |
| H06 | Bán dịch vụ → Checkout → OTP → Kết quả | Shared An trong sales | Tóm tắt Member, tổng, điểm, cash, timer, OTP khi dùng điểm, biên nhận/trạng thái |
| H07 | Điểm danh → Chọn buổi → Roster | `/receptionist/attendance`, detail theo session | Present/Absent cho enrollment Confirmed; tìm theo tên/mã; tổng đã ghi/chưa ghi; sửa trong 24h sau kết thúc |
| H08 | Lịch sân → Chi tiết hoạt động | `/receptionist/court-schedule` | Ngày/tuần/sân, lớp/PT/thuê sân/block; roster theo quyền, rental chỉ hiện Member đã thuê (không số người, không điểm danh) |
| H09 | Giao dịch → Danh sách → Hóa đơn | `/receptionist/invoices`, detail | Keyword/status/Member, points/cash/attempts/fulfillment, yêu cầu backend đối soát |
| H10 | Hóa đơn → Tạo hộ refund → Theo dõi | Nested F | Target Member/item/lý do/quote; chỉ yêu cầu, Manager duyệt |
| H11 | Hồ sơ Member → Ví điểm | Tab trong H02, entry từ checkout | Số dư và ledger của Member đã chọn; không cộng/trừ thủ công |

## 3. Quầy hôm nay — quick actions cụ thể

Desktop ưu tiên bố cục hai vùng: **vùng thao tác khoảng 2/3** với search và selected Member, **vùng tình hình khoảng 1/3** với các buổi/việc chờ; xuống một cột ở tablet hẹp/mobile. Không đặt bốn chart doanh thu trên đầu quầy.

Search ở trung tâm vùng thao tác: nhãn “Tìm hội viên”, placeholder “SĐT, mã hội viên hoặc tên”, nút Quét QR. SĐT/tên đã có API; mã/QR theo G04. Debounce khoảng 250–300ms, cancel request cũ, dropdown phân biệt tên trùng bằng mã/SĐT đã che phần cần thiết. Không auto-submit giao dịch khi scan.

Selected Member banner cố định trong vùng tác vụ: tên, mã, Membership, trạng thái đang trong Gym, nút đổi người. Đổi người phải bỏ các form/draft/OTP không còn đúng ngữ cảnh; checkout đã tạo cho người cũ vẫn thuộc người cũ, không mutate beneficiary.

Ba quick actions luôn có icon + chữ:

1. **Gym check-in** hoặc **Gym check-out** theo trạng thái server. Một chạm sau khi xác nhận đúng người; không thêm confirm dialog cho mỗi thao tác thường nhật. Pending khóa click đôi, thành công hiện giờ ghi nhận.
2. **Điểm danh lớp** mở ngay danh sách buổi gần giờ hiện tại/đã chọn; vẫn kiểm tra Member đã Confirmed trong roster.
3. **Bán dịch vụ** giữ Member context, mở chọn dịch vụ.

Phím tắt giữ quy ước sẵn có nếu phù hợp: Alt+0 Quầy, Alt+1 Gym, Alt+2 Bán, Alt+3 Điểm danh; thêm focus search bằng tổ hợp có kiểm tra xung đột trình duyệt. Có help hiển thị phím; không dùng phím ký tự đơn toàn trang hoặc bẫy phím khi đang nhập.

QR: scan → backend resolve → hiện thẻ Member → lễ tân bấm action. Không đưa email/SĐT raw vào QR, không coi QR là mã VNPay. State camera denied/no camera/invalid/expired/token không thuộc Member đều có fallback nhập SĐT/mã. G04 phải có endpoint + payload contract trước khi bật thật.

## 4. Điểm danh, OTP và ngoại lệ tại quầy

- Roster table: học viên, trạng thái, giờ ghi/sửa nếu có, action Present/Absent. Không preselect Present cho tất cả, không tự đánh absent do tải trang.
- API hiện ghi từng enrollment. Nếu thêm bulk UI, phải báo từng dòng thành công/thất bại; không báo tất cả thành công sau một Promise bị lỗi. Batch API chỉ là tối ưu tùy chọn, không điều kiện bắt buộc.
- Khóa quyền sửa khi quá thời hạn theo server; giải thích cách liên hệ quản lý thay vì cho click rồi im lặng.
- Checkout hiển thị “Đang thực hiện cho [Member]”; An cung cấp OTP control. Số điểm chưa verify không được trình bày là đã trừ; đổi số điểm cần xác nhận mới.
- Quầy không có nút “Tôi xác nhận đã nhận tiền” thay VNPay. Dùng POST reconcile hiện có, thông báo đang kiểm tra/thành công/cần xử lý.
- Gym đã check-in, Membership hết hạn, search nhiều kết quả, offline, request timeout và double-click có trạng thái phục hồi.

## 5. Coach sitemap

Menu cơ bản: **Tổng quan · Lịch giảng dạy · Lớp phụ trách**. Có specialty PT mới thêm **Học viên PT · Buổi PT**. Không để Coach lớp nhóm thấy menu “Điểm danh” dẫn đến form không có quyền.

| ID | Page → subpage | Route đề xuất | Nội dung/action |
|---|---|---|---|
| H12 | Tổng quan Coach | `/coach` | Buổi tiếp theo, lịch hôm nay, PT cần hoàn tất/kết quả, thay đổi lịch |
| H13 | Lịch giảng dạy → Chi tiết buổi | `/coach/schedule` | Gộp lớp/PT được giao; ngày/tuần/list; địa điểm, trạng thái, link lớp/học viên |
| H14 | Lớp phụ trách → Chi tiết lớp | `/coach/classes`, `/coach/classes/[classId]` | Môn, lịch tất cả buổi, roster và attendance chỉ đọc; không tài chính/hồ sơ cá nhân ngoài quyền |
| H15 | Học viên PT → Hồ sơ | `/coach/members`, `/coach/members/[memberId]` | Quan hệ Active, mục tiêu/trình độ, thông tin tập cần thiết; không tự gán học viên |
| H16 | Hồ sơ PT → Kế hoạch | Tab → tạo/sửa/chi tiết | Bài tập, cấu trúc plan, Draft/Active/Archived theo API; review trước activate |
| H17 | Hồ sơ PT → Kết quả & tiến độ | Tab/list/detail | Kết quả buổi hợp lệ, nhận xét, tiến độ với thời gian/đơn vị; không bịa đường biểu đồ khi thiếu dữ liệu |
| H18 | Hồ sơ PT → Homework | Tab → tạo/sửa/chi tiết | Bài tập giao, hướng dẫn; chỉ Coach phụ trách được ghi, Member xem |
| H19 | Buổi PT → Chi tiết | `/coach/pt-sessions`, `/coach/pt-sessions/[id]` | Member, thời gian/sân, trạng thái, hoàn thành/no-show theo API, ghi kết quả hợp lệ |
| H20 | AI gợi ý kế hoạch | Drawer từ H16/H19 | Đầu vào, gợi ý, Xem lại & Chỉnh sửa → Lưu nháp → Áp dụng qua activate nếu hợp lệ |

Không tạo trang AI workout cho Coach thiếu specialty PT. Quan hệ hết hiệu lực giữa chừng phải chặn lưu và làm rõ, không dựa vào việc menu từng hiển thị.

## 6. AI Drawer dùng chung — Hào thiết kế và bàn giao adapter

Desktop panel rộng khoảng 400–440px, mở bên phải và reflow vùng lịch ở màn đủ rộng; không che ngày đang xem. Ở chiều rộng không đủ, cho user mở/đóng panel và giữ state; mobile modal/full-screen có back, không mất lịch/filter/scroll.

Contract component đề xuất: `mode: member-schedule | coach-workout | manager-schedule`, `contextKey`, `onReview`, `onApply`, `capabilities`, `loading/error`; callback write do consumer thực hiện sau review. Không coi đây là contract backend đã có.

| Mode | Input/context | Kết quả → thao tác |
|---|---|---|
| Member | Ngày đang xem, danh tính từ session backend | “Hôm nay có gì?” → list buổi + link focus lịch; không nút ghi nghiệp vụ |
| Coach | Member được phân công, mục tiêu, trình độ, lịch sử | Draft plan có nguồn/thiếu dữ liệu → **Xem lại & Chỉnh sửa** → **Lưu nháp**; kích hoạt là bước chủ động riêng |
| Manager | Môn, Coach/sân phù hợp, số buổi, khoảng ngày | Các phương án lịch + conflict → **Xem lại & Chỉnh sửa** trong form lớp → **Lưu nháp**; G03, không tự publish |

AI text không phải JSON đáng tin để gửi thẳng API. Map/validate fields, giữ bản người dùng đang sửa, không ghi đè khi response cũ đến trễ. Hiển thị nhận diện context hiện tại; đổi Member/lớp phải xử lý draft cũ rõ ràng.

Shared states: empty prompt, đang tạo, cancel, retry, thiếu đầu vào, chưa cấu hình provider, lỗi, response không hợp lệ, conflict sau review, lưu nháp thành công. Thiếu lịch sử 30 ngày không giả là đủ; hiện limitation theo API, cho Coach bổ sung/xem lại.

## 7. API và tài nguyên hiện có

- Search: `GET /api/users?keyword=...&role=Member`; keyword hiện tên/email/SĐT, **G04** cho mã/QR. Chờ **G12** để thu hẹp scoping endpoint shared đúng role.
- Gym: `GET /api/gym-checkins/inside`, `POST /api/gym-checkins {targetMemberId}`, `POST /api/gym-checkins/{id}/checkout`.
- Attendance: `GET /api/class-sessions/{id}/roster`, `PUT /api/class-sessions/{id}/attendance/{enrollmentId}`.
- Lịch sân: `GET /api/manager/court-schedule` dành FrontDesk; tên manager trong URL không có nghĩa Receptionist bị cấm. Coach dùng `/api/coaches/me/court-schedule`.
- Coach classes: `GET /api/coaches/me/classes` và sessions/roster có CoachScope.
- PT: `/api/coaches/me/pt-sessions`, detail/complete/no-show; workout-plans, workout-results, progress, homework theo role/relationship.
- AI Coach: `POST /api/ai/workout-suggestions/{memberId}`; plan create/update/activate riêng. Không gọi `POST /api/ai/chat` bằng role Coach vì endpoint đó hiện chỉ Member.
- Staff payments: invoices/reconcile/refunds, Member points/ledger; shared An dùng exact contract.

Code đầu vào: `features/receptionist`, `features/pt`, `features/court-schedule`, `components/AttendanceBoard.tsx`, `components/MemberPicker.tsx`, `CameraQrScanner.tsx`, `app/receptionist`, `app/coach`. Scanner component tồn tại không chứng minh backend QR đã tồn tại.

Mapping: `sell-plans/registrations/member-points` gom về Sales/Member detail có adapter; Coach `training-plans/progress/homework/ai-suggestions` thành deep link đúng tab/member, không để bốn menu chọn lại người. Bookmark thiếu Member phải đưa tới picker, không chọn bừa Member đầu tiên.

## 8. Thứ tự và nghiệm thu

1. Search/QuickActions/Calendar contract → quầy mẫu và timeline mẫu; sync An/Khôi.
2. Receptionist search → check-in/out → attendance → checkout dùng An → reconcile/refund request.
3. Coach lịch/lớp → học viên PT → session → plan/result/homework.
4. AI Drawer + review editor cho ba mode, adapter Manager do Khoa hoàn thiện theo G03.
5. G04 QR, test trạng thái/phím tắt/accessibility và phối hợp liên vai trò.

- [ ] Từ Member đã chọn đến check-in hợp lệ chỉ một action; trạng thái thay đổi sau server success.
- [ ] Đổi Member không mang theo số điểm/OTP/plan của người trước.
- [ ] QR denied/invalid có fallback; QR không tự check-in hoặc tự thanh toán.
- [ ] Lễ tân không điểm danh lượt thuê sân; Coach không ghi attendance lớp nhóm.
- [ ] Sửa attendance quá hạn có thông báo rõ; không mất kết quả dòng đã lưu khi dòng khác lỗi.
- [ ] Coach chỉ xem lớp mình, PT đúng quan hệ; không dùng `/api/users` toàn hệ thống làm cách tìm học viên.
- [ ] AI response không tự gọi save/activate; review/edit bắt buộc thấy trước action ghi.
- [ ] Drawer desktop vẫn thao tác lịch được; modal mobile quản lý focus và khôi phục ngữ cảnh.
- [ ] Các key shortcuts không cướp input hoặc browser shortcut quan trọng.

Bàn giao các page/subpage, shared calendar/search/AI adapter contract, ảnh quầy/Coach desktop/tablet/mobile, state matrix và bằng chứng kiểm tra theo DESIGN-SKILLS-GUIDE.

## Phối hợp thiết kế dùng chung và skill

Hào sở hữu **Calendar, MemberSearch, QuickActions, AttendanceBoard, AI Drawer experience và Review editor**. Dùng Drawer/Dialog primitive, AppShell/Header, notification/state/payment của An; AccountMenu của Khôi. ChatGPT Plus để shape/critique, Antigravity để code/test cùng bundle. Impeccable Operate ưu tiên tác vụ/quyền; Taste chỉ áp typography/spacing/visual phù hợp, không marketing hóa bảng/lịch.

Trước merge: flow/state matrix → màn mẫu desktop/mobile → critique/audit → polish → kiểm nghiệp vụ theo guide. Không đánh dấu hoàn thành chỉ vì AI sinh code.

## Kế hoạch API gắn với page được giao

**Đối chiếu tĩnh controller/service/DTO/jobs và FE consumers; chưa gọi runtime/security test.** Route đề xuất chưa được triển khai chỉ vì có trong tài liệu. Hào là đầu mối đặc tả, phối hợp backend, nối FE và nghiệm thu các mục primary; backend shared cần review cùng consumer.

### Mapping API → page/subpage

| Mục | Page/subpage cần triển khai/nghiệm thu |
|---|---|
| G04 | H01–H04/H07 và An A20 |
| G12 | H02/H08/H14–H18, An Q12, Khoa Q30 |
| D06 | H17/H19 |
| G03 (phối hợp Khoa) | H20 wrapper/Q28 |
| G11 (phối hợp An) | H06/H09 |

**G11/D01/D02/D07/D08** tại [An](01-AN-MEMBER-SHARED.md): Hào kiểm quầy/OTP/refund, không gọi manual Paid hoặc cancel package như hoàn điểm. **G03/G06** tại [Khoa](04-KHOA-MANAGER-ADMIN.md): dùng chung AI wrapper/calendar, không mở quyền Manager cho Coach.

### API hiện có: tái sử dụng trước khi thêm

Kiểm verb, constraint và body trong controller/OpenAPI; page mới không nhất thiết cần endpoint mới.

| Nghiệp vụ | Endpoint hiện có | Consumer / lưu ý |
|---|---|---|
| OTP quầy | `POST /api/invoices/{id}/point-confirmations`; `GET .../current`; `POST .../clear`; `POST /api/point-confirmations/{id}/verify` | Receptionist; có expiry/revision/Member binding |
| Ví | `GET /api/wallet/me`, `/ledger`; `/api/members/{id}/points`, `/points/ledger`; `/api/manager/wallets/{id}`, `/ledger` | Đúng consumer self/frontdesk/manager; không alias mù |
| Invoice | `GET /api/invoices`, `/{id}`, `/by-item/{itemId}`; `/api/members/me/invoices` | Detail có `Adjustments`; đủ xem refund theo invoice |
| Refund | `GET /api/refunds/quote/{invoiceItemId}`; `POST /api/refunds`; staff GET `/api/refunds`; manager approve/reject | Item-scoped, server tính điểm; Member không gọi staff list |
| Reconcile/gateway | `POST /api/invoices/{id}/reconcile`; `GET /api/payments/vnpay/ipn`, `/return` | G11 cần kiểm tra auth callback; không coi return là xác nhận |
| PT entitlement/session | GET member/coach/manager pt-entitlements; GET member/coach/manager pt-sessions; manager create/cancel/reschedule | G05: chưa có member create booking |
| PT yêu cầu | Member create/list session-change/coach-change request; manager list/approve/reject | Đang chờ khác với đã đổi lịch |
| Training | Profile, plans, results, progress, homework, relationship APIs | Phân quyền relationship/specialty; không tạo endpoint chỉ vì thêm tab |
| AI | `POST /api/ai/chat`; `/workout-suggestions/{memberId}`; `GET /api/ai/logs` | Chat Member, suggestions Coach PT, logs theo actor scope |
| Lịch sân/availability staff | `GET /api/manager/court-schedule`, `/rentals`; `/api/coaches/me/court-schedule`; `/api/availability/rooms`, `/coaches`, `/rooms/{id}/busy` | Quyền khác nhau, public không dùng trực tiếp |
| Gym | `GET /api/gym-checkins/inside`; POST root/`{id}/checkout`; history ở MemberGymCheckInsController | Receptionist ghi, Member self-read |
| Attendance | `GET /api/class-sessions/{id}/roster`; `PUT /api/class-sessions/{id}/attendance/{enrollmentId}` | Lễ tân ghi từng dòng; Coach/Manager đọc theo quyền |

### Backlog chính được giao

P0 chặn nghiệm thu luồng liên quan; P1 phục vụ đủ sitemap; P2 tối ưu khi có nhu cầu. Route/wire enum mới phải chốt contract, cập nhật OpenAPI + FE types và error mapping VI/EN.

#### G04 — Tra cứu Member theo mã/QR [P1; Hào + An]

**Bằng chứng:** [UserAdminService.SearchAsync](../../backend/SportHub.Administration/Application/Services/UserAdminService.cs) keyword chỉ email/fullName/phone; [CameraQrScanner](../../frontend/src/components/CameraQrScanner.tsx) chỉ giải mã ảnh, không có server resolve. Quét source backend không thấy MemberCode/QR contract nghiệp vụ.

Đề xuất `GET /api/reception/members?query&lookupType&page&pageSize` hỗ trợ phone/memberCode/name với scope chỉ Member; `POST /api/reception/member-lookups/qr {token}` trả minimal Member identity + membership validity + current gym status; `GET /api/members/me/identification` cấp displayCode và QR token cho thẻ Member ở dashboard/tài khoản. DTO không trả wallet ledger ngay khi search.

Backend tạo member code unique nếu cần mã dễ đọc; không dùng cắt ngắn GUID không có unique guarantee. QR opaque/signed, không chứa PII raw; policy expiry/rotation cần ghi rõ trong contract trước rollout. Token chỉ nhận diện, không thay auth hay quyền check-in; receptionist phải đăng nhập và bấm action. Scan không gọi arbitrary URL trong QR.

Test SĐT chuẩn hóa, mã unique, tên trùng, camera fallback, QR invalid/expired, token role khác, không public enumeration, rate-limit/audit phù hợp. Chưa xong backend thì giữ search SĐT/tên, QR chỉ nghiệm thu prototype có nhãn.

#### G12 — Scoping dữ liệu Member ở endpoint StaffRead [P0 cho quyền truy cập; Hào chủ trì, An Q12/Khoa Q30 phối hợp]

**Bằng chứng:** policy StaffRead có Coach; UsersController search/detail gọi [UserAdminService](../../backend/SportHub.Administration/Application/Services/UserAdminService.cs) không truyền actor/relationship và query không giới hạn học viên của Coach. Do đó mô hình kiểm quyền đọc khai báo hiện tại rộng hơn UI Coach đề xuất. Cần test tương tự với member packages/training profile; không khẳng định các service chưa đọc đều sai.

Ưu tiên tách staff Member search dành FrontDesk và Admin endpoint riêng; Coach dùng assigned relationships/classes APIs đã có. Nếu giữ route chung, bổ sung actor scope trong service và DTO tối thiểu, không chỉ ẩn menu. Rà endpoint `members/{id}/packages` và training-profile riêng theo policy/service thực tế.

Acceptance negative tests: Coach A không đọc Member không có quan hệ hoặc roster của lớp khác; Coach nhóm chỉ roster tối thiểu, không payment/wallet/training profile; Receptionist được đúng dữ liệu phục vụ quầy. Không dùng mở quyền để sửa lỗi 403 UI.

### API legacy/dư thừa trong phạm vi

| ID | Endpoint/contract | Bằng chứng hành vi | Kế hoạch |
|---|---|---|---|
| D06 | `POST /api/workout-results` và `PUT /api/workout-results/{ptSessionId}` | [WorkoutController](../../backend/SportHub.Training/Api/WorkoutController.cs) cùng SaveResultAsync; FE workout-result-form đang dùng PUT | Chọn PUT làm canonical upsert theo session; giữ POST compatibility đến khi kiểm hết consumers/tests |

Không xóa API chỉ vì không thấy FE call. Giữ read-history, callback IPN/return, by-key/by-reference và projection theo role. Trước retire: scan consumers/tests/scripts/integrations, deprecation/OpenAPI, replacement, logs nếu có và compatibility regression. Đợt tài liệu này không xóa endpoint.

Bulk attendance có thể dùng từng PUT; hiện partial failure và chỉ retry dòng lỗi. AI Drawer/context/review là FE dùng API Member/Coach đã có; Manager suggestions mới là G03, không báo thiếu toàn bộ AI.

### Đóng việc API cùng FE

- [ ] Có request/response/error examples, role/ownership, freshness/pagination và compatibility; không tự đoán JSON.
- [ ] Mutation tiền/hold có idempotency/revision và backend validation; deadline từ server, points integer, VND do backend tính.
- [ ] Test success/error/forbidden và cạnh tranh/retry của gap trên; nối đúng page ở mapping.
- [ ] Chưa có backend: đánh dấu prototype/blocker, không toast thành công giả; phần API đã có vẫn triển khai.
- [ ] Cập nhật mục này + PR evidence khi chốt API; consumer xác nhận trước đóng gap hoặc retire legacy.

## Điều phối sau khi san việc

Khôi là UI/UX Lead review mẫu Quầy/Calendar/AI; An giữ component nền tảng. Hào giữ nguyên 20 mục H, không nhận thêm phần Manager. G03/G06 phối hợp Khoa; PT/finance và Manager Member profile phối hợp An. Khoa chỉ phối hợp Admin detail G10/G12, không còn đầu mối điều phối toàn nhóm.
