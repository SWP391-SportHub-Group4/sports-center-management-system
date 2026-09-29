# Plan refactor code 2 — Frontend đa môn và nghiệm thu toàn web

Ngày lập: 30/09/2026. Trạng thái: **kế hoạch, chưa triển khai code**. Phần 2/2, thực hiện sau [plan 1 backend](refactor-code-plan-1-backend.md). Đích cuối là web có đủ luồng thực cho Guest, Member, Receptionist, CenterManager, Coach và ExternalCoach; SystemAdministrator giữ đúng quyền quản lý tài khoản.

Đã khảo sát `frontend/src/app`, component, types/auth/API client, nhánh demo và tests. Không coi tất cả trang đang có là tính năng hoàn chỉnh: trang quên mật khẩu đang gọi route không có trong AuthController khảo sát; trang Coach attendance còn placeholder dù backend đã có PtSession; menu có `/coach/progress` và `/coach/homework` nhưng chưa có page tương ứng.

## 1. Chỉ dẫn cho AI thực hiện

1. Đọc BR v2.0 updated, Design v3 §19.2, plan 1, `docs/refactor-api-contract.md`, `docs/refactor-backend-evidence.md`, `docs/refactor-progress.md`. Nếu backend chưa qua gate, ghi thiếu cụ thể và hoàn thiện phần phụ thuộc trước, không dựng FE giả để che API thiếu.
2. Làm từng chặng P2.xx, mỗi chặng nối API thật + loading/error/empty/permission states + test luồng quan trọng. Cập nhật progress sau mỗi chặng; lưu endpoint/DTO đổi và bước kế tiếp để AI khác tiếp tục khi hết context.
3. Không thực hiện lại migration/reset seed tùy tiện. Không sửa rule backend để UI cũ “chạy được”. Lỗi integration thì sửa đúng module BE và test hồi quy, đồng bộ contract.
4. Không thêm thư viện UI/state lớn hoặc đổi framework chỉ để refactor scope. Dùng CSS Modules, component, API client, i18n đang có. Không viết lại toàn bộ thiết kế visual; giữ nền UI tốt, sửa nội dung và luồng sai.
5. Chỉ đọc/ghi dữ liệu nghiệp vụ qua backend. Local state dành form/filter/tab, không dùng localStorage để giả số dư, giữ chỗ, thanh toán, đăng ký hoặc kết quả tập.
6. Đường dẫn trong các bảng tính từ root. **S** sửa file đã có; **T** thêm file; **X** xóa file; **G** giữ. Tên mới là tên đích đề xuất. File không tồn tại thì không ghi “đã xóa”; file đã được AI plan 1 tạo thì sửa thay vì duplicate.
7. Requirements.md và SRS không nằm trong phạm vi chỉnh sửa. Chỉ cập nhật README/RUNBOOK/PRODUCT/DESIGN/SSOT/field-purpose cho phần thực sự đã chạy.

## 2. AI

<!-- Để trống theo yêu cầu người dùng. Không lập kế hoạch tính năng AI. -->

Không thêm `/member/chat`, `/manager/chat`, chatbot widget, prompt, function calling hoặc mock AI. Trang AI hiện có giữ nguồn; chỉ điều chỉnh chỗ phụ thuộc auth/types tối thiểu nếu chế độ bàn giao plan 1 giữ AI build được. Nếu đã chọn ngắt module AI thì bỏ menu truy cập và hiển thị unavailable đúng trạng thái, không xóa nguồn AI. Không lấy AI làm điều kiện hoàn thành hai plan.

## 3. P2.00 — Khóa contract và dọn nguồn UI trùng

### 3.1 Kiểm trước khi sửa trang

- Chạy API plan 1 trên DB demo/test riêng; gọi health, login, profile, sports, classes, wallet. Kiểm JSON thật với contract, nhất là enum, UUID/int, ngày local/UTC, decimal/points.
- Ghi baseline `npm run typecheck`, `npm run lint`, `npm run check:i18n`, `npm run build`; không suy một trang mở được nghĩa là toàn bộ build pass.
- Duyệt cây import toàn frontend bằng rg, kể cả test/config, trước khi xóa nhánh demo. Không giữ hai lớp SessionUser/Enrollment có cùng tên mà khác nghĩa.
- Chốt DTO canonical trong `src/lib/types.ts`; tách feature API helpers, không tách thêm nhiều lớp repository nếu chỉ làm một request.

### 3.2 Danh sách xóa và thay thế cụ thể

Các file dưới đây hiện thuộc nhánh member demo cũ. Khảo sát cho thấy `src/app`/`components` đang dùng `lib/apiClient`, còn `application/member/layout.tsx` tạo `createDemoRepository`. Thực hiện check inbound import trước; nếu file đang được route thật dùng ở thời điểm refactor thì chuyển consumer sang API thật rồi mới xóa.

| File | Hành động và lý do |
|---|---|
| `frontend/src/infrastructure/demo/member-repository.ts` | X: local demo command không được làm backend cho production. |
| `frontend/src/infrastructure/demo/seed.ts` | X: dữ liệu runtime demo gym cũ; fixture test chuyển vào tests/fixtures. |
| `frontend/src/application/member/layout.tsx` | X: shell/provider thứ hai đang bind demo repository. |
| `frontend/src/application/member/provider.tsx` | X sau chuyển consumer: không giữ snapshot tự giả giao dịch. |
| `frontend/src/application/member/contracts.ts` | X: hợp đồng member snapshot/command cũ thay bằng API DTO. |
| `frontend/src/application/member/pages.tsx` | X sau chuyển consumer: bản trang song song, còn QR pass và booking rule cũ. |
| `frontend/src/features/scheduling/calendar.tsx`, `model.ts`, `index.ts` | X sau chuyển UI hữu ích: per-session booking thay bằng `features/courses`/CourtSchedule. |
| `frontend/src/features/check-in/member-qr.tsx`, `index.ts` | X: gate pass demo không phải authority vào Gym. |
| `frontend/src/features/coaches/coach-list.tsx`, `model.ts`, `index.ts` | X nếu chỉ được demo import; UI dùng lại qua component CoachSelector thực theo specialty. |
| `frontend/src/features/identity/profile-form.tsx`, `model.ts`, `index.ts` | X nếu chỉ demo import; account/profile route thật tiếp tục dùng API. |
| `frontend/src/features/membership/packages.tsx`, `model.ts`, `index.ts` | X nếu chỉ demo import; checkout/shared catalog mới thay. |
| `frontend/src/features/training/training-view.tsx`, `model.ts`, `index.ts` | X nếu chỉ demo import; không xóa trang PT thật trong app. |
| `frontend/src/features/notifications/notification-list.tsx`, `model.ts`, `index.ts` | X nếu chỉ demo import; giữ NotificationBell, thêm trang thông báo API khi cần. |
| `frontend/src/features/news/news-slider.tsx`, `index.ts` | X nếu chỉ demo và nội dung gym giả; nếu dùng thật trên landing thì S lấy nội dung hợp lệ, không invent event. |
| `frontend/src/shared/ui/role-shell.tsx`, `index.ts` | X khi không còn inbound import sau xóa demo; dùng AppShell/MemberShell. |
| `frontend/src/shared/lib/date.ts`, `clock.ts` | G hoặc chuyển helper hữu ích vào `lib`; X chỉ sau khi không còn consumer. Không xóa helper date đang dùng vì tên thư mục. |

