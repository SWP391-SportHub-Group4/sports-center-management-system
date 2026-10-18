# Rà soát 14 task Manager và luồng nghiệm thu

Ngày kiểm tra: 18/10/2026. Đối chiếu code đang có, tài liệu quyết định mới nhất, Docker local và database Docker bằng truy vấn chỉ đọc. Chưa thể kết luận hoàn thành toàn bộ: còn thiếu ngừng cả RoomType; lệnh BR-141 đã có nhưng dữ liệu bốn lớp chưa được tạo trên Docker.

Phạm vi bố trí buổi bù theo quyết định trước của người dùng: Manager nhập lịch thủ công, hệ thống kiểm tra khi lưu. Không có tự tìm/đề xuất lịch. Nếu nghiệm thu theo nguyên văn “tự bố trí” trong danh sách cũ thì mục đó chưa đáp ứng; theo quyết định mới thì đã triển khai đúng.

## Ma trận hiện trạng

| Task | Code hiện tại và evidence | Kết luận |
|---|---|---|
| 1. Đăng ký Member tại quầy | `manager-members.tsx` dùng RegisterMemberDialog/PendingMemberPanel chung với Lễ tân; API FrontDesk | Đã nối UI/API; cần kiểm tra nhận email thực tế |
| 2. Kết thúc phân công | CoachMemberRelationshipService.ReconcileAsync, enrollment fulfillment, ClassStatusJob; giữ quan hệ nếu còn lớp chung | Đã triển khai; job chạy mỗi 5 phút |
| 3. Sự cố đang diễn ra/đã kết thúc | ClassSessionService, incident report, UI incidents; giữ lịch sử gốc | Đã triển khai |
| 4. Bố trí buổi bù | Manager nhập lịch và server kiểm tra hợp lệ/xung đột; học lại nguyên thời lượng | Đúng phạm vi thủ công đã chốt, không tự xếp lịch |
| 5. Báo người bị ảnh hưởng | ClassScheduleEffects, CoachCoverageController, cancellation/undo outbox | Đã có in-app/email và regression tests; giao thư thật chưa được nghiệm thu trong lượt này |
| 6. Chốt lớp thiếu học viên | ClassThresholdService, expiry, ClassOpeningGuard, ClassStatusJob, UI Threshold | Đã có quy tắc 72–48–24 giờ và chặn khai giảng chưa chốt |
| 7. Không hoàn vượt cap | PointRefundService kiểm lại allowedByRule và absoluteCap; Manager đọc approval-quote | Đã có guard backend và UI |
| 8. Vé ngày không hoàn | EnsureNotDayPassAsync ở các đường tạo/quote/duyệt/hủy liên quan | Đã có |
| 9. Membership >=2/3, tối đa 50% | RefundCalculator.MembershipPoints đếm cả ngày đầu/cuối theo Việt Nam | Đã có |
| 10. Dùng quá mức không hoàn | Membership còn dưới 2/3 → hoàn chuẩn 0; xét thời gian đã qua, không đếm lần check-in | Đúng quyết định đã chốt; center fault theo quy tắc riêng |
| 11. Ngừng cả loại phòng | RoomType chỉ có RoomTypeId/Name; API tạo/sửa/gán môn/xóa; UI không có ngừng/bật lại | **Thiếu schema, API, guard vận hành và UI** |
| 12. Bốn lớp BR-141 | Br141Seeder và cờ --seed-br141=true trong API chính; không tự seed startup | **Có code, thiếu setup dữ liệu local** |
| 13. Lịch sử thông báo/người nhận | ManualNoticeRecord, API list/detail/recipients, Sent notice history | Đã có, migration đã áp dụng trên Docker |
| 14. Phân công/theo dõi/đóng hỗ trợ | /manager/support, form trong hồ sơ Member, API FrontDesk, audit | Đã có; UI chỉ hiện ghi chú mới nhất/kết quả đóng, audit giữ các lần xử lý |

## Những việc chưa hoàn tất

### Ngừng sử dụng loại phòng

`backend/SportHub.Scheduling/Catalog/Domain/RoomType.cs` chưa có IsActive/trạng thái. Database `room_types` cũng chỉ có `room_type_id`, `name`. `RoomTypesController` không có API ngừng/bật lại; RoomTypesManager chỉ có tạo, sửa và xóa. Vô hiệu hóa từng Room chưa đáp ứng yêu cầu ngừng cả loại phòng.

