# SportHub — Functional & Nonfunctional Specification

> Cập nhật: 18/10/2026. Đây là **một file tổng hợp hành vi đang triển khai** để trình bày/kiểm thử, không thay thế [nguồn quy tắc nghiệp vụ](00-Source-of-Truth.md). Số liệu bên dưới lấy từ code tại nhánh đang làm; khi code và yêu cầu khác nhau, phần **Gap/giới hạn** nêu rõ. Không xem giá trị seed là giá trị chắc chắn của mọi database đang chạy.

## Cập nhật luồng phòng — 26/10/2026

**Form Create room:** nhập tên và Capacity (sức chứa một phòng). Allow rental mặc định tắt; bật lên mới hiện giá theo giờ và lịch từng thứ. Save luôn tạo phòng Active; khi cho thuê, API lưu phòng/giờ/giá cùng transaction. Form tạo mới không có nút availability/Active.

Manager tạo và đặt tên phòng tại `/manager/facilities`, không phải chọn môn. Form lớp chọn phòng đang hoạt động từ dropdown dùng chung. Nút **Allow rental** bật riêng quyền cho thuê phòng hiện có; giá thuê/giờ mở cửa được cấu hình tại trang chi tiết. **Disable rental** không đổi lớp hoặc booking đã bán. Xem [luồng, API, migration và tiêu chí nghiệm thu](Independent-Rooms-Workflow.md); phần này thay thế các mô tả cũ về tương thích phòng–môn.

## 1. Phạm vi, vai trò và kiến trúc

SportHub là web quản lý trung tâm Gym, cầu lông và bóng rổ. Frontend dùng Next.js; backend là ASP.NET Core .NET 10 dạng modular monolith; dữ liệu chính ở PostgreSQL. Các module backend gồm Identity, Administration, Scheduling, Membership, Payment, Training, Notification, Audit và AI. API là nguồn quyết định giá, quyền truy cập, thời hạn và trạng thái nghiệp vụ; giao diện chỉ trình bày và gửi thao tác. [Kiến trúc repo](../README.md), [thiết kế chi tiết](Center-Management-System-Design-v3.md).

| Vai trò | Chức năng chính |
|---|---|
| Guest | Xem trang công khai, lớp/sân/Coach công khai; đăng ký tài khoản Member. |
| Member | Mua Membership/vé Gym/lớp, thuê sân; checkout; xem ví, hóa đơn, lịch, thông báo và nội dung lớp còn quyền; hỏi AI theo dữ liệu được phép. |
| Receptionist | Đăng ký/tìm Member tại quầy, bán hộ, check-in/out Gym, đặt hộ và đánh dấu check-in/no-show lượt thuê sân, chỉnh điểm danh lớp khi Member kiến nghị, xử lý hỗ trợ và đối soát khoản đã trả chưa cấp dịch vụ; chỉ tra cứu tài khoản Member. |
| Coach | Xem lớp và học viên đúng phân công; báo vắng/rút báo vắng đang Pending; điểm danh, lập plan, ghi result/nhận xét, giao homework và gửi thông báo đúng phạm vi. |
| Coach — hồ sơ thành tích | Tự tải chứng chỉ/giấy khen lên Cloudinary; nhập tên, đơn vị cấp, ngày cấp; sửa thông tin, chọn hiển thị công khai hoặc gỡ tài liệu của mình. Hỗ trợ JPG/PNG/WebP/PDF, tối đa 10 MiB/tài liệu và 20 tài liệu. Guest/Member chỉ xem tài liệu đã công khai của Coach đang hoạt động, mở bản gốc giữ tỉ lệ. PDF nhiều trang được đọc qua backend có kiểm quyền, xem trong popup, mở bản gốc hoặc tải xuống; Coach có thể đọc PDF chưa công khai của chính mình, không mở quyền cho người khác. Có trạng thái tải/lỗi và Retry. Đây là tài liệu Coach cung cấp; hệ thống không gắn trạng thái xác minh. |
| CenterManager | Quản lý vận hành, lớp/lịch/Coach/sân/phòng/giá/cấu hình; xử lý sự cố, lớp dưới ngưỡng, hoàn điểm, báo cáo và audit thuộc phạm vi Manager. |
| SystemAdministrator | Tạo/quản lý tài khoản staff, đổi role staff hợp lệ, Activate/Deactivate tài khoản kèm lý do và xem audit thuộc phạm vi Admin. Gửi lời mời đặt mật khẩu là thao tác riêng. Không mặc nhiên có quyền vận hành của Manager. |

