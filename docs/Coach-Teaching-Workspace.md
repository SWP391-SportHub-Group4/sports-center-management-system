# Không gian giảng dạy Coach lớp nhóm

Phạm vi được chủ sản phẩm xác nhận: triển khai giao diện **và API lưu thật** cho Coach cầu lông/bóng rổ. Đây là phần mở rộng của thiết kế trước đây chỉ cho Coach xem lớp.

**Đối chiếu quyền ghi 18/10/2026, commit `08728587`:** kiểm tra assignment đầu service không tự cấp quyền cấp cả khóa. `SaveAsync` kiểm thêm session/Coach ở mỗi POST/PUT; xem quy tắc dưới đây và [API contract](api-contract.md). Tài liệu không xác nhận các ca mới đã chạy.

## Điều hướng

- **Schedule**: chọn buổi mở ngăn chi tiết rộng 760px trên desktop; mobile vừa màn hình. Các tab: Plan, Attendance, Homework, Request. Tab xuống hàng khi cần, không phải kéo ngang. Record nằm trong Attendance. Request cho gửi/rút yêu cầu đến Manager, không tự hủy buổi. Yêu cầu đã gửi chỉ đọc, không sửa; Pending có thể rút. Form tạo mới chỉ nhập Reason; Manager chọn phương án. Chi tiết: [Yêu cầu vắng buổi học](Class-Session-Change-Requests.md).
- **Lớp học**: trang chi tiết toàn màn hình gồm Học viên / Students, Giáo án / Plans, Thông báo / Notices; gửi thông báo chung tại đây. Giao bài tập được thực hiện trong chi tiết buổi học đã kết thúc.
- **HLV dạy thay**: mở buổi được giao từ Schedule. Khi truy cập URL chi tiết lớp, giao diện chỉ hiện **Substitute sessions** và nút mở từng buổi được giao, không mở màn quản lý cả khóa. Trong buổi chỉ có Plan / Attendance / Homework / Request; không có liên kết xem lộ trình cả khóa, hồ sơ sức khỏe hay lịch sử học viên. Trình soạn chỉ chọn được buổi đang mở. Khi mất phân công, API chặn ngay các request tiếp theo; nội dung đang mở được kiểm tra lại khi quay lại tab và mỗi 30 giây.
- **Học viên**: danh sách gộp từ các lớp Published/InProgress đang phân công; mỗi học viên xuất hiện một lần. Tìm tên/email, lọc môn, mở hồ sơ toàn màn hình `/coach/members/{memberId}`. Trong hồ sơ chọn môn và lớp; lớp duy nhất được chọn tự động. Kế hoạch cá nhân cố định học viên/lớp; giáo án chung chỉ đọc trong hồ sơ học viên.

### Bàn giao tiến độ cùng môn

- Tab **Đánh giá từ lớp trước** chỉ trả `RESULT` của chính học viên từ các lớp cùng môn có ngày bắt đầu không sau lớp hiện tại; không trộn môn khác, không trả kế hoạch/nhận xét của học viên khác.
- Quyền đọc yêu cầu coach chính đang phụ trách một lớp Published/InProgress mà học viên còn ghi danh Confirmed. Coach dạy thay chỉ được xem buổi được giao, không được mở hồ sơ sức khỏe hoặc lịch sử lớp trước. Phân công cũ hoặc quan hệ Coach–Member còn Active không tự cấp quyền đọc.
- Mỗi đánh giá giữ tên lớp, số/ngày buổi, coach ghi nhận, điểm kỹ năng, nội dung và thời điểm ghi/cập nhật. Sắp xếp mới nhất trước, 20 mục/trang. Không có thao tác sửa dữ liệu lịch sử; API ghi vẫn kiểm tra tác giả/lớp.
- Khi có nhiều lớp, lịch sử dùng danh sách lớp riêng có tìm tên, phân trang 8 lớp/trang và sắp xếp theo đánh giá gần nhất. Mỗi lớp có số đánh giá, điểm trung bình (chỉ tính bản ghi có điểm) và ngày ghi nhận gần nhất. Chọn lớp chỉ tải đánh giá của lớp đó; từng nhận xét thu gọn, mở riêng từng buổi. Điểm trung bình là thống kê mô tả, không phải điểm tiến bộ do AI suy diễn.
- Không thay đổi schema, không cần migration mới cho tính năng này.

