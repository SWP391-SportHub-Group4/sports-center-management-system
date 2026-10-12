# SportHub — Kịch bản demo Flow 1 + Flow 2 + Flow 3 (chạy trên localhost)

Chỉ demo trên máy local, bằng `docker compose`. Code mới nhất nằm ở nhánh `develop` (chưa qua `main`), nên **không dùng link Vercel/Railway**.
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

1. Trên **checkout sạch** (không có thay đổi chưa commit), lấy code mới nhất từ `develop` và rebuild **trước giờ demo**. Nếu đang làm việc trên nhánh có thay đổi dở, dùng một worktree sạch của `develop` thay vì chuyển nhánh ngay trong thư mục đó:
   ```bash
   git checkout develop && git pull origin develop
   docker compose up -d --build
   ```
2. Kiểm tra `http://localhost:5000/api/health` trả `{"status":"ok"}` và `http://localhost:3000` mở được.
3. Trong `.env`:
   - `Frontend__BaseUrl=http://localhost:3000` (link trong email kích hoạt/reset trỏ về localhost, nên **người nhận phải mở link trên chính máy demo**).
   - SMTP đã có để email thật gửi được. Nếu thiếu, nội dung email chỉ nằm trong log backend (`docker logs sporthub-backend`).
   - Đặt `VnPay__UseMock=true` **trước khi bắt đầu cả ba flow**, rồi chạy `docker compose up -d --no-deps --force-recreate backend`. Flow 1–2 vẫn thanh toán bằng ví điểm; Flow 3 sẽ có nút **Simulate success / failure** (gọi `/api/dev/payments/{reference}/simulate`) thay cho cổng VNPay thật. Chỉ dùng mock trong Development.
4. **Seed dữ liệu demo** (idempotent, chạy lại không nhân bản dữ liệu, không cộng điểm lần hai). Lệnh dùng cổng Postgres của máy (`POSTGRES_PORT` trong `.env`, mặc định ví dụ `5435`); thay giá trị cho đúng:
   ```bash
   dotnet run --project backend/SportHub.API -- --seed-demo-flow12=true "--ConnectionStrings:Default=Host=localhost;Port=<POSTGRES_PORT>;Database=<db>;Username=<user>;Password=<password>"
   ```
   Viết `--seed-demo-flow12=true` (có giá trị) và truyền chuỗi kết nối theo dạng trên, nếu không seed có thể chạy vào DB mặc định. Lệnh in ra tên database đích ở dòng đầu; kiểm tra trước khi chạy tiếp. Lệnh này cũng bảo đảm 4 lớp BR141 có sẵn.
5. Xác nhận: `demo.member1/2/3@sporthub.vn` đăng nhập được; `/member/courses` hiện `DEMO-SMALL-01` (2 chỗ) và 4 lớp BR141.
6. **Dọn tài khoản test cũ** nếu cần: xóa tài khoản và dữ liệu liên quan là không hoàn tác được, nên `pg_dump` trước và chỉ xóa đúng tài khoản đã xác nhận. Nếu Khoa/Hào/Khôi đã được tạo từ trước thì bỏ bước tạo tương ứng ở 1.3 hoặc dùng email khác.
7. Mở sẵn 4 cửa sổ/profile trình duyệt riêng (Admin, Member, Receptionist, Coach/Manager) tại `http://localhost:3000`.
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
4. Nhập email **hai lần** khi tạo. Tài khoản chưa kích hoạt có nhãn **Pending activation**; mở **Edit** có **Resend activation link** và **Change email** (sửa email gõ sai, link cũ bị vô hiệu).
5. **Điểm nói:**
   - Hệ thống không xác minh được email có thật hay đúng người; việc xác minh là link kích hoạt gửi tới email đó, nên có nhập email hai lần, gửi lại link và sửa email khi gõ sai.
   - Admin không đặt mật khẩu hộ; staff tự kích hoạt bằng link dùng một lần (24 giờ).
   - **Coach chỉ do Admin tạo** (kèm chuyên môn). Manager không tạo được Coach, chỉ sửa hồ sơ và cấp **quyền dịch vụ PT** nếu Coach dạy PT.