**Không xóa:** app/member route thật, core components, API client, auth, các test quan trọng, package lock hoặc toàn thư mục public chỉ vì còn ảnh cũ. Asset không phù hợp chỉ xóa sau inventory path và kiểm không còn import/link; không xóa hàng loạt ảnh chưa kiểm.

Xóa **đoạn code**, không xóa cả file, ở `MemberShell.tsx` và `app/member/page.tsx`: QR “gate pass” nonce/timer tự sinh, lời hứa mở cổng, số liệu progress giả. Có thể giữ mã định danh Member để Receptionist tìm; không gọi đó là vé vào cửa có bảo mật. `CameraQrScanner.tsx` giữ nếu còn dùng để nhập định danh, bỏ “Test QR Scan” khỏi production và không gắn nhãn đã xác thực khi chỉ parse JSON.

**Gate:** production route không import demo repository; không có mock balance/paid/registration state; types không còn category hoặc enrollment theo session ở code mới.

## 4. P2.01 — Auth, types, API client và navigation

| File | Sửa gì |
|---|---|
| `frontend/src/lib/types.ts` | DTO đầy đủ: Sport/RoomType/Room/OpeningHours/CourtRate, CoachSpecialty/ExternalCoachProfile, Course/ScheduleRule/Session/Enrollment/Hold, wallet/ledger/confirmation, checkout/attempt/refund, threshold/rental/incident/report. Dùng enum union đúng wire, phân biệt ClassId number với UUID string. |
| `frontend/src/lib/auth.tsx` | 6 roles + specialties + approvalStatus; bỏ CoachCategory. Khôi phục session phải refresh profile từ API trước khi cho phép action nhạy cảm, không tin role/specialty từ localStorage cũ. HOME_BY_ROLE có ExternalCoach. |
| `frontend/src/lib/apiClient.ts` | Giữ token/error handler; hỗ trợ AbortSignal/idempotency header; parse 204 đúng; cấu trúc ApiError code/status/details; không auto-retry POST thanh toán vô điều kiện. |
| `frontend/src/lib/useApi.ts` | Reload/invalidate sau mutation; hủy request khi unmount/đổi Member; không để response Member trước ghi đè Member vừa chọn. |
| `frontend/src/lib/format.ts` | Label enum v3; tiền VND và điểm hai formatter riêng; không hiển thị điểm như VND. |
| `frontend/src/lib/language.tsx`, `locales/vi.ts`, `locales/en.ts` | Đồng bộ key mới, error/state/role labels; bỏ key rule cũ sau xóa consumer. |
| `frontend/src/components/AppShell.tsx` | Menu theo role + specialties; một Coach có nhiều môn có cả lịch lớp và PT. Bỏ CLASS_INSTRUCTOR_NAV/requireCoachCategory. Không tự cho Admin vào catalog/payment/reports. |
| `frontend/src/components/MemberShell.tsx`, `MemberShell.module.css` | Thêm wallet/khóa học; bỏ gate UI gây hiểu sai; điều hướng không link trang không tồn tại. |
| `frontend/src/components/NotificationBell.tsx` | Event mới, deep link đúng lớp/rental/invoice; read/read-all không tự đổi nghiệp vụ. |
| `frontend/src/app/layout.tsx`, `globals.css`, `member.css` | Metadata đa môn, bảo toàn font Việt/EN, token style nhất quán; không reset toàn CSS. |

Thêm `frontend/src/lib/permissions.ts` để gom `canTeachSport`, `canUsePtFeatures`, `canBookCourt`, `canManageCatalog` **phục vụ hiển thị**; backend vẫn chặn role/ownership. Enum JSON UPPER_SNAKE_CASE có thể map sang role nội bộ PascalCase tại **một adapter**, không so lẫn lộn ở từng trang. JWT claim không phải DTO role để FE tự suy đoán.

Chính sách UI errors:

| Status / tình huống | Hành vi |
|---|---|
| 401/stamp hết hạn | Xóa session, về login kèm returnTo local an toàn; không redirect ra URL bên ngoài từ query. |
| 403/role hoặc specialty sai | Trang không có quyền; không tự logout mọi 403. Refresh profile nếu quyết định phê duyệt vừa đổi. |
| 409 class_full/schedule_conflict | Giữ form, tải lại chỗ/lịch, chỉ rõ xung đột backend trả về. |
| 409 wallet_insufficient/price_changed | Tải số dư/quote mới, yêu cầu xác nhận lại số tiền/điểm; không tự tăng tiền. |
| hold/OTP expired | Disable action cũ, refresh trạng thái; chỉ tạo checkout/mã mới bằng thao tác rõ ràng. |
| 429 | Hiển thị thời gian chờ theo response; không loop resend/poll vô hạn. |
| 5xx/network timeout sau POST | Không nói chắc giao dịch thất bại; GET lại trạng thái bằng request/Invoice ID trước khi tạo giao dịch khác. |

**Gate:** login/F5/role redirect cả 6 vai trò, Member/ExternalCoach không flash dữ liệu nhau, route trực tiếp bị guard, không còn menu 404 ngoài phạm vi AI được ghi rõ.

## 5. P2.02 — Đăng ký, quên/đổi mật khẩu, hồ sơ

| File | QĐ / kết quả mong đợi |
|---|---|
| `frontend/src/app/login/page.tsx` | S: routing 6 roles, giữ Google onboarding; không suy GoogleLoginResult luôn có accessToken. |
| `frontend/src/app/register/page.tsx` | S: Member OTP 10 phút, resend cooldown, strong password checklist, confirm, thông báo trung tính. |
| `frontend/src/app/forgot-password/page.tsx` | S viết lại nối contract plan 1. Hiện route `/auth/email-otp/request`/verify là giả định chưa khớp BE khảo sát. Form reset không có currentPassword. Bỏ giới hạn Gmail nếu BR không đòi. |
| `frontend/src/app/account/page.tsx` | S: profile mọi role, đổi mật khẩu đúng current/new/confirm; Google-only legacy hướng reset; xử lý JWT mới sau change password. |
| `frontend/src/components/GoogleSignInButton.tsx` | G/S: giữ login/link/onboarding hiện có, áp policy mới; không bypass mật khẩu bắt buộc BR-60. |
| `frontend/src/app/register-external-coach/page.tsx` | T: email OTP/fullName/phone/sportIds/bio/password/confirm, submit xong PendingApproval. |
| `frontend/src/features/identity/password-requirements.tsx` | T sau dọn demo: checklist dùng chung form; FE validation hỗ trợ, không thay BE. |
| `frontend/src/features/identity/otp-input.tsx` | T: 6 số, paste/mobile input/autocomplete, gửi lại/thời gian chờ; reset OTP và điểm quầy có TTL riêng. |

