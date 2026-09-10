# Quy tắc nghiệp vụ hệ thống quản lý trung tâm thể thao

Bản 1.2 — đồng bộ ngày 11/09/2026 từ bản BR người dùng cung cấp. Đây là bản văn bản để review trên GitHub, đồng nội dung với `SportManagement_BusinessRules_v1.2.docx`; SSOT luôn có ưu tiên cao nhất. Sáu mục đã chuyển sang NFR theo SSOT §0.1 tiếp tục là chỉ dẫn, không khôi phục thành BR.

Lịch sử: 08/09/2026 tạo bản 1.0 và bổ sung thanh toán/hóa đơn ở 1.1; 09/09/2026 đối soát bản 1.2 và thêm BR-44–53; 11/09/2026 đồng bộ Administrator, BR-50, điểm danh, BR-54 và BR-55. Những quyết định còn thiếu được ghi tại SSOT §7, không được tự suy ra từ bản này.

## A. Tài khoản Người dùng & Xác thực

### BR-1

Tài khoản Hội viên có thể tự đăng ký bằng một địa chỉ email duy nhất, hợp lệ và mật khẩu đáp ứng các yêu cầu về độ mạnh của hệ thống.

**Loại:** Ràng buộc · **Tĩnh/Động:** Tĩnh

**Nguồn:** Đặc tả Tác nhân: Hội viên — "Đăng ký tài khoản"

### BR-2

Chỉ System Administrator được tạo tài khoản System Administrator, Center Manager, Coach và Receptionist; gán hoặc thay đổi vai trò người dùng. Các vai trò khác không được tự thay đổi vai trò hoặc cấp vai trò cho tài khoản khác. System Administrator đầu tiên được khởi tạo khi triển khai hệ thống.

**Loại:** Ràng buộc · **Tĩnh/Động:** Tĩnh

**Nguồn:** BR-06 gốc; bản cập nhật do người dùng cung cấp ngày 11/09/2026.

### BR-3

Mỗi tài khoản người dùng được gán chính xác một vai trò: Quản trị viên, Quản lý Trung tâm, Huấn luyện viên, Hội viên, hoặc Lễ tân.

**Loại:** Sự thật · **Tĩnh/Động:** Tĩnh

**Nguồn:** Đặc tả Tác nhân, Phần 2; bản cập nhật do người dùng cung cấp ngày 11/09/2026.

### BR-4

Xác thực và phân quyền được thực thi thông qua JWT/OAuth2 với Kiểm soát Truy cập Dựa trên Vai trò (RBAC) trên mọi endpoint được bảo vệ.

**Loại:** Ràng buộc · **Tĩnh/Động:** Tĩnh

**Nguồn:** NFR-02 Bảo mật

### BR-5

Mật khẩu của người dùng chỉ được lưu trữ dưới dạng mã hóa băm (bcrypt hoặc thuật toán chuẩn tương đương); không bao giờ được lưu trữ hoặc ghi log dưới dạng văn bản thuần (plaintext).

**Loại:** Ràng buộc · **Tĩnh/Động:** Tĩnh

**Nguồn:** NFR-02 Bảo mật

### BR-6

Chỉ System Administrator được khóa hoặc mở khóa tài khoản. Tài khoản bị khóa không được đăng nhập hoặc tiếp tục sử dụng các chức năng yêu cầu xác thực. Không được tự khóa tài khoản hoặc khóa System Administrator hoạt động cuối cùng.

**Loại:** Ràng buộc · **Tĩnh/Động:** Tĩnh

**Nguồn:** Dẫn xuất — quy tắc kiểm soát truy cập chuẩn; bản cập nhật do người dùng cung cấp ngày 11/09/2026.

### BR-7

Mọi thao tác quản trị và nghiệp vụ quan trọng của System Administrator, Center Manager, Coach và Receptionist phải được ghi Audit Log, bao gồm người thực hiện, hành động, đối tượng bị tác động và thời điểm. Thao tác khóa hoặc mở khóa tài khoản phải ghi thêm lý do.

