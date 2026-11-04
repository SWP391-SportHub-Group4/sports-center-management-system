# Tự cập nhật AWS từ main

```text
PR vào main → backend build/test + frontend checks + E2E + deployment checks
Merge main → CI đạt → build backend/AI trên GitHub → publish aws-FULL_SHA
AWS systemd (mỗi 5 phút) → kiểm tra main + CI thành công + release bot
 → xác minh digest tải về → backup DB/runtime/config → migration
 → start → HTTPS + API đọc DB + CORS → công bố release đang chạy
```

Chỉ `main` triển khai. PR không tạo release và không chạy trên AWS. Nhánh dev/
develop không triển khai. Có thể chạy CI thủ công bằng Actions → CI and AWS CD
→ Run workflow → main. Backend/AI build trên GitHub để giảm tải VM RAM 2 GB.

## Kích hoạt một lần trên AWS

Repository hiện là public. CD tải public releases và metadata GitHub qua HTTPS,
không cần GitHub token, AWS key hoặc SSH key trong Actions Secrets. Không mở
firewall và không cài GitHub self-hosted runner trên production.

Sau khi thay đổi này đã có trên `main`, vào Ubuntu từ Windows:

```powershell
ssh.exe ubuntu@18.136.116.60
```

Lấy checkout setup riêng, giữ code/config live hiện tại:

```bash
git clone --depth 1 --branch main \
  https://github.com/SWP391-SportHub-Group4/sports-center-management-system.git \
  "$HOME/sporthub-cd-setup"
sudo -n bash "$HOME/sporthub-cd-setup/deploy/aws/setup-cd.sh"
```

Nếu checkout setup đã tồn tại, kiểm tra/cập nhật nó thay vì xóa hay ghi đè app
production. Installer cài code root-owned và bật timer. Sau kích hoạt, bản main
mới đã qua CI sẽ tự deploy, thường trong vòng 5 phút sau khi CI/release hoàn tất.

GitHub Actions dùng token tích hợp với quyền `contents: write` chỉ trong job
release. Nếu tổ chức cấm quyền này hoặc tạo release, owner cần điều chỉnh policy;
CI sẽ báo lỗi và AWS không cập nhật. Bảo vệ `main` bằng PR/review và các CI check
phù hợp nhóm. GitHub Releases chứa images/source của repo public, không có env
production hoặc dữ liệu DB. Chuyển repo sang private sẽ dừng cập nhật tự động;
cần thiết kế quyền đọc riêng trước khi đổi visibility.

## Kiểm tra trực quan và trạng thái

Trên GitHub → Actions → CI and AWS CD: kiểm tra các job Backend Build, Frontend
Check, Frontend E2E + API, AWS Deployment Checks và Build AWS Release. Release
được phát hành với tag `aws-FULL_COMMIT_SHA`. CI xanh xác nhận build/release;
trạng thái triển khai thật phải xem trên AWS, vì CD là dịch vụ kéo release.

DB mặc định không mở public. Nếu team cần connection string trực tiếp từ IP
thay đổi, operator bật TLS/profile public theo [PUBLIC-DATABASE.md](PUBLIC-DATABASE.md).
Đây là thay đổi thủ công cấu hình DB/firewall, không được bật chỉ bằng merge mã.

Tại Ubuntu (cũng mở được bằng Lightsail browser SSH):

```bash
sudo -n systemctl status sporthub-cd.timer
sudo -n journalctl -u sporthub-cd.service -n 30 --no-pager
sudo -n bash /opt/sporthub/app/deploy/aws/compose.sh ps
curl --fail --max-time 15 https://sporthub-vie.duckdns.org/api/health
```

Thông báo thành công: `DEPLOYMENT_SUCCEEDED FULL_SHA`. `UP_TO_DATE` nghĩa là đã
chạy main hiện tại. `WAITING_FOR_MAIN_CI` giữ bản cũ trong khi CI chưa đạt. Không
thấy CD Deployment trên GitHub là bình thường trong cơ chế pull-based này.

## Dữ liệu, release và rollback

