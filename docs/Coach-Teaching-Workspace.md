# Không gian giảng dạy Coach lớp nhóm

Phạm vi được chủ sản phẩm xác nhận: triển khai giao diện **và API lưu thật** cho Coach cầu lông/bóng rổ. Đây là phần mở rộng của thiết kế trước đây chỉ cho Coach xem lớp; quyền PT vẫn dựa trên qualification PT.

## Điều hướng

- **Lịch dạy**: mặc định vào lịch tuần, chọn buổi mở ngăn chi tiết ngay trên trang. Các tab: Giáo án, Điểm danh & kết quả, Sau buổi học, Đổi lịch. Tab Đổi lịch cho gửi/rút yêu cầu đến Manager, không tự hủy buổi. Chi tiết: [Yêu cầu thay đổi buổi học](Class-Session-Change-Requests.md).
- **Lớp phụ trách**: xem học viên, mục tiêu, lịch các buổi; giáo án chung/cá nhân; giao bài tập và gửi thông báo.
- **Học viên**: chọn lớp, tìm theo tên/email, xem hồ sơ, mục tiêu, điểm danh, lịch sử đánh giá và kế hoạch cá nhân.

Các trang PT giữ nguyên luồng hiện có. Bookmark `/coach` và `/coach/attendance` của Coach lớp nhóm mở lịch dạy mới.

## Dữ liệu và quyền

Migration `AddClassTeachingWorkspace` thêm `class_teaching_records`; không chuyển giáo án lớp nhóm sang bảng WorkoutPlan của PT. Có bốn loại: `PLAN`, `RESULT`, `NOTICE`, `HOMEWORK`.

- Mỗi nội dung có lớp, coach tạo, buổi học/học viên tùy chọn, tiêu đề, nội dung, timestamps và version.
- Coach chỉ đọc lớp được giao; nội dung toàn khóa chỉ coach phụ trách lớp được ghi. Nội dung một buổi chỉ coach được phân công buổi đó được ghi.
- Kết quả yêu cầu học viên đang ghi danh và buổi thuộc lớp; chỉ ghi từ giờ bắt đầu buổi. Đánh giá kỹ năng 1–5 là tùy chọn, một kết quả cho mỗi cặp buổi/học viên; chỉnh sửa dùng version.
- Điểm danh chỉ cho học viên Confirmed trong buổi được giao, từ 5 phút trước giờ bắt đầu đến 24 giờ sau khi kết thúc. Receptionist vẫn sử dụng endpoint hiện hữu; Coach sử dụng endpoint mới có kiểm tra assignment ở service.
- PT dùng cùng cửa sổ thời gian cho Present/Absent. Tự chốt NoShow chỉ chạy sau hạn 24 giờ. Điểm danh sớm giữ occupancy phòng/coach tới hết khung giờ đặt, tránh mở lại chỗ đang sử dụng.
- Coach được sửa PT Present ↔ Absent trong cửa sổ này; chỉ lần điểm danh đầu tiên chuyển quota từ reserved sang consumed. Chỉnh sửa ghi audit `CORRECT_PT_ATTENDANCE`, không trừ thêm lượt; lịch và hồ sơ kết quả vẫn được giữ lại.

### PT: danh sách học viên và sức khỏe

- `GET /api/coaches/me/students?search=&health=all&page=1`: tìm tên/email trên toàn bộ học viên có relationship Active của PT đang đăng nhập, phân trang 12 học viên. `health=notes` lọc lưu ý sức khỏe, `health=missing` lọc chưa khai hồ sơ tập luyện. Các member được gộp theo ID.
- `GET /api/coaches/me/students/{memberId}/health-profile`: kiểm tra qualification PT và relationship Active trước khi trả hồ sơ tập luyện cùng kết quả BMI. Không cấp quyền sửa số đo; chỉ số chưa đo không được tự suy đoán.
- Desktop dùng danh sách/hồ sơ song song; mobile dùng Drawer. Hồ sơ có ba tab Sức khỏe, Kế hoạch, Lịch sử; thao tác cập nhật tải lại cả danh sách và hồ sơ đang xem.
- Điều hướng PT chỉ còn Lịch PT và Hội viên phụ trách, hiển thị trực tiếp cả desktop/mobile. Tab Kế hoạch trong hồ sơ hỗ trợ tạo, AI gợi ý, sửa, áp dụng và lưu trữ; kế hoạch lưu trữ thu gọn, chỉ đọc. Chuẩn bị từng buổi vẫn nằm trong Schedule.
- `/coach/training-plans` và `/coach/ai-suggestions` chuyển về `/coach/members`; nếu có `memberId`, mở đúng hồ sơ ở tab Kế hoạch. Không cần vào trang Training riêng. Đổi tab/học viên, đóng hồ sơ hoặc cập nhật phải xác nhận nếu form có thay đổi chưa lưu.
- Thông báo/bài tập đã gửi không sửa; gửi mới tạo thông báo trong hệ thống cho học viên Confirmed, trong cùng transaction. Không tự gửi email.
- UUID do client tạo giúp POST retry không tạo trùng nội dung/thông báo; PUT khác version trả 409. API ghi audit cho thao tác tạo/sửa.
- Member chỉ xem nội dung chung và nội dung cá nhân của mình trong lớp đã ghi danh, tại Schedule → chi tiết lớp. Thông báo liên kết tới trang này.

