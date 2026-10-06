# Plan giao Claude Code: bỏ ExternalCoach, Member thuê sân theo giờ

> Đã có plan tổng thay thế: [Môn/dịch vụ và Member rental](CLAUDE-CODE-PLAN-SPORT-SERVICES-AND-MEMBER-RENTAL.md). Người dùng chốt làm tuần tự CAT-01 rồi CAT-02, bỏ dữ liệu cũ và tự seed sạch sau. Các phần dưới về giữ tài khoản/giao dịch legacy, cấm reset và prompt cũ không còn áp dụng. Chỉ dùng file này làm chi tiết tham khảo nghiệp vụ rental; đọc plan tổng trước khi triển khai. Rental phải dựa vào dịch vụ COURT_RENTAL được bật, không whitelist hai môn seed.

Ngày lập: 06/10/2026. Đây là kế hoạch triển khai dựa trên tài liệu và code hiện tại; chưa phải biên bản nghiệm thu. Chỉ file plan này được tạo trong lượt lập kế hoạch.

## 1. Yêu cầu thực hiện

Hãy sửa code backend, frontend, migration, seed và test để triển khai BR-140, BR-141 và luồng Member thuê sân. Không dừng ở sửa tài liệu hay đổi tên UI. Đọc hướng dẫn repository trước khi sửa, kiểm tra git diff và giữ nguyên thay đổi đang có của người dùng; đặc biệt các file Member dashboard, navigation, locales, API và tests đang được chỉnh. Không reset, checkout đè file, xóa DB hoặc sửa migration đã áp dụng.

Ưu tiên yêu cầu trực tiếp của người dùng, rồi `docs/00-Source-of-Truth.md`, Business Rules v2.0 và các tài liệu liên quan. Những giá trị ghi “giả định” dưới đây là lựa chọn triển khai cho demo, không phải giá đã tồn tại trong Business Rules.

### Nghiệp vụ đích

- Chỉ còn 5 role: SystemAdministrator, CenterManager, Receptionist, Coach, Member. Giữ Coach nội bộ và toàn bộ chức năng lớp/PT của Coach.
- Bỏ ExternalCoach, đăng ký/OTP riêng, hồ sơ chuyên môn bên ngoài, duyệt/từ chối/tạm ngưng ExternalCoach và portal riêng.
- Mọi Member có tài khoản hoạt động được thuê sân cầu lông/bóng rổ còn trống. Không yêu cầu Membership Gym, gói PT, chuyên môn hay Manager duyệt. Không mở rộng thành cho thuê phòng Gym/PT.
- Người thuê chỉ là Member, kể cả họ sử dụng sân để dạy học. Không thu thập mục đích, danh sách người đi cùng hoặc số người; không áp giới hạn 20 người và không lọc sân thuê theo số người. Capacity vẫn có thể dùng cho lớp học, không xóa toàn cục.
- Rental chỉ chiếm lịch sân/phòng, không chiếm lịch Coach. Lớp và PT tiếp tục kiểm lịch Coach như hiện tại.
- Dùng checkout, invoice, ví điểm, VNPay, refund và incident hiện có. Không viết hệ thanh toán mới.

### Giá và thời lượng chốt cho demo

| Môn | Đơn giá giả định | 1 giờ | 2 giờ | 3 giờ | 4 giờ |
|---|---:|---:|---:|---:|---:|
| Cầu lông | 100.000 VND/giờ | 100.000 | 200.000 | 300.000 | 400.000 |
| Bóng rổ | 200.000 VND/giờ | 200.000 | 400.000 | 600.000 | 800.000 |

