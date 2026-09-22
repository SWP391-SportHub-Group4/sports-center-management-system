# Review nghiệp vụ, FE/UIUX và Flow 6 — 22/09/2026

## Phạm vi và kết luận

Đối chiếu SSOT, quyết định v1.4, thiết kế, trạng thái triển khai và code FE/BE. Đây là **báo cáo review và đề xuất**, không thay thế BusinessRules DOCX, không phê duyệt schema/rule mới. Có thể bắt đầu thiết kế FE, nhưng chưa nên coi Flow 1–5 đã hoàn chỉnh để nghiệm thu hoặc dùng làm nguồn trả lời cho Flow 6.

Kiểm tra trực tiếp mới quan sát được màn login; kết nối local bị gián đoạn khi thử đăng nhập. Chưa kiểm chứng trực tiếp màn sau đăng nhập, mobile, bàn phím hay toàn bộ hành trình. Các nhận xét UI dưới đây dựa trên source; các race condition là rủi ro phân tích tĩnh, chưa tái hiện bằng test đồng thời. Không chạy lại bộ test backend trong lượt review này. Con số 191 test pass trong implementation-status là bằng chứng lịch sử, không phải kết quả mới của lượt review.

## 1. Sửa theo đặc tả hiện có trước khi hoàn thiện FE

| Mã / ưu tiên | Phát hiện và tác động | Bằng chứng trong repo | Hướng xử lý / nghiệm thu |
|---|---|---|---|
| R01 / P1 | Chi tiết hóa đơn chỉ chặn Member xem hóa đơn người khác; tài khoản SystemAdministrator vẫn qua được kiểm tra. | `backend/SportHub.Payment/Api/InvoicesController.cs`, `GetDetail`: chỉ có Authorize cấp controller và điều kiện IsInRole(Member). Service nhận invoiceId, không nhận actor. | Kiểm tra cả vai trò lẫn chủ sở hữu ở BE. Test Admin → 403, Member khác → bị từ chối, đúng chủ sở hữu → 200. Coach còn được StaffRead cho danh sách hóa đơn: rà lại quyền đọc tài chính, không suy ra từ quyền đọc vận hành chung. |
| R02 / P1 | SystemAdministrator được xem Audit dù SSOT §7 đang deny khi chưa có quyền rõ. | `backend/SportHub.Administration/Api/AdministrationControllers.cs`, Audit controller; `frontend/src/components/AppShell.tsx`. | Thu hẹp API và menu theo SSOT; test trực tiếp API, không chỉ ẩn menu. |
| R03 / P1 | Member không tự chọn mua gói được, trái luồng BR-30. FE còn ghi nhầm rằng BR-30 chỉ cho mua ở quầy. | `frontend/src/app/hoi-vien/goi-cua-toi/page.tsx`; purchase endpoint trong `InvoicesController.cs` dùng FrontDesk, chỉ Receptionist/Manager. | Thêm self purchase lấy MemberId từ JWT; chọn gói → xem quyền lợi/giá → xác nhận → invoice Issued + gói PendingPayment. Chỉ trả đủ mới Active. Không biến nút xác nhận thành thanh toán online giả. |
| R04 / P1 | Quyền Manager thao tác quầy trong code rộng hơn ma trận thiết kế ở một số hàng. | `AuthorizationPolicyExtensions.cs`: FrontDesk gồm Manager; Design §5 để Manager chỉ xem ở mua gói, đăng ký/hủy hộ, thu tiền. | Lập bảng quyền theo từng hành động, đối chiếu BR v1.4 trước khi sửa. Chỗ quyết định mới đã thắng tài liệu cũ thì cập nhật ma trận; không tự coi Manager kế thừa mọi quyền Receptionist. |
| R05 / P1 | Google login/link chưa có hành trình FE sử dụng được. | `frontend/src/app/dang-nhap/page.tsx`, `tai-khoan/page.tsx`, `frontend/src/lib/auth.tsx`: có hàm Google nhưng UI chủ yếu hiện hướng dẫn cấu hình. | Nút Google, loading, cancel/error, explicit link đúng BR-59/60; test với cấu hình/provider thật. Không đưa ClientId/hướng dẫn kỹ thuật vào màn người dùng. |
| R06 / P2 | Hủy lớp gửi ngay, chưa có xác nhận quyền lợi bị mất; thông báo trả lượt mơ hồ. Đăng ký luôn nói đã trừ lượt dù gói unlimited. | `frontend/src/app/hoi-vien/lich-lop/page.tsx`, `dang-ky-cua-toi/page.tsx`. | Trước xác nhận: buổi, giờ VN, gói dùng, deadline, hoàn 1 lượt hay không hoàn/không áp dụng. Sau thao tác hiển thị kết quả BE trả về; không suy đoán theo đồng hồ FE. |
| R07 / P2 | UI đánh dấu trễ ngay tại deadline bằng `<=`, trong khi đúng mốc vẫn được hoàn. Lịch có thể hiện nút đặt cho buổi Scheduled đã bắt đầu trong ngày. | `dang-ky-cua-toi/page.tsx`, `lich-lop/page.tsx`; `EnrollmentService.GetAvailableSessionsAsync`. | Đúng mốc dùng quy tắc hiện hành; khóa thao tác đã bắt đầu. Test trước/đúng/sau mốc, đồng hồ lệch và API trả conflict. |
| R08 / P2 | API enum/FE đang dựa PascalCase, khác hợp đồng UPPER_SNAKE_CASE đã chốt. | DTO projection `.ToString()`, `frontend/src/lib/types.ts` và các so sánh trạng thái; SSOT §3/5.7. | Đồng bộ DTO/adapter và FE cùng đợt; JWT role vẫn PascalCase. Không chỉ sửa serializer vì nhiều trường là string. |

