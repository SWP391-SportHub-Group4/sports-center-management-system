# Chạy và triển khai SportHub

SportHub là **hệ thống quản lý trung tâm thể thao với ba môn Gym, cầu lông và bóng rổ; có thể mở rộng thêm môn trong tương lai**. Gym chỉ bán Membership có thời hạn và vé Gym 1 ngày.

Mục 1–3: khởi động hệ thống trên máy local (PostgreSQL → backend → frontend). Mục 4: bàn giao triển khai và nghiệm thu môi trường thật.

## 1. Yêu cầu

- Docker Desktop (cho PostgreSQL và AI)
- .NET SDK 10
- Node.js 24, npm 11

## 2. Cấu hình

Tạo `.env` ở thư mục gốc từ file mẫu rồi điền giá trị (file này không được commit):

```bash
cp .env.example .env
```

Link trong email đặt lại mật khẩu và **email kích hoạt tài khoản staff** (Admin tạo qua `POST /api/users/admin/staff`; link dùng một lần, hạn 24 giờ, người nhận tự đặt mật khẩu) đều dựng từ `Frontend__BaseUrl` (mặc định `http://localhost:3000`; **phải đổi khi deploy**, nếu không người nhận nhận link localhost). Email kích hoạt cần SMTP hoạt động; thiếu SMTP thì tài khoản staff vẫn được tạo nhưng người nhận không có link để vào, nên ở Development hãy lấy link trong log backend (xem bên dưới). `Frontend__SupportUrl` là website hỗ trợ ghi cuối email; để trống thì email chỉ ghi "liên hệ trung tâm". Thiếu SMTP ở Development thì nội dung email (kèm link) được ghi vào log backend (`Email__DemoLoggingEnabled`). Nếu người nhận chưa nhận được (hoặc Admin gõ sai email), dùng **Gửi lại link kích hoạt** / **Đổi email** trong Admin → Users & roles; chỉ khi email kích hoạt tới đúng người thì tài khoản mới dùng được.

Frontend đọc `frontend/.env.local` (tùy chọn). Mặc định gọi API tại `http://localhost:5000`; chỉ cần tạo file khi backend chạy ở địa chỉ khác (xem `frontend/.env.example`).

## 3. Khởi động

Compose local chạy PostgreSQL và AI. Backend và frontend chạy trực tiếp trên host theo mục 3.2–3.3:

```bash
docker compose up -d --build
docker compose ps
```

AI được mở tại `http://localhost:8001`; backend mặc định gọi địa chỉ này. Cấu hình Gemini trong `ai-service/.env` được giữ riêng và không commit. Đổi cấu hình AI thì chạy `docker compose up -d --force-recreate ai-service`.

Khi chuyển từ Compose cũ, chạy `docker compose up -d --remove-orphans` để bỏ container backend/frontend cũ và giải phóng cổng 5000/3000. Lệnh giữ nguyên named volumes và dữ liệu PostgreSQL.

### 3.1 Database

```bash
docker compose up -d postgres
```

PostgreSQL chạy ở `localhost:5435`, thông số lấy từ `.env`.

### 3.2 Backend

```bash
cd backend/SportHub.API
dotnet run
```

