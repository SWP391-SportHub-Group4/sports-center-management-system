# Flow 2 — Hướng dẫn kiểm thử theo Use Case

Ngày đối chiếu: 16/10/2026. Phạm vi: 59 use case UC-F2-01 → UC-F2-59 trong bản đặc tả Flow 2 đã viết trước đó.

Hướng dẫn này mô tả cách kiểm thử, **không phải báo cáo đã test thành công**. Tên nút, tab và trường nhập của giao diện được ghi bằng tiếng Anh trong dấu `code`; phần hướng dẫn bằng tiếng Việt.

## 1. Chuẩn bị trước khi test

### Môi trường và tài khoản

- Chọn một môi trường duy nhất cho một lần test: local hoặc bản deploy. Ghi URL frontend, URL API và commit đang chạy vào báo cáo.
- Local thường dùng frontend `http://localhost:3000`, API `http://localhost:5000`. Backend phải kết nối được PostgreSQL trước khi test.
- Không dùng dữ liệu khách hàng thật cho ca hủy lớp, hoàn điểm hoặc sự cố. Dùng lớp/sân có tên bắt đầu `TEST-F2-<mã lần test>`.
- Các email dưới đây là danh tính trong bộ seed kiểm tra local, **không xác nhận chúng đang tồn tại trong DB**. Dùng mật khẩu thực tế của tài khoản; seed không đổi mật khẩu cũ.

| Vai trò | Email kiểm tra local | Mục đích |
|---|---|---|
| Center Manager | `manager@sporthub.vn` | Tạo lớp/sân/giá, duyệt yêu cầu và xử lý sự cố |
| Receptionist | `letan@sporthub.vn` | Đăng ký thay hội viên, xem lịch, điểm danh |
| Badminton Coach | `coach.caulong@sporthub.vn` | Xem lớp được giao, điểm danh, gửi yêu cầu |
| Basketball Coach | `coach.bongro@sporthub.vn` | Kiểm tra phân quyền khác bộ môn |
| Member A | `an.member@sporthub.vn` | Mua lớp, thuê sân, xem lịch, nhận thông báo |
| Member B | `binh.member@sporthub.vn` | Kiểm tra chỗ cuối cùng và quyền giữa hai tài khoản |

Mở mỗi vai trò trong **browser profile riêng**. Hai tab trong cùng profile dùng chung phiên đăng nhập, nên không phù hợp để test hai Member đồng thời.

Nếu thiếu tài khoản local, làm theo [Local-Validation-Data.md](Local-Validation-Data.md): áp migration trước, cấu hình `Seed__Password` rồi chạy seed validation. Không dùng các lệnh seed demo cũ. Seed không tự tạo đăng ký đã trả tiền, lượt thuê hoặc điểm danh; tạo chúng qua UI/API thật.

### Dữ liệu chuẩn

| Mã trong hướng dẫn | Dữ liệu cần chuẩn bị | Cách dùng |
|---|---|---|
| C1 | Lớp Badminton, 4 buổi, 400.000 VND, cost 800.000 VND, capacity 4, bắt đầu sau ít nhất 7 ngày | Ngưỡng là `ceil(800.000 / 400.000) = 2`; đăng ký, lịch, hủy trước khai giảng |
| C2 | Badminton, giá 300.000 VND, cùng coach hoặc coach đúng chuyên môn, lịch không trùng C1 | Chuyển lớp thấp giá, dự kiến chênh 100 điểm khi giá trị đã trả là 400.000 VND |
| C3 | Badminton, giá 500.000 VND, lịch không trùng C1 | Chuyển lớp cao giá, dự kiến trả thêm 100.000 VND |
| C4 | Basketball, lịch riêng | Kiểm tra không chuyển sang môn khác và không truy cập lớp sai coach |
| S1 | Sân Badminton hoạt động 06:00–22:00, giá 100.000 VND/giờ | Thuê 2 block liên tiếp: tổng dự kiến 200.000 VND |
| E1 | Member A đã thanh toán C1 và đăng ký được xác nhận | Roster, My schedule, hủy/chuyển lớp |
| R1 | Member A thuê S1, bắt đầu sau ít nhất 48 giờ | Hủy thuê có hoàn 100% |
| R2 | Lượt thuê khác bắt đầu trong dưới 24 giờ, còn ở tương lai | Hủy thuê không hoàn theo cấu hình mặc định |
| T1 | Buổi được giao Coach, có học viên Confirmed, bắt đầu trong cửa sổ điểm danh | Điểm danh và sửa điểm danh |

- Điều chỉnh ngày bắt đầu theo ngày test và khoảng cho phép đặt trước của hệ thống. Chọn ngày bắt đầu khớp `Weekly schedule`.
- Các ca phá dữ liệu cần **bản sao riêng** của C1/R1, ví dụ `TEST-F2-CANCEL-01`. Không hủy C1 rồi tiếp tục dùng C1 cho ca khác.
- Ghi lại **classId, sessionId, enrollmentId, rentalId, invoiceId** khi tạo. Không dựa chỉ vào tên vì DB có thể có lớp demo cũ.
- Hiển thị giờ Việt Nam UTC+7. Khi gọi API bằng thời gian UTC, dùng ISO có `Z`; ví dụ 09:00 Việt Nam tương ứng 02:00Z.
- Ví dụ hoàn điểm chỉ đúng khi chưa hoàn trước đó và giá trị đã thanh toán đúng như dữ liệu chuẩn. Luôn đối chiếu snapshot hóa đơn.

### Thanh toán, email và dữ liệu theo thời gian

- Dùng merchant **VNPay sandbox thật** đã cấu hình; giao diện hiện không có nút mô phỏng thanh toán. Không dùng tiền/thẻ production cho bộ test này.
- Chỉ tính đăng ký/booking thành công khi server xác minh thanh toán và lịch thực tế đã xuất hiện. Trang gateway báo thành công hoặc quay về frontend chưa đủ.
- Để test OTP/email, dùng tài khoản có hộp thư truy cập được. Email `@sporthub.vn` trong seed không bảo đảm nhận thư. SMTP không hoạt động → ghi `Blocked`, không coi mail đã gửi chỉ vì thao tác lưu thành công.
- Ca job tự động, callback muộn và mốc ±5 phút/24 giờ cần dữ liệu hoặc clock trong **test fixture biệt lập**. Không đổi giờ máy cá nhân và không sửa thời gian DB production để ép test.
- Nếu không có nút được hướng dẫn, ghi URL, ảnh màn hình và commit; kiểm tra đúng vai trò. Không tự đánh Pass bằng cách đoán hoặc chỉnh trực tiếp DB.

## 2. Mở đúng trang

Thay `<FE>` bằng URL frontend bạn đang test. URL bên dưới giúp mở đúng trang khi menu nằm trong nhóm.

| Vai trò | Trang / tên điều hướng | URL |
|---|---|---|
| Tất cả | `Sign in` | `<FE>/login` |
| Manager | `Sports` | `<FE>/manager/sports` |
| Manager | `Room types` | `<FE>/manager/room-types` |
| Manager | `Facilities` | `<FE>/manager/facilities` |
| Manager | `Court rates` | `<FE>/manager/court-rates` |
| Manager | `Classes` | `<FE>/manager/classes` |
| Manager | Lịch: `Activity calendar`; yêu cầu: `Class change requests` | `<FE>/manager/schedule` |
| Manager | `Incidents` | `<FE>/manager/incidents` |
| Manager | `Manual notices` | `<FE>/manager/notices` |
| Manager | `Operating settings` | `<FE>/manager/settings` |
| Member | `Services` | `<FE>/member/services` |
| Member | `My schedule` | `<FE>/member/schedule` |
| Member | `Finance` | `<FE>/member/finance` |
| Coach | `Teaching schedule` | `<FE>/coach/schedule` |
| Coach | `Classes` | `<FE>/coach/classes` |
| Coach | `Students` | `<FE>/coach/members` |
| Coach | `Requests` | `<FE>/coach/change-requests` |
| Receptionist | `Members` | `<FE>/receptionist/members` |
| Receptionist | `Attendance` | `<FE>/receptionist/attendance` |
| Receptionist | `Court schedule` | `<FE>/receptionist/court-schedule` |

## 3. Thứ tự chạy đề xuất

1. Manager chuẩn bị danh mục và sân: **01–07**.
2. Manager tạo, sửa nháp và công bố: **08–12**. Giữ các lớp chưa hủy để test tiếp.
3. Member xem/mua lớp; Receptionist đăng ký thay: **19–24**.
4. Coach xem lịch/roster và điểm danh: **37–40**.
5. Coach gửi yêu cầu, Manager duyệt/từ chối: **41–46**, sau đó **13–16**.
6. Member thuê sân và kiểm tra lịch: **47–49**, rồi dùng booking riêng cho **50–51**.
7. Dùng lớp riêng để test hủy/hoàn và thiếu ngưỡng: **17–18, 25–36**.
8. Dùng tài nguyên riêng cho sự cố và thông báo: **52–57**.