Password không chứa phần trước @, 8–64 ký tự, hoa/thường/số/đặc biệt. Dùng cùng thông điệp ở Member signup, ExternalCoach signup, Google onboarding, Manager tạo Coach, Admin tạo staff, reset/change. Không log password/OTP hoặc đưa vào URL. Không tự động resend liên tục khi trang mount.

Member profile training (`app/member/profile/page.tsx`) giữ tách tài khoản (`/account`): không lẫn hồ sơ tập luyện với Coach specialty. ExternalCoach không được hiện form body metrics của Member.

**Gate:** quên mật khẩu email tồn tại/không tồn tại cùng thông báo, 60s resend, 5 sai, expired, reset thành công token cũ 401; đổi pass giữ phiên hiện tại bằng token mới; đăng ký coach ngoài → đúng trạng thái chờ.

## 6. P2.03 — Landing đa môn và public course catalog

| File | QĐ / nội dung |
|---|---|
| `frontend/src/app/page.tsx` | S: giới thiệu trung tâm đa môn, sport list thật, khóa sắp khai giảng, Gym/PT phân biệt khóa nhóm, CTA Member và ExternalCoach. |
| `frontend/src/app/public-header.tsx` | S: menu môn/khóa/Gym/PT, đăng nhập/đăng ký/đăng ký Coach ngoài; mobile nav. |
| `frontend/src/app/membership-pricing.tsx`, `membership-pricing.module.css` | S: giá Gym từ API, PT riêng; không ghi Membership bao gồm lớp cầu lông/bóng rổ. |
| `frontend/src/app/community-events.tsx`, `community-events.module.css` | S hoặc X khi bỏ section và import: nội dung thật/khóa sắp mở; không seed sự kiện giả làm dữ liệu thật. |
| `frontend/src/app/home.module.css` | S theo layout mới, giữ responsive. |
| `frontend/src/components/icons/SportIcons.tsx`, `SportStickers.tsx`, `index.ts` | S: Gym/PT/cầu lông/bóng rổ; icon fallback cho sport mới. Xóa export Yoga/GroupX/gate không còn dùng sau kiểm import. Không hard-code chỉ 4 sport trong logic. |
| `frontend/src/app/classes/page.tsx` | T: public filter sport/ngày, Published, số buổi/ngày khai giảng/giá/coach/chỗ còn. |
| `frontend/src/app/classes/[classId]/page.tsx` | T: mô tả khóa, toàn lịch buổi, giá một khóa, không đặt riêng một session. |

Sport inactive không xuất hiện cho tạo mới; lớp đã bán giữ lịch sử ở tài khoản. UI server trả availableSeats, không tự tính “còn chỗ” từ số avatar. Guest xem chi tiết và được chuyển login với returnTo; ExternalCoach không dùng public API để lộ roster. Draft chỉ Manager thấy.

Tạo component dùng chung tại `frontend/src/features/courses/`: `api.ts`, `course-card.tsx`, `course-list.tsx`, `course-detail.tsx`, `course-schedule.tsx`, `course-status.tsx`. Tất cả lấy type từ `lib/types.ts`, không tạo domain model độc lập lệch schema.

**Gate:** không còn quảng cáo Yoga/GroupX, daily booking/free class với Membership; thêm môn mới từ Manager xuất hiện không sửa code FE; public không thấy Draft.

## 7. P2.04 — Component checkout và ví dùng chung

Xây một flow dùng lại cho Membership, PT, ClassPackage và CourtRental; không copy code OTP/QR vào mỗi trang.

### 7.1 File mới

Tạo các file sau trong `frontend/src/features/payments/`:

| File | Trách nhiệm |
|---|---|
| `api.ts` | Typed checkout/attempt/status/cancel/reconcile/refund calls; idempotency key mỗi ý định thanh toán. |
| `checkout-panel.tsx` | Tổng hợp line items/beneficiary/initiator/points/cash/expiry; state machine rõ. |
| `points-selector.tsx` | Integer 0..min(available,total/1000), gợi ý max nhưng không ép dùng; hiển thị held riêng. |
| `counter-point-confirmation.tsx` | OTP lễ tân nhập Member đọc, pending/confirmed/failed/expired, resend; không có skip/manual success. |
| `payment-attempt-panel.tsx` | QR hoặc payment URL backend trả, đúng cash amount và hạn; mock badge Development. |
| `invoice-status.tsx` | Pending/Paid/PaidAfterReconciliation/Expired/Cancelled + fulfillment result; không đồng nhất Compensated với Enrolled. |
| `hold-countdown.tsx` | Dựa expiresAt và serverNow/offset; clock chỉ hiển thị, BE là authority. |
| `refund-request-form.tsx` | Chọn item, reason, eligibility/ước tính do BE tính; submit idempotent. |
| `payment-return.tsx` | Parse reference an toàn và GET trạng thái backend; không tự set Paid. |

Tạo `frontend/src/features/wallet/api.ts`, `wallet-balance.tsx`, `wallet-ledger.tsx` (available/held, pagination, event/ref, earned/spent/released/adjustment, units); `frontend/src/app/payments/return/page.tsx` cho return URL dùng component payment-return.

Sửa `frontend/src/components/InvoiceWorkbench.tsx` để composition các component trên; xóa nhập “số tiền đã thu”, chọn Cash/Card/Transfer, đánh dấu Paid, complete cash refund. `MemberPicker.tsx` giữ nhưng chỉ trả target Member rõ ràng, reset mọi invoice/OTP quote khi đổi Member.

### 7.2 Flow self-checkout

1. Mở review, GET quote/điểm hiện tại. Người dùng chọn số điểm, bấm tạo checkout một lần; disable nút lúc gửi nhưng BE idempotency vẫn là chốt thật.
2. Backend trả Invoice/hold/session/expiry. FE dùng chính số giá/điểm/cash trong response, không dùng giá catalog cached để tạo số tiền.
3. Cash=0: không render QR và không gọi attempt; chờ backend Paid/Fulfilled. Cash>0: tạo attempt bằng contract, hiển thị QR/link, countdown, poll bounded tới paid/expired; dừng timer/poll khi unmount.
4. Về từ VNPay: query không phải chứng cứ; tải lại backend. Đang đối soát hiển thị đúng, cho retry query theo contract, không tạo giao dịch mới ngay.
5. Expired: không hiển thị giữ chỗ còn hiệu lực; trả điểm giữ do BE xử lý. “Thử lại” gọi backend reacquire, nếu hết chỗ/số dư thay đổi thì nói rõ. Reload/mở tab thứ hai vẫn cùng invoice state.
6. Cancel checkout phải gọi API; đóng panel/tab không đảm bảo giữ chỗ được giải phóng ngay. UI giải thích hạn, không trừ điểm cục bộ.

### 7.3 Flow tại quầy