## 1.3b Lễ tân đăng ký Member mới tại quầy (Hào) — 1 phút
1. **Hào:** `/receptionist/members` → **Đăng ký hội viên mới**. Nhập họ tên, email thật **hai lần** (nhập lệch thì nút khóa), số điện thoại → **Register and send activation email**.
2. Member mở email "Activate your SportHub account" → đặt mật khẩu → đăng nhập. Trước đó tài khoản có nhãn **Chờ kích hoạt**; lễ tân vẫn bán dịch vụ được, và có **Gửi lại link** / **Đổi email**.
3. **Điểm nói:** quầy không đặt mật khẩu hộ và chỉ tạo Member; link kích hoạt chứng minh email đúng người.

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
3. **Hào:** `/receptionist/gym-checkin` → tìm `demo.member1@` (đã có sẵn gói Gym Active) hoặc Member vừa mua gói (hoặc quét **mã Member** 5 phút) → **check-in**, rồi **check-out**.
4. **Điểm nói:** quyền vào Gym phụ thuộc Membership Active; mã Member chỉ quầy hoặc Manager tra được.

**Kết Flow 1:** đăng ký OTP, quên mật khẩu, tạo staff + kích hoạt email, quản lý trạng thái, đổi role có kiểm soát, mua Membership và Gym check-in, audit.

---

# FLOW 2 — Class booking & schedule (~11 phút)

## 2.1 Manager: lớp & lịch (Khoa) — 3 phút
1. `/manager/classes`: xem 4 lớp BR141 (Cầu lông, Bóng rổ; Thứ 2-4-6 07:00–09:00 và Thứ 3-5-7 14:00–16:00; 12 buổi). Mở một lớp: môn, Coach, phòng, sĩ số, giá, ngưỡng.
2. **Tạo lớp mới** (`/manager/classes/new`): môn Bóng rổ, Coach Khôi, một phòng. Cố ý chọn **phòng hoặc khung giờ đã bận** → báo trùng, hiện xung đột. **Điểm nói:** kiểm tra trùng phòng/sân/Coach nằm ở DB (exclusion constraint), không chỉ ở giao diện.
3. Chọn lịch hợp lệ → **Publish**. `/manager/class-schedule` thấy lịch phòng và Coach cập nhật.

## 2.2 Member đăng ký và thanh toán (An – Member) — 3 phút
1. `/member/courses` → mở lớp vừa publish → **đăng ký**. **Điểm nói:** ghi danh gắn **cả lớp**, không chọn từng buổi.
2. Checkout bằng **ví điểm** (hoặc chia điểm + VNPay nếu đã bật mock). Chỗ được **giữ có thời hạn**, thanh toán xong mới thành ghi danh.
3. `/member/my-registrations` và `/member/class-schedule` xem lịch cá nhân. Chuông thông báo + email.
4. **Chống bán vượt:** lớp `DEMO-SMALL-01` chỉ có **2 chỗ**. Member 2 và Member 3 đăng ký xong (thanh toán bằng điểm), rồi Member của An đăng ký lớp đó → bị từ chối vì hết chỗ. Đăng ký đồng thời thì có test `SeatHoldConcurrencyTests`.

## 2.3 Receptionist và Coach (Hào, Khôi) — 2 phút
1. **Hào:** `/receptionist/registrations` đăng ký hộ một Member; `/receptionist/attendance` điểm danh một buổi.
2. **Khôi:** `/coach/classes` và `/coach/schedule` xem lớp và lịch dạy của mình (UC-09); có thể gửi yêu cầu đổi buổi để Manager duyệt.

## 2.4 Đóng tuyển sinh, dời/hủy buổi — 1,5 phút
1. **Khoa:** mở chi tiết lớp → **Close enrollment**. Member mới không đăng ký được; Member đã ghi danh vẫn học. **Mở lại**. *Làm lúc chưa ai đang thanh toán dở lớp đó.*
2. **Khoa:** dời hoặc hủy một buổi (có bù buổi). Member nhận thông báo.

