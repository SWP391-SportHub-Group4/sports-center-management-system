# Kế hoạch FE tuần 05–11/10/2026 — giao theo trang

**Đây là bảng để điền công việc tuần, không thay bốn file đặc tả chi tiết.** Mốc ngày lấy theo tuần trong ảnh người dùng; là hạn mục tiêu để cả nhóm theo dõi, không phải ước lượng số giờ/người. An giữ nền tảng, Khôi dẫn UX/UI, landing và auth, Hào quầy/Coach, Khoa giữ cấu hình/Admin và (từ 05/10) toàn bộ Manager vận hành.

## 1. Đọc bảng này như thế nào?

- Cột **Tên task** luôn là tên trang/nhóm trang. Mã A/K/H/Q chỉ dùng tra file chi tiết, không cần hiểu mã mới biết phải làm gì.
- **Nền chung** chỉ có bốn task ở mục 3. **Trang FE** ở mục 4. **Backend/deploy chặn nghiệm thu** ở mục 5, đặt sang sheet/nhóm khác.
- Mỗi dòng một người phụ trách chính. **KH-03/KH-04 cũ đã chuyển cho Khoa và đổi mã thành KO-04/KO-05** (giữ nguyên page IDs và hạn); Khôi chỉ còn review UX/UI các màn mẫu này. An là owner kỹ thuật shared nhưng Khoa có thể code một phần theo contract; không ghi “An, Khôi, Hào, Khoa” vào cột owner một task.
- **P0** làm trước để nối hành trình chính; **P1** làm sau nhưng vẫn nằm trong mục tiêu phủ FE của tuần. P1 không tự động có nghĩa chuyển sang tuần sau.
- Trạng thái trong bảng để **Chưa cập nhật** vì chưa có xác nhận tiến độ thực tế. Khi điền sheet, thay bằng trạng thái thật và link PR/ảnh/test.
- Các dòng nhiều tab không phải viết lại nhiều ứng dụng: dùng page/layout/component hiện có, đổi UI và nối lại hành vi. Chi tiết từng tab vẫn theo assignment.
- **Trang xác thực (login, register, forgot-password) luôn tiếng Anh hoàn toàn**, không trộn Anh–Việt và không có nút đổi ngôn ngữ; áp bằng `EnglishOnly` ở layout từng route (xem 02-KHOI).
- Route đích trong assignment là đề xuất; giữ route hiện tại hoặc thêm redirect/query tương thích, không đồng thời refactor toàn bộ routing trong tuần.

## 2. Mục tiêu một tuần và cách xác nhận hoàn thành

**Mục tiêu ngày 11/10:** phủ giao diện mục tiêu, các hành trình có API hiện hữu chạy qua được và đã kiểm trên môi trường tích hợp. Đây là mục tiêu gấp; đặc biệt An và Khoa có nhiều nhóm màn. Chưa có kiểm chứng năng suất/tiến độ hiện tại nên không thể bảo đảm toàn bộ 98 mục hoàn chỉnh trong một tuần.

Phân biệt rõ:

| Trạng thái | Khi nào được ghi |
|---|---|
| Đang làm | Chưa đủ page/states hoặc chưa review |
| Xong UI – chờ API | Có layout, states, adapter/contract và fixture có nhãn; hành động thật còn blocker. **Không tính là xong chức năng** |
| Đang tích hợp | Đang nối API hoặc sửa luồng liên vai trò |
| Hoàn thành | Đủ UI + API thật + quyền/states + kiểm chứng theo tiêu chí dòng task, có PR/evidence |
| Bị chặn | Ghi blocker cụ thể, owner giải quyết và phần còn làm độc lập được |

Không biến UI fixture thành production success. Nếu yêu cầu là **mọi chức năng mới cũng chạy thật vào 11/10**, nhóm phải chốt và hoàn thành backend tương ứng; không thể giải quyết bằng cách dời tên task hoặc chỉ dựng FE. Đến mốc kiểm 08/10, báo riêng phần chưa chắc kịp để người phụ trách quyết định phạm vi; không tự đánh dấu done hoặc bỏ page khỏi danh sách.