Các ca ghi **API / job** không hoàn thành chỉ bằng click UI. Các ca **Chưa triển khai UI** vẫn nằm trong phạm vi use case nhưng phải ghi đúng trạng thái kiểm thử.

## 4. Các ca kiểm thử

### A. Danh mục và tài nguyên

#### UC-F2-01 — Quản lý bộ môn

**Vai trò:** Manager. **Chuẩn bị:** mã môn mới chưa có trong DB; chỉ dùng môi trường test.

1. Mở `Sports`, nhấn `Create`.
2. Điền `Name`, `Code`, `Session duration (minutes)`, `Capacity`; chọn `Group courses` và/hoặc `Court rental` phù hợp.
3. Nhấn `Save`, tìm môn vừa tạo; mở `Edit`, sửa tên rồi `Save`.
4. Reload trang để kiểm tra tên, cấu hình dịch vụ và trạng thái vẫn được giữ.

**Pass khi:** dữ liệu được lưu thật, không có môn trùng. **Test lỗi:** để trống tên, dùng mã trùng hoặc duration/capacity không hợp lệ; hệ thống phải báo lỗi và không tạo bản ghi. Với môn có lớp, thử ngừng hoạt động; lịch cũ không được mất và giao dịch mới phải bị chặn theo quy tắc.

#### UC-F2-02 — Quản lý loại phòng/sân

**Vai trò:** Manager. **Chuẩn bị:** Badminton và Basketball đã hoạt động.

1. Mở `Room types` → `Create`.
2. Đặt `Name = TEST-F2-Badminton-Type`, chọn môn tương thích Badminton rồi `Save`.
3. Mở `Edit`, kiểm tra môn đã chọn và lưu một thay đổi hợp lệ.
4. Dùng loại này tạo sân; thử chọn sân đó cho lớp Basketball.

**Pass khi:** loại phòng được lưu, môn không tương thích không được phân bổ. **Test lỗi:** thiếu tên/cấu hình; loại đang được sử dụng không được xóa làm mất sân/lớp liên quan.

#### UC-F2-03 — Quản lý sân

**Vai trò:** Manager. **Chuẩn bị:** loại sân phù hợp đã tồn tại.

1. Mở `Facilities` → `Create`, điền `Name = TEST-F2-S1`, `Room type`, `Capacity = 12` và trạng thái hoạt động.
2. Nhấn `Save`, mở `Details` của sân vừa tạo.
3. Sửa capacity hợp lệ qua `Edit` → `Save`, reload kiểm tra.

**Pass khi:** đúng sân, loại và capacity được lưu. **Test lỗi:** tạo tên trùng, capacity 0; với sân đã có lịch, không được xóa cứng lịch sử. Ngừng hoạt động không tự hủy booking/lớp đã xác nhận.

#### UC-F2-04 — Giờ hoạt động

**Vai trò:** Manager. **Chuẩn bị:** S1 chưa có lịch ở khung dùng test.

1. Mở S1 trong `Facilities`, tìm `Opening hours`.
2. Chọn các ngày hoạt động, đặt mở 06:00 và đóng 22:00, nhấn `Save`.
3. Reload; tạo lịch/thuê sân 09:00–10:00 trên một ngày đang mở.
4. Thử lịch 05:00–06:00, 21:30–23:00 và ngày đóng cửa.

**Pass khi:** khung trong giờ được chấp nhận; khung ngoài giờ hoặc ngày đóng bị từ chối. **Test lỗi:** giờ đóng trước/bằng giờ mở. Các lịch cũ không bị âm thầm dời khi sửa giờ hoạt động.

#### UC-F2-05 — Giá thuê sân

**Vai trò:** Manager. **Chuẩn bị:** loại S1 hỗ trợ Badminton và thuê sân.

1. Mở `Court rates` → `Create`.
2. Chọn `Room type`, `Sport`, ngày áp dụng, 06:00–22:00; nhập `Price per hour (VND) = 100000`, lưu bằng `Save`.
3. Member chọn S1, hai block 09:00–11:00; kiểm tra tổng 200.000 VND.
4. Sau khi thanh toán một booking, Manager đổi giá; mở booking cũ để kiểm tra giá đã chốt không thay đổi.

**Pass khi:** giá mới áp dụng cho báo giá mới, booking cũ giữ snapshot. **Test lỗi:** giá không hợp lệ, quy tắc chồng lấn hoặc một block không có giá → không được checkout khung thiếu giá.

#### UC-F2-06 — Khóa sân thủ công

**Vai trò:** Manager. **Chuẩn bị:** một khoảng trống của S1.

1. Mở S1 → `Room blocks`, thêm khoảng thời gian và `Reason = TEST-F2 maintenance`.
2. Lưu thao tác; mở `Activity calendar` ở đúng ngày/sân.
3. Member kiểm tra khung đó: không thể đặt.
4. Sửa/xóa block thủ công bằng thao tác có trên mục `Room blocks`, reload để kiểm tra sân được mở lại.

**Pass khi:** block xuất hiện và chặn đặt mới. **Test lỗi:** block chồng lớp/booking đang có phải bị từ chối hoặc yêu cầu giải quyết hoạt động; block do sự cố tạo không được xóa qua luồng thủ công. Không xóa dữ liệu liên quan bằng SQL để làm ca test pass.

#### UC-F2-07 — Xem trước khả dụng tài nguyên

**Vai trò:** Manager. **Chuẩn bị:** biết một khung trống và một khung đang có lớp của cùng coach/sân.

1. Mở `Classes` → `Create`, điền bước `Coach, room & schedule`.
2. Chọn khung trống; chuyển `Next` đến `Review generated sessions`, đọc kết quả khả dụng.
3. Quay `Previous`, đổi sang khung đã có lịch; kiểm tra xung đột chỉ đúng buổi/tài nguyên.
4. Với hai browser profile, cho người thứ hai chiếm khung sau khi người thứ nhất xem preview; người thứ nhất tiếp tục công bố.

**Pass khi:** preview báo đúng; server kiểm tra lại và không công bố trùng lịch dù preview trước đó còn trống. **Test lỗi:** sân sai môn, thiếu capacity, coach sai môn, ngoài giờ hoạt động. Preview không giữ sân.

### B. Khóa học và lịch

#### UC-F2-08 — Tạo khóa học nháp

**Vai trò:** Manager. **Chuẩn bị:** coach Badminton, S1, lịch trống.

1. Mở `Classes` → `Create`.
2. Ở `Class information`, nhập mã/tên riêng cho C1 và chọn Badminton; nhấn `Next`.
3. Ở `Coach, room & schedule`, chọn coach/S1, `Course start date`, `Number of sessions = 4`, `Weekly schedule`; nhấn `Next`.
4. Ở `Price, cost & capacity`, nhập price 400000, cost 800000, capacity 4; nhấn `Next`.
5. Đọc đủ 4 buổi trong `Review generated sessions`, nhấn `Save draft`.

**Pass khi:** trạng thái `Draft`; đủ 4 buổi dự kiến, chưa bán cho Member. **Test lỗi:** mã trùng, số buổi 0, capacity vượt sân/môn, price 0 hoặc không theo đơn vị 1.000 VND; không lưu bản nháp không hợp lệ.

#### UC-F2-09 — Sửa nháp

**Vai trò:** Manager. **Chuẩn bị:** C1 còn `Draft`.

1. `Classes` → tìm C1 → `Details` → `Edit`.
2. Sửa tên, ngày/giờ hoặc giá ở đúng bước, đến `Review generated sessions`.
3. Nhấn `Save draft`, reload chi tiết C1 và đọc lại 4 buổi.

**Pass khi:** đúng C1 được cập nhật, không tạo lớp thứ hai. **Test lỗi:** lịch không hợp lệ hoặc bản đã bị người khác sửa phải được kiểm tra lại; lớp đã publish không sửa lịch như nháp.

#### UC-F2-10 — Công bố khóa học

**Vai trò:** Manager. **Chuẩn bị:** C1 hợp lệ còn Draft, ngưỡng 2 ≤ capacity 4.

1. `Classes` → C1 → `Details` → `Publish course`.
2. Xem lại coach, sân, lịch, capacity, giá và ngưỡng trong màn hình xác nhận.
3. Nhấn `Confirm`; reload C1 và lịch Manager.
4. Đăng nhập Coach kiểm tra 4 buổi; Member mở `Services` tìm C1.