- Seed `CourtRate.PricePerHour` với cùng giá cho mọi ngày/giờ mở cửa của từng loại sân. Giá là cấu hình DB, không hardcode vào component hoặc service tính tiền; Manager có thể sửa qua chức năng giá hiện có.
- `rental.slot_minutes = 60`, `rental.max_hours = 4`, `rental.advance_days = 30`, `rental.cancel_free_hours = 24` theo tài liệu hiện hành. Backend và UI thống nhất chỉ nhận 1, 2, 3 hoặc 4 giờ nguyên, bắt đầu đúng giờ; từ chối 30/90 phút, giờ quá khứ và khoảng ngoài giờ mở cửa.
- Công thức với giá seed cố định: `durationHours = (endUtc - startUtc).TotalHours`; `totalPrice = pricePerHour × durationHours`, dùng decimal VND ở backend. FE chỉ hiển thị báo giá server.
- Tái sử dụng calculator chia block giờ hiện có. Nếu Manager cấu hình nhiều khung giá trong tương lai, tổng là tổng giá các block; UI hiển thị breakdown đúng, không dùng đơn giá giờ đầu nhân cho toàn khoảng có nhiều giá.
- Snapshot giá lúc checkout; sửa catalog sau đó không đổi số tiền rental/invoice đã tạo. Thiếu bảng giá thì trả lỗi rõ ràng, không fallback sang giá hardcode hoặc 0 đồng.
- Thời gian lưu UTC, hiển thị giờ Việt Nam UTC+7; khoảng lịch `[start, end)` cho phép hai booking nối tiếp.

### Lịch lớp seed BR-141

| Lớp | Ngày trong tuần | Giờ địa phương |
|---|---|---|
| Bóng rổ 01 | Thứ 2, 4, 6 | 07:00–09:00 |
| Bóng rổ 02 | Thứ 3, 5, 7 | 14:00–16:00 |
| Cầu lông 01 | Thứ 2, 4, 6 | 07:00–09:00 |
| Cầu lông 02 | Thứ 3, 5, 7 | 14:00–16:00 |

Hai môn dùng sân tương thích riêng và Coach nội bộ phù hợp. Sinh ClassSession và occupancy thật cho thời hạn khóa; không chỉ dựng lịch minh họa trên FE. Dùng số buổi/thời hạn khóa hợp lệ từ cấu hình hiện có, ghi rõ lựa chọn demo khi triển khai. Không khóa lịch vô hạn ngoài thời hạn khóa. Các khung còn trống được thuê nếu thỏa giờ mở cửa, bảng giá và không có block/lớp/PT khác. Manager vẫn thêm lớp/sân được.

## 2. Điểm đã xác minh trong code cần sửa

| Khu vực | Evidence / file trọng tâm |
|---|---|
| Identity/RBAC | `backend/SportHub.Identity/Domain/Enums/UserRole.cs`, `Infrastructure/Persistence/Configurations/RoleConfiguration.cs`, `backend/SportHub.BuildingBlocks/Api/SportHubRoleNames.cs`, `SportHubPolicies.cs`, `backend/SportHub.API/Extensions/AuthorizationPolicyExtensions.cs` còn ExternalCoach |
| Hồ sơ/OTP/API | `SportHub.Identity/Api/ExternalCoachesController.cs`, `Application/Services/ExternalCoachService.cs`, `EmailOtpFlow.cs`, `Domain/Entities/ExternalCoachProfile.cs`, các DTO/interface và DI liên quan |
| Rental core | `SportHub.Scheduling/Rental/Application/CourtRentalService.cs` đang bắt role ExternalCoach, approval Approved, specialty và capacity theo ExpectedAttendees; reserve/reacquire đang truyền ExternalCoachId làm CoachId |
| Entity/contract | `SportHub.Scheduling/Rental/Domain/CourtRental.cs`, `Rental/Infrastructure/CourtRentalConfiguration.cs`, `SportHub.BuildingBlocks/Abstractions/Scheduling/ICourtRentalFulfillment.cs` còn ExternalCoachId/ExpectedAttendees |
| Giá | `SportHub.Scheduling/Catalog/Domain/CourtRateCalculator.cs` và CourtRate hiện có; tái sử dụng thay vì viết calculator khác |
| Checkout/finance | `SportHub.Payment/Api/CheckoutsController.cs` authorize ExternalCoach; rà CheckoutService, InvoicesController, PointRefundsController và các wallet services |
| Báo cáo/lịch | CourtRentalOperationsService, CourtScheduleService, IncidentService, RevenueDimensionReader, RevenueReportService, RevenueDimensionFilter, ReportExportService và report DTOs |
| Persistence/seed | `SportHub.API/Persistence/SportHubDbContext.cs`, CrossModuleRelationships, DemoDataSeeder, EF model snapshot và migrations |
| FE | `frontend/src/lib/auth.tsx`, permissions/types, `app/external-coach/**`, `app/register-external-coach`, `app/manager/external-coaches`, `features/rentals/**`, payments, reports, court-schedule, navigation và locales |
| Test | `SportHub.Payment.Tests/Integration/CourtRentalTests.cs`, Security.Tests ExternalCoachApprovalTests/RolesAndPoliciesTests/PasswordResetTests, Scheduling.Tests occupancy và FE external-coach/refactor-operations/auth-english-only tests |