Để giữ khả năng đạt mốc: tái dùng code hiện có; chốt một mẫu cho list/detail/form; giới hạn motion theo token; không làm CMS/analytics/widget mới ngoài đề; không refactor backend/schema chỉ để đổi giao diện. Phần G/CAT thiếu vẫn giữ task, không bị xóa khỏi scope.

## 3. Việc đầu tiên của bốn bạn — 05/10

Đọc theo thứ tự: mục bắt đầu trong file cá nhân → GUIDE + TOKENS → chỉ các page đang làm. Dùng Impeccable để chốt flow/states, Taste cho UI phù hợp; không yêu cầu AI sinh toàn portal một lần.

| Mã task | Owner | Hạn mục tiêu | Tên task | Phạm vi | Xong khi |
|---|---|---|---|---|---|
| N-AN | An | 05/10/2026 | Bật giao diện chung và khung trang | Tokens, Button/Field/Select, Dialog/Drawer, PageHeader, AppShell/MemberShell; props Table/State và checkout. | Merge nền có ví dụ dùng được; cả nhóm import được. Tận dụng component đang có, không xây UI library mới. Checkout contract có invoice/buyer/points/expiry/status, không tự tính tiền. |
| N-KH | Khôi | 05/10/2026 | Mẫu giao diện để cả nhóm làm theo | PublicHeader/Footer/AccountMenu, hero/CourseCard; một mẫu list/detail/form và layout checkout/quầy để review. | Khôi chốt hierarchy/layout theo token; CourseCard import được. Chỉ review mẫu và thay đổi lớn, không chờ duyệt từng page. |
| N-HA | Hào | 05/10/2026 | Lịch và thao tác quầy dùng chung | Calendar/CalendarEventDrawer, MemberSearch/QuickActions/AttendanceBoard; contract AI Drawer. | Có ví dụ ngày/tuần/list và event detail. Nếu chưa có Drawer An dùng placeholder đúng contract; không làm bản Drawer riêng. |
| N-KO | Khoa | 05/10/2026 | Làm bảng và trạng thái theo mẫu để dùng cho Admin và Manager | Table/FilterBar/StatusChip và Loading/Empty/Error/Forbidden/Conflict trên contract An; mẫu Admin list; dùng tiếp cho Manager (KO-04/KO-05). | Khoa triển khai phần nhỏ này, An giữ owner kỹ thuật và review; Khôi review visual. Merge trước khi nhân rộng Admin, không giao Khoa cả design system. Từ 05/10 Khoa còn nhận Manager vận hành (KO-04, KO-05) nên cần mẫu này sớm. |

An bàn giao contract/component theo từng phần, không đợi toàn bộ Member xong. Khôi/Hào/Khoa bắt đầu flow và UI riêng ngay; component chưa có dùng placeholder đúng contract. Mốc N-* phải merge được vào nhánh tích hợp; nếu trễ phải báo task consumer bị ảnh hưởng, không tự fork shared.

## 4. Bảng trang FE để điền vào sheet

Giữ các cột sheet hiện tại: **Tuần/Tên task · Flow/Giai đoạn · Đầu việc · Owner · Trạng thái · Hạn · Ghi chú · Ưu tiên · Phụ thuộc**. Các bảng dưới ghép tên + mã để copy; cột Ghi chú là tiêu chí nghiệm thu, không cần dán lại toàn bộ lịch sử kỹ thuật.

### An

Đặc tả đầy đủ: [01-AN-MEMBER-SHARED.md](01-AN-MEMBER-SHARED.md).