P1: xử lý trước khi mở rộng nghiệp vụ/cho dùng dữ liệu thật. P2: xử lý trong đợt hoàn thiện FE trước nghiệm thu. Không gọi một lỗi là đã tái hiện runtime chỉ từ việc đọc code.

## 2. Quyết định nghiệp vụ còn thiếu — đề xuất để chủ sản phẩm duyệt

| Quyết định | Hiện trạng / ví dụ thực tế | Đề xuất |
|---|---|---|
| D01. Gói nào được dùng môn nào? | MembershipPackage chưa có quyền lợi theo discipline; ResolvePackage chỉ chọn gói Active dùng được. Nếu bán “Gym phổ thông”, code chưa có cơ sở từ chối dùng gói đó đặt PT. Đây là khoảng trống đặc tả, không tự gán là vi phạm một rule phân môn đã chốt. | Có ma trận quyền lợi rõ: Gym, lớp nhóm và PT. PT cần quyền lợi/lượt riêng nếu sản phẩm kinh doanh như vậy. Cần duyệt mô hình trước khi thêm field; BR-64 hiện cho Gym bằng gói Active cũng phải được đối chiếu nếu đổi. |
| D02. Hạn gói xét ngày đặt hay ngày học? | Gói hết 30/9, đặt ngày 29/9 cho buổi 5/10: code kiểm tra today, chưa kiểm tra ngày buổi học. | Gói phải bao phủ ngày học theo giờ VN. Hiện vẫn giữ rule trừ lượt lúc đăng ký. Nếu chọn mô hình khác, cần mô tả rõ quyền của booking đã giữ chỗ. |
| D03. Quyền lợi gói đã bán có được đổi theo catalog? | PackageActivationService đọc DurationDays/SessionLimit từ catalog lúc trả đủ. Mua/cọc gói 10 lượt, sửa catalog thành 8 rồi trả đủ có thể chỉ được 8. | Snapshot giá và điều khoản/quyền lợi lúc mua; thay catalog áp dụng cho giao dịch mới. Chốt xử lý gói PendingPayment cũ và migration, không âm thầm tính lại. |
| D04. Hết lượt khác hết hạn ra sao? | Đặt lượt cuối làm gói Expired nhưng vẫn có booking sắp tới; Gym BR-64 kiểm Active có thể từ chối vào Gym. | FE ghi rõ “đã dùng/giữ chỗ hết lượt” và booking còn hiệu lực. Chốt riêng quyền vào Gym nếu gói kết hợp; không tự đổi enum hay chuyển thời điểm trừ lượt. |
| D05. Hoàn tiền/hủy dịch vụ xử lý booking tương lai thế nào? | Hiện Refund không tự hủy gói — đúng quyết định đã duyệt. Nhưng hành trình hủy dịch vụ chưa khép kín. | Tách “hoàn thu thừa” và “chấm dứt dịch vụ”. Trường hợp chấm dứt cần preview các booking bị ảnh hưởng, quyền lợi ngừng, tiền giảm nghĩa vụ và tiền hoàn; thực hiện nhất quán + audit. Đây là thiết kế cần duyệt, không phải cứ Refund là Cancelled. |
| D06. Hoàn theo ngày tính ngày hiện tại thế nào? | SSOT vẫn để mở. | Đề xuất ngày đã bắt đầu tính là ngày sử dụng; tính từ ngày tiếp theo, có ví dụ chưa bắt đầu/ngày đầu/ngày cuối. Muốn chính sách ưu đãi khác thì ghi rõ. Chưa coi công thức hiện tại đã nghiệm thu. |
| D07. Hóa đơn quá hạn xử lý thế nào? | Đã chốt chặn thu thông thường; Manager chưa có quy trình ngoại lệ. | Hai lựa chọn có lý do/audit: gia hạn theo chính sách được duyệt hoặc chấm dứt nghĩa vụ kèm xử lý tiền đã thu. Chưa duyệt thì chỉ hiển thị “cần quản lý xử lý”, không làm nút bỏ qua hạn. |
| D08. Quan hệ ClassBased kết thúc và lưu quyền ra sao? | EnsureClassBasedAsync chỉ kiểm cặp coach/member Active, không phân biệt ClassId; một coach dạy hai lớp có thể chỉ còn một nguồn quan hệ. | Quyền theo lớp/session được giao, kết thúc quyền tạo mới khi hết phạm vi; chốt khoảng sửa kết quả và quyền đọc lịch sử. Nếu nhiều nguồn quan hệ phải biểu diễn được từng nguồn, tránh một booking cấp quyền vô hạn. |
| D09. Tiếp nhận khách ở quầy và khôi phục tài khoản | Chưa thấy hành trình FE khép kín từ khách chưa có tài khoản → bán gói; login chưa có quên mật khẩu. | Chốt Receptionist được tạo Member thế nào, xác nhận email/phone và mật khẩu ban đầu. Khôi phục qua kênh phù hợp scope; email thật hiện ngoài MVP nên không dựng UI gửi email giả thành công. |
| D10. Flow 6 chuyển từ stretch sang scope nào? | SSOT hiện vẫn stretch. | Nếu triển khai: Member assistant chỉ đọc trước; ghi phạm vi, nguồn dữ liệu, SLA, privacy và tiêu chí nghiệm thu. Không để từ “AI assistant” mặc nhiên bao gồm đặt/hủy/thu tiền. |

