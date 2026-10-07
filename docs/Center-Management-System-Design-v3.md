# SportHub — Thiết kế hệ thống quản lý trung tâm thể thao

SportHub là **hệ thống quản lý trung tâm thể thao với ba môn: Gym (bao gồm dịch vụ huấn luyện cá nhân PT), cầu lông và bóng rổ; có khả năng mở rộng thêm môn trong tương lai**. PT là dịch vụ thuộc Gym, không phải môn thứ tư.

Tài liệu này mô tả độc lập phạm vi, kiến trúc, dữ liệu, luồng nghiệp vụ và tiêu chí nghiệm thu. Tên file được giữ để bảo toàn liên kết; nội dung không phụ thuộc bản thiết kế đã xóa.

**Quy ước trạng thái:** “Có mã” là có implementation, không đồng nghĩa đã nghiệm thu. “Chưa triển khai” là thiếu mã/contract; “chưa kiểm chứng” là còn thiếu bằng chứng kiểm thử tích hợp hoặc vận hành. Xem danh sách cụ thể tại mục 13.

## 1. Phạm vi sản phẩm

### 1.1 Ba môn và hình thức dịch vụ

| Môn | Dịch vụ | Đơn vị mua | Quyền lợi |
|---|---|---|---|
| Gym | Tập tự do | Membership có thời hạn | Check-in/out tại quầy khi gói có hiệu lực |
| Gym | PT một Coach — một Member | Gói PT riêng, cần Membership Active | Quota buổi tập, lịch PT, kế hoạch, kết quả, homework |
| Cầu lông | Khóa học; thuê sân | Gói cả khóa hoặc lượt thuê | Ghi danh nhiều buổi; Member được thuê sân khung trống |
| Bóng rổ | Khóa học; thuê sân | Gói cả khóa hoặc lượt thuê | Ghi danh nhiều buổi; Member được thuê sân khung trống |

Membership chỉ cấp quyền vào Gym và là điều kiện mua PT. Khóa cầu lông/bóng rổ mua độc lập Membership. PT dùng domain riêng, không lưu buổi tập vào Class/ClassSession/Enrollment.

### 1.2 Mở rộng môn

Môn, chuyên môn Coach, loại phòng/sân, giờ mở cửa và giá là dữ liệu cấu hình. Thêm môn dùng hình thức vận hành đã hỗ trợ phải tái sử dụng luồng lịch, mua dịch vụ, thanh toán và báo cáo; không rẽ nhánh nghiệp vụ theo tên môn hoặc ID seed cố định. Môn có quy tắc khác cần bổ sung validation, thiết kế và kiểm thử.

**Mô hình đã triển khai (CAT-01):** môn (`sports`, có `code` bất biến) tách khỏi dịch vụ (`sport_service_offerings`: `MEMBERSHIP_ACCESS`, `GROUP_COURSE`, `COURT_RENTAL`, `PERSONAL_TRAINING`). Ba môn seed là Gym (Membership và PT), Cầu lông và Bóng rổ (khóa học nhóm và thuê sân); PT không còn là môn riêng. Membership và PT chỉ bật được ở môn có mã `gym`, kiểm ở backend. Mặc định thời lượng và sĩ số lớp nằm trên dịch vụ `GROUP_COURSE`. Quyền PT của Coach đến từ `coach_service_qualifications` (không suy ra từ chuyên môn Gym) và phòng PT từ `service_room_types`. Tắt môn hoặc dịch vụ chỉ chặn giao dịch mới, không hủy hay sửa thứ đã bán; fulfillment của hóa đơn đã tạo vẫn chạy. Manager thêm môn có lớp hoặc thuê sân bằng cấu hình, không sửa code. Chi tiết API ở [api-contract](api-contract.md).

### 1.3 Ranh giới

Trong phạm vi: tài khoản, Membership Gym, PT, môn/sân, khóa học, lịch, điểm danh, thuê sân, payment/ví điểm, hoàn điểm, thông báo, báo cáo và AI hỗ trợ.

Ngoài phạm vi: đa chi nhánh, payroll/hợp đồng nhân sự, gym bên ngoài, chia doanh thu với người thuê sân, quản lý người đi cùng khi Member thuê sân, mobile native, hoàn tiền mặt/chuyển khoản, VNPay Refund API và cổng thanh toán production. Gói dịch vụ bổ sung và waitlist tự giữ chỗ chưa thuộc phạm vi. “Chờ đợt sau” là hoàn điểm và lưu nguyện vọng nhận thông báo, không phải giữ chỗ tương lai.

## 2. Vai trò và quyền hạn

