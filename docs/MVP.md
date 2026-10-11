# SportHub — MVP

Tài liệu tổng hợp phạm vi MVP từ `Requirements.md`, `SWP391_Report_SRS.docx` (§1.3, §2.1.2, §3.2–3.3) và `00-Source-of-Truth.md`. Khi mâu thuẫn, thứ tự ưu tiên theo `00-Source-of-Truth.md` §0.

## 1. Phạm vi MVP theo Flow

| Flow | Mức | Use case (SRS §3.2–3.3) |
|---|---|---|
| 1 — User & Membership | **Bắt buộc** | UC-01 Đăng nhập & quản lý phiên · UC-02 Quản lý hồ sơ cá nhân · UC-03 Đăng ký tài khoản hội viên · UC-04 Quản lý tài khoản nội bộ & vai trò · UC-05 Quản lý gói thành viên · UC-06 Đăng ký / gia hạn gói thành viên |
| 2 — Class booking & schedule | **Bắt buộc** | UC-07 Quản lý lớp, phòng, lịch & phân công HLV · UC-08 Quản lý đăng ký buổi học · UC-09 Xem lịch dạy và phạm vi phụ trách (supporting) |
| 3 — Payment & report | **Bắt buộc** | UC-15 Hóa đơn & ghi nhận thanh toán · UC-16 Yêu cầu và xử lý hoàn tiền · UC-17 Xem & xuất báo cáo · UC-19 Audit log (cross-cutting) |
| Dùng chung | Supporting | UC-18 Xem thông báo |
| 4 — Training & attendance | Optional | UC-10 Điểm danh · UC-11 Hồ sơ tập luyện · UC-12 Kế hoạch tập · UC-13 Kết quả & tiến độ · UC-14 Xem kế hoạch/lịch sử (Member) |
| 5 — AI workout recommendation | Optional (nhóm vẫn làm) | UC-20 Yêu cầu AI gợi ý bài tập |
| 6 — AI assistant | Stretch | UC-21 Hỏi đáp AI (chỉ làm nếu Flow 1–5 ổn định) |

## 2. Quyết định kiến trúc cho MVP

- Backend là modular monolith ASP.NET Core; chạy 3 container: Frontend (Next.js), Backend, PostgreSQL.
- AI: adapter in-process (`IAiRecommendationService`) gọi LLM API hoặc rule-based tạm thời, không tách microservice.
- Bỏ Redis (xác thực JWT/session trực tiếp), bỏ RabbitMQ (dùng background job + outbox), bỏ Nginx/API Gateway (Kestrel qua HTTPS).

## 3. Ngoài phạm vi

Đa chi nhánh, payroll/hợp đồng nhân sự, chia doanh thu với người thuê sân, quản lý người đi cùng khi thuê sân, mobile native, payment production, hoàn tiền mặt/chuyển khoản, VNPay Refund API (theo `Requirements.md` §1).

## 4. Tiêu chí hoàn thành theo Flow bắt buộc

**Flow 1.** Đăng ký Member (email OTP hoặc Google), đăng nhập, quên/đổi mật khẩu; quản lý trạng thái tài khoản; mua/gia hạn Membership và quyền vào Gym; phân quyền 5 vai trò, backend kiểm cả role lẫn ownership.

**Flow 2.** Catalog lớp/khóa; giữ chỗ và ghi danh theo cả lớp; không bán vượt sĩ số; không xếp trùng phòng/sân/Coach (kiểm ở DB, không chỉ ở frontend); ngưỡng lớp, chuyển lớp; thuê/hủy sân.

**Flow 3.** Invoice snapshot giá; checkout chia điểm + VNPay (`TotalAmount = PointsApplied × 1.000 + CashAmount`); chỉ cấp quyền lợi sau khi backend xác minh giao dịch; giữ chỗ/điểm hết hạn nhả đúng một lần; hoàn trả bằng điểm theo từng item, không double credit; báo cáo thành viên, đăng ký lớp, doanh thu theo thời gian.

## 5. Mốc

- Tuần 5 (05–11/10): nộp SRS + ERD bản chính thức.
- Tuần 6 (12–18/10): demo Flow 1 + Flow 2.

## 6. Việc còn lại trước khi nộp SRS

- SRS đã đồng bộ với `Requirements.md`, SSOT và Business Rules: 5 role, Coach theo chuyên môn, UC-07/UC-08/UC-15/UC-16/UC-17 theo mô hình khóa nhiều buổi, hoàn bằng điểm.
- Quy tắc hoàn và sự cố (BR-91, BR-130, BR-138): hoàn chuẩn Membership Gym tối đa 50%; sự cố Gym bù bằng gia hạn Membership, buổi lớp bù vào lịch tiếp theo. Phần này mới có trong tài liệu, **chưa triển khai** (INC-01 trong thiết kế).
- VNPay mới chạy mock; sandbox thật chưa nghiệm thu (`Requirements.md` §6).