**Pass khi:** `Published`, có lịch tài nguyên và lớp xuất hiện cho Member. **Test lỗi:** trùng lịch một buổi, coach sai môn hoặc cost khiến ngưỡng vượt capacity → không công bố một phần, không để lịch rác của lớp.

#### UC-F2-11 — Đổi giá/chi phí trước hạn xét ngưỡng

**Vai trò:** Manager. **Chuẩn bị:** C1 Published, chưa qua `Response deadline`/mốc khóa giá; giữ hóa đơn cũ để so sánh.

1. C1 → `Details` → `Opening conditions`.
2. Nhập `Price (VND)`, `Cost (VND)` mới và `Reason`, nhấn `Save`.
3. Reload ngưỡng; kiểm tra `ceil(cost / price)` đúng.
4. Member xem giá giao dịch mới, mở hóa đơn cũ trong `Finance` để đối chiếu snapshot.

**Pass khi:** giá mới chỉ dùng cho giao dịch mới; không truy thu hóa đơn cũ. **Test lỗi:** qua hạn, giá không hợp lệ hoặc ngưỡng vượt capacity → từ chối, dữ liệu trước đó giữ nguyên.

#### UC-F2-12 — Đóng/mở đăng ký

**Vai trò:** Manager. **Chuẩn bị:** C1 Published, chưa bắt đầu, còn chỗ.

1. C1 → `Details` → `Overview`, tìm `Enrollment`.
2. Nhấn `Close enrollment`; Member reload C1 trong `Services`.
3. Xác nhận nút đăng ký không dùng được; đăng ký/hóa đơn hiện có vẫn còn.
4. Manager nhấn `Reopen enrollment`; Member reload và kiểm tra có thể đăng ký nếu còn chỗ.

**Pass khi:** khả năng đăng ký thay đổi đúng, không hủy người đã đăng ký. **Test lỗi:** lớp đầy, Completed, Cancelled hoặc không còn buổi sắp tới (`class_started`) không được nhận đăng ký mới. Lớp đã bắt đầu (IN_PROGRESS) còn chỗ **được** đăng ký giữa chừng: thẻ khóa ở Explore hiện số buổi đã học/còn lại, giá trọn khóa. Dữ liệu mẫu: chạy `--seed-started-class=true` (lớp `CAULONG-STARTED-01`, Thứ 3/5/7 06:00–08:00, bắt đầu 15/10/2026). Nếu gặp ghi chú `Waiting for API` cũ nhưng thao tác lỗi thật, lưu request/response và ghi Fail/Blocked theo nguyên nhân.

#### UC-F2-13 — Thay coach

**Vai trò:** Manager. **Chuẩn bị:** một buổi tương lai; có coach thứ hai đúng môn và rảnh.

1. C1 → `Sessions`, chọn đúng buổi; mở `Reschedule`.
2. Giữ giờ và sân, chọn coach thay thế, nhập `Reason`, nhấn `Review change` rồi xác nhận.
3. Reload lịch cả coach cũ và mới; đối chiếu quyền xem buổi/roster theo phân công thực tế.

**Pass khi:** buổi giao đúng coach mới; quyền coach cũ chỉ còn nếu vẫn có phân công khác hợp lệ. **Test lỗi:** chọn coach Basketball cho Badminton hoặc coach đang bận → từ chối. Với thay toàn khóa, chỉ thực hiện nếu màn hình có thao tác tương ứng; không suy ra thay một buổi đã thay toàn bộ khóa.

**Kiểm tra bổ sung:** Kiểm thêm chuông/email của HLV chủ nhiệm, HLV cũ và HLV mới; request Pending của buổi tự đóng. Không nhận hai thông báo cho cùng người trong một sự kiện.

#### UC-F2-14 — Lịch trung tâm

**Vai trò:** Manager và Receptionist. **Chuẩn bị:** có lớp, rental và block ở tuần kiểm tra.

1. Manager mở `/manager/schedule` → `Activity calendar`; Receptionist mở `Court schedule`.
2. Chọn đúng tuần/ngày và sân.
3. Nhấn lần lượt sự kiện lớp, rental, block; đọc giờ, địa điểm, trạng thái.
4. Chuyển sang sân khác, rồi tuần không có hoạt động.

**Pass khi:** đủ ba loại hoạt động, lọc đúng, trạng thái trống rõ ràng; Receptionist không có thao tác quản lý vượt quyền. **Test lỗi:** Member/Coach mở URL quản lý không được lấy toàn bộ dữ liệu trung tâm.

#### UC-F2-15 — Dời buổi học

**Vai trò:** Manager. **Chuẩn bị:** buổi tương lai, có học viên Confirmed, khung mới rảnh.

1. C1 → `Sessions`, chọn buổi → `Reschedule`.
2. Điền lịch mới, sân/coach và `Reason`; nhấn `Review change`.
3. Đối chiếu `Current schedule` với `Proposed schedule`, xác nhận.
4. Mở lịch Manager, Coach, Member A và chuông để kiểm tra giờ mới.

**Pass khi:** thời lượng giữ nguyên, slot cũ giải phóng, slot mới được giữ, các bên nhận thông báo. **Test lỗi:** buổi quá khứ, sân/coach/học viên bị trùng giờ hoặc ngoài giờ mở cửa → không đổi lịch.

**Kiểm tra bổ sung:** Tạo request Pending trước khi dời trực tiếp; Coach phải thấy Closed automatically — schedule updated by Manager. và chuông/email lịch mới. Xung đột rollback phải giữ Pending.

#### UC-F2-16 — Hủy buổi và học bù

**Vai trò:** Manager. **Chuẩn bị:** buổi tương lai và lịch bù sau buổi cuối khóa, tài nguyên rảnh.

1. C1 → `Sessions`, chọn buổi → `Cancel and create makeup`.
2. Nhập lý do, giờ/sân/coach cho buổi bù; chọn `Review change`, xác nhận.
3. Kiểm tra buổi cũ Cancelled và buổi bù trên cả lịch Manager, Coach, Member.

**Pass khi:** số buổi được cung cấp không giảm, slot cũ được giải phóng, có thông báo. **Test lỗi:** thiếu lịch bù, lịch bù trùng, trước khi khóa kết thúc hoặc sai thời lượng → từ chối toàn thao tác.

**Kiểm tra bổ sung:** Kiểm request Pending tự đóng, lịch buổi bù và thông báo cho HLV liên quan. Không chỉ kiểm lịch Member.

#### UC-F2-17 — Hủy khóa học

**Vai trò:** Manager. **Chuẩn bị:** bản sao C1 có đăng ký đã trả tiền, ghi số điểm trước test.

1. Mở `Details` của lớp cần hủy, tìm phần hủy khóa và nhập lý do.
2. Nhấn `Preview course cancellation`; đọc số buổi chưa cung cấp và số điểm hoàn.
3. Nhấn `Confirm` trong phần hủy.
4. Reload lớp, lịch và ví Member; kiểm tra invoice vẫn tồn tại trong `Finance`.

**Pass khi:** lớp/buổi còn lại hủy, tài nguyên/hold được giải phóng, điểm hoàn đúng giá trị còn được hoàn. **Test lỗi:** thao tác lặp không hoàn hai lần. Chạy riêng một lớp chưa bắt đầu và một lớp đang học; không dùng kết quả lớp chưa học để chứng nhận công thức lớp đang học.

**Kiểm tra bổ sung:** Kiểm Pending của mọi buổi bị ảnh hưởng tự đóng; HLV liên quan nhận chuông/email, không có thông báo thành công nếu transaction thất bại.

#### UC-F2-18 — Vòng đời tự động của khóa [Job / dữ liệu thời gian]

**Chuẩn bị:** ba lớp: sắp bắt đầu, đã qua toàn bộ buổi, có buổi bù tương lai; một lớp Cancelled.

1. Trong môi trường test thời gian, chuẩn bị các mốc theo clock server/fixture.
2. Để tác vụ vòng đời chạy, reload `Classes` → `Details` của từng lớp.
3. Kiểm tra lớp đến giờ chuyển `In progress`; lớp kết thúc đủ buổi chuyển `Completed`.
4. Chạy tác vụ lần nữa và kiểm tra lớp có buổi bù chưa Completed; lớp Cancelled không kích hoạt lại.

**Pass khi:** đúng trạng thái và không phát sinh bản ghi/thông báo trùng. **Blocked khi:** chưa có fixture thời gian; chuyển tháng trên calendar không làm thời gian server thay đổi.

### C. Danh mục, ghi danh và thanh toán

#### UC-F2-19 — Xem khóa trước khi mua

