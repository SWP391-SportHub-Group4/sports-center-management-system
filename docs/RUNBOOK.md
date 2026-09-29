# Chạy SportHub trên máy local

Hướng dẫn chạy toàn bộ hệ thống (PostgreSQL → API → giao diện) và thử từng vai trò.

> **30/09/2026:** Runbook đồng bộ **Business Rules v2.0** và **Design v3** (nhà văn hóa thể thao đa môn: Gym, PT, Cầu lông, Bóng rổ; 6 vai trò; ví điểm; hoàn trả chỉ bằng điểm). Code hiện tại có thể chưa khớp — các tài khoản/kịch bản đánh dấu *(dự kiến)* sẽ có sau khi seed lại ở giai đoạn G1 và triển khai G2–G11 (Design v3 §16). Khi nghiệm thu lấy BR v2.0 làm chuẩn.

## 1. Yêu cầu

- Docker Desktop (cho PostgreSQL)
- .NET SDK 10
- Node.js 24, npm 11

## 2. Khởi động

### 2.1 Database

```bash
docker compose up -d postgres
```

Postgres chạy ở `localhost:5435`. Thông số lấy từ `.env` (mẫu ở `.env.example`).

### 2.2 Backend

```bash
cd backend/SportHub.API && dotnet run
```

Ở môi trường `Development`, API tự làm hai việc khi khởi động:

1. **Áp migration** (`Database.MigrateAsync`).
2. **Seed dữ liệu demo** — chỉ khi database **chưa có tài khoản nào**. Nếu đã có dữ liệu, seeder
   bỏ qua và không đụng vào gì.

Ở môi trường khác, migration chạy qua `dotnet ef database update` trong quy trình triển khai —
tự migrate lúc khởi động sẽ khiến nhiều instance cùng đổi schema một lúc.

Swagger: <http://localhost:5000/swagger>.

### 2.3 Frontend

```bash
cd frontend && npm run dev
```

Giao diện: <http://localhost:3000>. Địa chỉ API đọc từ `NEXT_PUBLIC_API_BASE_URL`
(mặc định `http://localhost:5000`).

## 3. Tài khoản demo

Mật khẩu chung: **`Sporthub@123`** (thỏa password policy BR-102: hoa, thường, số, ký tự đặc biệt)

Bộ tài khoản theo Design v3 §15. Email đánh dấu *(dự kiến)* là tên đề xuất cho seeder mới — sửa bảng này cho khớp `DemoDataSeeder.cs` sau khi seed.

| Vai trò | Email | Vào được gì |
|---|---|---|
| Quản trị hệ thống | `admin@sporthub.vn` | Tài khoản nhân sự (Admin/Manager/Receptionist), đổi vai trò, khóa/mở khóa; không xem Audit Log nghiệp vụ |
| Quản lý trung tâm | `manager@sporthub.vn` | CRUD môn/phòng/sân/giá thuê, Membership, tạo lớp + xếp lịch (có chatbot), phân công Coach, duyệt ExternalCoach, duyệt hoàn điểm, sự cố, báo cáo, Audit Log |
| Lễ tân | `letan@sporthub.vn` | Gym check-in/out, điểm danh lớp nhóm, checkout thay Member (dùng điểm cần OTP email Member), tạo yêu cầu hoàn điểm hộ có lý do, Court Schedule; không cộng/trừ điểm thủ công, không duyệt hoàn điểm |
| Coach — chuyên môn Cầu lông | `coach.caulong@sporthub.vn` *(dự kiến; trước đây `coach.yoga@`)* | Lịch dạy, roster lớp Cầu lông mình phụ trách; **không** có PT/AI vì không có chuyên môn PT |
| Coach — chuyên môn Bóng rổ + PT | `coach.pt@sporthub.vn` *(giữ email cũ)* | Lịch dạy Bóng rổ; PT session, kế hoạch tập, kết quả, homework, gợi ý AI trong phạm vi Member được phân công |
| ExternalCoach (Approved) | `ext.coach@sporthub.vn` *(dự kiến)* | Xem sân trống + giá, thuê/hủy sân, thanh toán, ví điểm, lịch sử thuê |
| ExternalCoach (PendingApproval) | `ext.pending@sporthub.vn` *(dự kiến)* | Chỉ thấy màn "chờ duyệt"; mọi thao tác đặt sân bị từ chối |
| Hội viên (có 500 điểm) | `an.member@sporthub.vn` | Tự checkout Membership/PT/lớp, dùng điểm, VNPay-QR, ví điểm, chatbot Member |
| Hội viên | `binh.member@sporthub.vn`, `chi.member@sporthub.vn` *(3 Member theo Design v3 §15; các tài khoản `dung/giang.member@` cũ có thể bỏ)* | như trên |
| Hội viên (ngừng hoạt động) | `hoa.member@sporthub.vn` | minh hoạ tài khoản bị khóa (BR-6) — giữ nếu seeder còn |