Cần triển khai trạng thái RoomType, migration, thao tác Manager, kiểm tra hiệu lực phòng khi đặt lịch/thuê sân và quy tắc với lịch đã tồn tại. Bật lại loại phòng phải giữ trạng thái ngừng riêng của từng Room. Hiện không có luồng giao diện nào để nghiệm thu mục này.

### Setup BR-141

Truy vấn database Docker tại thời điểm kiểm tra cho kết quả 0 lớp mang bốn mã `BR141-BONGRO-01`, `BR141-BONGRO-02`, `BR141-CAULONG-01`, `BR141-CAULONG-02`. Các lớp demo/validation hiện có không được tính là bốn lớp BR-141.

Database đang cấu hình GroupCourse Cầu lông 90 phút, Bóng rổ 120 phút. Vì Cầu lông đã có lớp, seeder sẽ không tự nâng 90 lên 120 và sẽ dừng yêu cầu Manager rà cấu hình. Chưa chạy seed hoặc sửa dữ liệu vận hành trong lượt rà soát này.

Để hoàn tất: rà cấu hình Cầu lông 120 phút và ảnh hưởng các lớp hiện có, kiểm tra HLV/phòng/chuyên môn/giờ mở cửa, rồi chạy lệnh setup riêng theo RUNBOOK §3.2.1. Startup không seed là chủ đích đã chốt; không phải thiếu cờ gọi lệnh nữa. Sau setup phải kiểm tra đủ bốn lớp và lịch chặn thuê trùng.

## Chuẩn bị kiểm tra thủ công

- Mở http://localhost:3000, Ctrl+F5; Manager dùng workspace /manager, Lễ tân /receptionist, Coach /coach và Member /member. Dùng phiên/incognito riêng khi đối chiếu nhiều vai trò.
- Có hai Member, hai Coach hợp lệ, một Manager khác hoặc Receptionist để gửi yêu cầu hoàn không do người duyệt tạo, lớp có Enrollment Confirmed và phòng còn lịch trống.
- Ca 2/3 thời hạn, lớp sắp/đã kết thúc và mốc 72–48–24 giờ cần dữ liệu kiểm thử đúng ngày giờ. Không thể kiểm mốc biên bằng một Membership vừa mua hoặc chỉ thay đồng hồ trình duyệt: backend quyết định thời gian. Dùng database nghiệm thu riêng có dữ liệu chuẩn bị, hoặc chạy integration tests với clock/dữ liệu được kiểm soát.
- Kiểm tra kết quả thực tế qua lần tải lại, ví/hóa đơn, lịch, thông báo và audit; thông báo thành công trên màn nhập chưa đủ chứng minh email đã đến.

## Luồng kiểm tra trên giao diện

### 1. Đăng ký Member tại quầy

Manager → Members → nút đăng ký Member → nhập hồ sơ/email mới → xác nhận. Phải mở hồ sơ Member trong workspace Manager, hiện chờ kích hoạt; không có ô đặt mật khẩu hộ. Mở email kích hoạt, Member tự đặt mật khẩu và đăng nhập. Khi chưa kích hoạt, kiểm tra gửi lại link/sửa email; email cũ/link cũ không còn dùng sau sửa. Email trùng phải báo lỗi và không tạo thêm tài khoản. Đối chiếu luồng Lễ tân cùng hành vi.

### 2. Kết thúc phân công HLV–Member

Manager → Members → hồ sơ → Overview → Coach relationships. Với cặp chỉ có một lớp chung, để Member rời/hủy ghi danh qua luồng hợp lệ: quan hệ phải Ended, có ngày/lý do, lịch sử giữ lại. Với cặp có hai lớp chung, rời một lớp phải giữ Active. Với lớp có buổi cuối kết thúc, chờ job tối đa một chu kỳ 5 phút: lớp Completed, quan hệ chỉ kết thúc nếu không còn lớp chung đủ điều kiện. Học lại tạo quan hệ Active mới, không sửa bản ghi Ended cũ. Đối chiếu quyền Coach sau khi hết lớp chung; thao tác End relationship thủ công không tự hủy ghi danh hay đổi HLV của lớp.

### 3–4. Sự cố và buổi học lại

