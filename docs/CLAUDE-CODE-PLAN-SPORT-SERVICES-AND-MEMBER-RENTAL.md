# Plan tổng: mở rộng môn/dịch vụ và chuyển thuê sân sang Member

## Trạng thái và quyết định tổ chức

Đây là plan triển khai, chưa sửa code hoặc xóa dữ liệu. Người dùng đã chốt:

1. Một Claude Code triển khai tuần tự theo các cổng nghiệm thu bên dưới.
2. Môn mới dùng khóa học nhóm và/hoặc thuê sân. Membership và PT vẫn thuộc Gym trong phạm vi hiện tại.
3. Xóa toàn bộ dữ liệu cũ của hệ thống để dùng DB sạch. Chuyển chức năng ExternalCoach sang Member trong code; không cần chuyển tài khoản/giao dịch cũ. Người dùng sẽ seed dữ liệu sạch sau đó.

Claude Code chuẩn bị schema, seed và quy trình reset có thể chạy được. Trước khi thực thi reset, xác định chính xác server/database của dự án từ cấu hình môi trường mà không lộ credential; không suy tên DB, không xóa database khác hoặc dữ liệu ngoài hệ thống. Nếu không xác định được DB mục tiêu, hỏi đúng thông tin còn thiếu. Không tự chạy seed demo trên DB người dùng vì người dùng muốn seed sau; vẫn chạy seed trong DB test riêng để kiểm chứng.

**Thứ tự khuyên dùng:** chốt contract → nền tảng môn/dịch vụ + migration Gym/PT (CAT-01) → bỏ ExternalCoach/chuyển rental sang Member (CAT-02) → seed lịch/giá → kiểm thử tích hợp. Không cần hoàn thiện mọi màn hình quản lý môn trước khi bắt đầu rental, nhưng schema/API/capability của môn phải ổn định và hồi quy Gym/PT phải đạt trước.

Plan này là nguồn triển khai chính, thay thế phần migration giữ dữ liệu và cấm reset trong `CLAUDE-CODE-PLAN-MEMBER-COURT-RENTAL.md`. Chỉ tham khảo plan cũ về nghiệp vụ rental, thanh toán, quyền, UI và test; không làm nhánh nâng cấp/bảo toàn dữ liệu legacy. Rental hỗ trợ mọi môn bật dịch vụ tương ứng, không giới hạn vĩnh viễn hai tên môn cầu lông/bóng rổ.

## 1. Kết quả cần đạt

- Catalog có ba môn hoạt động được seed sẵn: Gym, Cầu lông, Bóng rổ. PT là dịch vụ của Gym, không là môn thứ tư trên UI/API công khai.
- Ba môn seed sử dụng cùng model, validation và luồng nghiệp vụ như môn Manager thêm sau này.
- Một môn có nhiều dịch vụ. Gym: Membership + PT; Cầu lông/Bóng rổ: khóa học nhóm + thuê sân.
- Manager thêm Tennis có lớp và thuê sân, hoặc Yoga có lớp, bằng cấu hình; không sửa code, không thêm nhánh theo tên hay ID môn.
- Không hứa hỗ trợ mô hình chưa có như vé bơi theo lượt, đặt chỗ Gym theo slot, hoa hồng Coach, PT đa môn. Đây là phạm vi bổ sung khi có yêu cầu riêng.
- Member active thuê sân nếu môn có dịch vụ COURT_RENTAL đang bật, sân tương thích và còn trống. Không cần Membership Gym, chuyên môn hoặc duyệt HLV ngoài.
- Sau reset, giao dịch phát sinh mới phải giữ lịch sử tài chính, snapshot và quyền lợi đúng; Coach nội bộ, PT, lớp và occupancy vẫn hoạt động. Không xây logic bảo toàn giao dịch trước reset.

## 2. Các điểm code hiện tại ảnh hưởng đến thứ tự

- `Sport` chỉ có một `OperationType`; `SportConfiguration` seed Gym=1, Personal Training=2, Cầu lông=3, Bóng rổ=4. Đây là evidence code hiện tại, không phải các ID để hardcode nghiệp vụ mới.
- `SportCatalogService` không cho đổi OperationType; constraint DB dựa vào GroupCourse=2 để yêu cầu default duration/capacity.
- `CoachSpecialtyReader.IsPersonalTrainerAsync`, `PtRoomValidator`, `PtPurchaseFulfillment` và `RevenueDimensionReader` đang dựa vào OneOnOne.
- FE catalog, chọn môn lớp, membership, training và PT cũng lọc theo operationType.
- Rental hiện nhận ExternalCoach, kiểm approval/specialty/số người và reserve cả room + coach.
- `RevenueDimensionReader`, IdentityPortReaders, DemoDataSeeder, các shared contracts, DbContext/model snapshot, locales/types và tests bị cả CAT-01/CAT-02 tác động. Không để hai luồng tự sửa độc lập các file này.