| Vai trò | Trách nhiệm | Giới hạn |
|---|---|---|
| Guest | Xem thông tin trung tâm, môn, khóa/gói công khai; đăng ký | Không phải role tài khoản; không đọc roster, ví hoặc lịch cá nhân |
| Member | Mua dịch vụ; thuê/hủy sân còn trống; xem lịch, quyền lợi, hóa đơn, ví; yêu cầu hỗ trợ | Chỉ dữ liệu của mình; không tự xác nhận payment |
| Receptionist | Tiếp đón, Gym check-in/out, điểm danh lớp, checkout hộ | Dùng điểm hộ cần OTP Member; không tự cấp điểm hoặc duyệt refund |
| Coach | Xem lịch được giao; Coach PT lập plan, ghi result, giao homework | Chỉ lớp/học viên được phân công; kiểm cả role và quan hệ |
| CenterManager | Môn/sân, Coach/chuyên môn, lớp/lịch, sự cố, hoàn điểm, báo cáo | Theo mức hệ thống tính; không tự duyệt yêu cầu của mình |
| SystemAdministrator | Tài khoản nhân sự, role, khóa/mở tài khoản | Không mặc nhiên có quyền tài chính hoặc hồ sơ tập luyện |

Backend kiểm policy, ownership, quan hệ và approval; ẩn nút frontend không thay thế authorization. Khoảng trống quyền đọc được ghi tại mục 13.

## 3. Kiến trúc và ranh giới module

Next.js phục vụ frontend; ASP.NET Core phục vụ API; PostgreSQL lưu dữ liệu. Backend là modular monolith: cùng tiến trình/database transaction, mỗi module sở hữu nghiệp vụ riêng. Không cần thêm message broker hoặc microservice cho phạm vi này.

| Module | Trách nhiệm |
|---|---|
| `SportHub.Identity` | Account, credential, profile, external login, OTP, chuyên môn |
| `SportHub.Membership` | Catalog Membership, gói đã mua, hiệu lực và gia hạn |
| `SportHub.Scheduling` | Môn/phòng/giá, lớp, ghi danh, giữ chỗ, occupancy, thuê sân, sự cố, Gym check-in |
| `SportHub.Training` | Quan hệ Coach–Member, PT entitlement/session/change request, plan/result/homework |
| `SportHub.Payment` | Invoice, checkout, attempt, gateway, reconciliation, ví/ledger, OTP dùng điểm, refund |
| `SportHub.Notification` | Feed, email outbox, thông báo thủ công, retry delivery |
| `SportHub.AI` | Member assistant theo context, workout recommendation; Manager AI còn thiếu |
| `SportHub.Audit` | Dấu vết hành động |
| `SportHub.Administration` | Quản trị tài khoản, cấu hình và xuất báo cáo |
| `SportHub.BuildingBlocks` | Shared kernel, abstractions và hợp đồng liên module |
| `SportHub.API` | Composition root, middleware, persistence/migration, cấu hình, jobs |

Controller xác thực request; application service kiểm nghiệp vụ và transaction; domain chứa quy tắc; persistence thực thi FK/unique/check/exclusion constraints. Các lệnh liên module qua interface như `ICheckoutService`, `IOccupancyService`, `IPointWalletService`, `IPtPurchaseFulfillment`, không gọi HTTP vòng lại chính ứng dụng.

## 4. Mô hình dữ liệu

### 4.1 Bản đồ quan hệ

| Nhóm | Thực thể | Quy tắc |
|---|---|---|
| Danh tính | UserAccount, UserCredential, UserProfile, UserExternalLogin, EmailOtp | Tách account/auth/profile; FK nghiệp vụ trỏ account |
| Coach | CoachProfile, UserSportSpecialty | Nhiều chuyên môn |
| Catalog | Sport, RoomType, SportRoomType, Room, RoomOpeningHour, RoomBlock, CourtRate | Môn tương thích loại phòng; giờ/giá do trung tâm cấu hình |
| Membership | MembershipPackage, MemberPackage | Catalog khác quyền lợi đã mua; snapshot thời hạn |
| Khóa học | Class, ClassScheduleRule, ClassSession, Enrollment, Attendance | Lớp có nhiều buổi; ghi danh cả lớp; attendance unique theo enrollment/session |
| Giữ chỗ | SeatHold, RoomOccupancy, CoachOccupancy | Hold có TTL; một cơ chế chung chống trùng sân/Coach |
| Ngưỡng lớp | ThresholdResponse | Token hash, deadline, choice, resolution; bảng class_threshold_responses |
| PT | CoachMemberRelationship, PtEntitlement, PtSession, PtSessionChangeRequest, PtCoachChangeRequest | Quota/lịch thuộc Training; phòng PT có thể nullable |
| Tập luyện | WorkoutPlan, WorkoutPlanItem, WorkoutResult, HomeworkAssignment, HomeworkAssignmentItem | Result gắn buổi PT; plan có lifecycle |
| Thuê sân | CourtRental, IncidentNotice | Môn, phòng, Member thuê, khoảng giờ, invoice/item |
| Thanh toán | Invoice, InvoiceItem, CheckoutSession, PaymentAttempt, Payment, VerifiedGatewayEvent | Tách nghĩa vụ mua, cycle, lần thử, tiền xác minh, inbox callback |
| Điểm/hoàn | PointWallet, PointLedgerEntry, PointConfirmation, PaymentAdjustment | Ledger phát sinh; OTP ủy quyền; refund theo item, không thêm bảng Refund song song |
| Hỗ trợ | Notification, AuditLog, AiLog, SystemSetting, ReportExport | Thông báo, truy vết, cấu hình và xuất báo cáo |