1. Chọn Member cụ thể, hiển thị tên/email xác nhận; xem điểm được backend audit.
2. Chọn điểm → yêu cầu OTP; PointsApplied vẫn 0 cho đến response Confirmed. Không tự phát QR full amount lúc đang chờ OTP điểm.
3. Receptionist nhập OTP Member đọc. Backend xác nhận, FE refresh snapshot và mới hiện QR phần còn lại. Nếu OTP sai/hết hạn, giữ lỗi cụ thể, cho yêu cầu mã mới đúng cooldown/hạn hold.
4. Đổi beneficiary/points làm xác nhận cũ không còn dùng; clear UI nhưng cũng gọi API/version đúng, không chỉ reset input.
5. Lễ tân chỉ được “Yêu cầu đối soát” từ giao dịch backend đã xác minh, không có “Tôi đã nhận tiền”.

**Gate:** E2E cash-only/partial/full points; amount đổi không tái dùng QR cũ; refresh/back/2 tabs; timeout sau POST; expired/late compensated; OTP sai 5 lần; không có nút bỏ qua xác nhận.

## 8. P2.05 — Toàn bộ trang Member

| File trong `frontend/src/app/` | QĐ | Luồng phải hoàn thiện |
|---|---|---|
| `member/page.tsx`, `member/member.module.css` | S | Dashboard dữ liệu thật: khóa đang học, buổi sắp tới, Gym/PT còn hiệu lực, ví, thông báo. Bỏ số liệu giả và gate pass. |
| `member/class-schedule/page.tsx`, `class-schedule.module.css` | S | Hai vùng rõ: danh sách khóa để mua, lịch buổi đã ghi danh. Không còn mỗi session một nút đăng ký. |
| `member/my-registrations/page.tsx`, `my-registrations.module.css` | S | Enrollment theo Class, timeline cả khóa, trạng thái transfer/refund/cancel, link Invoice; bỏ “hủy trước 30 phút/2 giờ”. |
| `member/my-plans/page.tsx`, `my-plans.module.css` | S | Gym Membership và PT entitlement riêng; không gắn lớp nhóm vào Membership. Mua/renew Gym, mua PT cần Membership Active. |
| `member/invoices/page.tsx` | S | Xem own invoice/items, pending checkout/retry, points/cash split, refund theo item, đối soát/compensation status. |
| `member/training/page.tsx`, `training.module.css` | S | PT lịch/quota/plan/results/homework/change requests, không dùng group attendance làm kết quả PT. |
| `member/profile/page.tsx` | S | Giữ training profile API, lỗi/validation hiện tại, loại assumption gym quota nhóm. |
| `member/wallet/page.tsx` | T | Số dư/held/ledger, filter/page, nguồn hoàn/tiêu; không nạp/rút/chuyển điểm. |
| `member/threshold-responses/[responseId]/page.tsx` | T | AtRisk thông tin, hạn, refund hoặc chuyển cùng môn; lựa chọn cuối cùng, xử lý checkout chênh lệch. |
| `threshold-responses/[token]/page.tsx` | T | Landing liên kết email, bắt login nếu cần rồi đối chiếu subject; GET xem, POST mới chọn. Không ghi token vào analytics/log. |
| `member/pt-sessions/page.tsx` | T | Danh sách/detail PT của mình và request reschedule/cancel theo BE nếu không gộp đủ ở training. Chọn route này làm canonical cho deep link. |

Chuyển lớp: hiển thị giá trị đã trả/giá đích/chênh; đắt hơn mở checkout chênh, ghi danh cũ còn hiệu lực cho tới backend chuyển thành công. Rẻ hơn hiển thị điểm hoàn do BE trả. Target full/conflict hiển thị lỗi, không xóa enrollment cũ ở UI. Lựa chọn final không render lại hai nút như chưa chọn; expired checkout có retry cùng đích theo contract P1, không giả đổi choice.

PT: **người dùng đã chốt đơn giá mỗi buổi × quota**. Source giá do Manager/backend quản lý; FE không gửi unitPrice/TotalQuota tin cậy. Frequency 1/2/3 dùng tính quota theo BR-71, không áp giới hạn đặt buổi mỗi tuần như lớp gym cũ. Chọn Membership đang Active + Coach specialty PT + frequency, gọi quote backend và hiển thị đơn giá/buổi, quota, tổng gói, thời hạn trước checkout. Giá đổi so preview thì hiện quote mới để xác nhận lại. Hiển thị quota reserved/consumed/remaining, validity/carry-over đúng backend.

**Gate:** Member không có Membership vẫn mua được course; PT chưa có Active Membership bị chặn; Member không xem Invoice/enrollment/threshold của người khác; thanh toán xong roster xuất hiện và refund xong quyền lợi thay đổi từ API.

## 9. P2.06 — Trang Receptionist

| File trong `frontend/src/app/` | QĐ | Công việc |
|---|---|---|
| `receptionist/page.tsx`, `receptionist/receptionist.module.css` | S | Dashboard vận hành: Gym hiện đang tập, lớp hôm nay, checkout pending; không doanh thu quản trị trái quyền. |
| `receptionist/sell-plans/page.tsx`, `sell-plans.module.css` | S | Gym/PT checkout thay Member, specialty selector PT, điểm/OTP/QR dùng chung. Không cash recording. |
| `receptionist/registrations/page.tsx` | S | Chọn Member và khóa; cả lịch/giá/sĩ số; checkout giữ chỗ thay Member; không free enroll hoặc booking từng buổi. |
| `receptionist/invoices/page.tsx` | S | Tra cứu Invoice Member, thanh toán thay/đối soát hợp lệ, tạo refund request có lý do; không approve/complete refund. |
| `receptionist/attendance/page.tsx` | S | Chọn Class→Session→roster Confirmed; Present/Absent, sửa trong cửa sổ 24h do BE kiểm; không no-show group. |
| `receptionist/gym-checkin/page.tsx`, `gym-checkin.module.css` | S | Tìm Member, check-in/check-out, trạng thái Membership server; bỏ HUD turnstile/hardware giả. Quét mã chỉ trợ giúp tìm Member. |
| `receptionist/court-schedule/page.tsx` | T | Xem lịch room/day/week, roster class/PT chỉ đọc; rental chỉ coach ngoài/ExpectedAttendees. |
| `receptionist/member-points/page.tsx` | T | Chọn Member trước, xem số dư/ledger audit ở BE; không form chỉnh điểm. |

Sửa `frontend/src/components/AttendanceBoard.tsx`: tách chế độ read-only và mark; key enrollmentId+sessionId, lưu lỗi theo hàng, không optimistic đánh dấu thành công khi API reject. Nếu batch save, API từng hàng/batch contract phải rõ, báo các hàng đã lưu/thất bại; không đánh dấu cả lớp Present chỉ vì click một nút không xác nhận.

**Gate:** cùng một lễ tân bán thay hai Member liên tiếp không giữ OTP/điểm của người trước; thử POST approve refund/adjust points dù UI ẩn bị 403; không có attendance trong chi tiết rental; check-out lặp an toàn.

## 10. P2.07 — Manager catalog, Coach và ExternalCoach approval

