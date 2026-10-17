# Flow 4 — Training & Attendance: Use Case Specifications and Manual Test Guide

Đối chiếu ngày 18/10/2026. Tài liệu này mô tả **cách kiểm thử**, không xác nhận các ca đã Pass. Phần diễn giải dùng tiếng Việt; tên trang, nút và trường nhập dùng tiếng Anh theo giao diện hiện hành.

## 1. Phạm vi và quy tắc ưu tiên

Flow 4 hiện áp dụng cho **lớp cầu lông/bóng rổ nhiều buổi** và học viên đã ghi danh. Coach có thể phụ trách nhiều môn, nhưng chỉ thấy lớp/buổi/học viên trong phạm vi phân công. Member tự khai Fitness profile; Coach xem hồ sơ được cấp quyền, tạo lộ trình cả lớp, kế hoạch buổi và kế hoạch cá nhân, ghi đánh giá. Receptionist và Coach được phân công điểm danh trong thời gian cho phép; Member chỉ xem dữ liệu của mình.

SRS gốc mô tả UC-11–14 theo PT. [Requirements.md](Requirements.md) và code hiện hành đã thay PT bằng Coach lớp nhóm; tài liệu này phân rã UC-11–14 theo luồng thực tế. Điểm danh trong UC-10 của SRS cũng đã được mô tả ở Flow 2; các ca F4-18–20 ở đây kiểm tra góc nhìn tập luyện và quyền của Flow 4, không tạo nghiệp vụ điểm danh thứ hai.

**Ngoài phạm vi Flow 4:** AI suggestion (Flow 5); checkout/hoàn điểm và PDF hóa đơn (Flow 3); thay đổi lịch/ghi danh/nhắc lịch (Flow 2); PT 1:1. Bản đối chiếu gồm 25 UC. Homework là một phần Flow 4 đã được xác nhận: bài luyện tập tùy chọn sau buổi, gửi chuông/email, không có hạn nộp cố định. Coach có thể dùng bản nháp AI từ Flow 5 nhưng phải kiểm tra trước khi lưu.

Nguồn ưu tiên: [00-Source-of-Truth.md](00-Source-of-Truth.md) → [Requirements.md](Requirements.md) → [Coach-Teaching-Workspace.md](Coach-Teaching-Workspace.md) phần còn phù hợp → API và UI hiện tại. SRS gốc dùng để đối chiếu mục tiêu nghiệp vụ. Dữ liệu hệ thống dùng tiếng Anh; nội dung Coach/Member tự nhập được giữ nguyên ngôn ngữ họ nhập.

## 2. Chuẩn bị một lần

| Mã | Dữ liệu / tài khoản | Dùng để test |
|---|---|---|
| C-BAD | Một lớp Badminton Published/InProgress, Coach A được phân công lớp và ít nhất một buổi; ≥3 buổi, trong đó có buổi quá khứ, hôm nay và tương lai | Kế hoạch, điểm danh, kết quả |
| C-BAS | Một lớp Basketball tương tự, Coach B được phân công | Ranh giới chuyên môn và dữ liệu |
| M-A | Member A có Enrollment Confirmed trong C-BAD; có thể có thêm một lớp Badminton cũ | Hồ sơ, kế hoạch cá nhân, lịch sử |
| M-B | Member B có Enrollment Confirmed trong C-BAD | Kiểm tra nội dung cá nhân không lộ sang người khác |
| M-X | Member khác, không ghi danh C-BAD | Kiểm tra quyền truy cập |
| Coach A/B | Tài khoản Coach có phân công thật vào C-BAD/C-BAS tương ứng | Kiểm tra ownership |
| Receptionist | Tài khoản có quyền điểm danh | So sánh luồng điểm danh |

Tài khoản seed validation local có thể dùng `coach.caulong@sporthub.vn`, `coach.bongro@sporthub.vn`, `an.member@sporthub.vn`, `binh.member@sporthub.vn`, `letan@sporthub.vn`; **không giả định** DB đang test đã có enrollment, lịch sử, điểm danh hoặc mật khẩu giống nhau. Xem [Local-Validation-Data.md](Local-Validation-Data.md). Dùng dữ liệu lớp kiểm thử riêng, tránh sửa hồ sơ/học viên thật. Nếu test bản deploy, ghi domain, commit backend/frontend và ID lớp/buổi/học viên vào biên bản.

Mở từng role trong browser profile riêng. Với ca dữ liệu thời gian, dùng buổi có thời điểm phù hợp hoặc fixture DB test biệt lập; không sửa giờ máy chủ/DB production. Reload sau thao tác ghi để chứng minh dữ liệu đã lưu, không chỉ thay đổi trong bộ nhớ trình duyệt.

| Vai trò | Trang chính |
|---|---|
| Member | `/member/profile` — `Fitness profile`; `/member/schedule` — lớp đã đăng ký, `From your coach` |
| Coach | `/coach/schedule` — `Teaching schedule`; `/coach/classes` — `Classes`; `/coach/members` — `Students` |
| Receptionist | `/receptionist/attendance` — `Attendance` |

**Quy ước kết quả:** Pass khi đủ bước, quyền và dữ liệu sau reload đều đúng; Fail khi thao tác hợp lệ cho kết quả sai; Blocked khi thiếu tài khoản/lớp/buổi/fixture; Not run khi chưa thử. API trả 403/404 cho người ngoài phạm vi có thể là hành vi đúng; ghi chính xác status và không suy đoán lỗi giao diện.

## 3. Use cases và từng bước kiểm thử

