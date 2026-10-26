# Kế hoạch dữ liệu demo SportHub — 27/10/2026

Tài liệu bàn giao cho người chuẩn bị DB Railway sau khi reset. Mục tiêu là có dữ liệu nhất quán để trình diễn 6 flow, 5 role đăng nhập và Guest. Đây là **đặc tả dữ liệu cần tạo**, không xác nhận rằng DB đã được seed. Mọi ngày/giờ dưới đây theo giờ Việt Nam.

## 1. Nguyên tắc và thứ tự

1. Chạy toàn bộ migration trên đúng DB Railway. Bootstrap **duy nhất** Admin đầu tiên khi `user_accounts` còn rỗng; đăng nhập và hoàn tất bước đổi mật khẩu bắt buộc.
2. Admin tạo các staff thật qua giao diện; người nhận mở link kích hoạt và đặt mật khẩu. Link staff hết hạn theo `CreatedAt + 24 giờ`, nên tạo sát buổi demo. Các account giả để làm fixture được tạo bằng script riêng, idempotent, với mật khẩu được hash; không ghi mật khẩu dạng rõ vào DB/log.
3. Seed danh mục và phòng → Coach/profile/asset → lớp/lịch → Member fixture → checkout/hóa đơn/quyền lợi → support/training → audit/notification. Với mỗi bước, kiểm tra khóa ngoại và khả năng hiển thị trên UI.
4. Mật khẩu demo thống nhất theo yêu cầu nhóm: `Sporthub@123`. Chỉ dùng cho môi trường demo đã reset; không đặt mật khẩu này trong source code, migration, file cấu hình commit hoặc log. Cung cấp qua secret/biến môi trường khi tạo fixture. Admin bootstrap có `MustChangePassword=true`; xử lý bước đó trước khi dùng các trang quản trị.
5. Không chạy các fixture cũ rồi mặc định cho rằng đã đủ dữ liệu: `Br141Seeder` hiện dùng 4 Coach và lịch/sức chứa khác yêu cầu; `SystemScenarioSeeder`/`SupportScenarioSeeder` chọn Member theo thứ tự và sinh nhiều case chung. Kịch bản mới phải có mã định danh/prefix riêng và chạy lại không tạo trùng, không ghi đè tài khoản đã có.

## 2. Danh sách tài khoản

### Tài khoản thật, có inbox để mở link và đăng nhập

| Role | Email | Cách tạo / mục đích |
|---|---|---|
| SystemAdministrator | `holethienan3010@gmail.com` | Bootstrap Admin đầu tiên; đổi mật khẩu lần đầu. |
| CenterManager | `nnkhoa1999@gmail.com` | Admin tạo; Manager chính để thao tác/audit. |
| CenterManager | `holethienan30102006@gmail.com` | Admin tạo; Manager thứ hai, dùng khi cần phân quyền/duyệt. |
| Receptionist | `avatarstar1133@gmail.com` | Admin tạo; lễ tân thật thứ nhất. |
| Receptionist | `hgiahao91@gmail.com` | Admin tạo; lễ tân thật thứ hai. |
| Coach Cầu lông | `nguyenhoangkhoi2k6@gmail.com` | Admin tạo kèm chuyên môn Cầu lông; dạy cả 2 lớp Cầu lông. |
| Coach Bóng rổ | **Email thứ hai của Khôi, chưa được cung cấp** | Admin tạo kèm chuyên môn Bóng rổ; dạy cả 2 lớp Bóng rổ. Không tự đoán địa chỉ. |

**Không seed Member thật trước demo.** Trong ngày demo, Member B dùng `holethienan2006@gmail.com`; Member C là một email thật khác của Khôi (chưa có địa chỉ cụ thể). Guest không có tài khoản. Email phải duy nhất toàn hệ thống.

### Tài khoản giả có thể đăng nhập, cần script seed