### 4.2 Ánh xạ vật lý và snapshot

Sơ đồ dưới biểu diễn các quan hệ nghiệp vụ chính, không thay thế toàn bộ schema vật lý:

```mermaid
erDiagram
    UserAccount ||--o{ MemberPackage : owns
    MembershipPackage ||--o{ MemberPackage : defines
    MemberPackage ||--o{ PtEntitlement : supports
    PtEntitlement ||--o{ PtSession : grants
    Sport ||--o{ Class : categorizes
    Class ||--o{ ClassSession : schedules
    Class ||--o{ SeatHold : reserves
    Class ||--o{ Enrollment : enrolls
    UserAccount ||--o{ Enrollment : owns
    Enrollment ||--o{ Attendance : records
    ClassSession ||--o{ Attendance : receives
    Room ||--o{ RoomOccupancy : occupies
    UserAccount ||--o{ CoachOccupancy : occupies
    UserAccount ||--o{ CourtRental : rents
    Room ||--o{ CourtRental : hosts
    UserAccount ||--o{ Invoice : benefits
    Invoice ||--|{ InvoiceItem : contains
    Invoice ||--o{ CheckoutSession : tracks
    Invoice ||--o{ PaymentAttempt : attempts
    PaymentAttempt o|--o| Payment : verifies
    InvoiceItem ||--o{ PaymentAdjustment : adjusts
    UserAccount ||--o| PointWallet : owns
    PointWallet ||--o{ PointLedgerEntry : records
```

- API `beneficiaryUserId` là Member; entity `Invoice.MemberId`/cột `member_id` giữ tương thích, không suy role từ tên field.
- InvoiceItem có typed FK `ClassId`, `CourtRentalId`, `PtEntitlementId`, `MemberPackageId`, `SportId`; `RelatedEntityId` giữ cho lịch sử có kiểm soát, không dùng để đoán FK.
- Giá, tên môn, tần suất PT và `MemberPackage.DurationDaysSnapshot` được snapshot tại checkout. Sửa catalog không đổi quyền lợi đã mua.
- `SourceInvoiceItemId`/`TransferDifferenceInvoiceItemId` giữ chuỗi giá trị chuyển lớp và cap refund.
- `Payment.PaymentAttemptId` truy vết attempt; `VerifiedGatewayEvent` giữ callback/query đã xác minh để dedup/replay.
- `PaymentAdjustment` lưu item, điểm hệ thống tính/điểm duyệt và ledger reference; field payout cũ chỉ đọc lịch sử.
- `fulfillmentOutcome` là DTO suy ra từ trạng thái/PaidVia/reconciliation, không thêm cột trạng thái trùng nguồn sự thật.

Chi tiết tại [từ điển dữ liệu](entity-field-purpose.md) và [API contract](api-contract.md). Khi tên logic và vật lý khác nhau, dùng mapping cùng entity/configuration thực tế.

## 5. Luồng nghiệp vụ

### 5.1 Tài khoản và Membership Gym

Đăng ký Member bằng email dùng OTP. Tài khoản nhân sự được tạo theo policy. Đổi/reset mật khẩu và khóa tài khoản phải vô hiệu phiên không còn hợp lệ.