| Tuần / Tên task | Flow / Giai đoạn | Đầu việc: page/subpage | Owner | Trạng thái | Hạn mục tiêu | Ghi chú: xong khi | Ưu tiên | Phụ thuộc |
|---|---|---|---|---|---|---|---|---|
| Tuần 5 · AN-01 · Checkout và tài chính Member | FE · A15, A12, A13 | Trang thanh toán → chọn điểm/OTP theo buyer → VNPay → kết quả; Ví điểm → ledger; Hóa đơn → danh sách/chi tiết. | An | Đang tích hợp — UI + API hiện có xong, test Playwright (mock) đạt; chờ kiểm VNPay/IPN thật (G11) và backend mới deploy; PR: nhánh `feat/paymentMember` | 06/10/2026 | Dùng một checkout cho Member/quầy; hiện tổng, điểm, tiền còn lại và countdown server. Reload không tạo đơn trùng; kết quả chờ xác minh không báo Paid. | P0 | Nền An; G11 chặn kiểm gateway thật |
| Tuần 5 · AN-02 · Trang chính của Member | FE · A01, A02, A03, A04, A05, A06, A17 | Tổng quan; Khám phá; Lịch → chi tiết; Khóa của tôi → chi tiết; Gym/Membership/lịch sử vào ra; Gói PT/quota; Thông báo. | An | Đang tích hợp — UI + API hiện có; 11 E2E mock đạt; đã sửa Discover trong Member và làm lại dashboard ưu tiên lịch, còn dependency/kiểm backend thật; xem [bàn giao](AN-02-HANDOFF.md); nhánh `feat/fe-An` | 07/10/2026 | Member đi được từ dashboard đến lịch/khóa/dịch vụ và thông báo. Khám phá dùng catalog Khôi, lịch dùng Calendar Hào; không viết lại hai phần đó. | P0 | Shell An; CourseCard Khôi; Calendar Hào |
| Tuần 5 · AN-03 · Tập luyện và vận hành PT | FE · A08, A09, A10, A11, Q09, Q10, Q11, Q12 | Member: chi tiết buổi/yêu cầu đổi-hủy, đổi HLV, hồ sơ tập, kế hoạch/kết quả/tiến độ/homework. Manager: quan hệ PT, buổi PT, hàng đợi yêu cầu, hồ sơ Member. | An | Đang tích hợp — UI + API hiện có xong, test Playwright (mock) đạt; chưa kiểm với backend thật; Q12 chờ G12 để siết scope | 08/10/2026 | Member gửi yêu cầu và Manager xem/duyệt đúng trạng thái; đã gửi không đồng nghĩa đã đổi lịch. Chỉ hiện dữ liệu đúng relationship/quyền. Các tab tập luyện dùng UI Coach tương ứng làm đối chiếu. | P0 | Calendar Hào; G12 scope; API PT hiện có |
| Tuần 5 · AN-04 · Tài chính và báo cáo Manager | FE · A14, Q19, Q20, Q21, Q22, Q23 | Member tạo/theo dõi yêu cầu hoàn; Manager hóa đơn, hàng đợi hoàn, ví/điều chỉnh; báo cáo và export/lịch sử tải tệp. | An | Đang tích hợp — UI + API hiện có xong, test Playwright (mock) đạt; chưa kiểm với backend thật; G11 cho payment thật | 09/10/2026 | Gửi yêu cầu → Manager duyệt/từ chối → trạng thái cập nhật. Dùng quote server, tách cash/points, không manual Paid. Export có tiến trình/lỗi/download thật. | P0 | Financial components An; G08 chỉ khi cần danh sách self-refund mới |
| Tuần 5 · AN-05 · Hoàn thiện các màn Member còn lại và nối AI | FE · A07, A16, A18, A19, A20, Q08 | Đặt buổi PT; phản hồi ngưỡng 3 lựa chọn; AI từ lịch; nguyện vọng khóa sau cả Member/Manager; thẻ mã/QR. | An | FE đã triển khai; BLOCKED API G02/G04 | 10/10/2026 | 20/20 test FE pass; G05 dùng API hiện có. Refund/Transfer có xác nhận; AI desktop giữ thao tác lịch. Chờ đợt sau và nguyện vọng chờ G02; QR backend chờ G04; demo nguyện vọng có nhãn, chỉ development. | P1 | G02, G04; AI chat hiện có; G02 liên quan Khôi Q07 |

### Khôi

Đặc tả đầy đủ: [02-KHOI-LANDING-PUBLIC.md](02-KHOI-LANDING-PUBLIC.md). KH-03/KH-04 đã chuyển cho Khoa (xem KO-04/KO-05); Khôi review UX/UI màn mẫu class/incident.