| Role | Email | Mục đích |
|---|---|---|
| Receptionist | `letan@sporthub.vn` | Fixture lễ tân, mật khẩu đã hash, đăng nhập được. |
| Member | `binh.member@sporthub.vn` | Hóa đơn + PAYMENT request. |
| Member | `khoi.member@sporthub.vn` | Ghi danh Cầu lông + plan/result từ Coach Cầu lông. |
| Member | `hao.member@sporthub.vn` | Thuê sân + COURT/FACILITY request. |
| Member | `khoa.member@sporthub.vn` | Membership/hóa đơn + request trạng thái xử lý. |
| Coach | `coach.pickleball@gmail.com` | Fixture Coach để thử trường hợp tạo lớp/AI; **chưa gán Pickleball** vì hệ thống hiện chỉ có Gym, Cầu lông, Bóng rổ. Chuyên môn cụ thể cần nhóm chốt. |

Ảnh chat còn yêu cầu `an.member@sporthub.vn` làm Member giả. Tin nhắn mới nhất chỉ chốt **4 Member giả** kể trên và nói Member khác sẽ tạo ngày demo, vì vậy **không seed `an.member@sporthub.vn` trong bộ bắt buộc**; thêm nếu nhóm xác nhận cần một Member fixture thứ năm. Mọi account giả phải có `UserAccount`, đúng `Role`, `UserProfile`, `UserCredential.PasswordHash`, `Status=Active`; không dùng chuỗi mật khẩu làm hash giả. Coach giả cần `CoachProfile` và chuyên môn hợp lệ nếu muốn tạo lớp.

## 3. Năm gói Gym hiển thị trên catalog

| Gói | `DurationDays` | Giá | `OriginalPrice` | Ghi chú |
|---|---:|---:|---:|---|
| Gym 1 month | 30 | 600.000đ | — | Active. |
| Gym 3 months | 90 | 1.800.000đ | — | Active. |
| Gym 6 months | 180 | 2.400.000đ | 3.600.000đ | UI hiện “Save 1,200,000đ”. |
| Gym 12 months | 365 | 6.000.000đ | 7.200.000đ | UI hiện “Save 1,200,000đ”. |
| Gym day pass | 1 | 50.000đ | — | Kiểm tra gói seed/migration có `packageId=50000`, không thêm bản trùng; chỉ bán 06:00–trước 22:00, hết hạn 22:00 cùng ngày. |

Tất cả gói phải Active, có mô tả, hiển thị trong `GET /api/membership-packages/public`. Badge “In use”/“Renew plan” trên ảnh không phải thuộc tính catalog: nó cần một `MemberPackage` đang hiệu lực, có hóa đơn đã thanh toán, của **Member đang đăng nhập**. Vì Member thật được tạo ngày demo, chuẩn bị bước mua thực tế hoặc dùng một Member fixture để xem trước màn này; không seed quyền lợi cho email chưa có account.

## 4. Bốn lớp mở đăng ký từ 28/10/2026

| Lớp | Sport | Lịch 12 buổi | Giá/Member | Tổng chỗ | Coach |
|---|---|---|---:|---:|---|
| Badminton 01 | Cầu lông | Thứ 2/4/6, 07:00–09:00 | 900.000đ | 5 | `nguyenhoangkhoi2k6@gmail.com` |
| Badminton 02 | Cầu lông | Thứ 2/4/6, 14:00–16:00 | 900.000đ | 5 | Cùng Coach Cầu lông |
| Basketball 01 | Bóng rổ | Thứ 2/4/6, 07:00–09:00 | 1.200.000đ | 7 | Coach Bóng rổ thật |
| Basketball 02 | Bóng rổ | Thứ 2/4/6, 14:00–16:00 | 1.200.000đ | 7 | Cùng Coach Bóng rổ |

`StartDate=2026-10-28` là Thứ Tư, nên buổi đầu cả bốn lớp là 28/10. Mỗi lớp cần `Class`, 12 `ClassSession`, `ScheduleRule`, phòng riêng tại những giờ trùng nhau, `RoomOccupancy`, `CoachOccupancy`, `BreakEvenThreshold`, `Status=Published`, `EnrollmentOpen=true`. Gắn Coach đúng specialty; hai lớp cùng Coach khác giờ nên không trùng lịch. Đặt chi phí để ngưỡng hòa vốn không vượt sức chứa: Cầu lông tối đa 5 × 900.000đ = 4.500.000đ; Bóng rổ tối đa 7 × 1.200.000đ = 8.400.000đ. `CostAmount=9.600.000đ` của fixture Bóng rổ cũ không phù hợp sức chứa 7.

