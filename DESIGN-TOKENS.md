# SportHub Design Tokens v2 — "Court & Volt"

> Nguồn code: [`frontend/src/styles/tokens.css`](frontend/src/styles/tokens.css) · Trạng thái: **đã chốt làm chuẩn redesign, chưa import vào app**.
> Thay thế hệ màu "navy + sky + coral" trong `globals.css`, `member.css`, `home.module.css`.

---

## 0. Ghi chú về skill

Đã đối chiếu Impeccable local tại `.claude/skills/impeccable` và Taste tại `.agents/skills/design-taste-frontend`. Cả nhóm dùng Impeccable cho UX, Taste cho UI trong phạm vi phù hợp theo [DESIGN-SKILLS-GUIDE](DESIGN-SKILLS-GUIDE.md). **File này là nguồn token duy nhất**, không lấy mặc định màu/font của skill ghi đè Court & Volt. **An giữ nền tảng và tích hợp token vào code; Khôi là UI/UX Lead review trải nghiệm/visual**; cả nhóm tiêu thụ chung. Thay đổi token cần cả review thiết kế và kỹ thuật, không đổi palette theo từng người.

---

## 1. Phân tích hiện trạng

Các số đếm dưới đây là snapshot của lần audit tạo bộ token, không phải số đo runtime hay số đếm được cập nhật sau mỗi PR. Hiện trạng tích hợp được ghi ở mục 10.

### 1.1 Màu

| # | Vấn đề | Bằng chứng |
|---|---|---|
| 1 | **Không có hệ màu — có ít nhất 3 hệ chạy song song** | `globals.css` (brand-900/700/500 + ink-*), `member.css` (navy/sky/ice/slate), `home.module.css` (brand-navy/sky/ice bằng `oklch` rồi lại ghi đè bằng hex ở dòng 858). 89 mã hex khác nhau rải trong code. |
| 2 | **Biến dùng nhưng không được định nghĩa** | `--border-color`, `--surface-muted`, `--ink-400`, `--brand-300`: dùng 3–5 lần mỗi biến, 0 chỗ khai báo → luôn rơi về fallback hard-code (`#e2e8f0`, `#f8fafc`). |
| 3 | **Cùng tên, khác nghĩa** | `--text-muted` khai báo 3 chỗ (slate `#4c607c` trên nền sáng; `oklch 76%` trên nền tối). `--surface`, `--radius`, `--shadow`, `--sidebar-width` bị `member.css` ghi đè `globals.css` tùy thứ tự import. |
| 4 | **Contrast kém** | `sky #6ec1e4` / trắng = **2.02:1**; `ice #c0e4f3` / trắng = **1.34:1**; coral `#ff6b4a` / trắng = **2.82:1** (13 lần dùng); `ink-300 #a8b4c2` = 2.11:1; `#f59e0b` / trắng = 2.15:1; `#00c48c` / trắng = 2.26:1; `ink-500` trên nền xám nhạt = 4.43:1 (trượt AA 4.5). |
| 5 | **Quá giống template** | Navy + sky-blue + một mảng coral lẻ là tổ hợp mặc định của mọi SaaS dashboard. Neutral lấy thẳng từ Tailwind slate (`#64748b #94a3b8 #cbd5e1 #e2e8f0 #f8fafc #0f172a`) lẫn với navy riêng → xám "bẩn" lệch tông. Chưa có chỗ nào nói "đây là trung tâm thể thao". |
| 6 | **Gradient trang trí vô nghĩa** | `coach.module.css` ×3 (navy→sky 4–8% alpha), `globals.css:1087` `linear-gradient(140deg, brand-900, brand-500)`. |
| 7 | **Semantic không đồng nhất** | success/warn/danger vừa có `--ok-700`, vừa hard-code `#065f46`, `#d97706`, `#b45309`, `#ef4444`… |

### 1.2 Spacing

