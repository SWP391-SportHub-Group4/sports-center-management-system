# SportHub — bản chốt demo 6 flow trên DB local

## Lời mở đầu — nói trước khi bấm demo

> Thưa thầy, đề bài ban đầu giao cho nhóm em bốn vai trò: Manager, Receptionist, Coach và Member. Trong quá trình thiết kế, nhóm em bổ sung vai trò **System Administrator** để phụ trách tạo tài khoản nhân sự, phân quyền, kích hoạt hoặc vô hiệu hóa tài khoản và theo dõi lịch sử thao tác. Nhờ vậy, Manager tập trung vận hành trung tâm: quản lý gói tập, lớp học, sân và báo cáo. Hệ thống còn có Guest là người chưa đăng nhập, có thể xem thông tin công khai. Sau đây nhóm em sẽ demo sáu luồng chính theo thứ tự thao tác thực tế; ở mỗi luồng, nhóm em sẽ chỉ rõ ai thực hiện, bấm ở đâu và kết quả thể hiện yêu cầu nào của hệ thống.

**Nguồn dùng khi trình bày với thầy.** Frontend: `http://localhost:3000`; DB: `sporthub` local, cổng `5435`. Trạng thái đối chiếu ngày 27/10/2026: **23 tài khoản** đang có trong DB. Guest không cần tài khoản. Bảng dưới ghi đúng `full_name` và email hiện lưu trong DB; tên sẽ đổi nếu hồ sơ được sửa.

## 1. Bảng tài khoản

| Role | Tên hiển thị trên SportHub | Email đăng nhập | Mật khẩu local | Dùng khi demo |
|---|---|---|---|---|
| Admin | Nguyễn Quản Trị | `admin@sporthub.vn` | `Sporthub@123` | Quản trị tài khoản |
| Admin | Quản trị Demo 01 | `admin.demo1@sporthub.vn` | `Sporthub@123` | Mở chính hồ sơ để chỉ nút Deactivate bị ẩn |
| Admin | Quản trị Demo 02 | `admin.demo2@sporthub.vn` | `Sporthub@123` | Đối chiếu hồ sơ Admin khác |
| Manager | Trần Thu Quản Lý | `manager@sporthub.vn` | `Sporthub@123` | Manager có sẵn, dự phòng |
| Manager | Khoa Manager | `nnkhoa1999@gmail.com` | `Sporthub@123` | Manager có sẵn, dự phòng |
| Manager | Quản lý Demo | `manager.demo@sporthub.vn` | `Sporthub@123` | Gói Gym, lớp, sân, báo cáo |
| Receptionist | Lê Thị Lễ Tân | `letan@sporthub.vn` | `Sporthub@123` | Lễ tân có sẵn, dự phòng |
| Receptionist | Hào Lễ Tân | `avatarstar1133@gmail.com` | `Sporthub@123` | Lễ tân có sẵn, dự phòng |
| Receptionist | Lễ tân Demo | `letan.demo@sporthub.vn` | `Sporthub@123` | Member, Gym check-in, hóa đơn |
| Coach Cầu lông | Đặng Quốc | `coach.caulong@sporthub.vn` | `Sporthub@123` | Badminton 01/02, roster, training |
| Coach Cầu lông | Bùi Khánh Linh | `coach.caulong2@sporthub.vn` | `Sporthub@123` | Coach dự phòng, không được gán 2 lớp mới |
| Coach Bóng rổ | Trương Gia Huy | `coach.bongro@sporthub.vn` | `Sporthub@123` | Basketball 01/02 |
| Coach Bóng rổ | Đinh Hải Nam | `coach.bongro2@sporthub.vn` | `Sporthub@123` | Coach dự phòng, không được gán 2 lớp mới |
| Member | Member Binh | `binh.member@sporthub.vn` | `Sporthub@123` | Gói Gym, hóa đơn, ví, Assistant |
| Member | Member Khoi | `khoi.member@sporthub.vn` | `Sporthub@123` | Lớp Cầu lông, plan, kết quả, AI workout |
| Member | Member Hao | `hao.member@sporthub.vn` | `Sporthub@123` | Thuê sân, hóa đơn, đối soát đã cấp quyền lợi |
| Member | Member Khoa | `khoa.member@sporthub.vn` | `Sporthub@123` | Đối soát chưa cấp vé ngày |
| Member | Hồ Lê Thiên | `an.member@sporthub.vn` | Chưa xác minh | Member có sẵn, dự phòng |
| Member | Đồ của chung | `docuachung403@gmail.com` | Chưa xác minh | Member có sẵn, dự phòng |
| Member | Chonf | `hoanai3126@gmail.com` | Chưa xác minh | Member có sẵn, dự phòng |
| Member | An Ho | `holethiena@gmail.com` | Chưa xác minh | Member có sẵn, dự phòng |
| Member | Thiên An Hồ Lê | `holethienan3010@gmail.com` | Chưa xác minh | Member, không phải Admin |
| Member | Chonf | `nhatkhanhle11906@gmail.com` | Chưa xác minh | Member có sẵn, dự phòng |