## 2.5 Thuê sân và sự cố — 1,5 phút
1. **An – Member:** `/member/courts/book` → đặt **hai lượt sân ở hai giờ trống khác nhau** và thanh toán. Hủy lượt thứ nhất trước 24 giờ để thấy hoàn 100% điểm; muộn hơn không hoàn. **Giữ lượt thứ hai** cho bước sự cố.
2. **Khoa:** `/manager/court-schedule` xem lịch thuê sân.
3. **Khoa:** `/manager/incidents` → **Preview** sự cố ảnh hưởng lượt sân thứ hai còn hiệu lực → **Resolve**. Lượt này bị hủy, hoàn 100% điểm; Member nhận thông báo + email.
4. **(Nếu còn thời gian) Sự cố đóng Gym:** preview sự cố đóng mọi phòng Gym → nhập số ngày gia hạn (0–31) → resolve. Membership Active được cộng ngày, mỗi hội viên nhận thông báo + email, có audit. *Chỉ làm trên dữ liệu demo, vì thao tác khóa các phòng.*
5. **Điểm nói về hoàn điểm:** sự cố tạm thời của trung tâm không hoàn Membership mà gia hạn; hoàn do lỗi trung tâm chỉ tính theo **phần chưa dùng** (ngày còn lại / buổi PT chưa dùng).

## 2.6 Ngưỡng lớp (chỉ nói, không làm trực tiếp) — 30 giây
Ngưỡng lớp chạy theo job theo hạn nên khó tái hiện trực tiếp. Mở `/member/threshold` hoặc trang **Interests** trong chi tiết lớp của Manager nếu có dữ liệu sẵn. Nói rõ Member được chọn: chuyển lớp, chờ đợt sau (hoàn 100% điểm), hoặc hoàn điểm.

---

# FLOW 3 — Payment & Report (~11 phút)

Dùng dữ liệu tạo ở Flow 1–2. Cần `VnPay__UseMock=true` (bước 3 phần Chuẩn bị). Member demo: `demo.member2@` và `demo.member3@` (mỗi người 3.000 điểm, 1 điểm = 1.000 VND).

## 3.1 Invoice snapshot và thanh toán bằng điểm (Member) — 2 phút
1. Đăng nhập Member 2 → `/member/finance?tab=invoices` → mở hóa đơn của gói Gym hoặc lớp đã mua ở Flow 1–2. Đường dẫn `/member/invoices` cũ chỉ chuyển hướng về tab này.
2. Chỉ rõ: các dòng (item) có **giá và thời hạn snapshot** tại lúc mua, không đổi khi Manager sửa catalog; `TotalAmount = PointsApplied × 1.000 + CashAmount`.
3. Mở `/member/finance?tab=wallet`: số dư và **sổ điểm** (Hold → Spend, mỗi dòng có tham chiếu). Thanh toán toàn điểm **không tạo giao dịch VNPay**.
4. **Điểm nói:** backend quyết định số tiền; điểm chỉ giữ/trừ theo xác nhận, giữ chỗ và điểm có hạn, hết hạn nhả đúng một lần.

## 3.2 Chia điểm + VNPay (mock) và xác minh giao dịch — 3 phút
1. Member 3 mua gói Gym hoặc đăng ký lớp, **chọn dùng một phần điểm** (ví dụ 200 điểm), phần còn lại thanh toán VNPay. Điểm không tự trừ khi mở trang; người dùng chọn trước.
2. Màn thanh toán hiện bảng điều khiển mock: bấm **Simulate success**. Hóa đơn chuyển Paid, quyền lợi (gói/ghi danh) chỉ được cấp **sau khi backend xác minh** giao dịch.
3. Lặp lại với một đơn khác và bấm **Simulate failure**: điểm đã giữ được **nhả lại** về ví, không cấp quyền lợi.
4. Mở `/payments/return`: nhấn mạnh **return URL chỉ để hiển thị**; chỉ callback IPN/QueryDR được xác minh mới ghi payment. Giao dịch đến muộn được **đối soát** (reconciliation), không thu hay cấp trùng.

## 3.3 Quầy: checkout hộ và hóa đơn (Hào) — 2 phút
1. **Hào:** `/receptionist/sales` → chọn Member, bán dịch vụ (gói Gym, lớp). Dùng **điểm của Member** thì cần **OTP gửi về email Member**; Member đọc mã cho lễ tân.
2. `/receptionist/invoices`: danh sách hóa đơn, ghi nhận thanh toán; hóa đơn lỗi hoặc đến muộn dùng **Reconcile** (yêu cầu đối soát), lễ tân không tự đánh dấu Paid hay tự cộng điểm.
3. `/receptionist/member-points`: xem điểm của Member tại quầy (kiểm tra màn hình trước: nếu có thao tác điều chỉnh thì chỉ Manager làm, có lý do và audit).