## 3. Cổng A — Chốt schema và contract trước khi sửa consumer

> Tiến độ 07/10/2026: bản đề xuất Cổng A nằm ở [CAT-01-GATE-A-SPORT-SERVICES-CONTRACT.md](CAT-01-GATE-A-SPORT-SERVICES-CONTRACT.md), chờ duyệt. Chưa sửa code.

### 3.1 Môn và dịch vụ

Thiết kế đích đề xuất:

```text
Sport
  SportId, Code, Name, Description, ImageUrl, SortOrder, IsActive

SportServiceOffering
  SportServiceOfferingId, SportId, ServiceType, IsEnabled
  UNIQUE(SportId, ServiceType)

ServiceType
  MEMBERSHIP_ACCESS | GROUP_COURSE | COURT_RENTAL | PERSONAL_TRAINING
```

- `Code` ổn định, duy nhất, dùng định danh catalog/seed; không dùng if/else theo mã để chọn thuật toán nghiệp vụ. Chuẩn hóa/validate mã cho cả seed và môn Manager thêm; không cần backfill môn tùy chỉnh đã bỏ cùng dữ liệu cũ.
- `Sport.IsActive` là trạng thái môn; `IsEnabled` điều khiển từng dịch vụ. Chưa cần thêm Draft/Deleted hoặc hệ plugin động.
- Thời lượng/sĩ số mặc định lớp là cấu hình GROUP_COURSE. Có thể dùng bảng cấu hình typed riêng hoặc field có validation theo service; không biến thành một JSON tùy ý chứa toàn bộ nghiệp vụ.
- Không đặt một BasePrice/PricingType/SlotDuration dùng chung cho môn. Giá thuộc CourtRate, Class, MembershipPackage và cấu hình PT tương ứng.
- Rental dùng block 60 phút, PT 90 phút, lớp có thời lượng riêng. Sửa default lớp chỉ ảnh hưởng lớp mới, không rewrite ClassSession hiện có.
- Capability rental xác định môn đủ điều kiện cho thuê; Room/SportRoomType xác định sân tương thích. Gym seed không bật rental.
- Ràng buộc Membership/PT chỉ Gym bằng cấu hình liên kết domain Gym có kiểm soát ở backend, không chỉ ẩn checkbox hoặc dò tên "Gym". Có thể dùng system setting/reference được seed và validate; Manager không được bật PT/Membership cho môn khác trong phạm vi này.

### 3.2 Không mất thông tin chuyên môn và phòng PT

Trong schema và seed sạch, xác định rõ:

- Coach chỉ có chuyên môn Gym không tự động nhận quyền PT. Seed Coach PT với qualification rõ ràng.
- Giữ UserSportSpecialty để biểu diễn môn và thêm/điều chỉnh quan hệ chuyên môn theo dịch vụ nếu cần, ví dụ CoachServiceQualification → SportServiceOffering. Không cần backfill dữ liệu cũ đã bỏ.
- Phòng Gym và phòng PT vẫn có thể là hai RoomType khác nhau sau khi cùng liên kết môn Gym. PT room validation phải nhận biết phòng được phép cho PERSONAL_TRAINING; bổ sung liên kết service–room type nếu quan hệ SportRoomType không đủ phân biệt.
- Không cho mọi phòng Gym tự trở thành phòng PT chỉ vì cùng SportId. Giữ PT không có phòng nếu rule hiện tại cho phép.

### 3.3 API và lifecycle