Bookmark `/coach` và `/coach/attendance` mở lịch dạy.

## Dữ liệu và quyền

Migration `AddClassTeachingWorkspace` thêm `class_teaching_records`; giáo án lớp nhóm không dùng bảng WorkoutPlan. Có bốn loại: `PLAN`, `RESULT`, `NOTICE`, `HOMEWORK`.

- Mỗi nội dung có lớp, coach tạo, buổi học/học viên tùy chọn, tiêu đề, nội dung, timestamps và version.
- Coach chỉ đọc lớp được giao; nội dung toàn khóa chỉ coach phụ trách lớp được ghi. Nội dung một buổi chỉ coach được phân công buổi đó được ghi.
- Quy tắc POST/PUT tại `ClassTeachingService.SaveAsync`: có `sessionId` thì buổi phải thuộc lớp, chưa Cancelled và `session.CoachId` bằng Coach đang ghi; sai Coach trả 403 `session_not_assigned`, sai lớp trả 400 `session_not_in_class`, buổi đã hủy trả 409 `session_cancelled`. Không có hoặc null `sessionId` thì phải là Coach chủ nhiệm (`class.CoachId`); HLV dạy thay trả 403 `class_plan_not_assigned`. Quy tắc này chặn PLAN/NOTICE cấp cả khóa, kể cả PLAN cá nhân có `memberId`. Quyền ghi theo buổi không đồng nghĩa có quyền Students/Classes cấp toàn lớp. PUT vẫn kiểm tác giả, version và không cho đổi scope bản ghi đã lưu.
- Kết quả yêu cầu học viên đang ghi danh và buổi thuộc lớp; chỉ ghi từ giờ bắt đầu buổi. Đánh giá kỹ năng 1–5 là tùy chọn, một kết quả cho mỗi cặp buổi/học viên; chỉnh sửa dùng version.
- Khi tạo kết quả cá nhân (`RESULT`), hệ thống tạo thông báo InApp `ClassTeachingUpdated` cho đúng học viên được đánh giá, cùng transaction với bản ghi. Chuông hiển thị thông báo đánh giá mới, nhấn mở `/member/schedule?course={classId}` để xem Assessment trong From your coach. POST retry không tạo thêm thông báo; sửa bản đánh giá hiện có không gửi thông báo mới. Không gửi email và không thông báo cho cả lớp.
- Bài tập (`HOMEWORK`) bắt buộc gắn với một buổi đã kết thúc, không bị hủy và do coach phụ trách; cho cả lớp hoặc từng học viên. Không giao trước cho buổi tương lai, không có nhánh bài tập toàn khóa. Frontend vô hiệu nút trước `endAtUtc`, backend trả `homework_not_open`; thiếu buổi trả `homework_session_required`. Bài tập là ôn luyện không bắt buộc, khuyến nghị hoàn thành trước buổi học tiếp theo. Không có ô due date, không lưu hạn nộp cứng và không có trạng thái quá hạn. Backend chuẩn hóa `dueAtUtc` thành null cho HOMEWORK kể cả client cũ có gửi giá trị; hạn nộp của bài tập cũ không còn hiển thị. Bài tập vẫn thuộc buổi vừa học, không được gắn sang buổi kế tiếp.
- Điểm danh chỉ cho học viên Confirmed trong buổi được giao, từ 5 phút trước giờ bắt đầu đến 24 giờ sau khi kết thúc. Receptionist vẫn sử dụng endpoint hiện hữu; Coach sử dụng endpoint mới có kiểm tra assignment ở service.