**Vai trò:** Guest rồi Member A. **Chuẩn bị:** Draft, Published, lớp đóng đăng ký và một lớp A đã đăng ký.

1. Guest mở homepage, dùng liên kết khám phá/đăng ký lớp; kiểm tra yêu cầu `Sign in` khi vào thao tác dành cho Member.
2. Member mở `Services` → `Classes & Packages`, chọn xem chi tiết C1.
3. Đọc môn, coach, giá và lịch tuần; đối chiếu sự kiện dự kiến với lớp/rental đã có.
4. Tìm lớp Draft, lớp đóng, lớp đầy và lớp đã đăng ký.

**Pass khi:** Draft không được bán; đã đăng ký được ghi rõ và không mua lần hai; dự kiến phân biệt với lịch thật. **Test lỗi:** trực tiếp mở URL lớp không được công khai không làm lộ thông tin riêng.

#### UC-F2-20 — Lịch cá nhân

**Vai trò:** Member A. **Chuẩn bị:** E1 và một rental Confirmed.

1. Mở `My schedule`, chuyển tới tháng có E1/rental.
2. Nhấn sự kiện lớp; đọc buổi, coach, sân và thời gian; dùng `View course` khi có để xem khóa đúng tương ứng.
3. Quay lại lịch, nhấn rental và mở thông tin thuê.
4. Đăng nhập Member B; thử URL chi tiết của A.

**Pass khi:** lịch thuộc đúng Member, back không dẫn sai sang Services; B không lấy được dữ liệu của A. **Test lỗi:** ngày không có lịch phải trống; không coi sự kiện dự kiến khi mua là đăng ký đã trả tiền.

**Kiểm tra bổ sung:** Sau khi enrollment/lớp kết thúc, nội dung lớp phải bị chặn; account menu → Billing → hóa đơn → Download invoice vẫn tải PDF thuộc chính Member (tham chiếu Flow 3).

#### UC-F2-21 — Member đăng ký toàn khóa

**Vai trò:** Member A. **Chuẩn bị:** C1 còn chỗ, A chưa đăng ký, ghi available seats và points trước test.

1. `Services` → `Classes & Packages` → xem chi tiết C1.
2. Nhấn `Payment`, đọc popup và chọn VNPay hoặc điểm đủ thanh toán; `VietQR` chưa hỗ trợ không dùng cho ca thành công.
3. Nhấn `Continue to payment`, hoàn thành checkout; nếu dùng gateway, làm theo quy trình sandbox đã cấu hình.
4. Chờ server xác nhận; mở `My schedule`, `Finance` và Manager → C1 → `Students`.
5. Quay lại C1 và thử đăng ký lần hai.

**Pass khi:** chỉ một đăng ký Confirmed, có invoice và đủ 4 buổi, số chỗ giảm đúng một. **Test lỗi:** lớp đầy, trùng lịch, đã đăng ký, thanh toán hủy/lỗi → không thêm đăng ký Confirmed. Đăng ký lớp không yêu cầu gói Gym.

#### UC-F2-22 — Receptionist đăng ký thay Member

**Vai trò:** Receptionist và Member A. **Chuẩn bị:** A chưa đăng ký lớp mục tiêu, đủ chỗ; hộp thư A nhận được OTP nếu dùng điểm.

1. Mở `Members`, tìm A theo email và chọn đúng A; mở luồng `Course registration` của Member đó.
2. Chọn lớp, kiểm tra người hưởng dịch vụ trong checkout vẫn là A.
3. Tạo hóa đơn/checkout bằng thao tác được hiển thị; nếu dùng điểm, chọn `Send confirmation code`, lấy mã từ hộp thư A rồi `Verify code`.
4. Thanh toán, mở `My schedule` của A và invoice để kiểm tra người mua/người thao tác.

**Pass khi:** A được ghi danh, Receptionist chỉ là người thực hiện; không lấy điểm khi chưa xác thực OTP. **Test lỗi:** chọn nhầm Member, OTP sai/hết hạn, lớp trùng/đầy; không tự đánh Paid bằng UI/DB.

#### UC-F2-23 — Hủy hoặc hết hạn checkout

**Vai trò:** Member/Receptionist, hệ thống. **Chuẩn bị:** một checkout chưa trả, đã có hold; ghi held points/seats.

1. Mở checkout, nhấn `Cancel checkout`; reload invoice, ví và lớp.
2. Với checkout thứ hai, không thanh toán; ghi `Expires`, đợi qua TTL thực tế và để job chạy.
3. Reload kiểm tra hold/điểm giữ được giải phóng, không có đăng ký Confirmed.
4. Refresh/gửi lại thao tác hợp lệ lần nữa để kiểm tra không giải phóng hoặc hoàn lặp.

**Pass khi:** không còn hold hoạt động của checkout đã hủy/hết hạn, points không bị mất. **Test lỗi:** checkout đã trả không bị xử lý như chưa trả. TTL mặc định 15 phút nhưng dùng cấu hình thực tế.

#### UC-F2-24 — Thanh toán đến sau hạn hold [API / gateway]

**Chuẩn bị:** checkout quá hạn; một kịch bản lớp còn chỗ, một kịch bản chỗ đã được người khác lấy.

1. Dùng fixture payment biệt lập để đưa **kết quả thanh toán đã ký hợp lệ** đến sau `Expires`; không tự POST endpoint simulation của phiên bản cũ.
2. Kiểm tra invoice, enrollment, available seats và point ledger sau xử lý.
3. Gửi lại cùng callback đã ký để test idempotency.

**Pass khi:** còn đủ điều kiện → Fulfilled, đăng ký đúng một lần; không thể cung cấp → Compensated, hoàn giá trị tiền đã xác minh bằng điểm đúng một lần. **Test lỗi:** return URL hoặc chữ ký sai không xác nhận thanh toán. Ca này không chứng nhận chỉ bằng việc quay lại frontend.

#### UC-F2-25 — Hủy đăng ký trước khai giảng

**Vai trò:** Member; Receptionist theo quyền. **Chuẩn bị:** hai đăng ký thật trả 400.000 VND: buổi đầu cách ≥5 ngày và <5 ngày, đều chưa bắt đầu.

1. Member mở đăng ký từ `My schedule`; tìm thao tác hủy đăng ký và xem số điểm dự kiến trước xác nhận.
2. Hủy bản ≥5 ngày; kiểm tra nhận 400 điểm nếu chưa có khoản hoàn trước.
3. Hủy bản <5 ngày; kiểm tra nhận 200 điểm với cùng giả định.
4. Reload invoice, lịch, available seats và point history; lặp thao tác không được thêm điểm.

**Pass khi:** đúng mốc 100%/50%, đăng ký hủy và giải phóng chỗ. **Test lỗi:** sau khi bắt đầu không áp dụng luồng hoàn trước khai giảng. Nếu UI không có thao tác hủy tại màn hình này, ghi Blocked UI rồi kiểm API theo contract; không dùng `Request refund to wallet` như bằng chứng luồng hủy trực tiếp đã triển khai.

#### UC-F2-26 — Xin hoàn sau khi khóa bắt đầu

**Vai trò:** Member A. **Chuẩn bị:** đăng ký đã bắt đầu, invoice của A còn giá trị có thể yêu cầu hoàn.

1. Mở invoice trong `Finance`, chọn `Request refund to wallet`.
2. Nhập `Reason` cụ thể, gửi bằng `Submit`.
3. Reload kết quả yêu cầu; Manager mở mục refund trong Finance để kiểm tra đúng A/lớp.

**Pass khi:** có yêu cầu chờ duyệt, không tự nhận hoàn 100%/50% trước khai giảng. **Test lỗi:** thiếu lý do, request trùng hoặc invoice B phải bị từ chối; Member không được duyệt yêu cầu của mình.

### D. Ngưỡng mở lớp và phản hồi

#### UC-F2-27 — Cấu hình thời điểm xét ngưỡng

**Vai trò:** Manager. **Chuẩn bị:** ghi cấu hình cũ để khôi phục sau test.

1. Mở `Operating settings`.
2. Tìm cấu hình `class.threshold_days_before_start` và `class.threshold_response_hours` theo tên hiển thị của hàng; mặc định tương ứng 3 ngày và 48 giờ.
3. Nhập giá trị hợp lệ, nhấn `Save` của từng hàng, reload để kiểm tra.
4. Tạo lớp test mới để kiểm tra deadline; khôi phục cấu hình ban đầu sau test.

**Pass khi:** lưu đúng, deadline mới tính đúng; SeatHold không được tính là học viên trả tiền. **Test lỗi:** số âm, 0 hoặc ngoài giới hạn form; không âm thầm sửa deadline đã chốt của giao dịch cũ.

