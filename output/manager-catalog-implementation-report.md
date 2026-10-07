# Manager — KO-02: danh mục và bảng giá

Phạm vi được duyệt: Q24/Q25, triển khai frontend theo API hiện có. Ngày: 06/10/2026.

## Đã triển khai

- Trang `/manager/catalog` có bốn mục: bộ môn, gói Gym, giá PT, giá thuê sân.
- Alias `/manager/sports`, `/manager/membership-plans`, `/manager/court-rates` dùng cùng giao diện, giữ URL và query khi tải lại. Không sửa AppShell/menu chung.
- Bảng dùng `components/data/Table`, `FilterBar`, `StatusChip`; form dùng Field/Dialog và validation trình duyệt. Bộ lọc và trang nằm trên URL, phân trang 10 mục trên danh sách đầy đủ API trả về; không giả API pagination/sort chưa có.
- Bộ môn: list/tạo/sửa/activate/deactivate qua Table/Filter/Dialog chung; mã môn bất biến khi sửa; nhiều dịch vụ qua services[]; Membership/PT chỉ thuộc mã gym; thông số lớp nhóm nằm trong dịch vụ GROUP_COURSE. Hiển thị readiness và cấu hình thiếu từ API Manager; loại phòng tương thích đọc từ API room-types.
- Gói Gym: list/tạo/sửa/discontinue/reactivate. Save chỉ gửi DTO được backend hỗ trợ, sessionLimit null theo contract hiện tại; không đưa isActive vào request sửa vì backend quản lý trạng thái bằng endpoint riêng.
- PT: GET giá hiện hành + priceVersion, PUT giá mới trong Dialog. Trình bày PT là dịch vụ Gym. Không thêm create/active giả vì API không có những thao tác đó.
- Giá sân: list/tạo/sửa; lọc loại phòng/trạng thái; chọn sportId theo compatibility từ API; validation ngày, khung giờ và giá; bật/tắt bằng PUT đầy đủ DTO hiện hữu, không DELETE.
- Bật/tắt cần xác nhận. Form giữ dữ liệu khi API 400/403/404/409, hiện thông báo/mã lỗi, chặn gửi lặp và reload sau thành công.
- Giá dùng VND dương, bội số 1.000. Kiểm tra giá/tham chiếu/overlap phía server tiếp tục dùng service có sẵn; không đổi backend.

## Dependency còn lại — CAT-01

**Cập nhật 07/10/2026 sau tích hợp develop:** contract Sport đã có code, services[] và readiness. Form/DTO/payload đã chuyển theo contract này; không dùng operationType cũ. Việc nghiệm thu mapping dữ liệu thật/legacy package vẫn cần kiểm trên backend đã deploy, không suy trạng thái database từ source hoặc fixture.

Frontend giữ ID và các bản ghi API trả về, dùng code/service do server cấp; không suy luận ID từ tên, không tự gán package legacy sang sport khác. Tab giá PT trình bày là dịch vụ Gym. Không sửa seed, schema, migration, FK hoặc snapshot khi resolve conflict.

## Kiểm chứng

Các kết quả bên dưới là lần kiểm trước khi resolve conflict. Kết quả tích hợp 07/10 được ghi riêng sau khi chạy lại.

- TypeScript, ESLint các file thay đổi, check:i18n và production Docker build đạt.
- Lần chạy cuối: **35/35 Playwright đạt** (21 ca Manager, 10 ca Admin account flows, 4 ca audit target), bao gồm các ca live được bật bằng P2_LIVE_API.
- Playwright fixture kiểm tra payload/endpoint, reload, confirm/cancel, lỗi API giữ form, validation giá/ngày/giờ, reference loader failure/retry, quyền Member/Admin, URL filters/aliases.
- Kiểm tra giao diện 320/390/1440px, nhãn VI/EN; Axe kiểm Dialog giá sân theo WCAG A/AA.
- Live API chỉ đọc bằng Manager: sports, membership-packages gồm inactive, pt-pricing và court-rates. Thao tác ghi được kiểm bằng fixture, chưa chạy ghi lên dữ liệu Docker của người dùng.
- Dữ liệu Docker hiện chưa có court rates; kiểm thử live xác nhận trạng thái rỗng, các luồng tạo/sửa/bật/tắt giá sân được kiểm bằng fixture.
- Chạy lại Admin account flows và audit target để kiểm tra hồi quy ở locale/build chung.

Ảnh: `output/manager-catalog-live.png`, `output/manager-catalog-mobile.png`.

Không thay đổi finance, lớp/lịch, PT vận hành, settings, G10 hoặc policy. Chưa commit.

Docker frontend đã rebuild và đang phục vụ tại http://localhost:3000/manager/catalog; backend và PostgreSQL tiếp tục chạy với volume hiện tại.

## Chỉnh bố cục Create sport

Theo ảnh phản hồi: các Field trực tiếp trong form-grid bị đặt vào mỗi cột của grid 12 cột chung, khiến ô nhập và nhãn quá hẹp. Đã đặt grid riêng trong CatalogFormDialog thành 2 cột trên desktop và 1 cột khi viewport không quá 720px, giữ Description toàn chiều rộng. Quy tắc được giới hạn trong form catalog, không sửa grid nền tảng hoặc API.

Kiểm tra EN/VI tại 1440/960/390/320px: tất cả ô nhập rộng 344/344/310/240px tương ứng, không tràn trang. Kiểm tra ảnh desktop/mobile và 5 ca Playwright hiện có cho sport/Gym/PT/court/mobile: 5/5 đạt. Docker đã cập nhật. Ảnh: manager-create-sport-1440-en.png và manager-create-sport-390-en.png.

## Kiểm chứng sau resolve conflict — 07/10/2026

- Giữ code/service/readiness từ develop, kết hợp Dialog/Table/Filter và xác nhận bật/tắt của KO-02. SaveSport bỏ operationType và defaults ở cấp môn, dùng services[].
- Admin giữ Dialog review, link/detail và callback reload, bỏ ExternalCoach; tạo nhân sự chỉ Manager/Receptionist/Admin theo Q31, đổi role vẫn hỗ trợ Coach/Member theo API. G10 giữ BLOCKED API, không mở StaffRead hoặc finance.
- Đồng bộ dependencies bằng npm ci theo lockfile và sinh lại route types; không thay package.json/lockfile. Môi trường local dùng Node 26.7.0 (engine project khai báo Node 24).
- Typecheck, lint toàn frontend, check:i18n, production build và Prettier các file sửa đạt.
- Chrome Playwright: 33 passed, 3 skipped trong manager-catalog, admin-account-flows và admin-audit-targets. Ca live bỏ qua vì không bật cấu hình API thật; mutation và detail được cấp quyền kiểm bằng fixture.
- Kiểm payload tạo Gym có Membership/PT; mã bất biến; nhiều dịch vụ lớp nhóm/thuê sân; readiness/Off; lỗi server giữ draft/retry; confirm chống gửi lặp; Admin review/reload/negative auth. Kiểm form bộ môn ở 320/390/1440px và Axe WCAG A/AA ở 390px đạt.
- Đã xem ảnh desktop/mobile sau khi tắt animation trong screenshot: [desktop](merge-sport-form-1440.png), [mobile](merge-sport-form-390.png).
- Cập nhật test theo accessible name của nút đổi ngôn ngữ ở header mới; giữ component header chung.
- Git đã đánh dấu hai file conflict resolved; chưa commit, chưa rebuild/deploy Docker trong lần này. Kết quả Docker và live ở các mục trước là lịch sử kiểm chứng, không phải kết quả lần tích hợp này.
