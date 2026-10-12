# SportHub — Kịch bản demo Flow 1 + Flow 2

Link demo: https://sports-center-management-system-tawny.vercel.app/ (frontend Vercel, backend Railway, deploy từ `main`).
Thời lượng dự kiến: ~20 phút (Flow 1 ~9 phút, Flow 2 ~11 phút).

> Tên nút và nhãn dưới đây lấy từ route và code, chưa bấm thử trên bản deploy. Hãy chạy thử một lượt trước giờ demo và sửa lại cho khớp.

## 0. Phân vai và tài khoản

| Người | Vai trò | Tài khoản |
|---|---|---|
| An | Admin **và** Member | Hai email **khác nhau**: một tài khoản Admin, một tài khoản Member (quy tắc mới: Member không chuyển thành staff được) |
| Khoa | Manager | Email thật, do Admin tạo |
| Hào | Receptionist | Email thật, do Admin tạo |
| Khôi | Coach bóng rổ | Email thật, do Admin tạo, chuyên môn Bóng rổ |

Tài khoản staff được **tạo ngay trong buổi demo** (Phần 1), nên không cần chuẩn bị mật khẩu trước. Mỗi người mở sẵn hộp thư của mình.

## 1. Checklist trước giờ demo (không làm trên sân khấu)

1. Đã merge và cả Vercel lẫn Railway build xong. Kiểm tra `…railway.app/api/health` trả `{"status":"ok"}`.
2. Biến môi trường Railway: `Frontend__BaseUrl` = link Vercel (nếu không, link trong email trỏ về localhost), SMTP đầy đủ, `VnPay__UseMock=true`, CORS cho phép domain Vercel.
3. Migration đã áp lên DB nếu bản merge có migration mới (backup trước).
4. Có sẵn 1 tài khoản Admin đăng nhập được. Nếu chưa, tạo thủ công trong DB.
5. 4 lớp BR141 đã có trên bản deploy (đã kiểm tra: `BR141-CAULONG-01`, v.v.). Nếu thiếu, chạy `dotnet run --project backend/SportHub.API -- --seed-br141=true` trỏ vào DB deploy.
6. Chuẩn bị sẵn: một lớp sĩ số nhỏ (1–2 chỗ) cho bước chống bán vượt; Member có sẵn ví điểm hoặc một gói để thanh toán nhanh.
7. Mở sẵn 4 cửa sổ trình duyệt riêng (hoặc profile ẩn danh khác nhau), mỗi cửa sổ một vai trò.

---

# FLOW 1 — User & Membership (~9 phút)

## 1.1 Đăng ký Member bằng OTP (An – Member) — 2 phút
1. Mở trang chủ → **Sign in / Register**. Nhập họ tên, email thật của Member, mật khẩu.
2. Hệ thống gửi OTP về email. Mở hộp thư, nhập OTP, hoàn tất đăng ký.
3. **Điểm nói:** đăng ký bằng OTP email (hoặc Google), Member chỉ tự đăng ký, không ai tạo hộ.
4. Vào **Profile** (`/member/profile`): sửa họ tên, đổi avatar.

## 1.2 Quên và đặt lại mật khẩu — 1 phút
1. Đăng xuất → `/forgot-password` → nhập email. Màn hình trả thông báo trung tính (không lộ email có tồn tại hay không).
2. Mở email → bấm link → đặt mật khẩu mới ở `/reset-password`.
3. **Điểm nói:** link dùng một lần, có hạn, trang xác thực luôn tiếng Anh.

## 1.3 Admin tạo staff, nhận email kích hoạt (An – Admin) — 3 phút
1. Đăng nhập Admin → **Admin → Users** (`/admin/users`) → **Create staff account**.
2. Tạo lần lượt: **Khoa** (Center Manager), **Hào** (Receptionist), **Khôi** (Coach). Với Khôi, chọn chuyên môn **Basketball** (bắt buộc với Coach).
3. Mỗi người mở email "Activate your staff account" → bấm **SET YOUR PASSWORD** → đặt mật khẩu → đăng nhập.
4. **Điểm nói:** Admin không đặt mật khẩu hộ; staff tự kích hoạt qua link một lần, hết hạn sau vài giờ.

