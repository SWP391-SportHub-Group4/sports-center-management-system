# Chạy và triển khai SportHub

SportHub là **hệ thống quản lý trung tâm thể thao với ba môn Gym (bao gồm PT), cầu lông và bóng rổ; có thể mở rộng thêm môn trong tương lai**. PT là dịch vụ thuộc Gym, không phải môn thứ tư.

Mục 1–3: khởi động hệ thống trên máy local (PostgreSQL → backend → frontend). Mục 4: bàn giao triển khai và nghiệm thu môi trường thật.

## 1. Yêu cầu

- Docker Desktop (cho PostgreSQL)
- .NET SDK 10
- Node.js 24, npm 11

## 2. Cấu hình

Tạo `.env` ở thư mục gốc từ file mẫu rồi điền giá trị (file này không được commit):

```bash
cp .env.example .env
```

Link trong email đặt lại mật khẩu dựng từ `Frontend__BaseUrl` (mặc định `http://localhost:3000`; **phải đổi khi deploy**, nếu không người nhận nhận link localhost). `Frontend__SupportUrl` là website hỗ trợ ghi cuối email; để trống thì email chỉ ghi "liên hệ trung tâm". Thiếu SMTP ở Development thì nội dung email (kèm link) được ghi vào log backend (`Email__DemoLoggingEnabled`).

Frontend đọc `frontend/.env.local` (tùy chọn). Mặc định gọi API tại `http://localhost:5000`; chỉ cần tạo file khi backend chạy ở địa chỉ khác (xem `frontend/.env.example`).

## 3. Khởi động

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

### 3.2.1 Dữ liệu dev: seed lớp BR-141 và reset

Seed lịch lớp cố định (Bóng rổ và Cầu lông 01 T2/4/6 07:00-09:00, 02 T3/5/7 14:00-16:00) và bảng giá thuê sân (Cầu lông 100.000, Bóng rổ 200.000 đồng/giờ) là lệnh riêng, idempotent, không chạy lúc khởi động:

```bash
cd backend/SportHub.API
ASPNETCORE_ENVIRONMENT=Development dotnet run -- --seed-br141=true
```

Lệnh in `database '...' trên '...'` trước khi ghi. Viết `--seed-br141=true` (có giá trị): nếu viết `--seed-br141` đứng một mình rồi tới `--ConnectionStrings:Default=...`, .NET dùng tham số kế tiếp làm giá trị của cờ và chuỗi kết nối bị bỏ qua. Biến môi trường `ConnectionStrings__Default` cũng không dùng được để đổi DB vì `.env` ở gốc repo được nạp và ghi đè; với `dotnet ef` dùng `--connection`.

Reset dữ liệu dev (giữ tài khoản và cấu hình, xóa mọi dữ liệu phát sinh): sao lưu rồi chạy [reset-dev-data.sql](../backend/scripts/reset-dev-data.sql); đầu file có lệnh `pg_dump`/`psql` mẫu. Script chỉ chạy trên database tên `sporthub` và tạm tắt trigger chặn TRUNCATE của sổ điểm.

### 3.3 Frontend

```bash
cd frontend
npm ci
npm run dev
```

Giao diện chạy tại [http://localhost:3000](http://localhost:3000)

# 4. Bàn giao triển khai và nghiệm thu

Phần này dùng cho môi trường nghiệm thu thật; các mục 1–3 ở trên chỉ hướng dẫn chạy local.

### Phần đã chuẩn bị trong repo

- VNPay IPN và return cho phép request không có JWT. IPN vẫn phải qua xác minh chữ ký, merchant, số tiền và xử lý idempotent trước khi cấp quyền lợi. Return không ghi nhận thanh toán.
- Coach không còn được duyệt danh sách tài khoản/gói của mọi Member. Hồ sơ tập luyện chỉ đọc được khi có quan hệ Coach–Member đang hoạt động.
- Admin có route chi tiết tài khoản riêng `/api/users/admin/{userId}`; quyền đọc của Staff không bị mở rộng.
- Frontend Docker build nhận các biến `NEXT_PUBLIC_*` ở build time. Đổi các biến này phải build lại image.
- Compose lưu bền vững khóa Data Protection và tệp báo cáo bằng named volumes. Không xóa volumes khi nâng cấp.

### Việc chủ hệ thống cần cung cấp và nghiệm thu

1. Chuẩn bị domain và HTTPS public cho frontend, API và VNPay IPN. Cấu hình reverse proxy/TLS; kiểm tra callback public qua internet.
2. Cung cấp PostgreSQL và secrets riêng cho môi trường; đặt `ASPNETCORE_ENVIRONMENT=Production`, `VnPay__UseMock=false`, merchant sandbox credentials, `VnPay__ReturnUrl=https://<frontend-domain>/payments/return`, `Frontend__BaseUrl=https://<frontend-domain>`, CORS origins và `NEXT_PUBLIC_API_BASE_URL=https://<api-domain>` **trước khi build frontend**. Production startup sẽ từ chối thiếu SMTP, khóa Data Protection bền vững hoặc VNPay HTTPS credentials.
3. Cấp SMTP thật, Google Client ID (nếu dùng đăng nhập Google), Gemini API key (nếu dùng AI) và kiểm tra OTP/reset link/email, Google login, Gemini timeout/quota. Không dùng địa chỉ localhost hay email demo logging ở môi trường thật.
4. Chụp backup PostgreSQL trước mỗi migration. Áp migration bằng lệnh triển khai riêng khi backend chưa nhận traffic; Production không tự migrate khi khởi động. Kiểm thử nâng cấp trên bản sao dữ liệu và diễn tập restore trước lần phát hành đầu.
5. Backup cả PostgreSQL, volume `sporthub_dataprotection` và `sporthub_reports`. Đặt lịch giữ bản sao, kiểm tra restore. Không chạy `docker compose down -v` trên dữ liệu thật.
6. Chạy bộ backend integration/E2E với PostgreSQL, sau đó giao dịch VNPay sandbox thật: payment, IPN, return, QueryDR, replay IPN, thanh toán muộn và refund điểm. Đối chiếu một giao dịch chỉ sinh một payment/quyền lợi.
7. Thiết lập giám sát lỗi API, sức khỏe database, job/outbox, sự kiện `ReconciliationRequired`, dung lượng volume và hạn chứng chỉ. Health endpoint hiện chỉ chứng minh process trả lời, chưa kiểm tra database/gateway.

### Backlog chức năng còn lại

Theo mục 13 của thiết kế: G01 (public sân/Coach/PT và giá), G03 (Manager AI), G06 (incident recovery), G07 (lịch sử/preview thông báo), G09 (filter catalog), G13 (đóng/mở tuyển sinh), và G08 nếu cần màn refund độc lập. G02/G04 và phần code G05/G12 đã bổ sung; test PostgreSQL cho các luồng An/Hào và callback sau khi tắt dịch vụ đã qua trên máy phát triển. Team vẫn phải áp migration, thử nâng cấp trên bản sao dữ liệu, và nghiệm thu staging/sandbox/thiết bị thật trước khi đóng. Xem [bàn giao An và Hào](AN-HAO-HANDOFF.md) và [các bước nghiệm thu thủ công](AN-HAO-MANUAL-STEPS.md).

### Cổng quyết định go-live

Chỉ chấp nhận go-live khi các gap P0 trong `Center-Management-System-Design-v3.md` mục 13 đã đóng bằng test và evidence, các luồng role/ownership qua nghiệm thu, backup–restore đã diễn tập, và giao dịch VNPay sandbox thật hoàn tất. VNPay production và refund về ngân hàng ngoài phạm vi requirement hiện hành.
