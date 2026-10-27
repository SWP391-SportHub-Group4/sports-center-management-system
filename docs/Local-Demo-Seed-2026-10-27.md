# Local demo seed — 27/10/2026

Seeder đã được chạy trên PostgreSQL **local** `sporthub` ở `localhost:5435`, không chạy trên Railway. Lệnh `--seed-local-demo=true` chỉ được chấp nhận trong `Development` với DB host local và phải có đủ migration. Nó có thể chạy lại mà không tạo trùng các record gắn prefix `LOCAL-DEMO-20261028`.

## Tài khoản local trước seed (được giữ nguyên)

| Role | Email |
|---|---|
| SystemAdministrator | `admin@sporthub.vn` |
| CenterManager | `manager@sporthub.vn`, `nnkhoa1999@gmail.com` |
| Receptionist | `avatarstar1133@gmail.com`, `letan@sporthub.vn` |
| Coach | `coach.caulong@sporthub.vn`, `coach.caulong2@sporthub.vn`, `coach.bongro@sporthub.vn`, `coach.bongro2@sporthub.vn` |
| Member | `an.member@sporthub.vn`, `docuachung403@gmail.com`, `hoanai3126@gmail.com`, `holethiena@gmail.com`, `holethienan2006@gmail.com`, `holethienan3010@gmail.com`, `nhatkhanhle11906@gmail.com` |

`holethienan3010@gmail.com` đang là **Member** ở local; không chuyển thành Admin. Seeder không đổi role/mật khẩu của 16 tài khoản trên.

## Dữ liệu seeder bổ sung

- **4 Member giả có thể đăng nhập:** `binh.member@sporthub.vn`, `khoi.member@sporthub.vn`, `hao.member@sporthub.vn`, `khoa.member@sporthub.vn`; mỗi người có ví điểm. Mật khẩu lấy từ `LocalDemoSeed__Password` và băm bằng hasher của hệ thống. Seeder đồng bộ mật khẩu **chỉ** cho bốn fixture này.
- **5 gói Gym:** giữ 5 gói đã có, điền `OriginalPrice` 3.600.000đ cho gói 6 tháng và 7.200.000đ cho gói 12 tháng; các giá bán lần lượt 600.000đ, 1.800.000đ, 2.400.000đ, 6.000.000đ và vé ngày 50.000đ.
- **4 lớp mới:** mã `LOCAL-DEMO-20261028-BAD-01/02`, `...-BASK-01/02`, bắt đầu 28/10/2026, 12 buổi Thứ 2/4/6, ca 07:00–09:00 và 14:00–16:00. Giá Cầu lông 900.000đ, 5 chỗ; Bóng rổ 1.200.000đ, 7 chỗ. `coach.caulong@sporthub.vn` dạy hai lớp Cầu lông, `coach.bongro@sporthub.vn` dạy hai lớp Bóng rổ. Mỗi lớp có một ghi danh mẫu, còn chỗ để mua live; ngưỡng hòa vốn đã đạt.
- **Sân thuê:** `Badminton Rental BR1` 100.000đ/giờ, `Basketball Rental KR1` 200.000đ/giờ. Đã xóa sân thử nghiệm `101-test` cùng hai rate 26.000đ/giờ và giờ mở cửa của sân này; sân không có booking/lớp/occupancy.
- **Hồ sơ Coach:** giữ bio/kinh nghiệm/avatar local hiện có. Thêm hai certificate hình SVG có nhãn lớn **DEMO SAMPLE — NOT A VERIFIED QUALIFICATION**, chỉ để trình diễn bố cục; file ở `frontend/public/demo-certificates/`. Đây là static local demo asset, không phải chứng chỉ thật hay Cloudinary upload.
- **Giao dịch mẫu:** Bình và Khoa có hóa đơn Membership + quyền lợi Gym; Khôi có ghi danh Cầu lông, Hào có ghi danh Bóng rổ; Hào có thuê sân Cầu lông ngày 29/10 18:00–19:00, hóa đơn 100.000đ và occupancy. Tám hóa đơn mẫu này đều có bản ghi Payment tiền mặt tương ứng. Đây là **fixture thanh toán tiền mặt mô phỏng**, không phải giao dịch VNPay đã xác minh.
- **IPN muộn mô phỏng:** một invoice `PAID_AFTER_RECONCILIATION` + `FULFILLED` có Gym 3 tháng cho Hào; một invoice `PAID_AFTER_RECONCILIATION` + `RECONCILIATION_REQUIRED` cho vé ngày của Khoa. Mỗi case có checkout, payment attempt, payment và verified-event với provider **`LOCAL_DEMO`**, tuyệt đối không dùng chúng làm bằng chứng VNPay sandbox thật.
- **Support:** mỗi Member giả có request đúng chủ; PAYMENT của Bình gắn hóa đơn Gym của Bình, PAYMENT “day pass not activated” của Khoa gắn invoice đối soát của Khoa.
- **Training:** Khôi có plan trong lớp mới của `coach.caulong@sporthub.vn`; lớp Cầu lông lịch sử `CAULONG-STARTED-01` có ghi danh đã trả, điểm danh Present và RESULT điểm 4 từ Coach cùng người. Không dựng result quá khứ trên lớp chưa khai giảng.
- **Audit:** thao tác tạo/publish lớp qua service sinh audit Manager. DB local đã có log của tất cả role; không giả mạo audit cho các invoice fixture.