| Tuần / Tên task | Flow / Giai đoạn | Đầu việc: page/subpage | Owner | Trạng thái | Hạn mục tiêu | Ghi chú: xong khi | Ưu tiên | Phụ thuộc |
|---|---|---|---|---|---|---|---|---|
| Tuần 5 · KH-01 · Landing và các trang khám phá dịch vụ | FE · K01, K02, K03, K04, K05, K06 | Landing 14 section; Bộ môn → chi tiết; Khóa học → danh sách/chi tiết; Gym/gói; PT/HLV; Sân → chi tiết/lịch trống. | Khôi | Chưa cập nhật | 06/10/2026 | Dùng template/card chung, nội dung thật và CTA đúng. Tìm lớp theo filter API đã hỗ trợ. Public sân/HLV/giá chưa có G01 thì giữ UI fixture có nhãn, không lấy staff DTO public. | P0 | Tokens An; G01/G09; classification Gym/PT đã thống nhất |
| Tuần 5 · KH-02 · Đăng nhập, tài khoản và nội dung công khai | FE · K07, K08, K09, K10, K11, K12, K14, K15, K16, K17 | Thuê sân (công khai); Giới thiệu; Liên hệ; FAQ/chính sách; login; register/OTP; quên/reset mật khẩu; Google onboarding; hồ sơ/bảo mật/ngôn ngữ; trang lỗi. | Khôi | Chưa cập nhật | 07/10/2026 | Auth giữ hành vi đang chạy, đăng nhập quay lại đúng trang chọn dịch vụ. Nội dung tĩnh dùng layout chung. AccountMenu dùng chung mọi role; OTP/lỗi/phiên hết hạn rõ ràng. | P0 | Form/state An; auth API hiện có |
| Tuần 5 · KH-05 · Thuê sân của Member | FE · K19, K20, K21, K22, K23 | Tìm/thuê sân; checkout; danh sách/chi tiết lượt thuê; hủy; đặt lại. | Khôi | Chưa cập nhật | 10/10/2026 | Member đặt sân qua shared checkout; Member bị khóa không đặt mới. Hủy và đặt lại theo policy, không hoàn hai lần. Dùng finance An, Calendar Hào; không dựng portal engine mới. | P0 | Checkout/finance An; Calendar Hào; rental API hiện có |

### Hào

Đặc tả đầy đủ: [03-HAO-RECEPTION-COACH.md](03-HAO-RECEPTION-COACH.md).

