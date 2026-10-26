# Khởi tạo System Administrator đầu tiên

Lệnh bootstrap chỉ dành cho database mới sau khi đã áp dụng toàn bộ migration. API không tự tạo admin khi khởi động. Lệnh từ chối chạy nếu `user_accounts` đã có bất kỳ tài khoản nào; lệnh chạy lại không đổi mật khẩu hoặc tạo thêm admin. Mật khẩu khởi tạo không được ghi vào Git, `appsettings.json`, log hoặc command line.

1. Áp dụng migration lên database đích. Xác nhận chuỗi kết nối trỏ đúng database vừa reset.
2. Cung cấp `InitialAdmin__Email` (email thật của người quản trị đầu tiên) và `InitialAdmin__Password` bằng secret/biến môi trường của phiên triển khai. Mật khẩu cần ít nhất 12 ký tự, có chữ hoa, chữ thường, chữ số, ký tự đặc biệt và không chứa phần trước `@` của email.
3. Chạy lệnh `dotnet run --project backend/SportHub.API -- --bootstrap-initial-admin` từ thư mục gốc (hoặc `dotnet SportHub.API.dll --bootstrap-initial-admin` trong container, với cùng database và biến môi trường). Lệnh thoát ngay sau khi tạo tài khoản. Nếu schema còn migration chưa chạy hoặc DB đã có user, lệnh thất bại và không thay đổi user hiện có.
4. Khởi động API bình thường, đăng nhập bằng email trên. Giao diện yêu cầu đổi mật khẩu trước khi sử dụng; backend chỉ cho phép xem thông tin của chính mình và đổi mật khẩu đến khi hoàn tất. Đổi mật khẩu làm vô hiệu token cũ.
5. Tạo các tài khoản nhân sự qua giao diện quản trị. Member tự đăng ký. Nếu muốn ngừng dùng tài khoản bootstrap, tạo admin khác, hoàn tất lời mời đặt mật khẩu và bảo đảm tài khoản mới Active trước, rồi đăng nhập bằng admin mới để Deactivate tài khoản bootstrap kèm lý do. Không được tự Deactivate hoặc vô hiệu hóa Admin Active cuối cùng. Activate/Deactivate chỉ thay đổi quyền truy cập; trạng thái lời mời là riêng.

Trong Docker Compose, có thể chạy một container backend dùng cùng network/database sau khi schema đã migrate. Sau khi đặt hai biến trong môi trường shell của phiên triển khai, chạy `docker compose run --rm -e InitialAdmin__Email -e InitialAdmin__Password backend --bootstrap-initial-admin`. Compose chuyển giá trị từ shell vào container mà không ghi mật khẩu vào `docker-compose.yml` hay `.env.example`.

## Migration trước khi deploy trên Railway

Image tạo từ `backend/SportHub.API/Dockerfile` chứa migration bundle `/app/efbundle` và lệnh `/app/migrate`; container chạy không cần .NET SDK hoặc `dotnet ef`. Bundle được tạo từ các migration trong cùng bản code với API.

Sau khi thay đổi Dockerfile đã được push/merge vào nhánh Railway đang deploy:

1. Trong service backend → Variables, đặt `ASPNETCORE_ENVIRONMENT=Production` và `ConnectionStrings__Default` trỏ đúng PostgreSQL trong cùng environment. Có thể dùng hostname nội bộ Railway. Không ghi connection string vào Dockerfile hoặc Pre-deploy Command.
2. Trong Settings → Deploy → Pre-deploy Command, điền `/app/migrate`. Giữ lệnh khởi động backend mặc định của image; không thay Start Command bằng lệnh migration.
3. Deploy lại backend. Railway chạy migration trong container riêng trước khi triển khai API mới; nếu migration lỗi, deployment không tiếp tục. Log thành công kết thúc bằng `Done.`; chạy lại khi schema đã mới nhất không áp dụng lại migration cũ.
4. Kiểm tra bảng và `__EFMigrationsHistory` trên đúng database. Sau đó mới thực hiện bootstrap Admin theo hướng dẫn phía trên.

Lệnh migration chỉ áp dụng đến migration mới nhất trong bundle, không nhận tham số rollback, không reset DB, không seed dữ liệu và không tự tạo Admin. Thiếu biến kết nối thì dừng ngay. API Production không tự chạy migration khi khởi động. Việc sửa code local chưa thay đổi cấu hình hay database trên Railway.

Tham khảo: [EF Core migration bundles](https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/applying#bundles), [Railway Pre-deploy Command](https://docs.railway.com/deployments/pre-deploy-command).