### Nhóm A — Fitness profile và phạm vi học viên

#### UC-F4-01 — Member tạo Fitness profile (SRS UC-11)

| Mục | Nội dung |
|---|---|
| Tác nhân | Member |
| Ưu tiên | Optional — Flow 4 |
| Tiền điều kiện | Member đăng nhập; chưa có profile hoặc profile chưa hoàn chỉnh. |
| Luồng chính | Mở account menu → `Fitness profile`; điền ngày sinh, chiều cao, cân nặng, mục tiêu, kinh nghiệm, mức hoạt động, tần suất và các trường sức khỏe phù hợp; lưu. Hệ thống kiểm tra và lưu profile của chính Member, tính BMI từ chiều cao/cân nặng. |
| Luồng thay thế | Thiếu trường bắt buộc/sai đơn vị: báo lỗi từng trường, không lưu một phần. Người khác không được sửa hộ qua endpoint `members/me`. |
| Hậu điều kiện | Profile được lưu trong DB, Coach được phân công có thể xem bản mới nhất. |

**Test:** (1) M-A mở `/member/profile` → `Fitness profile`; ghi trạng thái ban đầu. (2) Nhập chiều cao 170 cm, cân nặng 65 kg, ngày sinh hợp lệ, `Main goal`, `Training experience`, `Activity level`, số ngày tập trong tuần, xác nhận consent rồi nhấn `Save profile`. (3) Reload và đối chiếu các trường cùng BMI tính từ 65/(1,70²) ≈ 22,5. (4) Coach A mở profile của M-A và kiểm tra các giá trị đã lưu. **Pass:** Member và Coach thấy cùng dữ liệu; không có trường nào tự đổi sau reload. **Âm tính:** chiều cao 99/251 cm, cân nặng 29/301 kg, ngày sinh ngoài giới hạn, lịch 0/8 ngày → bị từ chối.

#### UC-F4-02 — Member cập nhật Fitness profile

| Mục | Nội dung |
|---|---|
| Tác nhân | Member |
| Ưu tiên | Optional — Flow 4 |
| Tiền điều kiện | M-A đã có profile. |
| Luồng chính | M-A sửa cân nặng, mục tiêu hoặc ghi chú sức khỏe; hệ thống ghi thời điểm cập nhật, tính lại BMI khi cần và trả bản mới. |
| Luồng thay thế | Dữ liệu không hợp lệ hoặc request lỗi: giữ bản cũ; không biến giá trị rỗng thành số 0 không chủ ý. |
| Hậu điều kiện | Lần mở tiếp theo trả bản đã sửa. |

**Test:** đổi cân nặng 65 → 66 kg, thêm `Notes`, nhấn `Save profile`, reload; Coach A refresh profile. **Pass:** BMI đổi theo 66 kg, ghi chú giữ nguyên, `Updated` mới hơn; M-B không thể xem/sửa bằng cách đổi ID request. **Âm tính:** nhập số âm/chữ vào số đo và kiểm tra bản trước không bị mất.

#### UC-F4-03 — Coach tra cứu học viên được phân công

| Mục | Nội dung |
|---|---|
| Tác nhân | Coach |
| Ưu tiên | Optional — Flow 4 |
| Tiền điều kiện | Coach A là HLV chủ nhiệm lớp Published/InProgress; M-A/M-B có Enrollment Confirmed trong lớp đó. |
| Luồng chính | 1. Coach mở Students, tìm tên/email và chọn môn.<br>2. Danh sách gộp Member trong các lớp mình đang là HLV chủ nhiệm; mỗi Member một lần.<br>3. Mở Member: Health profile xuất hiện trước; sau đó chọn Plans hoặc Assessments. |
| Luồng thay thế | a. Chỉ có quan hệ Coach–Member cũ hoặc chỉ dạy thay một buổi: không cấp quyền directory/hồ sơ đầy đủ.<br>b. Enrollment không Confirmed hoặc lớp Completed/Cancelled: loại khỏi phạm vi; lớp hiện tại khác còn hợp lệ vẫn duy trì quyền tương ứng.<br>c. Search/môn không mở rộng quyền; URL/API ngoài phạm vi trả 403/404. |
| Hậu điều kiện | Không thay đổi dữ liệu. |

**Test:** Coach A mở Students, tìm M-A và chọn Badminton; M-A chỉ xuất hiện một lần. Coach chỉ dạy thay S1 không thấy directory M-A từ phân công đó. Cho enrollment kết thúc/lớp Completed và refresh: học viên biến mất nếu không còn lớp chủ nhiệm hợp lệ khác. M-X và URL/API ngoài phạm vi trả 403/404.

#### UC-F4-04 — Coach xem Fitness profile của học viên

| Mục | Nội dung |
|---|---|
| Tác nhân | Coach được phân công |
| Ưu tiên | Optional — Flow 4 |
| Tiền điều kiện | Coach là HLV chủ nhiệm lớp Published/InProgress và Member có ghi danh Confirmed hiện tại trong lớp đó. |
| Luồng chính | `Students` → M-A; mặc định mở `Health profile`; đọc số đo, BMI, mục tiêu, mức vận động, chế độ ăn/dị ứng và ghi chú Member đã khai. |
| Luồng thay thế | a. Chưa có hồ sơ: hiển thị No Fitness profile yet; không tự tạo số đo.<br>b. HLV dạy thay không có quyền đọc hồ sơ sức khỏe đầy đủ qua phân công buổi.<br>c. Hết quan hệ lớp hợp lệ: API từ chối; trang đang mở recheck khi focus/mỗi 30 giây và bỏ nội dung cache. |
| Hậu điều kiện | Chỉ đọc; không đổi profile. |