**Loại:** Sự thật · **Tĩnh/Động:** Tĩnh

**Nguồn:** Đặc tả Tác nhân: Quản lý Trung tâm — "Xem lịch sử thao tác"; NFR-02; bản cập nhật do người dùng cung cấp ngày 11/09/2026.

### BR-49

Tính duy nhất của email cho tài khoản người dùng được áp dụng không phân biệt chữ hoa chữ thường (ví dụ: chỉ mục duy nhất không phân biệt hoa thường hoặc dạng chữ thường chuẩn hóa được lưu trữ), do đó "User@x.com" và "user@x.com" không thể cùng đăng ký.

**Loại:** Ràng buộc · **Tĩnh/Động:** Tĩnh

**Nguồn:** Xem xét Thiết kế v2 — ràng buộc còn thiếu (v1.2)

## B. Hội viên & Gói thành viên

### BR-8

Một gói thành viên (Tên, Giá, Số ngày thời hạn, Giới hạn buổi) chỉ có thể được tạo, chỉnh sửa hoặc ngừng áp dụng bởi Quản lý Trung tâm.

**Loại:** Ràng buộc · **Tĩnh/Động:** Tĩnh

**Nguồn:** Đặc tả Tác nhân: Quản lý Trung tâm — "Quản lý gói thành viên"

### BR-9

Một thực thể gói của hội viên chỉ Hoạt động (Active) khi cả khoảng thời gian (Ngày bắt đầu–Ngày kết thúc) và Số buổi còn lại (RemainingSessions) của gói đó (nếu có giới hạn số buổi) vẫn còn hiệu lực.

**Loại:** Sự thật · **Tĩnh/Động:** Động

**Nguồn:** BR-01 gốc

### BR-10

Một Hội viên có thể sở hữu nhiều bản ghi Gói hội viên (MemberPackage) theo thời gian, nhưng chỉ có một gói thuộc cùng loại được Hoạt động (Active) tại một thời điểm ngoại trừ khi Quản lý Trung tâm cho phép cộng dồn rõ ràng.

**Loại:** Ràng buộc · **Tĩnh/Động:** Tĩnh

**Nguồn:** Dẫn xuất

### BR-11

Trạng thái của gói thành viên tự động chuyển sang Hết hạn (Expired) khi Ngày kết thúc trôi qua hoặc Số buổi còn lại bằng 0, tùy điều kiện nào đến trước.

**Loại:** Kích hoạt Hành động · **Tĩnh/Động:** Động

**Nguồn:** Dẫn xuất từ BR-01 / BR-05 gốc

## C. Quản lý Lớp học, Lịch học & Phòng tập

### BR-12

Một lớp học chỉ có thể được tạo khi đã gán Phòng tập và Bộ môn; Huấn luyện viên có thể được gán tại thời điểm tạo hoặc sau đó.

**Loại:** Ràng buộc · **Tĩnh/Động:** Tĩnh

**Nguồn:** Đặc tả Tác nhân: Quản lý Trung tâm

### BR-13

Số lượng đăng ký đã xác nhận trong một buổi học không bao giờ được vượt quá giá trị nhỏ hơn giữa Sức chứa của Phòng tập được gán và Sức chứa được cấu hình của Lớp học.

**Loại:** Ràng buộc · **Tĩnh/Động:** Động

**Nguồn:** Dẫn xuất

### BR-14

Chỉ Quản lý Trung tâm mới có thể phân công hoặc phân công lại Huấn luyện viên cho một Lớp học.

**Loại:** Ràng buộc · **Tĩnh/Động:** Tĩnh

**Nguồn:** Đặc tả Tác nhân: Quản lý Trung tâm — "Phân công huấn luyện viên"

### BR-15