Nút "tài khoản demo" ở màn hình đăng nhập chỉ **điền sẵn form**; việc đăng nhập vẫn đi qua
`POST /api/auth/login` với mật khẩu băm BCrypt trong DB (BR-5). Không có cửa sau nào bỏ qua
xác thực.

## 4. Đường đi để xem từng luồng

> **Chế độ demo:** nếu chưa cấu hình `VnPay__*` thì thanh toán chạy `MockPaymentGateway` (QR giả; bấm nút/gọi `POST /api/dev/payments/{attemptId}/succeed` để mô phỏng IPN). Nếu chưa cấu hình `Email__*` thì email (kể cả OTP) chỉ nằm trong **log backend** — xem mục 9. Nếu chưa có `Gemini__ApiKey` thì chatbot trả lời mô phỏng đúng 2 kịch bản bên dưới.

### Flow 1 — Tài khoản, Membership, ExternalCoach

1. `admin@sporthub.vn` → **Tài khoản & vai trò**: tạo tài khoản nhân sự, đổi vai trò, khóa/mở khóa (bắt buộc lý do — BR-7). Thử tự khóa chính mình để thấy BR-6 chặn.
2. `manager@sporthub.vn` → **Gói thành viên**: tạo gói, sửa giá, ngừng bán (Membership chỉ dành cho Gym + điều kiện mua PT). **Coach**: tạo Coach mới và gán chuyên môn theo môn.
3. `letan@sporthub.vn` → chọn Member và checkout Membership; Invoice tạo tại checkout, Membership chỉ kích hoạt sau khi thanh toán thành công.
4. Đăng ký ExternalCoach ở trang chủ → xác thực OTP email → tài khoản `PendingApproval` → `manager@sporthub.vn` duyệt trong hàng đợi → ExternalCoach đăng nhập được đầy đủ.
5. Mật khẩu: đổi mật khẩu hiện checklist yêu cầu; **Quên mật khẩu** gửi OTP email, đặt lại không cần mật khẩu cũ (phản hồi trung tính nếu email không tồn tại).

### Flow 2 — Lớp học, ghi danh, thuê sân

1. `manager@sporthub.vn` → **Lớp học**: tạo lớp Cầu lông 01 (giá 600.000đ, chi phí 3.600.000đ ⇒ ngưỡng hoàn vốn 6/12), chọn phòng/sân, lịch buổi, Coach có chuyên môn Cầu lông; `Draft → Published`. Thử xếp Coach vào hai lớp trùng giờ hoặc Coach không có chuyên môn ⇒ bị từ chối.
2. **Đăng ký lớp có giữ chỗ:** `an.member@sporthub.vn` → duyệt lớp → **Ghi danh**: hệ thống giữ chỗ 15 phút và tạo Invoice. Không thanh toán kịp thì job trả chỗ, thả điểm giữ, Invoice `Expired`. Thanh toán thành công thì ghi danh `Confirmed`. Lớp còn 1 chỗ mà hai Member cùng bấm ⇒ một người nhận `409 class_full`.
3. **Thuê sân:** `ext.coach@sporthub.vn` → **Thuê sân**: xem khung trống + giá (Cầu lông 100.000đ/giờ thường, 150.000đ/giờ 17:00–21:00), chọn khung ⇒ giữ sân ⇒ thanh toán ⇒ `Confirmed`. Hai ExternalCoach đặt cùng sân/giờ ⇒ một người `409`. Hủy trước 24 giờ hoàn 100% điểm; muộn hơn không hoàn. `ext.pending@` thử đặt ⇒ bị từ chối.
4. `manager@sporthub.vn` → **Sự cố**: chọn khung giờ, hệ thống hủy lượt thuê, hoàn 100% điểm, khóa sân và gửi email tới Coach, ExternalCoach, học viên.

### Flow 3 — Thanh toán, điểm & báo cáo

