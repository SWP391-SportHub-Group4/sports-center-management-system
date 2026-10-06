# CAT-01 Cổng A: contract môn và dịch vụ

Trạng thái: **đề xuất để duyệt, chưa có code nào được sửa theo tài liệu này**. Đây là sản phẩm của Cổng A trong [plan tổng](CLAUDE-CODE-PLAN-SPORT-SERVICES-AND-MEMBER-RENTAL.md). Chỉ khi tài liệu này được chấp thuận mới sang Cổng B. Mọi mô tả "hiện tại" dưới đây lấy từ code ngày 07/10/2026.

## 1. Hiện trạng cần thay

| Điểm | Code hiện tại |
|---|---|
| `Sport` | Một `OperationType` (WalkIn, OneOnOne, GroupCourse), `DefaultSessionMinutes`, `DefaultMaxCapacity`. Seed: 1 Gym (WalkIn), 2 Personal Training (OneOnOne), 3 Cầu lông (GroupCourse 90 phút, 12 chỗ), 4 Bóng rổ (GroupCourse 120 phút, 20 chỗ). |
| Ràng buộc DB | `ck_sports_group_course_defaults`: `operation_type <> 2 OR (default_session_minutes IS NOT NULL AND default_max_capacity IS NOT NULL)`. |
| Đổi loại | `SportCatalogService` chặn đổi OperationType (`sport_operation_type_immutable`). |
| PT | PT là một `Sport` riêng. `PtRoomValidator`, `PtPurchaseFulfillment`, `IdentityPortReaders` (qua `CoachSpecialtyReader.IsPersonalTrainerAsync`) và `RevenueDimensionReader` đều nhận biết PT bằng `OperationType == OneOnOne`. |
| Lớp | `CourseValidator` chỉ cho tạo lớp khi `OperationType == "GroupCourse"`. |
| Reader | `ISportCatalogReader.GetSportAsync` trả `SportInfo` có `OperationType` kiểu chuỗi. |

## 2. Schema đích

```text
sports
  sport_id PK, code UNIQUE (citext), name UNIQUE (citext), description, image_url,
  sort_order, is_active
  (bỏ operation_type, default_session_minutes, default_max_capacity, ck_sports_group_course_defaults)

sport_service_offerings
  offering_id PK, sport_id FK, service_type int, is_enabled bool,
  default_session_minutes int NULL, default_max_capacity int NULL
  UNIQUE (sport_id, service_type)
  CHECK service_type = GROUP_COURSE  =>  default_session_minutes > 0 AND default_max_capacity > 0
  CHECK service_type <> GROUP_COURSE =>  cả hai default IS NULL

service_type (int, chỉ được append)
  0 MEMBERSHIP_ACCESS | 1 GROUP_COURSE | 2 COURT_RENTAL | 3 PERSONAL_TRAINING

coach_service_qualifications
  user_id FK, offering_id FK, PK (user_id, offering_id)

service_room_types
  offering_id FK, room_type_id FK, PK (offering_id, room_type_id)   -- chỉ dùng cho PERSONAL_TRAINING
```

Quyết định kèm theo:

1. **`code`** khớp `^[a-z0-9_]{2,32}$`, duy nhất, **không đổi được sau khi tạo**. Chỉ dùng làm định danh catalog và seed. Không dùng để chọn thuật toán nghiệp vụ.
2. **Mặc định lớp** nằm trên offering GROUP_COURSE, ràng buộc ở DB như cũ nhưng theo service. Đổi mặc định chỉ ảnh hưởng lớp tạo sau đó, không sửa `ClassSession` hiện có.
3. **Gym-only cho Membership và PT.** Backend có một hằng tham chiếu duy nhất `SportCodes.Gym = "gym"`. MEMBERSHIP_ACCESS và PERSONAL_TRAINING chỉ bật được cho sport có `code = 'gym'`. Vì `code` bất biến và do seed tạo, đây là reference có kiểm soát, không phải dò tên "Gym". Ẩn checkbox ở UI là không đủ, backend phải trả lỗi.
4. **Không có giá chung trên môn.** Giá nằm ở `CourtRate`, lớp, `MembershipPackage` và cấu hình PT tương ứng.
5. **Phòng.** `sport_room_types` (có sẵn) tiếp tục là nguồn tương thích sân/phòng cho GROUP_COURSE và COURT_RENTAL. `service_room_types` chỉ thu hẹp phòng cho PERSONAL_TRAINING, nên phòng Gym không tự thành phòng PT. Nếu tập này rỗng thì PT không có phòng (giữ rule hiện tại); nếu chọn phòng thì phòng phải thuộc loại phòng trong tập.
6. **Qualification.** `user_sport_specialties` giữ nguyên để biểu diễn môn. Quyền PT chỉ đến từ một dòng `coach_service_qualifications` trỏ tới offering PERSONAL_TRAINING của Gym. Coach chỉ có chuyên môn Gym không được cấp PT.
7. **Rental.** Môn đủ điều kiện cho thuê khi có offering COURT_RENTAL `is_enabled`. Gym seed không bật rental.