- Padding/gap/margin dùng **30+ giá trị** khác nhau. Top: 8, 12, 16, **10**, **6**, 20, **14**, 24, 4, **18**, 2, **5**, 32, 3, **9**, **7**, 28, **26**, **13**, 48, **22**, **15**… (in đậm = lẻ, không thuộc thang nào).
- Có `--space-1…6` trong `member.css` nhưng chỉ dùng **8 lần** trong 5.6k dòng; còn lại là px tay. Thang dừng ở 32px, không có mốc cho section (48/64/96).
- Giá trị thừa như `70px, 76px, 90px` cho thấy spacing được "chỉnh cho vừa mắt" từng chỗ.

### 1.3 Typography

- **Roboto** — font mặc định của Android/Material, đúng loại "không có quyết định thiết kế nào".
- Font-size: 0.72, 0.75, 0.78, 0.8, 0.8125, 0.82, 0.85, 0.875, 0.88, 0.9, 0.95, 0.98rem + 12/13/14/18/20/24px. **20+ cỡ chữ**, nhiều cái chênh nhau 0.01rem — không phân cấp được bằng mắt.
- `h1 1.45rem` / `h2 1.1rem` / `h3 0.98rem`: tiêu đề trang chỉ lớn hơn body ~1.5 lần, thiếu cá tính.
- Thiếu font cho số liệu (giá, mã OTP, mã check-in) → cột tiền không thẳng hàng.

### 1.4 Radius / Shadow / Motion

- Radius: **2, 4, 6, 8, 10, 12, 14, 16, 20, 999, 9999** — 11 giá trị, hai cách viết "pill".
- Shadow: một `--shadow` bằng `rgba(16,22,29)` đen thuần + vài shadow hard-code (`rgba(0,0,0,.25)`).
- Transition: `0.15s ease`, `0.18s cubic-bezier(...)`, `0.1s ease` lẫn lộn, không có `prefers-reduced-motion` chung.

---

## 2. Ý tưởng thiết kế: "Court & Volt"

Ba thứ đặc trưng của trung tâm thể thao đa môn (Gym · Cầu lông · Bóng rổ):

- **Court** — xanh teal đậm của mặt sân/thảm/nước. Là màu thương hiệu, màu hành động. Gần với xanh cũ nên migrate êm, nhưng teal (hue 205) chứ không phải "xanh SaaS" (hue 250).
- **Volt** — lime điện (màu cầu lông/đèn LED/băng đội). Chỉ làm **điểm nhấn trên nền tối** hoặc nền badge; chữ trên volt luôn là Ink. Đây là "cá tính" chính.
- **Hardwood** — cam sàn gỗ/bóng rổ. Secondary, dùng tiết kiệm (thẻ môn Bóng rổ, cảnh báo mềm).
- **Chalk** — neutral pha teal rất nhẹ (chroma 0.016), như phấn vạch sân; không còn xám thuần/xám slate.

Không có tím, không gradient tím-xanh. Không gradient trang trí. Chiều sâu đến từ: nền Ink đặc, viền mảnh, chữ display condensed lớn, một mảng volt.

---

## 3. Color

Cấu trúc **2 lớp**: Primitive (giá trị thô) → Semantic (dùng trong component).

### 3.1 Primitive

| Ramp | 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Court** | `#ebfcff` | `#d6f6f9` | `#b2eaf0` | `#7fd4de` | `#40b7c4` | `#0894a0` | **`#02717a`** | `#03555c` | `#003b40` | `#002528` | `#001113` |
| **Chalk** | `#f6f9f9` | `#ebeff0` | `#d8e0e1` | `#bbc7c8` | `#9aa8a9` | `#798688` | **`#596668`** | `#414d4e` | `#2b3536` | `#192122` | `#090e0f` |
| **Hardwood** | `#fff7f2` | `#feeade` | — | `#ffaf7e` | `#f18336` | `#c96203` | `#9a4901` | `#753600` | — | — | — |

**Volt**: `300 #d4f54a` · **`400 #c8f03a`** · `500 #93b403` · `600 #586d03` · `700 #425200`

**Semantic hues**

