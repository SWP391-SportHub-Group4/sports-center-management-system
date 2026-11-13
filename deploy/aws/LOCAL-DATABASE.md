# Backend local dùng DB của website AWS

Để team kết nối trực tiếp bằng connection string từ IP thay đổi, dùng
[endpoint DB public với TLS](PUBLIC-DATABASE.md). Hướng dẫn dưới đây dành cho
SSH tunnel khi DB vẫn ở profile private.

Luồng kết nối: backend local → `127.0.0.1:15432` → SSH → PostgreSQL trong Docker
trên AWS. Giữ nguyên cấu hình Compose và firewall của PostgreSQL; không cần mở
cổng 5432 ra Internet. Chỉ cần quyền SSH tới máy AWS và tài khoản DB riêng.

## Chuẩn bị quyền và phiên bản

- Operator cấp SSH cho từng thành viên bằng khóa riêng, giới hạn nguồn SSH theo
  IP của team. Không chia sẻ khóa quản trị qua repository hoặc chat.
- Operator tạo tài khoản PostgreSQL riêng cho từng người. Backend cần quyền
  đọc/ghi để đăng nhập và chạy nghiệp vụ; không dùng tài khoản `postgres` hoặc
  cấp quyền superuser, tạo DB, tạo role hay thay schema. Quyền DB chỉ đọc phù hợp
  xem dữ liệu trong DBeaver, không đủ cho mọi luồng của backend.
- Dùng phiên bản mã tương thích schema website. Operator xem commit đang chạy
  bằng `sudo cat /opt/sporthub/app/.sporthub-release` nếu CD đã triển khai release.
  Không chạy `dotnet ef database update`, restore, seed hay test integration vào
  DB website. Nếu mã local cần migration mới, triển khai migration qua luồng
  release của website trước khi dùng mã đó với DB chung.

Phiên Codex chỉ có checkout mã không tự có quyền SSH/AWS. Operator cần thực hiện
cấp quyền trên máy chủ qua kênh quản trị hiện có. Các bước dưới đây không tự tạo
tài khoản hoặc sửa database.

Operator có thể cấp tài khoản đọc/ghi từ phiên SSH trên AWS. Mở psql bằng
user quản trị hiện có (không in mật khẩu):