## 3. Hợp đồng API

Giữ các route `api/sports` và `api/manager/sports`. Thay request/response từ một `operationType` sang danh sách dịch vụ. `OperationType` bị bỏ hẳn (không giữ adapter hai nguồn sự thật; dữ liệu cũ được xóa cùng reset).

`SportResponse` (Manager, đầy đủ):

```json
{
  "sportId": 3,
  "code": "badminton",
  "name": "Cầu lông",
  "description": null,
  "imageUrl": null,
  "sortOrder": 2,
  "isActive": true,
  "services": [
    { "serviceType": "GROUP_COURSE", "isEnabled": true,
      "defaultSessionMinutes": 90, "defaultMaxCapacity": 12 },
    { "serviceType": "COURT_RENTAL", "isEnabled": true }
  ],
  "readiness": [
    { "serviceType": "COURT_RENTAL", "ready": false,
      "missing": ["room_type", "room", "opening_hours", "court_rate"] }
  ]
}
```

- `GET api/sports` (ẩn danh): chỉ môn `isActive`, mỗi môn chỉ gồm service `isEnabled`, **không** có `readiness`. Hỗ trợ `?service=COURT_RENTAL|GROUP_COURSE|...` để lọc.
- `GET api/manager/sports`: mọi môn, đủ `services` và `readiness`.
- `POST api/manager/sports`: `{ code, name, description?, imageUrl?, sortOrder, services:[{ serviceType, isEnabled, defaultSessionMinutes?, defaultMaxCapacity? }] }`.
- `PUT api/manager/sports/{id}`: cùng body nhưng **không** nhận `code` (khác code trả `sport_code_immutable`). `services` thay thế toàn bộ tập cấu hình.
- `POST api/manager/sports/{id}/services/{serviceType}/enable` và `/disable`: bật hoặc tắt một service.
- `POST api/manager/sports/{id}/deactivate`, `/activate`: giữ như hiện tại.
- Qualification: `PUT api/manager/coaches/{id}/service-qualifications` với `{ offeringIds[] }`. Phòng PT: `PUT api/manager/sports/{id}/services/PERSONAL_TRAINING/room-types` với `{ roomTypeIds[] }`.

Mã lỗi: `sport_code_invalid`, `sport_code_taken`, `sport_code_immutable`, `sport_name_taken`, `service_type_invalid`, `service_not_allowed_for_sport` (Membership/PT ngoài Gym), `sport_group_course_defaults_required`, `service_defaults_not_allowed`, `sport_not_found`, `service_in_use_by_future_schedule`, `qualification_in_use`.

`readiness.missing` dùng các giá trị `room_type`, `room`, `opening_hours`, `court_rate` (rental) và `room_type`, `room`, `opening_hours` (lớp). Môn được phép tạo khi chưa đủ; backend không cho bán, publish hay báo giá cho tới khi `ready`, và không bao giờ thay bằng giá 0 hay phòng mặc định giả.

`ISportCatalogReader` (BuildingBlocks): `SportInfo` bỏ `OperationType`, thêm `Code` và `Services: IReadOnlyList<SportServiceInfo(ServiceType, IsEnabled, DefaultSessionMinutes?, DefaultMaxCapacity?)>`. Thêm `IsServiceEnabledAsync(sportId, serviceType)` và `IsRoomAllowedForServiceAsync(roomId, serviceType)`. `IsRoomCompatibleAsync(roomId, sportId)` giữ nguyên.

## 4. Bảng seed

Seed định danh theo `code`, không hardcode ID trong nghiệp vụ. ID kỹ thuật 1, 3, 4 giữ nguyên, ID 2 (Personal Training) bị gỡ và không tái sử dụng.

| code | Tên | Service bật | Mặc định lớp | Rental |
|---|---|---|---|---|
| `gym` | Gym | MEMBERSHIP_ACCESS, PERSONAL_TRAINING | không có | không bật |
| `badminton` | Cầu lông | GROUP_COURSE, COURT_RENTAL | 90 phút, 12 chỗ (giữ như seed hiện tại) | 100.000 VND/giờ qua `CourtRate` |
| `basketball` | Bóng rổ | GROUP_COURSE, COURT_RENTAL | 120 phút, 20 chỗ | 200.000 VND/giờ qua `CourtRate` |