### Danh sách học viên và sức khỏe

- `GET /api/coaches/me/students?search=&health=all&page=1`: tìm tên/email trong phạm vi lớp Published/InProgress mà Coach đang chủ nhiệm và Member còn Confirmed, phân trang 12 học viên. Relationship Active lưu từ trước không tự cấp quyền; chỉ dạy thay không mở directory. `health=notes` lọc lưu ý sức khỏe, `health=missing` lọc chưa khai hồ sơ tập luyện. Các member được gộp theo ID.
- `GET /api/coaches/me/students/{memberId}/health-profile`: kiểm tra phân công chủ nhiệm và ghi danh hiện hành trước khi trả hồ sơ sức khỏe do hội viên tự khai (mục tiêu, BMI, mức vận động, lịch tập, chế độ ăn, chấn thương). Relationship Active riêng lẻ hoặc phân công dạy thay không đủ quyền. Không cấp quyền sửa; trường hội viên chưa khai không được tự suy đoán. Lịch đo BMI tại trung tâm đã bỏ.
- Desktop dùng danh sách/hồ sơ song song; mobile dùng Drawer. Hồ sơ có ba tab Sức khỏe, Kế hoạch, Lịch sử; thao tác cập nhật tải lại cả danh sách và hồ sơ đang xem.
- Điều hướng Coach gồm Lịch dạy, Lớp phụ trách và Học viên. Tab Kế hoạch trong hồ sơ hỗ trợ tạo, AI gợi ý, sửa, áp dụng và lưu trữ; kế hoạch lưu trữ thu gọn, chỉ đọc. Đổi tab/học viên, đóng hồ sơ hoặc cập nhật phải xác nhận nếu form có thay đổi chưa lưu.
- Thông báo/bài tập đã gửi không sửa; gửi mới tạo thông báo trong hệ thống cho học viên Confirmed, trong cùng transaction. Riêng `HOMEWORK` còn tạo email cho đúng học viên được chọn hoặc cả lớp, dùng email tài khoản đã đăng ký; không gửi CC chung. Email gồm lớp, số buổi, tiêu đề, nội dung, ghi chú “Aim to complete before the next lesson — optional” và hướng dẫn mở My Schedule. Nội dung quá dài sau HTML encoding được rút gọn trong email để đáp ứng giới hạn outbox; bản đầy đủ vẫn nằm trong hệ thống. `NOTICE` và `RESULT` chỉ thông báo qua chuông.
- Email homework dùng `ClassTeachingUpdated` và `recordId` làm nguồn, payload được mã hóa, lưu cùng transaction và gửi bằng EmailDispatchService hiện có. POST retry không thêm email; SMTP lỗi được thử lại theo cơ chế outbox. Cần cấu hình SMTP thật để email đến hộp thư; chế độ demo chỉ ghi log.

- UUID do client tạo giúp POST retry không tạo trùng nội dung/thông báo; PUT khác version trả 409. API ghi audit cho thao tác tạo/sửa.
- Member chỉ xem nội dung chung và nội dung cá nhân của mình trong lớp đã ghi danh, tại Schedule → chi tiết lớp. Thông báo liên kết tới trang này.

## Hợp đồng API