**Email để tạo mới khi demo:** `holethienan2006@gmail.com` **chưa có tài khoản trong DB local**. Đăng nhập Google bằng email này sẽ tạo Member và lấy tên từ Google; sau đó mới làm **Forgot password?**. Các tài khoản ghi `Sporthub@123` ở trên đã được kiểm tra đăng nhập API local thành công ngày 27/10/2026. `Chưa xác minh` là tài khoản có sẵn, không chọn cho kịch bản đăng nhập nếu chưa thử trực tiếp. Khi chiếu màn hình, che ô mật khẩu.

## 2. Bảng thiết kế 6 flow — happy case trước

| Flow | Role / tài khoản | Chỗ cần bấm theo thứ tự | Cho thầy xem |
|---|---|---|---|
| **1. User & Membership** | Guest → Admin Demo 01 → Manager Demo → Member Binh → Lễ tân Demo; Google Member mới | **Guest:** Trang chủ → **Gym / Courses**.<br>**Admin Demo 01:** **Log in → Account management → Quản trị Demo 01**; quay lại, mở **Quản trị Demo 02**.<br>**Manager Demo:** **Sport → Membership**.<br>**Binh:** **Services → My services → Gym**; **Finance → Invoices**.<br>**Lễ tân Demo:** **Members → tìm Binh → hồ sơ → Gym check-in → xác nhận** một lần.<br>**Google:** **Log in → Sign in with Google → chọn `holethienan2006@gmail.com` → Log out → Forgot password? → Send reset link → mở Gmail → Reset password → Sign In**. | Guest thấy catalog; Admin không có nút Deactivate trên chính mình; 5 gói Gym và quyền lợi của Bình; check-in thành công; Google tạo Member mới, link quên mật khẩu gửi sau khi account đã tồn tại. |
| **2. Class booking & Court schedule** | Guest → Manager → Member Khoi → Coach Đặng Quốc → Member Hao | **Guest:** Trang chủ → **Courses → Badminton 01**.<br>**Manager:** **Sport → Classes → Badminton 01**; **Sport → Rooms → Badminton Rental BR1 → Rental pricing**.<br>**Khoi:** **Services → My services → lớp Cầu lông → Schedule**.<br>**Đặng Quốc:** **Classes → Badminton 01 → Students**.<br>**Hao:** **Services → My services → booking 29/10 18:00–19:00**. | Badminton 01 giá 900.000đ, 5 chỗ, 12 buổi từ 28/10; Coach thấy đúng roster; sân Cầu lông 100.000đ/giờ và booking của Hào. |
| **3. Payment, wallet & report** | Member Binh → Member Hao → Manager → Receptionist | **Binh:** **Finance → Invoices → hóa đơn Gym**; **Finance → Point wallet**.<br>**Hao:** **Finance → Invoices → hóa đơn thuê sân**; đối chiếu **Services → My services**.<br>**Manager:** **Billing management → Invoices → hóa đơn của Binh/Hao → Report**; xem **Point wallets** nếu cần.<br>**Receptionist:** **Members → hồ sơ Binh → tab Invoices**. | Hóa đơn, dịch vụ và báo cáo khớp. Hóa đơn fixture thanh toán tiền mặt là dữ liệu mô phỏng; chỉ gọi là giao dịch VNPay khi đã thanh toán sandbox và hệ thống cấp quyền lợi. |
| **4. Training & attendance** | Coach Đặng Quốc → Member Khoi | **Coach:** **Classes → Badminton 01 → Students → Khoi → Plan**; **Schedule → CAULONG-STARTED-01 → buổi đã qua → Attendance**.<br>**Khoi:** **Training → Plans → plan Coach → Results & progress → Schedule**. | Khôi có plan; buổi lịch sử có điểm danh Present và kết quả điểm 4. Không gắn kết quả quá khứ vào lớp mới bắt đầu 28/10. |
| **5. AI workout recommendation** | Member Khoi | **Log in → Training → Profile** (lưu hồ sơ nếu thiếu) → **Get AI Workout Suggestions → chọn Sport → Generate workout → Why this workout? → Save suggestion to Plans → Training → Plans → AI suggestion**. | Gợi ý bài tập từ hồ sơ của Khôi, được lưu và gắn nhãn AI; khác với plan do Coach tạo. Nếu generate lỗi, báo đúng là phần live AI chưa chạy. |
| **6. AI assistant** | Member Binh; Coach Đặng Quốc nếu cần | **Binh:** bấm linh vật **Ask SportHub → chọn câu hỏi / nhập câu hỏi về gói Gym → Send**; hỏi tiếp về hóa đơn → **Send → Finance → Invoices** để đối chiếu.<br>**Coach:** **Open Coach AI Assistant → hỏi về lớp mình → Send**. | Câu trả lời dựa trên dữ liệu người đang đăng nhập; màn nghiệp vụ là nơi đối chiếu. Manager AI xếp lịch chưa triển khai. |

