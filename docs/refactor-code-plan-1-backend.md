# Plan refactor code 1 — Backend đa môn và hợp đồng API

Ngày lập: 30/09/2026. Cập nhật 01/10/2026: **hoàn tất phạm vi backend, trừ tích hợp/nghiệm thu VNPay sandbox thật theo yêu cầu người dùng**. Gate cuối 465/465 test pass trên PostgreSQL Testcontainers; model không lệch migration. Xem [manifest bàn giao](refactor-backend-final-handover.md), [evidence](refactor-backend-evidence.md) và [API contract](refactor-api-contract.md). Migration đã kiểm trên DB test, chưa áp lên DB phát triển/chia sẻ. Nội dung các chặng dưới đây giữ làm đặc tả và tiêu chí nghiệm thu; tên file/field tương thích thực tế được ghi trong manifest.

Đây là phần 1/2. Hoàn thành toàn bộ backend, PostgreSQL, API và kiểm thử nghiệp vụ trước; sau đó thực hiện [plan 2](refactor-code-plan-2-frontend.md) cho giao diện và nghiệm thu web. Backend xong không có nghĩa web xong: frontend cũ có thể không tương thích trong thời gian chuyển đổi. Không triển khai riêng trạng thái trung gian này cho người dùng.

## 1. Cách giao việc cho AI thực hiện

Kế hoạch ban đầu chia **một chặng P1.xx** mỗi lượt; lượt hoàn tất 01/10/2026 thực hiện các phần còn lại cùng nhau theo yêu cầu người dùng. Không chạy theo thứ tự bảng tên file nếu trái với phụ thuộc giữa các chặng. Không viết lại toàn bộ repository. Không kết thúc ở entity/controller rỗng, dữ liệu giả hoặc TODO cho nghiệp vụ bắt buộc.

Nguồn ưu tiên: BR DOCX v2.0 updated > Design v3, nhất là §19.2 > các quyết định kỹ thuật được ghi rõ trong plan này > SSOT/entity-field-purpose. Requirements và SRS vẫn là scope cũ; **không sửa hai tài liệu đó trong hai plan**. Không dùng plan gym cũ để khôi phục rule đã bỏ. Không sửa nội dung BR DOCX trong tác vụ refactor code.

Mỗi chặng phải có: code + DI + mapping EF/DTO + validation/RBAC + test liên quan + cập nhật trạng thái. Trước khi kết thúc lượt, ghi vào `docs/refactor-progress.md` (AI thực hiện tạo file này):

```text
Chặng hiện tại / chặng đã hoàn tất:
Commit hoặc trạng thái working tree:
File thêm / sửa / xóa:
Migration và DB test đã dùng:
Lệnh kiểm tra + kết quả thực tế:
Contract đã đổi (route, DTO, enum):
Vấn đề chưa xong / test đang lỗi:
Bước tiếp theo cụ thể (file, hàm, test):
```

Nếu gần hết context, hoàn thành đơn vị nhỏ đang làm, ghi checkpoint rồi dừng. Không ghi “xong P1” khi chưa qua gate cuối. Không đánh dấu test pass nếu chưa chạy; thiếu PostgreSQL/khóa sandbox phải ghi rõ phần chưa kiểm chứng. Không xóa thay đổi của người dùng; lúc khảo sát có `.claude/settings.local.json` chưa track, không thuộc phạm vi.

## 2. Phạm vi và các quyết định chống hiểu sai

### 2.1 Giữ kiến trúc

- Modular monolith .NET 10, PostgreSQL, Next.js. Không thêm project nghiệp vụ, Redis, RabbitMQ, microservice.
- Ví nằm trong `SportHub.Payment/Wallet`; cổng thanh toán trong `SportHub.Payment/VnPay`; catalog trong `SportHub.Scheduling/Catalog`; ExternalCoach trong Identity.
- Các đường dẫn trong plan tính từ repository root. Ký hiệu **S** sửa file hiện hữu, **T** tạo file mới, **X** xóa file hiện hữu, **G** giữ. Tên file mới là tên đích đề xuất; chỉ đổi nếu đã có implementation tương đương và phải cập nhật manifest bàn giao.
- Có thể giữ scalar FK giữa module; không đưa entity nghiệp vụ vào BuildingBlocks. `ISportHubDbContext` hiện có `Set<TEntity>()`, `SaveChangesAsync`, `Database`: **giữ generic**, không thêm DbSet kiểu Sport/Wallet vào interface như phụ lục Design gợi ý. DbSet cụ thể thuộc host `SportHubDbContext`.
- Domain model và API cũ không phải sự thật nghiệp vụ. Ví dụ `InvoiceStatus` thực tế đang là `Issued=0, Paid=2, Void=3`; không phải đã có đủ lifecycle v3.

### 2.2 Những chỗ Design cần đọc theo BR và code thực tế

| Vấn đề | Chỉ dẫn bắt buộc cho người triển khai |
|---|---|
| Thu tiền tại quầy | BR-81/84: tiền VND qua VNPay-QR, lễ tân không tự xác nhận thành công. Xóa đường ghi nhận Cash/Card/Transfer thủ công cho giao dịch mới. “Thanh toán tại quầy” nghĩa là tạo checkout thay và đưa QR/OTP cho Member. Giữ dữ liệu payment cũ, không giả mạo thành giao dịch VNPay. |
| OTP điểm | BR-139 và §19.2 thắng §7.2 T11/§9.3: **Receptionist nhập OTP Member đọc**; không yêu cầu Member đăng nhập để xác nhận checkout tại quầy, không có nút bỏ qua OTP. Self-checkout của chủ ví không cần OTP. |
| Refund | BR-93: Manager approve phải cộng điểm, hủy quyền lợi và Completed trong cùng transaction. Không còn bước lễ tân xác nhận đã chi tiền. Dùng `PaymentAdjustment` hiện có làm refund request; không thêm bảng Refund thứ hai cho cùng việc. |
| Enrollment | Dùng `InvoiceItemId` theo ERD §4.4, không chỉ `InvoiceId` như một dòng phụ lục. `ClassId` là int; `InvoiceItem.RelatedEntityId` hiện là Guid? nên không thể nhét ClassId vào đó. Bổ sung typed reference, xem P1.02. |
| Late payment | BR-88: tiền đã xác minh của Invoice hết hạn được ghi nhận `PaidAfterReconciliation`; thêm kết quả fulfillment để phân biệt đã cấp dịch vụ với đã bồi hoàn điểm. Không để UI suy luận Paid = chắc chắn có chỗ. |
| Chuyển lớp đắt hơn | Không tạo Enrollment Confirmed ở đích trước khi thu đủ chênh lệch. Giữ ghi danh cũ trong khi giữ chỗ đích/chờ tiền; chỉ chuyển nguyên tử khi trả đủ. |
| Membership/PT refund | Membership đạt điều kiện còn ít nhất 2/3 thời hạn: hoàn 50%; PT chưa consume: **50%, không phải 100%**. Dùng BR-90–94, ngày yêu cầu theo Việt Nam. |
| Role và enum | Append ExternalCoach, không chèn giữa làm đổi số các role cũ. Enum DB phải map rõ số cũ/mới, không dựa thứ tự khai báo. Wire enum chuẩn UPPER_SNAKE_CASE, cập nhật mọi test/FE ở plan 2. |
| Google | Giữ onboarding bắt buộc tự đặt mật khẩu BR-60. Sửa password policy và mapping specialty dù phụ lục ghi “giữ GoogleAuthService”. Google-only legacy đặt mật khẩu qua reset BR-103/104. |
| Email | Có `SmtpEmailSender` chưa có nghĩa outbox Email chạy: `NotificationDispatchJob` hiện chỉ đổi trạng thái InApp. Phải bổ sung dispatch Email thật và retry. |
| Attendance | Job hiện tại dùng Enrollment.Session và ghi NoShow cho lớp. Bỏ nhánh đó. GroupCourse chỉ Present/Absent do Receptionist; PT vẫn giữ NoShow riêng. |
| QR Gym | BR-64 không yêu cầu hardware/QR gate. Không xây hệ thống gate pass; giao diện có thể giữ quét mã định danh để chọn Member, backend vẫn kiểm tra Membership. |

Những bổ sung schema như khóa idempotency cho chu kỳ checkout, chứng cứ gateway và trạng thái chuyển lớp bên dưới là **quyết định kỹ thuật của plan**, không phải field được khẳng định đã có trong Design. Ghi chúng vào Design/field-purpose khi triển khai, không tự coi là BR mới.

### 2.3 Giá PT đã được người dùng xác nhận

**Đã chốt trong hội thoại này:** Manager cấu hình đơn giá mỗi buổi PT; tổng gói PT = đơn giá mỗi buổi × TotalQuota tính ở backend theo BR-71. Không dùng giá Membership làm giá PT, không nhận TotalQuota/UnitPrice từ FE làm dữ liệu tin cậy. Đơn giá >0 và bội 1.000 VND; snapshot đơn giá, quota, frequency và giá gói vào InvoiceItem/entitlement khi checkout. Thay giá về sau không sửa Invoice đã tạo.

### 2.4 AI

<!-- Để trống theo yêu cầu người dùng. Không lập kế hoạch tính năng AI. -->

Phạm vi giao tiếp để build: AI hiện tham chiếu `CoachCategory`, `Class.Discipline` và `Enrollment.Session`. Không được giữ mô hình gym chỉ để tránh sửa compile. Mặc định chỉ sửa tối thiểu những chỗ gọi contract đã đổi, không viết chatbot/tool/mock/prompt mới; nếu người dùng chọn tạm ngắt AI thì ghi lại quyết định và loại riêng AI khỏi bản chạy, giữ nguồn. Không tính AI vào gate nghiệm thu của hai plan.

## 3. P1.00 — Khảo sát và chốt baseline