**Quên mật khẩu (BR-103) — đã triển khai bằng link email, không dùng OTP:** `POST /api/auth/password/forgot` luôn trả 204 trung tính (không lộ email nào đã đăng ký; email không tồn tại, bị khóa hay đang chờ gửi lại đều như nhau). Với tài khoản Active, hệ thống tạo token ngẫu nhiên 256-bit, chỉ lưu SHA-256 trong `EmailOtp` (purpose `ResetPassword`), hạn 10 phút, dùng một lần, chỉ link mới nhất hợp lệ, gửi lại sau 60 giây; email mang nút tới `{Frontend:BaseUrl}/reset-password?email=&token=`. `POST /api/auth/password/reset` nhận `{email, token, newPassword, confirmNewPassword}`, tiêu token và đổi security stamp trong cùng transaction. Giao diện: `/forgot-password` (thông điệp trung tính, cooldown 60 giây gắn theo từng email, đổi email gửi được ngay) và `/reset-password` (ô mật khẩu có con mắt, ba trạng thái form/thành công/link hỏng). Đăng ký Member vẫn dùng OTP 6 số. *Chưa có:* email thông báo "mật khẩu đã thay đổi" mà BR-103/104 mô tả.

**Ngôn ngữ giao diện:** các trang xác thực (`/login`, `/register`, `/forgot-password`, `/reset-password`) luôn tiếng Anh, không đọc ngôn ngữ đã lưu và không có nút đổi ngôn ngữ; phần còn lại giữ EN/VI.

Chọn Membership → snapshot và checkout → payment xác minh → kích hoạt gói. Receptionist check-in/out dựa trên hiệu lực gói. Không dùng SessionLimit/RemainingSessions legacy để giới hạn vào Gym. Gia hạn giữ snapshot quyền lợi, xử lý gói nối tiếp và carry-over PT theo Business Rules.

### 5.2 PT thuộc Gym

Membership Active → chọn Coach có chuyên môn, lấy PT quote → checkout riêng → kích hoạt PtEntitlement → xếp buổi theo quota, validity, availability và quan hệ Coach–Member. Buổi PT 90 phút; frequency 1/2/3 buổi mỗi tuần dùng tính gói, không tự tạo booking tuần.

Coach ghi kết quả/plan/homework cho học viên được giao. Đổi/hủy/đổi Coach qua change request. Member self-booking và slot availability chưa có đầy đủ API, không mô tả là đã triển khai.

### 5.3 Khóa cầu lông và bóng rổ

**Seed lịch cố định (BR-141):** Bóng rổ 01 Thứ 2-4-6 07:00–09:00, Bóng rổ 02 Thứ 3-5-7 14:00–16:00; Cầu lông 01/02 cùng khung giờ trên sân cầu lông riêng. Khung còn lại mở cho Member thuê (mục 5.5); Manager có thể thêm lớp/sân vào khung khác sau.

Manager tạo lớp, nhiều buổi, phòng và Coach phù hợp → publish → Member mua cả khóa → giữ chỗ TTL → payment thành công tạo Enrollment → Receptionist điểm danh từng buổi.

Sĩ số thuộc Class. `ReservedCount` hiện bao gồm chỗ đang giữ và đã xác nhận: `ConfirmedCount <= ReservedCount <= Capacity`. Tăng/giảm trong transaction với row lock/conditional update, không read-then-write rời rạc. Lớp nhóm dùng Present/Absent; không áp dụng booking restriction do No-show hoặc hạn mức theo ngày của mô hình lớp theo buổi. PT xử lý No-show riêng.

### 5.4 Ngưỡng lớp và chuyển lớp

Đánh giá số ghi danh trước buổi đầu theo cấu hình. Lớp dưới ngưỡng gửi lựa chọn chuyển lớp/hoàn điểm cùng deadline; job xử lý quá hạn idempotent. Miễn ngưỡng cần Manager và lý do.

Chuyển lớp kiểm tra chỗ, điều kiện lớp đích và chuỗi giá trị đã trả. Chênh lệch dương qua checkout riêng, chỉ chuyển sau fulfillment. Không cấp quyền lợi lớp đích mà bỏ quên kết thúc lớp nguồn.

“Chờ đợt sau” chưa triển khai: hoàn 100% điểm ngay + lưu nguyện vọng nhận thông báo khóa phù hợp; không giữ tiền/chỗ hoặc tự ghi danh.

### 5.5 Thuê sân

Member chọn môn/sân/giờ trong khung trống (khung lớp cố định theo BR-141 không cho thuê) → kiểm giờ mở cửa, giá, occupancy → snapshot giá theo block giờ → giữ sân → checkout → xác nhận rental. Không khai báo số người, không giới hạn số người, không quan tâm mục đích sử dụng.

Hủy/hết hạn giải phóng occupancy đúng một lần. Hủy đủ hạn hoặc lỗi trung tâm hoàn điểm theo rule; không hoàn qua gateway. Không lưu roster hay số người đi cùng của Member thuê sân.

### 5.6 Sự cố

