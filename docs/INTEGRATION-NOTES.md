# Ghép giao diện Manager với mã hiện hành của team

## Căn cứ

Đối chiếu 16 tài liệu trong `docs`, gồm hai tài liệu Word Business Rules và SRS,
với các thay đổi trong stash `managerFix` và mã `develop` đang có trong workspace.
Áp dụng [SSOT](00-Source-of-Truth.md), [API contract](api-contract.md),
[Coach workspace](Coach-Teaching-Workspace.md) và hệ thống token chung ở
[DESIGN-TOKENS](../DESIGN-TOKENS.md).

Theo lựa chọn của người dùng, giao diện Manager lấy stash `managerFix` làm mẫu:
header xanh đậm, nền xanh nhạt, avatar lime và cách trình bày bảng trên mobile.
Các màu này được giới hạn trong shell Manager; component và hợp đồng API vẫn dùng
mã hiện hành của team.

Các yêu cầu giao diện trong hội thoại ngày 8–11/10 được đối chiếu lại với code:

- Management shortcuts đứng trước Needs attention, có đường dẫn tới Incidents.
- Needs attention chia ba nhóm ngang trên desktop, có thanh cuộn riêng từng nhóm
  khi nội dung dài; màn hình nhỏ xếp dọc. Có tên lớp/hội viên, thông tin ngưỡng, lý do hoàn
  điểm và nội dung yêu cầu PT; liên kết tới đúng tab xử lý.
- Lịch tuần bắt đầu thứ Hai, có chọn tuần và nút chuyển tuần; giữ chế độ ngày/list,
  bộ lọc và khu vực yêu cầu đổi lịch lớp của team. Một sự kiện mở một drawer.
- Danh sách lớp chỉ hiện trạng thái trong cột ngưỡng; các bảng Manager có nhãn
  từng trường khi chuyển sang bố cục mobile.
- Buổi PT có hàng gọn và popup thao tác; lỗi hủy buổi giữ lại lý do đã nhập.
  Yêu cầu PT dùng bảng và popup review thay cho tiêu đề bằng ID.
- Form sự cố tách ngày/giờ 24h, kiểm tra khoảng thời gian; giữ quy trình preview,
  xác nhận và xử lý từng bước hiện có.
- Báo cáo dùng tên hội viên, bộ lọc phù hợp từng loại và input Member thẳng hàng.
  Điều chỉnh điểm mở trong Dialog; lịch sử điểm không có cột tham chiếu.
- Giữ BMI, avatar, báo cáo avatar và workspace Coach/PT của team. Theo lựa chọn
  mới của người dùng, giao diện tiếp tục dùng tiếng Anh, không khôi phục EN/VI.
- Ô chọn hội viên trong Reports và Coach–Member pairs của Manager dùng tìm kiếm
  tên/số điện thoại, không mở Live Camera QR Scanner.
- Cột Member khi xuất Revenue dimensions/Court rental revenue dùng `memberName`
  từ hồ sơ hội viên thay cho UUID. Member xác định chủ giao dịch của dòng doanh thu;
  bộ tổng hợp hiện cung cấp chiều này cho Rental. Dòng tổng hợp không có Member ID
  vẫn để trống tên. Bộ lọc sử dụng ID và các tổng tiền/điểm giữ cách tính hiện hành.

## Quyết định ghép

| Phần | Kết quả |
| --- | --- |
| Shell và điều hướng | Giữ avatar, thông báo, QR Member, điều hướng Coach PT/lớp nhóm của team; ghép bố cục Manager/Admin và khả năng đóng menu bằng Escape. Manager Settings nằm trong menu tài khoản. |
| Ngôn ngữ | Theo SSOT: giao diện tiếng Anh, bỏ các nút đổi ngôn ngữ được stash đưa trở lại. Tên, mô tả và dữ liệu lịch sử do người dùng nhập vẫn giữ nguyên. |
| Danh mục Manager | Giữ các trang danh mục riêng và trang PT pricing, bỏ menu con lặp; dùng API offering/room-type hiện hành. Khôi phục bảng màu, form và quy tắc bảng responsive của `managerFix` trong shell Manager. |
| Services Member | Giữ cấu trúc Explore/My services và deep link của team. Thẻ Gym hiển thị tên, mô tả và thời hạn thật của gói; tên có chữ PT không làm gói Membership bị ẩn. Gói còn hạn có nút Renew plan; lần mua đang PendingPayment chặn mua trùng. |
| Hóa đơn | Giữ bố cục chi tiết của bản Manager, mở bằng Dialog chung. Hiển thị description và lineAmount từ snapshot hóa đơn; giữ điểm/tiền, hoàn điểm, trạng thái bồi hoàn/đối soát, checkout và kiểm tra chủ hóa đơn. |
| Tài khoản Admin | Giữ tùy chọn mật khẩu mặc định và mật khẩu tự nhập, bước review, validation và chống gửi lặp. Chi tiết đọc qua `/api/users/admin/{id}`; lỗi 403/404 hiển thị riêng. |
| Đóng form | Dùng CloseButton chung trong Dialog/Drawer và các form; giữ focus trap, Escape và trả focus. |
| Git | Xử lý các conflict mã nguồn và ba ảnh conflict bằng kết quả đã kiểm tra. Không commit/push. Stash cũ và bản sao các phiên bản conflict còn để đối chiếu. |