## 3. Kịch bản bấm chi tiết và lời giải thích cho từng flow

Đọc bảng 2 để biết **thứ tự đổi role**, rồi làm từng bước dưới đây. Mỗi bước có ba phần: **ấn gì → phải thấy gì → thao tác này thể hiện điều gì**. Đăng xuất trước khi đổi tài khoản. Không bấm lại nút tạo giao dịch/check-in sau khi đã thành công.

### Flow 1 — Tài khoản, phân quyền và Membership Gym

**Mục tiêu trình bày:** từ người chưa đăng nhập đến Admin, Manager, Member và Receptionist; một người mua Gym có quyền lợi thực tế, còn lễ tân kiểm tra quyền đó trước khi cho vào Gym.

1. **Guest, không đăng nhập.** Mở trang chủ → bấm **Gym** và **Courses** trên khu vực công khai. **Phải thấy:** thông tin dịch vụ/lớp công khai; các màn cá nhân yêu cầu đăng nhập. **Nói với thầy:** Guest được tìm hiểu trung tâm nhưng chưa thể xem ví, hóa đơn hay lịch của Member.
2. **Admin Demo 01** (`admin.demo1@sporthub.vn`). Bấm **Log in → Account management** → tại ô **Search name or email**, nhập `admin.demo1@sporthub.vn` → bấm dòng **Quản trị Demo 01**. **Phải thấy:** vai trò Admin và trạng thái tài khoản; mục **Account status** cùng nút **Deactivate** không xuất hiện cho chính mình. **Nói với thầy:** giao diện không cho Admin tự vô hiệu hóa quyền truy cập của mình.
3. Quay lại **Account management** → tìm `admin.demo2@sporthub.vn` → mở **Quản trị Demo 02**. **Phải thấy:** với tài khoản khác, mục **Account status**, ô **Reason** và nút **Deactivate** xuất hiện; lý do sẽ được ghi audit nếu thao tác được xác nhận. **Dừng trước Confirm** để không đổi DB demo. **Nói với thầy:** backend còn chặn Admin hoạt động cuối cùng; vì UI đã chặn tự vô hiệu hóa, không có chuỗi bấm độc lập để gây lỗi “Admin cuối cùng” từ màn hình này. Hệ thống dùng Deactivate/Activate, không xóa staff khỏi DB.
4. Vẫn là Admin → **Account management → Create staff account**. **Phải thấy:** form nhập email, tên, role; khi chọn Coach phải chọn chuyên môn. **Đóng form mà không lưu.** **Nói với thầy:** chỉ Admin tạo tài khoản nhân sự; Manager quản lý lớp/dịch vụ, không tự tạo Coach.
5. **Manager Demo** (`manager.demo@sporthub.vn`). **Log in → Sport → Membership**. Bấm lần lượt các gói trong danh sách để chỉ giá: 1 tháng **600.000đ**, 3 tháng **1.800.000đ**, 6 tháng **2.400.000đ** (giá gốc 3.600.000đ), 12 tháng **6.000.000đ** (giá gốc 7.200.000đ), vé ngày **50.000đ**. **Nói với thầy:** Manager cấu hình danh mục và giá; quyền lợi chỉ phát sinh khi Member mua, không phát sinh vì gói đang hiện trong catalog.
6. **Member Binh** (`binh.member@sporthub.vn`). **Log in → Services → My services** → mở thẻ Gym của Bình → xem ngày bắt đầu/kết thúc và trạng thái; tiếp tục mở menu tài khoản → **Finance → Invoices** → mở hóa đơn Gym. **Phải thấy:** gói đang dùng và hóa đơn của **cùng một Member**. **Nói với thầy:** hóa đơn đã trả dẫn đến quyền lợi Gym; đây là fixture thanh toán tiền mặt local, không gọi là VNPay live.
7. **Lễ tân Demo** (`letan.demo@sporthub.vn`). **Log in → Members** → tìm `binh.member@sporthub.vn` → chọn Bình → xem gói Gym và ngày hết hạn → bấm **Check in** một lần → mở tab **Visits**. **Phải thấy:** lượt check-in mới trong lịch sử và nút tạm có đếm ngược cooldown. **Nói với thầy:** quầy tra đúng Member và quyền lợi trước khi cho vào; chống check-in trùng liên tiếp. Làm bước này trong giờ Gym mở cửa; nếu ngoài giờ, chỉ mở lịch sử thay vì tuyên bố check-in thành công.
8. **Đăng nhập Google và quên mật khẩu bằng email để trống.** **Log out → Log in → Sign in with Google** → chọn đúng Gmail `holethienan2006@gmail.com`. **Phải thấy:** chuyển vào Member mới, email xuất hiện trên hồ sơ; tên do Google trả về. **Nói với thầy:** Google email đã xác minh tạo Member và liên kết Google, không dùng fixture cũ. Sau đó **Log out → Forgot password? → nhập cùng email → Send reset link → mở Gmail → bấm link → nhập 2 lần mật khẩu mới → Reset password → Sign In bằng email/mật khẩu mới**. **Nói với thầy:** link một lần cho phép đặt mật khẩu nội bộ sau khi account Google đã tồn tại. Không chiếu link/token trên màn hình chung.