**Test:** M-A cập nhật Fitness profile, Coach chủ nhiệm đối chiếu số đo và ghi chú. Coach dạy thay thử URL/API health: bị chặn. Để hồ sơ mở rồi kết thúc ghi danh: quay lại tab hoặc đợi tối đa 30 giây, nội dung cũ bị bỏ và báo hết quyền. Chưa có profile phải hiện empty state, không có số đo giả.

#### UC-F4-05 — Coach chọn đúng môn và lớp của một học viên

| Mục | Nội dung |
|---|---|
| Tác nhân | Coach |
| Ưu tiên | Optional — Flow 4 |
| Tiền điều kiện | M-A có ít nhất hai lớp/môn hợp lệ trong phạm vi Coach; mỗi lớp có kế hoạch/đánh giá khác nhau. |
| Luồng chính | Trong hồ sơ M-A chọn `Plans` hoặc `Assessments`, chọn `Sport` và `Current class`; hệ thống chỉ đọc dữ liệu lớp đã chọn. |
| Luồng thay thế | Chuyển lớp khi form đang sửa chưa lưu: hỏi bỏ thay đổi; không lưu nội dung vào lớp khác. |
| Hậu điều kiện | Lớp đang chọn rõ ràng; không thay đổi plan/assessment. |

**Test:** chọn C-BAD, ghi tên một plan; chuyển sang lớp khác và so sánh. Quay lại C-BAD. **Pass:** tên môn/lớp/plan đi cùng nhau, không trộn học viên hay lớp; khi chỉ có một lớp hợp lệ, lớp đó được chọn tự động. Thử nhập URL lớp ngoài quyền → 403/404.

#### UC-F4-06 — Coach xem roster và mục tiêu trong lớp

| Mục | Nội dung |
|---|---|
| Tác nhân | Coach được giao lớp |
| Ưu tiên | Optional — Flow 4 |
| Tiền điều kiện | C-BAD Published/InProgress; M-A/M-B Confirmed. |
| Luồng chính | Mở `Classes` → C-BAD → `Students`; xem tên, mục tiêu/trình độ và thông tin liên quan từng học viên trong lớp. |
| Luồng thay thế | a. Enrollment không Confirmed không thuộc roster hiện tại.<br>b. HLV dạy thay đọc roster qua sessionId được giao; chỉ thống kê Present/Absent của buổi đó, không nhận goal/experience/health notes.<br>c. Muốn xem Health profile/Learning history phải có phân công chủ nhiệm hợp lệ, không chỉ cùng môn. |
| Hậu điều kiện | Chỉ đọc, không tự tạo kế hoạch. |

**Test:** Coach chủ nhiệm mở Classes → C-BAD → Students: chỉ Member Confirmed. Coach dạy thay mở Teaching schedule → S1 → Attendance: chỉ roster và số liệu buổi S1, không có mục tiêu/kinh nghiệm/ghi chú sức khỏe. Gọi members thiếu hoặc sai sessionId bị từ chối; không dùng roster làm đường tắt mở profile.

#### UC-F4-07 — Coach xem Learning history cùng môn

| Mục | Nội dung |
|---|---|
| Tác nhân | Coach hiện được phân công lớp của học viên |
| Ưu tiên | Optional — Flow 4 |
| Tiền điều kiện | Coach chủ nhiệm lớp hiện tại Published/InProgress có M-A Confirmed; M-A có lớp cũ cùng môn. |
| Luồng chính | M-A → `Assessments` → `Learning history`; tìm/chọn lớp cũ, nhấn `View detail`; xem tiến độ lớp, Present/Absent và đánh giá buổi trong popup. |
| Luồng thay thế | a. Lịch sử chỉ là đánh giá RESULT của đúng Member, đúng môn và lớp cũ đủ điều kiện; không cấp quyền sửa.<br>b. Coach dạy thay không mở lịch sử/hồ sơ đầy đủ.<br>c. Khi phân công hiện tại kết thúc hoặc M-A thôi học, mất quyền history trừ khi còn lớp chủ nhiệm khác đủ điều kiện. |
| Hậu điều kiện | Chỉ đọc; không sửa bản ghi của Coach cũ. |

**Test:** Tạo RESULT của M-A ở lớp cũ cùng môn; Coach chủ nhiệm lớp hiện tại mở Students → M-A → Assessments → Learning history → View detail. Chỉ đọc đúng M-A/môn/lớp. Coach dạy thay và Coach không còn lớp chủ nhiệm hợp lệ bị chặn; lịch sử không cấp thêm quyền sửa.

### Nhóm B — Kế hoạch tập luyện (SRS UC-12)

#### UC-F4-08 — Coach tạo Class roadmap

| Mục | Nội dung |
|---|---|
| Tác nhân | Coach chủ nhiệm C-BAD |
| Ưu tiên | Optional — Flow 4 |
| Tiền điều kiện | C-BAD Published/InProgress và Coach A được giao lớp. |
| Luồng chính | `Classes` → C-BAD → `Plans` → `Class roadmap` → `New class roadmap`; nhập `Plan title`, `Course goals & learning roadmap`, lưu. |
| Luồng thay thế | Lớp Draft/Cancelled; thiếu title/content; Coach dạy thay chỉ được phân buổi không được tạo nội dung cả khóa. |
| Hậu điều kiện | Bản PLAN toàn lớp được lưu với coach, class, version; Member Confirmed đọc được. |