| Tuần / Tên task | Flow / Giai đoạn | Đầu việc: page/subpage | Owner | Trạng thái | Hạn mục tiêu | Ghi chú: xong khi | Ưu tiên | Phụ thuộc |
|---|---|---|---|---|---|---|---|---|
| Tuần 5 · HA-01 · Quầy hôm nay và quản lý Member tại quầy | FE · H01, H02, H03, H04, H08 | Dashboard quầy; danh sách/hồ sơ Member; hỗ trợ đăng ký; Gym check-in/out và đang ở Gym; lịch sân/chi tiết. | Hào | Đang tích hợp — UI + API hiện có xong, test Playwright (mock) đạt; chưa kiểm với backend thật; QR chờ G04 (chỉ dùng quét QR có sẵn của MemberPicker) | 06/10/2026 | Search SĐT/tên → chọn đúng người → check-in/out. Giữ selected Member khi chuyển tác vụ. Mã/QR chỉ bật khi G04 có; không chặn search hiện có. | P0 | Shell An; auth Khôi; Calendar/Search Hào; G04 cho QR |
| Tuần 5 · HA-02 · Bán dịch vụ, điểm danh và giao dịch quầy | FE · H05, H06, H07, H09, H10, H11 | Chọn Member/dịch vụ; checkout/OTP; chọn buổi/roster/điểm danh; hóa đơn; tạo hộ refund; ví của Member đang chọn. | Hào | Đang tích hợp — UI + API hiện có xong, test Playwright (mock) đạt; chờ kiểm payment thật (G11) | 07/10/2026 | Bán được qua checkout An, OTP không bị bypass; điểm danh lưu thật và hiện lỗi từng dòng. Reception chỉ gửi refund, không duyệt/chỉnh điểm. | P0 | AN-01; AttendanceBoard; G11 cho payment thật |
| Tuần 5 · HA-03 · Coach: tổng quan, lịch, lớp và học viên | FE · H12, H13, H14, H15 | Dashboard Coach; lịch dạy/chi tiết; lớp phụ trách/roster; danh sách/hồ sơ học viên PT. | Hào | Chưa cập nhật | 08/10/2026 | Chỉ thấy lớp và học viên được giao; roster lớp chỉ đọc theo quyền. Calendar thống nhất với Member/Manager; có loading/empty/error. | P0 | Calendar Hào; G12 chặn nghiệm thu phân quyền |
| Tuần 5 · HA-04 · Coach: kế hoạch tập và kết quả buổi PT | FE · H16, H17, H18, H19 | Plan tạo/sửa/chi tiết; kết quả/tiến độ; homework tạo/sửa; buổi PT/hoàn thành/no-show theo API. | Hào | Chưa cập nhật | 09/10/2026 | Coach tạo nội dung, Member xem tương ứng; lưu/reload được. Thiếu dữ liệu không vẽ biểu đồ giả, không mở quyền sửa cho Member. | P0 | Training/PT APIs; An A10/A11 làm consumer |
| Tuần 5 · HA-05 · AI Drawer cho Coach và bàn giao adapter | FE · H20 | Coach gợi ý kế hoạch → review/edit → lưu nháp/áp dụng; bàn giao Drawer cho An A18 và Khôi Q28. | Hào | Chưa cập nhật | 10/10/2026 | Desktop giữ lịch/form phía sau; mobile quay lại không mất context. Có loading/cancel/error. Test Member chat và Coach suggestions riêng; cấu hình Gemini không chứng minh cả hai flow đã chạy. | P1 | Drawer primitive An; AI endpoint từng role; Q28 còn G03 |

### Khoa

Đặc tả đầy đủ: [04-KHOA-MANAGER-ADMIN.md](04-KHOA-MANAGER-ADMIN.md). KO-04/KO-05 nhận từ Khôi ngày 05/10; **KO-03 và KO-04 cùng hạn 08/10 — báo sớm nếu không kịp để chốt phạm vi.**

