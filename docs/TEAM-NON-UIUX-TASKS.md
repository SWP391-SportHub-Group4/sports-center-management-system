# Phân công phần việc ngoài UI/UX và deploy

Ngày lập: 10/10/2026. Theo dõi trạng thái và tiêu chí đóng tại mục 13 của `Center-Management-System-Design-v3.md`. Mỗi hạng mục chỉ được đánh dấu hoàn thành khi có mã, test và evidence trên môi trường phù hợp. Các sửa đổi PAY-03/G09/G10/G12 hiện có trong nhánh bàn giao là nền tảng để tiếp tục, chưa thay cho nghiệm thu PostgreSQL hoặc VNPay sandbox.

| Người | Task chính | Kết quả bàn giao/điều kiện đóng |
|---|---|---|
| **An** | **Payment và nghiệp vụ Member:** PAY-01–05/G11; G02 “chờ đợt sau”; G05 PT self-booking; CAT-01 migration và callback muộn; G08 chỉ khi cần danh sách refund riêng. | Chạy test PostgreSQL cho checkout, split điểm, OTP, expiry, retry, late payment, hoàn điểm; chứng minh một giao dịch chỉ cấp quyền lợi một lần. Nghiệm thu VNPay sandbox/IPN/QueryDR/return với Khôi. G02 hoàn 100% điểm đúng một lần, lưu subscription nhưng không tự ghi danh. Chính sách đặt PT lấy từ setting và kiểm Membership Active. |
| **Khôi** | **Deploy lead và public contract:** OPS-01; G01 public sân/availability/giá, Coach profile/PT pricing; hoàn thiện G09 filter catalog; phối hợp CAT-02 thuê sân/lớp seed. | Chuẩn bị domain, HTTPS, reverse proxy, secret và cấu hình build frontend; chạy migration có backup, restore thử, lưu bền vững PostgreSQL/keys/reports, giám sát job/outbox/reconciliation. Smoke test đủ 5 role; callback VNPay sandbox truy cập công khai. Public DTO không lộ dữ liệu nội bộ; filter áp trước count/paging. Bàn giao URL, cấu hình không chứa secret, log/evidence deploy và rollback. |
| **Hào** | **Receptionist và Coach security:** G04 mã Member/QR do backend phát/xác thực; hoàn tất G12 scoping dữ liệu Member cho Coach; kiểm thử quầy/check-in/attendance. | QR chỉ dùng lookup danh tính, không là bằng chứng thanh toán/check-in; lookup cần quyền phù hợp. Rà mọi API tìm/xem Member, package, profile, lịch và training; Coach chỉ đọc Member đang được phân công, guard ở service cùng negative tests. E2E quầy với OTP Member khi dùng điểm và các case quét QR sai/hết hiệu lực. |
| **Khoa** | **Manager/Admin operations:** G03 Manager AI gợi ý lịch/tạo nháp; G06 incident recovery; G07 thông báo thủ công; G13 đóng/mở tuyển sinh; nghiệm thu G10 Admin detail. | AI chỉ tạo gợi ý/nháp sau xác nhận, mutation recheck quyền và occupancy, có audit. Incident preview người nhận/bồi hoàn, retry không double credit. Thông báo scoped recipient, paging và dedup. Đóng tuyển sinh không hủy lớp hoặc làm sai hold/payment cũ. Admin detail chỉ trả dữ liệu quản trị, không mở rộng `StaffRead`; test role/ownership âm tính. |

## Thứ tự tích hợp

1. An + Hào chạy test P0 callback và Coach scope trên PostgreSQL; Khôi chuẩn bị sandbox/HTTPS để xác minh callback thật.
2. Khôi hoàn thiện deploy staging, backup–restore và smoke test; An nghiệm thu payment, SMTP, Gemini/AI theo luồng liên quan. Không dùng mock để kết luận tích hợp thật.
3. Các owner hoàn tất G01–G13 theo hàng trên; mỗi PR có contract, migration nếu cần, test âm tính/concurrency, evidence và cập nhật mục 13.
4. Chỉ sau khi toàn bộ gate trong `RUNBOOK.md` mục 4 và mục 13 thiết kế được đóng mới quyết định go-live. VNPay production và refund ngân hàng nằm ngoài phạm vi hiện hành.