#### UC-F2-28 — Tự xét ngưỡng [Job / dữ liệu thời gian]

**Chuẩn bị:** lớp ngưỡng 2 có một Confirmed và một hold chưa thanh toán; lớp khác có hai Confirmed.

1. Chuẩn bị clock/fixture ở mốc xét ngưỡng, để job chạy.
2. Manager mở `Classes` → `Opening conditions` của cả hai lớp.
3. Kiểm tra lớp chỉ một Confirmed thành `At risk` và có hạn phản hồi; lớp hai Confirmed đạt `Met`.
4. Kiểm tra chuông/email của Manager và Member bị ảnh hưởng; chạy job lại.

**Pass khi:** hold không tính vào ngưỡng, không tạo response/thông báo trùng. **Test lỗi:** người đăng ký thêm trong cửa sổ phải được xử lý đúng quyền phản hồi. Nếu chưa có fixture, ghi Blocked; không sửa status bằng tay rồi coi job pass.

#### UC-F2-29 — Manager miễn ngưỡng

**Vai trò:** Manager. **Chuẩn bị:** lớp At risk chưa hủy.

1. Lớp → `Opening conditions`, đọc Confirmed và ngưỡng.
2. Nhập `Reason`, nhấn `Waive threshold` một lần, chờ phản hồi rồi reload.
3. Reload lớp, audit và ví Member.

**Pass khi:** `Waived by manager`, có lý do/audit; không tự cộng/trừ points. **Test lỗi:** lý do trống hoặc dùng Member gọi thao tác phải bị chặn; không mở lại lớp Cancelled. Lựa chọn hoàn/chuyển đã thực hiện trước đó không bị xóa.

#### UC-F2-30 — Member mở phản hồi lớp thiếu ngưỡng

**Vai trò:** Member A. **Chuẩn bị:** response chưa hết hạn thuộc A.

1. Nhấn chuông hoặc link email của lớp At risk, mở `Course resolution`.
2. Kiểm tra lớp nguồn, `Response deadline` và giá trị có thể hoàn.
3. Chọn `Transfer to another class` hoặc `Refund 100% as points`, nhấn `Review response`.
4. Đọc màn hình xác nhận; chỉ dùng `Confirm response` khi đang chạy ca 31/32/33 tương ứng.

**Pass khi:** đúng chủ sở hữu, đúng deadline và lựa chọn. **Test lỗi:** URL/token sai, Member B mở response A hoặc response đã hết hạn → không thực hiện được.

#### UC-F2-31 — Chuyển lớp bằng/thấp giá

**Vai trò:** Member A. **Chuẩn bị:** response C1 còn hiệu lực, A đã trả 400.000 VND; C2 còn chỗ và không trùng lịch.

1. Mở response → `Transfer to another class` → chọn C2 ở `Destination class`.
2. Nhấn `View full schedule`, xem coach/lịch; kiểm tra `Points credited` dự kiến 100.
3. `Review response` → `Confirm response`.
4. Mở My schedule, invoice và wallet history; thử reload/gửi lại lựa chọn.

**Pass khi:** A chuyển sang C2 đúng một lần, nhận chênh 100 điểm theo giá trị đã trả. Chạy thêm lớp đích 400.000 VND → không hoàn chênh. **Test lỗi:** C4 khác môn, đầy chỗ, trùng lịch hoặc response đã xử lý → từ chối, đăng ký nguồn không mất sai.

#### UC-F2-32 — Chuyển lớp cao giá

**Vai trò:** Member A. **Chuẩn bị:** response mới của C1, C3 giá 500.000 VND còn chỗ.

1. Chọn `Transfer to another class` → C3; kiểm tra `Additional payment = 100000` theo dữ liệu chuẩn.
2. `Review response` → `Confirm response`, mở checkout phần chênh.
3. Trước thanh toán, kiểm tra A vẫn giữ đăng ký nguồn.
4. Hoàn thành thanh toán sandbox, kiểm tra server xác nhận rồi lịch chuyển sang C3.

**Pass khi:** chỉ thu chênh lệch, chuyển sau khi payment được xác minh. **Test lỗi:** hủy/hết hạn checkout không làm mất đăng ký nguồn; đích không còn hợp lệ lúc callback → xử lý compensation, không ép ghi danh.

#### UC-F2-33 — Hoàn điểm do thiếu ngưỡng

**Vai trò:** Member A. **Chuẩn bị:** response khác còn hiệu lực, giá trị còn hoàn là 400.000 VND.

1. Mở response → `Refund 100% as points`.
2. `Review response`, kiểm tra số điểm; nhấn `Confirm response`.
3. Mở wallet history và lịch; reload response.

**Pass khi:** nhận 400 điểm nếu chưa hoàn trước, enrollment kết thúc, response đã xử lý. **Test lỗi:** lặp thao tác không nhận thêm; giá trị đã hoàn/chuyển trước không được hoàn lại vượt phần còn lại.

#### UC-F2-36 — Hết hạn phản hồi [Job / dữ liệu thời gian]

**Chuẩn bị:** lớp At risk, Member A chưa phản hồi, Member B đã hoàn/chuyển; thêm một transfer chưa trả.

1. Dùng fixture đưa clock qua response deadline, chạy tác vụ expiry.
2. Kiểm tra A được hoàn phần còn lại, transfer hold quá hạn giải phóng.
3. Manager xem lớp: thiếu ngưỡng và không waive → Cancelled; đủ điều kiện/waive → theo quyết định hợp lệ.
4. Chạy job lại, đối chiếu wallet ledger và callback muộn theo ca 24.
5. Chuẩn bị trước một lớp cùng môn đang Published, còn chỗ, chưa bắt đầu: thông báo hủy của A nêu số điểm hoàn và tên lớp đó (tối đa 3). Không có lớp như vậy thì thông báo chỉ nêu điểm. Tạo thêm lớp sau đó: A không nhận thêm thông báo.

**Pass khi:** không hoàn B lần hai, không còn hold quá hạn, trạng thái và điểm nhất quán. **Blocked khi:** chưa có fixture thời gian; không chờ vài phút rồi kết luận khi deadline thực tế là 48 giờ.

### E. Lịch Coach, roster và điểm danh

#### UC-F2-37 — Lịch dạy của Coach

**Vai trò:** Badminton Coach. **Chuẩn bị:** có C1 được giao, C4 giao Basketball Coach.

1. Đăng nhập Coach, mở `Teaching schedule`.
2. Chuyển tới tháng C1, nhấn ngày rồi chọn buổi trong popup.
3. Đọc giờ, sân, lớp; dùng `View class roadmap` khi có để mở đúng lớp tương ứng.
4. Thử mở chi tiết C4 qua URL biết trước.

**Pass khi:** lịch/chi tiết thuộc phân công đúng, không có lớp Coach khác ngoài quyền. **Test lỗi:** Coach không tự đổi lịch/hủy lớp; tài khoản chưa có phân công phải hiện empty state phù hợp.

**Kiểm tra bổ sung:** Coach dạy thay chỉ thấy buổi được giao, không toàn bộ lịch lớp; Completed/Cancelled không dùng quan hệ Coach–Member cũ để cấp quyền.

#### UC-F2-38 — Học viên theo lớp

**Vai trò:** Coach; kiểm tra bổ sung Manager/Receptionist. **Chuẩn bị:** A học cả C1 và một lớp khác; B có hold nhưng chưa trả C1.

1. Coach mở `Classes` → C1 → `Students`.
2. Kiểm tra A có trong roster Confirmed, B chưa được coi là học viên đã xác nhận.
3. Mở A: `Health profile` hiển thị trước; chuyển `Plans`/`Assessments` và chọn đúng môn/lớp.
4. Đổi lớp đang xem; kiểm tra progress/assessment thuộc lớp được chọn.

**Pass khi:** không gộp nhầm plan/assessment/điểm danh của các lớp; Coach không liệt kê mọi Member chỉ vì có role Coach. Hồ sơ sức khỏe/plan/assessment là kiểm tra liên kết sang Flow 4/5, không thay thế test nghiệp vụ Flow 2.

**Kiểm tra bổ sung:** Coach dạy thay đọc roster qua đúng sessionId; không trả mục tiêu/kinh nghiệm/ghi chú sức khỏe, không mở Health profile từ quyền dạy thay.

#### UC-F2-39 — Ghi điểm danh

**Vai trò:** Coach được giao buổi hoặc Receptionist. **Chuẩn bị:** T1 trong khoảng từ start −5 phút đến end +24 giờ, học viên Confirmed chưa điểm danh.