| Tuần / Tên task | Flow / Giai đoạn | Đầu việc: page/subpage | Owner | Trạng thái | Hạn mục tiêu | Ghi chú: xong khi | Ưu tiên | Phụ thuộc |
|---|---|---|---|---|---|---|---|---|
| Tuần 5 · KO-01 · Admin: tài khoản và vai trò | FE · Q29, Q30, Q31, Q32 | Tổng quan Admin; danh sách/chi tiết tài khoản; tạo nhân sự; đổi role/khóa/mở. | Khoa | Q29/list/Form/Dialog đã nối API; Q30 detail: BLOCKED API — G10 | 06/10/2026 | Tổng quan dùng totalCount theo trạng thái và 5 audit tài khoản mới nhất; tạo/đổi/khóa/mở có bước review, lỗi và reload list. Detail có route độc lập, thông tin theo DTO và reload sau mutation khi được cấp quyền; API thật GET /api/users/{id} vẫn trả 403 cho Admin. Không đổi backend/policy. 31 kiểm thử UI/API đọc đạt; mutation và detail được cấp quyền kiểm bằng fixture, chưa nghiệm thu detail thật. | P0 | Primitives An; G10; [báo cáo kiểm chứng](../../output/admin-implementation-report.md) |
| Tuần 5 · KO-02 · Manager: danh mục môn và bảng giá | FE · Q24, Q25 | Bộ môn; gói Gym; giá PT; giá thuê sân — list/tạo/sửa/active theo API. | Khoa | FE theo API hiện có đã triển khai; BLOCKED CONTRACT — CAT-01 | 07/10/2026 | Catalog 4 tab, alias/query cũ giữ nguyên; Table/FilterBar/Field/Dialog chung; confirm bật/tắt, lỗi giữ form, reload sau ghi. PT chỉ GET/PUT giá + version theo API, trình bày là dịch vụ Gym. Giá/tham chiếu/overlap do server hiện có validate. 21 ca Manager và 14 ca hồi quy Admin đạt, live chỉ đọc; thao tác ghi kiểm bằng fixture. Mapping ba môn/legacy package chờ contract An, không suy luận ID hoặc migration. | P1 | Table/Form; CAT-01 mapping An; [báo cáo kiểm chứng](../../output/manager-catalog-implementation-report.md) |
| Tuần 5 · KO-03 · Cài đặt và nhật ký hai vai trò | FE · Q26, Q27, Q33 | Tham số vận hành; nhật ký Manager; nhật ký Admin → lọc/chi tiết. | Khoa | Đã kiểm chứng phạm vi task 07/10 | 08/10/2026 | Settings có helper tác động và lưu thật. Audit dùng chung component nhưng query/quyền tách theo role; không tạo log từ FE. Lý do/before-after và link đối tượng có route hỗ trợ: xem handoff. | P1 | Shell/table; settings/audit API |
| Tuần 5 · KO-04 · Manager: tổng quan, lịch và quản lý lớp | FE · Q01, Q02, Q03, Q04, Q05, Q06, Q07 | Tổng quan; lịch vận hành; danh sách lớp; tạo/sửa; chi tiết các tab; publish/dời/bù/hủy; điều kiện mở lớp. | Khoa | Luồng hiện có đã kiểm chứng; còn Q01/G02 dependency | 08/10/2026 | Tạo/sửa nháp → review → publish/dời/bù/hủy có enrollment trả điểm chạy thật. Preview tên/lý do; holds khác confirmed. Chưa có incident summary và G02; G13 tạm bỏ theo yêu cầu người dùng. | P0 | Q01 incident feed/G06; An G02/Q08; G13 tạm ngoài phạm vi |
| Tuần 5 · KO-05 · Manager: HLV, sân, sự cố và thông báo | FE · Q13, Q15, Q16, Q17, Q18, Q28 | HLV nội bộ; sân/phòng/loại sân; sự cố preview/xử lý; soạn/theo dõi thông báo; AI xếp lịch. | Khoa | Chưa cập nhật | 09/10/2026 | Tái dùng list/form/detail. Incident hiện từng hoạt động bị ảnh hưởng và kết quả từng bước. AI phải review/edit trước lưu nháp. G03/G06/G07 chưa xong chỉ tính UI, không giả xử lý thành công. | P0 | An finance/contract; Hào AI/Calendar; G03/G06/G07 |

### 11/10 — chỉ sửa lỗi và nghiệm thu phần đã giao

**Cập nhật tích hợp 07/10 — KO-01/KO-02:** Khi resolve stash với develop, giữ Dialog/review/detail/reload của Admin, bỏ role ExternalCoach theo backend mới và giới hạn tạo nhân sự Admin/Manager/Receptionist (Coach qua luồng Manager). Catalog dùng code + services[] + readiness theo CAT-01 đã có trong source, giữ Table/Filter/Dialog và xác nhận bật/tắt. Không dùng operationType cũ. G10 vẫn BLOCKED API; nghiệm thu mapping dữ liệu thật/legacy package cần backend tích hợp, không tự migration. Các số kiểm thử trong bảng trên là kết quả trước lần tích hợp này; xem báo cáo KO-02 cho kết quả chạy lại.

**Cập nhật 07/10 — KO-04/KO-05:** Đã triển khai overview ưu tiên việc chờ, calendar/filter URL dùng chung Hào, ClassEditor bốn bước và ClassDetail tabs/deep-link, draft/publish tách biệt, review dời/bù/hủy, Coach/qualification PT, Facilities rooms/types/opening-hours/blocks, incident checkpoint/recheck, notice review/idempotency/receipt. `targetId` audit và manager-only `offeringId` được bổ sung ở read contract; không migration. G03 AI suggestions, G06 enrichment/history/fence/recovery, G07 list/server recipient preview, G13 close enrollment và G02 consumer còn BLOCKED API/dependency, chưa tính production complete. ExternalCoach đã retired theo backend hiện hành. Xem [bộ test nghiệm thu](MANAGER-OPERATIONS-TEST-CASES.md) và [báo cáo triển khai](../../output/manager-operations-implementation-report.md).

