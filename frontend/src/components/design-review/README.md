# SportHub UI review

Mở `/design-review` trên frontend. Nếu chưa chạy server:

```powershell
cd D:\Roy\sports-center-management-system\frontend
npm run dev
```

Vào http://localhost:3000/design-review. Trang không cần đăng nhập hoặc backend.

- `PublicComponents.tsx`: PublicHeader, Footer, AccountMenu, Hero, CourseCard. Card nhận Course và callback chọn khóa; menu tài khoản nhận tên và callback đăng xuất.
- `ReviewPage.tsx`: mẫu CourseList, CourseDetail, AccountForm, CheckoutLayout; checkout và quầy dùng chung layout qua prop counter.
- `review.module.css`: CSS Modules dùng semantic tokens Court & Volt và font đã có trong root layout.

## Cách review

1. Mở menu Minh Anh, dùng Tab/Escape và thử đăng xuất/đăng nhập mẫu.
2. Lọc môn, tìm tên khóa; đổi trạng thái tải, lỗi, rỗng và thử phục hồi.
3. Chọn Xem chi tiết. Lớp hết chỗ khóa nút đăng ký; lớp cầu lông dẫn đến checkout.
4. Nhập email sai hoặc bỏ trống tên để xem validation form, sau đó lưu dữ liệu hợp lệ.
5. Bật dùng điểm tại checkout: tổng tiền giảm 200.000 đồng.
6. Tại quầy, bật điểm, gửi OTP mẫu và nhập 123456 để mở nút xem thử. Đổi hội viên hoặc lựa chọn điểm sẽ xóa xác nhận cũ.
7. Đổi checkout sang hết hạn, đối soát hoặc bồi hoàn: khóa hành động thanh toán.
8. Dùng DevTools ở chiều rộng 390px để review bố cục một cột và menu mobile.

## Phạm vi

Mẫu review bằng tiếng Việt, dữ liệu minh họa, không gọi API hay tạo giao dịch. Form không lưu bền vững. OTP chỉ mô phỏng, không phải xác thực. Giá và phép tính điểm chỉ để xem layout; khi tích hợp phải lấy quote/tổng tiền, số dư, xác nhận OTP và expiry từ backend. Trang không tạo hold hoặc countdown giả. Không dùng mẫu này thay thế checkout nghiệp vụ hiện có.

Hướng thiết kế: Court & Volt hiện hữu; bố cục 6/10, chuyển động 3/10, mật độ 4/10. Taste áp dụng phần public; form/quầy theo luồng tác vụ. Light theme theo token dự án; các trạng thái lỗi có nội dung chữ.