**Test:** tạo lộ trình ghi rõ mục tiêu cả khóa và nội dung buổi 1–3; nhấn `Save to SportHub`, reload trang Coach. Member A/B mở lớp đã đăng ký trong `My schedule` → `From your coach`. **Pass:** cùng lộ trình ở Coach và hai Member; M-X không đọc được endpoint của C-BAD.

#### UC-F4-09 — Coach tạo Lesson plan cho một buổi

| Mục | Nội dung |
|---|---|
| Tác nhân | Coach được phân công buổi |
| Ưu tiên | Optional — Flow 4 |
| Tiền điều kiện | Buổi S1 thuộc C-BAD, chưa Cancelled, Coach A được phân công đúng S1. |
| Luồng chính | C-BAD → `Plans` → `Class roadmap` → buổi S1 → `Add plan`; nhập `Session`, `Plan title`, `Exercises & notes`; lưu. Có thể mở buổi trong `Teaching schedule` → `Plan`. |
| Luồng thay thế | Buổi của lớp khác/Coach khác/Cancelled: từ chối; đổi buổi sau khi lưu không tự di chuyển plan. |
| Hậu điều kiện | PLAN gắn S1 và hiện đúng thứ tự buổi. |

**Test:** tạo plan S2 trước rồi S1, reload lộ trình. **Pass:** S1 luôn đứng trước S2 theo sessionNo/thời gian, không theo ngày tạo plan; trong chi tiết S1 chỉ có plan S1, `View class roadmap` về đúng C-BAD; Member thấy đúng buổi.

#### UC-F4-10 — Coach tạo Personal plan

| Mục | Nội dung |
|---|---|
| Tác nhân | Coach được giao lớp/buổi phù hợp |
| Ưu tiên | Optional — Flow 4 |
| Tiền điều kiện | M-A Confirmed trong C-BAD; Coach A được phân công. |
| Luồng chính | `Students` → M-A → `Plans` → chọn Badminton/C-BAD → `Personal plan` → `New personal plan`; điền nội dung và có thể chọn `Session`; lưu. |
| Luồng thay thế | Member không có Enrollment Confirmed hoặc buổi không thuộc C-BAD: từ chối; không đổi học viên/phạm vi khi sửa bản đã lưu. |
| Hậu điều kiện | PLAN cá nhân gắn M-A; M-B không đọc được. |

**Test:** tạo plan có một nội dung chỉ dành cho M-A; reload M-A, mở M-B và hai tài khoản Member. **Pass:** M-A thấy plan; M-B không thấy qua UI hoặc `GET /api/members/me/classes/{classId}/teaching-records`; plan chung của lớp vẫn hiện cho cả hai.

#### UC-F4-11 — Coach sửa kế hoạch đã lưu và kiểm soát version

| Mục | Nội dung |
|---|---|
| Tác nhân | Coach tác giả, còn quyền với lớp/buổi |
| Ưu tiên | Optional — Flow 4 |
| Tiền điều kiện | Có PLAN từ UC-F4-08/09/10. |
| Luồng chính | Mở plan → `Edit`; sửa tiêu đề/nội dung, lưu; hệ thống cập nhật version/timestamp, giữ nguyên scope, class, Member, buổi và tác giả. |
| Luồng thay thế | Sửa bằng version cũ: 409; Coach khác: 403; nội dung rỗng: validation. |
| Hậu điều kiện | Member thấy bản mới sau reload; lịch sử audit có thao tác sửa. |

**Test:** mở cùng plan ở hai tab Coach A, lưu bản thứ nhất rồi thử lưu bản thứ hai. **Pass:** lần hai bị báo nội dung đã thay đổi hoặc yêu cầu refresh, không âm thầm ghi đè; Member thấy bản thứ nhất. Thử Coach B gọi PUT với ID đó → 403/404.

#### UC-F4-12 — Member xem lộ trình lớp, buổi và kế hoạch riêng

| Mục | Nội dung |
|---|---|
| Tác nhân | Member đã ghi danh |
| Ưu tiên | Optional — Flow 4 |
| Tiền điều kiện | M-A còn Enrollment Confirmed, EndedAt rỗng; lớp Published/InProgress/Completed. |
| Luồng chính | M-A mở `My schedule` → chọn buổi/lớp C-BAD → `View course plan` hoặc `From your coach`; xem lộ trình cả khóa, lesson plan và Personal plan của mình. |
| Luồng thay thế | a. Không có plan: empty state; Member chỉ thấy plan chung và plan của mình.<br>b. Lớp Completed nhưng ghi danh còn hiệu lực: Member vẫn xem lịch sử buổi, plan và kết quả của mình, kể cả khi không còn buổi tương lai.<br>c. Ghi danh kết thúc hoặc lớp Cancelled/Draft: API Member sessions và teaching-records trả 403 class_access_ended, kể cả URL cũ.<br>d. Trang đang mở recheck khi focus/mỗi 30 giây, ẩn nội dung nếu quyền bị thu hồi; lịch sử tài chính không bị xóa. |
| Hậu điều kiện | Chỉ đọc, không tự sửa dữ liệu Coach. |

**Test:** M-A còn lớp đang hoạt động, so sánh plan chung, plan đúng buổi và Personal plan với bản Coach lưu; M-B không thấy Personal plan M-A. Chuyển lớp sang Completed nhưng giữ ghi danh: M-A vẫn đọc được nội dung cũ. Sau đó kết thúc enrollment hoặc hủy lớp rồi mở lại tab và URL/API cũ: class_access_ended, nội dung cache bị bỏ.

