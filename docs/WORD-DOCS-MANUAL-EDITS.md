# Các mục cần chỉnh tay trong file Word

## Quyết định mới ngày 14/10/2026 — link staff và quyền audit

Áp dụng [Admin-Activation-and-Audit.md](Admin-Activation-and-Audit.md) khi cập nhật hai file Word:

- BR-143 và FR-16/17: link kích hoạt staff hết hạn đúng `CreatedAt + 24 giờ`, dùng một lần; sửa email/gửi lại vô hiệu link cũ và không làm mới hạn tài khoản. Cả link staff và link Member đều có thời hạn 24 giờ.
- BR-7, FR-21 và SRS UC-19: Admin xem mọi loại thao tác được ghi audit do Manager/Admin/Coach thực hiện và log hệ thống. Manager xem log do Manager/Receptionist/Coach/Member thực hiện. Không giới hạn Admin vào target tài khoản; Manager không xem log Admin/hệ thống.
- Role để phân phạm vi là `ActorRole` tại thời điểm thao tác. Thay đổi role hiện tại không đổi phạm vi log cũ. Chỉ Admin đọc log tự động của hệ thống.


Hai file Word không sửa tự động được: `SportManagement_BusinessRules_v2.0_updated.docx` (BR) và `SWP391_Report_SRS.docx` (SRS). Dưới đây là **vị trí cần sửa và đoạn văn dán sẵn**. Tôi đã đối chiếu với nội dung hiện có trong hai file (đã có BR-2, BR-96, BR-142, BR-91, UC-04 theo quy tắc mới), nên chỉ liệt kê phần **còn thiếu hoặc còn lệch**.

Quy ước: đoạn trong khối trích dẫn (`>`) là văn bản để dán. Phần *yêu cầu, chưa triển khai* nên ghi rõ trạng thái để khớp tài liệu thiết kế.

---

## A. Business Rules (`SportManagement_BusinessRules_v2.0_updated.docx`)

### A1. Đoạn mở đầu (mục Thuật ngữ): thêm Guest và việc chia vai trò
**Chỗ sửa:** đoạn "Thuật ngữ: ... Năm vai trò hệ thống: System Administrator, Center Manager, Coach, Member, Receptionist."
**Thêm vào sau câu đó:**

> Requirement gốc chỉ có bốn vai trò (Center Manager, Coach, Member, Receptionist); System Administrator là vai trò bổ sung của dự án và chia việc với Center Manager: Administrator quản lý tài khoản nhân sự, phân quyền (đổi vai trò) và Audit Log thao tác tài khoản; Center Manager giữ phần vận hành trung tâm và Audit Log đầy đủ, nên vai trò Center Manager không còn giống 100% requirement gốc. Guest là người chưa đăng nhập, không phải vai trò lưu trong database; Guest xem được landing page và nội dung công khai (khóa/gói, sân, Coach) nhưng không đọc dữ liệu cá nhân.

### A2. BR-1: thêm đăng ký tại quầy
**Chỗ sửa:** quy tắc BR-1 (mục A). **Thay toàn bộ nội dung bằng:**

> Tài khoản Hội viên được tạo bằng một trong hai cách: (1) Hội viên tự đăng ký bằng email duy nhất, hợp lệ (xác minh bằng OTP) và mật khẩu đáp ứng yêu cầu độ mạnh, hoặc đăng nhập Google; (2) Receptionist đăng ký Hội viên mới tại quầy bằng họ tên, email (nhập hai lần) và số điện thoại; hệ thống tạo tài khoản Member chưa có mật khẩu, gửi email kích hoạt (link dùng một lần, hiệu lực 24 giờ) để Hội viên tự đặt mật khẩu. Receptionist không đặt mật khẩu hộ và chỉ tạo được tài khoản Member. *(Cách 2 đã triển khai: POST /api/members/front-desk.)*

### A3. BR mới (đề xuất BR-143): toàn vẹn kích hoạt tài khoản
**Chỗ sửa:** thêm quy tắc mới ở mục A, sau BR-142. Cột Loại: Ràng buộc; Tĩnh/Động: Động.