### Flow 2 — Lớp học, giữ chỗ và lịch sân

**Mục tiêu trình bày:** cùng một lớp được thấy từ trang công khai, Manager, Coach và Member; ghi danh chiếm chỗ đúng, còn sân thuê theo slot không trùng lịch.

1. **Guest.** Trang chủ → **Courses → Badminton 01**. **Phải thấy:** tên lớp, Coach Đặng Quốc, giá **900.000đ**, **12 buổi**, ngày bắt đầu **28/10/2026**, sức chứa **5**. **Nói với thầy:** người chưa đăng nhập có thể xem thông tin lớp nhưng muốn ghi danh phải trở thành Member và thanh toán.
2. **Manager.** **Log in → Sport → Classes** → tìm/bấm **Badminton 01** (`LOCAL-DEMO-20261028-BAD-01`) → xem tab **Overview**, rồi **Sessions**, rồi **Students**. **Phải thấy:** Published, còn chỗ, 12 buổi có phòng/Coach, một ghi danh fixture. **Nói với thầy:** publish làm lớp xuất hiện cho Member; lịch buổi, phòng và Coach gắn với lớp; bộ đếm chỗ phản ánh ghi danh.
3. Trong tài khoản Manager, **Sport → Rooms → Badminton Rental BR1 → Rental pricing**; quay lại **Rooms → Basketball Rental KR1 → Rental pricing**. **Phải thấy:** giá thuê riêng lần lượt **100.000đ/giờ** và **200.000đ/giờ**. **Nói với thầy:** bảng giá sân tách khỏi học phí lớp; một sân chỉ thuê được ở khung không bị lớp/booking chiếm.
4. **Coach Đặng Quốc** (`coach.caulong@sporthub.vn`). **Log in → Classes → Badminton 01 → Students**. **Phải thấy:** Khôi trong danh sách học viên. **Nói với thầy:** Coach chỉ quản lý roster của lớp mình được phân công. Đừng dùng `coach.caulong2@sporthub.vn`, vì tài khoản đó không dạy lớp fixture này.
5. **Member Khoi** (`khoi.member@sporthub.vn`). **Log in → Services → My services → lớp Badminton 01**, rồi **My schedule**. **Phải thấy:** ghi danh đã xác nhận và lịch buổi học tương ứng. **Nói với thầy:** sau thanh toán, lớp xuất hiện cả ở dịch vụ sở hữu lẫn lịch cá nhân; không mua lại lớp này để demo.
6. **Member Hao** (`hao.member@sporthub.vn`). **Services → My services → booking sân Cầu lông ngày 29/10/2026, 18:00–19:00** → mở chi tiết sân/giờ; qua **Finance → Invoices** mở hóa đơn **100.000đ**. **Nói với thầy:** booking, slot sân và hóa đơn cùng tham chiếu một lần thuê. **Services → Explore packages → Court → Select** để chỉ lịch slot trống, dừng trước **Pay** nếu không làm giao dịch live.
7. **Nếu cần ghi danh live để chứng minh giữ chỗ:** dùng Member Google mới ở Flow 1 → **Services → Explore packages → Class → Badminton 01 → Select** → mở checkout. **Phải thấy:** chỗ được giữ trong thời hạn checkout, hóa đơn chờ thanh toán. Nếu VNPay sandbox đã sẵn, bấm **Pay with VNPay**, hoàn tất ở cổng, quay lại **My services** và **My schedule** để chỉ ghi danh mới. **Nói với thầy:** khi chưa xác minh thanh toán chỉ có hold; khi đã thanh toán mới thành enrollment. Chỉ tuyên bố live thành công sau khi quyền lợi thật xuất hiện.

