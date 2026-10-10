# Bàn giao task An và Hào (10/10/2026)

Nhánh làm việc: `codex/non-uiux-handoff-20261010`. Tài liệu này ghi rõ phần AI đã làm và việc cần người có môi trường/tài khoản thật thực hiện. **Chưa coi task hoàn thành hoặc hệ thống đủ điều kiện go-live** cho đến khi có nghiệm thu VNPay sandbox, SMTP, thiết bị quầy và staging của team. Team phụ trách deploy; phần bàn giao này không thực hiện deploy. Xem thêm [các bước An/Hào](AN-HAO-MANUAL-STEPS.md) và [kiểm thử Member theo trang](MEMBER-MANUAL-TEST.md).

### Bằng chứng tự động đã chạy trên máy phát triển

- PostgreSQL Testcontainers: `SportHub.Payment.Tests` **151/151**, `SportHub.Scheduling.Tests` **117/117**. Trong đó có test callback đến sau khi tắt dịch vụ PT; giao dịch đã tạo được hoàn tất đúng một lần, báo giá mới bị chặn.
- `CoachAssignmentReadTests` và `PtSelfBookingTests`: **9/9**. Quan hệ Ended ẩn PT list/detail và workout list khỏi Coach, Member vẫn xem được kế hoạch cũ.
- `MemberCodeTests` và `CoachMemberScopeTests`: **2/2**. `ThresholdTransferTests`: **6/6** sau khi test chuyển sang luồng phản hồi bằng `responseId` của ứng dụng.
- Frontend `npm run typecheck`, `npm run build` và Playwright `member-code.spec.ts`, `pt-booking.spec.ts`, `member-owned-courses.spec.ts` **9/9**. Test phát hiện và đã sửa trường hợp đặt PT thành công nhưng tab vẫn ở màn đặt lịch, không hiện xác nhận; trang lớp đã mua cũng được hiển thị theo `view=owned`.

## An — Payment, G02, G05, CAT-01

### Đã có trong code

- PAY-01/PAY-03/G11: checkout, ví/split điểm, IPN/return public, kiểm chữ ký và idempotency đã có từ nhánh bàn giao trước. Test HTTP callback đã viết trước đó nhưng chưa chạy được ở máy này.
- G02: `WAIT_NEXT_COURSE` hoàn điểm 100% theo cùng `ThresholdResponseId` trong transaction, hủy ghi danh cũ, lưu subscription theo môn; retry cùng lựa chọn không hoàn lại. Publish khóa mới cùng môn đưa thông báo vào outbox, không tự giữ chỗ hoặc ghi danh. Member xem/hủy nhận tin; Manager xem danh sách. UI đã gọi API thật. Test PostgreSQL mới nằm trong `ThresholdTransferTests`.
- G05: hai setting `pt.self_book_min_lead_hours` (mặc định 12, 1–168) và `pt.self_book_max_advance_days` (mặc định 30, 1–90) dùng chung ở availability và lúc đặt. Kiểm Membership Active theo `CurrentMemberPackageId` tại cả hai thời điểm. Bước lưới 30 phút, thời lượng 90 phút và hạn đổi lịch 24 giờ vẫn là quy tắc cố định. Có unit test policy mới.
- Migration mới: `20261010070126_ConfigurePtSelfBooking` và `20261010070510_CourseInterestSubscriptions` (tên timestamp thực tế xem thư mục Migrations). Áp theo thứ tự timestamp.

### Cần An và Khôi nghiệm thu

1. Nếu cần tái chạy trên máy An: bật Docker Desktop Linux engine, từ repo chạy `dotnet test backend/SportHub.Scheduling.Tests/SportHub.Scheduling.Tests.csproj -c Release --filter FullyQualifiedName~ThresholdTransferTests` và `dotnet test backend/SportHub.Training.Tests/SportHub.Training.Tests.csproj -c Release --filter FullyQualifiedName~PtSelfBookingTests`. Test đã chạy thành công trên máy phát triển; An chỉ cần tái chạy khi đổi code hoặc trên môi trường CI riêng. Không chạy test trên DB production.
2. Backup DB staging; áp migration bằng lệnh triển khai trong `RUNBOOK.md`. Kiểm tra `system_settings` có hai key PT; bảng `course_interest_subscriptions` tồn tại; dữ liệu cũ không đổi. Test nâng cấp trên bản sao DB đang có giao dịch, không chỉ DB trống.
3. PAY-01/PAY-05/CAT-01: các test PostgreSQL tự động đã qua, gồm callback muộn sau khi tắt dịch vụ PT. Trên staging, An vẫn cần kiểm tra thanh toán thật, OTP quầy, split điểm, hold hết hạn, callback lặp, refund và QueryDR; đối chiếu mỗi transaction reference có tối đa một fulfillment và không cấp trùng quyền lợi/điểm/seat.
4. PAY-02/PAY-04: Khôi cung cấp staging HTTPS có `GET /api/payments/vnpay/ipn` truy cập công khai. An cấu hình `VnPay__UseMock=false`, `VnPay__TmnCode`, `VnPay__HashSecret`, `VnPay__PaymentUrl`, `VnPay__QueryUrl`, `VnPay__ReturnUrl=https://<frontend>/payments/return`. Thực hiện thanh toán sandbox từ UI và QR VNPay, quan sát return, IPN không có JWT, trạng thái checkout từ server. Thử replay IPN và chữ ký sai; lưu request ID, thời điểm và trạng thái DB đã che dữ liệu nhạy cảm. Merchant sandbox secrets chỉ đặt trong secret store/.env staging, không gửi qua chat hoặc commit.
5. INT-01 SMTP: cấu hình `Email__Smtp__Host/Port/Username/Password/FromAddress`, kiểm OTP đăng ký, reset password, OTP dùng điểm tại quầy, delivery/retry. Cần mailbox test mà nhóm kiểm soát. INT-02 Gemini thuộc Khoa nhưng An có thể hỗ trợ nếu được giao; chưa cần để đóng payment.
6. G02: test hai lần gửi cùng response, khác choice sau lần đầu (409), hết hạn, nguồn đã hủy, unsubscribe rồi publish khóa khác cùng môn. Kiểm ví cộng đúng số điểm, không có enrollment mới và không tạo hold/invoice mới. G05: Manager sửa hai setting, availability và POST booking cùng tuân thủ giá trị mới; gói hết hạn/bị hủy trả `membership_not_active`.