**Kiểm chứng bổ sung 07/10 — KO-03/KO-04:** Xem [bàn giao hiện hành](KO-03-KO-04-HANDOFF.md). Đã bổ sung Manager-only API selected-slot preview (read-only, không migration), giải thích resource conflict và exclude đúng buổi khi dời/bù; Admin audit có reason/before-after. G02 vẫn do An giữ backend/Q08, Q01 chưa có incident feed; G13 tạm bỏ trong đợt này theo yêu cầu người dùng. Không đánh dấu toàn bộ KO-04 hoàn thành.

| Owner | Việc cần làm | Bằng chứng |
|---|---|---|
| An | Kiểm shared + Guest/Member/quầy checkout; ví/refund/PT/reports; lỗi tích hợp thuộc mình | PR, kết quả kiểm tra, số liệu điểm/tiền, callback/expiry nếu đã có môi trường |
| Khôi | Review visual cuối theo pattern; kiểm public/auth (tiếng Anh)/rental; review visual màn class/incident của Khoa | Ảnh mobile/desktop và kết quả các flow; không tự ký nghiệm thu kỹ thuật thay mọi người |
| Hào | Kiểm search/check-in/attendance/Coach/AI và Calendar ở các consumer | Role tests, lỗi/quyền/context; phối hợp An/Khôi sửa adapter |
| Khoa | Kiểm 9 màn catalog/settings/audit/Admin, 14 màn Manager vận hành (lớp, HLV, sân, sự cố, notices, AI) và Table/State mình làm | Negative auth, list/detail/form states và PR; không ôm QA toàn nhóm |

Không dành 11/10 để bắt đầu thêm nhóm page mới. Khoa làm xong sớm tiếp tục kiểm/sửa phần mình; không tự chuyển thêm workload nặng sang Khoa ngoài phần đã ghi ở KO-04/KO-05.

## 5. Backend và deploy — ghi ở bảng phụ, không trộn với tên trang

Các ghi chú trong ảnh là kế hoạch cũ, chưa chứng minh việc đã làm hoặc nghiệp vụ đã được chốt. Ví dụ “CAT-01 đã chốt dời migration” cần quyết định được ghi lại; không dùng ảnh làm lý do sửa schema. Tuần FE đề xuất chốt mapping trình bày, còn migration chỉ triển khai khi có phương án bảo toàn dữ liệu.

| Nhóm việc | Owner chính | Chặn trang/flow nào | Cách xử lý trong kế hoạch FE |
|---|---|---|---|
| G11 callback VNPay + cấu hình gateway/SMTP | An | Checkout Member/quầy/rental | Sửa/kiểm trước nghiệm thu payment thật; không phải điều kiện chờ để bắt đầu vẽ trang |
| G10 Admin detail | Khoa | Q30 | Sửa policy/endpoint hẹp; UI list/create/audit vẫn làm song song |
| G12 StaffRead/Coach scope | Hào | Coach, Member profile vận hành | Chặn nghiệm thu phân quyền; menu ẩn không thay backend scope |
| G02 wait-next; G05 self-book PT | An | A16/A19/Q08 và A07; Khôi Q07 consumer | Chốt contract, hoàn thành UI states, ghi BLOCKED API nếu chưa có; không refund/booking giả |
| G04 Member code/QR | Hào | H01/H02/H04 và An A20 | Search SĐT/tên dùng API hiện có; QR cần resolve server trước bật thật |
| G01/G09 public catalog | Khôi | K01–K06 | Chỉ dùng public DTO; filter chưa có giữ trạng thái chưa hỗ trợ hoặc fixture riêng có nhãn |
| G03/G06/G07/G13 | Khoa | Manager AI/incident/notices/close enrollment | Không đồng nhất hiện API preview/resolve với workflow mới đã đủ; ghi từng blocker cụ thể |
| CAT-01 | An | Gym/PT catalog; Khôi public/Coach; Khoa danh mục | Chốt mapping ID/service theo dữ liệu thật; không xóa PT seed/FK. Khoa không làm migration |
| G08 và D01–D08 | Theo assignment | Refund/history/canonical API | Ưu tiên nối API hợp lệ; cleanup không được chặn redesign nếu compatibility hiện còn dùng được |
| Staging tối thiểu và CI | An | Môi trường kiểm luồng chung | Tách task vận hành; Khôi hỗ trợ FE build/env, không gánh thêm toàn bộ Compose. Mục tiêu có URL tích hợp trước vòng kiểm 08/10; nếu chưa có, kiểm local tích hợp và ghi blocker, không coi là đã deploy |