### Flow 3 — Hóa đơn, ví điểm, thanh toán và báo cáo

**Mục tiêu trình bày:** tiền/giao dịch được truy từ hóa đơn sang dịch vụ, ví và báo cáo; phân biệt fixture local với giao dịch VNPay sandbox thật.

1. **Member Binh.** Mở menu tài khoản → **Finance → Invoices** → chọn lọc **Paid** nếu cần → mở hóa đơn gói Gym. **Phải thấy:** chủ hóa đơn là Bình, số tiền/gói Gym và trạng thái đã trả. **Nói với thầy:** một giao dịch tạo hóa đơn có loại dịch vụ rõ ràng; Member chỉ xem hóa đơn của mình.
2. Vẫn là Bình → **Finance → Point wallet**. **Phải thấy:** số điểm khả dụng và lịch sử điểm của Bình. **Nói với thầy:** 1 điểm tương ứng 1.000đ khi dùng thanh toán; ví điểm là sổ riêng với hóa đơn tiền. Không nói rằng hóa đơn fixture này đã trừ điểm nếu dòng chi tiết không thể hiện điều đó.
3. **Member Hao.** **Finance → Invoices** → mở hóa đơn thuê sân **100.000đ** → trở lại **Services → My services** tìm booking 29/10 18:00–19:00. **Phải thấy:** tiền đã ghi nhận và dịch vụ thuê sân đã được cấp. **Nói với thầy:** chứng minh kết nối `Invoice → Payment → CourtRental`, không chỉ một dòng doanh thu rời.
4. **Manager.** **Billing management → Invoices** → tìm hóa đơn của Bình hoặc Hào → **Report** → chọn **This month → Apply filters**; nếu cần lọc **Source = Membership** hoặc **Hourly court rental** rồi bấm **Apply filters** lại. **Phải thấy:** báo cáo đổi theo kỳ/nguồn. **Nói với thầy:** Manager xem tổng hợp từ giao dịch phát sinh, trong khi Member chỉ xem tài chính của chính mình. Số báo cáo có thể gồm các giao dịch local khác, nên không đọc nó như tổng của riêng hai hóa đơn vừa mở.
5. **Receptionist.** **Members → tìm Bình/Hào → mở hồ sơ → tab Invoices** → mở đúng hóa đơn. **Nói với thầy:** lễ tân tra hóa đơn để hỗ trợ tại quầy nhưng không có quyền cấu hình giá/báo cáo như Manager.
6. **Nếu trình diễn thanh toán VNPay live:** dùng Member Google mới chưa có Gym → **Services → Explore packages → Gym → Gym 1 month → Choose plan → VNPay → Pay with VNPay** → hoàn tất sandbox → quay lại **Finance → Invoices** và **Services → My services**. **Phải thấy cả hai:** hóa đơn đã trả **và** gói Gym được cấp. **Nói với thầy:** trang return chỉ là điều hướng; kết quả thật cần được backend xác minh/IPN hoặc đối soát. Các hóa đơn dựng sẵn mang `LOCAL_DEMO` hoặc payment tiền mặt không chứng minh tích hợp VNPay.
7. **Sau happy case, nếu thầy hỏi đối soát:** đăng nhập Hào mở hóa đơn `PAID_AFTER_RECONCILIATION` đã **FULFILLED** và có Gym 3 tháng; đăng nhập Khoa mở vé ngày `RECONCILIATION_REQUIRED`, màn hóa đơn báo **Payment received, service not activated**. **Nói với thầy:** hệ thống không tự cấp quyền lợi khi thanh toán được xác minh muộn nhưng nghiệp vụ không còn đủ điều kiện.