1. Đọc AGENTS.md nếu repository bổ sung sau ngày lập plan; `git status --short`, `git diff --stat`; không reset/clean working tree.
2. Liệt kê route thực tế từ controller, ProjectReference, entity/configuration, test factory, CI. Ghi baseline build/test, lỗi sẵn có tách với lỗi refactor.
3. Kiểm tra DB định dùng. Chỉ chạy migration có drop dữ liệu lớp trên DB demo riêng đã xác nhận; xuất backup trước. Không `docker compose down -v` theo thói quen.
4. Tạo `docs/refactor-api-contract.md` và `docs/refactor-progress.md`. Contract chứa verb/path, actor, request/response/error mẫu, enum, transaction, idempotency, ownership; cập nhật sau từng chặng. Đây là đầu vào bắt buộc của plan 2.
5. Lập danh sách file thực tế mới hơn baseline; nếu file đã được người khác sửa đúng v3, đọc và giữ thay vì ghi đè.

**Gate:** biết chính xác DB test, trạng thái repository và baseline; chưa thay đổi schema thật của nhóm.

## 4. P1.01 — Ports và ranh giới module

Các module hiện có ProjectReference chéo và navigation cross-module. Không thêm vòng tham chiếu Scheduling ↔ Payment ↔ Training ↔ Identity khi viết mới. Ports chỉ mang primitive/record DTO của BuildingBlocks; implementation ở module sở hữu. Dùng **cùng scoped DbContext và transaction** cho T1–T10; port ghi không tự mở transaction lồng hay tự commit.

| Đường dẫn | QĐ | Trách nhiệm |
|---|---|---|
| `backend/SportHub.BuildingBlocks/Api/SportHubRoleNames.cs` | S | ExternalCoach; giữ tên role cũ. |
| `backend/SportHub.BuildingBlocks/Api/SportHubPolicies.cs` | S | Policy catalog, coach management, rental, wallet, refund, đối soát. |
| `backend/SportHub.API/Extensions/AuthorizationPolicyExtensions.cs` | S | Đăng ký policy; quyền cụ thể, không mặc định Admin có mọi quyền. |
| `backend/SportHub.BuildingBlocks/Abstractions/Persistence/ISportHubDbContext.cs` | G | Không chứa entity của module. |
| `backend/SportHub.BuildingBlocks/Abstractions/Identity/IUserAccessReader.cs` | T | User hiện hữu/role/status/email/profile cần thiết; tối thiểu dữ liệu. |
| `backend/SportHub.BuildingBlocks/Abstractions/Identity/ICoachSpecialtyReader.cs` | T | Kiểm Coach nội bộ và sport/OneOnOne; không expose CoachCategory. |
| `backend/SportHub.BuildingBlocks/Abstractions/Identity/IExternalCoachAccessReader.cs` | T | Approved + specialty + ownership để thuê sân. |
| `backend/SportHub.BuildingBlocks/Abstractions/Scheduling/ISportCatalogReader.cs` | T | Sport, room/type compatibility, active, duration. |
| `backend/SportHub.BuildingBlocks/Abstractions/Scheduling/IOccupancyService.cs` | T | Reserve/replace/release room/coach theo source và time range. |
| `backend/SportHub.BuildingBlocks/Abstractions/Scheduling/IClassEnrollmentFulfillment.cs` | T | Quote/reserve/confirm/release/cancel quyền lợi lớp từ item/checkout; giá/quyền sở hữu thuộc Scheduling, quyết định đã trả thuộc Payment. |
| `backend/SportHub.BuildingBlocks/Abstractions/Scheduling/ICourtRentalFulfillment.cs` | T | Quote/reserve/confirm/release/cancel quyền lợi thuê sân. |
| `backend/SportHub.BuildingBlocks/Abstractions/Membership/IMembershipAccessReader.cs` | T | Membership Active/renewal, dùng cho Gym và PT, không cho ghi danh lớp. |
| `backend/SportHub.BuildingBlocks/Abstractions/Membership/IMembershipFulfillment.cs` | T | Kích hoạt/hủy Membership idempotent theo InvoiceItem. |
| `backend/SportHub.BuildingBlocks/Abstractions/Training/IPtPurchaseFulfillment.cs` | T | Quote/activate/cancel PT; tái sử dụng entitlement lifecycle. |
| `backend/SportHub.BuildingBlocks/Abstractions/Wallet/IPointWalletService.cs` | T | EnsureWallet, Hold, Release, Spend, Earn, Adjust; khóa và reference rõ ràng. |
| `backend/SportHub.BuildingBlocks/Abstractions/Payment/ICheckoutService.cs` | T | Orchestration checkout do controller gọi; dùng quote/reserve ports, không nhận giá tin cậy từ FE. |
| `backend/SportHub.BuildingBlocks/Abstractions/Payment/IInvoiceDraftWriter.cs` | T | Tầng thấp tạo Invoice/items/session từ snapshot nghiệp vụ đã kiểm; Scheduling dùng cho transfer/rental nếu cần, không phụ thuộc fulfillment ngược. |
| `backend/SportHub.BuildingBlocks/Abstractions/Payment/IRefundCreditService.cs` | T | Hoàn sự kiện hệ thống dựa quyền lợi/item đã trả, không cho Scheduling cộng tùy ý. |
| `backend/SportHub.BuildingBlocks/Abstractions/Notifications/INotificationWriter.cs` | S | Email/InApp, recipient, template data, dedup key; Queue không gửi mạng/commit. |

**Dọn phụ thuộc có kiểm soát:** sửa `.csproj`, `GlobalUsings.cs`, service và navigation/configuration của Identity, Membership, Scheduling, Training, Payment, Administration, Notification, Audit khi chuyển consumer qua port. Scalar FK cross-module cấu hình ở `backend/SportHub.API/Persistence/CrossModuleRelationships.cs` (T). Đừng xóa FK DB cùng với navigation C#. Host vẫn tham chiếu các module và compose DI.

Đặt implementation port trong module sở hữu, ví dụ Identity `Application/Services/UserAccessReader.cs`, `ExternalCoachAccessReader.cs`; Membership `Application/Services/MembershipAccessReader.cs`, `MembershipFulfillment.cs`; Training `Application/Services/PtPurchaseFulfillment.cs`. Các DTO port dùng record trong chính file port khi nhỏ. Không tạo lớp rỗng chỉ để đủ bảng.

**Chặn vòng DI cụ thể:** Payment `CheckoutService` có thể gọi Scheduling reserve/quote port; implementation của port đó không inject ngược `ICheckoutService`. Scheduling cần tạo Invoice chênh dùng `IInvoiceDraftWriter` với implementation `SportHub.Payment/Application/Services/InvoiceDraftWriter.cs` (T), chỉ ghi invoice và không gọi Scheduling. `IRefundCreditService` implementation `SportHub.Payment/Application/Services/RefundCreditService.cs` (T) tính cap + credit từ item, không gọi lại service Scheduling đã yêu cầu nó; service sở hữu quyền lợi chịu hủy/release trong cùng transaction. Wallet dùng owner ID/reader tối thiểu, không phụ thuộc service đăng ký Identity. Build DI container và resolve các orchestrator trong test để bắt cycle, không chỉ nhìn ProjectReference.

**Gate:** build phần đã chuyển; không có dependency cycle; test xác nhận cùng transaction khi gọi fulfillment qua port. Có thể chuyển từng consumer theo chặng, nhưng đến gate cuối không còn luồng mới đọc/ghi trực tiếp entity module khác.

## 5. P1.02 — Model đích và migration

### 5.1 Danh sách schema và file mới

Mỗi entity mới phải có một configuration tương ứng. Với bảng dưới, tạo `<thư mục entity>/<Tên>.cs` và `<thư mục configuration>/<Tên>Configuration.cs` cho **từng tên liệt kê**, không tạo một file giả đại diện cho cả nhóm.

| Thư mục entity | Tên file không đuôi `.cs` | Thư mục configuration |
|---|---|---|
| `backend/SportHub.Identity/Domain/Entities` | `ExternalCoachProfile`, `UserSportSpecialty` | `backend/SportHub.Identity/Infrastructure/Persistence/Configurations` |
| `backend/SportHub.Scheduling/Catalog/Domain` | `Sport`, `RoomType`, `SportRoomType`, `RoomOpeningHour`, `RoomBlock`, `CourtRate` | `backend/SportHub.Scheduling/Catalog/Persistence` |
| `backend/SportHub.Scheduling/Domain/Entities` | `ClassScheduleRule`, `SeatHold` | `backend/SportHub.Scheduling/Infrastructure/Persistence/Configurations` |
| `backend/SportHub.Scheduling/Occupancy/Domain` | `RoomOccupancy`, `CoachOccupancy` | `backend/SportHub.Scheduling/Occupancy/Persistence` |
| `backend/SportHub.Scheduling/Threshold/Domain` | `ClassThresholdResponse` | `backend/SportHub.Scheduling/Threshold/Persistence` |
| `backend/SportHub.Scheduling/Rental/Domain` | `CourtRental`, `IncidentNotice` | `backend/SportHub.Scheduling/Rental/Persistence` |
| `backend/SportHub.Payment/Wallet/Domain` | `PointWallet`, `PointLedgerEntry`, `PointConfirmation` | `backend/SportHub.Payment/Wallet/Persistence` |
| `backend/SportHub.Payment/Domain/Entities` | `CheckoutSession`, `VerifiedGatewayEvent` | `backend/SportHub.Payment/Infrastructure/Persistence/Configurations` |

`CheckoutSession` là chu kỳ reserve/points hold của một Invoice (ID, InvoiceId, revision, deadline, state); một Invoice có nhiều chu kỳ thử lại nhưng không có hai chu kỳ active. Reference Hold/Release/Spend dùng ID chu kỳ, tránh unique `(invoiceId, Hold)` chặn retry hợp lệ. Attempt trỏ đúng chu kỳ và snapshot amount/points. `VerifiedGatewayEvent` là inbox chứng cứ gateway đã xác minh: provider transaction ID unique, attempt, amount, pay date, outcome, processing state/error/retry; không lưu secret hay raw payload có dữ liệu nhạy cảm không cần thiết. Đây là bổ sung để BR-85/117 hoạt động khi DB fulfillment rollback hoặc có hai khoản thu thật.

