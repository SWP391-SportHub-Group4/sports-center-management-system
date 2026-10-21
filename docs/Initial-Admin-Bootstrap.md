# Khởi tạo System Administrator đầu tiên

Lệnh bootstrap chỉ dành cho database mới sau khi đã áp dụng toàn bộ migration. API không tự tạo admin khi khởi động. Lệnh từ chối chạy nếu `user_accounts` đã có bất kỳ tài khoản nào; lệnh chạy lại không đổi mật khẩu hoặc tạo thêm admin. Mật khẩu khởi tạo không được ghi vào Git, `appsettings.json`, log hoặc command line.

1. Áp dụng migration lên database đích. Xác nhận chuỗi kết nối trỏ đúng database vừa reset.
2. Cung cấp `InitialAdmin__Email` (email thật của người quản trị đầu tiên) và `InitialAdmin__Password` bằng secret/biến môi trường của phiên triển khai. Mật khẩu cần ít nhất 12 ký tự, có chữ hoa, chữ thường, chữ số, ký tự đặc biệt và không chứa phần trước `@` của email.
3. Chạy lệnh `dotnet run --project backend/SportHub.API -- --bootstrap-initial-admin` từ thư mục gốc (hoặc `dotnet SportHub.API.dll --bootstrap-initial-admin` trong container, với cùng database và biến môi trường). Lệnh thoát ngay sau khi tạo tài khoản. Nếu schema còn migration chưa chạy hoặc DB đã có user, lệnh thất bại và không thay đổi user hiện có.
4. Khởi động API bình thường, đăng nhập bằng email trên. Giao diện yêu cầu đổi mật khẩu trước khi sử dụng; backend chỉ cho phép xem thông tin của chính mình và đổi mật khẩu đến khi hoàn tất. Đổi mật khẩu làm vô hiệu token cũ.
5. Tạo các tài khoản nhân sự qua giao diện quản trị. Member tự đăng ký. Nếu muốn ngừng dùng tài khoản bootstrap, tạo và kích hoạt admin khác trước, rồi đăng nhập bằng admin mới để khóa tài khoản bootstrap.

Trong Docker Compose, có thể chạy một container backend dùng cùng network/database sau khi schema đã migrate. Sau khi đặt hai biến trong môi trường shell của phiên triển khai, chạy `docker compose run --rm -e InitialAdmin__Email -e InitialAdmin__Password backend --bootstrap-initial-admin`. Compose chuyển giá trị từ shell vào container mà không ghi mật khẩu vào `docker-compose.yml` hay `.env.example`.
