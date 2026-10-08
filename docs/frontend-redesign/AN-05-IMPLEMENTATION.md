# AN-05 — bàn giao frontend (08/10/2026)

Nhánh: `feat/fe-member-An`, nền `develop` tại `54dc7e0`.

## Phạm vi và trạng thái

| Mục | Kết quả | Giới hạn nghiệm thu |
|---|---|---|
| A07 — Đặt PT | Giữ API self-book hiện có; chặn submit lặp, bỏ slot cũ và tải lại availability sau lỗi quota/relationship/conflict hoặc kết quả không chắc chắn. | Test FE dùng API fixture; chưa nghiệm thu backend tích hợp trực tiếp trong lượt này. |
| A16 — Phản hồi ngưỡng | Ba radio-card không chọn sẵn; hệ quả tài chính, deadline theo giờ server, lọc lớp cùng môn còn chỗ, phân trang danh sách, quote gắn với lớp đích, xác nhận cuối và đọc lại server sau mutation/lỗi. Giữ checkout chênh lệch và retry. Chuẩn hóa chuỗi PascalCase thực tế của backend. | **BLOCKED API G02** cho “Chờ đợt sau”; chọn phương án này chỉ xem giải thích, không gọi refund hay mutation giả. Refund/Transfer nối API thật. |
| A18 — AI từ lịch | Dùng Drawer chung: desktop không khóa lịch, chừa vùng nội dung, mobile modal/focus/Escape. Hội thoại dùng API hiện có; chặn phản hồi request đã dừng. Liên kết tới đúng session lấy từ lịch server, giữ ngày/view/filter trong trang. | Câu trả lời AI vẫn là văn bản tự do; danh sách session được trình bày độc lập, không giả là citation của AI. Không kiểm Gemini live. |
| A19/Q08 — Nguyện vọng | Tab `/member/courses?tab=interests`; subpage `/manager/classes/interests` có entry từ danh sách lớp. Production hiển thị chưa khả dụng. Development có demo gắn nhãn, lọc môn/trạng thái và mô phỏng hủy nhận tin giữ nguyên điểm. | **BLOCKED API G02**; không có request ghi hoặc dữ liệu subscription thật. Demo chỉ tồn tại khi `NODE_ENV=development`. |
| A20 — Thẻ hội viên | Hiển thị tên/email/ID từ phiên server, sao chép mã, giải thích chỉ dùng tra cứu. Bỏ QR tự tạo từ userId. | **BLOCKED API G04**; chưa có QR backend cấp, trạng thái/hạn QR. Không dùng ID để giả QR được cấp. |

## Bằng chứng API còn thiếu

- `backend/SportHub.Scheduling/Threshold/Domain/ThresholdResponseChoice.cs` chỉ có `Refund`, `Transfer`.
- `ThresholdResponseService` chưa có transaction hoàn điểm + lưu course interest; chưa có API Member/Manager đọc/hủy interest.
- Không tìm thấy controller/contract cấp QR identification trong source backend. `MemberCodeCard` cũ tự mã hóa userId; không đáp ứng G04.
- G05 đã có availability và self-booking nên không đánh dấu toàn bộ A07 bị chặn.

## Kiểm chứng

- `npm run lint`: pass toàn bộ frontend.
- `npm run typecheck`: pass sau thay đổi cuối về phân trang.
- `npm run check:i18n`: pass (script chỉ rà phạm vi được cấu hình, không thay cho review ngôn ngữ).
- `npm run build`: pass, gồm route Manager interests mới. Sau build chỉ bổ sung tải đủ trang lớp đích; thay đổi đó đã qua typecheck và test trình duyệt.
- Playwright: **20/20 pass** với `an05-member-completion`, `pt-booking`, `member-code`, `member-dashboard-full` trên server development tại localhost:3105.
- Bao gồm refund/transfer confirmation, không chọn sẵn, WAIT không mutation, hết hạn theo server, ownership error, conflict đọc lại kết quả, PT booking/conflict/quota, AI retry/plain text/session link, desktop tương tác lịch và mobile Escape/focus.
- Axe WCAG A/AA cho fieldset chọn phương án: không có vi phạm. Đây không phải audit toàn ứng dụng.
- Đã xem screenshot desktop/mobile threshold và AI; không tràn ngang ở test mobile 390px. Screenshot được tạo trong `frontend/test-results/` (Git ignored), tái tạo bằng test trên.

## Tiếp nối backend

G02 cần một command atomic “hoàn 100% điểm ngay + nhận tin”, owner/deadline/idempotency, danh sách Member/Manager và hủy nhận tin không thu hồi điểm. G04 cần payload QR do server cấp và contract tra cứu. Chỉ nối các action này sau khi contract thật tồn tại; không đánh dấu AN-05 hoàn tất production trước đó.