Enum mới và nơi đặt:

- Identity `Domain/Enums/ExternalCoachApprovalStatus.cs`, `EmailOtpPurpose.cs`.
- Scheduling `Catalog/Domain/SportOperationType.cs`, `Domain/Enums/SeatHoldStatus.cs`, `Threshold/Domain/ThresholdStatus.cs`, `Threshold/Domain/ThresholdChoice.cs`, `Occupancy/Domain/OccupancySourceType.cs`, `Rental/Domain/CourtRentalStatus.cs`.
- Payment `Domain/Enums/InvoicePaidVia.cs`, `CheckoutSessionStatus.cs`, `FulfillmentOutcome.cs`, `GatewayEventStatus.cs`; Wallet `Domain/PointEntryType.cs`, `PointConfirmationStatus.cs`.
- Trạng thái theo Design §5, ngoại trừ bổ sung kỹ thuật: fulfillment `Pending/Fulfilled/Compensated/ReconciliationRequired`; chuyển lớp cần `ResolutionStatus` riêng `AwaitingPayment/Completed/Expired` để Choice cuối cùng không bị sửa ngược.

### 5.2 Entity hiện hữu phải sửa

| File trong `backend/` | Thay đổi cụ thể |
|---|---|
| `SportHub.Identity/Domain/Entities/UserAccount.cs` + Configuration | SecurityStamp; FK/profile mới. Không trộn UserStatus với ExternalCoachApprovalStatus. |
| `SportHub.Identity/Domain/Entities/CoachProfile.cs` + Configuration | Bỏ category, Bio; specialty nhiều-nhiều qua UserSportSpecialty. |
| `SportHub.Identity/Domain/Entities/EmailOtp.cs` + Configuration | Purpose, hash, expired/consumed, failed attempts; uniqueness/chỉ mã mới nhất theo email+purpose. |
| `SportHub.Scheduling/Domain/Entities/Room.cs` + Configuration | RoomTypeId, IsActive; giữ room ID/name/capacity. |
| `SportHub.Scheduling/Domain/Entities/Class.cs` + Configuration | Code, SportId, CoachId, DefaultRoomId, StartDate, NumSessions, Capacity, Price, CostAmount, threshold fields, ConfirmedCount, ReservedCount, Version; bỏ Discipline. Tên dùng DefaultRoomId nhất quán. |
| `SportHub.Scheduling/Domain/Entities/ClassSession.cs` + Configuration | SessionNo, room/coach/time/status, makeup; bỏ capacity/baseline/confirmedCount. |
| `SportHub.Scheduling/Domain/Entities/Enrollment.cs` + Configuration | ClassId, MemberId, InvoiceItemId, Status, EnrolledAt, EndedAt, SourceEnrollmentId; bỏ SessionId/MemberPackageId và navigation cũ. |
| `SportHub.Scheduling/Domain/Entities/Attendance.cs` + Configuration | EnrollmentId + SessionId, Present/Absent, RecordedByUserId/RecordedAt/LastModifiedAt. |
| `SportHub.Scheduling/Domain/Entities/GymCheckIn.cs` + Configuration | CheckOutTime nullable, checkout actor nếu cần audit; đang chưa có checkout. |
| `SportHub.Training/Domain/Entities/PtSession.cs` + Configuration | RoomId nullable; coach occupancy luôn có, room occupancy khi có room. |
| `SportHub.Payment/Domain/Entities/Invoice.cs` + Configuration | Đổi **MemberId hiện hữu** thành BeneficiaryUserId (không rename cột tưởng tượng beneficiary_member_id); giữ IssuedByUserId hoặc đổi rõ thành InitiatedByUserId; PointsApplied, CashAmount, PaidVia, HoldExpiresAt, FulfillmentOutcome. |
| `SportHub.Payment/Domain/Entities/InvoiceItem.cs` + Configuration | Thêm ClassId int?, CourtRentalId Guid?, PtEntitlementId Guid?, MemberPackageId Guid? để tham chiếu có kiểu; migrate RelatedEntityId theo item cũ rồi loại cách dùng mơ hồ. Snapshot SportId/name, nguồn, giá trị thực trả/phân bổ để báo cáo/hoàn. |
| `SportHub.Payment/Domain/Entities/PaymentAttempt.cs` + Configuration | CheckoutSessionId, snapshot cash/points, provider ref, hạn, status, verified result/pay date; amount không đổi sau khi phát hành QR. |
| `SportHub.Payment/Domain/Entities/Payment.cs` + Configuration | VNP transaction ref/pay date, PaymentAttemptId; giữ tối đa 1 success/Invoice. Khoản thu thật thứ hai nằm trong verified event để bồi hoàn, không chèn Payment thứ hai. |
| `SportHub.Payment/Domain/Entities/PaymentAdjustment.cs` + Configuration | InvoiceItemId, SystemCalculatedPoints, ApprovedPoints, CenterFault, PointLedgerEntryId; giữ lịch sử, loại workflow chi tiền. |
| `SportHub.Membership/Domain/Entities/MembershipPackage.cs`, `MemberPackage.cs` + configurations | Gym không đếm lượt. Rà `SessionLimit/RemainingSessions` và consumer; bỏ field/quota lớp cũ khi không còn dùng, không bỏ quota trong PtEntitlement. |
| `SportHub.Notification/Domain/Entities/Notification.cs` + Configuration | Channel email, payload/recipient/subject/template, dedup, attempts, next retry/claim. Không gửi trùng khi nhiều worker. |

**Chú ý enum cũ:** khảo sát mapping `.HasConversion` trong configuration. Nếu lưu int, giữ số của giá trị còn dùng và viết SQL map dữ liệu bị thay. Nếu lưu string, đổi literal bằng migration. Không thay thứ tự enum rồi chạy trên dữ liệu cũ.

### 5.3 Ràng buộc DB phải có

1. `btree_gist`; `tstzrange [start,end)` không rỗng. Hai exclusion constraints theo room/coach + `&&` với `is_active`; hai buổi liền kề được phép. Source có unique `(source_type,source_id)` ở mỗi bảng.
2. `0 <= confirmed_count <= reserved_count <= capacity`; capacity > 0. Tăng giữ chỗ bằng conditional UPDATE/row lock, không chỉ `AnyAsync` rồi insert.
3. Partial unique enrollment Confirmed theo `(class_id,member_id)`; hold Active cùng cặp; session `(class_id,session_no)`; attendance `(enrollment_id,session_id)`.
4. Ví unique owner; available/held >= 0. Ledger append-only bằng trigger/quyền DB và unique reference+entry type. Reference phải phân biệt sự kiện, ví và chu kỳ; không dùng cùng reference tổng cho nhiều recipient khi index global.
5. Invoice `cash_amount + points_applied*1000 = total_amount`, hai vế không âm; giá catalog >0 và bội 1.000. Threshold ceil bằng decimal, không double.
6. Payment success unique Invoice; VNP TxnRef unique; transaction number unique khi có; verified event unique provider transaction. Inbox cần phân biệt callback lặp với **giao dịch ngân hàng khác thật sự**.
7. FK thật cho typed reference; `ON DELETE` không cascade xóa invoice/payment/ledger/audit. Response ngưỡng unique enrollment; tên sport unique lowercase; specialties composite key.
8. Các invariant qua nhiều bảng (attendance đúng lớp, room hợp sport, specialty, giờ hoạt động, member conflict) kiểm trong transaction service; không tuyên bố CHECK có thể query bảng khác.

### 5.4 Migration có thể triển khai từng chặng

Tạo migration mới theo model đã xong, không sửa/xóa migration lịch sử. Có thể chia `MultiSportIdentityCatalog`, `MultiSportCourseOccupancy`, `MultiSportWalletPayments`, `MultiSportThresholdRentals` thay một migration quá lớn. Mỗi migration có `.cs`, `.Designer.cs` EF sinh và snapshot cập nhật. Không tự bịa timestamp.

- Đọc toàn bộ FK cũ trước khi drop lớp/recurrence/enrollment/attendance demo; snapshot/export dữ liệu lớp nếu cần. Không xóa WorkoutResult: đã FK tới PtSession.
- Giữ Identity, Membership, PT, Invoice/Payment/Audit lịch sử. Payment thủ công cũ gắn nhãn legacy, không sửa thành VNPay, không ghi cash mới cho lịch sử không xác minh.
- Refund đã chi tiền trước đây không cộng điểm lần nữa. Lưu/export bằng chứng payout cũ trước khi loại cột; bản ghi legacy phải còn cách truy vết. Không “reset refunds = 0”.
- Tạo wallet số dư 0 cho Member/ExternalCoach hiện có, không suy tiền demo thành số dư thật. Seed ví có điểm chỉ qua ledger sự kiện seed idempotent.
- Backfill role/specialty Coach theo mapping demo rõ ràng; category instructor cũ không đủ xác định môn mới: dùng mapping user cụ thể trong seeder, không gán ngẫu nhiên.
- Backfill occupancy PT còn Scheduled. Nếu lịch cũ xung đột: báo danh sách, sửa dữ liệu demo có ghi nhận; không tắt constraint để migration pass.
- Kiểm hai đường: database trắng chạy toàn bộ migrations, database ở migration `20260929010712_AddPtTrainingDomain` nâng cấp. Khôi phục demo bằng backup nếu cần; Down không thể tự khôi phục dữ liệu lớp đã drop.

**Gate:** constraints được thử trên PostgreSQL thật; các dòng tài chính cũ không mất, schema/snapshot không drift.

## 6. P1.03 — Identity, password, Coach và ExternalCoach