1. **Split payment 300.000đ với 200 điểm:** `an.member@sporthub.vn` (500 điểm) tự checkout lớp 300.000đ → chọn dùng 200 điểm → bấm xác nhận số điểm (đã đăng nhập nên không cần OTP) → điểm giữ 200, QR VNPay **100.000đ** → IPN thành công ⇒ `Spend` 200 điểm (ví còn 300), Invoice `Paid`, ghi danh `Confirmed`. Dùng đủ 300 điểm thì không có QR và Invoice `Paid` ngay.
2. **Receptionist thanh toán thay tại quầy (OTP):** `letan@sporthub.vn` → tra cứu Member (thấy 500 điểm) → checkout lớp → chọn dùng 200 điểm → hệ thống gửi **OTP 6 số** tới email Member (hiệu lực 5 phút, sai tối đa 5 lần). *Chế độ `LoggingEmailSender`: lấy OTP từ log backend* (mục 9). Member đọc OTP cho lễ tân nhập ⇒ áp dụng điểm, hiện QR 100.000đ. Chưa nhập OTP/sai 5 lần/quá 5 phút ⇒ không điểm nào bị giữ hay trừ. Lễ tân không có chức năng cộng/trừ điểm.
3. Backend tạo PaymentAttempt với `vnp_TxnRef` duy nhất, QR đúng phần tiền còn lại. ReturnUrl chỉ hiển thị trạng thái chờ; chỉ IPN hợp lệ hoặc QueryDR do backend gọi mới xác nhận giao dịch. Không cho cọc/trả góp/thiếu/thừa tiền.
4. Nếu fulfillment lỗi sau khi cổng đã nhận tiền, ghi `ReconciliationRequired`; Receptionist yêu cầu backend thử lại, không đánh dấu Paid thủ công.
5. **Hoàn trả chỉ bằng điểm:** Member (hoặc Receptionist hộ, có lý do) tạo yêu cầu hoàn; Manager approve/reject; hoàn thành ⇒ cộng điểm vào ví (`Earn`), làm tròn xuống theo điểm. **Không có hoàn tiền mặt/chuyển khoản, không gọi VNPay Refund.** Membership hoàn 50% InvoiceItem khi `RemainingDays * 3 >= TotalDays * 2`; PT chưa dùng buổi nào hoàn 50%; gói lớp trước khai giảng hoàn 100%.
6. `manager@sporthub.vn` → **Báo cáo**: doanh thu tiền (VNPay/quầy) tách khỏi điểm dùng (`PointsRedeemed`), điểm cấp (`PointsIssued`) và điểm còn nợ (`OutstandingPoints`); theo môn/nguồn; báo cáo đăng ký lớp và doanh thu thuê sân.

### Kịch bản ngưỡng hoàn vốn (lớp dưới ngưỡng)

1. Lớp Cầu lông 01 (ngưỡng 6/12) chỉ có **4 học viên** khi tới hạn chốt (3 ngày trước khai giảng) ⇒ job đánh dấu `AtRisk`, gửi email cho từng học viên: chuyển lớp khác hoặc hoàn điểm (48 giờ).
2. Thử cả ba nhánh: chọn chuyển lớp (Cầu lông 02), chọn hoàn điểm (nhận 100% điểm), không trả lời (tự hoàn điểm khi hết hạn).
3. Sau hạn phản hồi vẫn dưới ngưỡng ⇒ lớp `Cancelled`, hoàn 100% điểm, giải phóng sân/Coach. Hoặc `manager@sporthub.vn` bấm **Miễn ngưỡng** (nhập lý do, có Audit Log) ⇒ lớp vẫn mở.
4. *Trong demo có thể hạ `class.threshold_days_before_start` / `class.threshold_response_hours` ở **Cấu hình hệ thống** để job chạy sớm.*

### Flow 4 — Điểm danh & tập luyện

1. `letan@sporthub.vn` → **Điểm danh**: chọn buổi lớp nhóm (Cầu lông/Bóng rổ), đánh Có mặt/Vắng. Coach **không** điểm danh lớp nhóm.
2. `coach.pt@sporthub.vn` (chuyên môn PT) → **Kế hoạch tập** / **Điểm danh & kết quả**: soạn giáo án, ghi trạng thái buổi PT (No-show chỉ áp dụng cho PT) và kết quả cho Member được phân công.
3. `coach.caulong@sporthub.vn` → chỉ thấy **Lịch dạy**, roster lớp và hồ sơ; không có menu PT/AI.
4. `an.member@sporthub.vn` → **Kế hoạch & kết quả**: xem lại, không sửa được (BR-25).
5. ExternalCoach: **không** có điểm danh/quản lý học viên; chỉ có `expected_attendees` tự khai khi đặt sân.