`sessionId` của lớp là **ID buổi học**, không phải mã đăng nhập. Quyền được xác minh bằng JWT và quan hệ phân công/ghi danh hiện tại. Không có dịch vụ PT 1:1 trong phạm vi hiện hành. [Quy tắc vai trò và Flow 4](00-Source-of-Truth.md), Coach workspace.

## 2. Functional requirements và đường đi FE → BE

### 2.1 Đăng nhập, tài khoản và phân quyền

1. FE gửi đăng ký/OTP, email + mật khẩu hoặc Google ID token tới Identity API. BE xác thực, kiểm tra trạng thái tài khoản và cấp **SportHub access token** kèm thông tin user; Google ID token chỉ dùng để xác minh đăng nhập Google, không dùng làm bearer token gọi API SportHub.
2. FE lưu access token ở `localStorage` (`sporthub.accessToken`), tự thêm `Authorization: Bearer <token>` cho API cần xác thực; login/register/Google gửi request anonymous. Khi tải lại trang, FE gọi `GET /api/users/me` để xác minh phiên. Bất kỳ 401 nào sẽ xóa phiên FE và chuyển về login. [FE auth](../frontend/src/lib/auth.tsx), [API client](../frontend/src/lib/apiClient.ts).
3. BE kiểm chữ ký HS256, issuer, audience, hạn JWT, role và `sst` (security stamp). Mỗi request đã xác thực đọc lại trạng thái/role/stamp của tài khoản trong DB: tài khoản Deactivated/đã xóa, đổi mật khẩu hoặc đổi role làm token cũ không còn được chấp nhận ở request kế tiếp. Chỉ có hai `UserStatus`: `ACTIVE` và `DEACTIVATED`; dữ liệu `BANNED` cũ chuyển thành `DEACTIVATED` và không được tự kích hoạt lại. Endpoint còn kiểm role, chủ sở hữu, ghi danh hoặc phân công ở lớp/buổi. 401 là chưa xác thực/token không hợp lệ; 403 là đã xác thực nhưng thiếu quyền. [JWT](../backend/SportHub.BuildingBlocks/Infrastructure/Authentication/JwtBearerExtensions.cs), [kiểm trạng thái tài khoản](../backend/SportHub.API/Extensions/AccountStatusJwtExtensions.cs).
4. Member tự đăng ký hoặc được Receptionist/Manager đăng ký tại quầy rồi tự kích hoạt/đặt mật khẩu. Admin tạo staff, có thể gửi lại link hoặc sửa email khi chưa kích hoạt. Member và staff không chuyển role qua lại; Coach có thể nhiều chuyên môn. [Quy tắc tài khoản](00-Source-of-Truth.md).

