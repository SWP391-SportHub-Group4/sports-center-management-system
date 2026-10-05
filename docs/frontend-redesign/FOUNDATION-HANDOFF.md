# Bàn giao nền tảng FE (task N-AN) — dùng ngay từ 06/10

Mục tiêu: cả nhóm import được token, Button/Field/Select, Dialog/Drawer, PageHeader, shell; biết contract Table/State/Checkout. Xem trang ví dụ chạy được tại `/design-system` (dev; production cần `NEXT_PUBLIC_DESIGN_SYSTEM=1` lúc build).

## 1. Thứ tự CSS (đã áp dụng trong `app/layout.tsx`)

`styles/tokens.css` → `app/globals.css` → `app/member.css` → `styles/foundation.css`

- `tokens.css` là nguồn duy nhất cho màu, chữ, spacing, radius, shadow, motion (xem `DESIGN-TOKENS.md`).
- Các khối `:root` cũ trong `globals.css` và `member.css` đã bị gỡ; tên cũ (`--brand-*`, `--ink-*`, `--navy`…) vẫn dùng được nhờ lớp alias ở cuối `tokens.css`. Code MỚI chỉ dùng token semantic (`--color-primary`, `--bg-surface`, `--text-muted`…).
- `foundation.css` đặt lại diện mạo các class cũ (`.btn`, `.field`, `.card`, `.chip`, `.dialog`, `.sidebar`, `.header`…) nên trang cũ đổi giao diện mà không sửa JSX. Khi một trang chuyển hẳn sang component mới, xóa dần khối tương ứng trong `globals.css`.
- Font: Barlow Condensed (tiêu đề, wordmark, số liệu lớn), Be Vietnam Pro (UI), JetBrains Mono (mã, OTP, tiền cần thẳng cột) qua `@fontsource`; Roboto đã bỏ. **Chạy `npm install` sau khi pull.**
- `home.module.css` (`.site`) vẫn còn token cục bộ riêng — thuộc phạm vi Khôi khi làm K01.

## 2. Component dùng chung — `import { … } from "@/components/primitives"`

| Component | Dùng khi | Ghi chú |
|---|---|---|
| `Button` | mọi nút | `variant`: primary / secondary / ghost / quiet / danger; `size`: sm / md / lg; `loading`, `icon`, `block`. Mỗi vùng tối đa một primary. `buttonClass()` cho `<Link>` trông như nút |
| `Input`, `Select`, `Textarea` | control trong `<Field>` | Tự nối nhãn, lỗi, `aria-invalid`, `required` qua context của `Field`. `Select` nhận `options` + `placeholder`, vẫn là `<select>` gốc |
| `Field` (trong `@/components/ui`) | nhãn + hint + lỗi | Đã nối `aria-describedby`; control gốc `<input>` vẫn dùng được |
| `Dialog` (trong `@/components/ui`) | xác nhận quyết định cần chặn nền | Thêm `description`, `size` (sm/md/lg). Focus trap + Esc + trả focus + khóa cuộn |
| `Drawer` | chi tiết/ngữ cảnh cạnh nội dung (Calendar event, AI, bộ lọc) | Phải; mobile thành bottom sheet. **Hào dùng cho CalendarEventDrawer và AI Drawer — không tạo Drawer thứ hai** |
| `PageHeader` | đầu trang con/chi tiết | `back`, `meta`, `actions`. Trang trong `AppShell`/`MemberShell` đã có `<h1>` từ shell nên dùng cho trang chi tiết |

Dialog và Drawer chia chung `useModalBehavior`: Esc chỉ đóng lớp trên cùng nên Dialog mở từ Drawer không đóng cả hai.

## 3. Shell

- `AppShell` (Receptionist/Coach/Manager/Admin/ExternalCoach): sidebar nền Ink (`data-surface="inverse"`), mục đang chọn nền volt; wordmark `SPORT`+`HUB`. Cấu hình điều hướng theo role vẫn ở `NAV_BY_ROLE` — thêm mục mới ở đó.
- `MemberShell`: toàn bộ màu cứng đã đổi sang token; wordmark đổi sang Barlow Condensed.
- Bỏ emoji cờ ở nút ngôn ngữ, thay bằng chữ `EN`/`VI`.
- **Đã làm (AN-01):** mục "Tài chính" (`/member/finance`) thay hai mục Ví + Hóa đơn; `/member/wallet`, `/member/invoices` chuyển hướng giữ query; component `Tabs` dùng chung trong `components/primitives`; `AuthCard` (thẻ xác thực đứng giữa) trong `components/auth`.
- **Chưa làm (đúng phạm vi tuần 5):** các mục menu Member còn lại trong 7 mục mới (Tổng quan · Khám phá · Lịch của tôi · Khóa học của tôi · Gym & PT · Tập luyện · Tài chính) và bảng alias route cũ→mới — chờ các trang đích có thật (A03–A06, A12–A14) rồi đổi menu cùng lúc để không có link chết.

## 4. Contract cho người triển khai

- Table / FilterBar / StatusChip: `components/contracts/table.ts`. **Khoa** triển khai ở `components/data/*`; `Table`/`StatusChip` hiện có trong `ui.tsx` chạy tiếp tới khi trang cuối chuyển sang.
- 5 trạng thái (loading / empty / error / forbidden / conflict): `components/contracts/state.ts` — `StateViewProps` và `stateKindFromStatus(httpStatus)`. **Khoa** triển khai `<StateView>`.
- Checkout: `features/payments/checkout.contract.ts` — `CheckoutViewModel`, `toCheckoutViewModel(dto, { mode })`, `derivePhase`, `remainingSeconds`. Quy tắc: FE **không tự tính tiền**; người mua do server xác định; hạn giữ chỗ tính từ `expiresAtUtc − serverNowUtc`; return từ cổng thanh toán không chứng minh đã thu. Ba ngữ cảnh (`SELF`, `COUNTER` — dùng điểm cần OTP email Member, `EXTERNAL_COACH`) chỉ khác adapter. **Hào** (quầy) và **Khôi** (ExternalCoach) viết adapter, không fork `CheckoutPanel`.

## 5. Quy tắc nhanh khi làm trang

1. Chỉ token semantic; không hex/px lẻ trong component.
2. Tiêu đề trang dùng font display; nhãn, nút, ô bảng dùng font UI.
3. Accent volt chỉ cho mục đang chọn/trạng thái hoạt động; nút chính là teal (`--color-primary`).
4. Không viền trái/phải màu dày, không gradient chữ, không emoji làm icon (dùng `components/icons`).
5. Đủ trạng thái: hover, focus, disabled, loading, error, empty. Tôn trọng `prefers-reduced-motion`.
6. Đối tượng chạm ≥ 44px trên thiết bị cảm ứng (Button `sm` tự nâng lên 44px).

## 6. Việc còn lại sau bàn giao này

- Sửa/xóa các spec Playwright còn bám màu/font cũ hoặc nhãn thay đổi.
- Dọn dần khối CSS cũ bị `foundation.css` thay thế (Phase 3).
- `pnpm-lock.yaml` không được cập nhật (CI dùng `npm ci` với `package-lock.json`).