### Nhóm C — Kết quả và tiến độ (SRS UC-13/14)

#### UC-F4-13 — Coach ghi đánh giá một học viên sau khi buổi bắt đầu

| Mục | Nội dung |
|---|---|
| Tác nhân | Coach được giao buổi |
| Ưu tiên | Optional — Flow 4 |
| Tiền điều kiện | S1 đã bắt đầu, không Cancelled; M-A Confirmed; Coach A được giao S1. |
| Luồng chính | `Teaching schedule` → S1 → `Attendance` → dòng M-A → `Record`; nhập `Title`, `Content`, `Skill assessment` 1–5 nếu có; `Save to SportHub`. |
| Luồng thay thế | Buổi tương lai: nút chưa hoạt động/backend từ chối; thiếu Member/Session: từ chối; điểm ngoài 1–5: từ chối; một kết quả cho cùng cặp S1/M-A, lần ghi sau phải dùng Edit. |
| Hậu điều kiện | RESULT lưu đúng class/session/member/coach; chuông của M-A nhận thông báo. |

**Test:** dùng buổi đã bắt đầu, nhập nội dung có `Result`, `Strengths`, `Needs work`, `Next lesson`, điểm 4; lưu và reload. **Pass:** `Record` cho thấy bản đã lưu, M-A thấy đánh giá và chuông, M-B không nhận. Thử ghi RESULT thứ hai cùng buổi/M-A qua API → 409 `result_exists`.

#### UC-F4-14 — Coach sửa đánh giá của chính mình

| Mục | Nội dung |
|---|---|
| Tác nhân | Coach tác giả |
| Ưu tiên | Optional — Flow 4 |
| Tiền điều kiện | Đã có RESULT cho S1/M-A. |
| Luồng chính | Mở lại `Record`, sửa nội dung/điểm; lưu với version hiện tại. |
| Luồng thay thế | Coach khác, version cũ, đổi Member/Session: từ chối; không tạo RESULT thứ hai. |
| Hậu điều kiện | Bản ghi cũ được cập nhật; `Updated` đổi; lịch sử lớp của Member phản ánh bản mới. |

**Test:** đổi điểm 4 → 5 và nhận xét; reload Coach và Member. **Pass:** chỉ một RESULT, điểm và `Updated` mới; Coach B không sửa được; hai tab stale trả 409. Không giả định sửa RESULT tạo thông báo thứ hai: code hiện queue thông báo khi **tạo** RESULT.

#### UC-F4-15 — Coach xem tiến độ theo lớp và học viên

| Mục | Nội dung |
|---|---|
| Tác nhân | Coach đang có quyền với học viên |
| Ưu tiên | Optional — Flow 4 |
| Tiền điều kiện | C-BAD có buổi hoàn thành/chưa diễn ra, điểm danh và RESULT; M-A có lớp cũ cùng môn. |
| Luồng chính | `Students` → M-A → `Assessments`; đọc `Current class` và `Learning history`; chọn lớp, `View detail` để xem đánh giá từng buổi. |
| Luồng thay thế | Không có đánh giá: vẫn hiển thị tiến độ buổi và số Present/Absent đã lưu; không suy diễn học viên đạt chuẩn chỉ từ số buổi hoàn thành. |
| Hậu điều kiện | Chỉ đọc, dùng kết quả làm cơ sở lập plan tiếp. |

**Test:** so completed/total với trạng thái session; so Present/Absent với roster của M-A; đổi lớp trong `Learning history`. **Pass:** màu/trạng thái buổi quá khứ, hiện tại, tương lai và số liệu đúng từng lớp; popup đúng Coach tác giả/nội dung/điểm; không cộng gộp sai giữa hai lớp.

#### UC-F4-16 — Member xem kết quả của lớp đã ghi danh

| Mục | Nội dung |
|---|---|
| Tác nhân | Member |
| Ưu tiên | Optional — Flow 4 |
| Tiền điều kiện | M-A có RESULT trong lớp Published/InProgress/Completed, Enrollment Confirmed và EndedAt rỗng. |
| Luồng chính | 1. Member mở My schedule → lớp hiện còn quyền → From your coach.<br>2. Đọc RESULT/điểm/nhận xét cá nhân và nội dung chung trong khóa đó.<br>3. Chuyển buổi để xem đúng bản ghi của buổi, không ghép kết quả học viên khác. |
| Luồng thay thế | a. Không có đánh giá: empty state.<br>b. RESULT của M-B không lộ; ghi danh đã kết thúc hoặc lớp Cancelled/Draft trả 403/404.<br>c. Lớp Completed vẫn đọc được nội dung khi ghi danh còn hiệu lực; lịch sử tài chính tự nó không cấp quyền. |
| Hậu điều kiện | Chỉ đọc. |

**Test:** Coach ghi RESULT cho buổi đã diễn ra của M-A. Member mở My schedule → lớp → From your coach: đúng kết quả/điểm/nhận xét, không có dữ liệu M-B. Chuyển lớp sang Completed: kết quả vẫn mở được. Khi ghi danh kết thúc hoặc lớp bị hủy: API và trang đã mở chặn nội dung; Billing vẫn giữ lịch sử tài chính.

#### UC-F4-17 — Member nhận thông báo đánh giá mới