| | 50 | 100 | 400 | 600 | 700 |
|---|---|---|---|---|---|
| Green | `#eefdf1` | `#dbf7e1` | — | `#05773b` | `#005a2b` |
| Amber | `#fff8ea` | `#feeccd` | `#d09a21` | `#805c03` | `#614501` |
| Red | `#fef6f6` | `#fee9e7` | — | `#b32228` | `#8f0014` |
| Blue | `#f4f9ff` | `#e3f0fe` | — | `#1666aa` | `#004c86` |

### 3.2 Semantic — dùng trong component

| Token | Giá trị | Dùng cho |
|---|---|---|
| `--color-primary` / `-hover` / `-active` | Court 600 / 700 / 800 | Nút chính, link, tab active |
| `--color-primary-soft` + `-soft-text` | Court 100 + Court 700 | Chip, hàng được chọn |
| `--color-on-primary` | `#fff` | Chữ trên nút primary |
| `--color-accent` + `--color-on-accent` | Volt 400 + Ink | Badge "Mới", progress, active nav trên nền tối |
| `--color-secondary` / `-soft` / `-bright` | Hardwood 600 / 100 / 400 | Môn Bóng rổ, cảnh báo mềm (`-bright` chỉ trên nền tối) |
| `--bg-app` | Chalk 50 | Nền trang |
| `--bg-surface` | `#fff` | Card, panel, header |
| `--bg-surface-sunken` | Chalk 100 | Input, thead, vùng lõm |
| `--bg-inverse` / `-raised` | Chalk 950 / 900 | Sidebar, hero tối |
| `--bg-brand-deep` | Court 900 | Hero trang public |
| `--text-strong` / `-body` / `-muted` | Chalk 950 / 800 / 600 | Tiêu đề · đoạn văn · chữ phụ |
| `--text-disabled` | Chalk 400 | Chỉ disabled |
| `--border-subtle` / `-strong` | Chalk 200 / 300 | Card, bảng, divider |
| `--border-control` | Chalk 500 | Input, checkbox, select (đạt 3:1) |
| `--success-*` `--warning-*` `--danger-*` `--info-*` | `-bg` (50) · `-text` (700) · `-solid` (600; amber 400) | Badge, alert, toast |

**Vùng nền tối:** gắn `data-surface="inverse"` lên sidebar/hero; token semantic tự đảo (primary → volt, chữ → sáng). Không viết lại style bên trong.

### 3.3 Contrast (WCAG 2.2, đã tính)

| Cặp | Tỉ lệ | Yêu cầu | |
|---|---|---|---|
| Trắng trên Court 600 (nút primary) | **5.76** | 4.5 | ✅ |
| Trắng trên Court 700 (hover) | 8.54 | 4.5 | ✅ |
| Ink trên Chalk 50 (`text-strong`) | 18.34 | 4.5 | ✅ |
| Chalk 600 trên trắng (`text-muted`) | 5.96 | 4.5 | ✅ |
| Chalk 600 trên Chalk 50 | 5.63 | 4.5 | ✅ |
| Ink trên Volt 400 | 14.78 | 4.5 | ✅ |
| Court 700 trên Court 50 (chip) | 8.10 | 4.5 | ✅ |
| Chalk 300 trên Ink (sidebar) | 11.21 | 4.5 | ✅ |
| Volt 400 trên Ink | 14.78 | 4.5 | ✅ |
| Hardwood 400 trên Ink | 7.44 | 4.5 | ✅ |
| success/warning/danger/info text trên bg tương ứng | 7.99 / 8.42 / 9.06 / 8.34 | 4.5 | ✅ |
| Trắng trên Danger 600 / Success 600 | 6.61 / 5.66 | 4.5 | ✅ |
| Chalk 500 trên trắng (`border-control`) | 3.76 | 3.0 (1.4.11) | ✅ |

**Cấm** (không đạt AA nếu làm chữ nhỏ): Chalk 500 và nhạt hơn · Hardwood 500 (4.01) · Court 500 trở xuống · Volt trên nền sáng · Amber 400 làm chữ. **Không bao giờ chỉ dùng màu để báo trạng thái** — luôn kèm icon hoặc nhãn chữ.