Tạo component trong `frontend/src/features/catalog/`: `api.ts`, `sport-selector.tsx`, `room-selector.tsx`, `opening-hours-editor.tsx`, `court-rate-editor.tsx`. Tạo `features/coaches/coach-selector.tsx`, `specialty-editor.tsx`, `external-coach-review.tsx` sau khi dọn demo cũ. Coach selector lấy API filter specialty, không lọc danh sách bằng category hard-code.

| File trong `frontend/src/app/` | QĐ | Luồng |
|---|---|---|
| `manager/sports/page.tsx` | T | List/create/edit/deactivate Sport; operation type, duration/capacity GroupCourse, compatible roomTypes; giá trị môn mới không yêu cầu FE deploy. |
| `manager/room-types/page.tsx` | T | Danh mục loại phòng/sân + tương thích sport; giữ lịch sử khi đã tham chiếu. |
| `manager/training-rooms/page.tsx` | S | Room/type/capacity/active, opening hours theo weekday, block list/form; conflict hiển thị nguồn chiếm. |
| `manager/court-rates/page.tsx` | T | RoomType/sport, weekday/time band, giá/giờ; validation bội 1.000, overlap backend trả rõ. |
| `manager/coaches/page.tsx` | T | Manager tạo/sửa Coach, ≥1 specialty, bio, thông tin account; không role dropdown để tạo Admin. |
| `manager/external-coaches/page.tsx` | T | Filter PendingApproval/Approved/Rejected/Suspended; detail, approve/reject/suspend/reactivate kèm reason theo contract. |
| `manager/membership-plans/page.tsx` | S | Gym catalog giá/duration/active; xóa quota lớp/SessionLimit UI cũ; tab giá PT cấu hình đơn giá mỗi buổi >0, bội 1.000 VND qua GET/PUT pt-pricing của plan 1. Giải thích tổng gói = đơn giá × quota, không sửa Invoice đã mua. |
| `manager/settings/page.tsx` | S | N ngày threshold, response hours, hold minutes, rental limits, expiry notice; validate/snapshot explanation; không cho đổi 1 điểm=1000 tùy ý. |

Deactivation không gọi hard DELETE trên entity đã tham chiếu. Form coach đổi specialty cảnh báo các lớp/PT đang phân công bị ảnh hưởng, không tự gỡ phân công. Manager không khóa/mở account UserStatus thay SystemAdmin; Suspend coach ngoài là approval status riêng.

**Gate:** Manager tạo môn/room/coach mới rồi publish được khóa dùng dữ liệu đó; SystemAdmin vào URL catalog không được phép; ExternalCoach approve/suspend phản ánh ở account của họ sau refresh.

## 11. P2.08 — Manager tạo khóa, xếp lịch và xử lý ngưỡng

| File | QĐ | Việc làm |
|---|---|---|
| `frontend/src/app/manager/classes/page.tsx` | S | List filter sport/lifecycle/threshold; form course code/name/sport/coach/defaultRoom/startDate/numSessions/weekly rules/capacity/price/cost. |
| `frontend/src/app/manager/class-schedule/page.tsx` | S | Calendar session của khóa; dời/đổi room/coach/hủy+bù; không ad-hoc booking gym. |
| `frontend/src/app/manager/classes/[classId]/page.tsx` | T | Detail course, schedule, roster/holds, invoice links được phép, threshold choices, edit/publish/cancel/waive. |
| `frontend/src/features/courses/course-editor.tsx` | T | Draft validation; start local và giờ/weekdays; không hard-code duration 60 phút cho GroupCourse. |
| `frontend/src/features/courses/schedule-rule-editor.tsx` | T | Nhiều weekday/start time, không Morning/Afternoon slots. |
| `frontend/src/features/courses/course-publish-review.tsx` | T | Preview số buổi/giá/ngưỡng, xác nhận publish, hiển thị 409 conflict. Preview không giữ chỗ, POST vẫn kiểm lại. |
| `frontend/src/features/courses/session-editor.tsx` | T | Reschedule/cancel + makeup, room/coach compatibility, reason, notify summary. |
| `frontend/src/features/courses/threshold-panel.tsx` | T | Confirmed vs break-even, deadline, AtRisk/Met/Waived, action waive reason và ảnh hưởng cancel. |

BreakEvenThreshold FE chỉ preview; kết quả cuối từ BE. Không lấy ReservedCount so threshold; số giữ chỗ và đã trả hiển thị riêng. Không cho sửa Invoice snapshot khi sửa giá course. Edit price/cost sau deadline disable và BE reject. Cancel course hiển thị phạm vi hoàn 100% hoặc phần chưa diễn ra theo backend, yêu cầu lý do; không tự tính rồi gửi approvedPoints vượt rule.

Dời session chỉ hoàn thành khi API thành công; xung đột Member sau dời phải hiện, không chỉ room/coach. Hủy một session không xóa enrollment và phải có buổi bù. Không xóa session history để làm “lịch đẹp”.

**Gate:** tạo Draft→publish đủ buổi→khóa full→AtRisk→waive/transfer/refund; dời có conflict giữ dữ liệu form; hủy/bù đủ buổi; cancel cả khóa hoàn đúng từ ledger.

## 12. P2.09 — Court Schedule, incident và thông báo thủ công

Tạo `frontend/src/features/court-schedule/api.ts`, `court-calendar.tsx`, `occupancy-detail.tsx`, `court-filters.tsx`. Dùng chung component ở Manager/Receptionist/Coach với DTO scope do backend cấp, không fetch all rồi hide.

| Page mới | Nội dung |
|---|---|
| `frontend/src/app/manager/court-schedule/page.tsx` | Ngày/tuần/room, chú giải class/PT/rental/block; tên coach và học viên class/PT; link nghiệp vụ được phép. |
| `frontend/src/app/manager/incidents/page.tsx` | Tạo incident room hoặc center, time/reason; preview ảnh hưởng, resolution session/PT, xác nhận hủy/refund rental/block. |
| `frontend/src/app/manager/notices/page.tsx` | Chọn nhóm Coach, ExternalCoach có rental trong khung giờ, Member lớp được chọn; nội dung/email recipient preview; submit một lần và xem queued/failed. |

Tạo `frontend/src/features/incidents/incident-form.tsx`, `incident-impact-review.tsx`, `manual-notice-form.tsx`. Nếu BE trả pending conflict chưa khóa được room, UI không ghi “đã tạo thành công” rồi bỏ mặc lịch lớp đang chiếm. Chỉ chuyển success khi transaction xử lý thành công; lỗi gửi email sau commit hiển thị riêng trạng thái outbox, không ép người dùng submit incident lần nữa.

Calendar hiển thị thời gian Việt Nam, có textual list trên mobile và cho keyboard. Không chỉ dựa màu để phân loại. Range ngày mặc định bounded, không tải toàn bộ lịch nhiều năm. Rental detail không có nút điểm danh/import học viên.

**Gate:** một incident ảnh hưởng lớp+PT+rental giải quyết rõ từng loại, không chồng room block với Scheduled session; manual notice đúng đối tượng, idempotent, quyền Manager.

## 13. P2.10 — ExternalCoach portal đầy đủ

Tạo các page dưới `frontend/src/app/external-coach/`:

| File | Nội dung và trạng thái |
|---|---|
| `page.tsx` | Dashboard approval status/review note, rental sắp tới, ví; Pending/Rejected/Suspended không được CTA đặt mới. |
| `book/page.tsx` | Sport/date/room/time/hours, availability+price breakdown, ExpectedAttendees optional, checkout points+VNPay. |
| `rentals/page.tsx` | Danh sách own rentals filter status/time, pending checkout, chi tiết, hủy và điểm hoàn. |
| `rentals/[rentalId]/page.tsx` | Chi tiết own room/time/snapshot/invoice/status/cancel reason; không roster. |
| `wallet/page.tsx` | Shared wallet view scoped self, không MemberPicker. |
| `invoices/page.tsx` | Own rental invoices, pay/retry/reconcile state, bồi hoàn; không tạo refund Member request thay backend rental cancel. |
| `profile/page.tsx` | Bio/sport specialties/account links; chỉnh profile không tự Approved lại. |
| `external-coach.module.css` | Layout responsive nhất quán AppShell, không clone toàn bộ CSS Member. |

Tạo `frontend/src/features/rentals/api.ts`, `availability-picker.tsx`, `rental-price-breakdown.tsx`, `rental-list.tsx`, `rental-cancel-dialog.tsx`.

Availability: khối 60 phút, tối đa giờ/ngày trước theo settings từ API; chỉ trống/giá, không tên lớp/học viên đang dùng sân. Rate qua giờ cao điểm hiển thị từng line snapshot. Hủy ≥24h thông báo 100% điểm; <24h thông báo không hoàn vẫn cho hủy theo API; center cancellation read-only lý do/điểm đã trả. Browser time không quyết eligibility, lấy quote từ BE.

Approved chuyển Suspended lúc đang mở trang: booking API 403/409 → refresh status và ngừng đặt mới; lịch đã Confirmed vẫn xem/hủy theo rule. Không xóa lịch sử/rút điểm khi suspend.

**Gate:** đăng ký→duyệt→thuê→QR/points→Confirmed→hủy→ledger; Pending/Suspended chặn booking; hai coach giành cùng slot chỉ một thành công; coach khác không xem rental/invoice/ledger.

## 14. P2.11 — Coach và PT, không để placeholder cũ

| File trong `frontend/src/app/` | QĐ | Yêu cầu |
|---|---|---|
| `coach/page.tsx` | S | Dashboard theo specialties: lớp nhóm và PT có thể cùng xuất hiện, roster read-only lớp mình. |
| `coach/schedule/page.tsx` | S | Lịch được phân công gồm course sessions + PT, room/coach/time đúng API; không show toàn trung tâm. |
| `coach/members/page.tsx` | S | Tab roster lớp mình và quan hệ PT của mình; bỏ guard PersonalTrainer cho toàn trang. |
| `coach/attendance/page.tsx` | S | Bỏ placeholder “đợi mô hình PT”. Trang đọc điểm danh lớp nhóm hoặc redirect canonical results; không cấp quyền mark group cho Coach. |
| `coach/training-plans/page.tsx` | S | Giữ plan CRUD có quan hệ Active + specialty PT; không ép Coach chỉ được một category. |
| `coach/progress/page.tsx` | T | Chọn PtSession thực sự phụ trách, ghi WorkoutResult/nhận xét, timeline có quyền; link có sẵn trong menu cần hoạt động. |
| `coach/homework/page.tsx` | T | Assign/edit/view homework đúng workflow backend, không fake task list. |
| `coach/pt-sessions/page.tsx` | T | Create/detail/update được phép, complete/no-show, quota, room optional, conflict; không gọi attendance lớp. |
| `coach/classes/[classId]/page.tsx` | T | Lịch lớp mình và roster/attendance chỉ xem; không edit lịch Manager hoặc điểm danh. |
| `manager/coaching-relationships/page.tsx` | S | Specialty PT, active relationships, coach-change review; không gắn nhóm course vào PT relationship. |
| `manager/pt-sessions/page.tsx` | T | Manager xếp/dời/hủy PT, room optional, xử lý requests; dùng occupancy BE. |
| `manager/pt-change-requests/page.tsx` | T | Duyệt/từ chối đổi buổi/coach, reason và tác động quota, không approve lặp. |

Tạo `frontend/src/features/pt/api.ts`, `pt-session-editor.tsx`, `pt-quota-summary.tsx`, `workout-result-form.tsx`, `homework-editor.tsx`, `pt-change-request-panel.tsx`. Nếu form tương đương đã có trong page hiện hữu, di chuyển/tái sử dụng thay vì copy.

Giữ BR-70–77 của backend: 90 phút PT, quota reservation/consumption, membership validity, carry-over, reschedule/coach change đúng ownership. Một Coach bị gỡ specialty không tự mất lịch đã phân công; UI thể hiện cảnh báo và endpoint BE quyết quyền thao tác. Không dùng group enrollment ID làm PtSessionId.

**Gate:** Coach lớp nhóm xem được roster nhưng không có action PT nếu thiếu specialty; Coach nhiều specialty dùng được cả hai; complete/no-show không consume quota hai lần; WorkoutResult theo PtSession đúng coach; Member đọc được result/homework của mình.

## 15. P2.12 — Refund, ví quản trị, báo cáo và Admin

| File | QĐ | Công việc |
|---|---|---|
| `frontend/src/app/manager/payment-adjustments/page.tsx` | S | Refund requests theo item; system cap, approved points ≤ cap, reason; approve xong backend Completed và ledger. Không complete payout/RefundMethod/cash evidence form. Legacy adjustments chỉ đọc có nhãn. |
| `frontend/src/app/manager/points/page.tsx` | T | Tìm wallet, xem ledger, Manager adjustment cộng/trừ có reason/idempotency; không cho số dư âm. |
| `frontend/src/app/manager/reports/page.tsx` | S | CashCollected, PointsRedeemed VND, PointsIssued số điểm, OutstandingPoints available+held; filter sport/source/date/external coach; class/hold/threshold; export đúng filter. |
| `frontend/src/app/manager/page.tsx` | S | Summary thật theo v3, links mới, không “profit” khi chưa có payroll/cost accounting. |
| `frontend/src/app/manager/audit-log/page.tsx` | S | Filter action/entity/actor, wallet lookup/OTP confirmation chỉ metadata, không secret. |
| `frontend/src/components/AuditLogView.tsx` | S | Render action mới và pagination, không lộ OTP/hash/email payload nhạy cảm. |
| `frontend/src/app/admin/page.tsx`, `admin/users/page.tsx` | S | Staff creation đúng role, bỏ CoachCategory, đổi role cần specialty khi trở thành Coach theo API; không menu Manager approval/catalog/payment mặc định. |
| `frontend/src/app/admin/audit-log/page.tsx` | G/S theo RBAC backend đã chốt | Không mở rộng quyền vận hành/revenue. Nếu chỉ có audit tài khoản thì scope rõ; nếu API không cho Admin audit thì bỏ nav/route có nội dung và hiển thị 403, không nới BE để chiều UI. |