### Flow 5 — Gợi ý AI (bài tập)

`coach.pt@sporthub.vn` → **Gợi ý AI** → chọn Member → **Tạo gợi ý**. Màn hình hiện đủ ba đầu vào bắt buộc của BR-26 và thời gian phản hồi ghi vào `AI_Logs` (BR-27). Chỉ Coach có chuyên môn PT và quan hệ `Active` mới gọi được (403 với Coach khác). Không có `Gemini__ApiKey` thì dùng bộ luật cục bộ (`RuleBasedAiRecommendationService`), kết quả tất định.

### Flow 6 — Chatbot (function calling), hai use case

1. **Member:** `an.member@sporthub.vn` → chatbot → "Hôm nay tôi tập gì?" ⇒ hàm `get_my_today_schedule` trả buổi lớp + buổi PT của chính Member (giờ Asia/Ho_Chi_Minh). Thử hỏi cách điều trị chấn thương ⇒ từ chối lịch sự; thử ép truyền `memberId` người khác ⇒ tham số bị bỏ qua.
2. **Manager:** `manager@sporthub.vn` → chatbot → "Mở thêm lớp Cầu lông tối thứ 3–5 hàng tuần" ⇒ `get_room_and_coach_availability` → `suggest_class_schedule` trả tối đa 3 phương án không xung đột → chọn một → `create_draft_class` sinh hành động chờ → bấm **Xác nhận** ⇒ lớp `Draft` (`created_by_ai`). Publish vẫn do Manager.
3. Không có `Gemini__ApiKey`: provider mô phỏng trả lời đúng hai kịch bản trên.

### Kiểm tra phân quyền (Coach / ExternalCoach không vượt quyền)

- `coach.caulong@sporthub.vn` gọi `POST /api/ai/workout-suggestions`, tạo `WorkoutPlan`/`WorkoutResult` ⇒ backend phải trả 403 (không chỉ ẩn menu).
- `ext.pending@sporthub.vn` đặt sân ⇒ từ chối; `ext.coach@sporthub.vn` gọi API quản lý lớp/điểm danh ⇒ 403.
- Xem `docs/Center-Management-System-Design-v3.md` §10 (RBAC).

### Gym / Fitness

`letan@sporthub.vn` → **Gym check-in/out**. Gym ra vào tự do (`WalkIn`), **không** đặt lịch qua lớp; điều kiện duy nhất là Member có ≥1 gói Membership Hoạt động, và check-in **không trừ buổi** (BR-64).

## 5. Tác vụ nền

Chạy trong chính tiến trình API (`SportHub.API/Jobs`):

| Job | Chu kỳ | Việc |
|---|---|---|
| `NotificationDispatchJob` | 30 giây | Chuyển thông báo `Pending → Sent` (BR-34) |
| `SeatHoldExpiryJob` *(dự kiến)* | 1 phút | Hết hạn giữ chỗ, thả điểm giữ, Invoice `Expired` |
| `RentalStatusJob` *(dự kiến)* | 1 phút | Hết hạn lượt thuê chờ thanh toán; `Confirmed → Completed` |
| `ClassThresholdEvaluationJob` *(dự kiến)* | 15 phút | Tới hạn chốt: lớp dưới ngưỡng ⇒ `AtRisk` + email |
| `ClassThresholdResponseExpiryJob` *(dự kiến)* | 15 phút | Hết hạn phản hồi: tự hoàn điểm; lớp còn dưới ngưỡng ⇒ `Cancelled` |
| `ClassStatusJob` *(dự kiến)* | 5 phút | `Published → InProgress → Completed` |
| `AttendanceFinalizerJob` | 10 phút | **Chỉ PT:** ghi `NoShow` cho buổi PT chưa được Coach ghi (BR-20) |
| `MemberPackageExpiryJob` | 15 phút | Membership quá hạn ⇒ `Expired`; nhắc sắp hết hạn (BR-11, BR-33) |

## 6. Kiểm tra

```bash
cd backend && dotnet test SportHub.sln
```