> Hệ thống không xác minh được địa chỉ email của tài khoản do quản trị viên tạo là thật hay đúng người, nên việc xác minh là link kích hoạt gửi tới chính email đó. Khi tạo tài khoản nhân sự, System Administrator phải nhập email hai lần và hai lần nhập phải khớp. Tài khoản nhân sự chưa đặt mật khẩu và chưa liên kết Google ở trạng thái "chờ kích hoạt" và được hiển thị như vậy. Với tài khoản chờ kích hoạt, System Administrator được (a) gửi lại link kích hoạt (cách nhau tối thiểu 60 giây; mỗi lần gửi vô hiệu link cũ), và (b) sửa email gõ sai kèm lý do bắt buộc: link gửi tới email cũ bị vô hiệu ngay, link mới gửi tới email mới. Hai thao tác này không áp dụng cho Hội viên hoặc nhân sự đã kích hoạt (HTTP 409 account_not_pending_activation). Tài khoản chờ kích hoạt không đăng nhập được, kể cả bằng Google, cho tới khi người nhận tự đặt mật khẩu qua link.

### A4. BR-2: bổ sung tham chiếu
**Chỗ sửa:** cuối BR-2.
**Thêm câu:**

> Việc xác minh email của tài khoản nhân sự và các thao tác gửi lại link, sửa email theo BR-143.

### A5. BR-7: bổ sung hành động bắt buộc ghi Audit
**Chỗ sửa:** danh sách "Các nhóm thao tác bắt buộc ghi gồm: ... tạo tài khoản nhân sự (kể cả Coach), khóa tài khoản, ...".
**Thêm vào danh sách:**

> gửi lại link kích hoạt (RESEND_STAFF_ACTIVATION), sửa email tài khoản chờ kích hoạt (CHANGE_PENDING_STAFF_EMAIL, ghi email cũ, email mới và lý do)

### A6. BR-91: không cần sửa
BR-91 đã có phần "mức hoàn tính theo phần chưa sử dụng, không hoàn 100%" cho Center Fault, khớp với code hiện tại.

### A7. BR mới (đề xuất BR-144): nội dung công khai cho Guest
**Chỗ sửa:** thêm quy tắc mới ở mục A, sau BR-143 (hoặc mục phù hợp nếu có mục công khai/danh mục). Loại: Ràng buộc; Tĩnh.

> Người chưa đăng nhập (Guest) xem được landing page giới thiệu trung tâm, ba môn Gym/cầu lông/bóng rổ, đội Coach đang hoạt động và các khóa, gói, sân đã công khai. Guest không đọc được dữ liệu cá nhân, tài khoản, hóa đơn, ví điểm hay lịch của người khác; mua, đăng ký, thuê sân và mọi thao tác ghi dữ liệu yêu cầu đăng nhập bằng tài khoản Member. Lớp DRAFT không hiển thị cho Guest (BR về vòng đời lớp).

### A8. Phân công yêu cầu gốc của Manager
**Chỗ sửa:** nếu BR có quy tắc nào ghi "Center Manager phân quyền" hoặc "Center Manager quản lý nhân viên", đổi thành System Administrator; giữ Center Manager cho: lớp, môn, phòng, lịch, phân công Coach, gói, học phí, báo cáo, hoàn điểm, sự cố, Audit Log đầy đủ.

---

## B. SRS (`SWP391_Report_SRS.docx`)

### B1. Mục 1/giới thiệu (hai đoạn "Five account roles: ...", khoảng dòng 39 và 50)
**Thay câu "Guest is not an account role." bằng:**

> Guest is not an account role; a Guest can view the landing page and public content (courses, packages, courts, coaches) but cannot read personal data.

### B2. Mục mô tả các vai trò (khoảng dòng 61–70)
**System Administrator:** sửa câu cuối "quyền Audit ngoài identity chưa được cấp mặc định" thành:

> chia việc với Center Manager: Administrator quản lý tài khoản nhân sự, phân quyền và Audit Log thao tác tài khoản; không quản lý lớp, gói tập hay quyết định kinh doanh.

**Center Manager:** thêm câu cuối:

> Vai trò Center Manager chia việc với System Administrator nên không còn giống 100% đặc tả gốc: quản lý nhân sự và phân quyền thuộc Administrator; Manager giữ vận hành trung tâm và Audit Log đầy đủ.

**Receptionist:** thay "Tạo Member tại quầy;" bằng:

> Đăng ký Member mới tại quầy (nhập email hai lần, hệ thống gửi email kích hoạt để Member tự đặt mật khẩu); tìm và xem Member, kiểm tra gói và hạn; quản lý đăng ký, gia hạn gói; đăng ký lớp hoặc hỗ trợ hủy lớp; ghi nhận thanh toán và hóa đơn; tiếp nhận yêu cầu hỗ trợ của Member (chưa triển khai);