Một Buổi học (Class Session) thừa hưởng khung thời gian lịch học từ mẫu lặp lại của Lớp học cha trừ khi có sự đè lên (override) rõ ràng bởi Quản lý Trung tâm (ví dụ: đổi lịch).

**Loại:** Sự thật · **Tĩnh/Động:** Tĩnh

**Nguồn:** Dẫn xuất

### BR-51

Sức chứa thực tế của một Buổi học là giá trị nhỏ hơn giữa sức chứa của Phòng tập được gán và sức chứa đã cấu hình của Lớp học cha tại thời điểm buổi học được tạo. Quản lý Trung tâm có thể giảm sức chứa của một buổi học cụ thể xuống thấp hơn nữa (ví dụ: khi chuyển sang phòng nhỏ hơn) nhưng không bao giờ được tăng vượt quá mức tối thiểu đó.

**Loại:** Ràng buộc · **Tĩnh/Động:** Động

**Nguồn:** Xem xét Thiết kế v2 — mở rộng từ BR-13 (v1.2)

### BR-54

Khi Quản lý Trung tâm hủy hoặc dời một buổi học chưa bắt đầu, các đăng ký còn hiệu lực tại buổi cũ được hủy và hoàn lại lượt tập đã trừ, không áp dụng phạt hủy trễ hoặc No-show. Hội viên chủ động đăng ký buổi khác theo điều kiện đăng ký thông thường; hệ thống không tự chuyển đăng ký hoặc giữ chỗ. Nếu dời lịch, hệ thống tạo buổi thay thế và lưu liên kết với buổi cũ.

**Loại:** Kích hoạt Hành động · **Tĩnh/Động:** Động

**Nguồn:** Quyết định nghiệp vụ bổ sung của nhóm; liên quan BR-15 và BR-33.

## D. Đăng ký Lớp học (Đăng ký & Hủy)

### BR-16

Hội viên chỉ có thể đăng ký một buổi học khi Gói thành viên đã chọn của họ đang Hoạt động (Active) và còn số dư buổi/thời gian.

**Loại:** Ràng buộc · **Tĩnh/Động:** Động

**Nguồn:** BR-01 gốc

### BR-17

Hội viên hoặc Lễ tân được hủy đăng ký. Việc hủy được phân loại đúng hạn hoặc trễ hạn theo chính sách tại BR-50; quyền hoàn lượt/credit được xác định theo BR-18.

**Loại:** Ràng buộc · **Tĩnh/Động:** Động

**Nguồn:** BR-02 gốc

### BR-18

Hủy đăng ký trong khoảng thời gian cho phép (BR-17) sẽ hoàn lại buổi/tín chỉ đã sử dụng vào số dư gói của Hội viên; hủy sau hạn chót sẽ không được hoàn lại. Trường hợp trung tâm hủy hoặc dời buổi học áp dụng quy tắc riêng, không phụ thuộc hạn hủy của hội viên.

**Loại:** Kích hoạt Hành động · **Tĩnh/Động:** Động

**Nguồn:** Dẫn xuất từ BR-02 gốc

### BR-19

Một Hội viên chỉ có thể giữ tối đa một lượt đăng ký đang hoạt động cho mỗi buổi học; không cho phép đăng ký trùng lặp trong cùng một buổi.

**Loại:** Ràng buộc · **Tĩnh/Động:** Tĩnh

**Nguồn:** Dẫn xuất

### BR-50

Chính sách hạn hủy đăng ký: Center Manager được cấu hình số giờ tối thiểu trước giờ bắt đầu buổi học mà hội viên phải hủy đăng ký để được hoàn lượt/credit. Chính sách áp dụng cho mỗi đăng ký được xác định tại thời điểm đăng ký được xác nhận; thay đổi cấu hình sau đó không làm thay đổi chính sách của đăng ký đã xác nhận. Hủy tại hoặc trước hạn hủy được coi là đúng hạn.