## Chạy lại

Sau khi xác nhận DB local và migration, từ thư mục gốc:

```powershell
$env:ASPNETCORE_ENVIRONMENT = 'Development'
$env:LocalDemoSeed__Password = '<mật khẩu demo đã thống nhất>'
dotnet run --project backend/SportHub.API --no-launch-profile -- --seed-local-demo=true
```

Biến riêng `LocalDemoSeed__Password` được dùng vì `.env` local có thể ghi đè `Seed__Password`. Không ghi mật khẩu vào repo hay log. Lệnh từ chối host DB không phải local. Sau 28/10, các lớp phải đã tồn tại; seeder không tạo mới khóa học có ngày bắt đầu trong quá khứ.

## Sao lưu và kiểm tra

- Trước khi seed đã lưu bản `pg_dump -Fc` tại `output/sporthub-before-demo-seed-20261027.dump` (file ignored bởi Git). Giữ bản này nếu cần quay lại. Không restore đè khi backend đang chạy và có người dùng DB.
- Đã áp ba migration local còn thiếu: `SupportRefundItems`, `AllowPointOnlySupportPayout`, `ManagerPointGiftsAndDayPassSupport`.
- Build `SportHub.API` thành công. Chạy lại seeder nhiều lần không tăng trùng số account/lớp/hóa đơn. Cả bốn Member giả đăng nhập API local trả HTTP 200.
- Kiểm tra DB sau seed và dọn dữ liệu BR141: **20 tài khoản**, **5 gói Gym**, **10 lớp tổng cộng** (trong đó 4 lớp demo mới), 4 lớp mới đều có **12 buổi** và một ghi danh mẫu; giá thuê riêng 100.000đ/200.000đ. Có **10 hóa đơn demo và 10 Payment tương ứng**.

## Dọn dữ liệu BR141 cũ

Theo xác nhận của người dùng, đã chạy `scripts/cleanup-local-legacy-br141.sql` trong một transaction: xóa **4 lớp `BR141-*` cũ** khai giảng 30/11, **22 hóa đơn dành riêng cho các lớp đó** và các ghi danh, giữ chỗ, phiên checkout, payment, attempt, adjustment, event và lịch sử điểm liên quan. Đã đảo tác động của 29 ledger entry trước khi xóa; ví của `an.member@sporthub.vn` hiện có 2.360 điểm khả dụng, 0 điểm giữ. Trigger append-only của bảng ledger được bật lại trước COMMIT. Script từ chối xóa khi gặp hóa đơn trộn dịch vụ khác hoặc tham chiếu hỗ trợ/quyền lợi chưa được xử lý. Backend đã được chỉnh để không tự seed lại BR141 lúc khởi động nếu catalog `LOCAL-DEMO-20261028-*` có trong DB.

Script này là thao tác dọn **local demo** đã được xác nhận, không chạy trên Railway hoặc DB có giao dịch thật. Bản backup trước seed là điểm phục hồi nếu cần. Sau khi cập nhật mã backend, chạy `docker compose up -d --build backend` để phiên bản container cũng áp dụng guard khi khởi động.

Các lớp lịch sử khác như `P2-*` và `CAULONG-STARTED-01` vẫn được giữ vì có thể dùng để trình diễn luồng và kết quả Coach; chúng không thuộc bốn lớp BR141 được xác nhận xóa. Lớp lịch sử InProgress có thể vẫn hiện trên public UI. Bốn lớp mới còn chỗ và tài khoản local có thể mua live.

Màn tạo lớp live còn dùng các phòng/sân Active hiện có; tránh khung giờ bị chiếm bởi 4 lớp mới. Giao dịch thanh toán live phải chạy VNPay sandbox và chờ IPN/QueryDR xác minh, không chỉ dùng fixture. Member thật sẽ đăng ký ngày demo theo yêu cầu, không được seed sẵn.
