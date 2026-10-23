# SportHub — Tài liệu hệ thống

Thư mục này giữ tài liệu yêu cầu, nghiệp vụ, thiết kế và vận hành hệ thống. Các hướng dẫn, checklist và báo cáo kiểm thử đã được gỡ.

## Thiết kế và yêu cầu

| Tài liệu | Nội dung |
|---|---|
| [Nguồn thống nhất](00-Source-of-Truth.md) | Phạm vi, thuật ngữ và thứ tự ưu tiên tài liệu |
| [Requirements](Requirements.md) | Yêu cầu và trách nhiệm từng vai trò |
| [Functional & Nonfunctional Specification](Functional-and-Nonfunctional-Spec.md) | Yêu cầu chức năng, chất lượng và giới hạn triển khai |
| [Thiết kế hệ thống](Center-Management-System-Design-v3.md) | Kiến trúc, dữ liệu, luồng và phân quyền |
| [API contract](api-contract.md) | Endpoint, DTO, lỗi và quy tắc tích hợp |
| [Business Rules](SportManagement_BusinessRules_v2.0_updated.docx), [SRS](SWP391_Report_SRS.docx) | Tài liệu nghiệp vụ và yêu cầu gốc; áp dụng thứ tự ưu tiên trong nguồn thống nhất |
| [Flow 1 use cases](Flow-1-Use-Cases.md) | Đặc tả hành vi tài khoản và Membership; không phải bộ hướng dẫn chạy test |
| [Flow 2 use cases](Flow-2-Use-Cases.md) | Đặc tả 59 use case lớp, lịch và sân |

Các tài liệu thiết kế chuyên đề vẫn được giữ: [mở lớp](Class-Opening-Decision.md), [yêu cầu vắng](Class-Session-Change-Requests.md), [workspace Coach](Coach-Teaching-Workspace.md), [quan hệ Coach–Member](Coach-Member-Relationship-Lifecycle.md), [sự cố và buổi bù](Incident-Session-Recovery.md).

## Vận hành và thiết kế chuyên đề hiện hành

- [RUNBOOK](RUNBOOK.md): môi trường local và triển khai.
- [Initial Admin](Initial-Admin-Bootstrap.md): khởi tạo quản trị viên đầu tiên.
- [Manager workspace](Manager-Workspace.md), [Manager operations](Operations-Refresh.md): hành vi quản lý và các thay đổi nghiệp vụ hiện hành.
- [Media editor](Media-Editor.md): chỉnh sửa nội dung và hình ảnh trang chủ.
- [Rental court setup](Rental-Court-Setup.md): cấu hình môn, sân, giờ mở cửa và giá thuê.
