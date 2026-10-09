# Đặt và thanh toán PT từng buổi

## Luồng Member

- Services: chỉ một CTA đến `/member/training?tab=book`.
- Training: chọn Membership Gym đang có hiệu lực, Coach đủ chuyên môn PT, ngày, giờ và phòng.
- Báo giá một buổi 90 phút theo đơn giá PT do hệ thống cấu hình. Không chọn tần suất tuần.
- Mở popup thanh toán tạo checkout: giữ lịch Coach/phòng và một quota ở trạng thái `PendingPayment` trong cùng transaction. Advisory lock Coach/Member và occupancy bảo vệ khung giờ; slot hết chỗ trả conflict.
- VNPay xác minh thành công hoặc thanh toán điểm thành công mới chuyển buổi sang `Scheduled`, kích hoạt entitlement một buổi và tạo quan hệ Personal nếu chưa có.
- Hủy/hết hạn checkout chuyển buổi chờ thanh toán sang `CancelledOnTime`, nhả occupancy và reserved quota. Callback gateway, ví, đối soát, hoàn tiền và idempotency dùng luồng Payment hiện hữu.
- VietQR vẫn chưa hỗ trợ. Đóng popup không hủy checkout; có thể tiếp tục qua invoice được lưu trong URL.

## API

`GET /api/members/me/pt-session-availability?memberPackageId=<uuid>&coachId=<uuid>&fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD`

Member chỉ dùng Membership của mình. Khoảng xem tối đa 14 ngày; slot dài 90 phút, cách hiện tại ít nhất 12 giờ, đặt trước tối đa 30 ngày, bước 30 phút, trong hiệu lực Membership và giờ mở cửa phòng PT.

`POST /api/checkouts/pt/quote` và `POST /api/checkouts/pt` bổ sung `startAtUtc` UTC và `roomId`; checkout cần `priceVersion` và Idempotency-Key như trước. Khi có `startAtUtc`, quota luôn bằng **1** và tổng tiền bằng đơn giá một buổi. `frequencyPerWeek: 1` được gửi chỉ để tương thích contract cũ; không tính quota theo tuần. Invoice item một buổi có `ptFrequencyPerWeek: null`.

Checkout response bổ sung `ptStartAtUtc`, `ptRoomId` để khôi phục đúng lịch và retry có báo giá mới. Retry phải kiểm tra lại slot, hạn đặt trước và Membership, không đảm bảo giữ khung của checkout đã hết hạn.

## Hợp đồng cũ

Request không có `startAtUtc` vẫn là mua gói theo quota 4/8/12 × số tháng Membership, phục vụ tương thích với FrontDesk và hợp đồng cũ. Training có phần thu gọn để đặt bằng số buổi chưa dùng; không bắt khách đã mua gói thanh toán lại.

Không thay đổi chính sách hoàn/hủy đã có: yêu cầu đổi/hủy buổi đã thanh toán vẫn qua change request; hoàn tiền dùng quy tắc PT hiện tại của hệ thống.

## Triển khai

Áp migration `20261009140000_PerSessionPtCheckout` trước khi dùng backend mới. Deployment phải đồng bộ backend và frontend; frontend từ chối báo giá có `totalQuota != 1` để không thanh toán nhầm gói cũ.