- Giữ các route quản lý/công khai `/api/manager/sports`, `/api/sports`; request/response chuyển từ một operationType sang danh sách service cấu hình có typed defaults. Chốt JSON cụ thể trong `api-contract.md` trước khi BE/FE sửa consumer.
- Catalog reader nội bộ hỗ trợ truy vấn service, tình trạng môn và tương thích tài nguyên; giữ ranh giới module qua abstraction hiện có.
- OperationType legacy chỉ dùng tạm trong migration/adapter; không duy trì hai nguồn sự thật hoặc chọn service đầu tiên để giả lập một operationType cho môn nhiều dịch vụ.
- Tắt môn/dịch vụ: chặn giao dịch/đăng ký mới. Không tự hủy, xóa hoặc sửa giá quyền lợi đã mua. Các luồng phục vụ booking đang tồn tại cần tiếp tục đọc được catalog dù inactive.
- Chốt xử lý pending checkout/callback muộn khi tắt dịch vụ: không bỏ qua khoản tiền đã nhận; tiếp tục fulfillment hợp lệ hoặc compensation theo cơ chế payment. Kiểm rule này ở service, không chỉ UI.
- Xóa/đổi quan hệ phòng hoặc chuyên môn đang được lịch tương lai sử dụng phải validate tác động. Không đánh đồng ngừng bán mới với hủy lịch hiện hữu.

**Điều kiện qua cổng A:** schema, DTO, bảng seed mapping, cách giữ quyền PT/phòng PT, hành vi deactivate và owner các file chung được ghi rõ. Không bắt đầu hai nhánh sửa consumer khi các quyết định này còn khác nhau.

## 4. Cổng B — Triển khai CAT-01 và kiểm hồi quy Gym/PT

### Schema, DB sạch và backend

1. Tạo schema dịch vụ/cấu hình. Không bật rental tự động cho mọi GROUP_COURSE; mỗi môn phải được cấu hình rõ dịch vụ.
2. Chuẩn bị seed ba môn đích và các quan hệ specialty, room/service compatibility, giá. Không seed môn Personal Training riêng hoặc account ExternalCoach.
3. Giữ lịch sử migration đã commit; thêm migration mới đưa schema về model đích. Chạy đầy đủ chuỗi trên DB trắng và kiểm kết quả cuối không còn role/profile ExternalCoach hoặc môn PT riêng. Nếu migration cũ chứa reference seed bốn môn, migration mới phải xử lý dữ liệu reference đó đúng thứ tự FK; đây là làm sạch seed kỹ thuật trong chuỗi tạo DB, không phải dự án bảo toàn giao dịch cũ.
4. Tách rõ reference/config seed cần cho hệ thống và demo seed người dùng chạy sau. Reset không để lại outbox/job/payment/refresh token cũ; dọn state cache/session của riêng ứng dụng nếu có để dữ liệu cũ không quay lại.
5. Cập nhật catalog, class validation/publish, specialty, phòng PT, PT fulfillment/pricing, membership consumer, report và shared abstractions. Bỏ phụ thuộc OneOnOne/GroupCourse cho quyết định nghiệp vụ mới, thay bằng service thích hợp.
6. Viết lệnh/script reset xác định đúng DB mục tiêu, tạo schema và lệnh seed riêng; không dùng xóa volume hoặc thư mục diện rộng. Kiểm chứng trên DB test riêng. Bàn giao thứ tự chạy và điều kiện môi trường; chưa tự seed demo vào DB người dùng.

### Frontend quản lý và public

- Form thông tin môn + chọn nhiều dịch vụ + cấu hình riêng cho dịch vụ; không chọn một Category duy nhất.
- Có thể tạo môn chưa đủ sân/giá; UI cho biết phần còn thiếu, backend không cho bán/publish/quote cho tới khi cấu hình hợp lệ. Không tự dùng giá 0 hoặc phòng mặc định giả.
- Môn có GROUP_COURSE xuất hiện ở quản lý lớp; môn có COURT_RENTAL xuất hiện ở chọn sân. Chỉ những offering đang cho bán mới xuất hiện ở luồng mua mới.
- Public list/detail, menu và filter lấy dữ liệu catalog. Không hardcode danh sách chỉ gồm ba môn seed.
- Membership và PT hiển thị dưới Gym; giữ Coach đủ chuyên môn, quota, thời hạn và room validation đúng.
- Giữ giao diện/design tokens và thay đổi người dùng đang có; không redesign toàn bộ app.

**Điều kiện qua cổng B:** Gym Membership/PT và lớp chạy đúng với dữ liệu test sạch; Manager tạo được môn GROUP_COURSE mới; catalog API/FE dùng service nhất quán. Khi đó tiếp tục phần rental và kiểm chuỗi migration đầy đủ.

## 5. Cổng C — CAT-02: ExternalCoach thành Member