Tạo `frontend/src/features/reports/api.ts`, `revenue-summary.tsx`, `class-enrollment-report.tsx`, `court-rental-report.tsx`, `points-report.tsx`, `report-export-panel.tsx`; `frontend/src/features/wallet/manager-adjustment-form.tsx`.

Report số liệu ví dụ test: Invoice 300.000 dùng 200 điểm + VNPay 100.000 → CashCollected 100.000; PointsRedeemed 200.000 VND, không 300.000. Hoàn 300 điểm tăng PointsIssued và OutstandingPoints, không trừ 300.000 khỏi tiền ngân hàng đã thu. Cash legacy/verified excess compensation phải hiển thị theo contract P1, không âm thầm bỏ cột đối soát.

**Gate:** số FE bằng API/export với cùng kỳ Việt Nam, label đơn vị rõ; Manager refund/adjust lý do bắt buộc; Receptionist/Admin không truy cập action; audit phản ánh đúng.

## 16. P2.13 — API coverage và chỗ cần bổ sung BE khi tích hợp

Plan 1 phải xuất contract. Không tự đoán request dựa tên entity. Route dưới đây là checklist chức năng; nếu contract P1 đổi tên có lý do, dùng route đã chốt và cập nhật bảng, không dựng hai API cùng nghĩa.

| Nhóm UI | API tối thiểu cần kiểm |
|---|---|
| Auth/account | login/register OTP/Google onboarding/me, forgot/reset/change password, external register OTP/register/status/profile. |
| Manager catalog | sports/room types/rooms/opening hours/blocks/rates/settings, coaches specialties, external approval/reject/suspend/reactivate. |
| Public/Member courses | classes list/detail, own enrollments/schedule, course checkout, invoice state, threshold read/choose. |
| Manager courses | Draft CRUD, preview/availability, publish, update coach/session, cancel/makeup/cancel course, waive threshold, enrollment/hold list. |
| Payment/wallet | self wallet/ledger, Receptionist Member lookup có audit, manager adjust; confirmation create/verify; 4 loại checkout; attempt/cancel/reconcile; own invoices/items/refund. |
| Staff schedules | Court Schedule scoped, roster/attendance, Gym check-in/out/history, incident preview/resolve, manual notice. |
| Rental | approved availability/quote, checkout, self list/detail/cancel, own invoice/wallet. |
| PT | catalog/quote server, entitlement, sessions, change requests/coach-change review, relationships/plans/results/homework. |
| Reporting | cash/points/sport/source/class/rental/Membership, exports, audit, notifications. |

Nếu thiếu API public detail, expired checkout retry, preview eligibility, price PT, approval profile hoặc InvoiceDetail không có fulfillment outcome: bổ sung BE nhỏ ở module đúng và test, cập nhật contract trước khi nối FE. Không xử lý bằng hard-code endpoint không tồn tại như trang forgot-password baseline.

## 17. P2.14 — UX, i18n, accessibility và cấu hình

- Form amount/points rõ đơn vị; numeric input không nhận số âm/lẻ cho points; tiền bội 1.000. Backend vẫn kiểm lại.
- Mọi list có loading/empty/error/retry/pagination hoặc range bounded; mọi mutation disable pending nhưng không dùng disable làm cơ chế chống double transaction duy nhất.
- Dialog có focus trap/return focus/Escape hợp lý; label liên kết input, lỗi aria-live; màu không phải tín hiệu trạng thái duy nhất. Các action tiền/refund/incident hiện snapshot tác động trước confirm.
- Mốc UTC format theo Asia/Ho_Chi_Minh; date-only không parse thành UTC rồi lệch một ngày. Countdown reload không reset deadline, không lấy giờ browser để approve/refund.
- Responsive tối thiểu mobile 390px và desktop 1440px; bảng có scroll vùng riêng, không làm toàn trang tràn; calendar có list view.
- Tất cả chuỗi mới dùng locales vi/en; đừng chỉ xóa key để `check:i18n` pass. Search nội dung Yoga/Group X/ClassInstructor/PersonalTrainer chỉ cho code runtime cũ, không xóa lịch sử docs/migrations.
- `frontend/.env.example`: API base URL, Google public client ID nếu có, URL return/payment mode hiển thị do API cung cấp; **không** đưa VnPay HashSecret/SMTP password vào NEXT_PUBLIC. Không sửa `.env.local` của người dùng để commit.
- `frontend/package.json`/`package-lock.json`: G; chỉ cập nhật dependency khi cần thiết có lý do. `qrcode` có thể vẫn cần hiển thị mã thanh toán; đừng gỡ cùng gate-pass. `jsqr` giữ nếu CameraQrScanner còn consumer.
- Public/role navigation không có dead link; link thông báo về đúng detail; browser Back không tạo lại checkout bằng useEffect.

## 18. P2.15 — E2E và nghiệm thu xuyên suốt

### 18.1 File test/hạ tầng

| File | QĐ / nội dung |
|---|---|
| `frontend/tests/public-auth.spec.ts` | S: strong password, forgot/reset, Google regression, external signup; không gọi route giả. |
| `frontend/tests/member.spec.ts` | S: course checkout/own schedule/wallet/transfer/refund, bỏ demo storage và per-session booking assertions. |
| `frontend/tests/receptionist.spec.ts` | S: select Member, OTP điểm, attendance/Gym checkout, no manual-paid/payout. |
| `frontend/tests/manager-multisport.spec.ts` | T: catalog/coach/course publish, threshold/incident/report. |
| `frontend/tests/external-coach.spec.ts` | T: approval gating, booking/cancel/wallet/privacy. |
| `frontend/tests/coach-training.spec.ts` | T: specialties/roster read-only/PT results/homework/quota. |
| `frontend/tests/payment-lifecycle.spec.ts` | T: partial/full points, retry/return untrusted/late compensation/OTP expiry. |
| `frontend/tests/rbac.spec.ts` | T: direct URL + API negative tests cho 6 role/ownership. |
| `frontend/tests/helpers/api.ts`, `auth.ts`, `seed.ts`, `mailbox.ts` | T: dataset độc lập/clock/mail capture Development hoặc test, không đọc production log; không expose OTP test endpoint trong production. |
| `frontend/playwright.config.ts` | S: URL/env test, browser portable Chromium CI; hiện channel msedge có thể chỉ có local. Backend health gate và isolated account/DB. |
| `.github/workflows/ci.yml` | S: FE typecheck/lint/i18n/build hiện có + E2E cùng backend/Postgres test; upload report/trace khi fail, không xuất secret. |
| `scripts/e2e-business-rules.sh` | S: API smoke v3 thống nhất plan 1; không assert Yoga/daily limit/refund cash. |

E2E gọi backend thật và PostgreSQL demo/test. Có thể dùng MockPaymentGateway chính thức của BE và fake email transport test; không mock response Paid/Enrollment ở Playwright để gọi đó là kiểm thử tích hợp. Test component độc lập có fixture được nhưng ghi rõ mức kiểm thử.

### 18.2 Kịch bản nghiệm thu bắt buộc

