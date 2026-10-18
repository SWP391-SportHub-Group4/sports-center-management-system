# SportHub — Kịch bản demo Flow 1 + Flow 2 + Flow 3

Lưu ý thiết lập: ứng dụng chính hỗ trợ `--seed-br141=true` theo [RUNBOOK](RUNBOOK.md#321-dữ-liệu-dev-seed-lớp-br-141-và-reset). Các hướng dẫn `--seed-demo-flow12=true` bên dưới thuộc fixture cũ trong project test, không phải lệnh hiện có của API chính. Không có seed demo tự động khi khởi động.

Môi trường demo dự kiến là bản deploy từ `main` **sau khi merge code mới và triển khai lại**. Ba flow phải dùng cùng một môi trường và database; thay mọi URL `localhost` bên dưới bằng URL deploy khi diễn tập trên bản deploy. Docker local là phương án dự phòng dùng ví điểm, không dùng để chứng minh IPN VNPay công khai.
Thời lượng: ~32 phút (Flow 1 ~10 phút, Flow 2 ~11 phút, Flow 3 ~11 phút). Ba flow nối tiếp nhau: dữ liệu Member mua ở Flow 1–2 (gói Gym, lớp, thuê sân) chính là hóa đơn để demo thanh toán, hoàn điểm và báo cáo ở Flow 3.

> Chạy thử các thao tác ghi dữ liệu bằng tài khoản demo trước giờ trình bày; test tự động không thay thế được việc kiểm tra email thật và trình duyệt trên máy demo.

## 0. Phân vai và tài khoản

| Người | Vai trò | Tài khoản |
|---|---|---|
| An | Admin **và** Member | Hai email **khác nhau** (quy tắc: Member không chuyển thành staff được). Admin: `admin@sporthub.vn` hoặc email thật; Member: đăng ký mới bằng email thật ở bước 1.1 |
| Khoa | Manager | Email thật, do Admin tạo trong buổi demo (hoặc đã tạo sẵn) |
| Hào | Receptionist | Email thật, do Admin tạo trong buổi demo (hoặc đã tạo sẵn) |
| Khôi | Coach bóng rổ | Email thật, do Admin tạo, chuyên môn **Basketball** |

**Dữ liệu seed cho demo** (mật khẩu chung `Sporthub@123`), tạo bằng lệnh ở mục 1.4:

| Tài khoản | Dùng để |
|---|---|
| `demo.member1@sporthub.vn` | Member có **gói Gym đang hoạt động** + 3.000 điểm: Hào check-in ngay, thuê sân |
| `demo.member2@sporthub.vn` | Member **chưa có gói** + 3.000 điểm: demo mua gói Gym, đăng ký lớp |
| `demo.member3@sporthub.vn` | Member + 3.000 điểm: cùng member 2 đăng ký lớp 2 chỗ để thấy hết chỗ |
| Lớp `DEMO-SMALL-01` | Bóng rổ nhỏ, **chỉ 2 chỗ**, 3 buổi Thứ 2-4-6 10:00: demo không bán vượt sĩ số |
| 4 lớp `BR141-*` | Cầu lông / Bóng rổ cố định (BR-141): Thứ 2-4-6 07:00 và Thứ 3-5-7 14:00, 12 buổi |

Tài khoản seed gốc dùng làm **dự phòng** nếu email không tới: `admin@`, `manager@`, `letan@`, `an.member@`, `coach.bongro@sporthub.vn`.

## 1. Chuẩn bị (làm trước, không làm trên sân khấu)

1. Sau khi team merge `develop` vào `main` và deploy, ghi lại commit SHA đang chạy. Diễn tập lại **cả ba flow trên chính bản deploy đó**; giao dịch VNPay đã thử thành công trên `main` trước merge không chứng minh bản sau merge vẫn chạy đúng.
2. Kiểm tra health API và frontend tại URL deploy thực tế; dùng cùng một database demo cho cả ba flow. Các đường dẫn `localhost` trong các bước dưới là ví dụ khi chạy local.
3. Kiểm tra cấu hình môi trường deploy:
   - `Frontend__BaseUrl` trỏ về URL frontend công khai; email kích hoạt/reset phải mở được trên máy của người nhận.
   - SMTP đã có để email thật gửi được. Nếu email không tới, kiểm tra log backend trên môi trường deploy (Docker local: `docker logs sporthub-backend`).
   - VNPay dùng cấu hình merchant đã thử thành công; Return URL mở được và IPN tới API công khai. Sau deploy, thử một giao dịch nhỏ và xác nhận server ghi Paid, cấp quyền lợi đúng một lần trước giờ demo. Không bật mock: `MockPaymentGateway` và endpoint Simulate chỉ nằm trong test host.
4. **Dữ liệu demo:** chuẩn bị tài khoản/lớp trên chính môi trường deploy qua chức năng quản trị hoặc quy trình seed được team chấp thuận. Lệnh dưới đây **chỉ dành cho database local riêng**, không chạy vào database deploy/production:
   ```bash
   dotnet run --project backend/SportHub.API -- --seed-demo-flow12=true "--ConnectionStrings:Default=Host=localhost;Port=<POSTGRES_PORT>;Database=<db>;Username=<user>;Password=<password>"
   ```
   Viết `--seed-demo-flow12=true` (có giá trị) và truyền chuỗi kết nối theo dạng trên, nếu không seed có thể chạy vào DB mặc định. Lệnh in ra tên database đích ở dòng đầu; kiểm tra trước khi chạy tiếp. Lệnh này cũng bảo đảm 4 lớp BR141 có sẵn.
5. Xác nhận: `demo.member1/2/3@sporthub.vn` đăng nhập được; `/member/courses` hiện `DEMO-SMALL-01` (2 chỗ) và 4 lớp BR141.
6. **Dọn tài khoản test cũ** nếu cần: xóa tài khoản và dữ liệu liên quan là không hoàn tác được, nên `pg_dump` trước và chỉ xóa đúng tài khoản đã xác nhận. Nếu Khoa/Hào/Khôi đã được tạo từ trước thì bỏ bước tạo tương ứng ở 1.3 hoặc dùng email khác.
7. Mở sẵn 4 cửa sổ/profile trình duyệt riêng (Admin, Member, Receptionist, Coach/Manager) tại URL frontend của môi trường demo.
8. Backup nếu cần giữ dữ liệu: `docker exec sporthub-postgres pg_dump -U <user> <db> > backup.sql`.

---

# FLOW 1 — User & Membership (~10 phút)

## 1.1 Đăng ký Member bằng OTP (An – Member) — 2 phút
1. `http://localhost:3000` → **Sign in / Register**. Dùng **email thật chưa đăng ký trong database demo**, nhập họ tên và mật khẩu.
2. Nhận OTP qua email, nhập mã, hoàn tất đăng ký.
3. **Điểm nói:** đăng ký bằng OTP email (hoặc Google); Member chỉ tự đăng ký, không ai tạo hộ.
4. Vào **Profile** (`/member/profile`): sửa họ tên, đổi avatar.

## 1.2 Quên và đặt lại mật khẩu — 1 phút
1. Đăng xuất → `/forgot-password` → nhập email. Màn hình trả thông báo trung tính.
2. Mở email → bấm link → đặt mật khẩu mới tại `/reset-password`.
3. **Điểm nói:** link dùng một lần, có hạn; trang xác thực luôn tiếng Anh.

## 1.3 Admin tạo staff, nhận email kích hoạt (An – Admin) — 3 phút
1. Đăng nhập Admin → **Users & roles** (`/admin/users`) → **Create staff account**.
2. Tạo lần lượt: **Khoa** (Center Manager), **Hào** (Receptionist), **Khôi** (Coach). Với Khôi, chọn chuyên môn **Basketball** (bắt buộc với Coach).
3. Mỗi người mở email "Activate your staff account" → **SET YOUR PASSWORD** → đặt mật khẩu → đăng nhập.
4. Nhập email **một lần** khi tạo (kiểm lại với hội viên). Tài khoản chưa kích hoạt có nhãn **Pending activation**; mở **Edit** có **Resend activation link** và **Change email** (sửa email gõ sai, link cũ bị vô hiệu).
5. **Điểm nói:**
   - Hệ thống không xác minh được email có thật hay đúng người; việc xác minh là link kích hoạt gửi tới email đó, nên có gửi lại link và sửa email khi gõ sai. Chờ kích hoạt quá 7 ngày và chưa có dữ liệu nào ghi nhận thì tài khoản tự bị gỡ (job chạy mỗi 10 phút; test `MemberInvitationExpiryTests`).
   - Admin không đặt mật khẩu hộ; staff tự kích hoạt bằng link dùng một lần (24 giờ).
   - **Coach chỉ do Admin tạo** (kèm chuyên môn). Manager không tạo được Coach, chỉ sửa hồ sơ và chuyên môn.

## 1.3b Lễ tân đăng ký Member mới tại quầy (Hào) — 1 phút
1. **Hào:** `/receptionist/members` → **Đăng ký hội viên mới**. Nhập họ tên, email thật (một ô), số điện thoại → **Register and send activation email**.
2. Member mở email "Activate your SportHub account" → đặt mật khẩu → đăng nhập. Trước đó tài khoản có nhãn **Chờ kích hoạt**; lễ tân vẫn bán dịch vụ được, và có **Gửi lại link** / **Đổi email**.
3. **Điểm nói:** quầy không đặt mật khẩu hộ và chỉ tạo Member; link kích hoạt chứng minh email đúng người.

## 1.3c Khách lạ mua vé Gym 1 ngày (Hào + Member) — 2 phút
1. **Tình huống:** một khách chưa có tài khoản tới Gym. **Hào** đăng ký Member cho khách (1.3b) hoặc khách tự đăng ký.
2. **Nhắc khách trước khi trả tiền:** vé 50.000đ và mã check-in **chỉ dùng trong ngày**. Thẻ gói **Gym day pass** và màn bán của lễ tân cũng ghi rõ điều này.
3. Hào bán vé tại `/receptionist/sales` (hoặc khách tự mua ở `/member/services?section=gym&view=explore`) → thanh toán bằng điểm.
4. Nhận thông báo + email "Your Gym day pass". Mở nút **Mã hội viên** trên header: QR do server ký, chỉ có hiệu lực hết hôm nay (giờ Việt Nam).
5. **Hào check-in hộ** (`/receptionist/gym-checkin`) hoặc Member bấm tự check-in. Sang ngày sau mã và vé hết hiệu lực.
6. **Điểm nói:** vé cố định 50.000đ (Manager không sửa được), không hoàn, không gia hạn khi đóng Gym, không nhắc hết hạn; khi Gym đóng cửa vì sự cố thì không mua được vé.

## 1.4 Quản lý tài khoản & chặn đổi role (An – Admin) — 2 phút
1. Mở một tài khoản **Member** → **Edit**: **không có ô đổi role**, chỉ hiện câu "Member accounts cannot be converted to staff. Create a staff account with a different email instead."
2. Mở Hào (Receptionist) → đổi sang Center Manager (staff ↔ staff được). Nhập lý do → **Review** → **Confirm**. Sau khi cho thấy kết quả và audit, **đổi Hào lại thành Receptionist**, rồi đăng nhập lại tài khoản Hào để tiếp tục các bước ở Flow 1–3 (đổi role vô hiệu phiên cũ).
3. Mở Khôi (Coach) khi đang có lịch hoặc quan hệ huấn luyện → đổi role → bị chặn kèm danh sách lý do (nếu chưa có dữ liệu thì chỉ nói).
4. **Lock** một tài khoản (nhập lý do) → người bị khóa bị chặn ở request kế tiếp → **Unlock**.
5. Mở **Audit log** (`/admin/audit-log`): thấy tạo, đổi role, khóa kèm lý do.
6. **Điểm nói:** Member và staff là hai loại tài khoản tách biệt; muốn làm staff phải dùng email khác. Admin không tự khóa mình, không khóa Admin cuối cùng.

## 1.5 Membership & Gym access (Member + Hào + Khoa) — 1 phút
1. **Khoa:** `/manager/membership-plans` xem các gói (ngừng/mở lại được).
2. **Member 2 (`demo.member2@`) hoặc Member thật của An:** mua gói Gym → checkout bằng **điểm** → **My services** (`/member/services?view=owned&type=gym`) thấy gói **Active**; nhận thông báo/email.
3. **Hào:** `/receptionist/gym-checkin` → tìm `demo.member1@` (đã có sẵn gói Gym Active) hoặc Member vừa mua gói (hoặc quét **mã QR hội viên** do server cấp) → **check-in**, rồi **check-out**.
4. **Điểm nói:** quyền vào Gym phụ thuộc Membership Active; mã QR do server ký, hết hạn cuối ngày và client không tự dựng được; lễ tân/Manager quét để server đổi ra Member (`POST /api/members/checkin-code/resolve`).

**Kết Flow 1:** đăng ký OTP, quên mật khẩu, tạo staff + kích hoạt email, quản lý trạng thái, đổi role có kiểm soát, mua Membership và Gym check-in, audit.

---

# FLOW 2 — Class booking & schedule (~11 phút)

## 2.1 Manager: lớp & lịch (Khoa) — 3 phút
1. `/manager/classes`: xem 4 lớp BR141 (Cầu lông, Bóng rổ; Thứ 2-4-6 07:00–09:00 và Thứ 3-5-7 14:00–16:00; 12 buổi). Mở một lớp: môn, Coach, phòng, sĩ số, giá, ngưỡng.
2. **Tạo lớp mới** (`/manager/classes/new`): môn Bóng rổ, Coach Khôi, một phòng. Cố ý chọn **phòng hoặc khung giờ đã bận** → báo trùng, hiện xung đột. **Điểm nói:** kiểm tra trùng phòng/sân/Coach nằm ở DB (exclusion constraint), không chỉ ở giao diện.
3. Chọn lịch hợp lệ → **Publish**. `/manager/class-schedule` thấy lịch phòng và Coach cập nhật.

## 2.2 Member đăng ký và thanh toán (An – Member) — 3 phút
1. `/member/courses` → mở lớp vừa publish → **đăng ký**. **Điểm nói:** ghi danh gắn **cả lớp**, không chọn từng buổi.
2. Checkout bằng **ví điểm**. Chỗ được **giữ có thời hạn**, thanh toán xong mới thành ghi danh.
3. `/member/my-registrations` và `/member/class-schedule` xem lịch cá nhân. Chuông thông báo + email.
4. **Chống bán vượt:** lớp `DEMO-SMALL-01` chỉ có **2 chỗ**. Member 2 và Member 3 đăng ký xong (thanh toán bằng điểm), rồi Member của An đăng ký lớp đó → bị từ chối vì hết chỗ. Đăng ký đồng thời thì có test `SeatHoldConcurrencyTests`.

## 2.3 Receptionist và Coach (Hào, Khôi) — 2 phút
1. **Hào:** `/receptionist/registrations` đăng ký hộ một Member; `/receptionist/attendance` mở roster. Chỉ điểm danh trực tiếp nếu buổi đó đã vào khung điểm danh; buổi tương lai bị chặn đúng nghiệp vụ.
2. **Khôi:** `/coach/classes` và `/coach/schedule` xem lớp và lịch dạy của mình (UC-09); có thể gửi yêu cầu đổi buổi để Manager duyệt.

## 2.4 Đóng tuyển sinh, dời/hủy buổi — 1,5 phút
1. **Khoa:** mở chi tiết lớp → **Close enrollment** → hộp thoại nêu rõ: Member mới không giữ chỗ được, checkout đã giữ chỗ vẫn thanh toán xong được trước khi hold hết hạn, Member đã ghi danh vẫn học. Nhập lý do (bắt buộc) — dialog hiện số Member sẽ nhận thông báo + email tiếng Anh; sau đó **Mở lại** (Member nhận thông báo đã xử lý xong). Nếu lỗi do trung tâm cần hoàn điểm, dùng **Cancel course** (hộp thoại có link tới). Có thể demo cả tình huống đóng khi một Member đang ở bước thanh toán: Member đó vẫn hoàn tất (catalog hiện “Hoàn tất thanh toán”), Member mới nhận `enrollment_closed`.
2. **Khoa:** dời hoặc hủy một buổi (có bù buổi). Member nhận thông báo.

## 2.5 Thuê sân và sự cố — 1,5 phút
1. **An – Member:** `/member/courts/book` → đặt **hai lượt sân ở hai giờ trống khác nhau** và thanh toán. Hủy lượt thứ nhất trước 24 giờ để thấy hoàn 100% điểm; muộn hơn không hoàn. **Giữ lượt thứ hai** cho bước sự cố.
2. **Khoa:** `/manager/court-schedule` xem lịch thuê sân.
3. **Khoa:** `/manager/incidents` → **Preview** sự cố ảnh hưởng lượt sân thứ hai còn hiệu lực → **Resolve**. Lượt này bị hủy, hoàn 100% điểm; Member nhận thông báo + email.
4. **(Nếu còn thời gian) Sự cố đóng Gym:** preview sự cố đóng mọi phòng Gym → nhập số ngày gia hạn (0–31) → resolve. Membership Active được cộng ngày, mỗi hội viên nhận thông báo + email, có audit. *Chỉ làm trên dữ liệu demo, vì thao tác khóa các phòng.*
5. **Điểm nói về hoàn điểm:** sự cố tạm thời của trung tâm không hoàn Membership mà gia hạn; hoàn do lỗi trung tâm chỉ tính theo **phần chưa dùng** (ngày còn lại / tổng ngày).

## 2.6 Ngưỡng lớp (chỉ nói, không làm trực tiếp) — 30 giây
Ngưỡng lớp chạy theo job theo hạn nên khó tái hiện trực tiếp. Mở `/member/threshold` hoặc tab **Threshold** trong chi tiết lớp của Manager nếu có dữ liệu sẵn. Hệ thống kiểm tra sớm hơn mốc 3 ngày 10 phút để job 5 phút vẫn cho Member đủ 48 giờ phản hồi và còn ít nhất 24 giờ trước buổi đầu. Nếu thiếu ngưỡng, Member có thể **giữ ghi danh và chờ**, chuyển lớp, hoặc hoàn điểm. Phương án “chờ đợt sau” hiện **chưa khả dụng**; đừng demo như tính năng đã xong. Người chọn chuyển/hoàn rời lớp ngay; chỉ đếm người còn ghi danh. Nếu đủ ngưỡng trong lúc chờ, xác nhận lớp ngay và không tự hoàn người chưa phản hồi. Nếu hết hạn vẫn thiếu, Manager có thể miễn ngưỡng với lý do/audit; nếu không lớp bị hủy và người còn ghi danh được hoàn điểm. Khi job chạy quá muộn để mở đủ 48 giờ, Manager nhận cảnh báo quyết định miễn ngưỡng, hủy hoặc dời buổi đầu; hệ thống không tự rút ngắn hạn phản hồi.

---

# FLOW 3 — Payment & Report (~11 phút)

Dùng dữ liệu tạo ở Flow 1–2 trên **cùng môi trường deploy**. Member demo: `demo.member2@` và `demo.member3@` nếu các tài khoản này có trên database demo (mỗi người dự kiến 3.000 điểm, 1 điểm = 1.000 VND). Dùng ví điểm cho 3.1 và giao dịch VNPay thật đã diễn tập sau merge cho 3.2.

## 3.1 Invoice snapshot và thanh toán bằng điểm (Member) — 2 phút
1. Đăng nhập Member 2 → `/member/finance?tab=invoices` → mở hóa đơn của gói Gym hoặc lớp đã mua ở Flow 1–2. Đường dẫn `/member/invoices` cũ chỉ chuyển hướng về tab này.
2. Chỉ rõ: các dòng (item) có **giá và thời hạn snapshot** tại lúc mua, không đổi khi Manager sửa catalog; `TotalAmount = PointsApplied × 1.000 + CashAmount`.
3. Mở `/member/finance?tab=wallet`: số dư và **sổ điểm** (Hold → Spend, mỗi dòng có tham chiếu). Thanh toán toàn điểm **không tạo giao dịch VNPay**.
4. **Điểm nói:** backend quyết định số tiền; điểm chỉ giữ/trừ theo xác nhận, giữ chỗ và điểm có hạn, hết hạn nhả đúng một lần.

## 3.2 Chia điểm + VNPay thật và xác minh giao dịch — 3 phút
1. Member 3 mua gói hoặc đăng ký lớp còn chỗ; chọn dùng một phần điểm (ví dụ 200 điểm) và trả phần còn lại qua VNPay. Điểm được giữ theo lựa chọn của người mua.
2. Thanh toán trên cổng VNPay của môi trường demo đã diễn tập. Khi quay về `/payments/return`, cho thấy giao diện **đang xác minh**; chỉ khi server xác nhận thì hóa đơn mới hiện Paid và quyền lợi mới được cấp. Mở lại hóa đơn/gói hoặc ghi danh để đối chiếu.
3. Nói rõ return URL không tự xác nhận thanh toán; backend xác minh IPN hoặc QueryDR. Callback lặp, thất bại và đến muộn có test trong code, nhưng chỉ khẳng định đã nghiệm thu trên môi trường demo nếu team đã thử các trường hợp đó sau merge.

## 3.3 Quầy: checkout hộ và hóa đơn (Hào) — 2 phút
1. **Hào:** `/receptionist/sales` → chọn Member, bán dịch vụ (gói Gym, lớp). Dùng **điểm của Member** thì cần **OTP gửi về email Member**; Member đọc mã cho lễ tân.
2. `/receptionist/invoices`: danh sách hóa đơn, ghi nhận thanh toán; hóa đơn lỗi hoặc đến muộn dùng **Reconcile** (yêu cầu đối soát), lễ tân không tự đánh dấu Paid hay tự cộng điểm.
3. `/receptionist/member-points`: xem điểm của Member tại quầy (kiểm tra màn hình trước: nếu có thao tác điều chỉnh thì chỉ Manager làm, có lý do và audit).

## 3.4 Hoàn trả bằng điểm (Member → Manager) — 3 phút
1. **Member 2:** yêu cầu hoàn gói Gym vừa mua (`/api/refunds/membership-cancellations`, qua màn hóa đơn/gói). Hệ thống hiện **báo giá hoàn** (`quote`): hoàn chuẩn **tối đa 50%** khi còn từ 2/3 thời hạn; sau đó không hoàn. Hoàn **chỉ bằng điểm**, không hoàn tiền mặt/VNPay.
2. **Hào (hộ Member):** cũng tạo được yêu cầu hoàn hộ, bắt buộc nhập lý do.
3. **Khoa:** `/manager/payment-adjustments` → xem yêu cầu → **Approve**. Số điểm do hệ thống tính (Manager không nhập số, không vượt cap); điểm vào ví đúng một lần, bấm lại không cộng trùng (idempotent).
4. Lỗi do trung tâm (**Center Fault**): Manager chọn lỗi trung tâm kèm lý do ≥ 10 ký tự → hoàn theo **phần chưa dùng** (Membership theo ngày còn lại / tổng ngày; vé Gym 1 ngày không hoàn), không hoàn 100%. Sự cố đóng Gym thì **gia hạn Membership** thay vì hoàn (Flow 2.5).
5. Quay lại `/member/finance?tab=wallet`: điểm hoàn xuất hiện trong sổ, gói chuyển Cancelled.
6. Mở `/manager/audit-log`: có bản ghi duyệt hoàn kèm lý do.

## 3.5 Báo cáo (Manager) — 1 phút
1. **Khoa:** `/manager/reports`: **số lượng thành viên**, **đăng ký lớp** (và mức sử dụng lớp), **doanh thu theo thời gian**; lọc theo khoảng ngày, theo chiều doanh thu (môn, loại dịch vụ), doanh thu thuê sân.
2. `/manager/reports/exports`: xuất báo cáo và tải file; cho thấy số liệu khớp với các hóa đơn vừa tạo ở 3.1–3.4.
3. `/manager/finance` và `/manager/points`: tổng quan tài chính và điều chỉnh điểm có lý do + audit.

**Kết Flow 3:** demo hóa đơn snapshot, thanh toán bằng điểm và VNPay trên bản deploy đã diễn tập, hoàn trả bằng điểm theo item không trùng, báo cáo thành viên/đăng ký/doanh thu và audit.

---

# Điểm cần nói rõ khi bị hỏi (chưa làm / chưa nghiệm thu)

- Sự cố (G06): lịch sử/chi tiết và preview theo từng hội viên (kèm điểm hoàn dự kiến) đã có; fence giữ khung giờ chặn đặt mới trong lúc xử lý và danh sách “Incidents in progress” để làm tiếp/nhả đã có; nút “Abandon and undo” nhả khung giờ và trả các buổi đã dời/hủy-bù về như cũ và tạo lại room block thủ công đã gỡ (chỉ cho thay đổi làm khi đang giữ khung giờ; bước nào không còn an toàn, ví dụ slot đã bị chiếm, được giữ nguyên và báo lại).
- Người dùng đã thử thanh toán VNPay thành công trên `main` trước merge. Cần thử lại trên bản deploy sau merge; chưa coi IPN lặp/đến muộn, QueryDR và cấp quyền lợi đúng một lần là đã nghiệm thu nếu chưa có bằng chứng riêng cho từng trường hợp. Docker local dùng ví điểm khi không có IPN công khai.
- Không hoàn tiền mặt/chuyển khoản và không gọi VNPay Refund API (ngoài phạm vi): hoàn chỉ bằng điểm.
- Báo cáo và export đã có mã nhưng chưa nghiệm thu trên dữ liệu lớn.
- Lịch cố định BR141 có `Br141SeederTests` kiểm tra lệnh seed thật, lịch/occupancy và retry trên PostgreSQL. Lệnh ứng dụng chính là `--seed-br141=true`; các lệnh demo fixture khác trong tài liệu này không phải lệnh được ứng dụng chính hỗ trợ.
- Đóng/mở tuyển sinh (G13): đã có test tích hợp `EnrollmentClosureTests` (hold còn hiệu lực hoàn tất sau khi đóng, người mới bị từ chối, mở lại khi payment đang chờ, thông báo). Chưa có test hold hết hạn sau khi đóng và chưa xem UI trên trình duyệt thật.
- Chưa có bằng chứng nghiệm thu E2E trên bản deploy sau merge cho một số mục (G02, G05, G12); cần diễn tập lại trước buổi demo.

# Kế hoạch dự phòng

| Sự cố | Cách xử lý |
|---|---|
| Email không tới | Kiểm tra Spam và log backend của môi trường demo; dùng tài khoản seed đã xác nhận trên cùng database để tiếp tục |
| Link trong email không mở được | Kiểm tra `Frontend__BaseUrl` trỏ đúng URL frontend của môi trường demo |
| VNPay không xác nhận được sau khi quay về | Chờ server đối soát; không tự đánh dấu Paid. Chuyển sang ví điểm nếu cần tiếp tục demo, rồi kiểm tra giao dịch VNPay riêng sau buổi demo |
| Chưa có hóa đơn để hoàn/báo cáo | Chạy lại 1.5 và 2.2 trước (mua gói, đăng ký lớp) để có dữ liệu |
| Lớp BR141 trống | Chạy seed BR141 |
| Trang vẫn là bản cũ | Kiểm tra commit đang chạy và quy trình build/deploy frontend; nếu dùng Docker local, rebuild image sau khi cập nhật code |
| Hai người cùng đăng ký không tái hiện được | Nói về `SeatHoldConcurrencyTests` |

# Dọn dữ liệu sau demo

Xóa tài khoản/dữ liệu là không hoàn tác được. Backup bằng `pg_dump` trước, và xác nhận danh sách tài khoản cần giữ.
