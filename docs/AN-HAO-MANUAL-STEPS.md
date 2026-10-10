# Các bước An và Hào tự nghiệm thu sau khi team deploy staging

Tài liệu này chỉ gồm việc cần tài khoản VNPay/SMTP, staging HTTPS hoặc thiết bị quầy thật. Phần code và test tự động nằm trong [bàn giao An–Hào](AN-HAO-HANDOFF.md). Khôi/team phụ trách deploy, backup và migration theo [RUNBOOK](RUNBOOK.md). Không dùng tài khoản hoặc tiền thật khi thử sandbox.

## Chuẩn bị chung

1. Xin Khôi URL **frontend HTTPS**, **API HTTPS** và xác nhận đây là staging có PostgreSQL riêng. Lưu mã commit đang chạy và thời điểm deploy.
2. Mở `https://<api-domain>/api/payments/vnpay/ipn` trong trình duyệt bên ngoài máy chủ. Kỳ vọng HTTP 200 với JSON `RspCode: "97"` vì request chưa có chữ ký; đây chỉ xác nhận đường công khai, chưa chứng minh VNPay gọi được. Nếu 404, 401 hoặc lỗi TLS, báo Khôi sửa trước.
3. Chuẩn bị Member thử, Lễ tân, Manager, Coach A và Coach B. Không chụp hoặc gửi OTP, token, mật khẩu, số thẻ, hash secret vào chat hay GitHub.

## An — VNPay sandbox, SMTP và nghiệp vụ thanh toán

1. Đăng ký merchant tại [VNPay sandbox](https://sandbox.vnpayment.vn/devreg/) bằng email nhóm quản lý. Nhận `TmnCode`, `HashSecret` và hướng dẫn tài khoản/thẻ test từ VNPay. Nếu đã có merchant, dùng đúng bộ thông tin của staging.
2. Gửi **qua kênh secret của team** cho Khôi các giá trị cấu hình, không dán vào file commit: `VnPay__UseMock=false`, `VnPay__TmnCode`, `VnPay__HashSecret`, `VnPay__PaymentUrl=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html`, `VnPay__QueryUrl=https://sandbox.vnpayment.vn/merchant_webapi/api/transaction`, `VnPay__ReturnUrl=https://<frontend-domain>/payments/return`. Khôi cấu hình ở staging và khởi động bản mới; An chỉ xác nhận đã cấu hình, không gửi giá trị bí mật trong biên bản.
3. Trong portal/cấu hình merchant VNPay, đăng ký **IPN URL** `https://<api-domain>/api/payments/vnpay/ipn`. URL này là GET public qua TLS; **Return URL** là trang frontend ở bước 2, không phải IPN. Theo [tài liệu PAY của VNPay](https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html), IPN dùng để cập nhật trạng thái giao dịch, Return chỉ hiển thị kết quả.
4. Đăng nhập Member staging, mua một gói rẻ trên trang dịch vụ, chọn VNPay và thanh toán bằng phương tiện **sandbox** do VNPay cấp. Ghi `invoiceId`/`transactionReference` và thời điểm, che thông tin cá nhân. Sau khi quay về `/payments/return`, mở lại hóa đơn/checkout; chờ backend nhận IPN rồi xác nhận `Paid`, quyền lợi Active và đúng **một** payment. Chỉ thấy trang Return chưa phải thành công.
5. Mua thêm một giao dịch có điểm + tiền, một giao dịch QR VNPay nếu merchant hỗ trợ, và một giao dịch thất bại/hủy ở cổng. Đối chiếu tiền, điểm giữ/đã trừ, quyền lợi và trạng thái hóa đơn; giao dịch hủy không được cấp quyền lợi.
6. Nhờ Khôi trích log IPN đã **che chữ ký/PII**. Kiểm tra một callback lặp không tạo payment/quyền lợi thứ hai. Với hóa đơn chưa cập nhật dù sandbox đã trừ tiền, Lễ tân/Manager dùng `POST /api/invoices/{invoiceId}/reconcile` (có JWT của role được phép) để chạy QueryDR, rồi kiểm tra lại hóa đơn. Đối chiếu theo [tài liệu QueryDR của VNPay](https://sandbox.vnpayment.vn/apis/docs/truy-van-hoan-tien/querydr&refund.html). Không tự dựng IPN “thành công” bằng cách sửa query vì chữ ký phải hợp lệ.
7. Xin mailbox SMTP test của nhóm và cấu hình qua Khôi: `Email__Smtp__Host`, `Port`, `Username`, `Password`, `FromAddress`, `UseSsl` theo nhà cung cấp; `Email__DemoLoggingEnabled=false` trên staging. Thử đăng ký/reset mật khẩu và OTP dùng điểm ở quầy. Ghi thời điểm gửi, nhận và trạng thái retry/outbox; che OTP trong bằng chứng.
8. Với Manager, chỉnh `pt.self_book_min_lead_hours` và `pt.self_book_max_advance_days`, sau đó Member kiểm availability và thử đặt sát ngoài/trong giới hạn. Với G02, cho khóa không đạt ngưỡng, chọn “chờ đợt sau” hai lần, xác nhận hoàn điểm **một lần**, không tự ghi danh khóa mới; publish khóa cùng môn rồi kiểm thông báo. Ghi số dư trước/sau, ID phản hồi và ID khóa đã che thông tin cá nhân.

## Hào — mã hội viên, phân quyền Coach và quầy

1. Dùng điện thoại Member đăng nhập staging, bấm **Mã hội viên**. Thấy QR và hạn còn khoảng 5 phút. Dùng máy quầy đăng nhập Lễ tân mở màn check-in, cấp quyền camera và quét. Kỳ vọng hiện đúng Member; thử dán mã cũng phải tra được.
2. Thử sửa một ký tự trong mã, dùng lại sau hết hạn, và dùng Member đã khóa. Cả ba phải bị từ chối. Thử dùng tài khoản Coach hoặc Member gọi lookup; phải bị chặn 403. Việc quét chỉ chọn hồ sơ, **không tự check-in hoặc trừ điểm**.
3. Tại quầy bán gói/đăng ký lớp cho Member vừa tra bằng QR. Nếu dùng điểm, Member phải cung cấp OTP được gửi riêng; QR không thay OTP. Ghi invoice ID, số dư điểm trước/sau, không ghi OTP.
4. Tạo cặp Coach A–Member quan hệ Active, Coach B không có quan hệ, rồi thử profile/workout/PT list và PT detail. Coach A xem được trong phạm vi của mình, Coach B không xem được. Manager kết thúc quan hệ A–Member, thử lại: Coach A không còn thấy PT list/detail và workout list; Member vẫn xem được kế hoạch cũ. Nếu team muốn Coach xem lịch sử sau Ended, chốt lại requirement trước khi đổi quyền.
5. Dùng Lễ tân check-in Gym, checkout, xem lịch sử, điểm danh lớp. Xác nhận Member/Coach không thực hiện thay Lễ tân. Lưu ảnh hoặc log chỉ gồm HTTP status, role, invoice/ledger/attendance ID đã che PII.

## Điều kiện bàn giao

An và Hào đánh dấu từng bước `đạt/chưa đạt`, kèm thời điểm, staging commit, ID giao dịch đã che và người kiểm. Nếu thiếu merchant sandbox, SMTP, staging HTTPS hoặc thiết bị quầy, để trạng thái `chờ dữ liệu/thiết bị`; test tự động xanh chưa thay thế các bước này.