**Không bắt buộc làm hết backend mới rồi mới làm FE.** Nhưng cũng không thể đóng một flow thật nếu backend của nó chưa có. Chủ API cập nhật contract/blocker ngay khi bắt đầu tuần; nhóm không đợi đến 10–11/10 mới phát hiện thiếu endpoint.

Nếu deploy production-like: giữ các yêu cầu đã audit về env/build-time URL, SMTP, VNPay sandbox, forwarded headers, migration/bootstrap có kiểm soát, persistence và health. Không chạy DemoDataSeeder ở môi trường public chỉ vì một dòng sheet cũ ghi “apply seed”; không bật Development để vượt cấu hình production. SRS/ERD là deliverable riêng nếu nhóm cần, không gộp vào dòng “xong FE”.

## 6. Các điểm kiểm tra cần ghi rõ trong bảng

| Mốc | Kiểm điều gì | Nếu chưa đạt |
|---|---|---|
| 05/10 — nền và mẫu | Import shared được, biết route/page của mình; contract G và mapping CAT đã rõ | Ghi blocker consumer, tiếp tục flow/fixture theo contract; không làm shared khác |
| 08/10 — kiểm giữa tuần | Có hành trình Guest → login → checkout; quầy chọn Member → bán/điểm danh; Coach đúng scope; Admin list/detail; class draft → publish nếu đã nối | Nêu đúng trang chưa chạy, thiếu FE hay API; điều chỉnh phạm vi phải được người phụ trách xác nhận |
| 10/10 — đủ phạm vi UI mục tiêu | Mỗi ID có trạng thái và owner, UI/adapter cho phần thiếu API cũng có bằng chứng | Không để trống ID; đánh dấu blocked và người xử lý, không tính là completed |
| 11/10 — nghiệm thu | Mobile/desktop, VI/EN, states, quyền, flow liên vai trò và test | Danh sách lỗi/blocker cuối rõ ràng; không báo “full FE xong” khi còn thiếu |

Checklist chung: typecheck/lint/check:i18n/build; E2E theo hành trình sửa; không fake data/success; deadline/điểm/quyền từ server; giữ route/query/email links. Mỗi người merge từng nhóm trang khi đạt, không giữ nhánh lớn đến cuối tuần.

## 7. Câu giao việc ngắn để gửi nhóm

> Mỗi người mở mục “Bắt đầu tuần 05–11/10” đầu file cá nhân và bảng trang của mình trong kế hoạch tuần. Làm nền/mẫu trước, sau đó theo từng dòng có tên trang; dùng chung tokens/component. Commit/PR ghi mã task và page IDs, kèm link chạy/ảnh/test. Thiếu API ghi cụ thể gap và owner, không báo xong bằng fixture. An giữ nền tảng kỹ thuật, Khôi chốt UI/UX, Hào Calendar/AI, Khoa cấu hình/Admin và phần Table/State nhỏ theo contract An. Ngày cuối dành cho sửa lỗi và nghiệm thu.

Không thêm ước lượng số giờ hoặc thời lượng cá nhân vào file giao việc; chỉ dùng hạn bàn giao mục tiêu trong kế hoạch tuần này.