5. `/admin` chỉ có hai KPI trạng thái Active accounts và Deactivated accounts; hàng chờ lời mời staff nằm trong phần riêng, gồm lời mời còn hiệu lực sẽ hết hạn trong 6 giờ. Hàng chờ là tập con của Active, không phải trạng thái DB. Bộ lọc trạng thái `/admin/users` chỉ gồm All/Active/Deactivated; deep link hàng chờ cũ vẫn hoạt động và hiện chip Invitation riêng. `/admin/users` tách **Manage access** và **Manage invitation**; xem chi tiết rồi quay về giữ bộ lọc, phân trang và sắp xếp. Edit account chỉ hiện một nút Activate hoặc Deactivate theo trạng thái hiện tại, nhập lý do và xem lại trước khi gửi; bỏ switch Account enabled và các nút Lock/Unlock. Admin chọn môn khi tạo Coach hoặc đổi staff sang Coach, đồng thời có thể sửa chuyên môn của Coach hiện hữu mà không đổi role. Manager vẫn được sửa chuyên môn trong hồ sơ Coach.
6. Admin dùng Activate/Deactivate kèm lý do bắt buộc; chỉ được chuyển giữa Active và Deactivated. Thay đổi role/trạng thái được khóa tuần tự trong transaction và kiểm lại người thao tác còn Active/Admin. Không tự Deactivate, không làm mất Admin Active cuối cùng, không hạ role tài khoản đang là Admin. Trạng thái, security stamp, audit và outbox được commit cùng nhau; mỗi lần Deactivate Coach có mã sự kiện riêng để thông báo không bị chặn bởi lần trước. Lặp lại trạng thái hiện tại không tạo thay đổi/audit/thông báo trùng. Activate không xác minh email, đặt mật khẩu hoặc bỏ qua điều kiện lời mời.
7. `/admin/audit-log` và audit Manager hỗ trợ preset ngày, khoảng ngày tùy chọn theo giờ Việt Nam, loại/mã bản ghi và các bộ lọc hiện hữu. Admin xem log Manager/Admin/Coach/System; Manager xem log Manager/Receptionist/Coach/Member, theo role tại thời điểm ghi. Lọc không mở thêm quyền truy cập nghiệp vụ. Email lời mời hiển thị **queued** sau khi xếp hàng; hạn vẫn là `CreatedAt + 24 giờ`, không gia hạn khi gửi lại/sửa email.

### 2.2 Mua dịch vụ, checkout, điểm và thanh toán

```text
FE chọn dịch vụ → BE kiểm quyền/giá/sức chứa/lịch, tạo invoice + hold
→ BE trả checkout và expiresAtUtc → FE hiển thị tổng/điểm/tiền/hạn server
→ FE xác nhận điểm (nếu có), mở VNPay cho phần tiền còn lại
→ VNPay IPN hoặc QueryDR được BE xác minh → BE ghi payment và cấp quyền lợi
→ FE đọc lại trạng thái checkout/hóa đơn và hiển thị kết quả.
```

- Checkout dùng `Idempotency-Key` cho thao tác tạo/retry; cùng ý định không tạo đơn hoặc quyền lợi trùng. Giá, điểm, hạn và owner do BE quyết định; FE không được coi đồng hồ trình duyệt là authority. Hold hết hạn thì FE tải lại trạng thái. [Checkout API](../backend/SportHub.Payment/Api/CheckoutsController.cs), [checkout FE](../frontend/src/app/checkout/[invoiceId]/page.tsx).
- VNPay return URL **không** chứng minh đã thu tiền. BE chỉ cấp quyền lợi sau IPN có xác minh hoặc QueryDR; giao dịch sát/hết hạn được đối soát: còn chỗ thì tự cấp và đánh dấu `PAID_AFTER_RECONCILIATION`, không cần nhân viên xác nhận; không cấp được thì Member nhận điểm ngay hoặc gửi Support Request ([Thanh toán, đối soát và hỗ trợ hoàn tiền](Payment-Support-Workflow.md)). Lễ tân/Manager có thao tác đối soát invoice. [VNPay callback](../backend/SportHub.Payment/Api/PaymentsController.cs), [runbook](RUNBOOK.md).
- Ví điểm: 1 điểm = 1.000 VND; điểm không hết hạn; dùng điểm tại quầy cần OTP gửi Member. Hoàn trả bằng điểm theo item và cap BE tính; đã mua thì không hoàn khi Member tự hủy; vé Gym ngày chỉ bán 06:00–22:00, hết hạn 22:00 và không hoàn; Membership thông thường chỉ hoàn tối đa 50% khi còn ít nhất 2/3 thời hạn, gói đã dùng quá mức không hoàn. Member tự nạp điểm qua VNPay tại `/member/wallet/top-up` (nút **Add points** ở tab Point wallet): bước 1 nhập số tiền VND (10.000–10.000.000 ₫, bội số 1.000 ₫, tương ứng 10–10.000 điểm), bước 2 thanh toán VNPay (sandbox hiển thị thẻ test, có nút **Change amount** để hủy checkout và chọn lại). Mỗi Member chỉ có một top-up đang mở: tạo top-up mới sẽ đóng top-up chưa thanh toán trước đó; điểm chỉ được cộng một lần sau khi VNPay xác minh khoản thu (kể cả thanh toán muộn). **Receptionist nạp điểm hộ Member** tại quầy bằng đúng luồng Add points của Member (cần chọn rõ Member, điểm vào ví Member, có audit); Receptionist không tự tặng, trừ hay điều chỉnh điểm. **Manager tặng điểm** (người hoặc nhóm chọn bằng bộ lọc, kèm lý do và điều kiện, màn hình giống Add points của Member, có audit) [Quy tắc thanh toán](00-Source-of-Truth.md).
- Sau thanh toán, Member xem hóa đơn và tải PDF; email biên nhận có bản PDF. [PDF API](../backend/SportHub.Payment/Api/InvoicesController.cs).