---

## 4. Spacing

Lưới **4px, chỉ số chẵn**. Nhịp nhớ nhanh: **8 → 16 → 24 → 32 → 48 → 64**.

| Token | px | Dùng cho |
|---|---|---|
| `--space-0` | 2 | Gap hairline (icon sát chữ) |
| `--space-1` | 4 | Gap trong badge, giữa icon và nhãn |
| `--space-2` | 8 | Gap nhỏ nhất giữa phần tử liên quan |
| `--space-3` | 12 | Padding ngang control, gap trong nhóm field |
| `--space-4` | 16 | Padding card compact, gap mặc định |
| `--space-5` | 24 | Padding card chuẩn, gap giữa các card |
| `--space-6` | 32 | Gap giữa block lớn trong trang |
| `--space-7` | 40 | Hiếm — header trang |
| `--space-8` | 48 | Padding section app |
| `--space-9` | 64 | Khoảng cách section public |
| `--space-10` | 80 | Hero padding |
| `--space-11` | 96 | Section lớn trang public |

**Quy tắc nhịp:** *gần nhau thì nhỏ, khác nhóm thì lớn gấp đôi* — trong nhóm `8/12`, giữa nhóm `24/32`, giữa section `48/64`. Không tự đặt `10px/14px/18px`. Cần chiều cao control: `--control-height-sm/…/lg` = 32 / 40 / 48. Layout: `--sidebar-width: 256px`, `--header-height: 64px`, `--content-max: 1440px`.

> Tên `--space-1…6` giữ nguyên nghĩa cũ (4,8,12,16,24,32) → code đang dùng không bị đổi.

---

## 5. Typography

| Vai trò | Font | Lý do |
|---|---|---|
| Display / H1–H2 / số lớn | **Barlow Condensed** 600–700 | Chữ "bảng điểm" thể thao, hẹp nên tiêu đề tiếng Việt dài vẫn gọn |
| Body / UI | **Be Vietnam Pro** 400–700 | Thiết kế riêng cho dấu tiếng Việt: dấu không chen dòng, không vỡ |
| Mono | **JetBrains Mono** 500 | OTP, mã check-in, phím tắt, giá tiền thẳng cột (`font-variant-numeric: tabular-nums`) |

Khi cài các gói `@fontsource`, kiểm tra subset/weight thực tế được phát hành của từng font trước khi viết import; không giả định cả ba có cùng tên file subset. Thay Roboto trong đợt migration và kiểm dấu tiếng Việt trên giao diện thật.

| Token | px | Dùng cho |
|---|---|---|
| `--text-xs` | 12 | Caption, nhãn bảng (không nhỏ hơn) |
| `--text-sm` | 14 | **Body app**, input, nút |
| `--text-md` | 16 | Body trang public, đoạn văn |
| `--text-lg` | 18 | Lead, tiêu đề card |
| `--text-xl` | 20 | Tiêu đề section |
| `--text-2xl` | 24 | Tiêu đề phụ |
| `--text-3xl` | 32 | **Tiêu đề trang app** (display font) |
| `--text-4xl` | 40 | Số liệu KPI |
| `--text-5xl` | 56 | Tiêu đề trang public |
| `--text-display` | `clamp(48px, 6vw, 88px)` | Hero |

Line-height: `tight 1.1` (display) · `snug 1.25` (heading) · `normal 1.5` (body) · `relaxed 1.65` (đoạn dài). Weight: 400 / 500 / 600 / 700. Tracking: heading lớn `-0.02em`; nhãn UPPERCASE `+0.06em` và chỉ ở cỡ `xs`. 12 cỡ → **10 cỡ**, mỗi cỡ cách nhau đủ xa để phân cấp bằng mắt.

---

## 6. Radius · Shadow · Motion

**Radius** (11 giá trị → 6): `xs 4` (kbd, checkbox) · `sm 6` (input, nút, chip) · `md 8` (dropdown, toast) · `lg 12` (card, modal) · `xl 16` (hero card) · `pill 999` (badge, avatar). Nút bo vừa phải, không "viên thuốc" khắp nơi.