Manager → Operations → Incidents → chọn phòng/trung tâm, khoảng sự cố thực tế và lý do → preview → mở buổi bị ảnh hưởng. Kiểm tra một buổi đang diễn ra và một buổi đã kết thúc. Chọn INTERRUPTED/NOT_HELD → nhập lịch, phòng và HLV cho buổi học lại → xem lại → xác nhận → preview lại và hoàn tất sự cố.

Kỳ vọng: buổi học lại đủ thời lượng buổi gốc, sau buổi cuối còn hiệu lực; giữ điểm danh/kết quả/giờ gốc và liên kết học lại. Với buổi đã học đủ, chọn COMPLETED_AS_PLANNED: chỉ ghi nhận, không tạo buổi mới. Thử trùng lịch phòng/HLV/Member, giờ đóng cửa hoặc HLV sai chuyên môn: phải bị chặn. Gửi lại cùng quyết định không tạo buổi học lại thứ hai. Không có thao tác tự tìm lịch trong phạm vi mới.

### 5. Thông báo dời/hủy/đổi HLV

Với lớp có học viên Confirmed, thực hiện từng thao tác hợp lệ: dời buổi; hủy kèm học lại; đổi HLV buổi; hủy khóa. Với HLV chính bị khóa, dùng luồng thay HLV của Manager. Mở tài khoản Member, HLV cũ/mới liên quan → Notifications; kiểm nội dung thời gian/phòng/HLV/lý do và phạm vi thay đổi. Đổi HLV chính không đồng nghĩa tự đổi HLV từng buổi.

Đối chiếu email ở hộp thư thật; lịch sử gửi thủ công không phải danh sách mọi thông báo hệ thống. Thử một thao tác bị từ chối do xung đột: không được thông báo đã đổi thành công. Gửi lại thao tác lịch giống hệt không tạo sự kiện trùng. Undo sự cố thành công phải báo sửa lại lịch; undo thất bại không báo đã khôi phục.

### 6. Lớp thiếu học viên

Manager → Classes → chi tiết → Threshold. Chuẩn bị lớp dưới ngưỡng, buổi đầu ít nhất 72 giờ sau thời điểm đánh giá. Chờ job đánh giá: lớp có cảnh báo, Member/HLV/Manager được thông báo; hạn phản hồi tối đa 48 giờ và trước khai giảng ít nhất 24 giờ.

Kiểm tra các nhánh riêng trên lớp thử khác nhau: đủ học viên trong thời gian chờ → xác nhận mở, không hoàn người chưa phản hồi; Manager miễn ngưỡng với lý do → mở hợp lệ; hết hạn vẫn thiếu, không miễn → hủy/hoàn người còn ghi danh; kiểm tra muộn → yêu cầu chốt/dời, không tự khai giảng. Lớp chưa xác nhận phải chặn điểm danh/ghi kết quả. Đối chiếu nhãn xác nhận ở trang công khai.

### 7. Chặn hoàn vượt mức hệ thống

Member mở hóa đơn đã thanh toán → tạo yêu cầu hoàn cho một item còn quyền lợi. Manager khác người tạo yêu cầu → Finance → Refunds → mở yêu cầu, đọc system cap → thử nhập phần trăm vượt max: nút duyệt phải bị chặn. Duyệt trong cap với lý do hợp lệ: ví chỉ tăng đúng số điểm được duyệt, có ledger và audit. Reload/retry không cộng lần hai. Để kiểm backend độc lập với UI, gọi API approve bằng đúng payload nhưng tăng percent vượt mức: phải trả lỗi; không đổi ví.

### 8. Vé ngày

Member mua vé Gym 1 ngày → mở hóa đơn → thử yêu cầu hoàn. Kỳ vọng không tạo được yêu cầu; API trả `day_pass_non_refundable`, ví không tăng. Cờ center fault không cho phép vượt chính sách vé ngày. Giữ hóa đơn/lịch sử check-in.

### 9–10. Membership theo thời hạn đã qua

Chuẩn bị gói 90 ngày, giá thực trả 900.000đ, ngày đầu = D, ngày cuối = D+89. Gói Active, không có hoàn trước và không dùng center fault:

| Ngày yêu cầu theo Việt Nam | Thời hạn còn lại | Hoàn chuẩn kỳ vọng |
|---|---|---|
| D+29 | 61/90 ngày | Tối đa 450 điểm |
| D+30 | 60/90 ngày, đúng 2/3 | Tối đa 450 điểm |
| D+31 | 59/90 ngày | 0 điểm |

