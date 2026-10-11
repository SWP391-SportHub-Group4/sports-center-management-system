# SportHub: bàn giao phiên thiết kế frontend

Ngày bàn giao: 05/10/2026 (Asia/Saigon).

## Cập nhật mới nhất: impeccable layout homepage

- Giữ Court & Volt và funnel hiện tại. Ở desktop/tablet, cột Gym được căn giữa theo chiều dọc danh sách cầu lông/bóng rổ, làm bố cục hai phía cân bằng hơn mà không ép Gym thành cùng loại thẻ.
- Nhịp section đổi từ `clamp(64px, 8vw, 112px)` sang `clamp(56px, 6vw, 88px)`, giảm chiều dài trang khoảng 242px ở 1440px, 98px ở 768px và 80px ở 390px trong lần đo local. Nội dung bên trong giữ nguyên khoảng thở.
- Kiểm tra Chromium: chụp/xem 1440, 768, 390px; không tràn ngang hoặc lỗi JS; nút đổi môn bằng touch hoạt động. Impeccable layout detector trả `[]`.
- Sửa `frontend/src/app/landing.module.css`. Ảnh sau chỉnh: `homepage-layout-final-1440.png`, `homepage-layout-final-768.png`, `homepage-layout-final-390.png`. Không sửa copy, dữ liệu hoặc logic; không commit/push/deploy.

## Cập nhật mới nhất: Impeccable audit homepage

- Audit `/` hoàn tất, không sửa UI. Báo cáo hiện hành: `HOMEPAGE-AUDIT.md`, điểm 16/20 (Accessibility 3, Performance 2, Responsive 4, Theming 4, Integrity 3), 0 P0, 0 P1, 2 P2, 1 P3.
- P2: `sizes` hero ở `frontend/src/app/page.tsx:131` chọn ảnh nhỏ hơn bề rộng thật (1440px: ảnh 1312px nhưng source 828; 1024px: ảnh 896px nhưng source 640). P2: cả ba hero images đều tải dù hai môn không chọn bị ẩn; `loading=lazy` không trì hoãn ảnh đang chồng trong viewport.
- P3: `.impeccable/surfaces/frontend-src-app-page-tsx.md` vẫn mô tả Navy/Ice/Roboto và cấu trúc hero cũ, không khớp Court & Volt đang dùng. Chưa sửa tài liệu.
- Detector báo `side-tab` tại `landing.module.css:201`; xác minh là chỉ báo `aria-pressed` của bộ chọn môn, false positive.
- Kiểm tra: axe 0 vi phạm trên EN/VI × 320/390/768/900/1024/1440px; không overflow hay target dưới 44px; touch đổi môn, mobile menu, Escape đều qua; không lỗi JavaScript. Giới hạn: chưa kiểm tra thiết bị thật, Safari/Firefox, screen reader, text-only zoom, production Web Vitals.
- Evidence: `homepage-reaudit-evidence.json`, `homepage-reaudit-vi-desktop.png`, `homepage-reaudit-vi-mobile.png`. Không commit/push/deploy; giữ nguyên các thay đổi local khác.

## Cập nhật mới nhất: sửa form ở Design Review

- Nguyên nhân: AccountForm dùng chung class `.detail` với CourseDetail nên bị áp nền tối và layout riêng của trang khóa học; chữ mô tả tối trên nền tối, mobile kéo nền tối qua cả khu vực form.
- Đã làm: tách `accountForm` với lưới hai cột responsive riêng, giữ thẻ hội viên tối và form trắng. Các style chi tiết khóa học không còn áp vào form.
- Kiểm tra: `npm run typecheck`, ESLint `ReviewPage.tsx`, Prettier đều qua. Chromium đã chụp và xem giao diện ở 1440px và 390px; input/button đủ chiều rộng, không tràn ngang, tương phản rõ.
- File sửa: `frontend/src/components/design-review/ReviewPage.tsx`, `frontend/src/components/design-review/review.module.css`. Không đụng phần homepage hay các thay đổi local khác; không commit/push/deploy.