```bash
sudo -n bash /opt/sporthub/app/deploy/aws/compose.sh exec postgres sh -c 'exec psql -X -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

Trong psql, đổi `team_member` thành tên riêng cho từng người. `\password` hỏi
mật khẩu tương tác, tránh ghi mật khẩu trong lệnh hoặc shell history:

```sql
CREATE ROLE team_member LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
\password team_member
SELECT format('GRANT CONNECT ON DATABASE %I TO team_member', current_database()) \gexec
GRANT USAGE ON SCHEMA public TO team_member;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO team_member;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO team_member;
SELECT has_schema_privilege('team_member', 'public', 'CREATE');
```

Kiểm tra cuối phải trả `false`: tài khoản không có quyền tạo schema objects.
Các grant này áp dụng cho bảng hiện có; sau migration thêm bảng hoặc sequence,
operator cấp lại các grant tương ứng nếu team cần dùng. Thao tác cấp tài khoản
này thay đổi quyền truy cập DB thật và chỉ operator chạy trên máy chủ.

## 1. Mở tunnel từ Windows

Từ PowerShell tại gốc repository:

```powershell
./scripts/Open-AwsDatabaseTunnel.ps1 -IdentityFile 'C:\Keys\sporthub-team.pem'
```

Nếu đã dùng SSH agent, bỏ `-IdentityFile`. Có thể đổi `-Server`, `-SshUser` và
`-LocalPort`. Xác minh fingerprint SSH với operator ở lần kết nối đầu tiên.
Script tìm IP Docker hiện tại của PostgreSQL bằng lệnh chỉ đọc, rồi mở tunnel
chỉ trên loopback của máy local. Để terminal này mở trong lúc chạy ứng dụng.
Nếu container PostgreSQL được tạo lại, mở lại tunnel để tìm IP mới.

Script mặc định dùng `ubuntu` và `sudo -n` để xem thông tin Docker. Nếu operator
cấp user SSH chỉ được port forwarding, operator cung cấp IP Docker thay vì cấp
quyền quản trị Docker cho cả team. Mở tunnel bằng:

```powershell
ssh -N -T -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -L '127.0.0.1:15432:IP_DOCKER_POSTGRES:5432' -i 'C:\Keys\sporthub-team.pem' teamuser@18.136.116.60
```

`IP_DOCKER_POSTGRES` là địa chỉ nội bộ do operator cung cấp, không phải
`127.0.0.1` trên AWS vì PostgreSQL hiện không publish host port.

## 2. Cấu hình backend local

Trong `.env` cục bộ đã được gitignore, đặt bằng giá trị do operator cấp riêng:

```dotenv
ConnectionStrings__Default=Host=127.0.0.1;Port=15432;Database=TEN_DB_WEBSITE;Username=USER_RIENG;Password=MAT_KHAU_RIENG
SharedDatabase__Enabled=true
```

Giữ các thiết lập local khác như JWT secret, frontend origin và đường dẫn runtime
của máy bạn. Không chép toàn bộ `.env` production về máy hoặc commit credentials.
Tunnel mã hóa đoạn truyền qua Internet. PostgreSQL và tài khoản DB vẫn phải cho
phép xác thực từ mạng Docker; không đổi `pg_hba.conf` sang `trust`.

Chạy trực tiếp API với cờ tường minh, kể cả khi `.env` có cấu hình cũ:

```powershell
dotnet run --project backend/SportHub.API/SportHub.API.csproj -c Release -- --environment=Development --SharedDatabase:Enabled=true --urls=http://localhost:5000 --DataProtection:KeysPath="$PWD/.sporthub-local/dataprotection-keys"
```

Phải thấy log `Shared database mode` xác nhận migration, seed và job nền đã tắt.
Chế độ này chặn lệnh seed/bootstrap và không được bật trên backend production.
Không chạy container backend trong `docker-compose.yml` để kết nối DB AWS:
Compose local luôn ghi đè connection string sang database container local.

## 3. Frontend và công cụ DB

Frontend local đặt `NEXT_PUBLIC_API_BASE_URL=http://localhost:5000` trong
`frontend/.env.local`, rồi chạy `npm run dev` tại thư mục `frontend`.

DBeaver/pgAdmin dùng host `127.0.0.1`, port `15432`, tên DB website và tài khoản
DB riêng. Nếu tunnel được mở ngoài công cụ, không bật thêm SSH tunnel trong
DBeaver. Dừng ứng dụng trước, sau đó Ctrl+C trong terminal tunnel để đóng kết nối.

## Tác động khi dùng dữ liệu thật

Tắt worker local chỉ tránh chạy thêm scheduler, gửi outbox, hết hạn và tự hoàn
tiền trên máy local. Các request tạo/sửa/xóa, đăng nhập, đặt sân, thanh toán và
thông báo vẫn thay đổi DB website; worker trên AWS vẫn xử lý dữ liệu mới này.
Đây không phải chế độ chỉ đọc hoặc sandbox thanh toán/email.

Payload email trong DB được mã hóa bằng ASP.NET Data Protection. Với key ring
local riêng, email do local xếp hàng có thể không được worker AWS giải mã.
Các luồng tạo hoặc sửa email outbox chỉ dùng sau khi operator thiết lập cùng
key ring và application discriminator với website bằng kênh riêng. Không commit
key ring, không tạo lại hoặc ghi đè khóa production. Nếu chưa có cấu hình này,
thực hiện các luồng email trên website. Các tích hợp AI, Cloudinary và VNPay cũng
cần cấu hình riêng nếu team muốn chạy các luồng tương ứng từ local.