**Các suite integration cần một PostgreSQL thật.** Mặc định chúng dựng container qua
Testcontainers, nên **Docker Desktop phải đang chạy** — nếu không, mọi test integration fail
với `DockerUnavailableException`.

Khi không dùng được Docker, suite `SportHub.Payment.Tests` chấp nhận một PostgreSQL có sẵn
qua biến môi trường. **Phải trỏ vào một DB trống, tách riêng** — suite chạy migration và ghi
dữ liệu thật:

```bash
SPORTHUB_TEST_POSTGRES="Host=localhost;Port=5432;Database=sporthub_payment_tests;Username=postgres;Password=..." dotnet test backend/SportHub.Payment.Tests/SportHub.Payment.Tests.csproj
```

Chỉ chạy unit test (không cần DB, không cần Docker):

```bash
cd backend && dotnet test SportHub.Payment.Tests/SportHub.Payment.Tests.csproj --filter "FullyQualifiedName~Unit"
```

```bash
cd frontend && npm run lint && npm run typecheck && npm run build
```

Kịch bản end-to-end qua HTTP thật (**ghi dữ liệu thật — chỉ chạy trên DB demo**):

```bash
bash scripts/e2e-business-rules.sh
```


## 7. Cấu hình tùy chọn

| Khóa | Mặc định | Ý nghĩa |
|---|---|---|
| `ConnectionStrings:Default` | `.env` | Chuỗi kết nối PostgreSQL |
| `JwtOptions:SecretKey` | `.env` | Khóa ký JWT — **bắt buộc đổi ở môi trường thật** |
| `Google:ClientId` | *(trống)* | Bật đăng nhập Google. Khi trống, `/api/auth/google` trả `503 google_login_not_configured` |
| `VnPay:TmnCode`, `VnPay:HashSecret` (+ Pay/Return/IPN URL) | *(trống)* | Bật VNPay-QR sandbox. Trống ⇒ `MockPaymentGateway` |
| `Email:Smtp:Host/Username/Password` | *(trống)* | Bật gửi email qua SMTP (Gmail App Password). Trống ⇒ `LoggingEmailSender` ghi email vào log |
| `Gemini:ApiKey`, `Gemini:Model`, `Gemini:BaseUrl`, `Gemini:TimeoutSeconds` | *(trống)* | Bật Gemini cho chatbot/gợi ý. Trống ⇒ provider mô phỏng/rule-based |
| `Reports:StorageRoot` | `App_Data/reports` | Thư mục lưu tệp xuất (BR-46) |

Cấu hình nghiệp vụ **không** nằm ở file cấu hình mà ở màn hình **Cấu hình hệ thống** của Quản lý Trung tâm (BR-39): `class.threshold_days_before_start` (3), `class.threshold_response_hours` (48), `hold.minutes` (15), `points.vnd_per_point` (1000), `points.confirm_otp_minutes` (5), `rental.slot_minutes` (60), `rental.max_hours` (4), `rental.advance_days` (30), `rental.cancel_free_hours` (24), `membership.expiry_notice_days` (7).

> `docker-compose.yml` hiện chưa truyền `VnPay__*` và `Email__*` vào container backend; cho tới khi bổ sung thì container luôn chạy chế độ mock/log cho hai dịch vụ này.

## 8. Payment, VNPay-QR và ví điểm

- **VNPay chưa có trong mã** (Design v3 §2.1) — cổng được viết ở giai đoạn G5a. Cấu hình Sandbox cần `TmnCode`, hash secret, Pay URL, Return URL và IPN URL ở secret/config ngoài source control; không có thì dùng `MockPaymentGateway`.
- Mỗi PaymentAttempt dùng `vnp_TxnRef` duy nhất; số tiền gửi VNPay = phần tiền còn lại sau khi trừ điểm (`cash_amount`), đối chiếu chính xác với Invoice.
- IPN phải kiểm tra checksum, TmnCode, TxnRef, Amount, `ResponseCode = 00`, `TransactionStatus = 00` và tính idempotent trước khi fulfillment.
- Khi không nhận IPN hoặc nhận muộn, backend dùng QueryDR. IPN đến sau hạn giữ chỗ: còn chỗ thì tạo ghi danh; đã đầy thì cộng 100% điểm tương ứng và không tạo ghi danh (BR-117).
- **Không có VNPay Refund API, không hoàn tiền mặt** (BR-135). Mọi hoàn trả là cộng điểm vào ví; điểm 1 = 1.000 VND, không hết hạn, không rút tiền.
- Điểm: dùng điểm phải được Member xác nhận (tự checkout: bấm xác nhận; tại quầy: OTP email). Điểm được giữ (`Hold`) khi có PaymentAttempt và chỉ `Spend` khi IPN thành công, `Release` khi hết hạn.
- Email Invoice/Paid/hoàn điểm gửi qua outbox/background job; lỗi email không rollback Payment hoặc quyền lợi đã commit.