| ID | Given / When | Then cần quan sát cả UI và DB/API |
|---|---|---|
| E01 | Member chưa có Gym Membership mua khóa cầu lông | Được giữ chỗ/thanh toán/Confirmed; không yêu cầu Membership. |
| E02 | Member không Active Membership mua PT | Bị chặn đúng rule, không phát Invoice/entitlement tùy tiện. |
| E03 | Hai Member tranh chỗ cuối khóa | Một checkout thắng, một full; counts/holds đúng, UI refresh chỗ. |
| E04 | Hai checkout của cùng Member cho hai lớp trùng buổi | Một bị conflict, không giữ cả hai bằng race. |
| E05 | 300.000, 500 điểm, chọn 200 | Hold 200, QR 100.000, Paid Spend 200, một enrollment; report cash 100.000. |
| E06 | Dùng 300 điểm cho Invoice 300.000 | Paid/Fulfilled, không QR/PaymentAttempt/Payment 0đ. |
| E07 | Lễ tân chọn điểm, chưa nhập OTP / nhập sai 5 lần | PointsApplied=0, chưa hold; mã bị hủy sau 5 sai; không skip OTP. |
| E08 | OTP đúng rồi double-click/poll/refresh | Một confirmation consume và một Hold/Spend, không duplicate. |
| E09 | Hold hết hạn rồi IPN muộn | Còn điều kiện thì fulfill; không còn chỗ thì cash bồi hoàn điểm đúng một lần, UI không báo ghi danh. |
| E10 | URL return giả success / callback lặp | Không thể tự Paid bằng browser; callback lặp không cấp gói/điểm thêm. |
| E11 | Khóa AtRisk, chuyển lớp đắt hơn | Chờ chênh: nguồn vẫn Confirmed, đích chỉ hold; Paid mới chuyển; hết hạn không enrollment miễn phí. |
| E12 | AtRisk timeout/waive/job retry | Auto refund/tiếp tục theo rule, không credit trùng; choice đã gửi không mất. |
| E13 | Refund Membership đủ/thiếu 2/3; PT có/chưa consume | Mức chuẩn 50% đúng điều kiện; approve Completed và điểm/quyền lợi atomic. |
| E14 | Dời/hủy một session | Enrollment giữ nguyên, makeup đúng, notification lịch mới, conflict rõ. |
| E15 | Receptionist đánh attendance; Coach/Manager thử ghi | Chỉ Receptionist được ghi group Present/Absent; 24h boundary kiểm server. |
| E16 | Gym check-in/check-out hai lần | Server kiểm Membership, timestamps hợp lệ, retry không tạo bất nhất. |
| E17 | ExternalCoach pending→approved→suspended | Chỉ Approved tạo mới; rental cũ giữ lịch sử/hủy đúng rule. |
| E18 | Thuê sân va lớp/PT/block hoặc hai rental cùng coach | DB từ chối conflict, UI không show confirmed giả. |
| E19 | Rental hủy đúng 24h / muộn | 100% điểm / 0 theo rule; không attendance học viên ngoài. |
| E20 | Incident center/room với nhiều hoạt động | Preview và resolution, rental hoàn đúng, class/PT xử lý trước block, email queued. |
| E21 | Coach nhiều specialties | Có cả roster lớp mình và PT; không xem roster người khác. |
| E22 | PT complete/no-show, workout/homework | Quota consume đúng một lần, result theo PtSession, Member thấy kết quả. |
| E23 | Reset/change password, role/specialty thay đổi | Token/permission cũ bị xử lý đúng, frontend refresh profile, không cache quyền vô hạn. |
| E24 | Member/ExternalCoach đoán ID ví/invoice/roster người khác | 403/404 ở BE, UI không leak dữ liệu cũ trên lỗi. |
| E25 | Report và export cùng ngày VN/filter | Cash/points/class/rental totals bằng API, không double count split/hold/refund. |
| E26 | Email sender lỗi khi Paid/refund | Tiền/quyền lợi commit, outbox retry; UI không yêu cầu thanh toán lại vì email fail. |

Race tests chi tiết giữ ở backend, E2E chỉ chọn vài đường quan trọng để không flake. Không dùng `waitForTimeout` dài thay polling có deadline hoặc clock test.

### 18.3 Lệnh kiểm tra và báo cáo kết quả

Từ thư mục `frontend`:

```powershell
npm ci
npm run typecheck
npm run lint
npm run check:i18n
npm run build
npm run test:e2e
```

Từ root chạy lại backend tests theo plan 1 nếu đã có thay đổi integration; chạy migration smoke trên DB test nếu schema đổi. Chụp/kiểm UI các màn checkout/OTP, course edit, wallet, calendar, rental và report ở mobile/desktop. Không tuyên bố hoàn thiện từ screenshot khi API fail.

## 19. P2.16 — Dọn cuối và bàn giao web

- [ ] Không còn runtime import demo repo, CoachCategory, Discipline Yoga/GroupX, per-session booking/cancel, booking restriction, trả góp hoặc manual Paid.
- [ ] Không còn form hoàn tiền mặt/chuyển khoản; không còn QR gate pass tự sinh được trình bày như quyền vào cửa.
- [ ] 6 vai trò có menu/trang đúng quyền; không page placeholder “đợi PT model”; các link progress/homework hoạt động.
- [ ] Checkout 4 nguồn, points/OTP/VNP mock và sandbox có trạng thái kiểm chứng riêng; Invoice state/fulfillment/compensation rõ.
- [ ] Manager CRUD môn/sân/coach/khóa/giá; threshold/transfer/incident và báo cáo end-to-end; ExternalCoach portal hoàn chỉnh.
- [ ] Tests phù hợp pass, CI status và các giới hạn thật được ghi; không skip test để che lỗi.
- [ ] `docs/refactor-progress.md` ghi P1/P2 complete theo evidence; tạo `docs/refactor-web-evidence.md` với lệnh/test account/scenario/status/screenshot path và lỗi còn lại.
- [ ] README/PRODUCT/DESIGN/RUNBOOK nói đúng phần đã chạy, account demo đối chiếu seeder; scope AI để trống/chưa làm, không ghi chatbot hoàn thành.
- [ ] Requirements.md và SRS giữ nguyên theo yêu cầu; migration lịch sử giữ nguyên; không commit `.env`, `.env.local`, log OTP hoặc secret.

Khi báo hoàn thành: tóm tắt tính năng thật, danh sách file bị xóa/thêm đáng chú ý, migration/test đã chạy, cách demo, phần chưa xác minh (ví dụ VNPay sandbox chưa có merchant key). Không chỉ trả “đã refactor xong”.

Prompt bắt đầu một chặng có thể dùng:

> Hãy đọc docs/refactor-code-plan-2-frontend.md và refactor-progress, thực hiện chặng P2.xx kế tiếp chưa hoàn thành. Dùng contract backend plan 1. Làm code thật, xử lý lỗi/loading/permission và kiểm thử liên quan. Không làm AI, không sửa Requirements/SRS, không dùng demo thay giao dịch. Trước khi hết context ghi checkpoint có file, test, lỗi và bước tiếp theo.