### 2.3 Lớp, lịch, thuê sân, Gym và thông báo

- Manager tạo lớp nhiều buổi, chọn Coach đã kích hoạt và đúng chuyên môn, kiểm lịch trống; BE kiểm lại occupancy và sĩ số khi ghi để chống trùng/bán vượt. Member ghi danh cả khóa; thuê sân theo lượt giờ. [Thiết kế](Center-Management-System-Design-v3.md), [class API](../backend/SportHub.Scheduling/Api/ClassesController.cs).
- Lớp dưới ngưỡng được đánh giá trước buổi đầu; Member phản hồi giữ chỗ, chuyển lớp hoặc hoàn điểm. Khi lớp dưới ngưỡng bị hủy lúc hết hạn phản hồi, Member còn ghi danh được hoàn 100% giá trị còn đủ điều kiện bằng điểm và nhận một thông báo (chuông + email) kèm số điểm hoàn và tối đa 3 khóa tương đương tại thời điểm đó (cùng môn, Published, đang mở đăng ký, còn chỗ, chưa bắt đầu, Member chưa ghi danh). Gợi ý chỉ là ảnh chụp lúc hủy: không lưu nguyện vọng, không gửi lại khi có lớp mới, không giữ chỗ hoặc tự ghi danh. [Quy tắc](00-Source-of-Truth.md).
- Coach báo vắng kèm lý do và có thể rút yêu cầu Pending. Manager liên hệ Coach khác và chọn dạy thay/dời/hủy buổi; BE kiểm lại chuyên môn/lịch trống khi lưu. Coach dạy thay chỉ được xem/ghi đúng buổi được giao. Flow 4.
- Coach được phân công điểm danh lớp nhóm; Receptionist chỉ chỉnh sửa điểm danh khi Coach ghi sai và Member kiến nghị (có lý do và audit), đồng thời đánh dấu Checked-in/No-show cho lượt thuê sân (hết giờ chưa đánh dấu thì hệ thống tự ghi No-show); Gym check-in/out phải có quyền dịch vụ còn hiệu lực và không check-in khi Gym đóng vì sự cố. Member nhận thông báo lịch/sự cố theo outbox sau commit. [Gym API](../backend/SportHub.Scheduling/Api/GymCheckInsController.cs), [quy tắc](00-Source-of-Truth.md).
- Member còn ghi danh `Confirmed`, chưa `EndedAt` được đọc lịch sử buổi/plan/homework/result kể cả lớp `Completed`; ghi danh kết thúc hoặc lớp `Cancelled`/`Draft` thì thu hồi quyền nội dung. Coach chủ nhiệm mất quyền hồ sơ khi lớp `Completed` hoặc ghi danh kết thúc. [Member access](../backend/SportHub.Scheduling/Application/Services/MemberClassAccess.cs).

### 2.4 AI và hỗ trợ