### Flow 4 — Coach lập kế hoạch, điểm danh và kết quả

**Mục tiêu trình bày:** chỉ Coach phụ trách mới xem/lập kế hoạch cho học viên trong lớp; kết quả gắn với buổi đã diễn ra và Member xem lại được.

1. **Coach Đặng Quốc.** **Log in → Classes → Badminton 01 → Students → Khoi**. Mở tab **Plans**. **Phải thấy:** plan của Khôi trong lớp của Coach. **Nói với thầy:** quyền đọc/lập plan đi qua quan hệ Coach–lớp–Member, không phải Coach bất kỳ cũng thấy mọi Member.
2. Quay về **Students**, bấm **Plan** ở dòng Khôi nếu muốn minh họa form tạo. **Phải thấy:** form kế hoạch đã gắn Khôi và lớp; chỉ nhập/lưu nếu thật sự muốn thêm một plan mới. **Nói với thầy:** kế hoạch cá nhân được lưu theo đúng người học, không phải một ghi chú chung cho cả trung tâm.
3. **Classes / Schedule → CAULONG-STARTED-01 → chọn buổi lịch sử → Attendance**. **Phải thấy:** Khôi đã **Present** và có kết quả/nhận xét điểm **4**. **Nói với thầy:** điểm danh xác nhận tham gia buổi; kết quả được ghi cho buổi quá khứ của đúng Coach. Buổi lịch sử đã đóng cửa sổ điểm danh, nên đây là màn **xem lại**, không bấm điểm danh live.
4. **Member Khoi.** **Log in → Training → Plans** → mở plan Coach; chuyển **Results & progress** → mở kết quả; bấm link **View my class and court schedule**. **Phải thấy:** Member xem kế hoạch/kết quả của chính mình và lịch lớp tương ứng. **Nói với thầy:** dữ liệu Coach tạo được phản chiếu về Member nhưng Member không sửa kết quả của Coach.

### Flow 5 — Gợi ý bài tập AI cho Member

**Mục tiêu trình bày:** Member khai hồ sơ để hệ thống có đầu vào; gợi ý bài tập được sinh, có giải thích và được lưu tách với plan của Coach.

1. **Lưu ý dữ liệu hiện tại:** `khoi.member@sporthub.vn` **chưa có Training profile trong DB local**. Đăng nhập Khôi → **Training → Profile**. **Phải thấy:** form hồ sơ chưa hoàn tất; nút **Get AI Workout Suggestions** chỉ xuất hiện sau khi profile đủ dữ liệu. **Nói với thầy:** AI không suy đoán khi thiếu mục tiêu/thông tin cơ bản; Member chủ động khai và đồng ý lưu.
2. Trên form, chọn **Goal type = General fitness**, **Experience level = Beginner**; điền **Date of birth** hợp lệ (ví dụ `2002-01-15`), **Sex**, **Height = 170 cm**, **Weight = 65 kg**; chọn **Daily activity = Lightly active**, **Training days per week = 3**; tích ô đồng ý rồi bấm **Save profile**. Đây là dữ liệu mẫu cho Member fixture, không lấy thông tin sức khỏe thật của ai. **Phải thấy:** profile hoàn tất và phần **AI Workout Suggestions** xuất hiện. **Nói với thầy:** gợi ý dựa vào hồ sơ được Member tự khai, không phải một bài mẫu cố định cho mọi người.
3. Bấm **Get AI Workout Suggestions** → chọn **Sport = Badminton** nếu có trong danh sách → bấm **Generate workout**. **Phải thấy:** danh sách bài tập với sets/reps, dữ liệu hoạt động gần đây và mục **Why this workout?**. **Nói với thầy:** đầu ra có lý do và thông số để Member hiểu vì sao nhận gợi ý; đây là gợi ý tự động, chưa phải giáo án Coach duyệt.
4. Bấm **Save suggestion to Plans** → ở **Training → Plans**, lọc/chọn **AI suggestion / Created by AI** → mở gợi ý vừa lưu; so với plan Coach trong Flow 4. **Nói với thầy:** nhãn nguồn cho biết bài nào AI sinh, bài nào do Coach lập. Nút Save lưu bản gợi ý vào trình duyệt đang demo; request generate cũng được ghi lịch sử phía backend, nhưng đây chưa phải plan Coach phê duyệt. Nếu generate báo lỗi, dừng tại thông báo lỗi và nói rõ dịch vụ AI live chưa chạy; không trình bày plan Coach như kết quả AI.