Preview tác động → Manager thực hiện phương án dời/bù/hủy lớp hoặc PT → preview lại → resolve. Resolve recheck lịch, hủy/hoàn rental phù hợp và tạo incident/block trong transaction cuối.

Toàn chuỗi tương tác không phải một transaction duy nhất. Incident history/detail, preview bồi hoàn/người nhận đầy đủ và cơ chế chặn booking trong lúc xử lý còn thiếu.

## 6. Payment, VNPay và ví điểm

### 6.1 Bất biến tài chính

`TotalAmount = PointsApplied × 1.000 + CashAmount`. VND dùng decimal; điểm là số nguyên không âm. Backend tính giá và kiểm số dư, không tin tổng tiền client gửi.

Một invoice có nhiều checkout cycle/attempt nhưng không ghi tiền/cấp quyền lợi trùng. Retry hoặc đổi điểm không ghi đè lịch sử attempt. Command dùng Idempotency-Key: retry cùng ý định giữ key; ý định mới dùng key mới.

### 6.2 Luồng thanh toán chuẩn

1. Tạo invoice/item, checkout, snapshot giá, ownership, revision và resource hold.
2. Người mua chọn điểm; dùng điểm hộ tại quầy cần OTP gắn đúng Member/checkout/revision/số điểm.
3. Giữ điểm atomically. Nếu CashAmount bằng 0, hoàn tất và fulfillment trong transaction, không tạo VNPay attempt.
4. Nếu còn tiền, tạo attempt snapshot, reference duy nhất, deadline và payment URL qua IPaymentGateway.
5. IPN hoặc QueryDR xác minh chữ ký, merchant, reference, amount, status và thời điểm; capture inbox bền vững để retry.
6. Transaction ghi Payment, Spend điểm giữ, invoice, quyền lợi Membership/PT/enrollment/rental, audit và outbox.
7. Return chỉ hiển thị; UI đọc backend, không đánh dấu đã mua từ query string hoặc ảnh chuyển tiền.

### 6.3 Expiry và đối soát

Expiry nhả seat/occupancy/điểm đúng một lần. Tiền đến muộn vẫn đối soát: recheck khả năng fulfillment; nếu không thể cấp quyền lợi thì bồi hoàn điểm hoặc đưa vào xử lý đối soát. Không bỏ callback, không bán vượt chỗ.

UI phân biệt PENDING, FULFILLED, COMPENSATED, RECONCILIATION_REQUIRED. Nhận tiền không đồng nghĩa cấp quyền lợi; không suy kết quả chỉ từ PAID_AFTER_RECONCILIATION.

### 6.4 Refund và báo cáo

Refund theo invoice item, quyền lợi đã dùng và chuỗi chuyển lớp. Server tính cap; Manager duyệt theo policy. Ledger credit, hủy quyền lợi, audit/outbox phải nguyên tử, chống replay. Không rút/chuyển điểm hoặc dùng VNPay Refund API.

Báo cáo tách tiền VNPay thực thu, điểm dùng, điểm phát hành do hoàn/bồi hoàn và dịch vụ được cấp. Không cộng điểm hoàn thành doanh thu tiền mới. Dùng snapshot môn; dữ liệu không xác định được không tự gán vào Gym.

### 6.5 Implementation và giới hạn

Đã có VnPayGateway tạo URL/ký request, verify callback, QueryDR; VnPaySigner, callback controller, reconciliation service/job, checkout, wallet, refund và frontend payment. **Payment/VNPay không phải module chưa có mã.**

MockPaymentGateway chỉ được chọn khi Development và `VnPay:UseMock=true`, không tự fallback vì thiếu secret. Ngoài Development, startup kiểm credential và HTTPS URL. Mock không chứng minh sandbox thật hoặc VNPay-QR đã chạy.

Cần nghiệm thu gateway sandbox, callback public, QR/payment-page journey, return và QueryDR thực theo mục 13. Không lưu secret vào tài liệu, source control, frontend hoặc log.

## 7. Trạng thái

| Đối tượng | Vòng đời |
|---|---|
| Class | Draft → Published → InProgress → Completed; Cancelled theo điều kiện |
| Enrollment | Confirmed; kết thúc TransferredOut, Refunded hoặc CancelledByCenter |
| PaymentAttempt | Pending, Expired, Succeeded, Failed, ReconciliationRequired; event muộn qua đối soát |
| Invoice | Issued, Paid, Void, PaidAfterReconciliation; expiry thuộc checkout/attempt |
| PaymentAdjustment | Requested, Approved, Rejected, Completed; refund hoàn tất cùng ledger/quyền lợi |
| PT/Membership/Rental | Dùng enum và transition của module sở hữu, không ép vào lifecycle lớp nhóm |