Các đường dẫn backend rút gọn trong bảng được tính từ `backend/`. Bảng này là điểm bắt đầu; phải tìm mọi consumer, không chỉ sửa các file được liệt kê.

## 3. Trình tự triển khai

### Bước 1 — Chốt contract và phạm vi dữ liệu

1. Đọc docs hiện hành và rà `ExternalCoach`, `external-coach`, `external_coach`, `EXTERNAL_COACH`, `ExpectedAttendees`, `expectedAttendees`, `expected_attendees` trong runtime, test, seed, migration và tài liệu.
2. Dùng `MemberId` làm owner rental trong domain/internal contracts; ID lấy từ user đã xác thực, không cho client gửi owner tùy ý.
3. Request checkout: `POST /api/checkouts/court-rental`, Member, header `Idempotency-Key`, body `{ sportId, roomId, startUtc, endUtc }`. Không nhận số người hoặc giá client làm nguồn tính tiền.
4. Giữ các API policy/availability/mine/detail/cancel ở `/api/court-rentals/**`, đổi quyền sang Member và kiểm ownership. Staff vẫn dùng endpoint/phân quyền riêng hiện có. Availability của Member không lộ thông tin người thuê, lớp hay Coach của slot bận.
5. Giữ cấu trúc quote hiện có `totalPrice` và `blocks` nếu đủ dùng; đồng bộ API, type FE và tài liệu khi thay field. Không đổi tên `TotalPrice` sang `TotalAmount` chỉ để giống bảng mô tả.

### Bước 2 — Migration có bảo toàn lịch sử

1. Tạo migration mới: chuyển tài khoản ExternalCoach cũ sang role Member, giữ nguyên UserId, trạng thái khóa/hoạt động, credential, hóa đơn, payment, ví, ledger và rental. Tạo MemberProfile còn thiếu theo invariant đăng ký Member hiện có; không tạo tài khoản mới hoặc cấp Membership miễn phí.
2. Role enum hiện có dùng số 0–4 cho 5 role giữ lại; ExternalCoach là 5, trong khi role row seed cũ có RoleId=6. Không nhầm enum value với khóa role và không renumber các giá trị còn lại.
3. Rename `external_coach_id` thành `member_id` bằng thao tác giữ dữ liệu; cập nhật FK/index/query. Bỏ field/constraint ExpectedAttendees đúng phạm vi rental.
4. Chỉ xóa coach occupancy có SourceType/SourceId thuộc CourtRental. Giữ room occupancy của các rental hợp lệ; không chạm coach occupancy của lớp/PT.
5. Loại role/profile/quan hệ ExternalCoach sau khi chuyển mọi tham chiếu. Giữ dữ liệu audit/tài chính; rà outbox, notification event và export job đã serialize contract cũ để có cách đọc/hoàn tất an toàn. Enum lưu DB không được shift số; lịch sử migration có thể tiếp tục chứa tên cũ.
6. Vô hiệu session/refresh token cũ theo cơ chế dự án và bảo đảm JWT ExternalCoach cũ không tiếp tục được cấp quyền nghiệp vụ; đăng nhập lại nhận Member. Không vô hiệu toàn bộ user khác nếu không cần.
7. Xác định rollback: việc bỏ profile/field là mất metadata cũ; không viết Down giả vờ khôi phục dữ liệu. Ghi nhu cầu backup/restore khi triển khai, kiểm migration trên DB test có dữ liệu cũ; không tự áp dụng vào DB thật.

### Bước 3 — Identity, rental, payment và báo cáo