1. Coach mở `Teaching schedule` → ngày → T1; mở mục `Attendance` của buổi.
2. Chọn `Present` cho A, `Absent` cho một học viên khác; lưu bằng thao tác lưu của form nếu UI có, hoặc chờ thao tác chọn được xác nhận thành công nếu lưu ngay.
3. Reload buổi, mở lại cùng học viên kiểm tra trạng thái.
4. Receptionist mở `Attendance`, tìm đúng T1 để đối chiếu.

**Pass khi:** trạng thái giữ sau reload, đúng học viên/buổi/người thao tác, không tự Present toàn lớp. **Test lỗi:** học viên chưa Confirmed, Coach khác, trước start −5 phút hoặc sau end +24 giờ → chặn thao tác. Test chính xác ranh giới bằng fixture; không suy đoán từ màu calendar.

#### UC-F2-40 — Sửa điểm danh

**Vai trò:** Coach/Receptionist được phép. **Chuẩn bị:** A đã Present tại T1, còn trong cửa sổ trên.

1. Mở lại T1 → `Attendance`, đổi A sang `Absent` và lưu.
2. Reload, kiểm tra trạng thái mới, số Present/Absent trong lớp và audit.
3. Đổi lại Present trong cùng cửa sổ để kiểm tra cập nhật bản ghi cũ.

**Pass khi:** một bản ghi cho A/T1, không tăng số bản ghi khi sửa. **Test lỗi:** ngoài end +24 giờ khóa sửa; hai người sửa đồng thời phải được xử lý nhất quán và tải lại dữ liệu server.

### F. Yêu cầu điều chỉnh lịch

#### UC-F2-41 — Coach gửi báo vắng

**Vai trò:** Coach phụ trách. **Chuẩn bị:** buổi tương lai trên 6 giờ nữa, chưa có yêu cầu Pending.

1. `Teaching schedule` → ngày → buổi → `Request absence`.
2. Điền `Reason = TEST-F2 coach absence`; không có trường chọn HLV thay hoặc đề xuất lịch mới; nhấn `Send request`.
4. Mở `Requests` của Coach và chuông Manager.

**Pass khi:** request loại `ABSENCE` ở trạng thái Pending, lý do đúng, lịch gốc chưa đổi. **Test lỗi:** lý do dưới 3/trên 500 ký tự, Coach khác, buổi quá khứ, yêu cầu trùng hoặc gửi dưới 6 giờ trước start; API tạo mới từ chối `SUBSTITUTE`, `RESCHEDULE`, `CANCEL_WITH_MAKEUP` dù client tự gửi body.

#### UC-F2-42 — Không cho Coach sửa yêu cầu Pending

**Vai trò:** Coach gửi yêu cầu. **Chuẩn bị:** request Pending cho buổi tương lai và một request loại cũ còn trong lịch sử.

1. Mở `Requests` → chọn báo vắng Pending và request loại cũ; kiểm không có nút `Edit pending request`.
2. Mở buổi tương ứng trong `Teaching schedule`; kiểm không có form sửa.
3. Gọi trực tiếp `PUT /api/coaches/me/teaching/change-requests/{requestId}` với JWT của Coach; API không cho sửa. Reload và so nội dung, trạng thái, audit/thông báo.

**Pass khi:** không sửa được báo vắng mới hoặc request lịch sử qua FE/API; lý do và lịch không đổi, không có audit/thông báo sửa. Coach vẫn xem lịch sử và rút request Pending của mình.

#### UC-F2-43 — Rút yêu cầu

**Vai trò:** Coach gửi yêu cầu. **Chuẩn bị:** request Pending riêng cho ca này.

1. `Requests` → chọn request → `Withdraw request`.
2. Đọc hộp xác nhận rồi xác nhận rút.
3. Reload Coach Requests và Manager `Class change requests`; kiểm tra lịch gốc.

**Pass khi:** trạng thái `Cancel` (wire WITHDRAWN), lịch giữ nguyên. **Test lỗi:** không rút yêu cầu của Coach khác hoặc hoàn tác request đã Approved.

#### UC-F2-44 — Theo dõi yêu cầu

**Vai trò:** Coach và Manager. **Chuẩn bị:** 4 request đã có Pending, Approved, Rejected, Cancel.

1. Coach mở `Requests`; kiểm tra thứ tự mới nhất trước và nhãn/màu trạng thái.
2. Nhấn từng request, đọc lớp, session, lý do, phương án và review note.
3. Manager mở `/manager/schedule` → `Class change requests`, tìm các request tương ứng.

**Pass khi:** hiển thị đúng trạng thái/chi tiết và phạm vi. **Test lỗi:** danh sách trống vẫn có hướng dẫn; màu không được là dấu hiệu duy nhất. Approved là RESOLVED, Cancel là WITHDRAWN, không nhầm Cancelled của buổi học.

**Kiểm tra bổ sung:** Request tự đóng phải có lý do Closed automatically — schedule updated by Manager.; Pending chỉ có thao tác rút, request đóng không có thao tác sửa/rút.

#### UC-F2-45 — Manager duyệt request

**Vai trò:** Manager. **Chuẩn bị:** request Pending, phương án rảnh và đúng môn.

1. `Class change requests` → mở request để vào `Review schedule change`.
2. Chọn `Decision`; điền `New start` hoặc `Makeup start`, `Assigned coach`, `Court / room` theo loại request.
3. Nhập `Decision reason / feedback to Coach`, nhấn `Confirm decision`.
4. Reload request, lịch Manager/Coach/Member và chuông.

**Pass khi:** Approved chỉ sau khi đổi lịch thành công; buổi/occupancy/thông báo đúng. Khi chọn dạy thay, danh sách chỉ có Coach Active, đúng môn và rảnh toàn bộ buổi; backend kiểm tra lại lúc xác nhận. **Test lỗi:** stale snapshot, sân/coach/học viên trùng, sai môn, thiếu lịch bù → lịch giữ nguyên, request vẫn Pending; không approve một phần.

**Kiểm tra bổ sung:** Nếu approve hợp lệ: request giữ Approved/RESOLVED. Nếu Manager đổi buổi trực tiếp trước: request tự đóng, không approve lại được.

#### UC-F2-46 — Manager từ chối request

**Vai trò:** Manager. **Chuẩn bị:** request Pending khác.

1. Mở `Review schedule change`, chọn `Decision = Reject request`.
2. Nhập `Decision reason / feedback to Coach = TEST-F2 cannot approve`, nhấn `Confirm decision`.
3. Coach mở Requests và chuông để xem Rejected/nhận xét.

**Pass khi:** request Rejected, lịch và sân không thay đổi. **Test lỗi:** lý do không hợp lệ hoặc request đã kết thúc không xử lý thêm lần nữa.

### G. Thuê sân

#### UC-F2-47 — Xem ngày và slot

**Vai trò:** Guest, Member. **Chuẩn bị:** S1 có các giờ trống, lớp, rental, hold và block.

1. Member mở `Services`, tìm phần `Courts`, chọn Badminton.
2. Nhấn ngày trên calendar; đọc danh sách sân và khung 60 phút.
3. Đối chiếu giờ trống với các giờ đã thuê/giữ/khóa/có lớp ở lịch Manager.
4. Guest thử đường đặt sân và kiểm tra yêu cầu đăng nhập trước khi đặt.

**Pass khi:** chỉ slot available và có rate được chọn, không lộ tên/email người đặt khác. **Test lỗi:** slot thiếu giá, ngoài giờ, Held/Booked/Scheduled/Blocked không được chọn. Chọn/xem slot chưa giữ chỗ.

#### UC-F2-48 — Đặt và thanh toán sân

**Vai trò:** Member A. **Chuẩn bị:** S1 còn hai block liền nhau, A không có rental trùng.

1. `Services` → `Courts` → Badminton → chọn ngày → chọn sân S1 và hai block 09:00–11:00.
2. Trong hộp `Court booking payment`, kiểm tra giờ/tổng tiền, chọn phương thức thanh toán rồi nhấn `Pay`.
3. Thanh toán qua VNPay sandbox hoặc ví điểm hợp lệ; chờ xác nhận server.
4. Khi hiện `Court booked successfully`, nhấn `View my schedule`; đối chiếu invoice. Member B kiểm tra hai slot này đã không còn available.

**Pass khi:** tổng 200.000 VND theo rate chuẩn, booking Confirmed đúng một lần; không yêu cầu Gym membership. **Test lỗi:** A đặt chồng rental của chính mình, B lấy slot trước khi A xác nhận, thiếu rate, payment thất bại → không tạo booking xác nhận sai.

#### UC-F2-49 — Chi tiết rental và giá

**Vai trò:** Member A. **Chuẩn bị:** rental hai giờ đã Confirmed.