| File trong `backend/` | QĐ và việc làm |
|---|---|
| `SportHub.Identity/Application/Services/AuthService.cs`, `GoogleAuthService.cs`, `AccountService.cs` | S: PasswordPolicy chung, mapping specialty/status; Google onboarding không bypass. |
| `SportHub.Identity/Application/Interfaces/IAuthService.cs`, `IAccountService.cs`, `IUserAccountRepository.cs` | S: contract tương ứng, đọc stamp/role/status hiện tại. |
| `SportHub.Identity/Infrastructure/Repositories/UserAccountRepository.cs` | S: dữ liệu xác thực hiện tại, không cache quyền vô hạn. |
| `SportHub.Identity/Application/DTOs/UserSummaryResponse.cs`, `AuthResponse.cs` | S: role, sport specialties, approvalStatus; không còn CoachCategory. |
| `SportHub.Identity/Application/Commands/RegisterRequest.cs`, `CompleteGoogleOnboardingRequest.cs` | S: policy/confirm password; không làm mất OTP đăng ký. |
| `SportHub.Identity/Domain/Rules/PasswordPolicy.cs` | T: 8–64 ký tự, 4 nhóm, không chứa local-part email (so không phân biệt hoa thường). |
| `SportHub.Identity/Application/Commands/ForgotPasswordRequest.cs`, `ResetPasswordRequest.cs`, `ChangePasswordRequest.cs`, `RegisterExternalCoachRequest.cs`, `SaveCoachRequest.cs`, `ReviewExternalCoachRequest.cs` | T: DTO riêng, không cho public nhận role tùy ý. |
| `SportHub.Identity/Application/Services/PasswordResetService.cs`, `ExternalCoachService.cs`, `CoachAdminService.cs` | T: state machine, audit và outbox. |
| `SportHub.Identity/Application/Services/CoachProfileReader.cs` | S: implement specialty port, bỏ category. |
| `SportHub.Identity/Application/Interfaces/ICoachProfileReader.cs` | X sau khi consumer chuyển port; không giữ hai cách xác định quyền. |
| `SportHub.Identity/Api/AuthController.cs`, `AccountController.cs`, `GoogleAuthController.cs` | S: nối contract đúng; Account hiện khai báo DTO ngay trong service, tách nếu trùng mới. |
| `SportHub.Identity/Api/CoachesController.cs`, `ExternalCoachesController.cs` | T: Manager tạo Coach/duyệt coach ngoài; self profile theo JWT. |
| `SportHub.BuildingBlocks/Infrastructure/Authentication/JwtService.cs` | S: claim sst, phát token mới cho session đổi mật khẩu thành công. |
| `SportHub.API/Extensions/AccountStatusJwtExtensions.cs` | S: so stamp, role và active ở request tiếp theo; giữ hook lỗi/challenge đang có. |
| `SportHub.Administration/Application/Services/UserAdminService.cs` | S: SystemAdmin tạo staff được phép; Manager tạo Coach qua service riêng; role change cần specialty khi thành Coach, audit và invalidate role token cũ. |
| `SportHub.Administration/Application/Commands/UserAdmin/CreateStaffAccountRequest.cs`, `ChangeUserRoleRequest.cs`, `Application/DTOs/UserAdmin/UserAdminResponse.cs`, `Api/UsersController.cs` | S: bỏ category, không nhầm quyền duyệt ExternalCoach thành Admin. |

Password reset: OTP 6 số/10 phút/5 sai/60 giây resend, rate limit email+IP, chỉ mã mới nhất, băm, dùng một lần. Response forgot trung tính cho email không tồn tại/bị khóa; request reset không nhận currentPassword. Rotate stamp làm token cũ mất hiệu lực. Change khi login cần currentPassword và khác mật khẩu cũ; phát JWT mới cho phiên hiện tại, các token cũ bị vô hiệu. Không tự thêm refresh-token subsystem nếu hiện chưa có.

Không tự thêm `MustChangePassword` chỉ vì phụ lục A có nhắc: BR không chốt cơ chế cấp mật khẩu tạm cho Coach; giữ luồng tạo tài khoản với mật khẩu mạnh theo contract hiện hữu. Nếu nhóm cần onboarding mật khẩu tạm thì lập quyết định riêng, không lẫn với Google onboarding.

Hasher đang dùng BCrypt và DTO đang có giới hạn 72 byte. BR mới đòi 8–64 ký tự, kể cả Unicode có thể >72 byte. Không silently truncate hoặc áp 72-byte validation khiến BR sai. Dùng hash có version mới hỗ trợ Unicode (ví dụ ASP.NET PasswordHasher), verify hash BCrypt legacy và rehash khi login thành công. Sửa `Infrastructure/Security/PasswordHasher.cs`, giữ dummy verify chống timing và cập nhật test. Đây là đổi implementation, không đổi chính sách mật khẩu.

ExternalCoach: OTP xác thực rồi tạo user + profile PendingApproval + specialty + wallet (qua port) cùng transaction. Chỉ Approved mới đặt mới; Pending/Rejected/Suspended vẫn xem hồ sơ, trạng thái xét duyệt và lịch sử thuộc mình nếu account active; không được xem roster/member. Reject/Suspend/Reactivate ghi lý do/audit, gửi email. Không tự hủy lượt thuê Confirmed khi Suspend.

**Test gate:** password đầy đủ mọi đường; reset không hỏi mật khẩu cũ; OTP race chỉ một request thành công; token trước reset/đổi role bị từ chối; Manager không tạo Admin; Admin không duyệt coach ngoài; Google onboarding regression; không khai role qua body để leo quyền.

## 7. P1.04 — Catalog và occupancy

**Tạo file:**

| Đường dẫn trong `backend/SportHub.Scheduling/` | Vai trò |
|---|---|
| `Catalog/Application/SportCatalogService.cs`, `RoomTypeService.cs`, `RoomOpeningHourService.cs`, `RoomBlockService.cs`, `CourtRateService.cs` | CRUD, soft deactivate, tương thích sport/type, lịch mở cửa, block và giá. |
| `Catalog/Application/CatalogContracts.cs` | Save/read DTO Sport, RoomType, opening hours, block, rates; không trả entity. |
| `Catalog/Api/SportsController.cs`, `RoomTypesController.cs`, `RoomOpeningHoursController.cs`, `RoomBlocksController.cs`, `CourtRatesController.cs` | Public chỉ đọc sport active; Manager ghi catalog. |
| `Catalog/Application/SportCatalogReader.cs` | Implementation port catalog. |
| `Occupancy/Application/OccupancyService.cs` | Write/release occupancy cùng transaction chủ thể, xử lý replace rollback. |
| `Occupancy/Application/AvailabilityService.cs` | Cùng nguồn dữ liệu với writer; query room/coach trống, bounded date range. |

**Sửa:** `Application/Services/RoomService.cs`, `Api/RoomsController.cs`, `Application/Commands/Room/SaveRoomRequest.cs`, `Application/DTOs/Room/RoomResponse.cs`; room entity cũ giữ một nơi, không tạo thêm bản `Catalog/Domain/Room.cs`. `SportHub.API/Middleware/ExceptionHandlingMiddleware.cs`: map exclusion `23P01`/unique/concurrency sang 409 và error code, không leak SQL.

Business: giờ local Việt Nam, UTC storage; khoảng `[start,end)`; room inactive/sport inactive chặn booking mới; không sửa lịch cũ theo default duration mới. Rate theo room type + sport khi cần, weekday/time; cấm cấu hình giá chồng lấn không xác định. Lượt thuê qua hai mức giá phải tính từng khối 60 phút và snapshot line breakdown, không lấy giá giờ đầu nhân tất cả. CourtRental thêm SportId để enforce BR-106/127 (ERD v3 thiếu cột này).

Block thường gặp lịch đang chiếm: 409 + danh sách xung đột; không tự refund. Incident dùng quy trình riêng P1.11. Availability chỉ là gợi ý; POST vẫn chịu DB constraint.

**Test gate:** hai request đồng thời giành một room/coach chỉ một thắng; liền kề không xung đột; khác room cùng coach vẫn bị chặn; dời buổi lỗi giữ lịch cũ; room inactive và ngoài giờ bị từ chối.

## 8. P1.05 — Lớp theo khóa, lịch, điểm danh, Gym và PT

### 8.1 Xóa tận gốc mô hình đặt từng buổi

| Đường dẫn trong `backend/SportHub.Scheduling/` | QĐ / thay thế |
|---|---|
| `Domain/Constants/Disciplines.cs` | X → Sport data. |
| `Domain/Exceptions/InvalidDisciplineException.cs` | X → sport validation. |
| `Domain/Exceptions/NoActiveMemberPackageException.cs` | X khi không còn consumer Gym/PT dùng; chuyển lỗi Gym/PT về module đúng nếu cần. |
| `Domain/Entities/ClassRecurrence.cs` | X → ClassScheduleRule. |
| `Infrastructure/Persistence/Configurations/ClassRecurrenceConfiguration.cs` | X → ClassScheduleRuleConfiguration. |
| `Application/Commands/Class/SaveRecurrenceRequest.cs` | X → SaveClassRequest.ScheduleRules. |
| `Application/DTOs/Class/ClassRecurrenceResponse.cs` | X → ClassScheduleRuleResponse.cs (T). |
| `Application/Commands/Session/GenerateSessionsRequest.cs` | X → publish sinh session. |
| `Application/Commands/Session/CreateAdHocSessionRequest.cs` | X → thao tác makeup có ClassId và kiểm đủ khóa. |
| `Domain/Rules/ClassRules.cs`, `SessionRules.cs` | S viết lại: không Yoga/GroupX, sáng/chiều, daily limit, cancel 30 phút. |
| `Application/Services/ClassService.cs`, `ClassSessionService.cs`, `EnrollmentService.cs` | S viết lại: course/publish/roster; Enrollment chỉ sinh từ fulfillment. |
| `Api/ClassesController.cs`, `ClassSessionsController.cs`, `EnrollmentsController.cs` | S: bỏ endpoint free enroll/cancel từng buổi; GET roster/schedule + checkout ở Payment orchestration. |
| `Application/Commands/Class/SaveClassRequest.cs`, `Application/Commands/Session/UpdateSessionRequest.cs`, `RescheduleSessionRequest.cs`, `CancelSessionRequest.cs` | S: class/room/coach/rules, bù buổi và reason. |
| `Application/Commands/Enrollment/CreateEnrollmentRequest.cs` | X khi checkout DTO mới thay hoàn toàn; không còn tạo Confirmed trực tiếp từ request này. |
| `Application/DTOs/Class/ClassResponse.cs`, `DTOs/Session/ClassSessionResponse.cs`, `MemberSessionResponse.cs`, `DTOs/Enrollment/EnrollmentResponse.cs` | S: class-based enrollment và lịch đầy đủ. |

