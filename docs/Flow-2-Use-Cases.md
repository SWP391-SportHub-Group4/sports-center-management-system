# Flow 2 — Use Case Specifications

**Cập nhật quy tắc 18/10/2026:** Coach không được sửa yêu cầu đã gửi, chỉ rút Pending. UC-F2-42 được giữ mã để kiểm tra chặn sửa. UC-F2-45 lọc người rảnh trên dropdown và vẫn kiểm lại khi lưu. Đây là đặc tả, không phải kết quả test đã Pass.

3.3 Use Case Specifications
Flow 2 Quản lý lớp học lịch và thuê sân
Phạm vi: danh mục tài nguyên, khóa học, ghi danh, ngưỡng mở lớp, lịch dạy, điểm danh, yêu cầu điều chỉnh, thuê sân và sự cố vận hành. Cập nhật quyền nội dung và request theo code `06683826` ngày 18/10/2026; đặc tả không phải báo cáo đã kiểm thử thành công.
Mã UC-F2 là mã phân rã trong Flow 2, đối chiếu UC-07, UC-08, UC-09 và UC-10 của SRS. Thanh toán gọi UC-15, hoàn theo yêu cầu gọi UC-16 của Flow 3. Kế hoạch tập luyện, đánh giá và hồ sơ sức khỏe thuộc Flow 4/5; PT, Yoga và GroupX không thuộc phạm vi hiện tại.
Quy ước chung: thời gian lưu UTC, hiển thị UTC+7; backend kiểm tra quyền và dữ liệu tại thời điểm ghi. 1 điểm = 1.000 VND; hoàn trả bằng điểm, không trả tiền mặt. Giao dịch lặp phải idempotent. Thông báo qua outbox không làm rollback nghiệp vụ khi gửi email lỗi.
Nguồn đối chiếu: SportManagement_BusinessRules_v2.0_updated.docx; SWP391_Report_SRS.docx (UC-07 đến UC-10); Center-Management-System-Design-v3.md; api-contract.md; Class-Session-Change-Requests.md. Khi khác nhau, ưu tiên phạm vi đã xác nhận và Business Rules theo 00-Source-of-Truth.md. BR-122 quy định hoàn trước khai giảng 100% nếu còn ít nhất 5 ngày, 50% nếu dưới 5 ngày; không dùng mô tả 100% chung trong SRS cũ.
Cập nhật 16/10/2026: đã có rút Pending trong Requests, nhắc lịch và tự đóng yêu cầu khi Manager đổi buổi trực tiếp. Email cần SMTP để kiểm chứng delivery. Các use case tự động dùng tác vụ hệ thống làm tác nhân khởi phát.