## 1.4 Quản lý tài khoản & chặn đổi role (An – Admin) — 2 phút
1. Mở một tài khoản Member trong danh sách → **Edit**. **Không có ô đổi role**, chỉ thấy câu: *"Member accounts cannot be converted to staff. Create a staff account with a different email instead."*
2. Mở tài khoản Hào (Receptionist) → đổi sang Center Manager hoặc ngược lại (staff ↔ staff được). Nhập lý do, **Review**, **Confirm**.
3. Mở tài khoản Khôi (Coach) khi đang có lịch hoặc quan hệ huấn luyện → đổi role → bị chặn kèm danh sách lý do (nếu chưa có dữ liệu thì chỉ nói).
4. **Lock** một tài khoản (nhập lý do) → người bị khóa không gọi API được ở request kế tiếp → **Unlock**.
5. Mở **Audit log** (`/admin/audit-log`): thấy đầy đủ thao tác tạo, đổi role, khóa kèm lý do.
6. **Điểm nói:** Member và staff là hai loại tài khoản tách biệt. Muốn làm staff phải dùng email khác. Admin không tự khóa mình, không khóa Admin cuối cùng.

## 1.5 Membership & Gym access (Member + Hào + Khoa) — 1 phút
1. **Khoa:** `/manager/membership-plans` → cho xem các gói (Gym 1 tháng, v.v.), có thể ngừng/mở lại gói.
2. **An – Member:** `/member` → mua gói Gym → checkout (chia điểm + VNPay mock) → `/member/my-plans` thấy gói **Active**. Nhận thông báo/email xác nhận.
3. **Hào:** `/receptionist/gym-checkin` → tìm Member (hoặc quét **mã Member** 5 phút) → **check-in**; sau đó **check-out**.
4. **Điểm nói:** quyền vào Gym phụ thuộc Membership Active; mã Member chỉ quầy hoặc Manager tra được.

**Kết Flow 1:** đã thể hiện đăng ký OTP, quên mật khẩu, tạo staff + kích hoạt email, quản lý trạng thái, đổi role có kiểm soát, mua Membership và Gym check-in, audit.

---

# FLOW 2 — Class booking & schedule (~11 phút)

## 2.1 Manager: lớp & lịch (Khoa) — 3 phút
1. `/manager/classes` → cho xem 4 lớp BR141 (Cầu lông, Bóng rổ; Thứ 2-4-6 07:00–09:00 và Thứ 3-5-7 14:00–16:00; 12 buổi). Mở một lớp: môn, Coach, phòng, sĩ số, giá, trạng thái ngưỡng.
2. **Tạo lớp mới** (`/manager/classes/new`): chọn môn Bóng rổ, Coach Khôi, một phòng. Cố ý chọn **phòng hoặc khung giờ đã bận** → hệ thống báo trùng và hiện xung đột. **Điểm nói:** kiểm tra trùng phòng/sân/Coach nằm ở DB (exclusion constraint), không chỉ ở giao diện.
3. Chọn lịch hợp lệ → **Publish**. Mở `/manager/class-schedule` thấy lịch phòng và Coach cập nhật.

## 2.2 Member đăng ký và thanh toán (An – Member) — 3 phút
1. `/member/courses` → mở lớp vừa publish → **đăng ký**. **Điểm nói:** ghi danh gắn **cả lớp**, không chọn từng buổi.
2. Checkout: dùng điểm, hoặc chia điểm + VNPay (mock). Chỗ được **giữ có thời hạn**, thanh toán xong mới thành ghi danh.
3. `/member/my-registrations` và `/member/class-schedule` xem lịch cá nhân. Chuông thông báo + email.
4. **Chống bán vượt:** dùng lớp sĩ số nhỏ, hai Member đăng ký cùng lúc → người thứ hai bị từ chối (hoặc nói: có test `SeatHoldConcurrencyTests`).

