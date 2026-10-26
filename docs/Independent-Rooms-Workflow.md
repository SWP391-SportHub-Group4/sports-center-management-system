# Phòng dùng chung và quyền cho thuê — 26/10/2026

Quyết định này thay thế các mô tả cũ yêu cầu gắn một phòng vật lý vào Sport hoặc dùng bảng SportRoomType để lọc phòng cho lớp. Phòng là cơ sở vật chất được tạo khi trung tâm xây hoặc bổ sung phòng; Sport vẫn thuộc lớp và dịch vụ thuê.

## Luồng quản lý

1. Manager mở **Rooms** tại `/manager/facilities`, chọn **Create room**, nhập tên duy nhất trong trung tâm và sức chứa nguyên từ 1–500.
2. Form tạo mới không có nút Active; luôn gửi `isActive=true`. Bên dưới tên/sức chứa có nút **Allow rental**, mặc định tắt. Nếu tắt: tạo phòng Active, `allowRental=false`, không tạo bảng giá; giờ phòng ban đầu sao chép từ giờ trung tâm cho cả 7 ngày.
   Nếu bật: hiện **Price per hour** và lịch từ thứ Hai đến Chủ nhật. Manager bật/tắt từng ngày, sửa giờ mở/đóng trong giới hạn giờ trung tâm. Bắt buộc có ít nhất một ngày, giờ nguyên và ít nhất một giờ mỗi ngày; giá dương theo bội số 2.000 VND. Phòng, giờ và giá thuê riêng được lưu trong cùng transaction, không gắn Sport. Số nhập ở Capacity là sức chứa của một phòng, không phải số phòng cần tạo.
3. Khi tạo/sửa lớp, Room là dropdown chứa các phòng đang hoạt động. Không lọc theo môn, không tạo phòng cho thuê trong wizard lớp và không xóa phòng đã chọn khi đổi Sport. Backend tiếp tục kiểm tra sức chứa, giờ mở cửa, sự cố, coach và chống trùng lịch.
4. Muốn cho thuê một phòng có sẵn, Manager chọn **Allow rental** trong danh sách hoặc trang chi tiết. Cấu hình Rental pricing và Opening hours của chính phòng đó; giá có thể khác nhau theo Sport và khung giờ. Không tạo phòng mới và không gắn quyền sở hữu phòng vào Sport.
5. Member chỉ đặt được phòng đang hoạt động, đã cho phép thuê, có dịch vụ thuê của môn đang bật, giờ mở cửa và giá áp dụng. Lần đầu bật cho thuê, thời điểm nhận booking là đầu ngày tiếp theo theo giờ Việt Nam; bật cờ không tự tạo giá hay bật dịch vụ của môn.
6. **Disable rental** chỉ chặn giao dịch thuê mới và việc giữ chỗ mới. Không xóa giá, giờ phòng, booking, invoice, occupancy hoặc lớp đã có. Phòng vẫn được chọn cho lớp nếu đang hoạt động.
7. Active (availability for new bookings) và Rental access là hai thiết lập độc lập. Phòng được tạo với Active tắt vẫn bật/tắt Rental access và cấu hình giá thuê được ngay trong danh sách hoặc trang chi tiết. Bật Rental access không tự bật Active; phòng chỉ nhận booking khi cả hai đều bật và đáp ứng các điều kiện giờ/giá. Lỗi lưu giữ nguyên trạng thái cũ và cho phép thử lại.

## API backend

### Giao diện chỉnh sửa phòng

- Modal **Edit room** chỉ chứa tên, Capacity (đơn vị người) và nút Active, với Cancel / Save changes. Chỉ lưu sau khi bấm Save; lỗi tên trùng hoặc sức chứa không hợp lệ hiển thị dưới ô nhập.
- Trang chi tiết hiển thị tên, sức chứa và các nhãn trạng thái; View schedule và Incidents là các liên kết vận hành riêng. Bảng danh sách vẫn chỉ hiển thị nhãn, không thêm lại các nút gạt.
- Các cấu hình xếp dọc theo thứ tự **Rental settings**, **Opening hours**, **Blocked times**, bỏ giao diện tab. Quyền cho thuê có Save riêng; bảng giá, giờ mở cửa và khoảng khóa tiếp tục lưu qua API riêng.
- Price windows xác định thời gian áp dụng giá; Opening hours xác định thời gian phòng được sử dụng cho cả lớp và thuê. Bật/tắt thuê không tự thay đổi Active, không xóa giá hoặc lịch đã có.
- Delete room nằm riêng ở cuối trang, có xác nhận và giữ nguyên kiểm tra phòng đang được sử dụng. Không đổi API hay thêm migration cho thay đổi giao diện này.

| API | Request / response | Quyền |
|---|---|---|
| `POST /api/rooms` | `{ name, capacity, isActive?, allowRental?, rentalSetup? }`; giao diện luôn gửi Active=true; bật thuê phải có rentalSetup | CenterManager |
| `GET /api/rooms` | Danh sách phòng, có `allowRental`, `rentalBookingOpensAtUtc`, sức chứa và trạng thái | StaffRead |
| `PUT /api/rooms/{roomId}` | Sửa tên/sức chứa/trạng thái; bỏ trống `allowRental` giữ trạng thái thuê | CenterManager |
| `PUT /api/rooms/{roomId}/rental-access` | `{ "allowRental": true/false }`; trả phòng đã cập nhật | CenterManager |
| `POST/PUT /api/manager/court-rates[/{rateId}]` | Giá theo phòng (`roomId`) được chọn Sport đang hoạt động mà không cần liên kết SportRoomType | CenterManager |