## 9. Xử lý sự cố khi thiếu khóa (mock/log)

| Triệu chứng | Nguyên nhân | Cách xử lý |
|---|---|---|
| Không nhận email OTP (đăng ký, quên mật khẩu, OTP thanh toán thay, ExternalCoach) | Thiếu `Email__Smtp__*` ⇒ đang dùng `LoggingEmailSender` | Đọc OTP trong **log backend**: `docker compose logs -f backend` (Docker) hoặc cửa sổ `dotnet run`; tìm dòng email có mã 6 số gần nhất. OTP thanh toán chỉ sống 5 phút — yêu cầu gửi lại nếu quá hạn |
| Gửi SMTP lỗi khi đã cấu hình | Gmail cần **App Password**, không dùng mật khẩu đăng nhập; hoặc compose chưa truyền `Email__*` | Tạo App Password, điền `Email__Smtp__Username/Password`; thêm biến vào `environment` của service `backend`; khởi động lại backend |
| Quét QR VNPay không ra thanh toán / Invoice mãi `Pending` | Thiếu `VnPay__TmnCode/HashSecret` ⇒ `MockPaymentGateway` (QR giả); hoặc IPN không tới được máy local | Dùng endpoint dev `POST /api/dev/payments/{attemptId}/succeed` (chỉ ở Development) để mô phỏng IPN; với sandbox thật cần URL IPN công khai (ngrok) hoặc để backend gọi QueryDR |
| Checkout dùng đủ điểm nhưng không thấy QR | Đúng thiết kế: `cash_amount = 0` ⇒ không tạo PaymentAttempt, Invoice `Paid` ngay | Không cần xử lý |
| Chatbot trả lời cố định, không hiểu câu hỏi tự do | Thiếu `Gemini__ApiKey` ⇒ provider mô phỏng chỉ trả 2 kịch bản (Member "hôm nay tôi tập gì", Manager "mở thêm lớp…") | Dùng đúng câu hỏi của kịch bản Flow 6 hoặc điền `Gemini__ApiKey` (model mặc định `gemini-3.5-flash-lite`) |
| Gemini lỗi/timeout | Sai khóa hoặc mạng; `Gemini__TimeoutSeconds` = 30 | Kiểm tra khóa; hệ thống tự rơi về bộ luật cục bộ cho gợi ý bài tập |
| Đăng nhập Google trả 503 | Thiếu `Google__ClientId` | Điền `Google__ClientId` hoặc dùng đăng nhập email |
| Backend không khởi động | Thiếu/ngắn `JwtOptions__SecretKey` (< 32 ký tự) hoặc DB chưa chạy | Sửa `.env`, chạy `docker compose up -d postgres` |
| Không thấy dữ liệu demo mới sau khi đổi seeder | Seeder chỉ chạy khi DB chưa có tài khoản | `docker compose down -v` rồi chạy lại (mất dữ liệu demo) |
| Job ngưỡng/giữ chỗ không kích hoạt trong demo | Chu kỳ 1–15 phút | Hạ `class.threshold_*`, `hold.minutes` ở Cấu hình hệ thống để demo nhanh |

---

## Refactor delta (RUNBOOK.md — 30/09/2026)

### XÓA