Đối chiếu 18/10/2026: Member còn ghi danh hợp lệ vẫn xem lịch sử lớp Completed (UC-F2-20), trong khi quyền Coach chỉ dựa trên lớp Published/InProgress và đúng phạm vi buổi/lớp. UI Coach chỉ tạo ABSENCE; backend còn nhận các loại tạo mới cũ theo gap COACH-01, không mô tả chặn mọi client như một chức năng đã hoàn tất. Xem [thiết kế §13.2](Center-Management-System-Design-v3.md#132-chức-năng-và-contract-còn-thiếu).



## A. Danh mục và tài nguyên

### UC-F2-01 — Quản lý bộ môn

| Mục | Nội dung |
|---|---|
| Tác nhân | Center Manager |
| Mức ưu tiên | Required |
| Tiền điều kiện | Đã đăng nhập; có quyền quản lý danh mục. |
| Luồng chính | 1. Mở danh mục bộ môn.<br>2. Nhập tên, thời lượng buổi tập, sức chứa mặc định và dịch vụ được hỗ trợ.<br>3. Lưu hoặc cập nhật trạng thái hoạt động.<br>4. Hệ thống kiểm tra và lưu danh mục. |
| Luồng thay thế / ngoại lệ | a. Tên hoặc thông số không hợp lệ: từ chối và chỉ rõ trường.<br>b. Bộ môn đã được tham chiếu: giữ lịch sử, dùng ngừng hoạt động thay cho xóa phá dữ liệu.<br>c. Bộ môn ngừng hoạt động: không tạo đăng ký mới. |
| Hậu điều kiện | Danh mục được lưu thật vào DB; dữ liệu lịch sử được giữ. |

### UC-F2-02 — Quản lý loại phòng và sân

| Mục | Nội dung |
|---|---|
| Tác nhân | Center Manager |
| Mức ưu tiên | Required |
| Tiền điều kiện | Có quyền quản lý cơ sở vật chất. |
| Luồng chính | 1. Mở danh mục loại phòng.<br>2. Đặt tên và chọn các bộ môn tương thích.<br>3. Lưu thay đổi.<br>4. Hệ thống áp dụng tương thích khi tạo lớp hoặc đặt sân. |
| Luồng thay thế / ngoại lệ | a. Cấu hình không hợp lệ: không lưu.<br>b. Loại phòng có tham chiếu: không xóa làm mất dữ liệu.<br>c. Không tương thích bộ môn: từ chối phân bổ tài nguyên. |
| Hậu điều kiện | Loại phòng và quan hệ bộ môn được cập nhật. |

### UC-F2-03 — Quản lý phòng và sân

| Mục | Nội dung |
|---|---|
| Tác nhân | Center Manager |
| Mức ưu tiên | Required |
| Tiền điều kiện | Loại phòng hợp lệ đã tồn tại. |
| Luồng chính | 1. Mở danh sách phòng/sân.<br>2. Nhập tên duy nhất, loại phòng, sức chứa và trạng thái.<br>3. Lưu dữ liệu.<br>4. Hệ thống kiểm tra sức chứa và tham chiếu trước khi cập nhật. |
| Luồng thay thế / ngoại lệ | a. Tên trùng hoặc sức chứa không hợp lệ: từ chối.<br>b. Có lịch hoặc dữ liệu liên quan: không cho xóa cứng.<br>c. Ngừng hoạt động không tự hủy các lịch đã xác nhận; xử lý bằng luồng điều chỉnh. |
| Hậu điều kiện | Tài nguyên được quản lý; lịch sử sử dụng còn nguyên. |

### UC-F2-04 — Cấu hình giờ hoạt động của phòng và sân

| Mục | Nội dung |
|---|---|
| Tác nhân | Center Manager |
| Mức ưu tiên | Required |
| Tiền điều kiện | Có quyền cấu hình giờ hoạt động. |
| Luồng chính | 1. Chọn phòng/sân và ngày trong tuần.<br>2. Nhập giờ mở và đóng theo giờ Việt Nam.<br>3. Lưu khung giờ.<br>4. Hệ thống kiểm tra toàn bộ thời gian lớp/thuê sân phải nằm trong giờ hoạt động của tài nguyên. |
| Luồng thay thế / ngoại lệ | a. Giờ kết thúc không sau giờ bắt đầu: từ chối.<br>b. Ngày đóng cửa hoặc khoảng nằm ngoài giờ hoạt động: không cho đặt mới.<br>c. Lịch cũ cần thay đổi: xử lý điều chỉnh riêng, không âm thầm dời lịch. |
| Hậu điều kiện | Giờ hoạt động là căn cứ kiểm tra các giao dịch mới. |

### UC-F2-05 — Quản lý giá thuê sân

| Mục | Nội dung |
|---|---|
| Tác nhân | Center Manager |
| Mức ưu tiên | Required |
| Tiền điều kiện | Phòng/loại phòng và bộ môn tương thích đã tồn tại. |
| Luồng chính | 1. Chọn loại phòng, bộ môn nếu có, ngày và khoảng giờ áp dụng.<br>2. Nhập giá thuê theo giờ và trạng thái.<br>3. Hệ thống kiểm tra phạm vi áp dụng không chồng lấn.<br>4. Lưu bảng giá; báo giá sử dụng các mức giá phù hợp. |
| Luồng thay thế / ngoại lệ | a. Giá không hợp lệ hoặc chồng lấn quy tắc: từ chối.<br>b. Không có giá cho một khung giờ: khung đó không thể đặt.<br>c. Thay đổi giá không sửa giá đã chốt trên hóa đơn. |
| Hậu điều kiện | Bảng giá mới được lưu; giao dịch cũ giữ nguyên snapshot giá. |

### UC-F2-06 — Tạo và quản lý khoảng khóa sân

| Mục | Nội dung |
|---|---|
| Tác nhân | Center Manager |
| Mức ưu tiên | Required |
| Tiền điều kiện | Có quyền quản lý lịch tài nguyên. |
| Luồng chính | 1. Chọn sân, thời gian và lý do bảo trì/sự kiện.<br>2. Hệ thống kiểm tra các hoạt động đang chiếm sân.<br>3. Tạo khoảng khóa nếu không xung đột.<br>4. Khi cần, chỉnh sửa hoặc xóa khoảng khóa thủ công. |
| Luồng thay thế / ngoại lệ | a. Xung đột lớp hoặc lượt thuê: xử lý hoạt động bị ảnh hưởng trước.<br>b. Khoảng khóa do sự cố tạo: không xóa bằng thao tác khóa thủ công.<br>c. Thời gian không hợp lệ: từ chối. |
| Hậu điều kiện | Sân không thể được đặt trong khoảng khóa; có dấu vết thao tác. |

### UC-F2-07 — Kiểm tra khả dụng tài nguyên

| Mục | Nội dung |
|---|---|
| Tác nhân | Center Manager |
| Mức ưu tiên | Required |
| Tiền điều kiện | Đã xác định bộ môn, phòng, coach và khoảng thời gian. |
| Luồng chính | 1. Nhập lịch dự kiến.<br>2. Hệ thống đối chiếu giờ mở cửa, loại phòng, sức chứa và lịch chiếm chỗ.<br>3. Hiển thị các xung đột và tài nguyên khả dụng.<br>4. Người dùng chọn phương án trước khi lưu lịch. |
| Luồng thay thế / ngoại lệ | a. Không có phương án phù hợp: hiển thị nguyên nhân.<br>b. Kết quả xem trước đã cũ: thao tác lưu phải kiểm tra lại.<br>c. Xem trước không giữ chỗ và không bảo đảm tài nguyên còn trống. |
| Hậu điều kiện | Có thông tin hỗ trợ chọn lịch; chưa phát sinh chiếm chỗ. |

## B. Quản lý khóa học và lịch

### UC-F2-08 — Tạo khóa học nháp

| Mục | Nội dung |
|---|---|
| Tác nhân | Center Manager |
| Mức ưu tiên | Required |
| Tiền điều kiện | Bộ môn, phòng và coach đang hoạt động; coach đúng chuyên môn. |
| Luồng chính | 1. Nhập mã khóa duy nhất, bộ môn, coach, phòng và sức chứa.<br>2. Nhập ngày bắt đầu, số buổi và quy tắc ngày/giờ học.<br>3. Nhập học phí và chi phí vận hành.<br>4. Hệ thống sinh lịch dự kiến và kiểm tra dữ liệu.<br>5. Lưu khóa ở trạng thái DRAFT. |
| Luồng thay thế / ngoại lệ | a. Mã trùng, số buổi/sức chứa không hợp lệ: từ chối.<br>b. Sức chứa vượt giới hạn bộ môn/phòng: từ chối.<br>c. Giá phải dương và theo đơn vị 1.000 VND; thiếu dữ liệu: yêu cầu bổ sung. |
| Hậu điều kiện | Khóa nháp được lưu; chưa công khai và chưa mở đăng ký. |

### UC-F2-09 — Chỉnh sửa khóa học nháp

| Mục | Nội dung |
|---|---|
| Tác nhân | Center Manager |
| Mức ưu tiên | Required |
| Tiền điều kiện | Khóa ở DRAFT. |
| Luồng chính | 1. Mở chi tiết bản nháp.<br>2. Sửa thông tin, lịch lặp, tài nguyên hoặc giá.<br>3. Sinh lại lịch dự kiến.<br>4. Kiểm tra và lưu thay đổi. |
| Luồng thay thế / ngoại lệ | a. Khóa đã công bố: dùng luồng chỉnh sửa phù hợp, không sửa như bản nháp.<br>b. Lịch sinh ra không hợp lệ hoặc thiếu buổi: từ chối.<br>c. Bản ghi đã thay đổi: tải lại trước khi lưu. |
| Hậu điều kiện | Bản nháp mới nhất được lưu; không tạo đăng ký hoặc thanh toán. |

### UC-F2-10 — Công bố khóa học

| Mục | Nội dung |
|---|---|
| Tác nhân | Center Manager |
| Mức ưu tiên | Required |
| Tiền điều kiện | DRAFT hợp lệ; ngưỡng hòa vốn không vượt sức chứa; toàn bộ lịch hợp lệ. |
| Luồng chính | 1. Xem lịch và học phí lần cuối.<br>2. Chọn công bố.<br>3. Hệ thống kiểm tra lại giờ mở cửa, phòng và coach cho tất cả buổi.<br>4. Tạo buổi học, giữ tài nguyên và chuyển sang PUBLISHED trong cùng giao dịch.<br>5. Thông báo cho coach và hiển thị khóa trên danh mục. |
| Luồng thay thế / ngoại lệ | a. Trùng lịch hoặc tài nguyên bị người khác chiếm: rollback toàn bộ.<br>b. Ngưỡng ceil(chi phí/học phí) vượt sức chứa: không công bố.<br>c. Thiếu chuyên môn hoặc tài nguyên ngừng hoạt động: từ chối. |
| Hậu điều kiện | Khóa công khai; các buổi và lịch tài nguyên nhất quán; có thể đăng ký khi đủ điều kiện. |

### UC-F2-11 — Điều chỉnh giá và chi phí trước hạn xét mở lớp

| Mục | Nội dung |
|---|---|
| Tác nhân | Center Manager |
| Mức ưu tiên | Required |
| Tiền điều kiện | Khóa còn trong thời hạn cho phép cập nhật giá/chi phí trước quyết định ngưỡng. |
| Luồng chính | 1. Mở thông tin học phí và chi phí.<br>2. Nhập giá trị mới.<br>3. Hệ thống tính lại ngưỡng hòa vốn.<br>4. Lưu giá trị dùng cho giao dịch mới. |
| Luồng thay thế / ngoại lệ | a. Đã qua hạn khóa thông số: từ chối.<br>b. Ngưỡng vượt sức chứa: không chấp nhận cấu hình.<br>c. Hóa đơn đã phát sinh: không sửa snapshot hoặc truy thu tự động. |
| Hậu điều kiện | Cấu hình mới được lưu; quyền lợi và số tiền giao dịch cũ được giữ. |

### UC-F2-12 — Đóng hoặc mở lại đăng ký

| Mục | Nội dung |
|---|---|
| Tác nhân | Center Manager |
| Mức ưu tiên | Required |
| Tiền điều kiện | Khóa PUBLISHED hoặc IN_PROGRESS (đã có thể bắt đầu); còn buổi sắp tới. |
| Luồng chính | 1. Mở quản lý khóa.<br>2. Chọn đóng hoặc mở đăng ký.<br>3. Hệ thống kiểm tra trạng thái và thời điểm.<br>4. Cập nhật khả năng nhận đăng ký và thông tin trên danh mục. |
| Luồng thay thế / ngoại lệ | a. Hoàn thành hoặc hủy: không mở đăng ký. Khóa đã bắt đầu vẫn mở được; Member vào giữa chừng, học từ buổi kế tiếp, trả giá trọn khóa.<br>b. Hết chỗ vẫn không thể đăng ký dù trạng thái mở.<br>c. Đóng đăng ký không tự hủy đăng ký hoặc hóa đơn đã có. |
| Hậu điều kiện | Trạng thái nhận đăng ký được cập nhật; dữ liệu học viên hiện có giữ nguyên. |

### UC-F2-13 — Phân công hoặc thay coach

| Mục | Nội dung |
|---|---|
| Tác nhân | Center Manager |
| Mức ưu tiên | Required |
| Tiền điều kiện | Khóa/buổi đủ điều kiện điều chỉnh; coach thay thế hoạt động và đúng bộ môn. |
| Luồng chính | 1. Chọn khóa hoặc buổi cần thay người dạy.<br>2. Chọn coach phù hợp và nhập lý do.<br>3. Hệ thống kiểm tra lịch coach và tài nguyên.<br>4. Lưu phân công, cập nhật quyền truy cập và gửi thông báo. |
| Luồng thay thế / ngoại lệ | a. Coach sai chuyên môn hoặc trùng lịch: từ chối.<br>b. Buổi đã diễn ra: không thay bằng thao tác lịch tương lai.<br>c. Coach cũ không được tiếp tục truy cập phạm vi đã chuyển nếu không còn phân công. |
| Hậu điều kiện | Lịch và phạm vi phụ trách khớp với phân công mới.<br>Thông báo chuông/email được queue cho HLV chủ nhiệm, HLV cũ và HLV mới (loại trùng); request Pending của buổi tự đóng với lý do Schedule updated by Manager. |

### UC-F2-14 — Xem lịch hoạt động trung tâm

| Mục | Nội dung |
|---|---|
| Tác nhân | Center Manager, Receptionist |
| Mức ưu tiên | Required |
| Tiền điều kiện | Đã đăng nhập với quyền xem lịch vận hành. |
| Luồng chính | 1. Mở lịch trung tâm.<br>2. Chọn khoảng thời gian và tài nguyên.<br>3. Xem các lớp, lượt thuê và khoảng khóa trong phạm vi được phép.<br>4. Mở chi tiết hoạt động để thực hiện thao tác được cấp quyền. |
| Luồng thay thế / ngoại lệ | a. Không có hoạt động: hiển thị trạng thái trống.<br>b. Không có quyền chi tiết: từ chối truy cập.<br>c. Thông tin mới phát sinh: tải lại lịch; không dựa vào lịch cũ để ghi thay đổi. |
| Hậu điều kiện | Người dùng nắm được lịch; thao tác xem không sửa dữ liệu. |

### UC-F2-15 — Dời lịch buổi học

| Mục | Nội dung |
|---|---|
| Tác nhân | Center Manager |
| Mức ưu tiên | Required |
| Tiền điều kiện | Buổi tương lai có trạng thái Scheduled; khóa còn hoạt động. |
| Luồng chính | 1. Chọn buổi và nhập lịch/phòng/coach mới.<br>2. Hệ thống giữ đúng thời lượng và kiểm tra giờ hoạt động.<br>3. Kiểm tra xung đột tài nguyên và lịch học viên.<br>4. Cập nhật buổi và lịch chiếm chỗ trong một giao dịch.<br>5. Gửi thông báo cho coach và học viên. |
| Luồng thay thế / ngoại lệ | a. Buổi quá khứ hoặc đã hủy: từ chối.<br>b. Xung đột lịch/phòng/coach/học viên: không lưu.<br>c. Có thay đổi đồng thời: kiểm tra lại và rollback nếu không còn hợp lệ. |
| Hậu điều kiện | Buổi được dời; đăng ký còn nguyên; lịch cũ được giải phóng.<br>Mọi request Pending của buổi được tự đóng WITHDRAWN/SCHEDULE_UPDATED; HLV liên quan nhận thông báo chuông và hàng đợi email. Thay đổi thất bại không đóng request. |

### UC-F2-16 — Hủy buổi và tạo buổi học bù

| Mục | Nội dung |
|---|---|
| Tác nhân | Center Manager |
| Mức ưu tiên | Required |
| Tiền điều kiện | Buổi tương lai Scheduled; khóa còn hoạt động. |
| Luồng chính | 1. Chọn buổi cần hủy và ghi lý do.<br>2. Chọn lịch học bù hợp lệ.<br>3. Kiểm tra tài nguyên, thời lượng và xung đột học viên.<br>4. Hủy buổi cũ, tạo học bù và cập nhật lịch khóa trong một giao dịch.<br>5. Gửi thông báo lịch thay đổi. |
| Luồng thay thế / ngoại lệ | a. Thiếu lịch học bù: không hoàn tất hủy buổi theo luồng này.<br>b. Lịch bù trùng hoặc ngoài giờ mở cửa: từ chối.<br>c. Không được làm giảm số buổi cam kết của khóa. |
| Hậu điều kiện | Giữ đủ số buổi học; lịch tài nguyên và thông báo được cập nhật.<br>Request Pending của buổi bị ảnh hưởng tự đóng với lý do rõ ràng; HLV chủ nhiệm/cũ/mới nhận thông báo. Số buổi và quyền lợi vẫn theo quy tắc buổi bù. |

### UC-F2-17 — Hủy toàn bộ khóa học

| Mục | Nội dung |
|---|---|
| Tác nhân | Center Manager |
| Mức ưu tiên | Required |
| Tiền điều kiện | Khóa DRAFT, PUBLISHED hoặc IN_PROGRESS; có lý do hợp lệ. |
| Luồng chính | 1. Mở khóa và xác nhận hủy.<br>2. Hệ thống xác định phần học phí còn phải hoàn.<br>3. Hủy các buổi chưa diễn ra, giải phóng lịch và hold liên quan.<br>4. Hoàn điểm theo quy tắc và ghi audit.<br>5. Thông báo cho coach và học viên. |
| Luồng thay thế / ngoại lệ | a. Trước khi bắt đầu: hoàn 100% giá trị được hoàn.<br>b. Đang học: hoàn theo phần buổi chưa sử dụng, quy đổi điểm theo quy tắc làm tròn.<br>c. Thao tác lặp: không hoàn hai lần; không xóa hóa đơn đã thanh toán. |
| Hậu điều kiện | Khóa CANCELLED; lịch tương lai được giải phóng; hoàn điểm và lịch sử nhất quán.<br>Các request Pending của những buổi bị hủy tự đóng và HLV liên quan được thông báo trong cùng transaction. |

### UC-F2-18 — Cập nhật vòng đời khóa học

| Mục | Nội dung |
|---|---|
| Tác nhân | Hệ thống |
| Mức ưu tiên | Required |
| Tiền điều kiện | Khóa có lịch và trạng thái hợp lệ. |
| Luồng chính | 1. Xác định khóa đến thời điểm bắt đầu.<br>2. Chuyển PUBLISHED sang IN_PROGRESS theo điều kiện nghiệp vụ.<br>3. Xác định khóa đã kết thúc đầy đủ các buổi, kể cả buổi bù.<br>4. Chuyển sang COMPLETED và giữ lịch sử học viên. |
| Luồng thay thế / ngoại lệ | a. Khóa CANCELLED không được kích hoạt lại.<br>b. Có buổi học bù tương lai: chưa đánh dấu hoàn thành.<br>c. Chạy tác vụ lặp không tạo thay đổi hoặc thông báo trùng. |
| Hậu điều kiện | Trạng thái vòng đời lưu trong DB phù hợp tiến độ thực tế. |

## C. Ghi danh khóa học

### UC-F2-19 — Xem danh mục và thông tin khóa học

| Mục | Nội dung |
|---|---|
| Tác nhân | Guest, Member |
| Mức ưu tiên | Required |
| Tiền điều kiện | Khóa được công bố. |
| Luồng chính | 1. Mở danh mục Classes & Packages.<br>2. Xem các khóa đang/sắp mở và trạng thái khả năng đăng ký.<br>3. Mở khóa để xem bộ môn, coach, học phí, lịch dự kiến và điều kiện.<br>4. Member xem lịch dự kiến cạnh lịch đã đăng ký/thuê sân.<br>5. Chọn đăng ký nếu đủ điều kiện. |
| Luồng thay thế / ngoại lệ | a. Guest chọn đăng ký: yêu cầu đăng nhập Member.<br>b. DRAFT không xuất hiện.<br>c. Đã đăng ký, đóng đăng ký hoặc hết chỗ: hiển thị rõ và không cho đăng ký lần hai.<br>d. Khóa đã bắt đầu còn chỗ: vẫn cho đăng ký, thẻ khóa hiện "đã học X/N buổi, còn Y buổi"; hết chỗ thì không vào được dù đã qua bao nhiêu buổi. |
| Hậu điều kiện | Người dùng có thông tin để quyết định; lịch xem trước không giữ chỗ. |

### UC-F2-20 — Xem đăng ký và lịch học cá nhân

| Mục | Nội dung |
|---|---|
| Tác nhân | Member |
| Mức ưu tiên | Required |
| Tiền điều kiện | Đã đăng nhập; chỉ xem dữ liệu thuộc tài khoản. |
| Luồng chính | 1. Mở My Schedule hoặc danh sách đăng ký.<br>2. Xem lớp, buổi học và lượt thuê đã xác nhận.<br>3. Chọn buổi để xem thời gian, địa điểm và thông tin liên quan.<br>4. Mở lộ trình khóa từ buổi học tương ứng khi có quyền.<br>Mở account menu → Billing → chi tiết hóa đơn → Download invoice để tải PDF có xác thực (tham chiếu thanh toán Flow 3). |
| Luồng thay thế / ngoại lệ | a. Không có lịch: hiển thị trống.<br>b. Lịch dự kiến phải phân biệt với lịch đã đăng ký.<br>c. Truy cập đăng ký hoặc bản ghi cá nhân của Member khác: từ chối.<br>d. Lớp Completed hoặc đã hết các buổi nhưng Enrollment vẫn Confirmed và EndedAt rỗng: Member tiếp tục xem lịch sử buổi, giáo án chung, homework/notice chung và bản ghi cá nhân của mình; không bắt buộc còn buổi tương lai.<br>e. Ghi danh đã kết thúc/không Confirmed hoặc lớp Cancelled/Draft: API Member sessions/teaching-records trả 403 class_access_ended. Lịch sử đăng ký/tài chính của chính mình vẫn được giữ; hóa đơn hoặc chuông/URL cũ không khôi phục quyền nội dung. |
| Hậu điều kiện | Lịch hiển thị dữ liệu thật; không thay đổi đăng ký. |

### UC-F2-21 — Đăng ký khóa học và giữ chỗ

| Mục | Nội dung |
|---|---|
| Tác nhân | Member |
| Mức ưu tiên | Required |
| Tiền điều kiện | Tài khoản ACTIVE; khóa PUBLISHED, còn mở, chưa học buổi đầu, còn chỗ; không trùng lịch/đăng ký. |
| Luồng chính | 1. Chọn khóa và đăng ký toàn khóa.<br>2. Hệ thống kiểm tra điều kiện và tạo SeatHold có TTL mặc định 15 phút.<br>3. Tạo hóa đơn lưu snapshot giá và checkout tương ứng.<br>4. Member thanh toán qua Flow 3.<br>5. Chỉ khi thanh toán được xác minh và fulfillment thành công, tạo đăng ký CONFIRMED.<br>6. Cập nhật số chỗ và gửi xác nhận. |
| Luồng thay thế / ngoại lệ | a. Hết chỗ hoặc trùng lịch: từ chối trước checkout.<br>b. Thanh toán lỗi/hủy: chưa tạo đăng ký xác nhận.<br>c. Không cần gói Gym để học lớp; mỗi Member không được đăng ký cùng khóa hai lần. |
| Hậu điều kiện | Có CONFIRMED khi hoàn tất; nếu chưa trả, chỉ có hold có hạn; ConfirmedCount ≤ ReservedCount ≤ Capacity. |

### UC-F2-22 — Ghi danh thay Member tại quầy

| Mục | Nội dung |
|---|---|
| Tác nhân | Receptionist |
| Mức ưu tiên | Required |
| Tiền điều kiện | Có quyền thao tác tại quầy; xác định Member ACTIVE và khóa hợp lệ. |
| Luồng chính | 1. Tìm và xác nhận Member hưởng dịch vụ.<br>2. Chọn khóa, kiểm tra lịch và chỗ.<br>3. Tạo checkout cho đúng Member, lưu nhân viên thực hiện riêng.<br>4. Thực hiện thanh toán theo Flow 3.<br>5. Sau xác minh, xác nhận đăng ký và gửi thông báo Member. |
| Luồng thay thế / ngoại lệ | a. Không dùng tài khoản nhân viên làm người hưởng dịch vụ.<br>b. Dùng điểm Member phải xác thực OTP theo Flow 3.<br>c. Không tự đặt trạng thái đã thanh toán; kiểm tra trùng đăng ký và lịch như tự đăng ký. |
| Hậu điều kiện | Đăng ký thuộc Member; audit ghi đúng người thao tác. |

### UC-F2-23 — Hủy checkout hoặc hết hạn giữ chỗ

| Mục | Nội dung |
|---|---|
| Tác nhân | Member, Receptionist, Hệ thống |
| Mức ưu tiên | Required |
| Tiền điều kiện | Có checkout/SeatHold chưa được fulfillment. |
| Luồng chính | 1. Người dùng hủy checkout hoặc tác vụ phát hiện quá TTL.<br>2. Kiểm tra trạng thái thanh toán hiện tại.<br>3. Đóng checkout phù hợp và giải phóng hold/điểm đang giữ.<br>4. Cập nhật số chỗ có thể đăng ký. |
| Luồng thay thế / ngoại lệ | a. Thanh toán đã xác minh: không coi là checkout chưa trả; xử lý fulfillment/hoàn theo nghiệp vụ.<br>b. Callback đến đồng thời: xử lý giao dịch nhất quán.<br>c. Chạy lặp không giải phóng hoặc hoàn điểm hai lần. |
| Hậu điều kiện | Không giữ chỗ vô thời hạn; số chỗ chính xác. |

### UC-F2-24 — Xử lý thanh toán đến sau khi hold hết hạn

| Mục | Nội dung |
|---|---|
| Tác nhân | Hệ thống; cổng thanh toán hỗ trợ |
| Mức ưu tiên | Required |
| Tiền điều kiện | Nhận kết quả thanh toán hợp lệ của checkout có hold đã hết hạn. |
| Luồng chính | 1. Xác minh kết quả theo Flow 3.<br>2. Kiểm tra lại khóa còn nhận đăng ký, chỗ và lịch Member.<br>3. Nếu hợp lệ, giữ lại chỗ và hoàn tất đăng ký.<br>4. Nếu không thể cung cấp dịch vụ, bù hoàn 100% khoản tiền đã xác minh bằng điểm.<br>5. Ghi kết quả FULFILLED hoặc COMPENSATED và thông báo. |
| Luồng thay thế / ngoại lệ | a. Return URL chưa được xác minh không đủ xác nhận trả tiền.<br>b. Callback lặp: trả kết quả cũ, không ghi danh/hoàn hai lần.<br>c. Không còn chỗ hoặc khóa đã đóng: không ép tạo đăng ký vượt sức chứa. |
| Hậu điều kiện | Khoản thanh toán được cấp dịch vụ hoặc bù hoàn, không bị bỏ lửng. |

### UC-F2-25 — Hủy đăng ký trước khi khóa bắt đầu

| Mục | Nội dung |
|---|---|
| Tác nhân | Member; Receptionist theo quyền |
| Mức ưu tiên | Required |
| Tiền điều kiện | Đăng ký CONFIRMED; buổi đầu chưa bắt đầu; người thao tác có quyền. |
| Luồng chính | 1. Mở đăng ký và chọn hủy.<br>2. Hệ thống tính khoảng cách đến buổi đầu.<br>3. Hiển thị số điểm hoàn theo giá trị đã thanh toán.<br>4. Xác nhận, hủy đăng ký và giải phóng chỗ.<br>5. Ghi hoàn điểm và thông báo trong cùng nghiệp vụ. |
| Luồng thay thế / ngoại lệ | a. Trước buổi đầu ít nhất 5 ngày: hoàn 100%; dưới 5 ngày: hoàn 50%.<br>b. Sau khi bắt đầu: không tự hoàn theo luồng này.<br>c. Hủy lặp không tăng điểm hai lần; thao tác thay phải có lý do/audit. |
| Hậu điều kiện | Đăng ký đã hủy; điểm và số chỗ cập nhật; hóa đơn giữ lịch sử. |

### UC-F2-26 — Gửi yêu cầu hoàn sau khi khóa bắt đầu

| Mục | Nội dung |
|---|---|
| Tác nhân | Member |
| Mức ưu tiên | Required |
| Tiền điều kiện | Khóa đã bắt đầu; Member có giao dịch/đăng ký thuộc mình. |
| Luồng chính | 1. Mở thông tin đăng ký.<br>2. Nhập lý do và gửi yêu cầu hoàn theo UC-16 của Flow 3.<br>3. Hệ thống lưu yêu cầu và chuyển Center Manager xem xét.<br>4. Member theo dõi kết quả xử lý. |
| Luồng thay thế / ngoại lệ | a. Không tự áp dụng mức hoàn trước khai giảng.<br>b. Yêu cầu trùng hoặc dữ liệu không thuộc Member: từ chối.<br>c. Không có quyền phê duyệt: chỉ xem/gửi yêu cầu. |
| Hậu điều kiện | Có yêu cầu chờ xét; chưa tự cộng điểm hoặc hủy dịch vụ khi chưa có quyết định. |

## D. Ngưỡng mở lớp và lựa chọn học viên

### UC-F2-27 — Cấu hình mốc kiểm tra ngưỡng mở lớp

| Mục | Nội dung |
|---|---|
| Tác nhân | Center Manager |
| Mức ưu tiên | Required |
| Tiền điều kiện | Có quyền cấu hình ngưỡng và thời hạn. |
| Luồng chính | 1. Chọn mốc kiểm tra trước ngày bắt đầu, mặc định 3 ngày.<br>2. Chọn thời gian phản hồi, mặc định 48 giờ.<br>3. Lưu cấu hình hợp lệ.<br>4. Hệ thống dùng cấu hình khi xét khóa và lập hạn phản hồi. |
| Luồng thay thế / ngoại lệ | a. Giá trị không hợp lệ: từ chối.<br>b. Không sửa ngầm hạn hoặc giá trị đã chốt của giao dịch cũ.<br>c. Ngưỡng số học viên dựa ceil(chi phí/học phí), không dựa SeatHold. |
| Hậu điều kiện | Có cấu hình xác định thời điểm xét và hạn lựa chọn. |

### UC-F2-28 — Tự động xét ngưỡng mở lớp

| Mục | Nội dung |
|---|---|
| Tác nhân | Hệ thống |
| Mức ưu tiên | Required |
| Tiền điều kiện | Khóa đến mốc kiểm tra và chưa có quyết định kết thúc. |
| Luồng chính | 1. Tính ngưỡng ceil(chi phí/học phí).<br>2. Đếm học viên CONFIRMED.<br>3. Đủ ngưỡng: ghi nhận đạt.<br>4. Thiếu ngưỡng: đánh dấu At Risk và tạo hạn phản hồi.<br>5. Thông báo Center Manager và từng Member bằng kênh phù hợp. |
| Luồng thay thế / ngoại lệ | a. SeatHold chưa trả không được tính.<br>b. Thông báo/tác vụ lặp không tạo yêu cầu phản hồi trùng.<br>c. Có người đăng ký thêm trong cửa sổ: cập nhật số lượng và bảo đảm người mới nhận lựa chọn cần thiết. |
| Hậu điều kiện | Trạng thái ngưỡng và hạn phản hồi được lưu, có lịch sử xử lý. |

### UC-F2-29 — Cho phép mở lớp dưới ngưỡng

| Mục | Nội dung |
|---|---|
| Tác nhân | Center Manager |
| Mức ưu tiên | Required |
| Tiền điều kiện | Khóa chưa bị hủy; đang cần quyết định về ngưỡng. |
| Luồng chính | 1. Xem số học viên, ngưỡng và ảnh hưởng.<br>2. Chọn cho phép vận hành dưới ngưỡng.<br>3. Nhập lý do.<br>4. Hệ thống lưu quyết định và audit. |
| Luồng thay thế / ngoại lệ | a. Thiếu lý do/quyền: từ chối.<br>b. Khóa đã hủy: không mở lại bằng miễn ngưỡng.<br>c. Quyết định không tự cộng/trừ điểm và không xóa lựa chọn đã thực hiện. |
| Hậu điều kiện | Khóa có quyết định miễn ngưỡng được lưu. |

### UC-F2-30 — Xem cảnh báo và phản hồi về lớp thiếu ngưỡng

| Mục | Nội dung |
|---|---|
| Tác nhân | Member |
| Mức ưu tiên | Required |
| Tiền điều kiện | Có đăng ký và phản hồi thuộc Member; trong hạn; khóa còn hoạt động. |
| Luồng chính | 1. Mở thông báo/email hoặc trang đăng ký.<br>2. Hệ thống xác thực tài khoản hoặc token phản hồi an toàn.<br>3. Hiển thị hạn và các lựa chọn chuyển lớp, hoàn điểm, chờ khóa tiếp theo.<br>4. Member chọn một hướng và xác nhận.<br>5. Hệ thống lưu quyết định theo luồng tương ứng. |
| Luồng thay thế / ngoại lệ | a. Token sai/hết hạn hoặc sai chủ sở hữu: từ chối.<br>b. Quá hạn: không nhận lựa chọn mới.<br>c. Lựa chọn đã hoàn tất không được thực hiện lần hai; lớp đạt ngưỡng sau đó không xóa quyền đã xử lý. |
| Hậu điều kiện | Lựa chọn có thể truy vết; không chỉ lưu trạng thái trên giao diện. |

### UC-F2-31 — Chuyển sang lớp bằng hoặc thấp giá hơn

| Mục | Nội dung |
|---|---|
| Tác nhân | Member |
| Mức ưu tiên | Required |
| Tiền điều kiện | Có quyền phản hồi; lớp đích cùng bộ môn, PUBLISHED, chưa bắt đầu, còn mở/chỗ và không trùng lịch. |
| Luồng chính | 1. Chọn lớp đích.<br>2. Hệ thống tính giá trị có thể chuyển theo chuỗi thanh toán thực tế.<br>3. Kiểm tra chỗ và lịch lần cuối.<br>4. Kết thúc đăng ký nguồn và tạo đăng ký đích trong một giao dịch.<br>5. Nếu giá đích thấp hơn, hoàn phần chênh bằng điểm.<br>6. Thông báo kết quả. |
| Luồng thay thế / ngoại lệ | a. Khác bộ môn/hết chỗ/trùng lịch: từ chối.<br>b. Không dùng giá danh mục mới thay giá trị đã trả.<br>c. Thao tác đồng thời hoặc lặp không tạo hai đăng ký/hoàn hai lần. |
| Hậu điều kiện | Member chuyển lớp thành công; khoản chênh và số chỗ nhất quán. |

### UC-F2-32 — Chuyển sang lớp cao giá hơn

| Mục | Nội dung |
|---|---|
| Tác nhân | Member |
| Mức ưu tiên | Required |
| Tiền điều kiện | Lớp đích hợp lệ; Member còn trong thời hạn lựa chọn. |
| Luồng chính | 1. Chọn lớp đích và xem tiền chênh lệch.<br>2. Tạo hold đích và hóa đơn phần chênh.<br>3. Giữ đăng ký nguồn trong lúc thanh toán.<br>4. Sau xác minh và fulfillment, chuyển đăng ký sang đích.<br>5. Giải phóng chỗ nguồn, ghi liên kết giao dịch và thông báo. |
| Luồng thay thế / ngoại lệ | a. Chưa thanh toán/checkout hết hạn: không mất đăng ký nguồn.<br>b. Lớp đích không còn hợp lệ lúc hoàn tất: xử lý bù hoàn theo Flow 3.<br>c. Không thu thêm toàn bộ học phí hoặc ghi nhận tiền chênh hai lần. |
| Hậu điều kiện | Chỉ chuyển lớp khi thanh toán phần chênh và cấp chỗ thành công. |

### UC-F2-33 — Nhận hoàn điểm khi lớp thiếu ngưỡng

| Mục | Nội dung |
|---|---|
| Tác nhân | Member |
| Mức ưu tiên | Required |
| Tiền điều kiện | Phản hồi hợp lệ và có giá trị thanh toán chưa được hoàn. |
| Luồng chính | 1. Chọn hoàn điểm.<br>2. Xem giá trị được hoàn.<br>3. Xác nhận lựa chọn.<br>4. Hệ thống hủy đăng ký và hoàn 100% giá trị còn được hoàn bằng điểm.<br>5. Ghi audit, kết thúc phản hồi và thông báo. |
| Luồng thay thế / ngoại lệ | a. Đã hoàn một phần do chuyển lớp: không hoàn vượt phần còn lại.<br>b. Phản hồi hết hạn/đã xử lý: từ chối hoặc trả kết quả cũ.<br>c. Lỗi ghi điểm: rollback hủy đăng ký để không mất quyền lợi. |
| Hậu điều kiện | Chỗ được giải phóng; ví điểm và quyết định được ghi nhất quán. |

### UC-F2-36 — Xử lý hết hạn phản hồi và kết luận mở lớp

Cập nhật M06 theo yêu cầu đã xác nhận: phải xét lớp Met/Waived trước khi hoàn; nếu đã được xác nhận mở thì giữ người chưa phản hồi. Chỉ hủy và hoàn người còn ghi danh khi hết hạn vẫn thiếu và không có miễn ngưỡng. Không cho lớp chưa được chốt tự khai giảng. Chi tiết [quy tắc 72–48–24 giờ](Class-Opening-Decision.md).

| Mục | Nội dung |
|---|---|
| Tác nhân | Hệ thống |
| Mức ưu tiên | Required |
| Tiền điều kiện | Cửa sổ phản hồi đã kết thúc; khóa chưa được kết luận. |
| Luồng chính | 1. Kiểm tra lớp đã đạt ngưỡng hoặc được miễn ngưỡng; nếu có thì giữ ghi danh, không tự hoàn người chưa phản hồi.<br>2. Nếu vẫn thiếu và không có miễn ngưỡng: hủy lớp, hoàn 100% phần còn được hoàn cho người còn ghi danh.<br>3. Giải phóng hold chuyển lớp và checkout/điểm giữ chưa thanh toán.<br>4. Gửi thông báo kết quả cho Member, Manager và HLV liên quan; thông báo cho Member nêu số điểm đã hoàn và tối đa 3 khóa tương đương (cùng môn, Published, đang mở, còn chỗ, chưa bắt đầu) tại thời điểm hủy. |
| Luồng thay thế / ngoại lệ | a. Không hoàn hai lần cho lựa chọn đã thực hiện.<br>b. Thanh toán đến muộn phải đi qua fulfillment/bù hoàn, không bỏ qua.<br>c. Lỗi một giao dịch không được để trạng thái đăng ký/điểm lệch nhau.<br>d. Không có khóa tương đương: thông báo chỉ nêu điểm hoàn. Gợi ý không được lưu hay gửi lại về sau. |
| Hậu điều kiện | Phản hồi hết hạn được kết thúc; khóa có kết luận; không còn hold không hợp lệ. |

## E. Lịch dạy và điểm danh

### UC-F2-37 — Xem lịch dạy và lớp phụ trách

| Mục | Nội dung |
|---|---|
| Tác nhân | Coach |
| Mức ưu tiên | Required |
| Tiền điều kiện | Coach ACTIVE; có phân công bộ môn phù hợp. |
| Luồng chính | 1. Mở Schedule hoặc Classes.<br>2. Xem các buổi thuộc phạm vi phụ trách theo thời gian.<br>3. Chọn buổi để xem lịch, phòng, lớp và học viên.<br>4. Coach chủ nhiệm mở thông tin cả khóa; Coach dạy thay chỉ mở buổi được giao. Nếu truy cập URL lớp dưới quyền dạy thay, hiện Substitute sessions để chọn buổi, không mở màn quản lý cả khóa. |
| Luồng thay thế / ngoại lệ | a. Coach chỉ thấy lớp Published/InProgress đang thuộc phân công chủ nhiệm hoặc buổi dạy thay hợp lệ.<br>b. Coach chủ nhiệm xem các buổi của lớp; Coach dạy thay chỉ xem buổi không Cancelled được giao mình.<br>c. Lớp Completed/Cancelled hoặc phân công không hợp lệ: không cấp quyền từ lịch sử quan hệ cũ. |
| Hậu điều kiện | Coach nắm lịch dạy thật; không thay đổi lịch. |

### UC-F2-38 — Xem danh sách học viên của lớp

| Mục | Nội dung |
|---|---|
| Tác nhân | Coach, Receptionist, Center Manager |
| Mức ưu tiên | Required |
| Tiền điều kiện | Có quyền xem lớp; coach đang phụ trách lớp tương ứng. |
| Luồng chính | 1. Chọn lớp cụ thể.<br>2. Hệ thống trả danh sách ghi danh hợp lệ của lớp.<br>3. Chọn học viên để xem thông tin cơ bản trong phạm vi cho phép.<br>4. Hiển thị nội dung theo đúng lớp và bộ môn đang chọn. |
| Luồng thay thế / ngoại lệ | a. Chỉ học viên Confirmed và EndedAt rỗng xuất hiện trong roster Coach; học viên thôi học không còn là học viên hiện tại.<br>b. Coach dạy thay phải truyền đúng sessionId cho GET members và records; thiếu buổi trả 403 session_scope_required, buổi sai lớp/khác HLV/đã Cancelled trả 403 session_not_assigned. Chỉ đọc roster và bản ghi buổi được giao; mục tiêu/kinh nghiệm/ghi chú sức khỏe bị lược bỏ, không trả PLAN cả khóa.<br>c. Phân công buổi không cấp quyền Students, Health profile, Learning history hoặc AI hồ sơ đầy đủ. |
| Hậu điều kiện | Danh sách đúng lớp và quyền truy cập; thông tin không bị lẫn giữa bộ môn. |

### UC-F2-39 — Ghi điểm danh buổi học

| Mục | Nội dung |
|---|---|
| Tác nhân | Coach được phân công, Receptionist |
| Mức ưu tiên | Required |
| Tiền điều kiện | Buổi học hợp lệ; học viên CONFIRMED; từ 5 phút trước giờ bắt đầu đến 24 giờ sau giờ kết thúc. |
| Luồng chính | 1. Mở buổi và danh sách điểm danh.<br>2. Chọn PRESENT hoặc ABSENT cho từng học viên.<br>3. Gửi kết quả.<br>4. Hệ thống kiểm tra quyền, thời gian máy chủ và đăng ký.<br>5. Lưu duy nhất một kết quả cho mỗi học viên/buổi và ghi người thao tác. |
| Luồng thay thế / ngoại lệ | a. Ngoài cửa sổ thời gian: từ chối.<br>b. Sai coach/lớp hoặc học viên chưa xác nhận: từ chối.<br>c. Không tự đánh PRESENT và không dùng điểm danh lớp cho lượt thuê sân. |
| Hậu điều kiện | Kết quả điểm danh lưu thật, có thời điểm và người ghi. |

### UC-F2-40 — Chỉnh sửa điểm danh trong cửa sổ cho phép

| Mục | Nội dung |
|---|---|
| Tác nhân | Coach được phân công, Receptionist |
| Mức ưu tiên | Required |
| Tiền điều kiện | Đã có điểm danh; còn trong cửa sổ đến 24 giờ sau khi buổi kết thúc. |
| Luồng chính | 1. Mở kết quả điểm danh đã lưu.<br>2. Đổi PRESENT/ABSENT khi cần.<br>3. Xác nhận lưu.<br>4. Hệ thống kiểm tra lại quyền và thời gian.<br>5. Cập nhật bản ghi hiện có, lưu audit thay đổi. |
| Luồng thay thế / ngoại lệ | a. Hết 24 giờ: khóa chỉnh sửa theo luồng này.<br>b. Không tạo bản điểm danh thứ hai cho cùng học viên/buổi.<br>c. Dữ liệu thay đổi đồng thời: tải lại và bảo đảm không ghi đè thiếu kiểm soát. |
| Hậu điều kiện | Kết quả được sửa trong thời hạn; giữ dấu vết trước và sau. |

## F. Yêu cầu điều chỉnh lịch của coach

### UC-F2-41 — Gửi yêu cầu vắng buổi học

| Mục | Nội dung |
|---|---|
| Tác nhân | Coach được phân công |
| Mức ưu tiên | Required |
| Tiền điều kiện | Buổi Scheduled của khóa hoạt động, bắt đầu sau ít nhất 6 giờ; Coach đang được phân công; chưa có PENDING cho buổi. |
| Luồng chính | 1. Mở Schedule → buổi → Request → Request absence.<br>2. Nhập Reason, 3–500 ký tự; không chọn phương án xử lý hay giờ mới.<br>3. Chọn Send request.<br>4. Hệ thống kiểm tra quyền, mốc 6 giờ và chống trùng.<br>5. Lưu ABSENCE/PENDING, snapshot buổi gốc và thông báo Center Manager. |
| Luồng thay thế / ngoại lệ | a. Dưới 6 giờ: khóa gửi, hướng dẫn liên hệ Manager trực tiếp; API trả class_absence_deadline.<br>b. Absence chứa giờ đề xuất: từ chối.<br>c. Yêu cầu trùng cùng buổi hoặc UUID có payload khác: từ chối; retry hợp lệ không tạo bản sao. |
| Hậu điều kiện | Có yêu cầu chờ xử lý; lịch gốc chưa bị thay đổi. |

### UC-F2-42 — Chặn sửa yêu cầu đã gửi

| Mục | Nội dung |
|---|---|
| Tác nhân | Coach gửi yêu cầu |
| Mức ưu tiên | Required |
| Tiền điều kiện | Có yêu cầu đã gửi, kể cả PENDING và còn trên 6 giờ trước buổi. |
| Luồng chính | 1. Coach mở Requests hoặc Schedule → buổi → Request.<br>2. Đọc lý do và trạng thái đã lưu, không có nút/form sửa.<br>3. Nếu cần hủy yêu cầu đang chờ, chọn Withdraw request và xác nhận theo UC-F2-43.<br>4. Backend không còn PUT cập nhật nội dung; lý do, loại, đề xuất và snapshot đã gửi giữ nguyên. |
| Luồng thay thế / ngoại lệ | a. PUT vào URL yêu cầu hợp lệ trả 405 Method Not Allowed, không đổi dữ liệu/thông báo.<br>b. Gửi lại cùng requestId nhưng nội dung khác bị chặn bởi idempotency.<br>c. Muốn gửi lý do khác: rút yêu cầu cũ rồi tạo mới với ID mới nếu còn đủ điều kiện gửi; không sửa bản cũ.<br>d. Manager đã xử lý trước thao tác rút: 409 class_change_not_pending, tải lại trạng thái. |
| Hậu điều kiện | Nội dung yêu cầu đã gửi bất biến; Coach chỉ rút được khi còn Pending. |

### UC-F2-43 — Rút yêu cầu điều chỉnh

| Mục | Nội dung |
|---|---|
| Tác nhân | Coach gửi yêu cầu |
| Mức ưu tiên | Required |
| Tiền điều kiện | Yêu cầu thuộc coach và ở PENDING. |
| Luồng chính | 1. Mở yêu cầu.<br>2. Chọn rút và xác nhận.<br>3. Hệ thống kiểm tra quyền và trạng thái hiện tại.<br>4. Chuyển WITHDRAWN, ghi lịch sử. |
| Luồng thay thế / ngoại lệ | a. Yêu cầu đã được xử lý đồng thời: trả trạng thái hiện tại.<br>b. Không rút yêu cầu của coach khác.<br>c. Rút không hoàn tác lịch đã được Manager phê duyệt. |
| Hậu điều kiện | Yêu cầu kết thúc ở WITHDRAWN; lịch gốc không đổi. |

### UC-F2-44 — Xem và theo dõi yêu cầu điều chỉnh

| Mục | Nội dung |
|---|---|
| Tác nhân | Coach, Center Manager |
| Mức ưu tiên | Required |
| Tiền điều kiện | Đã đăng nhập; coach xem yêu cầu của mình, Manager xem trong quyền quản lý. |
| Luồng chính | 1. Coach mở menu avatar/tên → Requests; Manager vào Activity calendar → Class change requests.<br>2. Xem yêu cầu, mới nhất trước.<br>3. Phân biệt trạng thái bằng nhãn/màu.<br>4. Xem lý do và phương án Manager quyết định; yêu cầu loại cũ vẫn hiển thị lịch sử.<br>Pending chỉ có Withdraw request; không có Edit pending request ở bất kỳ mốc thời gian nào. Request tự đóng hiển thị Closed automatically — schedule updated by Manager., không mô tả là Coach chủ động rút. |
| Luồng thay thế / ngoại lệ | a. Nhãn UI Pending/Approved/Rejected/Cancel tương ứng PENDING/RESOLVED/REJECTED/WITHDRAWN.<br>b. Không có yêu cầu: hiển thị trạng thái trống.<br>c. Không có quyền xem: từ chối; màu không thay thế nhãn chữ. |
| Hậu điều kiện | Người dùng biết tình trạng xử lý; thao tác xem không thay lịch. Request outcome dùng chung cho Requests và chi tiết buổi: đã xử lý hiển thị phương án thực tế, lịch sau xử lý, Coach, sân/phòng, người xử lý, thời điểm và lý do. Kết quả mới là snapshot tại thời điểm xử lý; yêu cầu cũ thiếu snapshot hiển thị lịch hiện tại với cảnh báo rõ. WITHDRAWN/SCHEDULE_UPDATED mang nhãn Closed để phân biệt Coach rút yêu cầu. |

### UC-F2-45 — Phê duyệt và thực hiện điều chỉnh

| Mục | Nội dung |
|---|---|
| Tác nhân | Center Manager |
| Mức ưu tiên | Required |
| Tiền điều kiện | Yêu cầu PENDING; buổi tương lai Scheduled; snapshot còn khớp. |
| Luồng chính | 1. Mở yêu cầu và kiểm tra ảnh hưởng.<br>2. Chọn phương án cuối cùng và ghi nhận xét 3–500 ký tự.<br>3. Chọn HLV Active, đúng môn, rảnh toàn khoảng giờ đang chọn; loại Coach xin vắng nếu dạy thay. Đổi giờ sẽ tải lại và bỏ lựa chọn cũ.<br>4. Khi Confirm decision, backend kiểm lại chuyên môn, giờ hoạt động, phòng, lịch HLV và học viên; thực hiện thay coach, dời lịch hoặc hủy kèm học bù nếu hợp lệ.<br>5. Cập nhật yêu cầu RESOLVED cùng lịch tài nguyên, audit và thông báo trong một giao dịch. |
| Luồng thay thế / ngoại lệ | a. Snapshot cũ: báo class_change_stale, không xử lý dựa trên lịch cũ.<br>b. Trùng lịch hoặc không có lịch bù hợp lệ: rollback, giữ PENDING.<br>c. Buổi đã diễn ra hoặc yêu cầu đã kết thúc: không phê duyệt.<br>Nếu Manager đã đổi buổi trực tiếp, request cũ đã tự đóng và không thể approve lại. Nếu approve hợp lệ từ request, trạng thái vẫn Approved/RESOLVED, không bị cơ chế tự đóng ghi đè. |
| Hậu điều kiện | Lịch thay đổi thành công; yêu cầu hiển thị Approved; các bên được thông báo. |

### UC-F2-46 — Từ chối yêu cầu điều chỉnh

| Mục | Nội dung |
|---|---|
| Tác nhân | Center Manager |
| Mức ưu tiên | Required |
| Tiền điều kiện | Yêu cầu ở PENDING. |
| Luồng chính | 1. Mở chi tiết.<br>2. Chọn từ chối.<br>3. Nhập lý do/nhận xét hợp lệ.<br>4. Hệ thống chuyển REJECTED và ghi audit.<br>5. Thông báo kết quả cho coach. |
| Luồng thay thế / ngoại lệ | a. Thiếu lý do hoặc không có quyền: từ chối thao tác.<br>b. Yêu cầu đã kết thúc: không xử lý lần hai.<br>c. Từ chối không thay lịch hoặc giải phóng tài nguyên. |
| Hậu điều kiện | Yêu cầu kết thúc và có lý do; lịch vẫn giữ nguyên. |

## G. Thuê sân thể thao

### UC-F2-47 — Xem ngày và khung giờ thuê sân

| Mục | Nội dung |
|---|---|
| Tác nhân | Guest, Member |
| Mức ưu tiên | Required |
| Tiền điều kiện | Bộ môn/sân cho thuê đang hoạt động. |
| Luồng chính | 1. Chọn bộ môn muốn thuê.<br>2. Xem lịch ngày theo giờ Việt Nam.<br>3. Chọn ngày để xem các sân và khung giờ.<br>4. Hiển thị AVAILABLE, BOOKED, HELD, SCHEDULED, BLOCKED, UNAVAILABLE hoặc NO_RATE.<br>5. Chỉ cho chọn khung khả dụng có bảng giá. |
| Luồng thay thế / ngoại lệ | a. Guest muốn đặt: yêu cầu đăng nhập Member.<br>b. Không hiển thị danh tính khách khác.<br>c. Khung đã có lớp/hold/khóa không được coi là trống; xem lịch không giữ chỗ. |
| Hậu điều kiện | Người dùng chọn được khung giờ phù hợp trên dữ liệu khả dụng. |

### UC-F2-48 — Đặt và thanh toán lượt thuê sân

| Mục | Nội dung |
|---|---|
| Tác nhân | Member |
| Mức ưu tiên | Required |
| Tiền điều kiện | Member ACTIVE; sân hợp môn; khung tương lai trống, có giá, trong giờ mở cửa. Mỗi lượt tối đa 4 giờ, đặt trước tối đa 30 ngày theo cấu hình (BR-128). |
| Luồng chính | 1. Chọn bộ môn, ngày, sân và khung giờ theo block 60 phút.<br>2. Hệ thống kiểm tra lại tài nguyên và lịch thuê của Member.<br>3. Tính giá từng block, lưu snapshot và tạo hold/checkout.<br>4. Thanh toán theo Flow 3.<br>5. Sau xác minh và fulfillment, tạo lượt thuê xác nhận.<br>6. Hiển thị thành công và gửi thông báo. |
| Luồng thay thế / ngoại lệ | a. Đặt chồng giờ của cùng Member hoặc sân đã bị chiếm: từ chối.<br>b. Không có giá cho đủ các block: không thanh toán.<br>c. Không yêu cầu gói Gym; thanh toán lỗi không tạo booking xác nhận; callback muộn dùng xử lý hold hết hạn. |
| Hậu điều kiện | Lượt thuê và giá thanh toán nhất quán; sân được chiếm chỗ đúng thời gian. |

### UC-F2-49 — Xem lượt thuê và chi tiết giá

| Mục | Nội dung |
|---|---|
| Tác nhân | Member |
| Mức ưu tiên | Required |
| Tiền điều kiện | Lượt thuê thuộc Member. |
| Luồng chính | 1. Mở My Schedule và chọn lượt thuê.<br>2. Xem sân, bộ môn, thời gian và trạng thái.<br>3. Xem giá theo từng block và tổng snapshot.<br>4. Chọn thao tác hủy khi đủ điều kiện hoặc quay lại lịch. |
| Luồng thay thế / ngoại lệ | a. Không xem dữ liệu thuê của người khác.<br>b. Giá hiện tại khác bảng giá lúc đặt: dùng snapshot giao dịch.<br>c. Không có lượt thuê: hiển thị trạng thái trống. |
| Hậu điều kiện | Member tra cứu được dịch vụ đã đặt và giá thực tế. |

### UC-F2-50 — Member hủy lượt thuê sân

| Mục | Nội dung |
|---|---|
| Tác nhân | Member |
| Mức ưu tiên | Required |
| Tiền điều kiện | Lượt thuê thuộc Member và đủ điều kiện hủy. |
| Luồng chính | 1. Mở lượt thuê, chọn hủy.<br>2. Hệ thống tính thời gian còn lại tới giờ bắt đầu.<br>3. Hiển thị số điểm được hoàn.<br>4. Member xác nhận.<br>5. Hủy lượt thuê, giải phóng sân, hoàn điểm nếu có và gửi thông báo. |
| Luồng thay thế / ngoại lệ | a. Hủy trước ít nhất 24 giờ: hoàn 100%; dưới 24 giờ: không hoàn.<br>b. Lượt đã hoàn tất hoặc trạng thái không cho hủy: từ chối.<br>c. Gửi lặp không hoàn hai lần; lỗi ghi điểm/booking phải rollback nhất quán. |
| Hậu điều kiện | Lượt thuê hủy; sân được giải phóng; ví cập nhật theo quy tắc. |

### UC-F2-51 — Trung tâm hủy lượt thuê sân

| Mục | Nội dung |
|---|---|
| Tác nhân | Center Manager |
| Mức ưu tiên | Required |
| Tiền điều kiện | Có quyền xử lý lượt thuê; có lý do từ phía trung tâm. |
| Luồng chính | 1. Mở lượt thuê bị ảnh hưởng.<br>2. Nhập lý do và xác nhận hủy.<br>3. Hệ thống tính giá trị còn được hoàn.<br>4. Hủy booking, giải phóng tài nguyên và hoàn 100% bằng điểm.<br>5. Ghi audit và thông báo Member. |
| Luồng thay thế / ngoại lệ | a. Không áp dụng mức 0% của hủy sát giờ bởi Member.<br>b. Đã hoàn trước đó: không hoàn vượt giá trị còn lại.<br>c. Xung đột trạng thái hoặc lỗi giao dịch: không để booking/điểm lệch. |
| Hậu điều kiện | Member được bù hoàn đúng; lịch và lịch sử có lý do trung tâm hủy. |

## H. Sự cố và thông báo vận hành

### UC-F2-52 — Xem trước ảnh hưởng sự cố

| Mục | Nội dung |
|---|---|
| Tác nhân | Center Manager |
| Mức ưu tiên | Required |
| Tiền điều kiện | Có quyền xử lý sự cố; phạm vi ROOM hoặc CENTER và thời gian hợp lệ. |
| Luồng chính | 1. Nhập phạm vi, khoảng thời gian và lý do.<br>2. Hệ thống liệt kê lớp, lượt thuê, khoảng khóa và quyền lợi Gym bị ảnh hưởng.<br>3. Hiển thị mục cản trở xử lý và phương án cần thực hiện.<br>4. Manager xem số tiền hoàn/ngày gia hạn dự kiến. |
| Luồng thay thế / ngoại lệ | a. Thời gian/phạm vi không hợp lệ: từ chối.<br>b. Xem trước không khóa lịch và chưa hủy/hoàn/gia hạn.<br>c. Có dữ liệu mới: kết quả cần kiểm tra lại khi xử lý thật. |
| Hậu điều kiện | Có danh sách ảnh hưởng để Manager quyết định; chưa thay đổi dữ liệu. |

### UC-F2-53 — Điều chỉnh lớp bị ảnh hưởng bởi sự cố

| Mục | Nội dung |
|---|---|
| Tác nhân | Center Manager |
| Mức ưu tiên | Required |
| Tiền điều kiện | Có kết quả xem trước và lớp bị ảnh hưởng. |
| Luồng chính | 1. Chọn từng buổi/lớp cần xử lý.<br>2. Dời lịch hoặc hủy kèm học bù bằng use case tương ứng.<br>3. Xử lý khoảng khóa thủ công gây cản trở nếu hợp lệ.<br>4. Chạy lại xem trước sự cố.<br>5. Chỉ tiếp tục khi không còn xung đột lớp chưa xử lý. |
| Luồng thay thế / ngoại lệ | a. Không âm thầm xóa buổi và làm thiếu số lesson.<br>b. Phương án trùng lịch/ngoài giờ: chọn lại.<br>c. Còn lớp cản trở: không cho resolve sự cố. |
| Hậu điều kiện | Các lớp được xử lý theo quy tắc; preview mới phản ánh ảnh hưởng còn lại.<br>Các thao tác dời/đổi HLV/hủy kèm bù do sự cố dùng cùng dịch vụ lịch: đóng request Pending và queue thông báo cho HLV. Incident workflow yêu cầu xử lý buổi bị ảnh hưởng trước khi đóng sự cố; không tự suy ra rằng chỉ tạo sự cố sẽ đổi lịch. |

### UC-F2-54 — Xử lý và đóng sự cố

| Mục | Nội dung |
|---|---|
| Tác nhân | Center Manager |
| Mức ưu tiên | Required |
| Tiền điều kiện | Preview hợp lệ; các xung đột lớp đã xử lý; có phương án cuối cùng. |
| Luồng chính | 1. Xác nhận phạm vi, thời gian và lý do.<br>2. Hệ thống kiểm tra lại dữ liệu trong giao dịch.<br>3. Tạo khóa tài nguyên theo sự cố.<br>4. Hủy các lượt thuê bị ảnh hưởng và hoàn 100% bằng điểm.<br>5. Thực hiện quyền lợi Gym nếu áp dụng, ghi audit và outbox.<br>6. Thông báo các bên và lưu kết quả xử lý. |
| Luồng thay thế / ngoại lệ | a. Dữ liệu thay đổi sau preview: báo xung đột và xem lại.<br>b. Còn lớp xung đột: từ chối resolve.<br>c. Lỗi một bước: rollback; xử lý lặp không hủy/hoàn/gia hạn hai lần. |
| Hậu điều kiện | Sự cố được xử lý nhất quán; không còn hoạt động mâu thuẫn trong khoảng khóa. |

### UC-F2-55 — Gia hạn Gym do đóng cửa trung tâm

| Mục | Nội dung |
|---|---|
| Tác nhân | Center Manager; Hệ thống |
| Mức ưu tiên | Required |
| Tiền điều kiện | Sự cố đóng cửa Gym; membership ACTIVE bị ảnh hưởng. |
| Luồng chính | 1. Xác định gói Gym và khoảng quyền lợi bị ảnh hưởng.<br>2. Manager xác nhận số ngày gia hạn hợp lệ.<br>3. Hệ thống cộng ngày vào hạn gói.<br>4. Dời mốc gói gia hạn chưa bắt đầu để không chồng quyền lợi.<br>5. Ghi lý do và thông báo Member. |
| Luồng thay thế / ngoại lệ | a. Day pass không được gia hạn theo quy tắc gói.<br>b. Gói đã hết hạn không tự được kéo dài.<br>c. Không dùng đóng cửa tạm thời để tự hoàn tiền Gym; không gia hạn hai lần cùng sự cố. |
| Hậu điều kiện | Thời hạn quyền lợi Gym được điều chỉnh; nghiệp vụ mua gói thuộc Flow 1. |

### UC-F2-56 — Gửi thông báo vận hành có mục tiêu

| Mục | Nội dung |
|---|---|
| Tác nhân | Center Manager; Hệ thống |
| Mức ưu tiên | Required |
| Tiền điều kiện | Có sự kiện/thông báo hợp lệ và nhóm người nhận trong quyền quản lý. |
| Luồng chính | 1. Chọn lớp, coach, người thuê sân hoặc nhóm Gym bị ảnh hưởng.<br>2. Soạn nội dung và kiểm tra người nhận.<br>3. Lưu thông báo, người nhận và audit.<br>4. Tạo in-app/email qua outbox.<br>5. Hệ thống gửi và retry khi lỗi. |
| Luồng thay thế / ngoại lệ | a. Không gửi lộ email người nhận qua CC tập thể.<br>b. Không mở rộng người nhận ngoài phạm vi sự kiện/quyền.<br>c. Gửi mail thất bại không hoàn tác lịch/hoàn điểm; không coi đã gửi thành công trước xác nhận SMTP. |
| Hậu điều kiện | Thông báo có lịch sử, người nhận đúng và trạng thái gửi có thể theo dõi. |

### UC-F2-57 — Nhận và đọc thông báo lịch cá nhân

| Mục | Nội dung |
|---|---|
| Tác nhân | Member, Coach, Center Manager |
| Mức ưu tiên | Required |
| Tiền điều kiện | Đã đăng nhập; thông báo thuộc người dùng. |
| Luồng chính | 1. Mở chuông Notifications của tài khoản đăng nhập.<br>2. Đọc thông báo đăng ký, đổi/hủy buổi, đổi HLV, yêu cầu/sự cố; Member còn nhận nhắc lịch và tin đợt lớp mới phù hợp.<br>3. Chọn View session / View class / View request outcome hoặc hành động tương ứng; đích đến kiểm tra quyền lại.<br>4. Đánh dấu từng thông báo hoặc Mark all read rồi reload badge/danh sách. |
| Luồng thay thế / ngoại lệ | a. Không đọc hoặc sửa thông báo của tài khoản khác.<br>b. Đánh dấu in-app đã đọc không làm đổi trạng thái gửi email/OTP.<br>c. Đường dẫn chi tiết phải kiểm tra quyền; đối tượng bị hủy vẫn hiển thị lịch sử hợp lệ. |
| Hậu điều kiện | Trạng thái đọc in-app được lưu riêng với email; người nhận xem đúng dữ liệu hiện còn quyền. Nhắc lịch xem UC-F2-58; tự đóng yêu cầu xem UC-F2-59. |

## I. Nhắc lịch và đồng bộ thay đổi

### UC-F2-58 — Member nhận nhắc lịch trước buổi học

| Mục | Nội dung |
|---|---|
| Tác nhân | Tác vụ hệ thống khởi phát; Member nhận |
| Mức ưu tiên | Required |
| Tiền điều kiện | Member đang Confirmed, chưa EndedAt; lớp Published/InProgress; buổi Scheduled tương lai. Member đã đăng ký trước mốc nhắc tương ứng. |
| Luồng chính | 1. Job mỗi phút tìm buổi trong cửa sổ trước 24 giờ hoặc trước 1 giờ.<br>2. Kiểm tra ghi danh, trạng thái buổi và receipt chống trùng theo session/member/start/window.<br>3. Tạo thông báo Upcoming lesson gồm lớp, ngày giờ Việt Nam và phòng/sân.<br>4. Member mở Notifications → View session để xem lớp trong My schedule. |
| Luồng thay thế / ngoại lệ | a. Buổi hủy, đã bắt đầu, ghi danh kết thúc: không nhắc mới.<br>b. Đăng ký sau mốc 24 giờ: không gửi bù mốc đó; vẫn xét 1 giờ nếu đủ điều kiện.<br>c. Đổi lịch tạo định danh nhắc theo giờ mới; restart/nhiều replica không nhân đôi một receipt.<br>d. Mất quyền khi mở link: chặn nội dung, không phục hồi quyền từ thông báo cũ. |
| Hậu điều kiện | Một receipt và thông báo in-app cho mỗi mốc hợp lệ; lịch/đăng ký không bị thay đổi. |

### UC-F2-59 — Tự đóng yêu cầu chờ khi Manager đổi lịch trực tiếp

| Mục | Nội dung |
|---|---|
| Tác nhân | Center Manager khởi phát; Coach nhận kết quả |
| Mức ưu tiên | Required |
| Tiền điều kiện | Có request Pending trên buổi; Manager thực hiện reschedule, đổi HLV, cancel-with-makeup hoặc hủy khóa bằng lệnh nghiệp vụ hợp lệ. |
| Luồng chính | 1. Manager thay đổi lịch trực tiếp, có thể để xử lý sự cố.<br>2. Hệ thống kiểm tra xung đột và giữ các khóa transaction cần thiết.<br>3. Sau khi thay đổi hợp lệ, tự đóng request Pending thành WITHDRAWN, resolutionType SCHEDULE_UPDATED; ghi Manager, thời gian, lý do và buổi kết quả.<br>4. Queue thông báo kết quả cho người gửi và thông báo lịch cho HLV chủ nhiệm/cũ/mới.<br>5. Coach mở Requests, đọc Closed automatically — schedule updated by Manager. và xem lịch cập nhật. |
| Luồng thay thế / ngoại lệ | a. Xung đột lịch hoặc lỗi transaction: giữ lịch và request Pending; không tạo thông báo thành công.<br>b. Phê duyệt từ chính request: giữ RESOLVED, không bị tự đóng ghi đè.<br>c. Xác nhận rút đang mở: nếu Manager đã xử lý trước, rút bị từ chối và UI tải trạng thái mới. |
| Hậu điều kiện | Lịch, trạng thái request, audit và thông báo commit đồng thời. Request đã đóng không được sửa/duyệt lại. |