Waitlist, đóng băng gói, chuyển nhượng gói, nhiều chi nhánh và payment gateway không phải việc bắt buộc phải thêm để FE “đủ”. Waitlist có thể để giai đoạn sau. Hệ thống vận hành thực tế thường cho cấu hình thời gian đặt/hủy, sức chứa và waitlist; đây là ví dụ tham khảo, không phải nguồn thay BR của dự án: [Mindbody scheduling](https://www.mindbodyonline.com/business/scheduling).

## 3. Rủi ro dữ liệu cần test trước khi coi luồng đã ổn

1. **Đặt lớp đồng thời hủy buổi:** EnrollmentService kiểm Scheduled trước, nhưng câu UPDATE giữ chỗ chỉ kiểm ID và capacity. Cần đồng bộ booking với cancel/reschedule và kiểm lại trạng thái trong cùng cơ chế khóa/transaction. Test booking đua cancel: không được có Confirmed mới ở buổi Cancelled.
2. **Hai lần hủy cùng booking:** đọc Confirmed rồi cập nhật, chưa thấy concurrency token trên Enrollment. Đặc biệt gói unlimited/hủy trễ không được bảo vệ bằng việc tăng version gói như trường hợp hoàn lượt. Test counter chỉ giảm một lần, lượt chỉ hoàn một lần.
3. **Trùng phòng/coach/member do request đồng thời:** AnyAsync kiểm tra trước khi ghi không tự bảo vệ mọi race. Test hai buổi overlap cùng phòng/coach và hai booking overlap cùng member. Chọn khóa/constraint phù hợp PostgreSQL; transaction đơn thuần chưa đủ.
4. **Kích hoạt hai gói cùng loại qua hai invoice:** khóa mỗi invoice không khóa cặp MemberId/PackageId chung. Test trả đủ hai invoice cùng lúc; không được cả hai Active khi chưa được duyệt cộng dồn.

Nguồn: `EnrollmentService.cs`, `ClassSessionService.cs`, `PackageActivationService.cs`, cấu hình persistence Enrollment/MemberPackage. Các mục này là test target và rủi ro tĩnh, chưa phải kết quả stress test.

## 4. Checklist UI/UX theo hành trình

### Hội viên

- Trang chính cho biết gói nào dùng được, ngày hết hạn, lượt còn lại và buổi tiếp theo; tách PendingPayment khỏi “đã mua và dùng được”.
- Catalog → quyền lợi/giá → xác nhận mua → hóa đơn chờ thanh toán → hướng dẫn thanh toán tại quầy → cập nhật Active khi BE xác nhận thu đủ.
- Lịch lọc ngày/môn/HLV, hiện chỗ còn lại, phòng, thời lượng; xem được vì sao không đặt được. Khi có nhiều gói, cho biết gói thực sự sẽ trừ; chọn mặc định theo hạn sớm nhất chỉ trong các gói đủ điều kiện.
- Hủy có xác nhận hậu quả; màn đăng ký hiển thị kết quả hoàn thực tế. Reschedule phải cho biết buổi cũ đã hủy và dẫn đến buổi mới, không tự chuyển booking trái BR-54.
- Bổ sung lối xem lịch sử Gym của chính mình nếu hoàn thiện quyền đã có ở API. Thông báo nên dẫn đến đúng buổi/gói/hóa đơn, không chỉ đoạn chữ.

### Lễ tân và Quản lý

- Tra hội viên → xác nhận đúng người bằng thông tin tối thiểu → xem gói/booking/công nợ → thao tác. Không buộc nhớ UUID hoặc hiểu mã BR.
- Thu tiền luôn hiện mã hóa đơn, người trả, còn phải thu và số tiền sau giao dịch. Refund tách rõ “chờ duyệt”, “đã duyệt — chưa chi”, “đã thực trả”; giữ mô hình v1.4 đã sửa.
- Không cho submit thao tác tài chính khi chi tiết chưa khớp ID đang chọn hoặc đang đổi bản ghi. `useApi` giữ data cũ, `AsyncSection` chỉ chặn loading khi data null, còn InvoiceWorkbench POST theo selected. Đây là mẫu rủi ro cần test đổi/đóng/mở nhanh trên mạng chậm, chưa xác nhận thao tác nhầm thực tế.
- Hủy/đổi buổi của Manager preview số hội viên bị ảnh hưởng, hoàn lượt và nội dung thông báo. Lỗi overlap nên nêu buổi/phòng/HLV xung đột trong phạm vi quyền xem.
- Tách tạo đề nghị điều chỉnh với duyệt; không phá quy tắc cấm tự duyệt. Không mở rộng quyền Manager chỉ vì dùng chung component với Lễ tân.

### HLV

- Lịch hôm nay → danh sách đúng lớp mình dạy → điểm danh → kế hoạch/kết quả; tránh phải tìm hội viên ở nhiều bảng.
- Kết quả tập tuân thủ BR-61 Enrollment Confirmed; không tự thêm điều kiện phải Present khi đặc tả chưa yêu cầu.
- Gợi ý AI Flow 5 cần đường chuyển sang bản nháp kế hoạch để HLV chỉnh và lưu; hiện UI chủ yếu đọc gợi ý. Ghi rõ dữ liệu demo/deterministic khi chưa dùng provider thật.

### Chất lượng dùng chung

- `Dialog` có Escape nhưng chưa thấy focus trap, đặt/khôi phục focus và bảo vệ khi đang submit; test dialog lồng nhau. Thao tác đang chạy/dirty không nên biến mất do click nền ngoài ý muốn.
- `MemberPicker` cần trạng thái lỗi riêng, label liên kết và điều khiển bàn phím; lỗi tải không được hiển thị như “không có hội viên”.
- Form lỗi ngay trường tương ứng, giữ dữ liệu đã nhập, đưa focus tới lỗi; thông báo thành công/lỗi phải dễ nhận biết. Tham khảo [W3C form notifications](https://www.w3.org/WAI/tutorials/forms/notifications/).
- Mobile: sidebar hiện chuyển thành nav wrap nhiều mục; cần kiểm tra 360/390px, bảng dài, nút xác nhận và bàn phím ảo. Chưa có bằng chứng visual mobile trong lượt review này.
- Notification tải lỗi phải có retry; đánh dấu đã đọc phải xử lý lỗi/busy. Ẩn mã lỗi/BR/chi tiết cấu hình khỏi nội dung chính, giữ thông tin chẩn đoán ở nơi phù hợp.
- Demo login buttons cần giới hạn môi trường demo; trước deployment thật kiểm tra cả UI lẫn seed/config. Không kết luận đang lộ tài khoản production từ việc có fixture demo.

## 5. Phạm vi và kế hoạch Flow 6 đề xuất

### Bản đầu

Chỉ Member, chỉ dữ liệu của chính mình: hỏi lịch, gói/lượt, booking, giá dịch vụ và chính sách đã duyệt. Flow 5 vẫn là gợi ý bài tập cho HLV, không nhập hai luồng làm một. Hiện chưa thấy chat endpoint/route được triển khai; endpoint trong Design là đặc tả stretch.

1. FAQ có phiên bản từ chính sách được duyệt; lịch/giá/quyền lợi lấy từ API/DB hiện hành. Hỏi deadline của một booking phải dùng snapshot booking, không dùng cấu hình chung mới nhất.
2. Tool chỉ đọc có DTO rõ, phân quyền BE, MemberId từ JWT. Không cho model tự truyền một memberId bất kỳ hoặc truy vấn SQL tùy ý.
3. Câu trả lời kèm thông tin nguồn/thời điểm phù hợp và card dẫn sang màn đặt/hủy. Không trả lời “đã đặt”, “đã hoàn tiền” khi chưa có giao dịch thực tế.
4. Không chắc hoặc dữ liệu thiếu: nói rõ, cho retry/đường liên hệ quầy. Không bịa giá, lượt, chỗ trống hay quyền lợi chưa chốt.
5. UI có câu hỏi mẫu, đang trả lời, dừng, thử lại, giữ câu hỏi khi lỗi và trạng thái mất kết nối. Nếu stream thì phân biệt đang tạo với hoàn tất.

### Cần chốt trước coding

- BR-28 yêu cầu thời gian phản hồi: nếu giữ 3 giây, đo đúng chỉ tiêu phản hồi hoàn chỉnh theo BR; không tự đổi thành thời gian token đầu tiên. Muốn sửa SLA phải cập nhật nguồn chính thức và định nghĩa timeout/fallback.
- Lưu chat hay không, thời gian lưu/xóa, ai được đọc; log tối thiểu, không ghi token/secret hay toàn bộ dữ liệu nhạy cảm mặc định.
- Provider thật, giới hạn request/token/chi phí, timeout và hành vi khi provider hoặc API nội bộ hỏng.
- Phạm vi tư vấn sức khỏe theo BR-29; không để assistant biến thành chẩn đoán hay đưa cam kết ngoài chức năng trung tâm.

Giới hạn công cụ theo quyền tối thiểu và kiểm tra ở server giúp giảm rủi ro model bị hướng dẫn làm vượt quyền; không chỉ dựa system prompt. Tham khảo [OWASP Excessive Agency](https://genai.owasp.org/llmrisk/llm062025-excessive-agency/) và [Prompt Injection Prevention](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html).

### Trình tự triển khai

1. Chốt D01–D08 ảnh hưởng dữ liệu trả lời, D10 và SLA/privacy; đồng bộ SSOT/DOCX/Design nếu được duyệt.
2. Khép các lỗi quyền và luồng mua/đặt/hủy; thống nhất enum/error contract với FE.
3. Làm chat shell và API contract bằng fixture có nhãn demo; không coi là tích hợp AI hoàn tất.
4. Tích hợp provider và read tools, lấy dữ liệu thực có kiểm tra sở hữu; thêm giới hạn/timeout/log.
5. Test end-to-end: đúng chủ sở hữu, xin dữ liệu người khác, yêu cầu bỏ qua quyền, giá không tồn tại, gói hết hạn, buổi vừa hủy, deadline snapshot cũ, API/provider lỗi, vượt rate limit. Test mọi card dẫn đúng màn.

## 6. Điều kiện để bắt đầu nghiệm thu FE

- Ma trận vai trò–màn hình–hành động khớp BE; API không cho vượt quyền dù gọi ngoài UI.
- Mỗi màn có loading, empty, error/retry, success; mỗi thao tác có validation và conflict handling.
- Chạy ít nhất một hành trình thật cho cả 5 vai trò; mua → cọc → trả đủ → đặt → hủy đúng/trễ → kiểm tra lượt; Manager hủy/đổi lớp; duyệt refund → thực trả → đối soát.
- Test gói unlimited, lượt cuối, ngày hết hạn, nhiều gói, lớp đầy và các race ở §3.
- Kiểm tra desktop/mobile/bàn phím trên app chạy được; ghi rõ môi trường và kết quả mới, không dùng báo cáo pass cũ thay bằng chứng.
- Trước mắt ưu tiên R01–R05 và D01–D08. Làm khung FE song song được; chưa khóa UI nghiệp vụ hoặc cho chatbot khẳng định các chính sách đang mở.
