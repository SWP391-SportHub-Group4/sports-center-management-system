# Tạo sân cho thuê trong một lần — 19/10/2026

Manager vào Rooms & Courts → Create rental court, nhập tên/sức chứa, chọn môn và loại sân tương thích, giờ mở cửa theo ngày, giá chung hoặc giá theo khung giờ. Nút Create court & open for booking lưu tất cả cùng nhau. Add room only giữ luồng tạo phòng phục vụ lớp/Gym không yêu cầu giá thuê.

## Hợp đồng

`POST /api/rooms/rental`, chỉ CenterManager. Body gồm `name`, `capacity`, `sportId`, `roomTypeId`, `hours: [{dayOfWeek, openTimeLocal, closeTimeLocal}]`, `rates: [{daysOfWeek, startTimeLocal, endTimeLocal, pricePerHour}]`. Các ID/phạm vi giá trong từng rate được server xác định từ sân mới, không lấy từ client. Thành công trả 201 với RoomResponse.

Server kiểm tra tên duy nhất, môn/loại sân đang hoạt động và tương thích, ít nhất một ngày mở, giờ nguyên từ HH:mm và tối thiểu một giờ/ngày, giá không chồng và phủ toàn bộ giờ hoạt động. Giá dương theo bước 2.000 VND/giờ để cả block 30 phút vẫn có giá bội số 1.000 VND. Giá theo giờ trong UI được cắt theo giờ mở của từng ngày; ngày đóng không sinh giá.

Trong cùng transaction: tạo sân Active, giờ mở cửa, giá thuê riêng của sân và bật/tạo dịch vụ CourtRental cho môn đã chọn; audit các thay đổi. Lỗi ở bất kỳ phần nào rollback toàn bộ. Sân mới có thể nhận đặt ở các slot tương lai đủ thời gian checkout, trong booking window và không bị occupancy chặn. Không tự tạo lượt thuê hoặc thu tiền Member.

## Bảng giá dùng chung và giá riêng

Các ngày có cùng sân, môn, khung giờ và mức giá được lưu trong một dòng giá. Cột Day liệt kê các ngày áp dụng; đủ bảy ngày hiển thị All week. Migration `ConsolidateCourtRateDays` gộp các dòng cũ cùng phạm vi/khung giờ/giá/trạng thái, giữ ID nhỏ nhất và hợp các ngày; không thay đổi giá hoặc snapshot giao dịch. Luồng tạo sân cũng gộp trước khi lưu để không sinh lại một dòng mỗi ngày.

Migration `AddCourtSpecificRentalRates` thêm `court_rates.room_id` nullable. Null giữ ý nghĩa bảng giá dùng chung theo loại sân; có RoomId chỉ áp dụng sân đó. Khi tính từng block, giá riêng của sân được ưu tiên, nếu thiếu dùng giá chung tương ứng. Giá riêng của sân khác không được dùng. Chống chồng giá trong cùng phạm vi RoomId, loại sân và môn. Court Rental Pricing đọc trực tiếp các dòng này, có cột Applies to và cho sửa/bật/tắt giá trong đúng phạm vi. Giao dịch cũ giữ nguyên snapshot giá.

Không đổi loại phòng của sân đã có giá riêng; cần xóa giá riêng trước. Xóa sân chưa có lịch/booking xóa kèm giờ và giá riêng; bảng giá chung giữ nguyên.

## Kiểm tra

Backend: RentalCourtSetupTests kiểm tra Manager tạo → giá hiển thị → Member thấy AVAILABLE và checkout thành công, bảng giá chung giữ nguyên; thiếu giá không tạo sân/bật dịch vụ; Member bị 403. CourtRateCalculationTests kiểm tra ưu tiên giá riêng, fallback và cách ly sân.

Frontend: rental-court-setup.spec.ts kiểm tra lưu một request, hiển thị giá đúng sân, sửa giữ RoomId, chặn gap/chồng giá, giữ form khi API lỗi, desktop/mobile và axe accessibility.