JSON enum UPPER_SNAKE_CASE; JWT role dùng tên nội bộ; DB giữ số enum đã có. Không đổi thứ tự enum để khớp cách trình bày tài liệu.

## 8. Database và đồng thời

- FK/Restrict giữ lịch sử tài chính; không cascade xóa invoice/ledger theo catalog/user. Ngừng hoạt động thay xóa đối tượng đã được tham chiếu.
- Unique bảo vệ reference/idempotency/attendance/dedup; check bảo vệ amount/points/capacity; row lock hoặc conditional update bảo vệ tài nguyên cạnh tranh.
- RoomOccupancy/CoachOccupancy dùng PostgreSQL exclusion constraints với btree_gist. Ghi lịch lớp/PT/rental/block phải dùng cùng cơ chế, cùng transaction nghiệp vụ.
- Khoảng giờ `[start, end)` cho phép lịch nối tiếp. Lưu UTC, hiển thị giờ Việt Nam; ngày inclusive/exclusive được định nghĩa theo từng rule.
- Mutation dùng revision/version khi contract hỗ trợ, trả conflict thay vì silently overwrite.
- Migration kiểm DB trắng và upgrade có lịch sử; tách schema/backfill, không sửa migration đã áp dụng hoặc reset DB chung.
- Backfill chỉ dữ liệu xác định được, giữ null/legacy reference khi thiếu bằng chứng. Migration Gym/PT cần mapping, kiểm FK/snapshot, đối soát và phương án phục hồi.

## 9. API và frontend