## 2.3 Receptionist và Coach (Hào, Khôi) — 2 phút
1. **Hào:** `/receptionist/registrations` đăng ký hộ một Member; `/receptionist/attendance` điểm danh một buổi.
2. **Khôi:** `/coach/classes` và `/coach/schedule` xem lớp và lịch dạy của mình (chỉ lớp được giao). Có thể gửi yêu cầu đổi buổi để Manager duyệt.

## 2.4 Đóng tuyển sinh, dời/hủy buổi — 1,5 phút
1. **Khoa:** mở chi tiết lớp → **Close enrollment** (đóng tuyển sinh). Member mới không đăng ký được; Member đã ghi danh vẫn học. **Mở lại** (Open enrollment). *Làm lúc chưa ai đang thanh toán dở lớp đó.*
2. **Khoa:** dời hoặc hủy một buổi (có bù buổi). Member nhận thông báo.

## 2.5 Thuê sân và sự cố — 1,5 phút
1. **An – Member:** `/member/courts/book` → chọn giờ trống → thanh toán. Hủy trước 24 giờ hoàn 100% điểm; hủy muộn không hoàn.
2. **Khoa:** `/manager/court-schedule` xem lịch thuê sân.
3. **Khoa:** `/manager/incidents` → **Preview** một sự cố ảnh hưởng sân vừa thuê → **Resolve**. Lượt thuê bị hủy và hoàn 100% điểm; Member nhận thông báo + email.
4. **(Nếu còn thời gian) Sự cố đóng Gym:** preview sự cố đóng mọi phòng Gym → nhập số ngày gia hạn (0–31) → resolve. Membership Active được cộng ngày, mỗi hội viên nhận thông báo + email, có audit. *Lưu ý: chỉ làm trên dữ liệu demo, vì ghi cả khối phòng.*

## 2.6 Ngưỡng lớp (chỉ nói, không làm trực tiếp) — 30 giây
Ngưỡng lớp chạy theo job theo hạn nên khó tái hiện trực tiếp. Mở `/member/threshold-responses` hoặc `/manager/classes/.../interests` nếu có dữ liệu sẵn. Nói rõ Member được chọn: chuyển lớp, chờ đợt sau (hoàn 100% điểm), hoặc hoàn điểm.

---

# Điểm cần nói rõ khi bị hỏi (chưa làm / chưa nghiệm thu)

- Lịch sử và chi tiết sự cố (G06) chưa làm.
- VNPay sandbox thật chưa nghiệm thu; demo dùng mock.
- Lịch cố định BR141 chưa có test tự động (chỉ có seeder).
- Test đóng/mở tuyển sinh (G13) chưa có.
- Chưa nghiệm thu E2E trên staging cho một số mục (G02, G05, G12).

# Kế hoạch dự phòng

| Sự cố | Cách xử lý |
|---|---|
| Email không tới | Kiểm tra Spam; dùng link reset mật khẩu thay thế; báo SMTP đang cấu hình ở Railway |
| Thanh toán lỗi | Dùng ví điểm; xác nhận `VnPay__UseMock=true` |
| Lớp BR141 trống | Chạy seed BR141 trỏ vào DB deploy |
| Hai người cùng đăng ký không tái hiện được | Nói về `SeatHoldConcurrencyTests` |
| Bản deploy chưa có tính năng mới | Kiểm tra trạng thái deploy Vercel/Railway; demo bản local bằng `docker compose` |

# Dọn dữ liệu sau demo

Đừng xóa DB deploy trước giờ demo. Việc xóa tài khoản hay dữ liệu là không hoàn tác được; backup trước và xác nhận danh sách giữ lại.