Coach PT được seed kèm một dòng `coach_service_qualifications` rõ ràng. Phòng PT được seed vào `service_room_types` của offering PT. Lịch BR-141 và giá nằm ở Cổng D.

**Mục cần kiểm chứng ở Cổng B:** BR-141 cần buổi 120 phút cho Cầu lông trong khi mặc định môn là 90 phút. Cần xác nhận lớp có trường thời lượng riêng để đặt 120 phút mà không đổi mặc định; nếu không, báo lại trước khi sửa mặc định.

## 5. Tắt dịch vụ và vòng đời

- Tắt môn hoặc service chỉ chặn **giao dịch và đăng ký mới** (quote, checkout, publish lớp, mua Membership/PT). Không tự hủy, xóa hay sửa giá quyền lợi đã mua.
- Catalog vẫn đọc được môn và service đã tắt, để các luồng booking đang tồn tại tiếp tục hiển thị.
- Checkout đang chờ hoặc callback thanh toán muộn khi service bị tắt: **fulfillment của hóa đơn đã tạo vẫn chạy** (cờ `is_enabled` chỉ chặn tạo mới). Nếu không thể giữ tài nguyên thì dùng cơ chế compensation của Payment, không bỏ qua tiền đã nhận. Kiểm tra ở service, không chỉ UI.
- Gỡ liên kết phòng, loại phòng, qualification hoặc tắt service mà có lịch tương lai đang dùng thì trả 409 (`service_in_use_by_future_schedule`, `qualification_in_use`). Ngừng bán mới không bị đánh đồng với hủy lịch hiện hữu.

## 6. Migration và chủ sở hữu file dùng chung

Giữ nguyên migration đã commit, thêm migration mới theo thứ tự FK: thêm cột và bảng mới, điền `code` và offering cho sport 1, 3, 4, chuyển mọi tham chiếu của sport 2 sang sport 1, xóa sport 2, rồi bỏ `operation_type`, hai cột mặc định và constraint cũ. Chạy đầy đủ chuỗi migration trên DB trắng và kiểm kết quả cuối.

Các file bị CAT-01 và CAT-02 cùng tác động, **một luồng duy nhất sở hữu** và sửa tuần tự (CAT-01 trước, CAT-02 sau khi B qua cổng): `RevenueDimensionReader`, `IdentityPortReaders`, `DemoDataSeeder`, các shared contracts trong BuildingBlocks, `SportHubDbContext` và model snapshot, locales và types FE, và các test liên quan. `RevenueDimensionReader` đổi cách nhận biết doanh thu PT từ "đúng một môn OneOnOne" sang theo service PERSONAL_TRAINING của Gym.

## 7. Yêu cầu reset và tài khoản giữ lại

Người dùng chốt: reset toàn bộ dữ liệu DB dự án, **giữ lại** tài khoản SystemAdministrator gốc và một tài khoản Member dùng email thật `holethienan3010@gmail.com`. Mọi dữ liệu khác (user, ví, hóa đơn, thanh toán, lịch, session, outbox, refresh token) bị xóa; token và session cũ không được dùng tiếp.

Điều kiện thực thi, thuộc Cổng B và **chưa được chạy**:

1. Xác định chính xác server và database mục tiêu từ cấu hình môi trường mà không lộ credential. Không suy tên DB, không đụng DB khác. Nếu không xác định được thì hỏi đúng thông tin còn thiếu.
2. Script reset giữ đúng hai tài khoản trên (kèm `MemberProfile` và credential của chúng), đặt lại ví Member về trạng thái trống, và chạy riêng, không xóa volume hay thư mục diện rộng. Kiểm trên DB test riêng trước.
3. Seed demo là lệnh riêng, người dùng tự chạy khi sẵn sàng.

**Cần bạn xác nhận:** email giữ lại được ghi là `holethienan3010@gmail.com`, khác email Git hiện tại của bạn (`holethienan30102006@gmail.com`). Cần xác nhận đúng địa chỉ trước khi viết script. Tài liệu này không lưu mật khẩu hay credential nào.

## 8. Điều kiện qua Cổng A

- [ ] Schema, DTO và mã lỗi ở mục 2 và 3 được duyệt.
- [ ] Bảng seed ở mục 4 được duyệt (kể cả mặc định lớp Cầu lông 90 phút).
- [ ] Cách giữ quyền PT và phòng PT (mục 2.5, 2.6) được duyệt.
- [ ] Hành vi tắt dịch vụ (mục 5) được duyệt.
- [ ] Chủ sở hữu file dùng chung (mục 6) được duyệt.
- [ ] Email Member giữ lại (mục 7) được xác nhận.

Sau khi tick đủ, cập nhật `api-contract.md` bằng contract này rồi mới bắt đầu Cổng B.