Seed một số `Enrollment Confirmed` kèm hóa đơn đã thanh toán để có roster/số chỗ còn lại, nhưng **giữ ít nhất một chỗ trống mỗi lớp** để demo ghi danh. Không tạo result/attendance quá khứ cho buổi học 28/10 khi demo diễn ra 27/10.

## 5. Phòng, sân, giá và lịch trống

| Nhóm | Dữ liệu tối thiểu |
|---|---|
| Phòng lớp | 4 phòng Active khác nhau cho 4 lớp học đồng thời theo ca; sức chứa phòng ≥ 5/7; giờ mở bao phủ 07:00–16:00 và các `RoomOccupancy` đúng buổi. |
| Sân thuê Cầu lông | Ít nhất 1 phòng `Allow rental=true`, giá **100.000đ/giờ**, bảng giá còn Active. |
| Sân thuê Bóng rổ | Ít nhất 1 phòng `Allow rental=true`, giá **200.000đ/giờ**, bảng giá còn Active. |
| Gym | Ít nhất 1 phòng Gym Active, mở cửa để mua vé/check-in; không bị block bởi sự cố trong giờ demo. |
| Tạo lớp trực tiếp | Ít nhất 1 phòng Active có slot trống trong tương lai và một Coach phù hợp còn rảnh; kiểm tra bằng màn tạo lớp trước demo. |

Ảnh cũ hiện “Badminton court from 26,000đ/h”, **giá cuối cùng theo tin nhắn là 100.000đ/h**. Kiểm tra không còn một rate 26.000đ Active làm UI lấy giá thấp nhất sai. Phòng dùng chung theo quyết định mới: lớp có thể chọn phòng Active; quyền cho thuê là cờ riêng, không suy từ môn của lớp.

## 6. Hồ sơ công khai của hai Coach thật

Mỗi Coach cần `UserSportSpecialty`, `CoachProfile` (title, bio, yearsExperience, studentCount, philosophy), `UserProfile` (tên, avatar), lịch dạy hai lớp, và **ít nhất một Certificate** có title/issuer/issuedOn cùng ảnh hoặc PDF thật. Có thể thêm một Award để màn hồ sơ đủ nội dung. File certificate phải upload vào nơi lưu trữ đang cấu hình và `FileUrl` mở được; không seed URL giả hoặc tuyên bố bằng cấp đã được xác minh. Avatar cũng phải hiện được trên trang Coach công khai. Tên/hình/chứng chỉ cụ thể chưa có trong ảnh được cung cấp, nên người seed chọn **dữ liệu demo minh họa** và ghi rõ đó là dữ liệu mẫu.

## 7. Giao dịch, quyền lợi, ví và đối soát

Seed **từng chuỗi dữ liệu hoàn chỉnh**, không chỉ một `Invoice` độc lập:

| Case | Quan hệ bắt buộc | Mục đích UI |
|---|---|---|
| Membership đã trả | Member → checkout → invoice/item → payment xác minh → `MemberPackage Active` | Card gói đang dùng, hóa đơn, Gym check-in. |
| Ghi danh lớp đã trả | Member → invoice/item lớp → `Enrollment Confirmed` → số chỗ/roster | Lịch Member, lớp, Coach roster. |
| Thuê sân đã trả | Member → invoice/item thuê → `CourtRental Confirmed` → occupancy | Lịch sân, hóa đơn, request. |
| Top-up ví đã trả | Member → invoice/payment → `PointWallet`/ledger Earn | Ví, báo cáo, split payment/OTP nếu demo. |
| Chưa thanh toán | Invoice Issued + checkout/attempt tương ứng | Danh sách hóa đơn chờ. |
| IPN muộn, còn chỗ | Checkout hết hạn + payment/gateway event xác minh muộn → `PAID_AFTER_RECONCILIATION`, `FULFILLED`, cấp đúng một quyền lợi | Case tự khôi phục thành công. |
| IPN muộn, không còn chỗ | Payment xác minh muộn → `RECONCILIATION_REQUIRED`, **không** cấp quyền lợi | Hàng “Paid, not activated”, Member chọn điểm hoặc PAYMENT request. |

