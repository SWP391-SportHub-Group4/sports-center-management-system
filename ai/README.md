# SportHub — Module AI

SportHub là **hệ thống quản lý trung tâm thể thao với ba môn Gym (bao gồm PT), cầu lông và bóng rổ; có thể mở rộng thêm môn trong tương lai**. PT là dịch vụ thuộc Gym.

AI nằm trong [SportHub.AI](../backend/SportHub.AI), chạy cùng ASP.NET Core backend. Thư mục gốc này chỉ giữ chỗ, không có Python microservice đang chạy.

Member assistant dùng context SportHub qua AiChatService/GeminiAiChatProvider. Coach workout recommendation có rule-based implementation. Không cấu hình Gemini không đồng nghĩa chatbot có câu trả lời mô phỏng thành công.

**Chưa triển khai:** Manager AI xếp lịch, tool calling và tạo lớp nháp sau xác nhận. Context phải theo ownership; thao tác ghi qua command có authorization/validation, không để LLM tự ghi DB.

Xem mục 11 và 13 của [thiết kế hệ thống](../docs/Center-Management-System-Design-v3.md).
