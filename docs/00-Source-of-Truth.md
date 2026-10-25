# SportHub — Nguồn thống nhất về phạm vi và quy ước

**Quyết định 25/10/2026 — trạng thái tài khoản:** tài khoản chỉ có `ACTIVE` (Active) và `DEACTIVATED` (Deactivated). Admin dùng Activate/Deactivate kèm lý do bắt buộc; không có trạng thái hoặc thao tác Banned/Locked riêng. Dữ liệu `BANNED` cũ chuyển thành `DEACTIVATED`, tuyệt đối không tự mở lại tài khoản. Trạng thái lời mời/chờ đặt mật khẩu là metadata và bộ lọc riêng, không phải `UserStatus`; bật lại quyền truy cập không xác minh email hay thay thế việc đặt mật khẩu. Giữ audit, vô hiệu phiên, chặn tự vô hiệu hóa và bảo vệ Admin Active cuối cùng; không tự hủy quyền lợi, lịch hoặc ví. Các quy tắc tài khoản trong [Business Rules](SportManagement_BusinessRules_v2.0_updated.docx) và [API contract](api-contract.md#admin-account-administration) dùng cùng hai trạng thái; `/lock` và `/unlock` chỉ giữ tương thích với `/deactivate` và `/activate` tương ứng.

**Quyết định 24/10/2026 — [Thanh toán, đối soát và hỗ trợ hoàn tiền](Payment-Support-Workflow.md):** giữ ví điểm và hoàn điểm; vé Gym 1 ngày chỉ bán 06:00–22:00 và hết hạn 22:00 cùng ngày (bỏ quy tắc 24 giờ); thanh toán đến muộn còn chỗ thì tự cấp và đánh dấu `PAID_AFTER_RECONCILIATION`, hết chỗ thì Member nhận điểm ngay hoặc gửi Support Request; Support Request có SLA 48 giờ, Member gửi lại (Remind us) và nhắc nhân viên; request PAYMENT bắt buộc chọn hóa đơn và 1–3 ảnh, không nhập số tài khoản (Manager gọi điện cho Member rồi ghi chú), Lễ tân thấy, tạo hộ và bấm Remind giúp Member (chỉ Manager xử lý), Manager chuyển khoản ngoài hệ thống rồi ghi nhận số tiền, ghi chú và ảnh chứng từ; đã mua thì không hoàn khi Member tự hủy. Văn bản này thay thế các đoạn cũ mâu thuẫn bên dưới.

**Manager workspace — quyết định 20/10/2026:** Giữ nguyên Overview/chi tiết lớp; tập trung Request, Incident và thông báo trong Support & Communication; chọn Sport trực tiếp khi tạo sân, giữ khóa loại sân cũ cho tương thích dữ liệu. Bỏ giao diện cộng/trừ điểm thủ công đại trà, hồ sơ sức khỏe và giao diện quan hệ Coach–Member của Manager; quyết định 25/10/2026 cho phép tặng điểm có lý do và phê duyệt trong phạm vi sự cố Gym tạm thời theo mục 4. Cho phép buổi bù có Incident hợp lệ dù lớp có học viên. Tính năng Course interests / “chờ đợt sau” đã bị loại bỏ hoàn toàn. Quyết định này thay thế các đoạn mô tả cũ mâu thuẫn bên dưới; tài khoản staff và phân quyền vẫn thuộc Admin.

SportHub là **hệ thống quản lý trung tâm thể thao với ba môn Gym, cầu lông và bóng rổ; có thể mở rộng thêm môn trong tương lai**. Gym chỉ bán Membership có thời hạn và vé Gym 1 ngày.

Catalog cập nhật 19/10/2026: form tạo Sport có tùy chọn tạo Room Type, mặc định tắt. Bật thì Manager tự nhập tên Room Type, hệ thống tạo và liên kết cùng Sport trong một transaction; tắt thì giữ nguyên hành vi tạo Sport và không thay đổi Room Type. Không tự đặt tên, không tạo sân vật lý. Chi tiết trong [API contract](api-contract.md).

Flow 2 cập nhật 19/10/2026: Manager tạo sân cho thuê cùng giờ hoạt động và giá trong một lần lưu; mở thuê thành công thì Member đặt được các slot trống hợp lệ. Court Rental Pricing nhận giá riêng theo sân; giá chung theo loại sân vẫn được giữ. Chi tiết tại [API contract](api-contract.md#tạo-sân-cho-thuê-trọn-gói--19-october-2026).


Ghi danh giữa chừng cập nhật 20/10/2026: khóa `Published` hoặc `InProgress` đều nhận đăng ký khi còn chỗ và Manager chưa đóng đăng ký, **dù đã qua bao nhiêu buổi**. Chỉ dừng khi hết chỗ, khóa `Completed`/`Cancelled`, hoặc không còn buổi nào sắp tới (`class_started`). Học phí vẫn là **giá trọn khóa**, không tính theo tỷ lệ buổi còn lại. Member chỉ học từ buổi kế tiếp; buổi đã qua không tạo vắng mặt. Màn Member hiển thị "đã học X/N buổi, còn Y buổi". Hủy ghi danh khi khóa đã bắt đầu vẫn không hoàn tự động. Chi tiết trong [API contract](api-contract.md).

M03/M04 cập nhật 18/10/2026: Xử lý sự cố và bố trí buổi bù. Theo yêu cầu mới nhất, bỏ chức năng hệ thống tự tìm/đề xuất lịch. Manager nhập ngày giờ, phòng và HLV; hệ thống kiểm tra hợp lệ/xung đột khi lưu. Buổi bị gián đoạn/không diễn ra được học lại nguyên thời lượng; buổi đã học đủ chỉ ghi nhận. Giữ lịch sử, không tính phút bù, không chuyển lớp/hoàn điểm trong luồng này.

## 1. Thứ tự nguồn và cách giải quyết mâu thuẫn

Hạng 5 ngày 18/10/2026: Quy trình hỗ trợ Member. Receptionist và Manager có workspace tiếp nhận/phân công/cập nhật/đóng, cùng quyền FrontDesk theo FR-22; mọi nhân sự quầy được xử lý yêu cầu của người khác. Đoạn SRS cũ loại Support Request khỏi phạm vi không còn áp dụng. Tiến độ mới nhất nằm trên yêu cầu, các thao tác giữ trong audit. Member tự gửi từ trang Trợ giúp (`POST /api/support/requests`); SLA 48 giờ, Remind us và hoàn tiền chuyển khoản theo [Thanh toán, đối soát và hỗ trợ hoàn tiền](Payment-Support-Workflow.md).

M06 xác nhận 18/10/2026: Chốt lớp thiếu học viên. Đánh giá trước ít nhất 72 giờ; phản hồi tối đa 48 giờ, kết thúc ít nhất 24 giờ trước buổi đầu. Đạt ngưỡng thì xác nhận ngay và giữ người còn ghi danh, kể cả chưa phản hồi; lựa chọn đã xử lý vẫn có hiệu lực. Hết hạn vẫn thiếu và chưa được Manager miễn ngưỡng có lý do/audit thì hủy/hoàn. Kiểm tra muộn phải chốt hoặc dời khai giảng, không để lớp chưa xác nhận tự bắt đầu. Thông báo trong hệ thống/email cho Member, Manager và HLV liên quan. Nội dung này thay thế cách đọc BR-120/UC hết hạn cũ rằng luôn hoàn người chưa phản hồi dù lớp đã đạt ngưỡng.

**Quyết định đã xác nhận:** [Kích hoạt staff và quyền Audit log](api-contract.md#staff-activation-and-audit-policy-update--14-october-2026). Link staff hết hạn đúng `CreatedAt + 24 giờ`; gửi lại hoặc sửa email không đổi mốc này. Admin xem mọi log do Manager/Admin/Coach thực hiện và log hệ thống; Manager xem mọi log do Manager/Receptionist/Coach/Member thực hiện. Phạm vi dựa trên role được ghi tại thời điểm thao tác, không dựa role hiện tại của tài khoản.

1. Yêu cầu trực tiếp đã xác nhận của chủ sản phẩm, bao gồm phạm vi ba môn (Gym, cầu lông, bóng rổ) và vé Gym 1 ngày.
2. [Business Rules](SportManagement_BusinessRules_v2.0_updated.docx): quy tắc nghiệp vụ cụ thể.
3. [Thiết kế hệ thống](Center-Management-System-Design-v3.md): kiến trúc, dữ liệu, transaction, luồng và khoảng trống triển khai.
4. [Functional & Nonfunctional Specification](Functional-and-Nonfunctional-Spec.md), [API contract](api-contract.md), Phụ lục A (từ điển dữ liệu) của [thiết kế hệ thống](Center-Management-System-Design-v3.md): yêu cầu, field/mapping và hợp đồng tích hợp.
5. [PRODUCT](../PRODUCT.md), [DESIGN-TOKENS](../DESIGN-TOKENS.md): sản phẩm và nguồn token duy nhất.

Mã nguồn/controller/configuration xác định hành vi đã triển khai, không tự thay thế yêu cầu nghiệp vụ. Khi thiết kế và mã khác nhau, ghi gap cùng evidence; không tuyên bố hoàn thành chỉ vì đã có trong tài liệu. SRS Word là tài liệu yêu cầu tổng quan; các mô tả chi tiết chưa đồng bộ phải đọc theo phạm vi và thiết kế hiện hành.

Phạm vi Flow 4 được chủ sản phẩm xác nhận ngày 18/10/2026: không quản lý dịch vụ PT 1:1. Coach của lớp cầu lông/bóng rổ được phân công có thể tạo workout plan, ghi workout result/nhận xét, giao homework, gửi thông báo và điểm danh đúng buổi. AI gợi ý cho Coach thuộc Flow 5; Coach kiểm tra trước khi lưu nội dung. Các quy tắc PT cũ trong Business Rules và SRS chỉ còn giá trị tham khảo lịch sử, không áp dụng cho phạm vi hiện hành. Chi tiết hợp đồng tại [API contract](api-contract.md#contract-giao-diện-nghiệp-vụ).

Quyết định Flow 2/4 ngày 18/10/2026: Coach chỉ gửi báo vắng kèm lý do cho buổi được phân công và có thể rút báo vắng khi còn Pending; Coach không sửa báo vắng hoặc tự chọn dạy thay/dời lịch/học bù. Center Manager liên hệ Coach khác khi cần, rồi quyết định phương án và kiểm tra lại chuyên môn/lịch trống trước khi lưu. Thay đổi lịch và cập nhật yêu cầu trong cùng transaction. Chi tiết route tại [API contract](api-contract.md).

Đối chiếu code `06683826`: giao diện Coach chỉ tạo ABSENCE; thao tác sửa và API PUT đã gỡ. Backend tạo request còn nhận các loại đề xuất cũ để tương thích client; đây là gap COACH-01 trong [thiết kế §13.2](Center-Management-System-Design-v3.md#132-chức-năng-và-contract-còn-thiếu), không thay đổi quyết định nghiệp vụ chỉ báo vắng. Ba loại SUBSTITUTE/RESCHEDULE/CANCEL_WITH_MAKEUP vẫn là phương án xử lý hợp lệ của Manager.

Quyền đọc sau khi lớp hoàn thành: Member còn Enrollment Confirmed và `EndedAt == null` vẫn đọc lịch sử buổi, nội dung chung và bản ghi cá nhân của mình trong lớp Published/InProgress/Completed. Ghi danh kết thúc hoặc lớp Cancelled/Draft thì mất quyền nội dung. Coach chủ nhiệm chỉ được cấp quyền hồ sơ từ lớp Published/InProgress có ghi danh còn hiệu lực; dạy thay chỉ cấp quyền buổi được giao, không mở hồ sơ đầy đủ hoặc nội dung cả khóa. Quyền bàn giao đánh giá lớp trước phải dựa trên lớp chủ nhiệm hiện tại còn hợp lệ. Điều kiện có buổi tương lai chỉ áp dụng cho context AI/nhắc lịch Member, không áp dụng cho quyền xem lịch sử Completed.

## 2. Phạm vi và thuật ngữ

M02 xác nhận 18/10/2026: Vòng đời phân công Coach–Member. Mọi nguồn phân công, kể cả Manager gán thủ công, tự kết thúc khi không còn ghi danh Confirmed trong lớp Published/InProgress do Coach đó phụ trách. Còn lớp chung khác thì giữ Active; học lại tạo bản ghi mới và giữ lịch sử. Tạo tay dùng API quan hệ hiện có và phải có lớp chung hợp lệ.

| Thuật ngữ | Nghĩa thống nhất |
|---|---|
| Sport | Môn cấu hình: Gym, cầu lông, bóng rổ; mở rộng được |
| Vé Gym 1 ngày | Gói Gym cố định 50.000đ, chỉ bán từ 06:00 đến trước 22:00 giờ Việt Nam và hết hạn 22:00 cùng ngày (`member_packages.expires_at_utc`), check-in tại quầy bằng mã QR hội viên do server cấp |
| Membership | Quyền vào Gym có thời hạn; không phải vé lớp nhóm |
| Class | Khóa học cố định gồm nhiều buổi, mua cả khóa |
| ClassSession | Một buổi của khóa học |
| Enrollment | Ghi danh vào Class sau thanh toán, không phải booking từng buổi |
| SeatHold | Giữ chỗ checkout tạm thời, có hạn |
| Occupancy | Nguồn chống trùng lịch sân/phòng và Coach |
| CourtRental | Lượt thuê sân theo giờ của Member; tính tiền thuê của Member, không quan tâm mục đích sử dụng (kể cả dạy học) |
| CheckoutSession | Một cycle mua/giữ tài nguyên, giữ lịch sử retry |
| PaymentAttempt | Một lần thử thu phần tiền qua gateway |
| Payment | Khoản tiền đã được backend xác minh |
| PointWallet/PointLedgerEntry | Ví và lịch sử điểm; 1 điểm = 1.000 VND, hoàn bằng điểm |
| PaymentAdjustment | Persistence hoàn điểm theo invoice item; không có bảng Refund độc lập |

## 3. Vai trò và luồng

Năm role: SystemAdministrator, CenterManager, Receptionist, Coach, Member. SRS gốc chỉ có bốn role (Manager, Coach, Member, Receptionist); SystemAdministrator là role bổ sung, chia việc với Manager: Admin nhận quản lý tài khoản staff, phân quyền (đổi role) và đọc log do Manager/Admin/Coach thực hiện cùng log hệ thống; Manager giữ vận hành trung tâm và đọc log do Manager/Receptionist/Coach/Member thực hiện. Phạm vi theo vai trò hiện hành nằm trong [Functional & Nonfunctional Specification](Functional-and-Nonfunctional-Spec.md#1-phạm-vi-vai-trò-và-kiến-trúc). Guest là người chưa đăng nhập (xem được landing page và nội dung công khai), không phải role lưu trong database. Mọi Member đều có chức năng thuê sân (BR-140). Một Coach có thể có nhiều chuyên môn; quyền truy cập dựa cả role và quan hệ được phân công.

| Luồng | Phạm vi |
|---|---|
| User/Membership | Identity, OTP, account/profile, Membership Gym, renewal/check-in |
| Class/Schedule | Môn/phòng/giá, lớp nhiều buổi, hold/enrollment, threshold, occupancy, rental, incident |
| Payment/Report | Invoice snapshot, checkout, VNPay/điểm, reconciliation, refund điểm, báo cáo |
| Training/Attendance | Plan/result/đánh giá và homework theo lớp; Receptionist hoặc Coach được phân công điểm danh đúng buổi |
| AI workout | Gợi ý cho Coach trong phạm vi học viên được giao |
| AI assistant | Member context chat; Manager xếp lịch/tạo nháp là phần chưa triển khai |

Ngoài phạm vi: đa chi nhánh, payroll/hợp đồng, chia doanh thu với người thuê sân, quản lý người đi cùng khi Member thuê sân, mobile native, VNPay production và gọi API hoàn tiền của ngân hàng hoặc VNPay (Manager chuyển khoản hoàn tiền ngoài hệ thống và ghi nhận qua Support Request thuộc phạm vi). Không có waitlist hay đăng ký nhận tin khóa sau.

## 4. Bất biến nghiệp vụ

- Quy tắc xác nhận 13/10/2026 (BR-96): một Coach có thể dạy nhiều môn, có ít nhất một chuyên môn và được chọn nhiều môn ngay khi Admin tạo tài khoản hoặc đổi role sang Coach. Manager chỉnh sửa chuyên môn; phân công lớp phải khớp chuyên môn. Giới hạn đúng một môn trong luồng tạo Coach hiện tại là khoảng trống triển khai, không phải quy tắc nghiệp vụ.
- Quy tắc xác nhận 13/10/2026: không đổi role của bất kỳ tài khoản đang là SystemAdministrator nào, kể cả chính mình và Admin khác. Việc tạo Admin hoặc nâng một tài khoản staff khác lên Admin vẫn được phép. Quy tắc Activate/Deactivate tuân theo quyết định 25/10/2026; vẫn bảo vệ Admin Active cuối cùng.
- Membership Gym và gói lớp độc lập.
- Vé Gym 1 ngày (day pass): giá cố định 50.000đ (seed cố định, Manager không sửa hay ngừng được), chỉ bán từ 06:00 đến trước 22:00 giờ Việt Nam và hết hạn 22:00 cùng ngày mua (ví dụ mua 14:00 ngày 18/11 hết hạn 22:00 ngày 18/11), check-in bằng mã QR hội viên do server ký và cấp; Trong 60 phút cuối trước giờ đóng cửa 22:00 (từ 21:00), lúc đặt vé hệ thống ghi chú Gym đóng cửa lúc 22:00 và vé chỉ có hiệu lực đến lúc đó. Thanh toán thành công sau 22:00 thì không tự cấp vé mà đi theo nhánh chưa cấp quyền lợi. Không bán khi Gym đang đóng cửa vì sự cố, không gia hạn khi đóng Gym, không hoàn trả.
- Giá/thời hạn/quyền lợi đã mua dùng snapshot, không tính lại khi sửa catalog.
- Enrollment theo khóa; attendance theo enrollment/session; lớp nhóm Present/Absent.
- JWT xác định danh tính và role của Coach; `classId`/`sessionId` xác định tài nguyên được yêu cầu. Backend đối chiếu Coach từ JWT với Coach được phân công cho lớp/buổi trước khi cấp quyền. `sessionId` không phải mã xác thực hay giá trị thay thế JWT.
- ReservedCount bao gồm chỗ giữ và đã xác nhận; ConfirmedCount <= ReservedCount <= Capacity.
- Ghi lịch phải đi qua occupancy trong transaction, không chỉ kiểm availability ở UI.
- TotalAmount = PointsApplied × 1.000 + CashAmount; backend quyết định amount, không nhận client làm nguồn giá.
- Return URL không xác nhận payment. Chỉ callback/query được xác minh cấp quyền lợi; retry không thu/cấp/hoàn trùng.
- Điểm chỉ giữ/trừ theo xác nhận; dùng điểm hộ cần OTP Member. Hoàn trả bằng điểm theo item và cap hệ thống tính. Đã mua thì không hoàn khi Member tự hủy; hoàn chuyển khoản chỉ qua Support Request do Manager ghi nhận ([Thanh toán, đối soát và hỗ trợ hoàn tiền](Payment-Support-Workflow.md)).
- Thanh toán đến muộn (BR-88): còn chỗ thì tự cấp quyền lợi, đánh dấu `PAID_AFTER_RECONCILIATION`, không cần nhân viên xác nhận; không cấp được thì Member nhận điểm ngay hoặc gửi Support Request.
- Hoàn chuẩn Membership Gym tối đa 50% (còn ≥ 2/3 thời hạn). **Quyết định 25/10/2026 cho sự cố Gym tạm thời** (hỏng/sửa chữa): không gia hạn `EndDate` Membership và không dời `StartDate` gói nối tiếp để bù. Sau khi xác định sự cố và các Member có Membership Active bị ảnh hưởng, Manager lọc danh sách người nhận (tìm theo tên/email/mã Member, trạng thái/gói Membership và khoảng thời gian bị ảnh hưởng), chọn người được tặng, tự quyết định số điểm nguyên dương cho từng người (có thể áp dụng cùng một mức rồi chỉnh từng dòng), nhập lý do và xem lại danh sách/tổng điểm trước khi gửi. Bộ lọc không tự chọn hoặc tự gửi cho tất cả. Điểm tặng đi qua luồng yêu cầu cộng điểm của Manager và được cộng vào ví **chỉ sau khi Manager khác phê duyệt**; gắn tham chiếu sự cố + Member để chống gửi trùng, ghi audit, thông báo/email sau khi cộng thành công. Đây là khoản tặng điểm do Manager quyết định, không phải refund Membership tính theo invoice/cap và không tự thay đổi thời hạn gói. Buổi lớp bị ảnh hưởng vẫn bù vào lịch tiếp theo, lượt thuê sân xử lý theo quy tắc riêng (BR-130, BR-138). Hoàn do lỗi trung tâm cho vấn đề khác khiến trung tâm không thể cung cấp dịch vụ vẫn theo phần chưa dùng. Code sự cố Gym hiện còn tự gia hạn Membership; cần thay trước khi coi quy tắc mới là đã triển khai.
- Tài khoản Deactivated bị chặn đăng nhập, tiếp tục dùng chức năng cần xác thực, sử dụng dịch vụ và mua mới tại backend, kể cả thao tác do nhân viên ghi nhận như check-in/điểm danh. Deactivate không tự hủy quyền lợi đã mua, lịch đã đặt hay số dư ví; hủy và hoàn phải qua luồng nghiệp vụ riêng, có audit. Activate chỉ khôi phục trạng thái Active và không tự khôi phục các quyền lợi đã hủy hoặc bỏ qua điều kiện kích hoạt lời mời.
- Tài khoản Member được tạo bằng hai cách: Member tự đăng ký (OTP email hoặc Google), hoặc Receptionist/Manager đăng ký tại quầy (`POST /api/members/front-desk`): email nhập một lần, tài khoản chưa có mật khẩu, Member nhận email kích hoạt (24 giờ, một lần) và tự đặt mật khẩu; chờ kích hoạt thì gửi lại link hoặc sửa email gõ sai (link cũ vô hiệu, có audit); quá 7 ngày kể từ lúc đăng ký mà vẫn chưa kích hoạt và chưa có dữ liệu nào ghi nhận cho tài khoản thì tài khoản bị gỡ, email được giải phóng. Quầy không đặt mật khẩu hộ và chỉ tạo role Member.
- Member và staff là hai loại tài khoản tách biệt (BR-142): không chuyển Member thành staff hay ngược lại (409 `member_staff_role_change_not_allowed`); muốn làm staff phải dùng email khác. Chỉ SystemAdministrator tạo tài khoản staff (kể cả Coach kèm chuyên môn, BR-96) và đó là bước duy nhất tạo Coach; staff nhận email kích hoạt để tự đặt mật khẩu. Manager chỉ sửa hồ sơ Coach. Đổi role chỉ giữa các role staff; Coach chỉ rời vai trò khi không còn lớp, lịch tương lai hay quan hệ huấn luyện Active. Email chưa được xác minh là của đúng người khi tạo (Admin nhập email một lần, gõ sai thì sửa); tài khoản chưa kích hoạt hiển thị "Chờ kích hoạt" (`activationPending`), Admin được gửi lại link (cooldown 60 giây, link cũ vô hiệu) hoặc sửa email gõ sai (link cũ vô hiệu, link mới tới email mới, có audit) cho tới khi người nhận đặt mật khẩu.
- Manager duyệt theo quyền; SystemAdministrator không mặc nhiên có quyền nghiệp vụ; Coach chỉ đọc dữ liệu được phân công.
- Checkout (A15, đã triển khai): hai cột, tóm tắt hiển thị tổng/điểm/tiền còn lại đúng số server; đồng hồ giữ chỗ tính từ `expiresAtUtc − serverNowUtc` và không reset khi reload; hết giờ thì dừng thao tác và tải lại, FE không "release slot"; quay lại tab thì tải lại ví và đơn; return từ cổng thanh toán không chứng minh đã thu. Route `/checkout/[invoiceId]`; tài chính Member ở `/member/finance?tab=wallet|invoices`, chi tiết `/member/invoices/[id]` (route cũ `/member/wallet`, `/member/invoices` chuyển hướng).
- `hold.minutes` do Manager cấu hình trong khoảng **10–30 phút**, mặc định **15 phút**; áp dụng cho checkout lớp, thuê sân, mua gói và chuyển lớp có phần chênh. Giá trị mới chỉ tác động checkout được tạo sau khi đổi; hạn đã ghi trên checkout/payment attempt hiện có không đổi. Hạn thực tế có thể sớm hơn khi sát giờ bắt đầu lớp/sân hoặc hạn trả lời chuyển lớp; Member xem `expiresAtUtc` của đơn thay vì suy từ mức cấu hình.
- Member có Enrollment Confirmed, `EndedAt` rỗng vẫn đọc lịch sử buổi, giáo án, homework và kết quả của chính mình khi lớp Completed. Ghi danh kết thúc hoặc lớp Cancelled/Draft thì thu hồi quyền nội dung; Coach chủ nhiệm mất quyền hồ sơ học viên khi lớp Completed hoặc ghi danh kết thúc.
- Quên mật khẩu bằng link email (BR-103): phản hồi trung tính; xem thiết kế v3 mục Danh tính. Trang xác thực luôn tiếng Anh.
- Khi lớp dưới ngưỡng bị hủy lúc hết hạn phản hồi, Member còn ghi danh được hoàn 100% giá trị còn đủ điều kiện bằng điểm và nhận một thông báo (chuông + email) kèm số điểm hoàn và tối đa 3 khóa tương đương tại thời điểm đó (cùng môn, Published, đang mở đăng ký, còn chỗ, chưa bắt đầu, Member chưa ghi danh). Gợi ý chỉ là ảnh chụp lúc hủy: không lưu nguyện vọng, không gửi lại khi có lớp mới, không giữ chỗ hoặc tự ghi danh.
- Avatar Member/Coach/Center Manager/System Administrator qua Cloudinary: tự tải lên/thay/xóa tại Account; ảnh Coach công khai, API ảnh của các vai trò còn lại yêu cầu đăng nhập. Quyền tải ảnh Admin chỉ áp dụng cho chính tài khoản Admin; quyền gỡ ảnh Member/Coach để kiểm duyệt vẫn theo endpoint riêng. Center Manager có thể gỡ trực tiếp ảnh Member không phù hợp; chi tiết tại [Avatar Cloudinary](api-contract.md#avatar-cloudinary--apiavatars).

## 5. Quy ước kỹ thuật

### Language policy

The product uses English only. Public pages, authenticated screens, validation and API messages, notifications, reports, and other system-generated text must be in English. There is no language switch or saved language preference. Catalog and configuration seed values stored in the database are English. User-entered names, notes, course descriptions, and other free-form content retain the language entered by the user; do not translate or overwrite them. When migrating legacy seed data, update only records whose values still match the original system seed, so manager edits remain intact. Historical invoice snapshots and notices remain as originally issued for audit integrity; new system-generated records use English.

| Chủ đề | Quy ước |
|---|---|
| Naming | C# PascalCase; DB snake_case; JSON camelCase; route theo contract |
| Enum | Wire UPPER_SNAKE_CASE; JWT role nội bộ; DB giữ số đã có, không reorder |
| ID | Giữ int/Guid đúng entity/contract, không chuyển đồng loạt |
| Tiền/điểm | decimal VND; điểm nguyên; giá theo validation nghiệp vụ |
| Thời gian | UTC để lưu; giờ Việt Nam để hiển thị; khoảng lịch [start, end) |
| API | Validate server, ownership, paging/range; error code ổn định |
| Đồng thời | DB constraints + transaction/lock/version; không read-then-write thiếu bảo vệ |
| Lịch sử | Restrict cho tài chính; không cascade xóa chứng từ; ngừng catalog thay xóa cứng |
| Migration | Không sửa migration đã áp dụng; kiểm DB trắng/upgrade và backfill có bằng chứng |
| Tích hợp | Mock chỉ Development với UseMock rõ ràng; không tự fallback vì thiếu credential |
| Thông báo | Outbox trong transaction, gửi sau commit, retry/dedup |
| Tài liệu | Trạng thái theo evidence; lịch sử thay đổi dùng Git |

## 6. Theo dõi phần chưa hoàn thành

Danh sách tập trung ở **mục 13 của [thiết kế hệ thống](Center-Management-System-Design-v3.md)**. Payment và callback public đã có mã nhưng còn nghiệm thu tích hợp/staging theo từng mục; Manager AI và các API hỗ trợ frontend theo trạng thái riêng trong bảng. COACH-01 ghi rõ validation tạo request cũ còn được chấp nhận ở backend. Có tài liệu hoặc code không đồng nghĩa đã nghiệm thu thành công.