1. Gỡ registration/OTP/review/profile ExternalCoach, DI, policy và role mapping liên quan; yêu cầu gán role cũ phải bị từ chối. Giữ chức năng Coach nội bộ và chuyên môn cần cho lớp/PT.
2. Rental kiểm Member tồn tại và hoạt động, sân/môn cho phép thuê, khung giờ, giá và occupancy. Bỏ approval/specialty/attendee/capacity gate chỉ trong luồng thuê sân.
3. Cả reserve, retry và reacquire sau payment muộn chỉ truyền room, không truyền MemberId vào trường CoachId. Giữ transaction và cơ chế chống double booking ở DB; availability UI không đủ để xác nhận đặt sân.
4. Checkout sử dụng Member làm beneficiary/owner; cập nhật wallet, invoice, refund, notification, incident, report/export, lịch staff và link liên quan. Không đổi ownership của giao dịch lịch sử.
5. Giữ idempotency và snapshot khi retry/callback. Return URL không tự xác nhận thanh toán. Callback muộn phải theo cơ chế reacquire/compensation hiện có, không âm thầm cấp sân đã có người đặt.
6. Hủy >=24 giờ trước bắt đầu hoàn 100% bằng điểm, <24 giờ hoàn 0; lỗi trung tâm theo rule hiện hành. Hủy/hết hạn giải phóng room occupancy đúng một lần; chống hoàn điểm hai lần.
7. Code hiện có status `PendingPayment, Confirmed, Cancelled, Completed`, khác tên trạng thái trong docs. Chọn mapping API có giải thích hoặc thêm enum bằng giá trị mới và migration/backfill phù hợp; không reorder hoặc suy đoán nguyên nhân hủy lịch sử khi thiếu dữ liệu.

### Bước 4 — Seed giá và lớp

1. Cập nhật DemoDataSeeder và nguồn seed setting/catalog tương ứng: 60 phút, giá giả định trong bảng, đủ sân và giờ mở cửa cho cả hai môn.
2. Seed đủ bốn lớp BR-141, ClassScheduleRule, ClassSession và room/coach occupancy qua luồng hợp lệ. Tránh để các lớp demo cũ chiếm trùng sân hoặc trùng Coach.
3. Seed chạy lại không nhân bản; không chỉ thêm vào nhánh DB trắng rồi bỏ qua DB demo đã seed. Có cách nâng cấp dữ liệu demo xác định rõ, không overwrite giá/lớp người dùng đã sửa hoặc xóa booking thật để nhường lịch seed. Khi có xung đột dữ liệu hiện hữu, báo chi tiết và giữ dữ liệu đó.

### Bước 5 — Frontend Member

1. Tích hợp vào MemberShell/navigation hiện có: `/member/courts/book`, `/member/rentals`, `/member/rentals/[id]` theo K19–K23. Giữ thiết kế và thay đổi Member dashboard đang làm; không redesign toàn bộ ứng dụng.
2. Form chọn môn, sân, ngày, giờ bắt đầu và số giờ 1–4; tính endUtc từ lựa chọn. Hiển thị giá/giờ, thời lượng, tổng VND và breakdown từ server. Đổi đầu vào thì bỏ quote cũ và tải lại, tránh submit giá stale.
3. Xóa số người, approval gate, hồ sơ/chuyên môn ExternalCoach và thông điệp tương ứng trong EN/VI. Không yêu cầu gym membership khi Member vào trang thuê sân.
4. Dùng shared checkout `/checkout/[invoiceId]`, finance `/member/finance?tab=wallet|invoices`, chi tiết `/member/invoices/[id]`. Bổ sung danh sách/chi tiết, trạng thái pending, hủy, liên kết invoice và đặt lại sau incident bằng checkout mới.
5. Xóa portal, đăng ký và trang Manager duyệt ExternalCoach khỏi navigation/runtime. Route rental cũ có thể redirect sang route Member để giữ bookmark/notification, vẫn bắt auth/ownership; không để portal cũ tiếp tục hoạt động. Route đăng ký/duyệt đã bỏ phải có hành vi nhất quán.
6. Cập nhật lịch staff, report filter/columns, types, permissions, public/account/notification links. Không chỉ xóa chuỗi chữ và bỏ sót consumer hoặc query key cũ.

### Bước 6 — Test và nghiệm thu

Các case bắt buộc:

- Member active chưa mua Membership Gym vẫn quote, đặt và thanh toán được; Member bị khóa và Guest bị từ chối. Member A không đọc/hủy rental hoặc invoice của B.
- Không còn role ExternalCoach được đăng ký/gán; JWT cũ không đặt được. Coach nội bộ vẫn hoạt động đúng quyền.
- Bảng giá cho đủ 1–4 giờ đúng bảng demo; request 30/90 phút, 0/5 giờ, ngoài giờ mở cửa và quá 30 ngày bị chặn. Thiếu rate hoặc quote thay đổi được xử lý rõ ràng. Sửa rate không đổi snapshot cũ.
- Không có input số người, không lọc sân vì capacity rental. Không có coach occupancy mới cho rental, kể cả retry/reacquire.
- Hai Member đặt đồng thời cùng sân/giờ chỉ một người giữ được. Hai sân khác nhau cùng giờ không bị conflict Coach do rental. Booking nối tiếp được phép.
- Bốn lớp seed chiếm đúng sân/giờ UTC+7: slot giao lớp bị chặn, slot liền sau lớp được thuê nếu còn trống. Block bảo trì và lớp thêm bởi Manager cũng chặn rental.
- Hủy ở đúng mốc 24 giờ và dưới mốc, hết hạn hold, callback lặp/muộn, sự cố trung tâm: trạng thái, occupancy, invoice và hoàn điểm đúng, không nhân đôi.
- Migration DB trắng và DB cũ có ExternalCoach/rental/ví/invoice/pending checkout: giữ ID, số dư, chứng từ và ownership; seed chạy lại không trùng.
- FE E2E: chọn 2 giờ cầu lông thấy 200.000 VND, checkout, danh sách/chi tiết, hủy; 3 giờ bóng rổ thấy 600.000 VND. Kiểm đổi giờ/môn cập nhật quote và Member navigation/finance không hỏng.

Chạy `dotnet build backend/SportHub.sln`, các test Security/Scheduling/Payment/Administration bị ảnh hưởng và hồi quy Training nếu chạm occupancy dùng chung. Integration test phải dùng PostgreSQL theo harness hiện có để kiểm transaction/exclusion constraint. Trong `frontend` chạy `npm run typecheck`, `npm run lint`, `npm run check:i18n`, `npm run build` và các Playwright test bị ảnh hưởng. Đọc cấu hình test thực tế trước khi chạy; báo riêng lỗi baseline, thiếu môi trường và test chưa chạy, không tuyên bố pass nếu chỉ sửa mock.

## 4. Đồng bộ tài liệu và bàn giao

- Cập nhật CAT-02 theo evidence sau khi code/test hoàn thành; ghi rõ còn phần nào chưa nghiệm thu.
- Rà docs còn mâu thuẫn: `entity-field-purpose.md` có đoạn PT nói coach occupancy gồm thuê sân; file Khôi còn nhắc K24 ở vài chỗ dù portal đã bỏ. Đồng bộ contract/status/tên field theo quyết định thực tế.
- Khi implementation thay đổi, cập nhật `system-architecture-analysis.md` để mô tả code mới. Không tự mở rộng sang sửa toàn bộ SRS Word hoặc các gap Gym/PT/AI không thuộc task.
- Kết thúc bằng: file/module đã đổi, migration và cách thử trên DB test, giá seed/lịch seed, test đã chạy và kết quả, giới hạn còn lại. Rà diff bảo đảm không mất thay đổi người dùng.
- Kết quả đạt yêu cầu khi Member thuê sân end-to-end theo giờ, role/portal ExternalCoach không còn trong runtime, lịch lớp chặn sân đúng, dữ liệu cũ được giữ và payment không hồi quy. Tên cũ chỉ còn ở migration/lịch sử hoặc compatibility adapter có giải thích.

## 5. Prompt ngắn để giao Claude Code

> Đọc và thực hiện `docs/CLAUDE-CODE-PLAN-MEMBER-COURT-RENTAL.md`. Tôi đã bỏ role ExternalCoach trong nghiệp vụ; hãy sửa code end-to-end để mọi Member active thuê sân theo giờ, không cần Membership Gym hay duyệt Coach. Seed giá giả định cầu lông 100.000đ/giờ, bóng rổ 200.000đ/giờ, tổng = đơn giá × số giờ, 1–4 giờ; seed lịch lớp BR-141. Giữ shared checkout, snapshot, occupancy và lịch sử tài chính. Rà git diff trước, giữ các thay đổi đang có; tạo migration mới, không reset DB, không sửa migration cũ. Triển khai backend, frontend, seed và test theo thứ tự trong plan; cuối cùng báo evidence, các lệnh đã chạy và phần chưa kiểm chứng.