**Loại:** Ràng buộc · **Tĩnh/Động:** Tĩnh

**Nguồn:** Xem xét Thiết kế v2 — ràng buộc còn thiếu (v1.2); bản cập nhật do người dùng cung cấp ngày 11/09/2026.

## E. Điểm danh

### BR-20

Sau khi một buổi học thực tế diễn ra và kết thúc, hệ thống ghi nhận No-show cho các hội viên có đăng ký còn hiệu lực nhưng chưa có bản ghi điểm danh. Các đăng ký đã hủy không bị ghi nhận No-show.

**Loại:** Ràng buộc · **Tĩnh/Động:** Động

**Nguồn:** BR-03 gốc; bản cập nhật do người dùng cung cấp ngày 11/09/2026.

### BR-21

Mỗi hội viên có tối đa một bản ghi điểm danh trong một ClassSession. Trạng thái điểm danh là một trong các giá trị: Present, Absent hoặc No-show.

**Loại:** Ràng buộc · **Tĩnh/Động:** Tĩnh

**Nguồn:** Dẫn xuất; bản cập nhật do người dùng cung cấp ngày 11/09/2026.

### BR-22

Điểm danh chỉ có thể được thực hiện bởi Huấn luyện viên được gán cho buổi học đó hoặc bởi Lễ tân thực hiện check-in tại bàn tiếp tân.

**Loại:** Ràng buộc · **Tĩnh/Động:** Tĩnh

**Nguồn:** Đặc tả Tác nhân: Huấn luyện viên / Lễ tân

### BR-53

Coach được phân công cho buổi học hoặc Receptionist được ghi nhận Present hoặc Absent. No-show chỉ được hệ thống tự động ghi nhận theo BR-20; tiến trình tự động không được ghi đè bản ghi điểm danh đã tồn tại.

**Loại:** Ràng buộc · **Tĩnh/Động:** Động

**Nguồn:** Xem xét Thiết kế v2 — mở rộng từ BR-20/BR-21 (v1.2); bản cập nhật do người dùng cung cấp ngày 11/09/2026.

## F. Quản lý Huấn luyện viên & Bài tập

### BR-23

Kế hoạch Tập luyện (Workout Plan) cho một lớp học chỉ có thể được tạo bởi Huấn luyện viên được gán cho lớp đó; kế hoạch cá nhân có thể được tạo bởi bất kỳ Huấn luyện viên nào đang có mối quan hệ huấn luyện hoạt động với Hội viên.

**Loại:** Ràng buộc · **Tĩnh/Động:** Tĩnh

**Nguồn:** Đặc tả Tác nhân: Huấn luyện viên — "Tạo kế hoạch tập luyện"

### BR-24

Kết quả Tập luyện (Workout Result) hoặc nhận xét tiến độ chỉ có thể được ghi nhận cho buổi học mà Huấn luyện viên thực hiện ghi nhận thực sự giảng dạy.

**Loại:** Ràng buộc · **Tĩnh/Động:** Tĩnh

**Nguồn:** Dẫn xuất

### BR-25

Hội viên có thể xem các Kế hoạch Tập luyện, Kết quả Tập luyện và nhận xét của Huấn luyện viên dành cho mình, nhưng không thể chỉnh sửa chúng.

**Loại:** Ràng buộc · **Tĩnh/Động:** Tĩnh

**Nguồn:** Đặc tả Tác nhân: Hội viên

## G. Tích hợp AI

### BR-26

Đề xuất tập luyện từ AI cho Huấn luyện viên phải được tính toán dựa trên ít nhất ba dữ liệu đầu vào bắt buộc: (1) mục tiêu cá nhân của Hội viên, (2) trình độ hiện tại, và (3) lịch sử tập luyện bao gồm ít nhất 30 ngày gần nhất.

**Loại:** Ràng buộc · **Tĩnh/Động:** Động

**Nguồn:** BR-04 gốc