| Method | Route | Phạm vi |
|---|---|---|
| GET | `/api/coaches/me/teaching/students?page=1&search=&sportId=` | Danh sách học viên duy nhất từ phân công hiện tại, 12 mục/trang; gồm lớp/môn tương ứng và danh sách môn để lọc |
| GET | `/api/coaches/me/teaching/students/{memberId}` | Danh tính và các lớp hiện tại của học viên trong phạm vi coach; 403 nếu không còn phân công |
| GET | `/api/coaches/me/teaching/students/{memberId}/history?classId=&page=1` | Đánh giá cùng môn từ lớp trước, chỉ đọc, 20 mục/trang; quyền dựa trên lớp hiện tại |
| GET | `/api/coaches/me/teaching/students/{memberId}/history/classes?classId=&page=1&search=` | Nhóm lớp từ toàn bộ lịch sử hợp lệ; 8 lớp/trang, số đánh giá, điểm trung bình và ngày đánh giá gần nhất |
| GET | `/api/coaches/me/teaching/classes/{classId}/members?memberId=&sessionId=` | Coach chính: học viên Confirmed và hồ sơ tóm tắt. Coach dạy thay: bắt buộc sessionId được giao, không trả mục tiêu/trình độ/ghi chú sức khỏe; điểm danh chỉ của buổi đó |
| GET | `/api/coaches/me/teaching/classes/{classId}/records?page=1&memberId=&sessionId=` | Paged, 100 mục/trang, mới nhất trước. HLV dạy thay bắt buộc sessionId đúng buổi đang được giao và chưa bị hủy; chỉ trả bản ghi của buổi đó, không trả PLAN cả khóa. Coach chính có thể bỏ sessionId để đọc cả lớp; khi chọn buổi trả bản ghi buổi đó và PLAN cả khóa. memberId tùy chọn giới hạn học viên |
| POST | `/api/coaches/me/teaching/classes/{classId}/records` | Tạo nội dung, retry idempotent; HLV dạy thay bắt buộc sessionId đúng buổi mình dạy, không được tạo nội dung cấp cả khóa |
| PUT | `/api/coaches/me/teaching/classes/{classId}/records/{recordId}` | Sửa PLAN/RESULT của chính coach, kiểm version, giữ scope và kiểm lại assignment buổi/lớp như POST |
| PUT | `/api/coaches/me/teaching/sessions/{sessionId}/attendance/{enrollmentId}` | `{status: PRESENT hoặc ABSENT}`, đúng coach của buổi |
| POST | `/api/coaches/me/teaching/classes/{classId}/suggestion` | `{memberId?, goal, level, language}` → `{content, provider, model}` |
| GET | `/api/members/me/classes/{classId}/teaching-records?page=1` | Member đã ghi danh, nội dung chung hoặc cá nhân của chính mình |

Body ghi: `recordId`, `kind`, `title` (160 ký tự), `content` (8.000 ký tự), `sessionId?`, `memberId?`, `score?`, `dueAtUtc?`, `version`. `dueAtUtc` giữ lại để tương thích hợp đồng cũ; HOMEWORK luôn lưu null, không nhập hay áp dụng hạn nộp cứng.

Quyền đọc `members` và `records` được kiểm tra ở API, không dựa vào việc ẩn nút: HLV dạy thay thiếu `sessionId` nhận `403 session_scope_required`; buổi khác lớp, đã bị hủy hoặc đã giao cho HLV khác nhận `403 session_not_assigned`. Lớp không còn Published/InProgress nhận `403 class_access_ended`. Danh sách/chi tiết học viên và hồ sơ sức khỏe vẫn chỉ dựa trên phân công Coach chính; ghi danh phải Confirmed và `EndedAt == null`. Roster, bản ghi cá nhân và thao tác ghi không sử dụng ghi danh đã kết thúc. Quyền đọc dữ liệu giảng dạy độc lập với thông tin lớp/lịch được công khai cho mọi người xem trước khi mua. Không thay đổi schema DB.

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

## Student learning history

- The student profile uses **Learning history** for other enrolled classes in the selected sport that started no later than the current class. The current coach must still be assigned to the student's current class to read this history.
- Classes appear even without assessments. Each class shows its lifecycle status, completed / total sessions and progress percentage. Cancelled lessons are excluded; replacement lessons count normally. Completion uses the stored session status, not the number of assessments or attendance marks.
- Present / Absent counts belong only to the selected student and class. Class completion does not imply the student attended every lesson or achieved a qualification.
- Assessments remain read only, paginated and grouped by class. No new migration is required.