Thêm `Application/Services/ClassEnrollmentFulfillment.cs`, `SeatHoldService.cs`; DTO `Application/Commands/Class/PublishClassRequest.cs`, `CancelClassRequest.cs`, `Application/Commands/Session/CreateMakeupSessionRequest.cs`.

Publish: lock class → validate sport GroupCourse, coach/specialty, room/type, capacity, price/cost → generate đủ NumSessions từ StartDate + weekday/time → reserve toàn bộ room/coach occupancy → threshold deadline/snapshot → Published → audit/outbox. Một buổi xung đột thì rollback cả publish. Public không thấy Draft. Không nhận ghi danh khi đến buổi đầu dù ClassStatusJob chưa chạy.

Dời/hủy một buổi: giữ enrollment; dùng occupancy mới nguyên tử, email lịch trước/sau. Hủy phải tạo lịch bù hợp lệ, không tự coi buổi hủy là đã dạy; số buổi thực cung cấp vẫn NumSessions. Dời có thể làm Member bị trùng hai lớp: kiểm lại học viên bị ảnh hưởng và trả conflict cho Manager; không chỉ kiểm room/coach.

### 8.2 Điểm danh và Gym

Sửa `Application/Services/AttendanceService.cs`, `Api/AttendanceController.cs`, `Application/Commands/Attendance/MarkAttendanceRequest.cs`, DTO `AttendanceResponse.cs`, `RosterEntryResponse.cs`, `SessionRosterResponse.cs`. Check enrollment thuộc đúng Class của Session, Confirmed tại thời điểm thao tác, actor Receptionist; Coach/Manager chỉ đọc theo scope; không ghi attendance lớp nhóm vào WorkoutResult.

Sửa `GymCheckInService.cs`, `Infrastructure/Repositories/GymCheckInRepository.cs`, `Api/GymCheckInsController.cs`, `Api/MemberGymCheckInsController.cs`, `Api/GymCheckInPolicies.cs`, `DTOs/GymCheckIn/GymCheckInResponse.cs`: check-out server time, idempotent; không checkout trước checkin; chỉ Receptionist ghi, Member tự xem. Giữ kiểm tra Active Membership và test concurrency hiện hữu.

Sửa `SportHub.API/Jobs/AttendanceFinalizerJob.cs`: bỏ hoàn toàn group NoShow; nếu chưa có PT auto-finalizer thì thực hiện bằng service quota PT đúng BR, không sao chép việc trừ quota. Thêm `Jobs/ClassStatusJob.cs`: Completed session/lifecycle class không tự ghi Present/Absent. Job chạy lặp không trừ quota/ghi audit trùng.

### 8.3 PT phải giữ toàn bộ tính năng đã có

Sửa `SportHub.Training/Application/Services/CoachMemberRelationshipService.cs`, `PtEntitlementLifecycleService.cs`, `PtSessionService.cs`, `PtSessionChangeRequestService.cs`, `PtCoachChangeRequestService.cs`, `WorkoutService.cs`, `HomeworkService.cs`; controller `Api/PtSessionsController.cs`, `CoachMemberRelationshipsController.cs`, `WorkoutController.cs`, `HomeworkController.cs` và mọi consumer `RequireCategoryAsync` tìm bằng rg.

- Thay category bằng port specialty; giữ ownership + Active relationship ở nghiệp vụ đòi hỏi.
- Create/reschedule/approve change/coach change/cancel phải update coach occupancy; có room thì room occupancy và giờ hoạt động. Không bỏ check ở đường Manager.
- DTO `Application/Commands/PtSessions/CreatePtSessionRequest.cs`, `ManagerReschedulePtSessionRequest.cs`, `Application/DTOs/PtSessions/PtSessionResponse.cs` thêm RoomId/room display.
- Giữ PT 90 phút, entitlement/quota, no-show, late cancellation và kết quả/homework đã có. Không tạo bảng attendance cho học viên của coach ngoài.

**Gate:** course schedule đủ buổi; publish atomic; attendance đúng role/24 giờ; Gym checkout; toàn bộ test PT có ý nghĩa còn pass.

## 9. P1.06 — Wallet và xác nhận điểm tại quầy

Tạo trong `backend/SportHub.Payment/Wallet/`:

- `Application/PointWalletService.cs`, `PointConfirmationService.cs`, `WalletQueryService.cs`, `PointAdjustmentService.cs`.
- `Application/WalletContracts.cs`: balance, ledger pagination, points requested, confirmation ID/expiry, manager adjustment direction/points/reason.
- `Api/WalletsController.cs`, `PointConfirmationsController.cs`, `PointAdjustmentsController.cs`.

Wallet dùng integer points; tiền decimal VND. Ledger chỉ append, mỗi entry ghi available/held after và người thực hiện. Adjustment cần **direction** Credit/Debit hoặc signed delta riêng vì `points>0` + EntryType Adjustment một mình không xác định cộng/trừ. Adjustment âm không tiêu được điểm đang hold.

`Hold(p)`: available−p, held+p; `Spend(p)`: held−p; `Release(p)`: held−p, available+p; `Earn(p)`: available+p. Khóa ví và check số dư trong cùng transaction. Retry trả kết quả cũ khi cùng idempotency key+payload; cùng key khác payload trả 409. Reference chứa wallet+event/checkout cycle để hoàn hàng loạt không va unique. Không có nạp tiền, chuyển điểm, expire points, withdraw.

OTP flow bắt buộc:

1. Receptionist chọn Member cụ thể; backend kiểm role Member, invoice beneficiary và actor; log lần xem ví.
2. Tạo checkout/hold chỗ với PointsApplied=0, chưa phát hành payment attempt nếu người dùng đang chọn điểm. Request confirmation chứa invoice/revision/member/points; OTP 6 số 5 phút, dùng một lần, hash, 5 sai; gửi email đúng Member.
3. Receptionist nhập mã được Member đọc. Backend khóa confirmation/invoice/wallet; kiểm expired, lần sai, revision, invoice chưa trả, hold còn hạn và số dư. Đủ thì Hold điểm + set PointsApplied/CashAmount + consume OTP cùng transaction.
4. Sau đó mới phát QR đúng phần VND hoặc fulfillment ngay nếu 100% điểm. Không phát QR full-price rồi âm thầm đổi amount của attempt đó.
5. OTP sai phải tăng failed count **được commit**, không throw trong transaction rồi rollback bộ đếm. Mã cũ vô hiệu sau resend; không cho resend kéo dài chỗ giữ quá hạn.
6. Đổi Member/đổi điểm/Invoice đã cancel/expiry làm confirmation cũ vô hiệu. Retry không trừ lần hai. Receptionist không có endpoint trực tiếp gọi Earn/Adjust.

Self-checkout Member/ExternalCoach: subject từ JWT, xác nhận điểm bằng action checkout; không cần OTP. Client không gửi owner tùy ý. OTP/audit không chứa mã rõ. `LoggingEmailSender` chỉ được lộ nội dung demo khi bật chế độ demo Development rõ ràng (§19.2); production không log OTP theo BR-78, không âm thầm fallback log thay email thật.

**Gate:** hai invoice dùng cùng số dư đồng thời không âm; OTP 5 sai và 5 phút; gọi trùng không Hold hai lần; các đường API trái role/khác ví bị chặn.

## 10. P1.07 — Checkout, VNPay, fulfillment và retry

### 10.1 File sửa/xóa/thêm

| Đường dẫn trong `backend/SportHub.Payment/` | QĐ và việc làm |
|---|---|
| `Application/Services/PackagePurchaseService.cs`, `PackageActivationService.cs` | S: bỏ “đã thu đủ sau discount thì kích hoạt”; gọi checkout/fulfillment chung; Membership ngày VN và early renewal. |
| `Application/Interfaces/IPackagePurchaseService.cs`, `IPackageActivationService.cs` | S hoặc X sau khi port mới thay toàn bộ consumer; ghi quyết định trong manifest. |
| `Application/Services/PaymentRecordingService.cs`, `Application/Interfaces/IPaymentRecordingService.cs`, `Application/Commands/Payments/RecordPaymentRequest.cs` | X sau khi thay endpoint bằng verified flow; không giữ đường đánh dấu success bằng tay. |
| `Api/InvoicesController.cs` | S: query, attempt, cancel checkout, reconcile; ownership/rate limit. |
| `Application/Services/InvoiceQueryService.cs`, `Application/Interfaces/IInvoiceQueryService.cs` | S: beneficiary/initiator, items, cash/points, expiry, fulfillment/reconciliation outcomes. |
| `Application/DTOs/Invoices/InvoiceDetailResponse.cs`, `InvoiceSummaryResponse.cs`, `InvoiceItemResponse.cs`, `Application/DTOs/Payments/PaymentResponse.cs` | S: contract v3, không buộc Invoice chỉ Membership. |
| `Domain/Rules/InvoiceMath.cs`, `Domain/Enums/InvoiceStatus.cs`, `PaymentAttemptStatus.cs`, `InvoiceItemType.cs`, `PaymentMethod.cs` | S: đủ tiền một lần, split, lifecycle; legacy enum chỉ đọc lịch sử nếu phải giữ. |
| `Application/Services/CheckoutService.cs`, `PaymentFulfillmentService.cs`, `CheckoutExpiryService.cs`, `PaymentReconciliationService.cs` | T: transaction orchestration dùng ports, không vòng DI. |
| `Application/Commands/Checkouts/CheckoutRequests.cs`, `Application/DTOs/Checkouts/CheckoutResponse.cs` | T: membership/PT/class/rental DTO, targetMember chỉ ở counter, idempotency key. |
| `Api/CheckoutsController.cs`, `Api/PaymentsController.cs`, `Api/DevPaymentsController.cs` | T: API chung, callback, dev simulation có guard. |
| `VnPay/IPaymentGateway.cs`, `VnPay/VnPayGateway.cs`, `VnPay/MockPaymentGateway.cs`, `VnPay/VnPayOptions.cs`, `VnPay/VnPaySigner.cs` | T: gateway abstraction thực tế, không giả định đã có code. |