Các case IPN muộn cần nhất quán `CheckoutSession`, `PaymentAttempt`, `VerifiedGatewayEvent`, invoice, item, outcome, entitlement/ledger và idempotency. Gắn nhãn **demo scenario** cho dữ liệu dựng sẵn; không biểu diễn invoice fixture như giao dịch VNPay thật đã được gateway xác minh. Muốn chứng minh tích hợp VNPay, chạy một giao dịch sandbox thật và chờ callback/IPN xác thực.

## 8. Bốn Member giả: hóa đơn, dịch vụ và request

| Member | Dữ liệu nền | Request |
|---|---|---|
| `binh.member@sporthub.vn` | Membership/lớp có invoice đúng chủ, đã trả hoặc thuộc case đối soát. | `PAYMENT` gắn `invoiceId` của Bình; `OPEN` cho Manager xử lý. Nếu giả lập Member gửi ONLINE cần 1–3 ảnh minh chứng; nếu lễ tân tạo hộ ở quầy thì không bắt buộc ảnh. |
| `khoi.member@sporthub.vn` | Ghi danh Confirmed lớp của Coach Cầu lông, invoice đã trả, hồ sơ mục tiêu tập. | `CLASS`/`COACH` có mô tả khớp lớp. Dùng Member này cho plan/result. |
| `hao.member@sporthub.vn` | CourtRental Confirmed + invoice đã trả, đúng sân/giờ. | `COURT`/`FACILITY` có lịch sử Assigned → In progress. |
| `khoa.member@sporthub.vn` | Membership hoặc thuê sân + invoice riêng. | Một request `OPEN`/`ASSIGNED` và một request đã `DONE` để thể hiện bộ lọc/lịch sử. |

Mọi request có `MemberId`, `RecordedByUserId`, category, subject, description, `CreatedAt`, SLA 48 giờ, trạng thái, assignee và `MemberSupportEvent` theo tiến trình. PAYMENT phải tham chiếu hóa đơn **của cùng Member**, không dùng một hóa đơn chung cho bốn người. Tạo một request quá hạn nếu cần demo badge “Overdue”; giữ một request mới chưa xử lý để thao tác live. Ảnh minh chứng/chứng từ phải là tệp có thể mở, không ghi đường dẫn giả.

## 9. Plan, result, attendance và AI cho Member Khôi

`khoi.member@sporthub.vn` cần Enrollment Confirmed với lớp Cầu lông của `nguyenhoangkhoi2k6@gmail.com`, hồ sơ sức khỏe/mục tiêu, quan hệ quyền truy cập Coach–Member, ít nhất một plan có bài tập/items và một result/nhận xét do đúng Coach ghi. Nếu result thuộc buổi đã học, phải có `ClassSession` lịch sử + attendance tương ứng. Vì bốn lớp mới bắt đầu 28/10, **tạo riêng một lớp/buổi lịch sử trước 27/10** cho result cũ hoặc để plan hiện sẵn và nhập result live sau khi buổi học diễn ra; không gắn result quá khứ vào buổi tương lai. Gợi ý AI cần input profile đủ dữ liệu và lịch sử AI nếu muốn trang không rỗng; demo live chỉ khi dịch vụ AI/Gemini đã cấu hình và kiểm thử.

## 10. Audit, notification, báo cáo và dữ liệu UI