- Coach có thể yêu cầu AI gợi ý workout; Coach kiểm tra và quyết định trước khi lưu. Member AI assistant chỉ đọc context SportHub được phép; API key và lời gọi provider ở backend. Các tác vụ ghi DB vẫn qua API nghiệp vụ và authorization. Nếu provider chưa cấu hình, endpoint tương ứng trả lỗi cấu hình, không coi AI là nguồn quyết định quyền. [AI API](../backend/SportHub.AI/Api/AiController.cs), [Coach AI API](../backend/SportHub.AI/Api/ClassTeachingAiController.cs).
- Yêu cầu hỗ trợ được Receptionist/Manager ghi nhận cho Member, phân công/chuyển, cập nhật tiến độ và đóng qua API FrontDesk và workspace riêng `/receptionist/support`, `/manager/support`. Mọi FrontDesk được xử lý yêu cầu của người khác (FR-22); giữ cập nhật mới nhất và audit quá trình. Member tự gửi từ trang Trợ giúp; yêu cầu có hạn phản hồi 48 giờ, Member gửi lại (Remind us) khi quá hạn, hệ thống nhắc người được gán (hoặc Manager và Lễ tân nếu chưa gán). Request danh mục PAYMENT bắt buộc chọn hóa đơn và 1–3 ảnh, không nhập số tài khoản và không do Lễ tân xử lý (Lễ tân thấy, tạo hộ Member và bấm Remind giúp; chỉ Manager xử lý); Manager gọi điện cho Member, chuyển khoản ngoài hệ thống rồi ghi nhận số tiền, ghi chú bắt buộc và ảnh chứng từ, Member xem lại và xác nhận đã nhận. Chi tiết: [Thanh toán, đối soát và hỗ trợ hoàn tiền](Payment-Support-Workflow.md).

## 3. Nonfunctional requirements — cấu hình và thời gian **đang có trong code**

### 3.1 Access token, OTP và thời hạn

| Nội dung | Giá trị/hành vi hiện tại | Cấu hình/nguồn |
|---|---|---|
| SportHub JWT access token | Mặc định **60 phút** từ lúc cấp; cấu hình hợp lệ 1–1.440 phút; JWT bearer cho phép clock skew **1 phút** khi kiểm hạn. Không thấy luồng refresh token SportHub đang dùng; hết phiên cần đăng nhập lại. Logout FE xóa token local, không có server-side logout-all. | `JwtOptions:AccessTokenExpiryMinutes`; [options](../backend/SportHub.BuildingBlocks/Infrastructure/Authentication/JwtOptions.cs), [JWT validator](../backend/SportHub.BuildingBlocks/Infrastructure/Authentication/JwtBearerExtensions.cs) |
| OTP đăng ký Member | **10 phút**, gửi lại sau **60 giây**; tối đa **5 lần sai**, chỉ mã mới nhất dùng một lần. | Hằng trong [AuthService](../backend/SportHub.Identity/Application/Services/AuthService.cs) |
| Link quên mật khẩu | **10 phút**, gửi lại sau **60 giây**, dùng một lần; request quên mật khẩu phản hồi trung tính. Reset mật khẩu đổi security stamp. | [EmailOtpFlow](../backend/SportHub.Identity/Application/Services/EmailOtpFlow.cs), [PasswordResetService](../backend/SportHub.Identity/Application/Services/PasswordResetService.cs) |
| Kích hoạt staff | Hết hạn đúng **24 giờ từ lúc tạo tài khoản**; gửi lại/sửa email không gia hạn mốc, link cũ vô hiệu. | [StaffInvitationExpiryService](../backend/SportHub.Administration/Application/Services/StaffInvitationExpiryService.cs) |
| Member tạo tại quầy chưa kích hoạt | Link kích hoạt **24 giờ**; tài khoản chưa kích hoạt và chưa có dữ liệu được dọn sau **7 ngày**. | [quy tắc](00-Source-of-Truth.md), [MemberInvitationExpiryService](../backend/SportHub.Administration/Application/Services/MemberInvitationExpiryService.cs) |
| OTP xác nhận dùng điểm tại quầy | Mặc định **5 phút**, Manager chỉnh **1–15 phút**; hết hạn sớm hơn nếu checkout hold hết hạn; gửi lại sau **60 giây**, khóa sau **5 lần sai**. | [settings seed](../backend/SportHub.Administration/Infrastructure/Persistence/Configurations/SystemSettingConfiguration.cs), [PointConfirmationService](../backend/SportHub.Payment/Wallet/Application/PointConfirmationService.cs) |