Mở My plans → hủy gói hoặc hóa đơn → quote hoàn, đối chiếu kết quả. Số lần check-in không làm thay đổi phép tính. Manager không thể duyệt hoàn chuẩn khi cap bằng 0. Center fault chỉ theo phần chưa dùng và lý do nghiệp vụ hợp lệ; đóng Gym tạm thời xử lý gia hạn, không dùng làm lý do hoàn tự động. Ví dụ số điểm phải tính lại nếu giá thực trả khác hoặc đã có hoàn trước.

### 11. Loại phòng

Hiện chưa kiểm thử được thao tác ngừng cả loại trên UI. Sau khi triển khai phải thử ngừng một loại có nhiều phòng, chặn đặt mới, giữ lịch sử, kiểm lịch đã tồn tại và bật lại không mở nhầm phòng vốn bị ngừng riêng.

### 12. BR-141 sau khi hoàn tất setup

Manager → Classes → tìm từng mã BR141-*; mỗi môn có lớp 01 vào T2/4/6 07:00–09:00 và lớp 02 vào T3/5/7 14:00–16:00, mỗi lớp mới 12 buổi. Member thấy lớp đã publish. Thử thuê đúng phòng trong giờ lớp: không có slot/trả xung đột; giờ ngoài lớp còn trống vẫn thuê được. Chạy lại lệnh seed phải giữ đúng bốn mã, không tạo trùng hoặc đổi lịch/giá đã sửa. Không yêu cầu khởi động app là tự tạo lại lớp.

### 13. Lịch sử thông báo thủ công

Manager → Manual notices → gửi một thông báo thử tới hai tài khoản kiểm thử, chọn kênh cần kiểm → Sent notice history → tìm/lọc ngày → mở tiêu đề. Phải thấy nội dung và hai người nhận, trạng thái riêng in-app/email; không cần nhớ UUID. Sửa hồ sơ người nhận rồi mở lại: tên/email snapshot lúc gửi giữ nguyên. Manager khác không đọc được nội dung/người nhận của thông báo không thuộc mình. Không còn dòng Waiting for API · G07.

### 14. Hỗ trợ Member

Manager → Members → hồ sơ → Member support → tạo yêu cầu. Operations → Support requests → tìm yêu cầu → giao cho Receptionist/Manager Active → nhập ghi chú → Update progress → nhập kết quả → Close request. Phải chuyển OPEN → ASSIGNED → IN PROGRESS → CLOSED; hiển thị người phụ trách, cập nhật và kết quả/thời gian đóng. Lễ tân khác vẫn xử lý được theo FR-22. Sau đóng không có nút cập nhật; API assign/progress bị chặn, close lặp không ghi thêm. Audit có người thao tác và nội dung xử lý.

## Bằng chứng và giới hạn

Kết quả chạy lại trong lượt rà soát: **76/76 backend đạt** — Payment 48 (calculator/refund workflow/manual notice history), Scheduling 20 (notification audit/opening decision/incident recovery/BR-141), Training relationship lifecycle 8. **17/17 UI đạt** từ registration/end relationship/incident recovery/membership policy/notice history/support, chạy trên frontend Docker cổng 3000 với API mô phỏng. Đây là các nhóm kiểm thử liên quan, không phải toàn bộ test hệ thống.

Lần đầu nhóm Training có 1 ca lỗi `class_threshold_missing`: fixture tự tạo Published class nhưng không có ngưỡng. Đã bổ sung giá/chi phí/ngưỡng/ngày hợp lệ trong đúng test đó; vẫn cho job tự đánh giá đạt ngưỡng rồi hoàn thành lớp/kết thúc quan hệ, không ép trạng thái Met để bỏ qua kiểm tra. Lần chạy lại cả 8 ca đạt. Scheduling gặp file output bị process dotnet cũ giữ; chạy lại bằng artifacts-path riêng trong thư mục tạm và đạt 20 ca.

SMTP host và sender đã có cấu hình trong container; điều đó không chứng minh email đã tới hộp thư. Chưa chạy giao dịch thanh toán/hoàn thử hoặc seed lớp vào database vận hành. Không thay đổi chức năng ứng dụng trong lượt rà soát; chỉ cập nhật fixture của một test lifecycle bị thiếu dữ liệu ngưỡng và tài liệu này.