Không đổi backend authorization, transaction thanh toán, migration hay dữ liệu
tài chính. Các khoảng trống nghiệp vụ đã ghi trong thiết kế, như xử lý sự cố Gym
và các thay đổi chính sách hoàn lớp chưa triển khai, vẫn cần công việc riêng;
việc ghép này không chứng nhận những mục đó đã hoàn tất.

## Kiểm tra

- Docker build backend/frontend thành công; Next tạo 87 trang/route.
- TypeScript và `check:i18n` đạt. ESLint có 0 lỗi và 4 cảnh báo tồn tại ở các phần khác.
- 57 ca Playwright liên quan đạt: Admin, danh mục Manager, Gym, hóa đơn,
  deep link/reload/ownership, trạng thái thanh toán và điều hướng Coach trên mobile.
- 3 ca dùng API Docker thật đạt: Admin overview/detail, audit identity/quyền đọc,
  danh mục Manager. Các ca fixture còn lại chỉ kiểm tra frontend, không chứng nhận
  VNPay sandbox, SMTP hoặc Gemini thật.
- Sau khi khôi phục theme Manager: build Docker frontend đạt; 26 ca danh mục,
  hóa đơn và điều hướng Coach, 3 ca responsive vận hành Manager và 1 ca danh mục
  dùng API thật đạt. Form mobile đạt kiểm tra accessibility hiện có. Kiểm tra ảnh
  7 trang Manager ở 390/960/1440px không có tràn ngang hoặc lỗi JavaScript.
- Sau khi khôi phục yêu cầu trong hội thoại 8–11/10: build Docker frontend,
  TypeScript và `check:i18n` đạt; ESLint có 0 lỗi và 3 cảnh báo ở các phần khác.
- 66 ca Playwright liên quan đạt qua các lượt kiểm tra: 6 ca khôi phục Manager,
  21 ca vận hành Manager, 21 ca danh mục, 5 ca ghép mã, 11 ca tài khoản Admin
  và 2 ca preview sự cố. Kiểm tra cả lỗi API, giữ draft, deep link và drawer.
  Form sự cố mobile đạt kiểm tra accessibility WCAG AA trong phạm vi form.
- Đối chiếu 14 trang Manager với API Docker thật ở 390/960/1440px: không có
  tràn ngang hoặc lỗi JavaScript; kiểm tra lại lịch sau khi sửa nút chuyển tuần.
  Đây là kiểm tra đọc trang, không xác nhận các tác vụ ghi hoặc dịch vụ ngoài.
- Cập nhật Needs attention ngày 12/10: build frontend, TypeScript và 3 ca kiểm
  thử liên quan đạt. Dữ liệu dài trong cả ba nhóm có vùng cuộn riêng; cuộn bằng
  bàn phím một nhóm không làm hai nhóm khác di chuyển. Kiểm tra 390/960/1440px
  không có tràn ngang. Log và ảnh local nằm trong `.tmp/needs-attention-*`.
- Sửa cột Member của export: build API/frontend, TypeScript và ESLint các file đổi
  đạt; 5 ca parity backend và 2 ca frontend liên quan đạt. Xuất CSV/PDF qua API thật
  có 4 dòng, tên thay UUID; các dòng tiền/điểm trong CSV khớp API. Trích text PDF
  xác nhận tên tiếng Việt còn đầy đủ và không có Member UUID. Log local nằm trong
  `.tmp/report-member-*.log`; file đã xuất trước đó không được viết lại.

Log và bản sao local nằm trong `.tmp/reconcile-backup`,
`.tmp/reconcile-final-tests.log`, `.tmp/reconcile-live-tests.log` và
`.tmp/reconcile-build.log`; các đường dẫn này được Git bỏ qua.
Ảnh đối chiếu theme Manager nằm trong `.tmp/manager-ui-before` và
`.tmp/manager-ui-after`; log kiểm tra nằm trong `.tmp/manager-ui-*.log`.
Log khôi phục các yêu cầu gần đây nằm trong `.tmp/manager-history-*.log`;
ảnh kiểm tra nằm trong `.tmp/manager-history-confirm` và
`.tmp/manager-history-final-schedule`. Các file này không được đưa vào Git.

## Chạy trên máy hiện tại

Windows dự trữ vùng cổng chứa 3000. `.env` local đã chọn `FRONTEND_PORT=3500`
và cập nhật CORS, URL email/reset và VNPay return cùng cổng.
Compose hỗ trợ biến cổng này; API vẫn ở 5000 và PostgreSQL ở 5435.
Các biến `NEXT_PUBLIC_*` của frontend được truyền lúc build image.

```powershell
docker compose up -d --build
docker compose ps
```

Mở [SportHub](http://localhost:3500). Hướng dẫn cấu hình và chạy trực tiếp bằng
Node/.NET tại [RUNBOOK](RUNBOOK.md).
