# AN-02 — Trang chính Member

Cập nhật 06/10/2026 · nhánh `feat/fe-An`, tạo từ `develop` local tại `1fbdbec`.

**Trạng thái: đang tích hợp, chưa nghiệm thu toàn bộ AN-02.** Frontend gọi API hiện có; các kiểm thử trình duyệt dùng mock, không chứng minh backend triển khai/quyền runtime đã đạt.

## Phần đã triển khai

| Page | Route và hành vi |
|---|---|
| A01 | `/member`: buổi tiếp theo trong 30 ngày (lớp + PT), ví, Membership, quota PT, thông báo chưa đọc và hóa đơn ISSUED. Lỗi từng vùng có retry, không thay bằng dữ liệu giả. |
| A02 | Entry Khám phá đến `/courses` của Khôi; giữ catalog và checkout hiện hữu, không tạo bản sao. |
| A03 | `/member/schedule`: adapter lên Calendar chung của Hào, ngày/tuần/danh sách, giờ Việt Nam; tải đủ trang PT trong khoảng xem; Drawer chi tiết và điểm danh của chính mình từ schedule API. |
| A04 | `/member/courses`: Sắp học/Đang học/Lịch sử/Tất cả; tải đủ trang enrollment trước lọc; `/member/courses/[classId]`: ghi danh, lịch buổi, Coach/phòng/buổi bù và link invoice item. Kiểm ownership vẫn thuộc backend. |
| A05–A06 | `/member/services?tab=gym|pt|visits`: Membership, ngày hiệu lực, mua/gia hạn qua component hiện hữu; quota PT remaining/reserved/consumed và hạn bảo lưu; lịch vào ra Gym phân trang từ endpoint self. |
| A17 | `/notifications?tab=all|unread`: đọc/đọc tất cả qua API; disable khi mutation chạy, giữ unread khi lỗi; đồng bộ badge chuông. Endpoint self dùng cho mọi role, link nghiệp vụ Member chỉ hiện với Member. |

Alias `/member/class-schedule`, `/member/my-registrations`, `/member/my-plans` chuyển đến route mới và giữ query (kể cả query lặp). Tabs giữ URL và Back/Forward. Shell bổ sung entry và sửa nút ngôn ngữ trong menu mobile.

Notification link chỉ map các nguồn đã biết. `PAYMENT_RECEIVED` dẫn đến danh sách hóa đơn vì publisher legacy có thể dùng package ID; không mặc định mọi sourceEntityId là invoice ID. Thông báo thủ công không được gán link lịch tùy ý.

## Kiểm tra đã chạy

- `npm run typecheck`, `npm run build`, `npm run check:i18n`: đạt.
- `npm run lint`: không lỗi; còn 5 warning unused import có sẵn ở trang Coach AI.
- Chrome, video off: `npx playwright test tests/member-main.spec.ts tests/member-finance.spec.ts --reporter=list`: 12 case đạt (8 AN-02, 4 hồi quy AN-01).
- Bao phủ phân trang PT và enrollment, chi tiết buổi, ID không có trong enrollment self, alias giữ query, tab/Back/reload, lịch lỗi, notification mutation thành công/thất bại, quota/lịch sử Gym và responsive.

## Việc còn lại để đóng AN-02

- **Hào / Calendar chung:** chưa có chế độ tháng trong `CalendarView`; không dựng Calendar thứ hai. Chưa thêm export `.ics` ở adapter Member.
- **Backend A04:** `GET /api/members/me/classes/{classId}/sessions` hiện trả `ClassSessionResponse`, không có attendance của Member. Điểm danh hiện xem được trong Drawer lịch qua `/members/me/schedule`; chưa có bảng điểm danh đầy đủ trong chi tiết khóa, nhất là enrollment đã kết thúc.
- **Backend A06:** `PtEntitlementResponse` không có `memberPackageId`/tên Membership liên kết; UI không suy đoán liên kết từ ngày gói.
- **Tích hợp thật:** kiểm account Member thật với lớp/PT/Gym/notifications, quyền khi đổi ID và invoice/refund links. Chưa chạy API live trong lần này; refund flow tiếp tục thuộc AN-04.
- **Review shared:** cần owner Calendar/catalog review adapter và Khôi review UI trước merge.

Không đổi API/schema, không thêm dữ liệu demo vào sản phẩm, không tự sửa token. Các kỹ năng đã áp dụng: Impeccable Operate/craft floor và nguyên tắc thị giác phù hợp của Taste theo DESIGN-SKILLS-GUIDE.