1. `My schedule` → chọn rental → `View rental` nếu panel có nút này.
2. Đọc môn, sân, ngày, giờ, trạng thái và `Price breakdown`.
3. Kiểm tra hai block ×100.000 =200.000 VND và khớp invoice.
4. Manager đổi bảng giá; A mở lại rental và quay lại lịch.

**Pass khi:** snapshot không đổi, back về đúng lịch, B không xem rental A. **Test lỗi:** giá tổng khác tổng block hoặc xuất hiện thông tin của rental khác → Fail.

#### UC-F2-50 — Member hủy sân

**Vai trò:** Member A. **Chuẩn bị:** R1 và R2 riêng, mỗi lượt trả 200.000 VND; cấu hình full refund threshold mặc định 24 giờ.

1. `My schedule` → R1 → `Cancel rental`, đọc quote điểm rồi nhấn `Confirm`.
2. Kiểm tra R1 Cancelled, nhận 200 điểm nếu chưa hoàn trước, slot mở lại.
3. Hủy R2 (<24 giờ) sau khi đọc quote 0 điểm; kiểm tra không cộng điểm.
4. Reload và thử thao tác lặp.

**Pass khi:** đúng mức 100%/0% theo cấu hình thực tế, không hoàn lặp. **Test lỗi:** rental Completed hoặc không thuộc A không hủy được. Nếu cấu hình khác 24 giờ, ghi rõ và chạy theo cấu hình đó; không dùng để chứng nhận mặc định 24 giờ.

#### UC-F2-51 — Trung tâm hủy rental

**Vai trò:** Manager. **Chuẩn bị:** rental Confirmed bắt đầu trong dưới 24 giờ, có lý do trung tâm.

1. `Activity calendar` → chọn đúng rental, mở chi tiết và thao tác hủy của Manager.
2. Nhập `Reason`, kiểm tra giá trị hoàn và xác nhận hủy.
3. Member kiểm tra lịch, ví, invoice và thông báo.

**Pass khi:** hoàn 100% phần giá trị còn lại bằng điểm kể cả sát giờ, sân giải phóng. **Test lỗi:** không dùng mức hoàn 0% của Member; retry không hoàn hai lần; không sửa invoice thành chưa từng trả.

### H. Sự cố và thông báo

#### UC-F2-52 — Preview sự cố

**Vai trò:** Manager. **Chuẩn bị:** khoảng thời gian có lớp, rental và/hoặc gói Gym bị ảnh hưởng.

1. `Incidents`, chọn `Scope` là sân hoặc `Whole center`; nhập thời gian và `Reason`.
2. Nhấn `Review`, đọc `Affected activities` và phần blockers.
3. Mở My schedule/wallet ở profile Member khác để đối chiếu chưa có hủy/hoàn.

**Pass khi:** liệt kê đúng hoạt động trong phạm vi, preview chưa thay đổi dữ liệu. **Test lỗi:** phạm vi/thời gian sai phải bị chặn. UI hiện ghi nhận hạn chế quote chi tiết/reservation fence; không coi preview là giữ chỗ hoặc bảo đảm không có booking mới.

#### UC-F2-53 — Giải quyết lớp bị ảnh hưởng

**Vai trò:** Manager. **Chuẩn bị:** preview sự cố đang có blocker ClassSession.

1. Từ danh sách ảnh hưởng, mở từng buổi; `Reschedule` hoặc `Cancel and create makeup` bằng ca 15/16.
2. Xác nhận từng thao tác thành công; kiểm tra lịch Member/Coach tương ứng.
3. Nhấn `Recheck impacts`, kiểm tra không còn lớp chưa xử lý.

**Pass khi:** giữ đủ lesson, hết blocker mới có thể xác nhận sự cố. **Test lỗi:** còn một lớp xung đột → không resolve. Các thao tác dời lớp đã lưu là giao dịch riêng; một bước sau thất bại không tự hoàn tác các bước đã thành công.

**Kiểm tra bổ sung:** Kiểm chuông/email HLV sau từng lệnh dời/đổi HLV/hủy kèm bù xử lý sự cố. Chỉ tạo Incident chưa có nghĩa hệ thống tự đổi lịch.

#### UC-F2-54 — Resolve sự cố

**Vai trò:** Manager. **Chuẩn bị:** hết blocker lớp, còn rental bị ảnh hưởng; ghi ledger trước thao tác.

1. `Recheck impacts`, xác nhận lại phạm vi, giờ và lý do.
2. Nhấn `Confirm resolution and block`.
3. Kiểm tra block sự cố trên lịch, rental bị hủy và ví Member nhận hoàn 100% phần còn lại.
4. Reload chi tiết/lịch sử sự cố và kiểm tra thông báo; retry hợp lệ không tạo hoàn/gia hạn lần hai.

**Pass khi:** thao tác resolve cuối nhất quán, không block trong khi để lớp xung đột chưa xử lý. **Test lỗi:** booking mới sau preview hoặc lỗi resolve → refresh tác động; không đoán thành công khi response timeout, kiểm tra kết quả đã lưu trước retry.

#### UC-F2-55 — Gia hạn Gym do đóng cửa

**Vai trò:** Manager/hệ thống. **Chuẩn bị:** một Gym membership Active, một day pass, một gói expired; biết ngày hết hạn cũ.

1. Tạo preview sự cố `Whole center` đúng ngày quyền lợi Gym Active bị ảnh hưởng.
2. Trong `Gym closure: extend memberships`, kiểm tra `Extension days (0–31)`. Số ngày gợi ý tính theo ngày dương lịch đóng trọn vẹn, giờ Việt Nam. Nhập số ngày được duyệt rồi hoàn tất resolve theo ca 54.
3. Member mở thông tin Gym membership trong Services, kiểm tra `Ends` mới và gói nối tiếp nếu có.
4. Kiểm tra day pass và gói expired không bị gia hạn theo quy tắc gói.

**Pass khi:** cộng đúng ngày được duyệt, gói nối tiếp không chồng, có audit/thông báo; không tự hoàn tiền Gym do đóng cửa. **Test lỗi:** số ngày ngoài 0–31 bị từ chối; lặp cùng sự cố không kéo dài lần hai.

#### UC-F2-56 — Thông báo có mục tiêu

**Vai trò:** Manager. **Chuẩn bị:** A trong lớp/nhóm bị ảnh hưởng, B ngoài phạm vi; hộp thư dùng test nhận được email.

1. Mở `Manual notices`, chọn đối tượng nhận, điền `Subject`, `Message`.
2. Chọn `Send in-app` và/hoặc `Send email`, kiểm tra người nhận, nhấn `Send notice`.
3. A mở chuông/hộp thư, B mở chuông; Manager kiểm tra `Notification delivery` và `Refresh` nếu có.
4. Gửi thêm request biệt lập với SMTP unavailable để kiểm trạng thái retry/failure.

**Pass khi:** chỉ đúng người nhận có nội dung, không CC lộ email; queued chưa được coi là Sent. **Test lỗi:** email lỗi không rollback lịch/hoàn điểm đã lưu; retry cùng request không thêm notice trùng. Nếu form chỉ hỗ trợ phạm vi người nhận khác use case, ghi rõ phạm vi được test, không tự khẳng định nhóm mục tiêu đã triển khai.

#### UC-F2-57 — Nhận/đọc thông báo cá nhân

**Vai trò:** Member, Coach, Manager. **Chuẩn bị:** thông báo từ đăng ký, điều chỉnh lịch, yêu cầu và sự cố ở các ca trước.

1. Nhấn icon chuông (`Notifications`), chọn một thông báo chưa đọc.
2. Kiểm tra nội dung và đường dẫn mở đúng lớp/buổi/request thuộc tài khoản.
3. Đánh dấu thông báo đã đọc bằng thao tác có trong item; nhấn `Mark all read` để đọc hết in-app.
4. Reload badge/list; đăng nhập tài khoản khác kiểm tra không đọc hoặc sửa thông báo người trước.

**Pass khi:** badge/read state cập nhật đúng, link vẫn kiểm quyền. **Test lỗi:** `Mark all read` không thay đổi trạng thái gửi email/OTP; đối tượng bị hủy vẫn có lịch sử hợp lệ thay vì mở nhầm dữ liệu khác.

**Kiểm tra bổ sung:** Kiểm Upcoming lesson → View session và tin lớp mới → View class; xác nhận đúng lớp/ngày/phòng, không tự mở nội dung đã mất quyền.

### I. Nhắc lịch và đồng bộ thay đổi

#### UC-F2-58 — Member nhận nhắc lịch trước buổi học