- Có gián đoạn API ngắn khi dừng backend/Caddy để backup, migration và start.
  Lúc tải/kiểm tra images, production vẫn chạy. Không có thiết kế zero downtime.
- Backup mỗi lần deploy ở `/opt/sporthub-backups/cd-.../`: `production.env`
  root-private và thư mục con chứa dump/runtime/SHA256SUMS. Lưu bản ngoài máy
  được mã hóa; backup trên cùng đĩa không bảo vệ sự cố mất máy/đĩa.
- Release mới ở `/opt/sporthub/releases/FULL_SHA-TIMESTAMP`. Sau khi HTTPS/API/
  CORS đạt, `/opt/sporthub/app` trở thành symlink đến release này. Checkout Git
  ban đầu được giữ ở `releases/legacy-...`. Không git pull trong app sau chuyển
  sang releases; các lần cập nhật sau thực hiện bằng merge main.
- Docker project vẫn `sporthub-aws`; giữ nguyên volume DB và runtime, keys và
  cấu hình tích hợp. Không restore, seed, xóa volume hoặc `down -v`. Thay image/
  credentials/mount PostgreSQL hoặc domain/TLS cần thực hiện thủ công.
- Log lệnh chi tiết ở `/opt/sporthub/cd-logs/`, chỉ root đọc. Secrets không đưa
  vào Actions logs, releases hoặc thư mục public.
- CI/build/download/preflight lỗi thì chưa dừng production. Backup lỗi sẽ cố
  chạy lại bản cũ. Nếu migration/start/health check lỗi, backend/Caddy dừng và DB/
  backup được giữ để xử lý. Không tự rollback DB hay đoán schema tương thích.
- CD pause bằng `/opt/sporthub/cd-blocked.json` sau deploy lỗi; cả main mới hơn
  cũng phải chờ người vận hành kiểm tra. Không hủy service đang migration.

Sau khi xử lý nguyên nhân và kiểm tra schema/trạng thái DB, operator có thể xóa
riêng marker chặn rồi chạy lại kiểm tra:

```bash
sudo -n rm -- /opt/sporthub/cd-blocked.json
sudo -n systemctl start sporthub-cd.service
```

Các lệnh này không phải rollback; chỉ bỏ chặn và thử release main đã kiểm chứng.
Không tự chạy khi chưa xử lý lỗi trước. Muốn tạm dừng cập nhật tự động:

```bash
sudo -n systemctl disable --now sporthub-cd.timer
```

Lệnh này giữ app đang chạy và không cố hủy migration đang diễn ra. Bật lại bằng
`sudo systemctl enable --now sporthub-cd.timer`. Khi nâng CD engine, cập nhật
checkout setup và chạy lại installer lúc không có deploy đang chạy.

Giữ images/releases/backup cũ theo dung lượng và kế hoạch khôi phục, dọn có chọn
lọc. Không tự động prune volumes. Giới hạn GitHub Releases: mỗi asset dưới 2 GiB;
downloader kiểm tra digest do GitHub cung cấp và checksum bundle. API GitHub
không token có rate limit; timer 5 phút hạn chế tải, lỗi mạng/rate limit sẽ chờ
lần sau và không ảnh hưởng app đang chạy. Chưa có cảnh báo CD ngoài máy; cần xem
systemd/private log định kỳ hoặc bổ sung monitoring theo kế hoạch vận hành.

## Frontend Vercel và Railway

CD này cập nhật backend/AI AWS. Vercel cũ cần đặt Production Branch = `main`
trong Settings → Git, giữ API URL Production trỏ AWS. Vercel deploy độc lập với
GitHub CI; frontend có thể lên trước backend. Nếu release thay API không tương
thích, cần điều phối riêng hoặc triển khai API tương thích ngược.

Railway tiếp tục chạy theo lựa chọn trước; không đổi branch, dừng service hay
sửa VNPay trong CD này. DB Railway không đồng bộ AWS và không phải rollback
cập nhật. Không có tài nguyên AWS trả phí mới hoặc thay đổi firewall.