Lưu ý bảo mật: FE hiện lưu JWT ở `localStorage`; token có thể bị lộ nếu có XSS. Đây là hành vi hiện tại, chưa phải cam kết session cookie/refresh token. Secret ký JWT phải cấp qua biến môi trường ở triển khai và dài ít nhất 32 ký tự; không đưa secret vào tài liệu/FE.

### 3.2 Rate limit

Các policy dưới đây khai báo ở [API Program](../backend/SportHub.API/Program.cs) và gắn vào **endpoint cụ thể**, không phải giới hạn mặc định toàn bộ API. Đây là fixed window theo từng tiến trình API, queue = 0: quá ngưỡng trả **HTTP 429**. Muốn đổi các con số phải sửa code/deploy lại; Manager **không** chỉnh chúng trong trang System Settings.

| Policy | Endpoint chính | Giới hạn | Khóa phân vùng |
|---|---|---|---|
| `auth-login` | Login email/password, Google login | **10 request/phút** | IP kết nối trực tiếp |
| `auth-register` | Register | **5 request/phút** | IP kết nối |
| `auth-register-otp` | Gửi OTP đăng ký/đặt mật khẩu | **3 request/phút** | IP kết nối |
| `auth-password-reset` | Quên/đặt lại mật khẩu | **3 request/phút** | IP kết nối |
| `point-confirmation` | Xác nhận điểm tại quầy | **3 request/phút** | IP + hash Authorization header |
| `checkout-write` | Các thao tác ghi checkout | **20 request/phút** | `User.Identity.Name`, nếu thiếu dùng IP |
| `avatar-write` | Ghi/xóa avatar | **10 request/phút** | User ID, nếu thiếu dùng IP |
| `vnp-ipn` | VNPay IPN | **120 request/phút** | IP kết nối |

Login có JSON `too_many_requests` và chỉ gửi `Retry-After` khi limiter cung cấp metadata; các policy còn lại dùng status 429 mặc định. Limiter nằm trong bộ nhớ từng instance: restart xóa bộ đếm, nhiều instance không chia sẻ quota. Sau reverse proxy, code login hiện lấy `RemoteIpAddress`, **không** tự tin `X-Forwarded-For`; cần cấu hình trusted proxy trước khi coi IP client là khóa quota. Các client chung NAT có thể chung quota. [Login policy](../backend/SportHub.API/RateLimiting/LoginRateLimitPolicy.cs).

### 3.3 System Settings do Manager chỉnh

Manager đọc/cập nhật bằng `GET/PUT /api/system-settings/{key}`; backend kiểm range và ghi audit. Bảng sau là giá trị **seed** và range ở [SystemSettingService](../backend/SportHub.Administration/Application/Services/SystemSettingService.cs); giá trị thực tế phải đọc DB qua API.

| Key | Seed | Giá trị hợp lệ / ý nghĩa |
|---|---:|---|
| `membership.expiry_notice_days` | 10 ngày | 1–90 ngày trước hạn Membership; nhắc qua hệ thống và email |
| `class.threshold_days_before_start` | 3 ngày | 3–30 ngày trước buổi đầu để đánh giá ngưỡng |
| `class.threshold_response_hours` | 48 giờ | 1–336 giờ; phải còn trọn cửa sổ phản hồi + 24 giờ để chốt trước lớp |
| `hold.minutes` | 15 phút | **10–30 phút**; checkout mới của lớp, thuê sân, gói và chuyển lớp có chênh; không kéo dài checkout đã tạo |
| `points.confirm_otp_minutes` | 5 phút | 1–15 phút, còn bị chặn bởi hạn hold |
| `rental.slot_minutes` | 60 phút | Chỉ 30 hoặc 60 phút |
| `rental.max_hours` | 4 giờ | 1–4 giờ |
| `rental.advance_days` | 3 ngày | 1–30 ngày đặt trước; mặc định mở hôm nay + 3 ngày (4 ngày lịch) |
| `rental.cancel_free_hours` | 24 giờ | 0–168 giờ trước lượt thuê để hủy miễn phí |