**Chuẩn bị:** Member đang Confirmed, chưa EndedAt; lớp Published/InProgress; buổi Scheduled tương lai. Member đã đăng ký trước mốc nhắc tương ứng.

**Thao tác:** Chuẩn bị lớp bắt đầu hơn 1 giờ và Member đã đăng ký trước mốc 1 giờ. Cho thời gian đi qua mốc, giữ API chạy; mở Notifications → View session. Đối chiếu lớp/giờ/phòng, chạy job/restart rồi kiểm không lặp. Lặp bằng clock kiểm thử cho mốc 24 giờ; test buổi bị hủy và Member thôi học.

**Pass khi:** Một receipt và thông báo in-app cho mỗi mốc hợp lệ; lịch/đăng ký không bị thay đổi.

**Test lỗi:** a. Buổi hủy, đã bắt đầu, ghi danh kết thúc: không nhắc mới. b. Đăng ký sau mốc 24 giờ: không gửi bù mốc đó; vẫn xét 1 giờ nếu đủ điều kiện. c. Đổi lịch tạo định danh nhắc theo giờ mới; restart/nhiều replica không nhân đôi một receipt. d. Mất quyền khi mở link: chặn nội dung, không phục hồi quyền từ thông báo cũ.

#### UC-F2-59 — Tự đóng yêu cầu chờ khi Manager đổi lịch trực tiếp

**Chuẩn bị:** Có request Pending trên buổi; Manager thực hiện reschedule, đổi HLV, cancel-with-makeup hoặc hủy khóa bằng lệnh nghiệp vụ hợp lệ.

**Thao tác:** Coach tạo báo vắng Pending; Manager mở lịch buổi và đổi giờ trực tiếp. Coach refresh Requests: Closed + lý do tự đóng, không còn nút rút. Thử cùng thao tác với slot trùng: request vẫn Pending. Lặp đổi HLV/hủy kèm bù/hủy cả khóa và kiểm thông báo HLV cũ/mới.

**Pass khi:** Lịch, trạng thái request, audit và thông báo commit đồng thời. Request đã đóng không được sửa/duyệt lại.

**Test lỗi:** a. Xung đột lịch hoặc lỗi transaction: giữ lịch và request Pending; không tạo thông báo thành công. b. Phê duyệt từ chính request: giữ RESOLVED, không bị tự đóng ghi đè. c. Coach gọi rút sau khi Manager đã đổi lịch: trả xung đột, không đổi trạng thái hoặc lịch.

## 5. Kiểm tra bổ sung cho mỗi nhóm

- **Lưu thật:** sau thao tác, reload hoặc đăng xuất/đăng nhập lại; thông tin vẫn đúng. Toast thành công chưa đủ.
- **Phân quyền:** dùng tài khoản B/Coach khác để mở URL dữ liệu A; API không trả nội dung ngoài phạm vi. Ẩn nút trên UI chưa đủ.
- **Chỗ cuối cùng:** hai Member ở hai profile cùng mua lớp còn một chỗ; tối đa một đăng ký được cung cấp, không vượt capacity. Ghi kết quả payment/compensation của cả hai.
- **Trùng sân/coach/học viên:** tạo hai thao tác cùng khung; lưu thứ hai phải kiểm lại và không tạo lịch chồng.
- **Retry:** lưu requestId/reference, gửi lặp cùng thao tác bằng fixture hoặc request tương ứng; chỉ một enrollment/rental/refund/outbox nguồn hợp lệ. Click hai lần bị disable chỉ chứng minh UI chống click, chưa chứng minh idempotency backend.
- **Các mốc chính:** hủy lớp tại ≥5 ngày và <5 ngày; rental tại ≥24 giờ và <24 giờ theo cấu hình; cancel & makeup tại ≥6 giờ và <6 giờ; attendance tại start −5 phút và end +24 giờ. Dùng clock server/fixture, kiểm tra cả đúng mốc và ngoài mốc.

### Test tự động hỗ trợ các ca thời gian

Chỉ chạy với Docker/Testcontainers hoặc PostgreSQL **test biệt lập**. Không trỏ `SPORTHUB_TEST_POSTGRES` vào DB đang dùng thật. Chưa có test cụ thể cho một use case không đồng nghĩa use case đã pass.

```powershell
# Kiểm tra test ngưỡng, transfer và expiry đang có
dotnet test backend/SportHub.Scheduling.Tests/SportHub.Scheduling.Tests.csproj --configuration Release --filter "FullyQualifiedName~ThresholdExpiryTests|FullyQualifiedName~ThresholdTransferTests"

# Bộ test Scheduling đầy đủ
dotnet test backend/SportHub.Scheduling.Tests/SportHub.Scheduling.Tests.csproj --configuration Release
```

Các ca callback muộn cần đối chiếu thêm bộ Payment và contract payment. Không đưa token, OTP, HashSecret hoặc password vào ảnh/log báo lỗi.

## 6. Ghi kết quả

| Trạng thái | Khi nào dùng |
|---|---|
| Pass | Đã làm đủ bước và bằng chứng đúng mọi kiểm tra của ca |
| Fail | Đã thao tác đúng nhưng kết quả khác expected; ghi bước đầu tiên bị lỗi |
| Blocked | Thiếu tài khoản/dữ liệu/SMTP/gateway/fixture hoặc môi trường không hoạt động |
| Not implemented | Phạm vi use case cần UI/API chưa có trong commit đang kiểm thử |
| Not run | Chưa chạy; không thay bằng Pass do CI khác đã xanh |

Mỗi use case có thể có nhiều scenario. Ví dụ hủy ≥5 ngày Pass nhưng <5 ngày chưa test → không ghi toàn UC-F2-25 Pass.

### Mẫu một kết quả

```text
Test ID: TC-F2-21-01
Use case: UC-F2-21
Scenario: Member đăng ký C1 bằng VNPay sandbox
Environment / commit:
Tester / thời gian Việt Nam:
Account / role:
ClassId / invoiceId / enrollmentId:
Preparation: A chưa đăng ký; C1 còn 2 chỗ; wallet trước test 0 điểm
Steps: Services → Classes & Packages → C1 → Payment → VNPay → Continue to payment
Expected: server xác nhận, 1 enrollment Confirmed, đủ 4 buổi trên My schedule
Actual:
Result: Pass / Fail / Blocked / Not run
Evidence: ảnh Services, My schedule, invoice; request URL + status đã che secret
Issue / failed step:
```

### Checklist đối chiếu dữ liệu sau thanh toán/hoàn

| Dữ liệu | Nơi xem | Kiểm tra |
|---|---|---|
| Đăng ký lớp | Manager Classes → Students; Member My schedule | Đúng Member/class, Confirmed duy nhất, đủ lesson |
| Seat hold | Manager Classes → Seat holds | Đúng checkout và expiry; hold kết thúc không còn chiếm chỗ |
| Booking sân | My schedule; Activity calendar | Đúng sân, giờ, status; không overlap |
| Hóa đơn | Finance / invoice details | Giá snapshot, chủ hóa đơn và trạng thái từ server |
| Điểm | Finance → wallet / Point history | Available và Held đúng, refund chỉ một lần |
| Thông báo | Notifications; Notification delivery | Đúng recipient/source; in-app read độc lập email delivery |
| Audit | Manager Audit log | Đúng actor, entity, reason và thời điểm |

## 7. Nguồn và điểm cần lưu ý

- Đặc tả 59 UC: [Flow-2-Use-Cases.md](Flow-2-Use-Cases.md), `output/flow2-use-cases/use-cases.json` và tab “Khôi - Flow 2” của tài liệu use case.
- Quy tắc ưu tiên: [00-Source-of-Truth.md](00-Source-of-Truth.md), [api-contract.md](api-contract.md), Business Rules hiện hành.
- Seed hiện tại: [Local-Validation-Data.md](Local-Validation-Data.md). Các đoạn seed demo trong tài liệu Coach cũ đã lỗi thời; không dùng chúng cho hướng dẫn này.
- Request Coach: [Class-Session-Change-Requests.md](Class-Session-Change-Requests.md).
- UI đối chiếu: Manager course editor/detail/threshold, Services/course purchase, Coach schedule/requests, Manager schedule/request review, rental calendar, incident workbench và NotificationBell.
- Các bước ghi “thao tác/nút xác nhận đang hiển thị” là nơi nhãn khác theo loại giao dịch hoặc UI chưa được xác nhận đầy đủ từ source. Không phải tên nút tiếng Anh được bịa thêm. Nếu không có thao tác, ghi Blocked UI và lưu bằng chứng thay vì bỏ qua.

Tài liệu này không thay đổi dữ liệu DB, không tạo thanh toán và không tự đánh dấu kết quả test.