### Flow 6 — AI assistant theo ngữ cảnh tài khoản

**Mục tiêu trình bày:** Assistant giúp Member hỏi dữ liệu của mình bằng ngôn ngữ thường; câu trả lời phải đối chiếu được trên màn nghiệp vụ.

1. **Member Binh.** **Log in** → bấm linh vật **Ask SportHub** ở góc giao diện → chọn một câu hỏi gợi ý hoặc nhập “Gói Gym của tôi còn hiệu lực đến khi nào?” → bấm **Send**. **Phải thấy:** câu trả lời về quyền lợi của tài khoản Bình. **Nói với thầy:** backend lấy ngữ cảnh từ Member đang đăng nhập, không yêu cầu người dùng nhập ID hoặc dữ liệu của người khác.
2. Trong cùng cửa sổ, nhập “Tôi có hóa đơn Gym nào đã thanh toán?” → **Send** → đóng Assistant → **Finance → Invoices** → mở hóa đơn Gym. **Nói với thầy:** Assistant giúp tìm/giải thích, còn hóa đơn trên màn tài chính là nguồn để xác nhận; nếu câu trả lời AI không khớp thì không tuyên bố đúng.
3. Nếu cần chỉ role Coach, **Đặng Quốc → Log in → Open Coach AI Assistant → hỏi về lớp Cầu lông mình phụ trách → Send**. **Nói với thầy:** Coach có ngữ cảnh lớp của mình; Assistant không tự ghi plan, điểm danh hay thay Manager xếp lịch. Phần Manager AI xếp lịch/function calling chưa triển khai nên không đưa vào demo happy case.

**Lưu ý khi trình bày:** chức năng tài khoản staff là **Deactivate/Activate**, không xóa. UI ẩn Deactivate trên chính Admin; backend cũng chặn vô hiệu hóa Admin hoạt động cuối cùng. Với UI hiện tại không thể bấm riêng để gây lỗi “Admin cuối cùng” vì người còn lại cũng chính là người đang thao tác. Dừng trước **Confirm** khi mở hồ sơ Admin Demo 02 để giữ dữ liệu. Nếu cần mua lớp/thuê sân live, chọn slot trống và chờ VNPay sandbox xác minh rồi mới chỉ quyền lợi; các fixture `LOCAL_DEMO` không phải giao dịch VNPay thật.

**Mở hệ thống:** nếu các container đã dừng sau khi khởi động lại máy, từ gốc repo chạy `docker compose up -d postgres ai-service backend frontend`, đợi backend sẵn sàng rồi mở `http://localhost:3000`. Sau lệnh `docker compose up -d --build backend frontend`, nếu trang đang mở báo “We could not reach SportHub”, đợi container khởi động xong và tải lại trang trước khi bấm **Sign In**. Đã thử đăng nhập `manager.demo@sporthub.vn` bằng trình duyệt local: API trả HTTP 200 và chuyển đến `/manager`. Không chạy lại seed hoặc reset để chỉ demo. Lịch sử seed/backup nằm ở [Local-Demo-Seed-2026-10-27.md](Local-Demo-Seed-2026-10-27.md); tài liệu đó không phải kịch bản trình bày.