Endpoint rental-access chỉ cập nhật quyền cho thuê, không gửi lại tên/sức chứa từ bản đọc cũ. Backend khóa dòng phòng trong transaction và ghi audit `ALLOW_ROOM_RENTAL` / `DISABLE_ROOM_RENTAL`. Cho phép cấu hình quyền thuê khi phòng inactive, giữ nguyên trạng thái Active. Phòng không tồn tại trả `404 room_not_found`. Quote phòng chưa cho thuê hoặc inactive trả `409 rental_room_incompatible`; chiếm chỗ thuê mới kiểm tra lại hai cờ trong transaction, trả `409 rental_not_allowed` nếu quyền đã bị tắt hoặc phòng inactive.

`sportId` của Room là metadata cũ, không quyết định tính tương thích lớp hoặc quyền thuê mới. `roomTypeId` vẫn tồn tại để tương thích bảng giá cũ. Phòng mới không chọn loại sẽ dùng nhóm nội bộ `Multipurpose rooms`; nhóm này không giới hạn môn của lớp. Quy tắc ngừng Room Type hiện hữu vẫn được giữ. Giá chung theo Room Type cũ tiếp tục yêu cầu liên kết môn; giá riêng theo Room không cần liên kết này.

### Tạo phòng kèm cấu hình thuê

```json
{
  "name": "Shared Hall A",
  "capacity": 20,
  "isActive": true,
  "allowRental": true,
  "rentalSetup": {
    "pricePerHour": 120000,
    "hours": [
      { "dayOfWeek": 1, "openTimeLocal": "08:00", "closeTimeLocal": "20:00" },
      { "dayOfWeek": 3, "openTimeLocal": "06:00", "closeTimeLocal": "22:00" }
    ]
  }
}
```

`dayOfWeek`: 0 = Chủ nhật, 1 = thứ Hai, …, 6 = thứ Bảy. Các ngày không chọn không có giờ thuê. Các ngày trùng khung giờ được gộp thành một CourtRate theo phòng, `sportId=null`, áp dụng cho các dịch vụ thuê đang được bật. Không tự bật dịch vụ thuê của môn. Khi tắt Allow rental, client bỏ hẳn rentalSetup khỏi payload; các giá trị nháp ẩn không được lưu. Cấu hình sai trả 400 (`invalid_rental_setup`, `invalid_price`, `invalid_opening_hours`, `outside_center_hours` hoặc lỗi model validation), không tạo dở phòng/giờ/giá. `rentalSetup` chỉ dùng lúc tạo; gửi qua API sửa phòng trả 400 `rental_setup_creation_only`.

`POST /api/rooms/rental` được giữ tương thích cho client cũ: tạo phòng kèm cấu hình thuê đầy đủ và `allowRental=true`; giao diện mới dùng create-room rồi bật quyền thuê riêng.

## Dữ liệu và triển khai

- Migration `20261026100000_IndependentRooms` thêm `rooms.allow_rental`, NOT NULL, mặc định false.
- Backfill true cho phòng đã có giá thuê active áp dụng hoặc đã có lượt thuê, để giữ hoạt động cũ. Không xóa SportId, loại phòng hay dữ liệu lịch sử.
- Cập nhật database trước khi chạy backend mới: `dotnet ef database update --project backend/SportHub.API`.
- Trong môi trường Development, backend tự áp dụng migration khi khởi động lại; không cần reset database.
- Form tạo mới kèm giá/lịch dùng các bảng hiện có, không cần migration bổ sung.
- Giờ mặc định là bản sao tại lúc tạo; thay đổi giờ trung tâm sau đó không ghi đè giờ phòng. Mọi lịch vẫn phải nằm trong giờ trung tâm hiện hành.

## Kiểm thử cần giữ

- Tạo phòng chỉ bằng tên/sức chứa; không yêu cầu môn; phòng mới chưa cho thuê.
- Nút cho thuê mặc định tắt, bật hiện giá/lịch; tắt lại bỏ cấu hình nháp; lưu luôn tạo phòng Active. Thiếu ngày hoặc giờ/giá sai không tạo dữ liệu dở dang.
- Cùng một phòng có thể dùng cho lớp khác môn, với kiểm tra lịch và sức chứa như trước.
- Dropdown lớp có phòng dùng chung và không có nút tạo rental court.
- Allow rental không tạo phòng khác; đổi trạng thái được phản ánh sau reload; lỗi lưu giữ nguyên trạng thái hiển thị.
- Lịch/quote/chiếm chỗ thuê không cho phép phòng chưa bật quyền, kể cả khi có giá cũ.
- Tắt thuê giữ nguyên lớp và booking; phòng inactive bật/tắt quyền thuê được nhưng không nhận booking; Member/Receptionist không thể sửa quyền này.