**Shadow** (tint Ink, không đen thuần): `xs` · `sm` (card nổi nhẹ) · `md` (dropdown) · `lg` (modal) · `focus` (vòng 3px Court 35%). Ưu tiên **viền `--border-subtle` thay vì bóng**; card trong trang thường không cần bóng.

**Motion:** `instant 80` · `fast 140` · `base 200` · `slow 320` ms; easing `--ease-out` (mặc định), `--ease-in-out`, `--ease-spring` (chỉ micro-feedback). Có sẵn `--transition-colors`, `--transition-lift`. Chỉ animate `transform/opacity/color`. `prefers-reduced-motion` tự zero hóa toàn bộ duration.

---

## 7. Bảng so sánh: cũ → mới

### 7.1 Màu

| Cũ | Giá trị cũ | → Mới | Giá trị mới | Ghi chú |
|---|---|---|---|---|
| `--navy` | `#1a2b4c` | `--text-strong` / `--chalk-950` | `#090e0f` | Chữ chính; nền sidebar dùng `--bg-inverse` |
| `--brand-900` | `#0b2d4d` | `--court-900` | `#002528` | |
| `--brand-700` | `#12527f` | `--court-700` | `#03555c` | |
| `--brand-500` | `#1a76b8` | `--color-primary` (Court 600) | `#02717a` | 4.85 → 5.76:1 |
| `--brand-100` / `--ice` | `#e3f0fa` / `#c0e4f3` | `--color-primary-soft` | `#d6f6f9` | ice/trắng 1.34 → nền chip có chữ 8:1 |
| `--sky` / `--brand-sky` | `#6ec1e4` | Court 400 (nền sáng) · **Volt 400** (nền tối) | `#40b7c4` · `#c8f03a` | Màu nhấn đổi tính cách |
| `--slate` | `#4c607c` | `--text-muted` | `#596668` | |
| `--gray` / `--line` | `#e6e6e6` / `#dfe5ec` | `--border-subtle` | `#d8e0e1` | |
| `--surface-alt` | `#f5f7fa` | `--bg-app` | `#f6f9f9` | Pha teal nhẹ |
| `--ink-900/700` | `#10161d` / `#33414f` | Chalk 950 / 700 | `#090e0f` / `#414d4e` | |
| `--ink-500` | `#64748b` | `--text-muted` | `#596668` | 4.43 → 5.96:1 |
| `--ink-300` | `#a8b4c2` | Chalk 400 | `#9aa8a9` | Chỉ icon/disabled, không chữ |
| coral hard-code | `#ff6b4a` | `--color-secondary` (Hardwood 600) / `-bright` | `#9a4901` / `#f18336` | 2.82 → 6.31:1 |
| `--accent-600/100` | `#b4530a` / `#fdf0e2` | Hardwood 600 / 100 | `#9a4901` / `#feeade` | |
| `--ok-700/100` | `#14653a` / `#dcfce7` | `--success-text` / `-bg` | `#005a2b` / `#eefdf1` | |
| `--warn-700/100` | `#92610a` / `#fef3c7` | `--warning-text` / `-bg` | `#614501` / `#fff8ea` | |
| `--danger-700/100` | `#a4161a` / `#fde7e7` | `--danger-text` / `-bg` | `#8f0014` / `#fef6f6` | |
| `#00c48c`, `#f59e0b`, `#ef4444` | hard-code | `--success-solid`, `--warning-solid`, `--danger-solid` | `#05773b`, `#d09a21`, `#b32228` | Mọi cái cũ <3.8:1 với trắng |
| Tailwind slate (`#64748b #94a3b8 #cbd5e1 #e2e8f0 #f8fafc #0f172a`) | hard-code | Chalk tương ứng | — | Xóa hết, một hệ neutral |
| `linear-gradient(navy→sky)` | | **Bỏ** → nền đặc `--bg-inverse` / `--bg-brand-deep` | | |