`IPaymentGateway` thuộc Payment, không cần expose VNP details sang Scheduling. Khi triển khai VnPaySigner/QueryDR phải đọc tài liệu sandbox chính thức của merchant, kiểm signature/canonicalization/amount units bằng fixture chuẩn; không tự viết theo trí nhớ. Mock dùng đúng pipeline verified event + fulfillment, không bypass invariants.

### 10.2 Transaction và thứ tự khóa

Chọn một lock order áp dụng tất cả đường ghi: Invoice/checkout hiện có → beneficiary (serialize lịch Member) → Class theo ID tăng dần hoặc Rental source → Wallet → occupancy nguồn liên quan. Với checkout mới có thể cấp ID Invoice trước; document cách không tạo đường đảo khóa. Retry có giới hạn cho deadlock/serialization, idempotency bắt buộc. Không giữ DB transaction trong lúc gọi VNPay/SMTP.

**Checkout lớp:** validate user + Published + chưa buổi đầu; khóa user và kiểm các enrollment/hold còn hiệu lực giao lịch; conditional reserve_count++; tạo SeatHold + Invoice/Item snapshot + CheckoutSession; Hold điểm đã xác nhận; outbox pending. Atomic rollback nếu bất kỳ phần thất bại. Không gọi membership check. Request double-click cùng key trả invoice/hold cũ; khác key cùng lớp bị unique chặn.

**Attempt:** snapshot cash amount và points; expiry không vượt hold/checkout deadline, khớp `vnp_ExpireDate`. Retry sau hết hạn phải reacquire capacity/schedule/wallet và tạo chu kỳ checkout mới; không hồi sinh hold cũ và không tái dùng ledger reference. Không có hai attempt đang usable với số tiền khác nhau; provider callback cũ vẫn phải xử lý an toàn.

**Nhận tiền:** xác minh checksum/TmnCode/TxnRef/Amount/ResponseCode/TransactionStatus và provider time. ReturnUrl không ghi Paid. IPN/QueryDR hợp lệ → lưu VerifiedGatewayEvent idempotent bền vững trước fulfillment. Transaction nghiệp vụ tạo Payment, Invoice Paid, Spend held points, quyền lợi, audit/outbox cùng commit. Nếu transaction fail, rollback toàn bộ nghiệp vụ và cập nhật inbox ReconciliationRequired bằng transaction riêng; worker retry từ chứng cứ đã xác minh.

**100% điểm:** không PaymentAttempt, không Payment VNP 0đ; Invoice PaidVia Points và fulfillment + Spend cùng transaction, paid timestamp là server time.

**Checkout PT và giá đã chốt:** tạo `backend/SportHub.Training/Application/Services/PtPricingService.cs`, `Application/DTOs/PtEntitlements/PtPurchaseQuoteResponse.cs`, `Api/PtPricingController.cs`. Dùng setting `pt.price_per_session_vnd` do Manager quản lý (qua SystemSettingProvider), trả giá/phiên bản cập nhật cho GET quote; không cần thêm project hay bảng PtPackage. API đề xuất `GET /api/pt-pricing`, `PUT /api/manager/pt-pricing`, `POST /api/checkouts/pt/quote`; final checkout `/api/checkouts/pt` nhận coachId, frequencyPerWeek, Membership liên kết hợp lệ và số điểm/targetMember theo actor. Training tính TotalQuota bằng `PtEntitlementRules` BR-71 dựa Membership còn lại, Payment lấy quote qua `IPtPurchaseFulfillment`, snapshot price×quota. Cùng transaction tạo pending entitlement và InvoiceItem; sau verified payment mới activate. Nếu giá thay sau preview nhưng trước checkout, trả quote mới và yêu cầu xác nhận lại, không tự thu giá cao hơn. Test giá × quota, rounding theo BR-71, frequency ngoài 1/2/3, Membership hết hạn, coach thiếu specialty, price đổi, duplicate activation. Seeder dùng đơn giá demo có ghi rõ, không xem là giá kinh doanh được người dùng chốt.

**Hết hạn/hủy:** compare state rồi expire/cancel Invoice, release hold seat/rental occupancy và held points **đúng một lần**. Thêm `SportHub.API/Jobs/SeatHoldExpiryJob.cs`, `CheckoutExpiryJob.cs` (cho Membership/PT không có seat), `PaymentReconciliationJob.cs`. Job khóa batch, retry bounded, nhiều instance an toàn. RentalStatusJob dùng cùng expiry service, không tự Release thêm lần nữa.

**IPN muộn:** row-lock Invoice và resource để serialize với expiry/cancel. Nếu resource còn hợp lệ, reacquire kiểm đủ schedule conflict/approval/capacity và **điểm đã Release** trước đó; không Spend điểm đã hết. Nếu không thể thực hiện đủ dịch vụ, bồi hoàn **phần tiền mới thực thu** vào ví; điểm release trước đó không cộng lần hai. Ghi PaidAfterReconciliation + Compensated, không enrollment/rental mới. Không âm thầm lấy điểm khác mà chủ ví chưa xác nhận cho chu kỳ mới.

**Callback trùng** cùng giao dịch: acknowledge idempotent, không cộng gì. **Khoản thu ngân hàng khác** cho Invoice đã Paid: lưu event riêng, không tạo Payment success thứ hai, bồi hoàn tiền thu thêm bằng điểm đúng một lần theo transaction ID. Báo cáo phải phản ánh khoản thu này riêng (xem P1.12), không bỏ tiền đã thu vì unique Payment. Sai checksum/ref/amount không cấp quyền lợi; giao dịch amount bất thường chỉ xử lý bồi hoàn sau được đối soát xác minh thực thu, không tin payload giả.

**Gate:** test 0/part/full points, 2 IPN đồng thời, callback lặp vs giao dịch thứ hai, lỗi fulfillment sau verified event, late IPN race với expiry, insufficient wallet sau release, retry không kéo dài hold bất hợp lệ. Không test bằng EF InMemory.

## 11. P1.08 — Refund bằng điểm

Sửa `PaymentAdjustmentService.cs`, `IPaymentAdjustmentService.cs`, `Api/PaymentAdjustmentsController.cs`, DTO `PaymentAdjustmentResponse.cs`, command `CreateAdjustmentRequest.cs`, `ApproveAdjustmentRequest.cs`, `RejectAdjustmentRequest.cs`, và `Domain/Rules/RefundCalculator.cs` trong Payment. Xóa `Application/Commands/Adjustments/CompleteAdjustmentRequest.cs` sau khi loại endpoint complete-payout. Route đích `/api/refunds`; entity lưu trữ vẫn PaymentAdjustment. Discount/Correction legacy giữ để đọc lịch sử; không tạo mới để lách BR-81/87 hoặc kích hoạt Invoice chưa trả.

- Refund tính theo **InvoiceItem thực trả**, kể cả giá trị điểm đã Spend, trừ đã hoàn trước. Không lấy toàn Invoice cho từng item.
- Membership: RemainingDays×3 >= TotalDays×2 tại ngày request Việt Nam → 50%; hết hạn/không đủ → 0 nếu không center fault có căn cứ.
- PT: chưa consume session → 50%; có consume kể cả no-show/late cancel → 0 chuẩn. Giữ reservation/consumption semantics của PT, không chỉ đếm buổi Completed.
- Class trước buổi đầu: 100%; sau bắt đầu không chuẩn. Trung tâm hủy giữa khóa: tỷ lệ buổi chưa diễn ra / tổng buổi cung cấp, không tính buổi hủy rồi bù hai lần; floor VND/1000 cuối phép tính.
- Rental cancel ≥24h: 100%; <24h/no-show: 0; center cancel 100%.
- Approve khóa request + entitlement/item + wallet, tính lại cap đã hoàn; audit Approved→Completed, Earn points, cancel quyền lợi tương lai/release occupancy/quota cùng transaction. Gọi hai lần chỉ một credit.
- Tự hoàn do threshold/incident/rental cancel dùng `IRefundCreditService` và reference sự kiện, không tạo refund request giả cần Manager duyệt.
- `RefundMethod`, `RefundReferenceCode`, `LegacyPayoutUnverified` là **property đang có**, không có file `RefundPayoutEvidence.cs` để xóa. Migration cũ `AddRefundPayoutEvidence` giữ nguyên; dữ liệu legacy phải được bảo toàn theo P1.02 trước khi bỏ cột.

**Gate:** biên 2/3, 50% PT, trước/sau buổi đầu, 24h thuê sân, split refund, cap cumulative, double approval, rollback quyền lợi khi credit lỗi.

## 12. P1.09 — Ngưỡng hoàn vốn và chuyển lớp

Tạo trong `backend/SportHub.Scheduling/Threshold/`:

- `Application/ClassThresholdService.cs`, `ClassTransferService.cs`, `ThresholdResponseService.cs`, `ThresholdContracts.cs`.
- `Api/ThresholdResponsesController.cs` (self secure link), thêm waive endpoint vào ClassesController.
- Jobs host `ClassThresholdEvaluationJob.cs`, `ClassThresholdResponseExpiryJob.cs`.

1. Publish snapshot ceil(cost/price), threshold deadline = first session UTC−N ngày; reject threshold>capacity. Sửa giá/cost sau publish chỉ trước deadline, tính lại và audit; Invoice cũ không đổi.
2. Evaluation lock lớp: đếm Confirmed, không tính holds. AtRisk tạo một response/enrollment, secure token lưu hash và outbox; deadline snapshot 48h cấu hình. New enrollment sau AtRisk cũng cần response/cảnh báo nếu lớp vẫn AtRisk.
3. Trong thời gian chờ vẫn nhận ghi danh; lên Met không hủy lựa chọn đã gửi và không tự xóa pending response/deadline. Rule BR-120 cho người chưa trả lời vẫn thực thi; đánh giá lại cuối hạn theo BR-121. Waive bảo vệ lớp khỏi tự hủy, không tước lựa chọn hoàn/chuyển của người đã nhận thông báo.
4. Secure token gắn enrollment/member, hạn, một lần; API cần subject đúng. Không chuyển chỉ bằng GET. Lựa chọn đã gửi final, double POST trả kết quả cũ hoặc conflict khác choice.
5. Chuyển cùng môn Published/chưa bắt đầu/còn chỗ, không giao lịch; lock cả hai lớp theo ID tăng dần. Bằng giá/rẻ hơn: transfer enrollment + counts + hoàn chênh trong cùng transaction. Đắt hơn: hold chỗ đích, invoice chênh, `ResolutionStatus=AwaitingPayment`, **ghi danh cũ vẫn Confirmed** cho tới payment fulfillment. Khi trả đủ mới kết thúc cũ/tạo mới.
6. Checkout chênh hết hạn: release chỗ đích/điểm, không tạo enrollment đích; giữ lựa chọn Transfer cuối cùng, cho retry cùng đích nếu còn hợp lệ trước deadline. Nếu đến deadline vẫn chưa chuyển xong, xử lý hoàn điểm theo quy trình kết thúc response, không treo vô hạn. Đây là chính sách kỹ thuật cần ghi trong contract trước code.
7. Khi transfer, lưu chuỗi giá trị thực trả: Enrollment mới trỏ item gốc + nguồn enrollment + item chênh nếu có. Refund lớp đích tính tổng giá trị chuyển sang, trừ phần chênh đã hoàn; không chỉ refund invoice chênh lệch. Late payment của transfer sau nguồn đã refund không hồi sinh enrollment, bồi hoàn cash mới.
8. Expiry: lock response, Pending quá hạn → auto-refund; sau xử lý các response đến hạn, reevaluate Confirmed, thiếu ngưỡng và chưa Waived thì Cancelled, hoàn các enrollment còn lại, release occupancies và notification. Có retry/checkpoint theo lớp, không xử lý một nửa rồi tuyên bố canceled hoàn tất.

**Gate:** đúng ngưỡng ceil, seats chưa trả không tính, AtRisk→Met + lựa chọn cũ, waive, token ownership/replay, transfer rẻ/bằng/đắt, fail/expire/late payment chuyển lớp, job chạy hai worker không credit trùng.

## 13. P1.10 — Thuê sân ExternalCoach và Court Schedule

Tạo trong `backend/SportHub.Scheduling/Rental/`:

- `Application/CourtRentalService.cs`, `CourtRentalFulfillment.cs`, `CourtScheduleService.cs`, `CourtRentalContracts.cs`, `CourtScheduleContracts.cs`.
- `Api/CourtRentalsController.cs`, `CourtScheduleController.cs`.
- Host `Jobs/RentalStatusJob.cs`.

Rental: Approved, sport phù hợp profile/room type và active, bắt đầu tương lai, 60 phút mỗi khối, 1–4 giờ, trong 30 ngày; giá tính theo từng khối/time band, snapshot vào invoice. PendingPayment đã chiếm room **và coach**; DB chặn song song cùng external coach ở hai sân. Fulfillment qua Payment, không set Confirmed trực tiếp từ controller. Cancel/retry/expiry cùng quy trình wallet/occupancy. Suspended không tạo mới nhưng vẫn được xử lý rental cũ theo BR-129.

Court Schedule Manager/Receptionist: ngày/tuần/room, phân biệt class/PT/rental/block, coach và roster/attendance của class/PT. Coach chỉ thấy lịch lớp mình phụ trách (và PT của mình qua endpoint PT), không được lấy toàn lịch rồi FE lọc. ExternalCoach availability chỉ trả khoảng trống/giá, không lộ Member/lớp/roster của trung tâm. Rental chỉ ExpectedAttendees integer hợp lệ, không có danh sách học viên và attendance.

**Gate:** cạnh tranh thuê-vs-publish-vs-PT-vs-block, 24h boundary, nhiều khung giá, approval changes, IDOR invoice/rental/wallet, privacy calendar.

## 14. P1.11 — Incident, outbox email và system settings

Tạo `SportHub.Scheduling/Rental/Application/IncidentService.cs`, `Rental/Api/IncidentsController.cs`; `SportHub.Notification/Application/Services/ManualNoticeService.cs`, `Api/NoticesController.cs`, `Application/DTOs/ManualNoticeRequest.cs`.

Incident ở room/time hoặc toàn trung tâm: liệt kê tác động trước, lock nguồn theo thứ tự; rental auto cancel/refund 100%; release occupancy rồi block. Class/PT đang giao nhau cần xử lý dời/bù/cancel theo rule riêng **trước khi chèn block**, nếu không exclusion sẽ khiến transaction fail. API trả preview + phương án resolution, Manager xác nhận phương án; không vô hiệu occupancy lớp mà giữ lịch hiển thị Scheduled ở sân đã khóa. Nếu không có phương án hợp lệ, trả conflict để Manager xử lý, không thông báo “đã khóa” giả. Ghi audit danh sách chịu tác động và outbox email. “Ưu tiên đặt lại” theo BR-130 thể hiện qua thông báo/hỗ trợ của Manager, không tự thêm waitlist engine.

Sửa `SportHub.Notification/Infrastructure/NotificationWriter.cs`, `NotificationSourceEventType.cs`, configuration/entity, `SportHub.API/Jobs/NotificationDispatchJob.cs`. Thêm `SportHub.Notification/Application/Services/EmailDispatchService.cs`, `Infrastructure/EmailTemplateRenderer.cs`.

Outbox ghi trong transaction nghiệp vụ; dispatcher claim batch, retry/backoff, không gửi email trong lock invoice. Dedup `(event,recipient,channel)`. Network send at-least-once: không hứa exactly-once email khi provider không hỗ trợ idempotency; đảm bảo nghiệp vụ/ledger exactly-once bằng DB. Email payload OTP lưu có bảo vệ/phạm vi sống ngắn; không đưa OTP plaintext vào AuditLog. Không chuyển email thành Sent khi mới chỉ cập nhật DB mà chưa gọi sender.

Sửa `SportHub.Notification/Application/Services/NotificationService.cs` và DTO trả ra: danh sách/read-all in-app chỉ thao tác Channel=InApp; không trả email body/OTP hay đánh Email Pending thành Read khiến dispatcher bỏ gửi. Status đọc của người dùng và trạng thái delivery email không dùng thay thế nhau. Thêm test đọc tất cả notification không ngăn OTP/email đang queued được phát.

Giữ `Identity/Infrastructure/Email/SmtpEmailSender.cs`, `LoggingEmailSender.cs`, `EmailOptions.cs`, sửa chọn provider/guard demo khi cần. Thiếu SMTP ở production báo cấu hình không dùng log chứa OTP. Demo local có chủ đích cho phép log email để kiểm thử theo §19.2; không commit credential.

Sửa `SportHub.Administration/Infrastructure/SystemSettingProvider.cs`, `Application/Services/SystemSettingService.cs`, `Api/SystemSettingsController.cs`; validate keys/kiểu/giới hạn ở Design §4.8. `points.vnd_per_point=1000` là hằng nghiệp vụ của phiên bản, không mở cho Manager đổi tùy ý giữa các Invoice. Snapshot hold/deadline/price; đổi setting không kéo dài hold đang chạy. `MemberPackageExpiryJob.cs` giữ + kiểm nhắc hạn idempotent.

**Gate:** SMTP lỗi không rollback tiền/quyền lợi; dispatcher retry; incident rollback khi resolution chưa hợp lệ; thông báo đúng nhóm không lộ dữ liệu khác; không duplicate outbox do job lặp.

## 15. P1.12 — Báo cáo, seed, composition và cấu hình

### 15.1 Báo cáo

Sửa Payment `Application/Services/RevenueReportService.cs`, `Application/Interfaces/IRevenueReportService.cs`, `Application/DTOs/Reports/RevenueReportResponse.cs`, `RevenueReportRowResponse.cs`, `Api/RevenueReportsController.cs`; Scheduling `ClassUtilizationReportService.cs`, DTO `ClassUtilizationReportResponse.cs`, `Api/ClassUtilizationReportsController.cs`; Membership `MembershipReportService.cs`; Administration `ReportExportService.cs`, `Infrastructure/ReportPdfRenderer.cs` và DTO/route export liên quan.

