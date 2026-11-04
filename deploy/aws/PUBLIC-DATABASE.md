# PostgreSQL public: kết nối trực tiếp từ máy team

Endpoint này cho phép mọi IP kết nối TCP, dùng TLS và mật khẩu SCRAM để xác thực.
Team không chạy SSH tunnel, không cần IP máy cá nhân cố định. Cấp tài khoản DB
riêng cho từng người; giữ bí mật tài khoản quản trị. Dữ liệu là DB website thật.
Port ngoài mặc định `15432`, bên trong Docker vẫn `5432`. Backend AWS tiếp tục
dùng `Host=postgres;Port=5432`. Máy AWS cần IP ổn định hoặc DNS trỏ đúng máy đó.

## Operator thiết lập trên AWS một lần

Triển khai phiên bản mã này qua release main trước. Mặc định
`POSTGRES_ACCESS=private` nên merge mã chưa mở DB. Không bật public trên checkout
cũ thiếu `postgres-public.yml` và preflight mới. Phiên Codex chưa có quyền
AWS/SSH; operator thực hiện qua SSH quản trị hoặc Lightsail browser SSH.

1. Dừng timer CD, chờ service deploy hoàn tất; không hủy migration đang chạy:

   ```bash
   sudo systemctl stop sporthub-cd.timer
   sudo systemctl is-active sporthub-cd.service
   ```

   Tiếp tục khi service không còn `active` hoặc `activating`. Giữ backup mới của
   DB/runtime và `.env` riêng trước khi đổi cấu hình. Cập nhật CD engine bằng
   `setup-cd.sh` của phiên bản này khi không có deploy chạy.

2. Chuẩn bị TLS cho **đúng hostname hoặc IP mà team sẽ dùng**. Ví dụ hostname
   API hiện có, nếu nó vẫn trỏ tới máy AWS này:

   ```bash
   sudo python3 /opt/sporthub/app/deploy/aws/prepare-public-db.py --endpoint sporthub-vie.duckdns.org
   ```

   Script kiểm tra password quản trị đã lưu SCRAM, tạo CA và certificate server
   365 ngày, đặt quyền file cho PostgreSQL. Chưa sửa `.env`, firewall hoặc
   restart DB. CA private key ở `/opt/sporthub/postgres-public-ca`, ngoài mount
   DB. TLS/HBA ở `/opt/sporthub/postgres-public`, mount read-only.

3. Trong `/opt/sporthub/app/deploy/aws/.env`, đặt:

   ```dotenv
   POSTGRES_ACCESS=public
   POSTGRES_PUBLIC_PORT=15432
   ```

   Giữ mật khẩu, tên DB, volume và các biến khác; `.env` vẫn có quyền `0600`.

4. Kiểm tra rồi recreate **riêng PostgreSQL**. Có gián đoạn kết nối DB/API ngắn,
   nên thực hiện vào thời điểm team chấp nhận downtime:

   ```bash
   sudo bash -c 'set -o pipefail; bash /opt/sporthub/app/deploy/aws/compose.sh config --format json | python3 /opt/sporthub/app/deploy/aws/preflight.py'
   sudo bash /opt/sporthub/app/deploy/aws/compose.sh up -d --no-deps --no-build --pull never --wait postgres
   curl --fail --max-time 15 https://sporthub-vie.duckdns.org/api/classes >/dev/null
   ```

   HBA bắt buộc TLS cho mọi TCP client. Npgsql/libpq mặc định `Prefer` trên
   backend sẽ thương lượng TLS. Kiểm tra API đọc DB trước khi mở firewall.
   Không tạo DB mới, restore, seed hoặc xóa volume.

5. Cấp tài khoản riêng theo [LOCAL-DATABASE.md](LOCAL-DATABASE.md). `\password`
   lúc này lưu SCRAM; account cũ dùng MD5 phải đổi password sang SCRAM để dùng.

6. Trong Lightsail → instance → Networking → IPv4 firewall, thêm Custom TCP
   port `15432`, nguồn **All IPv4 addresses (`0.0.0.0/0`)**. Với EC2, thêm rule
   tương ứng vào Security Group của instance. Docker chỉ publish IPv4, không
   cần mở IPv6. Nếu có firewall host/DOCKER-USER, kiểm tra rule chuyển tiếp
   Docker; không dựa riêng vào UFW vì port Docker có thể đi qua rule UFW.

7. Cấp cho team **chỉ CA public** `/opt/sporthub/postgres-public/ca.crt`, không
   cấp `server.key`, `ca.key`, khóa SSH hoặc `.env`. Kiểm tra kết nối từ máy
   ngoài AWS rồi bật lại `sudo systemctl start sporthub-cd.timer`.

Profile được giữ bằng `.env`, TLS mount nằm ngoài từng release nên không mất
sau deploy. CD khóa cấu hình image, environment, volumes, ports và command DB;
thay đổi chúng thủ công trước, không đổi tự động trong một release.

## Team cấu hình connection string

Lưu CA public được cấp ở `C:/Keys/sporthub-db-ca.crt` một lần. Không cần tunnel:

```dotenv
ConnectionStrings__Default=Host=sporthub-vie.duckdns.org;Port=15432;Database=TEN_DB_WEBSITE;Username=USER_RIENG;Password=MAT_KHAU_RIENG;SSL Mode=VerifyFull;Root Certificate=C:/Keys/sporthub-db-ca.crt
SharedDatabase__Enabled=true
```

`Host` phải khớp endpoint trên certificate. CA riêng cần `Root Certificate`;
không tắt xác minh certificate. Nếu muốn bỏ đường dẫn CA, quản trị viên có thể
cài CA public vào trust store máy team hoặc dùng certificate từ CA đã tin cậy.

Chạy backend với `--SharedDatabase:Enabled=true` theo
[LOCAL-DATABASE.md](LOCAL-DATABASE.md); frontend vẫn gọi `http://localhost:5000`.
DBeaver/pgAdmin dùng cùng endpoint/account, SSL `verify-full` và file CA.
Trên Windows: `Test-NetConnection sporthub-vie.duckdns.org -Port 15432` kiểm tra
cổng mở; DB client chạy `SELECT current_database(), current_user;` mới xác nhận
kết nối đúng DB. IP máy team đổi hoặc restart không cần sửa connection string.
Các giới hạn về schema, email outbox và dữ liệu thật vẫn áp dụng.

## Gia hạn và đóng cổng

Gia hạn trước khi certificate server hết hạn (365 ngày). Chưa cài lịch tự động;
giữ nguyên CA để team không phải thay CA public:

```bash
sudo python3 /opt/sporthub/app/deploy/aws/prepare-public-db.py --endpoint sporthub-vie.duckdns.org --renew
sudo bash /opt/sporthub/app/deploy/aws/compose.sh exec -T postgres sh -ec 'psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT pg_reload_conf();"'
```

Mở kết nối mới bằng `verify-full` để kiểm tra sau reload: PostgreSQL có thể giữ
certificate cũ khi reload lỗi. Sao lưu CA private key bằng kênh riêng.
Để đóng cổng, xóa rule AWS trước, đổi `POSTGRES_ACCESS=private`, recreate riêng
PostgreSQL như bước 4. Giữ volume và TLS files; không chạy `down -v`.