- **Audit:** tạo qua service/API nếu có thể để `actorUserId`, `ActorRole` tại thời điểm thao tác, action, target, thời gian và lý do cùng giao dịch: Admin tạo staff; Manager sửa catalog/sân/lớp/publish; lễ tân tạo Member/check-in/request; Coach ghi plan/result. Không seed log Manager bằng actor là Admin hoặc gán role hiện tại sai.
- **Thông báo/outbox:** thông báo đăng ký, thanh toán/quyền lợi, lớp, support, lời mời staff; có vài thông báo đã đọc/chưa đọc. Không đánh dấu email “đã nhận” chỉ vì outbox đã queue.
- **Báo cáo:** tổng tiền/giao dịch, số vé ngày, Membership, Enrollment, thuê sân, ví điểm và support phải tính ra từ cùng invoice/payment/ledger thực tế của fixture; không seed KPI rời.
- **Catalog/UI:** Sport Active, service bật đúng, tên/ảnh môn, Coach public profile, package/class/rental rate Active; xác nhận trên trang Guest và Member rằng không xuất hiện catalog scenario rác từ fixture cũ.
- **Chừa dữ liệu cho live demo:** lớp còn chỗ, sân còn slot, request OPEN, hóa đơn cần đối soát, phòng và Coach còn lịch để thầy tạo lớp mới.

## 11. Checklist nghiệm thu ngay sau seed

- [ ] Đúng DB Railway và toàn bộ migration; Admin bootstrap đăng nhập được, đổi mật khẩu xong.
- [ ] Hai Manager, hai Receptionist thật, hai Coach thật đăng nhập được; `letan@sporthub.vn` và bốn Member giả cũng đăng nhập được.
- [ ] Không seed Member thật B/C trước ngày demo; không trùng email với account giả.
- [ ] Public catalog hiện đúng 5 Gym package, 4 lớp từ 28/10, giá thuê Cầu lông 100.000đ/h và Bóng rổ 200.000đ/h.
- [ ] Hai Coach thật mỗi người dạy đúng 2 lớp; Coach profile/avatar/certificate mở được.
- [ ] Bốn lớp có đúng 12 buổi, 5/7 tổng chỗ, phòng/Coach không xung đột và còn chỗ demo.
- [ ] Mỗi request PAYMENT mở đúng hóa đơn cùng chủ; các dịch vụ đã mua có invoice/item/quyền lợi nhất quán.
- [ ] Hai case IPN muộn hiển thị ở hai trạng thái khác nhau: `FULFILLED` và `RECONCILIATION_REQUIRED`.
- [ ] Coach Cầu lông thấy Member Khôi trong roster và đúng plan/result; Member khác không đọc được hồ sơ này.
- [ ] Audit Manager/Receptionist/Coach, notification, report và các số đếm khớp dữ liệu nguồn.
- [ ] Đăng ký thử Member thật trong ngày demo, mua một giao dịch VNPay sandbox thật, kiểm tra IPN và quyền lợi trước khi trình bày.

## 12. Các giá trị còn thiếu, không được tự đoán

1. Email thứ hai của Khôi cho **Coach Bóng rổ**.
2. Chuyên môn và kịch bản cụ thể của `coach.pickleball@gmail.com`; Pickleball chưa được cấu hình như môn trong phạm vi hiện hành.
3. Email Member C thật của Khôi sẽ được đăng ký **ngày demo**.
4. Tên/hình/chứng chỉ thật của hai Coach, nếu nhóm muốn dùng ngoài dữ liệu minh họa.
5. Giá trị `CostAmount` từng lớp, miễn là ngưỡng hòa vốn không vượt 5/7 chỗ.

Nguồn đối chiếu: [bootstrap](Initial-Admin-Bootstrap.md), [quy tắc hiện hành](00-Source-of-Truth.md), [API contract](api-contract.md), [luồng thanh toán và support](Payment-Support-Workflow.md), [runbook](RUNBOOK.md). Ảnh người dùng ngày 27/10/2026 là nguồn cho tên/giá 5 gói, giờ/giá 4 lớp và hai loại sân; các điều chỉnh trong tin nhắn mới nhất (ngày bắt đầu, sức chứa, giá sân, phân Coach) được ưu tiên hơn ảnh cũ.