### BR-27

Mọi yêu cầu AI (đề xuất tập luyện; trò chuyện chỉ khi Luồng 6 được triển khai) và phản hồi của nó đều được ghi lại trong AI_Logs bao gồm payload đầu vào, payload phản hồi và thời gian phản hồi, nhằm phục vụ kiểm toán và đánh giá chất lượng.

**Loại:** Sự thật · **Tĩnh/Động:** Tĩnh

**Nguồn:** Dẫn xuất; NFR-02

### BR-28

[Luồng 6 — Mở rộng, chỉ xây dựng nếu thời gian cho phép] Phản hồi từ Chatbot AI đối với truy vấn của Hội viên phải được trả về trong vòng 3 giây.

**Loại:** Ràng buộc · **Tĩnh/Động:** Động

**Nguồn:** NFR-01 Hiệu năng

### BR-29

[Luồng 6 — Mở rộng, chỉ xây dựng nếu thời gian cho phép] Hệ thống AI chỉ được trả lời các truy vấn của Hội viên về lịch học, bài tập hoặc dịch vụ của trung tâm; hệ thống không được đưa ra các tư vấn về y tế, pháp lý hoặc tài chính.

**Loại:** Ràng buộc · **Tĩnh/Động:** Tĩnh

**Nguồn:** Dẫn xuất — giới hạn phạm vi an toàn

## H. Thanh toán & Hóa đơn

### BR-30

Một Hóa đơn (Invoice kèm theo các InvoiceItem) được tạo ngay lập tức khi Hội viên hoặc Lễ tân chọn một Gói thành viên (MembershipPackage) — trước khi thu bất kỳ khoản thanh toán nào. Mỗi khoản Thanh toán (Payment) được ghi nhận sau đó đối với Hóa đơn sẽ cập nhật trạng thái của Hóa đơn, và Gói thành viên được liên kết chỉ chuyển sang trạng thái Hoạt động (Active) sau khi Hóa đơn được thanh toán đầy đủ.

**Loại:** Ràng buộc · **Tĩnh/Động:** Động

**Nguồn:** BR-05 gốc; sửa đổi v1.2 — Xem xét Thiết kế v2 (đối soát thời điểm xuất hóa đơn)

### BR-31

Một khi đã phát hành, Hóa đơn không thể bị xóa; việc điều chỉnh yêu cầu phải có một bản ghi điều chỉnh hoặc hoàn tiền được liên kết.

**Loại:** Ràng buộc · **Tĩnh/Động:** Tĩnh

**Nguồn:** Dẫn xuất

### BR-32

Chỉ Quản lý Trung tâm  mới có thể xem hoặc xuất các báo cáo tài chính và doanh thu trên toàn trung tâm.

**Loại:** Ràng buộc · **Tĩnh/Động:** Tĩnh

**Nguồn:** BR-06 gốc

### BR-40

Hóa đơn không bao giờ bị xóa khỏi hệ thống; mọi sửa đổi phải được xử lý thông qua Điều chỉnh Thanh toán (PaymentAdjustment - hoàn tiền hoặc điều chỉnh) có tham chiếu đến Hóa đơn/Thanh toán gốc.

**Loại:** Ràng buộc · **Tĩnh/Động:** Tĩnh

**Nguồn:** Xem xét Thiết kế v2 — khoảng trống luồng Thanh toán

### BR-41

Một khoản Thanh toán (Payment) luôn phải được liên kết với chính xác một Hóa đơn; tổng các khoản Thanh toán THÀNH CÔNG (SUCCESS) trên một Hóa đơn không bao giờ được vượt quá Tổng số tiền (TotalAmount) của hóa đơn đó sau khi trừ đi các khoản điều chỉnh ĐÃ HOÀN THÀNH (COMPLETED).

**Loại:** Ràng buộc · **Tĩnh/Động:** Động