## 3.4 Hoàn trả bằng điểm (Member → Manager) — 3 phút
1. **Member 2:** yêu cầu hoàn gói Gym vừa mua (`/api/refunds/membership-cancellations`, qua màn hóa đơn/gói). Hệ thống hiện **báo giá hoàn** (`quote`): hoàn chuẩn **tối đa 50%** khi còn từ 2/3 thời hạn; sau đó không hoàn. Hoàn **chỉ bằng điểm**, không hoàn tiền mặt/VNPay.
2. **Hào (hộ Member):** cũng tạo được yêu cầu hoàn hộ, bắt buộc nhập lý do.
3. **Khoa:** `/manager/payment-adjustments` → xem yêu cầu → **Approve**. Số điểm do hệ thống tính (Manager không nhập số, không vượt cap); điểm vào ví đúng một lần, bấm lại không cộng trùng (idempotent).
4. Lỗi do trung tâm (**Center Fault**): Manager chọn lỗi trung tâm kèm lý do ≥ 10 ký tự → hoàn theo **phần chưa dùng** (Membership theo ngày còn lại / tổng ngày; PT theo buổi chưa dùng / tổng buổi), không hoàn 100%. Sự cố đóng Gym thì **gia hạn Membership** thay vì hoàn (Flow 2.5).
5. Quay lại `/member/finance?tab=wallet`: điểm hoàn xuất hiện trong sổ, gói chuyển Cancelled.
6. Mở `/manager/audit-log`: có bản ghi duyệt hoàn kèm lý do.

## 3.5 Báo cáo (Manager) — 1 phút
1. **Khoa:** `/manager/reports`: **số lượng thành viên**, **đăng ký lớp** (và mức sử dụng lớp), **doanh thu theo thời gian**; lọc theo khoảng ngày, theo chiều doanh thu (môn, loại dịch vụ), doanh thu thuê sân.
2. `/manager/reports/exports`: xuất báo cáo và tải file; cho thấy số liệu khớp với các hóa đơn vừa tạo ở 3.1–3.4.
3. `/manager/finance` và `/manager/points`: tổng quan tài chính và điều chỉnh điểm có lý do + audit.

**Kết Flow 3:** hóa đơn snapshot, thanh toán chia điểm + VNPay có xác minh và đối soát, hoàn trả bằng điểm theo item không trùng, báo cáo thành viên/đăng ký/doanh thu, audit.

---

# Điểm cần nói rõ khi bị hỏi (chưa làm / chưa nghiệm thu)

- Lịch sử và chi tiết sự cố (G06) chưa làm.
- VNPay sandbox thật chưa nghiệm thu; demo dùng ví điểm hoặc mock (Simulate success/failure). Cổng thật cần merchant sandbox, HTTPS và IPN công khai.
- Không hoàn tiền mặt/chuyển khoản và không gọi VNPay Refund API (ngoài phạm vi): hoàn chỉ bằng điểm.
- Báo cáo và export đã có mã nhưng chưa nghiệm thu trên dữ liệu lớn.
- Lịch cố định BR141 chưa có test tự động (chỉ có seeder).
- Test đóng/mở tuyển sinh (G13) chưa có.
- Chưa nghiệm thu E2E trên staging cho một số mục (G02, G05, G12). Hiện chỉ chạy local.

# Kế hoạch dự phòng

| Sự cố | Cách xử lý |
|---|---|
| Email không tới | Kiểm tra Spam; xem nội dung email trong `docker logs sporthub-backend`; dùng tài khoản seed (`Sporthub@123`) để tiếp tục |
| Link trong email không mở được | Link trỏ `http://localhost:3000`, chỉ mở được trên máy chạy demo |
| Thanh toán lỗi | Dùng ví điểm; hoặc `VnPay__UseMock=true` rồi `docker compose up -d` lại và dùng Simulate success |
| Không thấy nút Simulate | `VnPay__UseMock` đang `false`; đặt `true` rồi khởi động lại backend |
| Chưa có hóa đơn để hoàn/báo cáo | Chạy lại 1.5 và 2.2 trước (mua gói, đăng ký lớp) để có dữ liệu |
| Lớp BR141 trống | Chạy seed BR141 |
| Trang vẫn là bản cũ | `docker compose up -d --build` lại sau khi pull `develop` |
| Hai người cùng đăng ký không tái hiện được | Nói về `SeatHoldConcurrencyTests` |

# Dọn dữ liệu sau demo

Xóa tài khoản/dữ liệu là không hoàn tác được. Backup bằng `pg_dump` trước, và xác nhận danh sách tài khoản cần giữ.
