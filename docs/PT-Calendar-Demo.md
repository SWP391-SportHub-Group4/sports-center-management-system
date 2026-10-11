# Dữ liệu demo lịch PT

Chỉ dùng cho database local trong môi trường Development:

```powershell
dotnet run --project backend/SportHub.API -c Release -- --seed-pt-calendar=true --DataProtection:KeysPath="$PWD/.tmp/local-api-keys"
```

- Tài khoản Coach: `coach.pt@sporthub.vn`; giữ mật khẩu hiện có.
- Học viên: `an.member@sporthub.vn`, `binh.member@sporthub.vn`, `chi.member@sporthub.vn`.
- Mỗi học viên có tối đa 6 buổi 90 phút trong tháng hiện tại, vào các ngày cách hôm nay -6, -3, 0, +2, +4, +7. Ngày ngoài tháng được bỏ qua.
- Lịch gồm buổi hoàn thành, vắng mặt, hủy đúng hạn và sắp tới; buổi hoàn thành có kết quả mẫu.
- Có studio PT, quan hệ học viên, kế hoạch tập luyện và hóa đơn demo thanh toán từng buổi. Các hóa đơn là fixture local, không gửi thanh toán đến cổng bên ngoài.
- Không thay mật khẩu, chuyên môn hay hồ sơ đã có. Kiểm tra xung đột lịch; toàn bộ seed nằm trong một transaction.
- Đánh dấu hóa đơn theo tháng và học viên để chạy lại không tạo trùng. Gói Gym demo không mở bán trong catalog.

Mở `/coach/schedule`: lịch tháng chứa các buổi PT. Nhấn ô ngày mở popup khung giờ; chọn buổi để xem chi tiết.