**Nguồn:** Xem xét Thiết kế v2 — khoảng trống luồng Thanh toán

### BR-42

Yêu cầu Điều chỉnh Thanh toán (PaymentAdjustment - hoàn tiền/điều chỉnh) do Lễ tân tạo phải được Quản lý Trung tâm phê duyệt trước khi có hiệu lực; Lễ tân không thể tự phê duyệt yêu cầu của mình.

**Loại:** Ràng buộc · **Tĩnh/Động:** Động

**Nguồn:** Xem xét Thiết kế v2 — khoảng trống luồng Thanh toán

### BR-43

Báo cáo doanh thu (/reports/revenue) chỉ có thể truy cập bởi Quản lý Trung tâm, và các số liệu trong báo cáo phải trừ đi bất kỳ khoản điều chỉnh nào được hoàn thành trong kỳ báo cáo.

**Loại:** Ràng buộc · **Tĩnh/Động:** Động

**Nguồn:** Xem xét Thiết kế v2 — khoảng trống luồng Thanh toán

### BR-52

Khi một khoản Điều chỉnh Thanh toán kiểu HOÀN TIỀN (REFUND) được yêu cầu, Số tiền mặc định của nó được tính theo tỷ lệ phân bổ của Tổng số tiền (TotalAmount) trên Hóa đơn — tỷ lệ thuận với Số buổi chưa sử dụng (RemainingSessions) đối với gói giới hạn buổi, hoặc số ngày còn lại chưa sử dụng đối với gói theo thời hạn. Quản lý Trung tâm có thể ghi đè số tiền mặc định này khi phê duyệt.

**Loại:** Ràng buộc · **Tĩnh/Động:** Động

**Nguồn:** Xem xét Thiết kế v2 — mở rộng từ BR-42 (v1.2)

### BR-55

Thời hạn thanh toán hóa đơn: Hạn thanh toán ban đầu của Invoice là hai tháng kể từ ngày phát hành. Nếu trung tâm nhận khoản đặt cọc đầu tiên trong thời hạn này, hạn thanh toán đầy đủ được xác định lại thành 12 tháng kể từ ngày nhận khoản cọc đầu tiên. Các khoản thanh toán tiếp theo không làm gia hạn thời hạn đó.

**Loại:** Ràng buộc · **Tĩnh/Động:** Động

**Nguồn:** Quyết định nghiệp vụ bổ sung của nhóm về thời hạn thanh toán và đặt cọc; liên quan BR-30.

## K. Báo cáo & Xuất dữ liệu

### BR-44

Báo cáo hoặc tệp xuất được tạo chỉ được chứa các trường thông tin mà Quản lý Trung tâm đã chọn một cách rõ ràng trước khi xuất (ví dụ: chi tiết doanh thu, các cột tóm tắt hội viên).

**Loại:** Ràng buộc · **Tĩnh/Động:** Tĩnh

**Nguồn:** Xem xét Thiết kế v2 — khoảng trống luồng Thanh toán/Báo cáo

### BR-45

Một người dùng chỉ có thể xem hoặc tải xuống các báo cáo/tệp xuất do chính họ tạo ra; Quản lý Trung tâm có thể truy cập tất cả các báo cáo đã tạo.

**Loại:** Ràng buộc · **Tĩnh/Động:** Tĩnh

**Nguồn:** Xem xét Thiết kế v2

### BR-46

Báo cáo/tệp xuất đã tạo được lưu trữ trong ít nhất 6 tháng, sau đó có thể được lưu trữ bảo quản hoặc xóa bỏ.

**Loại:** Sự thật · **Tĩnh/Động:** Động

**Nguồn:** Xem xét Thiết kế v2

### BR-47

Khi một báo cáo/tệp xuất đã tạo bị xóa, nó sẽ bị loại bỏ khỏi danh sách báo cáo và không thể truy cập lại thông qua liên kết trước đó nữa.