> Tiến độ 07/10/2026: code Cổng C đã làm (backend, migration `RemoveExternalCoachMemberRental`, frontend, test). Chuỗi migration đã chạy trên DB trắng và trên DB dev. Test tích hợp backend chưa chạy được (cần Docker). Script reset dữ liệu dev: `backend/scripts/reset-dev-data.sql` (chưa chạy trên DB thật).

Thực hiện chi tiết trong `CLAUDE-CODE-PLAN-MEMBER-COURT-RENTAL.md` trên nền catalog mới, với các điểm bắt buộc:

- Thay role/ownership rental trong code bằng Member. Dữ liệu ExternalCoach cũ bỏ cùng reset; không cần chuyển account, ví hoặc invoice cũ. Token/session cũ không được tiếp tục dùng sau reset.
- Rename owner rental thành MemberId; bỏ ExpectedAttendees khỏi DB, API, UI và validation rental. Giữ capacity của lớp/phòng nơi còn cần.
- Bỏ đăng ký/OTP/profile/approval/portal ExternalCoach, giữ Coach nội bộ.
- Chỉ room occupancy cho rental ở reserve/retry/reacquire. Seed sạch không sinh coach occupancy cho rental; lớp/PT vẫn có coach occupancy.
- Quote/checkout server kiểm Member active + service COURT_RENTAL + sân tương thích + giờ mở cửa + rate + room occupancy. Không whitelist tên/ID cầu lông/bóng rổ.
- Đồng bộ invoice/wallet/refund/incident/report/export/notification. Giữ idempotency, snapshot, compensation payment muộn và ownership.
- Member routes `/member/courts/book`, `/member/rentals`, `/member/rentals/[id]`, shared checkout và finance hiện có.

**Điều kiện qua cổng C:** rental end-to-end hoạt động cho Member, không cần Gym membership; không còn runtime ExternalCoach; schema sạch đúng và thử được rental của một môn mới do Manager tạo.

## 6. Cổng D — Seed demo trên nền chung

> Tiến độ 07/10/2026: đã làm. Lệnh seed riêng: `dotnet run --project backend/SportHub.API -- --seed-br141` (mã nguồn `Br141DemoSeeder.cs`, cần `ASPNETCORE_ENVIRONMENT=Development`). Lệnh tạo bốn lớp BR-141 qua `ClassService` (Create rồi Publish), sân riêng mỗi môn, Coach demo nếu chưa có, bảng giá 100.000 và 200.000 đồng/giờ, và nâng thời lượng lớp mặc định Cầu lông từ 90 lên 120 phút khi môn chưa có lớp nào. Idempotent. Đã chạy trên DB dev ngày 07/10/2026 và kiểm tra lịch thực tế (giờ Việt Nam, 120 phút, không trùng occupancy). Chưa có test tự động cho seeder.

| Môn seed | Dịch vụ | Giá rental giả định |
|---|---|---:|
| Gym | Membership, PT | Không bật thuê sân |
| Cầu lông | Khóa học nhóm, thuê sân | 100.000 VND/giờ |
| Bóng rổ | Khóa học nhóm, thuê sân | 200.000 VND/giờ |

- Tổng rental = giá/giờ × số giờ 1–4 với giá seed đồng nhất; backend dùng calculator/snapshot hiện có. Giá được cấu hình qua CourtRate, Manager sửa được.
- Seed BR-141: Bóng rổ 01 và Cầu lông 01 Thứ 2/4/6 07:00–09:00; Bóng rổ 02 và Cầu lông 02 Thứ 3/5/7 14:00–16:00, giờ Việt Nam, sân riêng đúng môn.
- Lưu ý seed hiện tại Cầu lông default 90 phút: lớp demo BR-141 phải thực sự có buổi 120 phút. Đặt cấu hình lớp/seed đúng mà không đổi buổi lịch sử từ 90 thành 120 phút.
- Sinh ClassSession và occupancy thật trong thời hạn khóa; khung còn trống cho thuê. Không chặn các khung seed bằng nhánh hardcode trong availability.
- Seed idempotent; chạy lại không nhân bản hoặc overwrite cấu hình Manager, không xóa booking để nhường lịch demo. Seed là lệnh riêng để người dùng chạy khi sẵn sàng.
- Seed dùng cùng invariant/service logic với quản lý dữ liệu; không bắt buộc gọi HTTP API từ migration nhưng phải có test chứng minh kết quả tương đương.

## 7. Kiểm thử nghiệm thu toàn bộ