Ở môi trường `Development`, backend tự áp migration và seed dữ liệu demo khi database chưa có tài khoản nào. API chạy tại [http://localhost:5000](http://localhost:5000), Swagger tại [http://localhost:5000/swagger](http://localhost:5000/swagger)

#### Windows chặn DLL với mã `0x800711C7`

`FileLoadException: An Application Control policy has blocked this file` là lỗi khi Windows nạp DLL, dù `dotnet build` có thể thành công. Kiểm tra event 3077 trong `Microsoft-Windows-CodeIntegrity/Operational`; tham khảo [hướng dẫn App Control của Microsoft](https://learn.microsoft.com/en-us/windows/security/application-security/application-control/app-control-for-business/operations/appcontrol-debugging-and-troubleshooting).

Trên máy local đã xác nhận DLL Debug `SportHub.Notification.dll` bị chặn, còn bản Release chạy được. Từ thư mục gốc dự án, dùng PowerShell:

```powershell
dotnet run --project backend/SportHub.API/SportHub.API.csproj -c Release -- --environment=Development --urls=http://localhost:5000 --DataProtection:KeysPath="$PWD/.tmp/local-api-keys"
```

Lệnh build Release rồi chạy API tại cổng 5000. Thư mục key riêng cho local giải quyết trường hợp `.env` chứa đường dẫn Docker `/var/lib/sporthub/dataprotection-keys`; key nằm trong `.tmp` đã được Git bỏ qua. `Ctrl+C` dừng API. Nếu bản Release cũng bị chặn, cần người quản lý chính sách App Control cấp quyền cho ứng dụng development theo quy trình của máy.
Mỗi lần khởi động Development, baseline phòng được bổ sung idempotent, kể cả DB đã có tài khoản: `Badminton Class BC1/BC2`, `Badminton Rental BR1/BR2`, `Basketball Class KC1/KC2`, `Basketball Rental KR1/KR2`, `Gym G1/G2`. Tên cũ của các sân demo được đổi sang mã mới nhưng giữ nguyên `room_id`, lịch lớp và booking. Hai sân Class của mỗi môn vẫn có thể cho Member thuê khi không có buổi học hoặc block trùng giờ. Giờ mở cửa mặc định là 06:00–22:00 hằng ngày, giờ đã cấu hình trước đó được giữ nguyên.

Trên lịch Member, sau khi hủy thuê sân thành công, thẻ chuyển ngay sang `Cancelled`, mờ dần trong 2,6 giây rồi rời khỏi lịch. Lịch Manager và Receptionist vẫn ghi nhận lượt đã hủy bằng nhãn trạng thái `Cancelled`; bản ghi cũng còn trong lịch sử thuê sân, chi tiết, hóa đơn và dữ liệu hoàn điểm. Frontend local chạy bằng `npm run dev` và tự nhận thay đổi mã nguồn.

### 3.2.1 Dữ liệu dev: seed lớp BR-141 và reset

Seed lịch lớp cố định (Bóng rổ và Cầu lông 01 T2/4/6 07:00-09:00, 02 T3/5/7 14:00-16:00) và bảng giá thuê sân (Cầu lông 100.000, Bóng rổ 200.000 đồng/giờ) là lệnh riêng, idempotent, không chạy lúc khởi động:

Ứng dụng chính dùng `Br141Seeder`, không gọi bộ coach/demo trong project test. Cần đã áp dụng migration và có một Center Manager Active. Seeder bổ sung các HLV còn thiếu bằng mật khẩu cấu hình `Seed:Password` (ít nhất 12 ký tự, có chữ hoa/thường, số và ký tự đặc biệt); không đổi mật khẩu, hồ sơ, chuyên môn hoặc trạng thái tài khoản đã có. Tài khoản HLV có sẵn phải Active, có CoachProfile và chuyên môn đúng môn.

Từ gốc repository trên PowerShell:

```powershell
$env:ASPNETCORE_ENVIRONMENT = "Development"
# Đặt Seed__Password qua cấu hình local/user-secrets hoặc biến môi trường trước khi tạo HLV còn thiếu.
dotnet run --project backend/SportHub.API --no-launch-profile -- --seed-br141=true
```

Nếu cần chỉ định database local khác, thêm `"--ConnectionStrings:Default=Host=localhost;Port=<port>;Database=<db>;Username=<user>;Password=<password>"`. Lệnh chỉ chấp nhận Development và host local, kiểm tra migration trước khi ghi, khóa các lệnh seed chạy đồng thời, ghi tên database/host/port rồi kết thúc sau khi seed. Không tạo hóa đơn, ghi danh, điểm danh hoặc điểm ví.

Mỗi lớp mới có 12 buổi, thời lượng 120 phút, khai giảng vào Thứ Hai/Thứ Ba đầu tiên cách ngày seed ít nhất 8 ngày; sau publish được mở tuyển sinh. Chạy lại giữ nguyên mọi lớp đã tồn tại theo 4 mã `BR141-*`, kể cả lớp đã đổi tên/giá, đóng tuyển sinh hoặc đã kết thúc; không tự tạo đợt học kế tiếp. Sân chỉ được thêm khi chưa có; giờ mở cửa sân có sẵn và bảng giá có sẵn (kể cả giá đã ngừng) được giữ nguyên.

Với baseline cầu lông 90 phút, chỉ nâng lên 120 khi môn chưa có lớp nào. Nếu đã có lớp hoặc cấu hình khác, lệnh dừng để Manager rà cấu hình. Xung đột lịch sân/HLV, sân không tương thích/không hoạt động, giờ đóng cửa hoặc sức chứa quá thấp đều được báo trước khi tạo lớp. Publish vẫn kiểm tra lại trong transaction; nếu có xung đột mới phát sinh đồng thời và để lại Draft, Manager cần xem và xử lý Draft trong quản lý lớp trước khi seed lại. Không tự đổi lịch hay xóa booking để nhường chỗ.

Kiểm tra sau seed: `/manager/classes` và danh sách lớp cho Member có đủ bốn lớp; mỗi lớp có 12 buổi đúng lịch. Lịch sân chặn thuê trùng các buổi này, khung ngoài lớp vẫn có thể cho thuê theo cấu hình hiện tại. Test tự động:

```powershell
dotnet test backend/SportHub.Scheduling.Tests --filter "FullyQualifiedName~Br141SeederTests"
```

```bash
cd backend/SportHub.API
ASPNETCORE_ENVIRONMENT=Development dotnet run -- --seed-br141=true
```

Lệnh in `database '...' trên '...'` trước khi ghi. Viết `--seed-br141=true` (có giá trị): nếu viết `--seed-br141` đứng một mình rồi tới `--ConnectionStrings:Default=...`, .NET dùng tham số kế tiếp làm giá trị của cờ và chuỗi kết nối bị bỏ qua. Biến môi trường `ConnectionStrings__Default` cũng không dùng được để đổi DB vì `.env` ở gốc repo được nạp và ghi đè; với `dotnet ef` dùng `--connection`.

Phần demo Flow 1 + Flow 2 bên dưới là tài liệu fixture cũ trong project test. Ứng dụng chính không hỗ trợ `--seed-demo-flow12=true`; không dùng lệnh đó để thiết lập dữ liệu vận hành. Dữ liệu fixture: ba Member demo `demo.member1..3@sporthub.vn` mỗi người 3.000 điểm, Member 1 có gói Gym đang hoạt động và lớp `DEMO-SMALL-01` chỉ 2 chỗ. Startup ứng dụng chính không chạy seed demo.

Các fixture cũ chỉ phục vụ database test cô lập. Dữ liệu Member/giao dịch trên môi trường chạy thật cần được tạo qua các luồng nghiệp vụ.

Reset dữ liệu dev (giữ tài khoản và cấu hình, xóa mọi dữ liệu phát sinh): sao lưu rồi chạy [reset-dev-data.sql](../backend/scripts/reset-dev-data.sql); đầu file có lệnh `pg_dump`/`psql` mẫu. Script chỉ chạy trên database tên `sporthub` và tạm tắt trigger chặn TRUNCATE của sổ điểm.

### 3.3 Frontend

```bash
cd frontend
npm ci
npm run dev
```

Giao diện chạy tại [http://localhost:3000](http://localhost:3000)

### 3.4 Khởi động lại PostgreSQL và AI

Sau khi tắt Docker hoặc restart máy, chạy từ thư mục gốc:

```bash
docker compose up -d
```

Chạy backend/frontend trong hai terminal như mục 3.2–3.3. Chỉ cần `docker compose build ai-service` khi sửa source Python hoặc dependencies của AI. Giữ nguyên named volumes khi nâng cấp; không dùng `docker compose down -v` trên dữ liệu cần giữ.

### 3.5 Tạo tài khoản nhân sự khi demo local

Member và staff là hai loại tài khoản tách biệt: không đổi Member thành staff được (409 `member_staff_role_change_not_allowed`). Muốn thêm Coach/Receptionist/Manager, đăng nhập Admin, tạo tài khoản staff bằng **email khác** với email Member; Coach phải kèm chuyên môn. Ở Development không có SMTP, mở log backend để lấy link kích hoạt (`Email__DemoLoggingEnabled`).

# 4. Bàn giao triển khai và nghiệm thu

Hỗ trợ Member (hạng 5): trên local, chạy backend/frontend theo mục 3.2–3.3. Manager mở `/manager/support` trong nhóm Operations; Receptionist mở `/receptionist/support`. Để tạo yêu cầu, chọn Record a request → mở hồ sơ Member → Member support. Phân công trước khi cập nhật/đóng; lọc/tìm/phân trang và Refresh dùng API thật. Không cần migration mới.

Phần này dùng cho môi trường nghiệm thu thật; các mục 1–3 ở trên chỉ hướng dẫn chạy local.

### Phần đã chuẩn bị trong repo

- VNPay IPN và return cho phép request không có JWT. IPN vẫn phải qua xác minh chữ ký, merchant, số tiền và xử lý idempotent trước khi cấp quyền lợi. Return không ghi nhận thanh toán.
- Coach không còn được duyệt danh sách tài khoản/gói của mọi Member. Hồ sơ tập luyện chỉ đọc được khi có quan hệ Coach–Member đang hoạt động.
- Admin có route chi tiết tài khoản riêng `/api/users/admin/{userId}`; quyền đọc của Staff không bị mở rộng.
- `NEXT_PUBLIC_VNPAY_SANDBOX` (mặc định bật): trang nạp điểm hiển thị thẻ test VNPay sandbox (NCB 9704198526191432198, NGUYEN VAN A, 07/15, OTP 123456). Đặt `false` khi build production.
- Frontend Docker build nhận các biến `NEXT_PUBLIC_*` ở build time. Đổi các biến này phải build lại image.
- Compose lưu bền vững khóa Data Protection và tệp báo cáo bằng named volumes. Không xóa volumes khi nâng cấp.

### Việc chủ hệ thống cần cung cấp và nghiệm thu

1. Chuẩn bị domain và HTTPS public cho frontend, API và VNPay IPN. Cấu hình reverse proxy/TLS; kiểm tra callback public qua internet.
2. Cung cấp PostgreSQL và secrets riêng cho môi trường; đặt `ASPNETCORE_ENVIRONMENT=Production`, `VnPay__UseMock=false`, merchant sandbox credentials, `VnPay__ReturnUrl=https://<frontend-domain>/payments/return`, `Frontend__BaseUrl=https://<frontend-domain>`, CORS origins và `NEXT_PUBLIC_API_BASE_URL=https://<api-domain>` **trước khi build frontend**. Production startup sẽ từ chối thiếu SMTP, khóa Data Protection bền vững hoặc VNPay HTTPS credentials.
3. Cấp SMTP thật, Google Client ID (nếu dùng đăng nhập Google), Gemini API key (nếu dùng AI) và kiểm tra OTP/reset link/email, Google login, Gemini timeout/quota. Không dùng địa chỉ localhost hay email demo logging ở môi trường thật.
4. Chụp backup PostgreSQL trước mỗi migration. Áp migration bằng lệnh triển khai riêng khi backend chưa nhận traffic; Production không tự migrate khi khởi động. Kiểm thử nâng cấp trên bản sao dữ liệu và diễn tập restore trước lần phát hành đầu.
5. Backup cả PostgreSQL, volume `sporthub_dataprotection` và `sporthub_reports`. Đặt lịch giữ bản sao, kiểm tra restore. Không chạy `docker compose down -v` trên dữ liệu thật.
6. Chạy bộ backend integration/E2E với PostgreSQL, sau đó giao dịch VNPay sandbox thật: payment, IPN, return, QueryDR, replay IPN, thanh toán muộn và refund điểm. Đối chiếu một giao dịch chỉ sinh một payment/quyền lợi.
7. Thiết lập giám sát lỗi API, sức khỏe database, job/outbox, sự kiện `ReconciliationRequired`, dung lượng volume và hạn chứng chỉ. `GET /api/health` chỉ chứng minh process trả lời. Với database/job/outbox/đối soát, Manager dùng `GET /api/manager/operations/health` (cũng hiện ở trang tổng quan Manager): `Unhealthy` khi một job im lặng quá 3 chu kỳ hoặc lỗi liên tiếp ≥3 lần, sự kiện cổng thanh toán chưa xử lý quá 10 phút, hoặc seat hold hết hạn quá 5 phút chưa được nhả; `Degraded` khi có outbox lỗi/kẹt hoặc khoản cần bù thủ công. Lịch sử job nằm trong bộ nhớ nên reset khi khởi động lại; chưa có cảnh báo gửi ra ngoài. Kiểm hiệu năng và độ khớp số liệu trên dữ liệu thật: lấy access token của Center Manager rồi chạy `./scripts/Test-ReportPerformance.ps1 -BaseUrl <staging> -From <đầu tháng> -To <cuối tháng>` (chỉ GET; ngân sách mặc định: báo cáo 10 giây, đối soát 30 giây, health 5 giây — chỉnh theo lần chạy khỏe đầu tiên). Script thoát mã 1 khi một số của báo cáo lệch nguồn, có hóa đơn không khớp thanh toán, hoặc quá ngân sách; lưu đầu ra làm evidence nghiệm thu. Trước khi xuất báo cáo, chạy `GET /api/reports/revenue/reconciliation` (nút “Run the check” ở tab Revenue) để đối soát số liệu với nguồn.

### Backlog chức năng còn lại

Theo mục 13 của thiết kế: G01 (public sân/Coach và giá), G03 (Manager AI), G06 (incident recovery), G07 (lịch sử/preview thông báo), G09 (filter catalog), và G08 nếu cần màn refund độc lập. G02/G04 và phần code G05/G12 đã bổ sung; test PostgreSQL cho các luồng An/Hào và callback đã qua trên máy phát triển. G13 (đóng/mở tuyển sinh) đã có mã và test tích hợp; còn nghiệm thu UI. Team vẫn phải áp migration (gồm `AddClassEnrollmentClosedReason`), thử nâng cấp trên bản sao dữ liệu, và nghiệm thu staging/sandbox/thiết bị thật trước khi đóng.

### Cổng quyết định go-live

Chỉ chấp nhận go-live khi các gap P0 trong `Center-Management-System-Design-v3.md` mục 13 đã đóng bằng test và evidence, các luồng role/ownership qua nghiệm thu, backup–restore đã diễn tập, và giao dịch VNPay sandbox thật hoàn tất. VNPay production và refund về ngân hàng ngoài phạm vi requirement hiện hành.