| Mục | Nội dung |
|---|---|
| Tác nhân | Coach khởi phát, Member nhận |
| Ưu tiên | Optional — Flow 4 |
| Tiền điều kiện | Coach A chuẩn bị tạo RESULT mới cho M-A; ghi unread count ban đầu của M-A/M-B. |
| Luồng chính | Coach lưu RESULT; hệ thống tạo thông báo in-app cho M-A; M-A mở chuông, đọc và điều hướng về đúng lớp/buổi. |
| Luồng thay thế | Retry cùng recordId không tạo thông báo lặp; M-B không nhận; lỗi gửi mail không ảnh hưởng RESULT (đánh giá hiện dùng in-app). |
| Hậu điều kiện | Chỉ notification của M-A thay đổi trạng thái đọc sau khi mở. |

**Test:** ghi unread count, tạo RESULT mới, refresh chuông M-A, click item; đối chiếu M-B. **Pass:** +1 thông báo cho M-A, 0 cho M-B, link đúng dữ liệu; đánh dấu đọc không xóa RESULT. Không dùng RESULT cũ của UC-F4-13 nếu đã có cùng S1/M-A; chọn cặp buổi/học viên mới.

### Nhóm D — Điểm danh và thông báo lớp

#### UC-F4-18 — Receptionist điểm danh lớp nhóm (SRS UC-10)

| Mục | Nội dung |
|---|---|
| Tác nhân | Receptionist |
| Ưu tiên | Optional — Flow 4; nghiệp vụ gốc ở Flow 2 |
| Tiền điều kiện | S1 của C-BAD không Cancelled, M-A/M-B Confirmed; thời điểm từ 5 phút trước giờ bắt đầu tới 24 giờ sau giờ kết thúc. |
| Luồng chính | `/receptionist/attendance` → chọn `Date`, `Class`, `Session`; đánh dấu `Present`/`Absent`; hệ thống lưu theo enrollment và buổi. |
| Luồng thay thế | Chưa tới cửa sổ, quá 24 giờ, lớp/buổi hủy, enrollment không Confirmed: chặn; chọn lại cùng trạng thái không tạo bản ghi mới. |
| Hậu điều kiện | Attendance cùng actor/time tồn tại; Coach/Member thấy bản hợp lệ. |

**Test:** trong cửa sổ hợp lệ, đánh M-A `Present`, M-B `Absent`; reload Receptionist, Coach và Member. **Pass:** đúng từng học viên; M-X không được điểm danh qua API; trước start−5 phút/qua end+24 giờ bị từ chối. Dùng fixture thời gian cho ranh giới chính xác.

#### UC-F4-19 — Coach được giao buổi điểm danh

| Mục | Nội dung |
|---|---|
| Tác nhân | Coach được phân công S1 |
| Ưu tiên | Optional — Flow 4 |
| Tiền điều kiện | Giống UC-F4-18; Coach A là coach S1. |
| Luồng chính | `Teaching schedule` → S1 → `Attendance`; chọn `Present`/`Absent` trên đúng dòng học viên. |
| Luồng thay thế | Coach không được giao S1 dù dạy cùng môn/lớp: 403; ngoài cửa sổ: từ chối. |
| Hậu điều kiện | Cùng attendance record được cập nhật; audit lưu Coach thao tác. |

**Test:** Coach A điểm M-A, reload; Coach B thử gọi `PUT /api/coaches/me/teaching/sessions/{sessionId}/attendance/{enrollmentId}` của S1. **Pass:** Coach A lưu được, Coach B 403; hiện đúng trạng thái trên roster và Member schedule.

#### UC-F4-20 — Sửa điểm danh trong cửa sổ cho phép

| Mục | Nội dung |
|---|---|
| Tác nhân | Receptionist hoặc Coach có quyền trên S1 |
| Ưu tiên | Optional — Flow 4 |
| Tiền điều kiện | M-A đã được đánh `Present`; còn trong cửa sổ đến end+24 giờ. |
| Luồng chính | Đổi M-A sang `Absent`; hệ thống cập nhật cùng bản ghi, ghi `LastModifiedAt`/audit. |
| Luồng thay thế | Sau end+24 giờ: 409; nhấn lại `Absent` không nhân bản. |
| Hậu điều kiện | Chỉ trạng thái cuối cùng được hiển thị; có lịch sử audit chỉnh sửa. |

**Test:** đổi `Present` → `Absent` rồi reload ba vai trò. **Pass:** đúng một attendance cho cặp session/enrollment, actor và lịch sử thay đổi hợp lệ. Với fixture, thử đúng end+24 giờ và sau đó một giây.

#### UC-F4-21 — Coach gửi Notice cho lớp hoặc một học viên

| Mục | Nội dung |
|---|---|
| Tác nhân | Coach phụ trách lớp/buổi |
| Ưu tiên | Optional — Flow 4, chức năng thông báo trong phạm vi lớp |
| Tiền điều kiện | C-BAD hoạt động, có M-A/M-B Confirmed. |
| Luồng chính | `Classes` → C-BAD → `Notices` → `Send notice`; nhập `Title`, `Content`, chọn `Entire class` hoặc đúng Member, gửi. Hệ thống lưu NOTICE và thông báo in-app tới người nhận hợp lệ. |
| Luồng thay thế | Gửi cho Member không ghi danh hoặc Coach ngoài quyền: chặn; NOTICE đã gửi không sửa; retry cùng recordId không gửi lặp. |
| Hậu điều kiện | Member nhận đúng notice và thấy trong `From your coach`; lịch sử gửi được lưu. |