`hold.minutes` là **trần cấu hình**, không bảo đảm mọi checkout kéo đủ thời gian đó: mốc bắt đầu lớp/sân hoặc deadline chuyển lớp có thể làm hạn thực tế sớm hơn. FE phải dùng `expiresAtUtc` BE trả về. Vé Gym ngày giá 50.000 VND, chỉ bán 06:00–22:00 giờ Việt Nam, hết hạn 22:00 cùng ngày mua và không hoàn. [Quy tắc thời hạn](00-Source-of-Truth.md).

### 3.4 Độ tin cậy, dữ liệu và vận hành

- **Thời gian:** lưu UTC, hiển thị giờ Việt Nam; khoảng lịch `[start, end)`. Giá/điểm dùng snapshot khi mua; thao tác ghi kiểm lại điều kiện trong transaction, không chỉ kiểm lúc render FE. PostgreSQL constraint/transaction chống trùng lịch, bán vượt và thao tác lặp. [Quy ước](00-Source-of-Truth.md).
- **Job nền:** trong tiến trình API; nhả hold/checkout và đối soát thanh toán mỗi **1 phút**, đánh giá ngưỡng mỗi **5 phút**, gửi notification outbox mỗi **30 giây**, dọn Member chưa kích hoạt mỗi **10 phút**, hạn Membership mỗi **15 phút**. Khoảng chạy job không gia hạn deadline; API vẫn phải từ chối thao tác đã hết hạn. [Đăng ký job](../backend/SportHub.API/Program.cs), [mã job](../backend/SportHub.API/Jobs).
- **Thông báo:** tạo outbox cùng transaction nghiệp vụ, dispatch sau commit, có retry/dedup; dashboard Manager `GET /api/manager/operations/health` báo trạng thái job/outbox/đối soát. Gateway event Pending quá **10 phút** hoặc seat hold hết hạn quá **5 phút** chưa nhả là tín hiệu Unhealthy; outbox lỗi và khoản cần xử lý thủ công làm trạng thái Degraded. [Health API](../backend/SportHub.API/Controllers/OperationsHealthController.cs).
- **Tích hợp và bảo mật triển khai:** API dùng CORS allowlist `Cors:AllowedOrigins`, HTTPS, JWT secret, PostgreSQL; production yêu cầu SMTP, khóa Data Protection bền vững và cấu hình VNPay HTTPS. `NEXT_PUBLIC_API_BASE_URL` được đóng vào frontend khi build. Google/VNPay/Gemini/Cloudinary cần credential riêng ở BE; không nhúng khóa vào frontend. [Runbook](RUNBOOK.md), [CORS](../backend/SportHub.API/Extensions/CorsExtensions.cs).
- **Mã lỗi API:** FE xử lý theo `error` ổn định; 401 xóa phiên và đăng nhập lại, 403 báo thiếu quyền, 409 báo xung đột nghiệp vụ, 429 báo chờ trước khi thử tiếp. Các quyết định giá, phân quyền và quyền đọc dữ liệu luôn phải kiểm ở BE. [ApiError](../frontend/src/lib/apiClient.ts).

## 4. Gap/giới hạn cần giữ khi trình bày