## Hào — QR Member, Coach scope, quầy/check-in

### Đã có trong code

- G04: `GET /api/member-codes/me` chỉ Member Active, phát mã opaque hết hạn sau 5 phút bằng Data Protection. `POST /api/member-codes/lookup` chỉ Lễ tân/Manager, xác thực mã và trạng thái Member; không chấp nhận user ID tự gõ thành QR. Frontend hiển thị/quét mã backend. Mã chỉ tra tài khoản, không thay OTP, thanh toán hay check-in. Khóa Data Protection phải được lưu bền vững qua deploy.
- G12: Coach không thể duyệt toàn bộ users/packages. Guard profile/workout history/PT session detail đã chuyển xuống service; danh sách plan/result/PT entitlement/PT session Coach lọc quan hệ Active. Relationship search của Coach bị ép `activeOnly=true`. Lịch lớp/roster đã có coach scope trước đó. Test QR mới ở `MemberCodeTests`; test Coach cũ ở `CoachMemberScopeTests`.

### Cần Hào nghiệm thu

1. Test tự động mã hội viên đã qua trên PostgreSQL test. Hào thử trên thiết bị thật: QR hợp lệ, sửa một ký tự, mã hết hạn sau 5 phút, Member bị khóa, role Coach/Member tra lookup bị 403; quét không được tự check-in hay dùng điểm.
2. Rà E2E `CoachMemberRelationshipsController`, `WorkoutController`, `PtSessionsController`, `PtEntitlementsController`, `ClassSessionsController`, `MemberPackagesController`, `TrainingProfilesController`: Coach A chỉ xem Member có quan hệ Active hoặc lịch lớp được giao; Coach B và quan hệ Ended phải bị chặn. Negative test PT list/detail và workout list sau Ended đã có. Nếu nghiệp vụ cần Coach thấy lịch PT lịch sử sau khi quan hệ kết thúc, nhóm phải xác nhận rõ phạm vi trước khi sửa service.
3. Tại quầy, chạy bán gói/đăng ký lớp cho Member được tra bằng QR, dùng điểm phải có OTP của Member; quét QR không được bỏ qua OTP. Test Gym check-in, checkout, lịch sử và attendance lớp với Lễ tân; Coach/Member không được điểm danh. Chụp evidence status HTTP, role, invoice/ledger/attendance ID đã ẩn thông tin cá nhân.

## Thông tin nhóm cần chuẩn bị

- Khôi: URL staging frontend/API qua HTTPS, cấu hình CORS, đường callback IPN công khai, DB staging/test riêng, backup/restore và quyền xem log/outbox. Bảo đảm Data Protection keys và reports trên volume bền vững.
- An: quyền merchant VNPay sandbox, tài khoản thanh toán sandbox, quyền cấu hình callback/QueryDR, hộp thư SMTP test. **Không chia sẻ secret qua chat/GitHub.** Chỉ báo đã cấu hình và gửi log đã che mã/secret.
- Hào: tài khoản thử của 5 role, ít nhất 2 Coach và 2 Member; một cặp quan hệ Active, một cặp Ended; một Membership Active và một đã hết hạn; máy/điện thoại có camera để thử QR.
- Chủ sản phẩm: chốt giá PT thật, thời gian báo trước/đặt xa PT và policy Coach có được xem lịch sử sau khi hết quan hệ hay không. G08 (màn refund riêng) chỉ làm khi được xác nhận là requirement.

## Evidence tối thiểu để đóng

Ghi commit/PR, migration đã áp, phiên bản staging, lệnh test và kết quả, ảnh/log đã che PII/secret, giao dịch sandbox tham chiếu, số dư/entitlement/seat trước–sau, kết quả replay/late callback và người xác nhận. Test tự động xanh chỉ xác nhận phần code trong môi trường thử nghiệm; chưa thay thế nghiệm thu sandbox và staging.