- CashCollected: VND thực thu theo verified vnp_PayDate, group Sport và nguồn. Khoản duplicate/late đã thu thật và chuyển điểm phải xuất hiện trong phần cash reconciliation riêng và tổng đối soát, không bị mất vì không tạo Payment thứ hai.
- PointsRedeemed: giá trị VND = Spend points×1000; PointsIssued: số điểm từ refund/compensation, điều chỉnh Manager tách riêng; OutstandingPoints: available+held, Hold không làm nghĩa vụ biến mất. Ghi đơn vị từng field.
- Không tính Hold như Spend; không cộng invoice total vào cash khi split; không trừ điểm hoàn như hoàn tiền ngân hàng.
- Đọc lịch sử legacy tiền mặt ở cột/section LegacyCash riêng, không gọi đó là VNPay. Không sửa hoặc làm biến mất báo cáo gốc mà không ghi rõ kỳ dữ liệu.
- Class report: Capacity, Confirmed, active Holds, available seats, ThresholdStatus, fill ratio; giữ route cũ đọc chuyển tiếp chỉ nếu ghi rõ deprecated, canonical `/api/reports/class-enrollment`.
- CourtRental revenue theo external coach/sport; Membership new/active; period filter tính theo Việt Nam và UTC boundary. Export cùng filter và cùng số với màn hình.

### 15.2 Seed và host

Sửa `backend/SportHub.API/Persistence/DemoDataSeeder.cs`, `SportHubDbContext.cs`, `Program.cs`, `appsettings.json`, `appsettings.Development.json`, `SportHub.API.csproj` và các module `.csproj` khi chuyển ports. Seed idempotent: 6 role, Gym/PT/Cầu lông/Bóng rổ; rooms/types/compatibility/hours/rates, Coach specialties, ExternalCoach đủ trạng thái, Member có/không Membership, course Draft/Published/AtRisk/InProgress/Completed, wallet ledger có lịch sử và rental.

Không copy email đề xuất trong RUNBOOK như thể đã tồn tại: seeder là nguồn account demo, ghi chính xác email/password mạnh ra hướng dẫn local. Mật khẩu demo không áp production. Không seed Payment thành công bằng endpoint bị xóa; dùng pipeline mock/fixtures hợp lệ. Không thay đổi enum role ID làm hỏng user sẵn có.

Sửa `docker-compose.yml`, `.env.example`, `backend/SportHub.API/appsettings*.json`: map `VnPay__*`, `Email__*`, lựa chọn gateway, callback/public URL frontend/backend, timezone. Không đọc/in file `.env` chứa secret ra log. Mock chỉ khi Development/demo explicit; production thiếu config fail closed. `POST /api/dev/payments/{attemptId}/succeed` và fail chỉ tồn tại trong Development, kiểm actor/ownership phù hợp hoặc test key local; tuyệt đối không dùng query FE như `success=true` làm thanh toán thật.

Sửa `.github/workflows/ci.yml`: hiện backend chỉ build; bổ sung test + PostgreSQL service/DB tách biệt theo factory. Giữ CI frontend hiện hữu; plan 2 sửa contract FE để trở lại xanh. Sửa `scripts/e2e-business-rules.sh` bỏ rule gym cũ, không bỏ test chống race/quyền.

## 16. P1.13 — Kiểm thử bắt buộc và gate backend

Không tạo project nghiệp vụ mới. Dùng các project test hiện có; thêm file vào project thích hợp theo bảng. Test concurrency/invariant dùng PostgreSQL thật, mỗi case/worker có DB hoặc dataset cách ly, không dựa sleep dài; clock fake kiểm deadline.

| Project / thư mục | File thêm hoặc sửa | Nội dung |
|---|---|---|
| `SportHub.Security.Tests/Unit` | S `PasswordHasherTests.cs`, `AuthServiceLoginTests.cs`, `Fakes.cs`; T `PasswordPolicyTests.cs` | Unicode/legacy rehash/policy/dummy verify. |
| `SportHub.Security.Tests/Integration` | S `RegisterOtpTests.cs`, `GoogleLoginTests.cs`, `AccountStatusJwtTests.cs`, factory/doubles; T `PasswordResetTests.cs`, `CoachSpecialtyAuthorizationTests.cs`, `ExternalCoachApprovalTests.cs` | Full RBAC, stamp, OTP, Google regression. |
| `SportHub.Scheduling.Tests/Unit` | S `ClassRulesTests.cs`; X `SessionRulesCancellationTests.cs` sau khi test policy khóa thay; T `CourseScheduleRulesTests.cs`, `CourtRateCalculationTests.cs` | Không giữ assert 30 phút/Yoga. |
| `SportHub.Scheduling.Tests/Integration` | X `ClassDisciplineConstraintTests.cs`; S/đổi tên `ClassCancellationPolicyContractTests.cs`; T `SportCatalogTests.cs`, `OccupancyConcurrencyTests.cs`, `CoursePublishTests.cs`, `CourseAttendanceTests.cs`, `SeatHoldConcurrencyTests.cs`, `ThresholdTransferTests.cs`, `CourtRentalTests.cs`, `IncidentTests.cs` | 2 request thật đồng thời, rollback, privacy. |
| `SportHub.Scheduling.Tests/Integration` | S `GymCheckInContractTests.cs`, `GymCheckInHistoryTests.cs`, `GymCheckInConcurrencyTests.cs`, `GymCheckInRbacTests.cs`, `ManagerReportingApiTests.cs`, `SchedulingApiFactory.cs` | Giữ invariant cũ còn đúng, thêm checkout và v3 report. |
| `SportHub.Payment.Tests/Unit` | S `InvoiceBalanceTests.cs`; T `PointRefundCalculatorTests.cs`, `VnPaySignerTests.cs` | Không trả góp/discount kích hoạt; vector signer chính thức. |
| `SportHub.Payment.Tests/Integration` | S `FullPaymentAndActivationTests.cs`, `RefundWorkflowTests.cs`, `RevenueReportPeriodTests.cs`, `PaymentApiFactory.cs`; T `WalletConcurrencyTests.cs`, `CounterPointOtpTests.cs`, `SplitCheckoutTests.cs`, `PaymentCallbackIdempotencyTests.cs`, `LatePaymentReconciliationTests.cs`, `CheckoutExpiryTests.cs` | Tiền/ledger/quyền lợi atomic, fault injection, duplicate tiền thật. |
| `SportHub.Training.Tests/Integration` | S factory và test có category; T `PtOccupancyTests.cs` | Không mất quota/workout/homework/coach change. |
| `SportHub.Administration.Tests` | S `Unit/ReportPdfRendererTests.cs`; T `Integration/OutboxDispatchTests.cs`, `Integration/MultiSportMigrationTests.cs`, `Integration/ModuleBoundaryTests.cs` | Email failure, schema upgrade và cross-module port. |

Nếu project Administration.Tests hiện chỉ có unit-test dependencies, bổ sung package/factory PostgreSQL/WebApplicationFactory tương thích test project đang dùng; không đặt integration file mới rồi cho test không discover. Có thể đặt test outbox/migration ở test project hiện có đã sở hữu host factory để tránh duplicate infrastructure, ghi đường dẫn cuối vào manifest. Không cần tạo project test mới.

Lệnh dự kiến từ root, điều chỉnh connection string bằng cấu hình test chứ không DB thật:

```powershell
dotnet restore backend/SportHub.sln
dotnet build backend/SportHub.sln --configuration Release --no-restore
dotnet test backend/SportHub.sln --configuration Release --no-build
dotnet ef migrations list --project backend/SportHub.API --startup-project backend/SportHub.API
dotnet ef migrations has-pending-model-changes --project backend/SportHub.API --startup-project backend/SportHub.API
```

Chỉ chạy `database update` sau khi xác minh DB đích demo/test. Test rollback không được mô phỏng bằng việc sửa tay status rồi assert status; phải kích lỗi giữa các bước thật và kiểm DB invariant.

Gate cuối P1:

- [x] Mọi bảng/constraint mới có migration, DB trắng và upgrade đều qua.
- [x] Auth/password/role/ownership đã kiểm; tài khoản ExternalCoach không lộ Member.
- [x] Catalog, course, PT, Gym, attendance, rental đều dùng rule đúng; DB chặn trùng và overbook.
- [x] Wallet/OTP/checkout/VNPay mock/refund/late payment/transfer/expiry đủ lifecycle; return không mark paid.
- [x] Sandbox VNPay chưa có bằng chứng thực nghiệm, được loại khỏi phạm vi theo yêu cầu; mock pass không đồng nghĩa sandbox pass.
- [x] Outbox Email có dispatcher, retry/idempotency/audit; chưa xác nhận delivery SMTP bên ngoài.
- [x] Revenue không tính điểm như tiền mới, legacy và compensation trace được.
- [x] API contract cho plan 2 và JSON ví dụ lấy từ test thật đã được cập nhật.
- [x] Không có placeholder `NotImplementedException`, endpoint success giả hay test skip để “xanh”.
- [x] Source/seed runtime không còn rule Yoga/GroupX/category/booking restriction/daily limit/refund payout mới; migration lịch sử được phép giữ literal cũ.

## 17. Hồ sơ bàn giao sang plan 2

Tạo/cập nhật `docs/refactor-api-contract.md`, `docs/refactor-progress.md`, `docs/refactor-backend-evidence.md`. Ghi migration áp dụng, test đã chạy, account demo và cách tạo dữ liệu, cách chạy SMTP/log demo/mock/sandbox, error codes, file còn legacy cần FE xóa và hạn chế chưa xử lý.

Trong Design v3/SSOT/field-purpose chỉ cập nhật các quyết định kỹ thuật thực sự đã code (typed references, checkout cycle, gateway inbox, refund dùng PaymentAdjustment, transfer resolution, CourtRental.SportId). Không đánh dấu web hoàn thành, không đụng Requirements/SRS. Không tự thêm phần AI.

Prompt bàn giao có thể dùng:

> Hãy thực hiện docs/refactor-code-plan-2-frontend.md. Đọc BR v2.0 updated, hợp đồng API và evidence từ plan 1; kiểm tra lại trạng thái repository. Backend đã qua gate nào thì giữ, lỗi còn lại phải công khai. Làm từng chặng P2, mỗi chặng cập nhật refactor-progress. Không đổi rule để khớp UI cũ, không dùng demo/localStorage thay giao dịch thật, không làm tính năng AI.