1. **Chưa có SLO được phê duyệt** cho uptime, latency p95, concurrent users hoặc RPO/RTO. Không tự ghi các số đó thành nonfunctional requirement đã đạt. Runbook có ngân sách kiểm thử báo cáo (10 giây), đối soát (30 giây), health (5 giây) nhưng là ngưỡng script nghiệm thu, không phải SLA production. [Runbook](RUNBOOK.md).
2. Rate limit hiện là in-memory từng instance; khi triển khai nhiều API replicas cần limiter tập trung/gateway nếu muốn quota toàn cụm. Cấu hình reverse proxy phải xác định đúng IP thật trước khi dựa vào quota theo IP.
3. Google/SMTP/VNPay sandbox thật, callback public, backup–restore và vận hành production phải nghiệm thu trên môi trường tích hợp. FE và BE test local/CI không tự chứng minh các dịch vụ ngoài hoạt động. Các gap sản phẩm đang theo dõi tại [thiết kế §13](Center-Management-System-Design-v3.md).
4. Tài liệu này mô tả cấu hình/hành vi tại ngày cập nhật. Trước demo hoặc release, đọc lại `GET /api/system-settings` và biến môi trường của môi trường đó; không dùng bảng seed để suy đoán trạng thái DB đã được Manager chỉnh.
5. **COACH-01 — loại request tạo mới:** UI Coach chỉ gửi ABSENCE, PUT sửa đã gỡ và Pending chỉ có rút. Backend vẫn chấp nhận SUBSTITUTE/RESCHEDULE/CANCEL_WITH_MAKEUP từ client cũ qua `ValidRequestType`; do đó chưa đạt yêu cầu chỉ tạo ABSENCE ở mọi client. Các loại này vẫn hợp lệ cho quyết định Manager và lịch sử; không mô tả chúng như quyền Coach tự đổi lịch. Xem [thiết kế §13.2](Center-Management-System-Design-v3.md#132-chức-năng-và-contract-còn-thiếu) và [request service](../backend/SportHub.Scheduling/Application/Services/ClassSessionChangeRequestService.cs). Đối chiếu code `06683826` ngày 18/10/2026, không chạy lại kiểm thử ứng dụng trong lần cập nhật tài liệu này.

### Assigned support inbox — Admin and Coach

Coach uses a single Requests page at `/coach/support`, with **Absence requests** and **Member support** tabs. Member support remains the default so existing assignment links (`?request=id`) continue to open the assigned request. Absence requests use `?type=absence`; `/coach/change-requests` redirects to that tab. The separate personal-menu absence link is removed. Grouping the inboxes does not change permissions: Coach submits/cancels absence requests for Manager review and only handles assigned member support requests.

Admin and Coach receive member support requests assigned by Center Manager. Each receiver can view only currently assigned requests, including attachments and activity history, and add a progress note or complete the request with a resolution note. Both use the same status summaries, filters and badge colors as Receptionist: Received (OPEN), Assigned (ASSIGNED), In progress (IN_PROGRESS), Finished (DONE/CLOSED) and Declined (REJECTED). Declined requests are counted separately from Finished for every role. Overdue is a separate response-deadline filter, not a request status. Neither receiver can assign, reject or create requests on behalf of a member. Assignment notifications open the corresponding inbox detail. Completed and historical rejected records remain read-only; their original outcome stays in the history. The Report photo action is removed from profile avatars; existing avatar moderation data is preserved.

### Profile photo audit review

System Administrators can inspect before/after images for profile photo upload, replacement, Google import and removal through Audit log event details. New image evidence is retained privately for 30 days, including after the original public image is removed; only Admin can fetch it. Access stops at expiry and a cleanup job removes expired image data. Audit event metadata remains. Member photo events are included for this review without exposing unrelated Member operations. Legacy or unavailable images show an explicit unavailable state; this feature does not recover previously deleted images.

### Manager support configuration and profile updates

Managers and System Administrators manage their own Cloudinary avatar from Account using the shared crop editor (JPG/PNG/WebP, maximum 5 MiB). Self-service upload/removal uses the authenticated account ID, records audit events and cleans up replaced images; their avatar API requires authentication. Operating settings provides the three existing support deadline/reminder/payout confirmation values, with validation matching the backend. Operations health reports paid-but-unactivated invoices and overdue support requests, replacing the previous manual-compensation count. New support/payment audit events use human-readable labels and safe event details; bank account information is never added to audit values. No new support setting or database migration is introduced by these updates.