| Nội dung | Lý do |
|---|---|
| Tài khoản `coach.yoga@`, `coach.groupx@` và nhãn `CoachCategory=ClassInstructor/PersonalTrainer` | Yoga/Group X và `CoachCategory` bị xóa; thay bằng `CoachSpecialty` (Design v3 §0 #1, #7) |
| Flow 2 cũ: Yoga/Group X 60 phút, Morning/Afternoon slot, tối đa 1 Yoga + 1 Group X/ngày, hủy trước 30 phút | Mô hình đặt theo buổi bị bỏ (Design v3 §2.1, §2.2 "Xóa hoàn toàn") |
| Refund qua VNPay Refund API, `vnp_RequestId`, trạng thái `Processing → Completed/Failed/ReconciliationRequired` cho refund; Receptionist "không được đánh dấu Completed" cho tiền hoàn | Không hoàn tiền mặt/cổng (BR-135); hoàn = điểm |
| Điểm danh Yoga/Group X bởi lễ tân, mục "Kiểm tra ClassInstructor không vượt quyền" | Không còn ClassInstructor; thay bằng kiểm tra Coach/ExternalCoach |
| Ghi chú "Business Rules v1.8", `Refunded/NetCollected` theo tiền | Thay bằng BR v2.0 và số liệu điểm (`PointsRedeemed/Issued/Outstanding`) |
| `hoa.member`… và 2 Member phụ (`dung/giang`) | Design v3 §15 chỉ còn 3 Member (giữ `hoa.member` nếu seeder còn) — **chưa chắc**, cần đối chiếu seeder |

### GIỮ

| Nội dung | Lý do |
|---|---|
| §1 Yêu cầu, §2 Khởi động (DB, Backend, Frontend) | Không đổi (khớp `docker-compose.yml`, cổng 5435/5000/3000) |
| Mật khẩu chung `Sporthub@123`, nút tài khoản demo, ghi chú BCrypt | Vẫn đúng |
| Tài khoản `admin@`, `manager@`, `letan@`, `coach.pt@`, `an.member@` | Giữ email, sửa quyền |
| Flow 1 (Admin tạo tài khoản, BR-6/BR-7), Gym check-in (BR-64), Flow 4 mục xem kế hoạch (BR-25), Flow 5 (BR-26/27) | Nghiệp vụ giữ nguyên |
| `NotificationDispatchJob`, `MemberPackageExpiryJob`, mục 6 Kiểm tra (Testcontainers, `SPORTHUB_TEST_POSTGRES`, e2e) | Không đổi |
| Nguyên tắc: IPN/QueryDR mới xác nhận thanh toán; ReturnUrl chỉ hiển thị | Vẫn áp dụng cho VNPay-QR mới |

### SỬA

| Nội dung | Trước → Sau |
|---|---|
| Ghi chú đầu file | BR v1.8 → BR v2.0 + Design v3, đánh dấu *(dự kiến)* |
| Coach demo | ClassInstructor Yoga/Group X → Coach chuyên môn Cầu lông; `coach.pt@` = Bóng rổ + PT |
| Quyền Lễ tân | checkout hộ + điểm danh Yoga/Group X → checkout hộ có OTP, điểm danh lớp nhóm, hoàn điểm hộ |
| Flow 2 | đặt buổi lẻ → ghi danh khóa có giữ chỗ 15 phút |
| Flow 3 | Paid/Refund tiền → split payment điểm + VNPay-QR; hoàn chỉ bằng điểm; hoàn Membership 50% giữ công thức, PT giữ điều kiện chưa dùng buổi |
| Flow 4 | Coach vs ClassInstructor → Receptionist điểm danh lớp nhóm, Coach PT ghi kết quả; NoShow chỉ PT |
| `AttendanceFinalizerJob` | NoShow lớp + PT → chỉ PT |
| §7 Cấu hình | thêm VnPay/Email/Gemini và khóa `system_settings` mới |
| §8 | "Payment và VNPay Sandbox" (có refund) → VNPay-QR + ví điểm, không refund |

### THÊM

| Nội dung | Lý do |
|---|---|
| Tài khoản `ext.coach@`, `ext.pending@` (ExternalCoach) | Vai trò thứ 6 (Design v3 §15) |
| Kịch bản: đăng ký lớp có giữ chỗ; split payment 300.000đ với 200 điểm; Receptionist OTP tại quầy (đọc OTP từ log); lớp dưới ngưỡng 4/6 (ngưỡng hoàn vốn); ExternalCoach thuê sân + sự cố; chatbot 2 use case | Design v3 §13, §17 |
| 5 job nền mới | Design v3 §8 |
| Ghi chú compose chưa truyền `VnPay__*`/`Email__*` | Khớp `docker-compose.yml` hiện tại |
| §9 Xử lý sự cố khi thiếu khóa VNPay/SMTP/Gemini (chế độ mock/log) | Yêu cầu demo không cần khóa |
| Kiểm tra phân quyền Coach/ExternalCoach | Thay mục ClassInstructor cũ |