## Hợp đồng API

| Method | Route | Phạm vi |
|---|---|---|
| GET | `/api/coaches/me/teaching/classes/{classId}/members` | Học viên Confirmed, mục tiêu/trình độ, số lần có mặt/vắng |
| GET | `/api/coaches/me/teaching/classes/{classId}/records?page=1` | Paged, 100 mục/trang, mới nhất trước |
| POST | `/api/coaches/me/teaching/classes/{classId}/records` | Tạo nội dung, retry idempotent |
| PUT | `/api/coaches/me/teaching/classes/{classId}/records/{recordId}` | Sửa PLAN/RESULT của chính coach, kiểm version |
| PUT | `/api/coaches/me/teaching/sessions/{sessionId}/attendance/{enrollmentId}` | `{status: PRESENT hoặc ABSENT}`, đúng coach của buổi |
| POST | `/api/coaches/me/teaching/classes/{classId}/suggestion` | `{memberId?, goal, level, language}` → `{content, provider, model}` |
| GET | `/api/members/me/classes/{classId}/teaching-records?page=1` | Member đã ghi danh, nội dung chung hoặc cá nhân của chính mình |

Body ghi: `recordId`, `kind`, `title` (160 ký tự), `content` (8.000 ký tự), `sessionId?`, `memberId?`, `score?`, `dueAtUtc?`, `version`. Hạn bài tập phải là thời điểm UTC trong tương lai. UI nhập theo giờ Việt Nam.

## AI và vận hành

Gợi ý dùng provider Gemini hiện có, lấy môn, mục tiêu/trình độ, điểm danh và 12 kết quả gần nhất. Context không chứa tên/email. Coach xem bản gợi ý, chọn dùng và chỉnh sửa trước khi lưu; AI không tự xuất bản giáo án.

Backend cần `Gemini:ApiKey` (biến môi trường `Gemini__ApiKey`). Khi chưa cấu hình, API trả lỗi của provider và UI hiển thị lỗi, vẫn cho phép soạn giáo án thủ công.

Backend Development tự áp dụng migration khi khởi động lại. Production áp dụng migration theo quy trình deploy hiện hữu. Server đang chạy từ bản build cũ cần được khởi động lại để nhận endpoint mới.

## Seed giao diện Coach

Chạy từ thư mục `backend/SportHub.API`:

```powershell
dotnet run -c Release --no-launch-profile -- --environment=Development --seed-coach-teaching=true
```

Lệnh chỉ chạy trên database local trong Development, áp dụng migration rồi thêm dữ liệu demo riêng cho `coach.caulong@sporthub.vn` và `coach.bongro@sporthub.vn`: mỗi coach hai lớp, mỗi lớp sáu buổi và ba học viên. Lịch có buổi đã học, hôm nay và sắp tới; có giáo án chung/từng buổi/cá nhân, điểm danh, kết quả, nhận xét, bài tập và thông báo. Học viên demo gồm An, Bình, Chi, Dũng, Giang và Linh.

Mật khẩu mặc định khi tạo tài khoản demo mới: `Sporthub@123`. Lệnh giữ nguyên mật khẩu, trạng thái và mục tiêu của tài khoản đã tồn tại. Lịch kiểm tra xung đột sân, coach và học viên trước khi ghi. Invoice demo là lịch sử thanh toán giả, không gọi cổng thanh toán. Nội dung thông báo mẫu chỉ lưu vào feed, không gửi email hay tạo thông báo ra ngoài.

Mã lớp có tiền tố `DEMO-TEACHING-YYYYMMDD`. Chạy lại cùng ngày Việt Nam không thêm trùng; chạy ngày khác tạo bộ demo mới. Nếu `DataProtection:KeysPath` trong cấu hình trỏ tới thư mục Docker, truyền `--DataProtection:KeysPath=<thư mục local có quyền ghi>` khi chạy trên Windows.