### B3. Mục 2.2 User Classes (bảng, khoảng dòng 128–150)
**Thêm một hàng cho Guest** (cột: User class / Mức kỹ thuật / Tần suất / Mối quan tâm chính):

| User class | Mức kỹ thuật | Tần suất & bối cảnh | Mối quan tâm chính |
|---|---|---|---|
| Guest | Phổ thông | Lần đầu truy cập, trước khi đăng ký | Xem landing page, khóa/gói, sân, Coach; quyết định đăng ký Member |

**Sửa hàng System Administrator**, cột "Tần suất & bối cảnh": "Không liên tục; khi tạo tài khoản nhân sự, gửi lại/sửa email kích hoạt, khóa user, đổi vai trò; Audit thao tác tài khoản".
**Sửa hàng Receptionist**, cột "Mối quan tâm chính": thêm "đăng ký Member mới tại quầy".

### B4. UC-03 – Đăng ký tài khoản hội viên (khoảng dòng 369)
Bảng UC-03 đã liệt Receptionist ở mục Tác nhân nhưng luồng chỉ có Member tự đăng ký. **Thêm vào ô "Luồng chính":**

> 5. (Receptionist) Receptionist nhập họ tên, email (hai lần) và số điện thoại; backend tạo account Member không có mật khẩu, tạo ví điểm 0, gửi email kích hoạt (link dùng một lần, 24 giờ); Member mở link và tự đặt mật khẩu theo BR-102. Receptionist có thể gửi lại link hoặc sửa email gõ sai khi account còn chờ kích hoạt (BR-143).

**Thêm vào ô "Luồng thay thế / ngoại lệ":**

> Email đã tồn tại → từ chối (409). Hai lần nhập email không khớp → không gửi. Link hết hạn, đã dùng hoặc đã bị thay thế → từ chối; Receptionist gửi lại link.

**Sửa ô "Hậu điều kiện":** thêm "Với đăng ký tại quầy: account Member chờ kích hoạt cho tới khi Member đặt mật khẩu; không đăng nhập được trước đó."

### B5. UC-04 – Quản lý tài khoản nội bộ & vai trò (khoảng dòng 384)
**Thêm vào "Luồng chính" (bước mới):**

> Admin nhập email hai lần khi tạo tài khoản nhân sự. Danh sách hiển thị trạng thái "Chờ kích hoạt" cho tài khoản chưa đặt mật khẩu. Với tài khoản chờ kích hoạt, Admin gửi lại link kích hoạt (cooldown 60 giây, link cũ vô hiệu) hoặc sửa email gõ sai kèm lý do (link cũ vô hiệu, link mới gửi tới email mới, ghi audit).

**Thêm vào "Luồng thay thế / ngoại lệ":**

> Gửi lại trong 60 giây → 429 activation_resend_too_soon. Gửi lại hoặc sửa email cho Member hoặc nhân sự đã kích hoạt → 409 account_not_pending_activation. Email mới trùng email đang có → 409 email_already_exists. Đăng nhập Google khi chưa kích hoạt → từ chối.

**Sửa "Tác nhân":** giữ "System Administrator; Center Manager (chỉ sửa hồ sơ, chuyên môn Coach)".

### B6. Dòng khoảng 87: xóa "homework"
**Chỗ sửa:** "Coach (PT) quản lý PT entitlement/session, training profile được phép, workout plan, result, homework và progress."
**Thay bằng:**

> Coach (PT) quản lý PT entitlement/session, training profile được phép, workout plan, result, nhận xét và progress. (Bài tập về nhà đã gỡ khỏi phạm vi triển khai.)

### B7. Dòng khoảng 189: quyền Audit
**Chỗ sửa:** "Admin quản lý identity/role/status. Manager xem Audit, báo cáo và cấu hình; quyền Admin ngoài identity chưa được mở rộng."
**Thay bằng:**

> Admin quản lý identity/role/status và xem Audit Log của thao tác tài khoản. Manager xem Audit Log đầy đủ, báo cáo và cấu hình vận hành; Admin và Manager chia việc, không chồng quyền.

### B8. Các yêu cầu của đặc tả gốc chưa có trong SRS (đối chiếu requirement chuẩn)
Thêm vào mục yêu cầu chức năng hoặc phụ lục "Chưa triển khai":

> - Receptionist: tiếp nhận và ghi nhận yêu cầu hỗ trợ từ Member (chưa triển khai); in hoặc xuất hóa đơn (chưa thấy trong giao diện lễ tân).
> - Coach: gửi bài tập về nhà cho học viên (đã gỡ khỏi phạm vi; thay bằng thông báo và nhận xét).