### 7.2 Còn lại

| Hạng mục | Cũ | Mới |
|---|---|---|
| Font | Roboto | Barlow Condensed + Be Vietnam Pro + JetBrains Mono |
| Cỡ chữ | 20+ giá trị rem/px | 10 token `--text-*` |
| Spacing | 30+ giá trị px | 12 token `--space-*` (chẵn) |
| Radius | 11 giá trị | 6 token `--radius-*` |
| `--radius` / `--radius-sm` | 10 / 6 (globals), 12 / 8 (member) — xung đột | `--radius-lg` 12 / `--radius-sm` 6 (alias giữ `--radius`) |
| Shadow | đen thuần, hard-code | 5 token tint Ink |
| Transition | 0.15s / 0.18s / 0.1s ad-hoc | 4 duration + 3 easing |

---

## 8. Chiến lược migrate (ít breaking nhất)

Nguyên tắc: dùng compat aliases để chuyển từng consumer sang token semantic. **Chỉ import file không bảo đảm toàn bộ UI đổi đúng**: các định nghĩa cũ trong globals/member/home và giá trị hard-code vẫn có thể ghi đè. An rà cascade và computed styles trước khi mở rộng sang các portal.

**Phase 0 — Dọn xung đột** (1 PR nhỏ, không đổi giao diện)
1. Rà các khối `:root` trong `globals.css`, `member.css` và `home.module.css`. Gom định nghĩa trùng nhưng giữ giá trị cũ nếu PR này cam kết chưa đổi giao diện; trong PR bật token mới, bỏ/thay các định nghĩa ghi đè tương ứng. Phần chỉ-dùng-cục-bộ đặt ở selector module, không `:root`.
2. Định nghĩa nốt 4 biến đang "mồ côi": `--border-color`, `--surface-muted`, `--ink-400`, `--brand-300` (đã có trong alias).

**Phase 1 — Bật token mới** (1 PR, đổi diện mạo toàn app)
1. `npm i @fontsource/barlow-condensed @fontsource/be-vietnam-pro @fontsource/jetbrains-mono`; kiểm subset/weight được gói hỗ trợ rồi thay import Roboto trong `app/layout.tsx`. Đặt `--font-body` cho nội dung UI, `--font-display` cho tiêu đề ngắn; số liệu phải dễ đọc và có tabular nums.
2. Import `@/styles/tokens.css` trước `globals.css` sau khi xử lý override. Kiểm computed styles trên public hero, Member checkout, quầy và Manager table; CSS import order không tự loại bỏ hard-code.
3. Chạy axe (Playwright + `@axe-core/playwright` đã có sẵn) kiểm contrast toàn bộ route; sửa chỗ hard-code hex sót.

**Phase 2 — Thay hard-code** (chia theo role, mỗi PR một khu vực)
- Thay `#hex` → token semantic (grep `#[0-9a-f]{6}` trong `src`). Bỏ 4 gradient.
- Thay `padding: 10px/14px/18px…` → `var(--space-*)` khi chạm vào file đó (không cần refactor cả repo một lượt).
- Gom font-size, radius, `transition` về token.

**Phase 3 — Gỡ alias**
- Mỗi alias xóa khi `grep "var(--tên-cũ"` trả 0. Mục tiêu: lớp 3 rỗng, xóa.

**Phòng ngừa lùi:** thêm stylelint `declaration-property-value-disallowed-list` cấm hex trong `*.css` ngoài `tokens.css`; ESLint/grep trong CI cho `style={{ color: "#…" }}` trong `.tsx`.

> Đổi font có thể làm thay đổi độ rộng chữ và xuống dòng; chưa đo một tỷ lệ cố định cho mọi chuỗi. Kiểm bảng dày, sidebar, VI/EN và quầy trước merge. Nếu có visual test, chỉ cập nhật baseline sau khi review ảnh thay đổi.

---

## 9. Hướng dẫn chung cho team (Claude · Codex · ChatGPT · Antigravity)