Route, DTO, error, actor tra tại [API contract](api-contract.md). API đề xuất chưa có ở [phân công API theo page/owner](../DESIGN-SKILLS-GUIDE.md#api-liên-vai-trò-và-điều-kiện-đóng-việc), không dùng làm endpoint hiện hữu.

Server validate input, range, paging, timezone và ownership. Public DTO không lộ roster/email/ví/lịch PT. Callback public chỉ miễn JWT đúng action, vẫn verify gateway; reconcile vẫn kiểm quyền nhân viên.

Frontend chia theo tác vụ/role, dùng chung checkout/wallet/invoice; đủ loading, empty, error, expired, conflict và phục hồi reload. Deadline từ backend, không tạo hold khi chỉ xem catalog. `CheckoutResponse.ServerNowUtc` đã có; UI dùng thời gian server cùng expiresAtUtc để tính countdown và khôi phục sau reload.

Landing, navigation, báo cáo và nội dung giới thiệu dùng ba môn Gym (PT), cầu lông, bóng rổ, có thể mở rộng. Không hard-code ba ID vào nghiệp vụ. Chi tiết giao diện tại [DESIGN-TOKENS](../DESIGN-TOKENS.md) và [DESIGN-SKILLS-GUIDE](../DESIGN-SKILLS-GUIDE.md).

## 10. Jobs, thông báo và vận hành

| Job hiện có | Trách nhiệm |
|---|---|
| CheckoutExpiryJob, SeatHoldExpiryJob, PointHoldExpiryJob | Hết hạn checkout/tài nguyên/điểm, chống release trùng |
| PaymentReconciliationJob | Query/replay kết quả gateway |
| ClassThresholdEvaluationJob, ClassThresholdResponseExpiryJob | Ngưỡng lớp và phản hồi quá hạn |
| ClassStatusJob, RentalStatusJob | Lifecycle lớp/rental theo thời gian |
| MemberPackageExpiryJob, AttendanceFinalizerJob | Hiệu lực Membership, xử lý PT theo rule |
| NotificationDispatchJob | Lease/retry và gửi email đã queue |

Jobs phải chạy lại an toàn, có dedup/lock và chịu crash. Outbox queue trong transaction; gửi sau commit theo at-least-once. Mỗi lần đổi lịch là event riêng; retry không tạo thêm điểm/quyền lợi. LoggingEmailSender phục vụ demo, không chứng minh delivery.

Vận hành cần correlation ID không lộ secret/OTP, theo dõi outbox backlog, payment cần đối soát, job failure, health và backup/restore. Xem [RUNBOOK](RUNBOOK.md). Build thành công không đồng nghĩa sẵn sàng production.

## 11. Bảo mật và AI

JWT/policy kết hợp ownership, account status, security stamp và relationship. OTP một lần có TTL, giới hạn thử/rate limit. Audit quản trị, lịch, refund và đối soát thủ công.

AI đã có Member assistant theo context và workout recommendation cho Coach. Context lấy từ danh tính xác thực; tối thiểu hóa dữ liệu gửi provider. Output là đề xuất, không tự xác nhận payment/cấp quota/đổi lịch hoặc bỏ authorization.

Manager AI xếp lịch/function calling/tạo draft sau xác nhận chưa triển khai. Luồng đích: đọc availability → đề xuất → Manager xem/sửa/xác nhận → command tạo draft thông thường → recheck occupancy → audit. Không coi output LLM là lệnh đáng tin.

## 12. Kiểm thử nghiệm thu

Có file test không đồng nghĩa test đã chạy; mock không thay thế tích hợp thật. Cần kiểm:

1. Ba môn sản phẩm, PT thuộc Gym; mở rộng catalog; ngừng môn không mất lịch sử.
2. Role/ownership/relationship/approval, negative tests cho Coach và Admin.
3. PostgreSQL concurrency: chỗ cuối/quota cuối, overlap, expiry/cancel/retry đồng thời.
4. Payment: 0/100%/một phần điểm, OTP quầy, idempotency, sai chữ ký/merchant/amount, replay, nhiều attempt, late payment, crash sau capture, lỗi fulfillment.
5. Refund/threshold/incident: không double credit, bảo toàn giá trị chuyển lớp, recheck sau preview, release pending và refund paid rental đúng.
6. Migration DB trắng/upgrade, FK/snapshot, lịch sử Gym/PT.
7. Frontend từng role, deep link/reload, expired/reconciliation/compensation, keyboard/mobile, không success giả từ return.
8. VNPay sandbox/IPN không JWT/QueryDR thực, SMTP và Gemini; bằng chứng theo môi trường không chứa secret.

Đợt chỉnh tài liệu này dựa trên đọc mã và đối chiếu contract, không chạy lại bộ test ứng dụng hoặc giao dịch thật.

## 13. Phần chưa triển khai và chưa nghiệm thu

### 13.1 Payment và tích hợp ngoài

| ID | Hạng mục | Trạng thái và việc cần làm | Tiêu chí hoàn thành |
|---|---|---|---|
| PAY-01 | Payment nghiệp vụ | **Có mã:** checkout, attempt, inbox, wallet, split payment, refund, reconciliation, UI. Cần chạy regression/E2E trên môi trường nghiệm thu | Membership/PT/lớp/rental, concurrency, retry, late payment/refund có evidence |
| PAY-02 | VNPay sandbox thật | **Có adapter, chưa kiểm chứng tích hợp thật trong đợt rà soát.** Cần merchant sandbox, HTTPS/IPN truy cập được và cấu hình payment/query/return | Giao dịch sandbox qua verifier, cấp quyền lợi đúng một lần |
| PAY-03 | Callback IPN/return public | **Cần xử lý/kiểm thử, P0.** PaymentsController chưa có AllowAnonymous, fallback yêu cầu authenticated. Phát hiện tĩnh, chưa xác nhận HTTP runtime | Không JWT tới verifier; giả mạo không fulfill; reconcile giữ quyền |
| PAY-04 | VNPay-QR/return journey | **Chưa nghiệm thu.** Adapter trả payment URL không chứng minh QR thật và return UI hoàn tất | Thanh toán sandbox, quay về UI đúng, đọc trạng thái server |
| PAY-05 | QueryDR/late payment thực | **Có mã, chưa nghiệm thu gateway thật.** Mock QueryAsync trả null | QueryDR verify, replay/late failure không thu/cấp trùng |
| PAY-06 | Production gateway/refund ngân hàng | **Ngoài phạm vi**, không phải backlog bắt buộc; hoàn bằng điểm | Chỉ mở khi có yêu cầu riêng |
| INT-01 | SMTP thật | **Có sender/outbox; chưa kiểm chứng delivery thật trong đợt rà soát** | OTP/mail đến người nhận, retry/dedup đúng, không lộ payload nhạy cảm |
| INT-02 | Gemini thật | **Có Member chat provider; chưa kiểm chứng cấu hình thật trong đợt rà soát** | Context đúng ownership; timeout/quota/lỗi có phản hồi phù hợp |

Bằng chứng: [VNPay adapter](../backend/SportHub.Payment/VnPay/VnPayGateway.cs), [mock](../backend/SportHub.Payment/VnPay/MockPaymentGateway.cs), [checkout](../backend/SportHub.Payment/Application/Services/CheckoutService.cs), [callback](../backend/SportHub.Payment/Api/PaymentsController.cs), [authorization](../backend/SportHub.API/Extensions/AuthorizationPolicyExtensions.cs), [host](../backend/SportHub.API/Program.cs).

### 13.2 Chức năng và contract còn thiếu

G01–G13 trỏ [phân công API theo page/owner](../DESIGN-SKILLS-GUIDE.md#api-liên-vai-trò-và-điều-kiện-đóng-việc), có evidence và acceptance chi tiết. Endpoint đề xuất chưa phải route có thể gọi ngay.

| ID | Khoảng trống | Việc cần hoàn thành |
|---|---|---|
| CAT-01 | Môn nhiều dịch vụ, PT là dịch vụ của Gym | Đã có schema, migration, API và UI. Gỡ qualification PT hoặc liên kết loại phòng bị chặn khi còn buổi PT tương lai (`qualification_in_use`, `service_in_use_by_future_schedule`). Còn thiếu: test callback muộn khi dịch vụ đã tắt; chưa chạy test tích hợp backend (cần Docker) |
| CAT-02 | Thuê sân là chức năng của Member; lịch lớp cố định BR-141 | Đã có code, migration và seed riêng (`dotnet run -- --seed-br141=true`). Còn thiếu: test tích hợp backend và nghiệm thu E2E với PostgreSQL thật |
| G01 | Public sân, availability/giá, Coach profile và PT pricing đầy đủ | DTO public an toàn, giá/availability tính server |
| G02 | Chờ đợt sau + subscription | Hoàn 100% điểm một lần, lưu nguyện vọng, không giữ chỗ/ghi danh tự động |
| G03 | Manager AI xếp lịch/tool calling/tạo nháp | Endpoint/service, xác nhận người dùng, recheck quyền/occupancy, audit |
| G04 | Member code/QR backend | Xác thực lookup, không dùng mã FE tự suy hoặc QR làm chứng cứ payment |
| G05 | Member self-booking PT/available slots | Đã có API và UI; còn thiếu: chạy test tích hợp có Docker, kiểm Membership Active riêng, chuyển chính sách đặt lịch thành system setting |
| G06 | Incident history/detail, preview bồi hoàn/người nhận, fence xử lý | Recovery bỏ dở, chống race và double refund; không giả toàn luồng atomic |
| G07 | History thông báo thủ công và preview người nhận | Scoped recipient, paging, send/retry dedup |
| G08 | Refund tổng hợp riêng Member nếu cần tab độc lập | Owner scope/paging; invoice detail đã có adjustments |
| G09 | Filter public catalog nâng cao | Filter server trước paging/count; không giả có level khi schema chưa có |
| G10 | Admin account detail đúng policy | Route/DTO quản trị hoặc policy riêng, không nới toàn bộ StaffRead |
| G11 | Callback VNPay public | Theo PAY-03; mock endpoint có đăng nhập không thay thế IPN public |
| G12 | Scoping Member search/detail cho Coach | Kiểm actor/relationship ở service, negative tests đọc ngoài phạm vi |
| G13 | Đóng/mở tuyển sinh độc lập lifecycle lớp | Chốt hold/payment cũ, không dùng cancel thay close enrollment |
| UI-01 | Frontend redesign theo contract hiện có | Kế hoạch từng màn phải nối API thật, kiểm E2E trước khi ghi hoàn thành |
| OPS-01 | Nghiệm thu vận hành | Deploy/migration, backup-restore, giám sát job/outbox/reconciliation có evidence |

### 13.3 Thứ tự xử lý

Ưu tiên PAY-03/G12, sau đó nghiệm thu payment sandbox/QueryDR và bảo toàn dữ liệu. Triển khai G02 và contract cần cho frontend theo phụ thuộc; Manager AI và màn bổ sung theo kế hoạch. Chỉ đóng từng mục khi có mã, test và evidence phù hợp.

## 14. Nguồn và quy tắc duy trì

- [Business Rules](SportManagement_BusinessRules_v2.0_updated.docx): quy tắc và giới hạn nghiệp vụ.
- [SSOT](00-Source-of-Truth.md): phạm vi, thuật ngữ, giải quyết mâu thuẫn.
- [Requirements](Requirements.md): yêu cầu theo vai trò/luồng.
- [Từ điển dữ liệu](entity-field-purpose.md), [API contract](api-contract.md): mapping và contract.
- [Frontend redesign](../DESIGN-SKILLS-GUIDE.md): thiết kế/phân công, không phải evidence implementation.

Yêu cầu chủ sản phẩm về ba môn và PT thuộc Gym là phạm vi áp dụng. Khi code/tài liệu nguồn chưa khớp, ghi rõ khoảng cách và đồng bộ; không suy rằng code đã đổi. Dùng Git để truy vết thay đổi, không chèn ngày cập nhật, changelog hoặc bảng so sánh phiên bản vào nội dung tài liệu.