---

## C0. Vé Gym 1 ngày và việc gỡ PT — phải sửa cả hai file Word

### BR (Business Rules)
- **BR mới (đề xuất BR-145), vé Gym 1 ngày:**

> Gym có thêm một gói cố định "Vé Gym 1 ngày" giá 50.000 VND (dữ liệu seed cố định, Center Manager không được sửa giá, thời hạn hoặc ngừng bán). Vé chỉ có hiệu lực trong ngày thanh toán thành công theo giờ Việt Nam; mã check-in do server cấp và ký, chỉ dùng trong ngày đó. Trước khi thanh toán, Member (hoặc Receptionist hỗ trợ tại quầy) phải được thông báo rõ vé và mã chỉ dùng trong ngày. Mỗi Member chỉ có một vé ngày còn hiệu lực trong cùng ngày. Vé không bán khi Gym đóng cửa vì sự cố (mọi phòng Gym bị khóa), không được gia hạn theo BR-130/BR-138, không được hoàn trả theo BR-91, và không phát sinh nhắc hết hạn gói. Báo cáo thành viên không tính vé ngày là hội viên Membership mà thống kê riêng số vé đã bán.

- **Tình huống khách lạ (thêm vào BR-1 hoặc BR mới):** Receptionist đăng ký Member cho khách tại quầy (BR-1 cách 2) hoặc khách tự đăng ký; sau đó Receptionist hỗ trợ mua vé 1 ngày hoặc khách tự mua trên web; Member tự check-in hoặc Receptionist check-in hộ.
- **BR-91 (hoàn Membership):** thêm câu "Vé Gym 1 ngày không được hoàn trả."
- **BR-130/BR-138 (sự cố Gym):** thêm câu "Vé Gym 1 ngày không được gia hạn; khi Gym đóng cửa thì không bán vé."
- **Mọi BR nhắc PT** (BR về PT entitlement, PT session, giá PT, đổi lịch/đổi Coach PT, Specialty Personal Training, quyền dịch vụ PT, hoàn PT): xóa hoặc chuyển sang mục "Ngoài phạm vi"; BR-96 bỏ phần quyền dịch vụ PT; thuật ngữ "Gym (bao gồm dịch vụ PT)" đổi thành "Gym".

### SRS
- Mọi UC/đoạn về **PT** (đặt lịch PT, PT entitlement, đổi Coach PT, Coach (PT)) xóa hoặc chuyển sang mục "Ngoài phạm vi".
- **UC-05/UC-06 (gói thành viên, mua/gia hạn):** thêm vé Gym 1 ngày: cố định 50.000đ, chỉ trong ngày, mã check-in chỉ trong ngày, nhắc trước khi trả tiền, không hoàn, không gia hạn khi đóng Gym.
- **Mục Receptionist:** thêm "bán vé Gym 1 ngày và check-in hộ".
- **Mục Training/AI (Flow 4, 5):** ghi kế hoạch tập, kết quả, đánh giá và AI gợi ý làm theo lớp cho Coach cầu lông/bóng rổ, không theo PT.

---

## C. Sau khi sửa Word
1. Nếu thêm BR-143 và BR-144, cập nhật mục lục và bảng tham chiếu chéo (BR-2, BR-7, UC-03, UC-04).
2. Đối chiếu lại số BR với `docs/00-Source-of-Truth.md` §4 (hiện dùng tên quy tắc, chưa dùng mã BR-143/144).
3. Báo tôi số BR bạn chốt để cập nhật các file Markdown cho đồng bộ.

## D. Quy tắc đã chốt ngày 13/10/2026 — bảo vệ role Admin

Khi cập nhật BR-2 và UC quản trị tài khoản trong Word, bổ sung:

> Không được thay đổi vai trò của tài khoản đang là System Administrator, bao gồm tài khoản của chính người thao tác và System Administrator khác, không phụ thuộc số lượng Admin hoặc trạng thái tài khoản. Tài khoản nhân sự khác vẫn được phép nâng lên System Administrator; sau đó vai trò được bảo vệ. Quy tắc này không thay đổi quyền khóa/mở khóa hoặc việc tạo tài khoản Admin.

Đã cập nhật quy tắc trong `00-Source-of-Truth.md`, `Requirements.md` và `api-contract.md`; yêu cầu đã xác nhận này được ưu tiên so với mô tả cũ trong Word.