**Một nguồn sự thật:** `frontend/src/styles/tokens.css`. Mọi công cụ AI đọc file này, không tự chọn màu.

### Quy tắc 8 dòng (dán vào mọi prompt/`AGENTS.md`/`CLAUDE.md`/custom instructions)

```
Frontend dùng token trong frontend/src/styles/tokens.css và DESIGN-TOKENS.md. Bắt buộc:
1. Không viết hex/rgb/hsl/oklch trong component. Chỉ dùng var(--bg-*, --text-*, --border-*, --color-*, --success|warning|danger|info-*).
2. Spacing chỉ dùng var(--space-*). Không dùng 5/10/14/18/22px. Cỡ chữ var(--text-*), radius var(--radius-*), shadow var(--shadow-*), transition var(--duration-*)/var(--ease-*).
3. Font: --font-display (tiêu đề), --font-body (UI), --font-mono (mã/số). Không Inter/Roboto/Arial.
4. Cấm: gradient tím-xanh, gradient trang trí, card lồng card, viền màu một bên (border-left dày), bóng đen thuần, xám Tailwind.
5. Volt (--color-accent) chỉ làm nền/điểm nhấn, chữ trên nó là --color-on-accent. Không dùng làm chữ trên nền sáng.
6. Trạng thái luôn có icon hoặc nhãn chữ, không chỉ màu. Chữ thường ≥ 4.5:1, viền control ≥ 3:1 (--border-control).
7. Nền tối: đặt data-surface="inverse" lên container, đừng viết lại màu.
8. Cần màu/khoảng mới? Đề xuất thêm token vào tokens.css, đừng hard-code.
```

### Theo từng công cụ

| Công cụ | Cách gắn |
|---|---|
| **Claude Code** | Chỉ rõ `DESIGN-SKILLS-GUIDE.md` và `DESIGN-TOKENS.md` trong prompt/rules. Không mặc định Impeccable tự đọc file tên tùy ý; không chạy document để dựng lại màu cũ. |
| **Codex** | Dán vào `AGENTS.md` ở root repo. |
| **ChatGPT** | Dán khối trên vào Custom Instructions của Project, đính kèm `tokens.css` làm file tham chiếu. |
| **Antigravity** | Đặt vào file rules/workspace rules của dự án; trỏ tới `tokens.css`. |

Nguồn quy trình/prompt chung là [DESIGN-SKILLS-GUIDE.md](DESIGN-SKILLS-GUIDE.md). Rules theo tool chỉ trỏ về GUIDE + file này; không tạo thêm AI-RULES hay bảng màu song song. ChatGPT cần nhận nội dung qua upload/paste, không chỉ tên đường dẫn.

### Checklist review PR giao diện
- [ ] Rà raw colors và spacing ngoài `tokens.css` bằng `rg`; không có màu/spacing tự phát. Border 1px, breakpoint, media dimensions và asset là ngoại lệ kỹ thuật cần phân biệt, không cấm mọi `px` máy móc.
- [ ] Không card lồng card; không gradient trang trí
- [ ] Tab bằng bàn phím thấy `:focus-visible` rõ
- [ ] axe không báo `color-contrast`
- [ ] Dấu tiếng Việt (ế, ộ, ữ…) hiển thị đúng ở mọi cỡ chữ

---

## 10. Trạng thái triển khai và nghiệm thu

- **Court & Volt đã được người dùng chọn làm chuẩn.** Không cần hỏi lại palette; mọi thay đổi sau này qua review token chung.
- `tokens.css` chưa được import vào app ở lần rà soát này; runtime vẫn dùng font/CSS cũ. Đợt tài liệu không thực hiện migration giao diện.
- Số contrast tính toán không thay cho kiểm trên giao diện thật. An nghiệm thu Phase 1 trên bốn màn mẫu cùng nhóm, gồm hover/focus/inverse và chữ tiếng Việt.
- Quy chuẩn cũ đã được thay bằng GUIDE + file này; PRODUCT trỏ về đây. Không tái tạo `DESIGN.md` thành nguồn màu thứ hai.