**Test:** gửi một notice cả lớp rồi một notice chỉ M-A; kiểm tra chuông M-A/M-B, mở `My schedule` → C-BAD. **Pass:** cả hai nhận notice chung; chỉ M-A nhận notice riêng; nội dung chỉ gửi một lần, sau reload còn. Không yêu cầu email: NOTICE hiện chỉ gửi in-app.

### Nhóm E — Quyền truy cập và Homework theo code hiện hành

#### UC-F4-22 — Thu hồi quyền xem hồ sơ học viên của Coach

| Mục | Nội dung |
|---|---|
| Tác nhân | Coach; hệ thống kiểm quyền |
| Mức ưu tiên | Required |
| Tiền điều kiện | Coach chủ nhiệm đang xem Member có Enrollment Confirmed trong lớp Published/InProgress. |
| Luồng chính | 1. Một điều kiện cấp quyền kết thúc: lớp Completed/Cancelled, Member thôi học hoặc Coach không còn phân công chủ nhiệm hợp lệ.<br>2. API directory/health/records/history/AI kiểm tra lại lớp và ghi danh hiện tại.<br>3. Trang hồ sơ recheck khi lấy focus hoặc mỗi 30 giây; bỏ dữ liệu cũ và hiện Access is no longer available.<br>4. Nếu còn lớp chủ nhiệm khác hợp lệ của Member, chỉ duy trì quyền theo lớp đó. |
| Luồng thay thế / ngoại lệ | a. Quan hệ Coach–Member được lưu từ trước không tự cấp quyền.<br>b. Còn quyền ở lớp khác không mở lại endpoint nội dung của lớp đã kết thúc.<br>c. Các API hồ sơ chung và AI phải áp dụng cùng phạm vi, không chỉ ẩn nút. |
| Hậu điều kiện | Không có thao tác đọc mới ngoài quyền; trang đang mở không giữ hồ sơ sau lần kiểm tra thu hồi. |

**Test:** Coach mở M-A; kết thúc enrollment bằng luồng hoàn/hủy được hỗ trợ hoặc cho lớp Completed. Quay lại tab và gọi API health/history/records: nội dung bị chặn. Tạo thêm lớp hợp lệ khác của M-A để kiểm quyền còn theo lớp đó nhưng lớp đã kết thúc vẫn bị chặn.

**Pass:** Không có thao tác đọc mới ngoài quyền; trang đang mở không giữ hồ sơ sau lần kiểm tra thu hồi.

#### UC-F4-23 — HLV dạy thay làm việc trong phạm vi buổi được giao

| Mục | Nội dung |
|---|---|
| Tác nhân | Coach dạy thay |
| Mức ưu tiên | Required |
| Tiền điều kiện | Lớp Published/InProgress; Manager giao một buổi không Cancelled cho Coach dạy thay; Member trong roster hiện tại. |
| Luồng chính | 1. Coach mở Teaching schedule và đúng buổi được giao.<br>2. Xem roster và bản ghi gắn với buổi đó; Members API yêu cầu sessionId hợp lệ.<br>3. Ghi điểm danh trong cửa sổ cho phép và ghi RESULT sau giờ bắt đầu cho học viên Confirmed.<br>4. Kế hoạch thủ công chỉ gắn buổi đó; nội dung cả khóa, hồ sơ sức khỏe đầy đủ, Learning history và AI hồ sơ không được cấp từ phân công dạy thay. |
| Luồng thay thế / ngoại lệ | a. Buổi khác hoặc buổi đã Cancelled: từ chối, dù cùng lớp/môn.<br>b. SessionId thiếu/sai khi đọc members: 403 session_scope_required.<br>c. Mục tiêu/kinh nghiệm/ghi chú sức khỏe bị lược khỏi roster; chỉ thống kê điểm danh buổi được giao. |
| Hậu điều kiện | Dữ liệu tạo/đọc nằm trong đúng buổi; không mở rộng sang toàn lớp/toàn bộ Member. |

**Test:** Giao S1 cho Coach B, giữ S2 cho Coach A. Coach B mở S1 và điểm danh hợp lệ; thử S2, Health profile, directory, history và AI hồ sơ: bị chặn. Gọi members không sessionId/sai sessionId bị từ chối; kiểm không có goal/experience/health notes.

**Pass:** Dữ liệu tạo/đọc nằm trong đúng buổi; không mở rộng sang toàn lớp/toàn bộ Member.

#### UC-F4-24 — Thu hồi quyền nội dung lớp khi ghi danh kết thúc hoặc lớp bị hủy

| Mục | Nội dung |
|---|---|
| Tác nhân | Member; hệ thống kiểm quyền |
| Mức ưu tiên | Required |
| Tiền điều kiện | Member đang xem lớp có Enrollment Confirmed, EndedAt rỗng, lớp Published/InProgress/Completed. |
| Luồng chính | 1. Ghi danh kết thúc do hoàn/chuyển/hủy hoặc lớp bị Cancelled.<br>2. API sessions/teaching-records kiểm lại ghi danh và trạng thái lớp, không chỉ kiểm Member từng ghi danh.<br>3. Trang đang mở recheck khi focus/mỗi 30 giây, hiện Class access has ended và bỏ giáo án/nhận xét cũ khỏi khung.<br>4. Member vẫn xem lịch sử đăng ký, Billing và tải hóa đơn thuộc mình. |
| Luồng thay thế / ngoại lệ | a. Lớp Completed hoặc mọi buổi đã kết thúc nhưng ghi danh vẫn Confirmed, EndedAt rỗng: tiếp tục cho Member xem nội dung lịch sử.<br>b. Chuông/URL cũ không cấp quyền mới; dữ liệu công khai chỉ tuân theo catalog công khai.<br>c. Member khác và tài khoản không đăng nhập không được đọc nội dung. |
| Hậu điều kiện | Nội dung lớp không còn truy cập được bằng UI/API; hồ sơ tài chính và lịch sử giao dịch được giữ. |