**Loại:** Kích hoạt Hành động · **Tĩnh/Động:** Tĩnh

**Nguồn:** Xem xét Thiết kế v2

### BR-48

Đã chuyển khỏi Business Rules theo SSOT §0.1. Xem Non-Functional-Requirements.md: NFR-PERF-REPORT-01; FR-REPORT-RETRY-01. Mã cũ chỉ giữ để truy vết.

**Loại:** Chỉ dẫn tham chiếu · **Tĩnh/Động:** Không áp dụng

**Nguồn:** SSOT §0.1; phân loại lại ngày 11/09/2026

## I. Thông báo

### BR-33

Hội viên nhận được thông báo bất cứ khi nào lịch học của họ thay đổi, buổi học bị trung tâm hủy, hoặc gói thành viên của họ sắp hết hạn (ví dụ: trong vòng 7 ngày). Khi trung tâm hủy hoặc dời buổi học, thông báo phải nêu rõ đăng ký cũ đã được hủy, lượt tập đã được hoàn và hội viên cần đăng ký lại; kèm thông tin buổi thay thế nếu có.

**Loại:** Kích hoạt Hành động · **Tĩnh/Động:** Động

**Nguồn:** Đặc tả Tác nhân: Hội viên — "Nhận thông báo"; bản cập nhật do người dùng cung cấp ngày 11/09/2026.

### BR-34

Đã chuyển khỏi Business Rules theo SSOT §0.1. Xem Non-Functional-Requirements.md: NFR-NOTIFY-01; ARCH-NOTIFY-01 tại Design v2 §6. Mã cũ chỉ giữ để truy vết.

**Loại:** Chỉ dẫn tham chiếu · **Tĩnh/Động:** Không áp dụng

**Nguồn:** SSOT §0.1; phân loại lại ngày 11/09/2026

## J. Chất lượng Hệ thống & Quản trị

### BR-35

Đã chuyển khỏi Business Rules theo SSOT §0.1. Xem Non-Functional-Requirements.md: NFR-PERF-API-01. Mã cũ chỉ giữ để truy vết.

**Loại:** Chỉ dẫn tham chiếu · **Tĩnh/Động:** Không áp dụng

**Nguồn:** SSOT §0.1; phân loại lại ngày 11/09/2026

### BR-36

Đã chuyển khỏi Business Rules theo SSOT §0.1. Xem Non-Functional-Requirements.md: NFR-AVAIL-01. Mã cũ chỉ giữ để truy vết.

**Loại:** Chỉ dẫn tham chiếu · **Tĩnh/Động:** Không áp dụng

**Nguồn:** SSOT §0.1; phân loại lại ngày 11/09/2026

### BR-37

Đã chuyển khỏi Business Rules theo SSOT §0.1. Xem Non-Functional-Requirements.md: NFR-BACKUP-01. Mã cũ chỉ giữ để truy vết.

**Loại:** Chỉ dẫn tham chiếu · **Tĩnh/Động:** Không áp dụng

**Nguồn:** SSOT §0.1; phân loại lại ngày 11/09/2026

### BR-38

Đã chuyển khỏi Business Rules theo SSOT §0.1. Xem Non-Functional-Requirements.md: NFR-SEC-01. Mã cũ chỉ giữ để truy vết.

**Loại:** Chỉ dẫn tham chiếu · **Tĩnh/Động:** Không áp dụng

**Nguồn:** SSOT §0.1; phân loại lại ngày 11/09/2026

### BR-39

Chỉ Quản lý trung tâm mới có thể cấu hình các thiết lập trên toàn hệ thống, bao gồm danh mục gói dịch vụ, danh mục bộ môn/phòng tập. Quyền này không bao gồm quản lý vai trò người dùng.

**Loại:** Ràng buộc · **Tĩnh/Động:** Tĩnh

**Nguồn:** BR-06 gốc; bản cập nhật do người dùng cung cấp ngày 11/09/2026.