1. DB trắng: ba môn sản phẩm đúng dịch vụ, PT không xuất hiện thành môn thứ tư.
2. Reset DB test → áp dụng toàn bộ migration → seed: không còn user/giao dịch/session/outbox cũ, không có role ExternalCoach hoặc môn PT riêng; chạy seed lần hai không nhân bản. Kiểm riêng schema trước demo seed.
3. Coach Gym không có qualification PT không được cấp quyền PT; Coach PT được seed đúng vẫn hoạt động. Phòng Gym không được vô tình dùng làm phòng PT.
4. Manager tạo Tennis bằng UI, bật GROUP_COURSE + COURT_RENTAL, gán sân, giá và giờ mở cửa; tạo/publish lớp, Member thuê khoảng trống, thanh toán và report đúng mà không sửa code.
5. Manager tạo Yoga chỉ GROUP_COURSE: tạo lớp được, không xuất hiện trong chọn sân và request rental trực tiếp bị từ chối. Gán PT/Membership cho môn khác bị backend chặn theo phạm vi.
6. Đổi tên/default/giá không sửa lịch, quyền lợi và snapshot cũ. Tắt một service không tự tắt service khác hoặc làm mất dữ liệu đã mua.
7. Member không có Gym membership vẫn thuê sân; A không xem/hủy của B; input owner/giá client không chi phối checkout.
8. Giá 1–4 giờ đúng, request sai duration bị chặn; lớp/block chặn sân; booking nối tiếp được; hai request đồng thời cùng sân chỉ một giữ được; rental không chiếm Coach.
9. Hủy sát ngưỡng 24h, hết hạn, callback lặp/muộn, incident và refund không thu/cấp/hoàn trùng.
10. FE public/Manager/Member/Coach/Receptionist và report không còn lọc bằng operationType cũ, hardcode ba môn hoặc portal ExternalCoach, trừ adapter legacy được giải thích.

Chạy build backend, test Security/Scheduling/Training/Membership nếu có/Payment/Administration theo tác động; dùng PostgreSQL thật của test harness cho constraint/concurrency/migration. FE chạy typecheck, lint, check:i18n, build và Playwright luồng ảnh hưởng. Báo rõ test chưa chạy vì môi trường; không gọi mock-only là nghiệm thu end-to-end.

## 8. Tổ chức thực hiện đã chọn

Một Claude Code làm tuần tự A → B → C → D → nghiệm thu. Không chia hai agent cùng sửa schema, rental, seed hoặc migrations. Mỗi giai đoạn có diff và kết quả test rõ ràng; không dừng lại xin duyệt từng bước kỹ thuật đã nằm trong phạm vi. Nếu gặp thiếu thông tin DB để reset, tiếp tục hoàn thiện code/test trên DB test rồi hỏi đúng thông tin mục tiêu còn thiếu.

## 9. Bàn giao và prompt

Giữ mọi thay đổi code/tài liệu người dùng hiện có; đọc git diff và hướng dẫn repo trước khi sửa. Quyết định xóa dữ liệu chỉ áp dụng DB dự án đã xác định, không áp dụng source code/file làm việc. Không sửa migration đã commit, không mở rộng sang AI/hoa hồng/booking Gym theo slot.

Đồng bộ Source-of-Truth, Design v3 CAT-01/CAT-02, Requirements, API contract, entity dictionary và phân công FE theo code/test thực tế. Chỉ đánh dấu hoàn thành khi có evidence. Báo file đổi, mapping dữ liệu, lệnh migration/test, kết quả và giới hạn.

Prompt giao Claude Code:

> Thực hiện `docs/CLAUDE-CODE-PLAN-SPORT-SERVICES-AND-MEMBER-RENTAL.md` bằng một luồng tuần tự A–D. Tách môn/dịch vụ, gộp PT vào Gym trước; Membership/PT chỉ thuộc Gym. Sau đó bỏ ExternalCoach, chuyển thuê sân sang Member. Tôi bỏ dữ liệu cũ để dùng DB sạch, không cần migration giữ tài khoản/giao dịch cũ. Chuẩn bị schema và reset đúng database của dự án, seed ba môn/lịch/giá thành lệnh riêng để tôi chạy sau; kiểm seed trên DB test riêng. Hệ thống phải thêm được môn có lớp/thuê sân qua Manager mà không sửa code. Giữ code đang sửa của tôi, qualification/phòng PT, transaction, snapshot và payment. Không sửa migration đã commit. Báo test, lệnh reset/seed và phần chưa kiểm chứng.