**Test:** M-A mở lớp và đọc From your coach. Kết thúc enrollment bằng luồng hợp lệ, quay lại tab rồi thử URL/API cũ: 403 class_access_ended, không còn nội dung cache. Billing → Download invoice của chính mình vẫn được; lớp khác còn hiệu lực vẫn mở được.

**Pass:** Nội dung lớp không còn truy cập được bằng UI/API; hồ sơ tài chính và lịch sử giao dịch được giữ.

#### UC-F4-25 — Coach giao Homework sau buổi và Member nhận qua email

| Mục | Nội dung |
|---|---|
| Tác nhân | Coach được giao buổi; Member nhận |
| Mức ưu tiên | Optional — Flow 4 |
| Tiền điều kiện | Buổi không Cancelled đã kết thúc; lớp còn Published/InProgress; Member Confirmed. Có cấu hình SMTP để chứng minh inbox delivery. |
| Luồng chính | 1. Coach mở Teaching schedule → buổi vừa kết thúc → Homework → Assign homework.<br>2. Chọn cả lớp hoặc đúng học viên, nhập Title và Content; không yêu cầu Due date.<br>3. Nhấn Send to students; backend lưu HOMEWORK gắn với buổi vừa học, xóa DueAtUtc, queue chuông và email cho đúng Member.<br>4. Member đọc email hoặc From your coach; nội dung là luyện thêm tùy chọn trước buổi tiếp theo. |
| Luồng thay thế / ngoại lệ | a. Buổi chưa kết thúc, thiếu/sai session, sai Coach hoặc Member không Confirmed: từ chối.<br>b. Retry cùng recordId/nội dung không gửi lại; HOMEWORK đã gửi không sửa qua endpoint update.<br>c. Lỗi SMTP không rollback bản HOMEWORK; kiểm trạng thái delivery riêng. |
| Hậu điều kiện | Bài tập tồn tại, không bắt buộc nộp/không hạn cố định; thông báo đúng người nhận. |

**Test:** Dùng S1 đã kết thúc trong khóa còn buổi S2 tương lai. Giao cho M-A, kiểm HOMEWORK có SessionId=S1 và DueAtUtc=null; M-A nhận chuông/email, M-B không nhận. Thử buổi tương lai và retry cùng recordId; không tạo bài/gửi email lần hai.

**Pass:** Bài tập tồn tại, không bắt buộc nộp/không hạn cố định; thông báo đúng người nhận.

## 4. Thứ tự chạy và chứng cứ

Chạy **01–07** trước để chuẩn bị profile/phạm vi; tiếp **08–12** tạo kế hoạch; tiếp **18–20** điểm danh trong cửa sổ hợp lệ; cuối cùng **13–17 và 21** dùng dữ liệu đã tạo. Nếu đang test gần hạn điểm danh, ưu tiên 18–20 trước.

Ghi một dòng cho **mỗi kịch bản**, không đánh toàn UC Pass khi chưa thử âm tính. Mẫu:

```text
Test ID: TC-F4-13-01
Use case: UC-F4-13
Environment / frontend commit / backend commit:
Actor / account / time (Asia/Ho_Chi_Minh):
ClassId / SessionId / MemberId / RecordId:
Precondition:
Steps actually performed:
Expected:
Actual:
Result: Pass | Fail | Blocked | Not run
Evidence: screenshot, response status/body (redact token and health details)
Issue / first failed step:
```

Các case dùng profile sức khỏe phải che dữ liệu nhận dạng và thông tin y tế khi chia sẻ bằng chứng. Không gửi JWT, mật khẩu hoặc toàn bộ response riêng tư vào ticket công khai. Khi kiểm quyền, dùng tài khoản thật khác và request của chính tài khoản đó, không chỉ ẩn nút trên frontend.

## 5. Ma trận truy vết

| SRS gốc | Use case chi tiết | Màn hình/API chính |
|---|---|---|
| UC-10 Attendance | F4-18–20; Flow 2 F2-39/40 | `Attendance`, `Teaching schedule`; `/api/class-sessions/{id}/attendance/{enrollmentId}` và Coach tương ứng |
| UC-11 Training profile | F4-01–07 | `Fitness profile`, `Students`, `Learning history`; `/api/members/me/training-profile`, Coach students/history |
| UC-12 Training plan | F4-08–12 | `Classes`/`Plans`, `My schedule`; class teaching records API |
| UC-13 Results/progress | F4-13–15, F4-17 | `Record`, `Assessments`, bell notifications; class teaching records API |
| UC-14 Member view | F4-12, F4-16 | `My schedule` → `From your coach`; Member teaching records API |
| Scope bổ sung Coach | F4-21–23 | `Notices`; phạm vi primary/substitute, API health/history/AI/session |
| Thu hồi quyền Member | F4-24 | Member class sessions/teaching-records, UI recheck |
| Homework | F4-25 | `Assign homework` → `Send to students`, in-app/email outbox |

AI `Generate suggestion` thuộc Flow 5 và chỉ được dùng làm bản nháp để Coach duyệt trước khi lưu plan. `classId` và `sessionId` là định danh lớp/buổi để kiểm phạm vi phân công; JWT xác thực Coach.
