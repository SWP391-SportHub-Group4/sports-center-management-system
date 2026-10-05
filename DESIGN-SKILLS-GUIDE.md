# SportHub — Hướng dẫn thiết kế và sử dụng skill chung

**Chuẩn làm việc của An, Khôi, Hào, Khoa · cập nhật 04/10/2026.** Đây là hướng dẫn redesign toàn bộ trải nghiệm và phân công triển khai, không phải xác nhận các màn hình/API đã hoàn thành.

Đọc theo thứ tự: [nguồn nghiệp vụ](docs/00-Source-of-Truth.md) → [PRODUCT](PRODUCT.md) → **[DESIGN-TOKENS.md](DESIGN-TOKENS.md)** → hướng dẫn này → file giao việc của mình. Yêu cầu trực tiếp đã chốt với chủ đề tài được ưu tiên; skill không được tự sửa nghiệp vụ, phân quyền hay token.

**Để giao việc tuần 05–11/10:** dùng [bảng FE theo tên trang](docs/frontend-redesign/KE-HOACH-FE-1-TUAN.md). Bốn assignment có mục “Bắt đầu tuần 05–11/10” để mỗi bạn biết việc đầu tiên; GUIDE và phần đặc tả dài dùng để tra quy chuẩn. Kế hoạch tuần ghi hạn mục tiêu, không thêm ước lượng giờ/người.

| Người | File giao việc, gồm page/subpage và kế hoạch API tại chỗ | Công cụ chính |
|---|---|---|
| An | [Nền tảng, Member, PT & tài chính Manager](docs/frontend-redesign/01-AN-MEMBER-SHARED.md) | Claude Code; **owner nền tảng kỹ thuật** |
| Khôi | [Landing, Guest, Auth & ExternalCoach](docs/frontend-redesign/02-KHOI-LANDING-PUBLIC.md) | ChatGPT Plus + Antigravity; **UI/UX Lead, chủ trì landing page** |
| Hào | [Receptionist & Coach](docs/frontend-redesign/03-HAO-RECEPTION-COACH.md) | ChatGPT Plus + Antigravity |
| Khoa | [Cấu hình, nhật ký & Admin](docs/frontend-redesign/04-KHOA-MANAGER-ADMIN.md) | ChatGPT Plus + Antigravity; **khối lượng ít nhất**, không điều phối toàn nhóm |

Không còn tài liệu API plan riêng: các mục G01–G13 và D01–D08 được giao trong bốn file trên. `DESIGN.md` và quy chuẩn màu cũ đã được thay thế; **không tái tạo chúng từ giao diện cũ bằng lệnh tự động**. Tài liệu token là nguồn duy nhất cho màu, font, spacing, radius, motion; guide chỉ quy định cách áp dụng.

## 1. Kết quả rà soát và quyết định thiết kế

| Phần đã đối chiếu | Hiện trạng / hệ quả đối với redesign |
|---|---|
| `docs/`, PRODUCT, BR, Design v3 và bốn assignment | Phạm vi ba môn **Gym (gồm PT), Cầu lông, Bóng rổ**, có thể mở rộng. PT là dịch vụ riêng mua dưới Gym, không phải môn thứ tư. Giữ đầy đủ hành trình mục tiêu kể cả phần backend chưa có |
| `frontend/src/app`, components và features | Có AppShell, MemberShell, public header, financial/notification components và nhiều route hiện hữu. Tái cấu trúc theo tác vụ và tái sử dụng, không tạo bốn ứng dụng độc lập |
| [layout](frontend/src/app/layout.tsx), [package.json](frontend/package.json) | Next/React, CSS Modules + CSS thường; đang import Roboto và stylesheet cũ. Chưa có Tailwind/Motion/Radix. Không cài chúng chỉ vì ví dụ của skill dùng chúng |
| [tokens.css](frontend/src/styles/tokens.css) | Đã có bộ Court & Volt, **chưa được import vào app**. An chịu trách nhiệm migration; chỉ thêm import chưa đủ nếu globals/member/home vẫn ghi đè token |
| Controller/service và consumers | Checkout, ví, OTP, expiry, refund và incident đã có nền tảng. Gap được phân biệt với API đã tồn tại; route đề xuất trong assignment chưa phải route đã deploy |
| Skill local | Impeccable `4.5.0` tại `.claude/skills/impeccable`; Taste tại `.agents/skills/design-taste-frontend`; `skills-lock.json` mới ghi Taste. Bản cài local không đồng nghĩa cả nhóm đã cài |

Đây là audit tĩnh tài liệu/mã, không phải chứng nhận runtime, security hay UX usability test. Bốn assignment giữ nguyên ID A/K/H/Q để đối chiếu page; backend gap giữ nguyên G/D. Chi tiết contract cần đối chiếu lại code/OpenAPI ở commit triển khai.

## 2. Vai trò hai skill và thứ tự ưu tiên

| Skill | Nhóm dùng cho | Đầu ra cần lấy | Thời điểm |
|---|---|---|---|
| **Impeccable = UX** | Cấu trúc page, flow, hierarchy, usability, copy, trạng thái, audit/critique và polish | Task flow, wireframe, state matrix, lỗi ưu tiên và cách sửa | Trước UI, sau màn mẫu, trước merge |
| **Taste Skill = UI** | Layout, typography, spacing, visual rhythm, ảnh, motion có mục đích và chống AI-slop | Bố cục trực quan theo token; desktop/mobile; màn mẫu có cá tính SportHub | Sau khi chốt flow; rà thị giác sau triển khai |

Đây là cách phân vai của **nhóm**, không khẳng định Impeccable chỉ có UX. Nó cũng có hướng dẫn UI; khi hai skill khác nhau, ưu tiên **nghiệp vụ/quyền → khả năng sử dụng/accessibility → DESIGN-TOKENS → shared component → chỉ dẫn phù hợp của skill**. Không gọi hai skill đồng thời để chúng tự tranh luận rồi thay palette.

**Giới hạn Taste:** bản local chủ yếu dành cho landing/portfolio/redesign, ghi rõ dashboard, data table và multi-step form ngoài phạm vi chuyên biệt. Khôi áp dụng đầy đủ cho Guest; với portal nghiệp vụ, cả bốn chỉ lấy nguyên tắc thị giác phù hợp. Flow checkout, bảng nghiệp vụ và lịch do UX + contract dẫn dắt. Không áp hero khổng lồ, scroll animation hoặc bento vào quầy/báo cáo. Các mặc định font, framework, độ bất đối xứng, motion của skill không được ghi đè dự án.

Impeccable dùng mode **Persuade** cho landing; **Operate** cho portal/auth/checkout. Landing có ảnh và nhịp section rộng hơn; portal ưu tiên scan nhanh, focus và dữ liệu. Cả hai vẫn cùng token. Không có màu riêng theo role.

## 3. Cài và dùng theo công cụ

### 3.1 Đồng bộ phiên bản trước khi cài

An làm người giữ bản skill: chụp nguyên thư mục skill đã kiểm tra, giữ license/references/scripts, chia sẻ bundle có version và checksum cho nhóm. Không chỉ gửi một đoạn tóm tắt rồi gọi là đã dùng cùng skill. `.agents/` đang bị Git ignore; clone repo **không bảo đảm nhận được Taste**. `skills-lock.json` không chứa toàn bộ nội dung và chưa khóa Impeccable.

| Skill | Baseline được đọc khi viết guide | Cách nhóm khóa bản |
|---|---|---|
| Impeccable | local `4.5.0`; upstream [pbakaus/impeccable](https://github.com/pbakaus/impeccable) | Giữ bundle đúng bản local; An ghi release/commit nếu xác minh được, không suy Git SHA từ version |
| Taste | upstream `Leonxlnx/taste-skill`, path `skills/taste-skill/SKILL.md` trong [lock](skills-lock.json) | Giữ nội dung khớp `computedHash` trong lock; đó là hash của công cụ cài, **không phải Git commit**. Thêm manifest checksum của bundle khi bàn giao |

Ví dụ kiểm tra file đã giải nén bằng PowerShell tại root repo:

```powershell
Get-FileHash .claude/skills/impeccable/SKILL.md -Algorithm SHA256
Get-FileHash .agents/skills/design-taste-frontend/SKILL.md -Algorithm SHA256
```

So kết quả với **SHA256 file** do An cung cấp, không so trực tiếp với computedHash khác thuật toán/cách tổng hợp. Khi cập nhật skill, An mở một PR ghi thay đổi và kiểm lại bốn màn mẫu; cả nhóm cập nhật cùng lúc. Không tự chạy update mỗi ngày.

### 3.2 Claude Code — An

**Nếu workspace đã có hai skill:** không cài lại Impeccable. Copy nguyên thư mục Taste sang vị trí Claude đọc nếu chưa có (PowerShell tại root; chỉ copy khi đích chưa tồn tại):

```powershell
if (-not (Test-Path .claude/skills/design-taste-frontend)) {
  Copy-Item -LiteralPath .agents/skills/design-taste-frontend -Destination .claude/skills/design-taste-frontend -Recurse
}
```

**Máy mới:** ưu tiên giải nén bundle An đã pin vào hai thư mục `.claude/skills/impeccable/` và `.claude/skills/design-taste-frontend/`. Mỗi thư mục phải có `SKILL.md`, cùng tài nguyên nó tham chiếu. Khởi động lại session và kiểm danh sách skill. Claude hỗ trợ project skills tại `.claude/skills/<name>/` và gọi bằng tên skill. [Tài liệu Claude Code](https://code.claude.com/docs/en/skills).

Nếu chưa có bundle và An cần thiết lập baseline lần đầu, lệnh upstream hiện tại là:

```powershell
npx impeccable install --providers=claude --scope=project
npx skills add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend"
```

Ở trình chọn của Taste, chọn Claude Code và project scope; kiểm vị trí cài sau đó. Các lệnh tải bản upstream hiện tại, **không tái lập chắc chắn baseline trên**; An phải kiểm phiên bản trước khi chia sẻ. Impeccable có thể thêm hooks và launcher tải engine lần đầu; kiểm diff cấu hình sau cài. Không cài plugin Impeccable thêm một lần nếu đã dùng local skill. [Impeccable install](https://github.com/pbakaus/impeccable), [Taste install](https://github.com/Leonxlnx/taste-skill).

Trong chat Claude Code, trước mỗi page gửi context ở mục 5, rồi dùng:

```text
/impeccable shape page A15 Checkout, mode Operate; lập flow và trạng thái theo assignment An, chưa viết UI
/design-taste-frontend Thiết kế UI cho flow A15 đã chốt; chỉ áp nguyên tắc thị giác phù hợp product UI, dùng DESIGN-TOKENS.md và shared components
/impeccable critique page A15 theo tác vụ thanh toán kết hợp
/impeccable audit page A15: keyboard, responsive, contrast, lỗi và thời hạn
/impeccable harden page A15: OTP sai/hết hạn, stale revision, reconnect, callback chậm
/impeccable polish page A15 trong phạm vi lỗi đã review; giữ contract và token
```

Đây là lệnh chat, không chạy `/impeccable` trong PowerShell. Dùng namespace đầy đủ `/impeccable audit`, không mặc định `/audit` tồn tại. Bản local không có command `normalize`; “chuẩn hóa token” là yêu cầu công việc, không phải lệnh cần bịa. Dự án đã có PRODUCT và token được chốt: **không chạy init/document để dựng lại design system từ CSS cũ**. Impeccable không tự bảo đảm đọc file tên tùy ý; luôn chỉ rõ GUIDE + TOKENS trong prompt dù root không còn `DESIGN.md`.

### 3.3 ChatGPT Plus — Khôi, Hào, Khoa

Phương án dùng được ngay là **đưa nội dung skill vào ngữ cảnh**, không cần giả lập cài plugin Claude. Tạo ChatGPT Project “SportHub UIUX”, thêm Project instructions bằng khối context mục 5. Upload GUIDE, TOKENS, PRODUCT, file giao việc của mình, `tokens.css` và file code liên quan. Project dùng các file/instructions được cung cấp; project thông thường không tự đọc thư mục máy tính chỉ vì prompt nhắc đường dẫn. [Projects trong ChatGPT](https://learn.chatgpt.com/docs/projects?surface=app).

1. An gửi bản Impeccable và Taste đã pin. Đổi tên **bản upload** thành `IMPECCABLE-SKILL.md` và `TASTE-SKILL.md` để tránh hai file cùng tên `SKILL.md`.
2. Với UX, thêm reference Impeccable tương ứng `reference/shape.md`, `reference/operate.md` và `reference/mode-operate.md` hoặc `reference/mode-persuade.md`; với review thêm `reference/critique.md`, `reference/audit.md`, `reference/polish.md`. Đổi tên bản upload có prefix nếu cần, giữ bảng tên gốc → tên upload. Skill nhắc tài nguyên chưa có thì bổ sung đúng file, không yêu cầu AI đoán nội dung.
3. Nếu upload bị giới hạn, paste từng phần có nhãn `TÊN FILE — PHẦN i/n`; yêu cầu chờ đủ phần rồi mới làm. Skill + reference đúng giai đoạn ưu tiên hơn dump cả repo. Gửi screenshot và code của page đang làm.
4. Dùng prompt mục 5, yêu cầu AI nêu file đã đọc, thiếu gì và quyết định áp dụng. `/impeccable audit` ở đây chỉ là văn bản nếu không có native skill integration; nói rõ “áp dụng quy trình audit từ file đã đính kèm”.
5. Chuyển flow, state matrix, token/component decisions sang Antigravity để code/test trong repo. Mang screenshot thực và lỗi test quay lại review. Không xem câu “đã kiểm thử” của chat là bằng chứng nếu không có run thật.

Không cần trả thêm Claude cho ba bạn để dùng phương pháp này. Chất lượng được đồng bộ bằng cùng input, màn mẫu và review; không hứa các model sẽ sinh kết quả giống hệt. Đây là fallback manual, không chạy được hooks/engine của Impeccable chỉ bằng upload Markdown.

### 3.4 Antigravity — Khôi, Hào, Khoa

Mở **root repo**, giải nén cùng bundle vào:

```text
.agents/skills/impeccable/SKILL.md
.agents/skills/impeccable/reference/...
.agents/skills/impeccable/scripts/...
.agents/skills/design-taste-frontend/SKILL.md
```

Giữ toàn bộ tài nguyên khác có trong bundle. Nếu máy đã có Impeccable bản nhóm trong `.claude/skills`, có thể copy bằng PowerShell:

```powershell
New-Item -ItemType Directory -Path .agents/skills -Force | Out-Null
if (-not (Test-Path .agents/skills/impeccable)) {
  Copy-Item -LiteralPath .claude/skills/impeccable -Destination .agents/skills/impeccable -Recurse
}
```

Kiểm checksum; bản đã tồn tại nhưng khác version phải xử lý rõ, không tự merge hai thư mục. Mở lại session, kiểm **Customizations** để thấy skill. Antigravity hiện dùng `.agents/skills`; `.agent/skills` là đường dẫn tương thích cũ, không duy trì cả hai bản khác nhau. [Tài liệu skills của Antigravity](https://antigravity.google/docs/skills?app=antigravity-ide).

Gửi context mục 5 và gọi bằng ngôn ngữ tự nhiên, ví dụ:

```text
Đọc .agents/skills/impeccable/SKILL.md và reference shape/operate.
Áp dụng Impeccable UX cho H01 Quầy hôm nay. Sau khi có flow/state matrix,
đọc .agents/skills/design-taste-frontend/SKILL.md để thiết kế UI theo
DESIGN-TOKENS.md; chỉ áp nguyên tắc thị giác phù hợp màn vận hành.
Không mở rộng quyền Coach hoặc tự tạo API đã hoàn thành. Chỉ sửa phạm vi file giao việc Hào.
```

Nếu phiên bản có slash command và đã nhận diện skill, dùng `/impeccable shape ...`, `/design-taste-frontend ...`; nếu không, prompt đọc file là phương án chuẩn. Nếu launcher còn chỉ tới `.claude/skills/...`, dùng đường dẫn tương ứng nơi cài thực tế; Windows có `scripts/impeccable.cmd`. Không hứa hooks Claude tự chạy trong Antigravity. Engine không chạy được vẫn làm manual UX/UI review và ghi phần tự động chưa chạy.

## 4. Quy trình bắt buộc cho một page/subpage

### Bước 0 — Đọc và khoanh phạm vi

Ghi người phụ trách, ID page, route hiện tại/đích, role, nhiệm vụ chính, API có thật và gap ID. Xem page cũ/code/screenshot trước redesign. Route trong assignment là đề xuất; lập bảng old → new có query/redirect để không mất link. Các thay đổi IA theo brief này được phép trong phạm vi đã giao; không tự đổi logo, legal copy hay quyền người dùng.

### Bước 1 — UX với Impeccable

Tạo task flow (entry → lựa chọn → xác nhận → kết quả → phục hồi lỗi), hierarchy và wireframe mobile/desktop. Trả lời “Ai đang dùng? Dữ liệu của ai? Việc tiếp theo? Hệ quả tiền/điểm/lịch?”. Lập state matrix:

| State | Bắt buộc thể hiện |
|---|---|
| Loading | Skeleton đúng cấu trúc hoặc tiến trình tác vụ; không dựng số dư giả |
| Empty / no results | Phân biệt chưa có dữ liệu với bộ lọc không khớp; CTA đúng quyền |
| Error / timeout | Lý do có thể hiểu, giữ input, retry đúng intent; không coi lỗi là danh sách rỗng |
| Forbidden / expired session | Hướng đi phù hợp; không lộ dữ liệu role khác |
| Stale / conflict / expired hold | Trạng thái mới từ server, cách chọn lại; không giữ nút thanh toán cũ |
| Success / pending verification | Hiển thị đúng mức xác nhận; link tác vụ tiếp theo, không báo Paid sớm |

Khôi review flow và màn mẫu trước khi mở rộng một pattern mới; An review shared contract kỹ thuật cùng consumer. Page chỉ dùng pattern đã duyệt không phải chờ Khôi review từng chi tiết nhỏ. API chưa có: hoàn thành wireframe và contract proposal; chưa ghi production complete.

### Bước 2 — UI với Taste Skill

Tạo một màn mẫu bằng tokens + shared components, rồi nhân rộng pattern. Thiết kế 360/390px mobile và 1440px desktop, kiểm trung gian 768/1024px. Chọn mật độ theo task; dashboard/lịch/bảng ưu tiên dữ liệu, landing ưu tiên thứ bậc nội dung và ảnh có mục đích. Chỉ dùng font/color/motion của TOKENS, không lấy mặc định thẩm mỹ từ skill.

| Pattern dùng chung | Áp dụng token, không phát minh scale |
|---|---|
| Page gutter | Mobile `--space-4`; tablet `--space-5`; desktop `--space-6` |
| Form/dialog/card padding | Mobile `--space-4`, desktop `--space-5`; card chỉ khi cần nhóm nội dung |
| Field gap / label gap | `--space-5` / `--space-2`; helper `--space-1` hoặc `--space-2` |
| Section app / landing | App `--space-6`; landing mobile `--space-8` đến `--space-9`, desktop `--space-10` đến `--space-11` |
| Table cell | Dọc `--space-3`, ngang `--space-4`; số tabular, tiền căn phải |
| Controls | Size chuẩn theo TOKENS; touch target ≥44px theo chuẩn nhóm, ưu tiên control lg 48px cho quầy/mobile. Không ép desktop phải cùng mật độ mobile |
| Layout | Dùng sidebar/header/content token đã định nghĩa; form dài có chiều rộng đọc được; bảng/lịch được nới vùng nội dung |

`--space-5` là **24px**, không phải 5px/20px; không dùng lại tên token scale cũ. Barlow Condensed dành tiêu đề/display ngắn, Be Vietnam Pro cho nội dung nghiệp vụ, JetBrains Mono cho mã; không dùng font condensed cho toàn bộ bảng. Số tiền/đồng hồ dùng tabular nums. Mobile input dùng `--text-md` để dễ đọc; nội dung quyết định thanh toán không dùng caption 12px. Inverse surface chỉ dùng theo mapping trong TOKENS, không coi đó là dark mode toàn app đã có.

### Bước 3 — Review, audit và polish

Chạy critique theo tác vụ → sửa UX lớn → audit accessibility/responsive/i18n → polish spacing, alignment, copy, focus, transition. Test page bằng dữ liệu dài, không có dữ liệu, lỗi mạng và quyền khác nhau. Desktop AI Drawer phải giữ lịch phía sau có thể đối chiếu; mobile có cách quay lại và khôi phục state.

Đầu ra một page: flow + state matrix + ảnh thực desktop/mobile + mapping API + diff + kết quả kiểm tra. Không cần tạo thêm một file quy chuẩn màu ở từng nhánh; lưu evidence trong PR.

### Checklist trước merge

- [ ] Đủ page/tab/flow/state trong assignment; không mất chức năng cũ cần giữ.
- [ ] Đọc đúng baseline hai skill; dùng đúng giới hạn của Taste đối với product UI.
- [ ] Dùng DESIGN-TOKENS và shared components; không CSS `:root` riêng theo role, không font mới.
- [ ] Có một hành động chính rõ; form có label/helper/error, giữ input khi lỗi.
- [ ] Keyboard, focus-visible, Escape/return-focus cho modal; drawer non-modal không trap focus.
- [ ] Kiểm contrast cặp màu thực, không truyền đạt status chỉ bằng màu; hỗ trợ reduced motion.
- [ ] 360/390/768/1024/1440px, zoom 200%, tiếng Việt dài và EN không che CTA/tràn toàn trang.
- [ ] Loading/empty/error/forbidden/stale/success đều có bằng chứng; không fake success khi thiếu API.
- [ ] Checkout/OTP/điểm/timer/phân quyền có kiểm chứng nghiệp vụ, không chỉ screenshot đẹp.
- [ ] `npm run typecheck`, `npm run lint`, `npm run check:i18n`, `npm run build` trong `frontend` pass; Playwright chọn luồng thay đổi. Ghi rõ check chưa chạy, không báo xanh giả.
- [ ] Owner shared review khi đổi contract; có ảnh desktop/mobile, gap còn chặn và route migration trong PR.

## 5. Prompt dùng chung — copy/paste

Thay các dấu `<...>` bằng thông tin thật. Dán **khối context** cùng một prompt giai đoạn. ChatGPT phải nhận file đã upload/paste; chỉ gõ đường dẫn không thay thế việc cung cấp nội dung.

### Context bắt buộc

```text
Bạn làm việc cho SportHub, cùng nhóm An/Khôi/Hào/Khoa.
Đọc PRODUCT.md, DESIGN-TOKENS.md, DESIGN-SKILLS-GUIDE.md,
file giao việc <tên file>, code/screenshot <file/route> và hai skill đã cung cấp.
Tôi phụ trách <người, page ID, page/subpage>. Chỉ sửa phạm vi này và shared đã thống nhất.
Impeccable phụ trách UX; Taste phụ trách UI trong phạm vi phù hợp.
Ưu tiên nghiệp vụ/quyền, usability/a11y, token, shared rồi mới đến mặc định skill.
Giữ stack Next/React + CSS Modules/CSS. Không tự thêm Tailwind/Motion/UI library.
Court & Volt là bộ token đã chốt; không tái tạo DESIGN.md từ màu cũ.
Tách rõ API hiện có / đề xuất / chưa kiểm chứng. Không mock thành công production.
Trước khi làm, nêu file đã đọc, task chính, component tái sử dụng và thông tin còn thiếu.
Không tuyên bố đã chạy tool/test nếu chỉ phân tích file hay screenshot.
```

### Prompt khởi tạo UX

```text
Áp dụng Impeccable shape cho <page ID>, mode <Persuade/Operate>.
Chưa code giao diện. Tạo: mục tiêu người dùng, entry/exit, sitemap con,
flow chính + recovery, thứ bậc nội dung, wireframe mobile/desktop,
state matrix và mapping hành động -> API/permission/gap ID trong assignment.
Chỉ ra phần dùng chung và owner; với mutation mô tả bước review và hệ quả.
Không thêm page chỉ vì có entity; không bỏ chức năng mục tiêu vì code chưa có.
```

### Prompt thiết kế UI

```text
Đọc Taste Skill đã cung cấp. Dựa trên UX <flow đã chốt>, thiết kế <page ID>.
Dùng DESIGN-TOKENS.md và <shared components hiện có>, không tự đổi màu/font/spacing.
Nếu là màn nghiệp vụ ngoài phạm vi Taste, chỉ áp nguyên tắc thị giác phù hợp;
không chuyển nó thành marketing page. Làm một màn mẫu desktop/mobile trước.
Nêu layout, typography roles, token, responsive behavior, focus và reduced-motion.
Khi triển khai, tái sử dụng component thật; dữ liệu fixture chỉ cho preview có nhãn.
```

### Prompt redesign

```text
Redesign <page ID/route> từ code và ảnh đính kèm theo assignment.
Audit trước: giữ nội dung/chức năng/quyền nào, pain point nào cản tác vụ,
component nào tái sử dụng, route/query/analytics nào cần bảo toàn.
Impeccable chỉnh flow/hierarchy trước; Taste chỉnh layout/visual sau.
Đưa before -> after có lý do, rồi thực hiện trong phạm vi được giao.
Không chỉ đổi CSS; cũng không tự sửa business rule, legal copy hoặc payment lifecycle.
```

### Prompt audit / critique

```text
Dùng Impeccable critique rồi audit <page ID>, đối chiếu assignment và TOKENS.
Đánh giá tác vụ <scenario>, keyboard/mobile, hierarchy, content, state, quyền,
và consistency với shared components. Taste chỉ review visual phù hợp.
Trả bảng: severity, vị trí/bằng chứng, ảnh hưởng, cách sửa, owner.
Tách quan sát từ ảnh/code với điều cần test runtime. Không tự cho điểm đạt khi chưa kiểm tra.
Ưu tiên sai tiền/điểm/quyền/tác vụ bị chặn trước lỗi thẩm mỹ; chưa sửa ngoài scope.
```

### Prompt polish cuối

```text
Áp dụng Impeccable polish cho <page ID> theo backlog review <danh sách>.
Rà Taste pre-flight trong phạm vi phù hợp: alignment, rhythm, typography,
ảnh, motion và chống AI-slop. Giữ flow đã duyệt và DESIGN-TOKENS.md.
Sửa các lỗi đã xác nhận; kiểm label VI/EN, focus, loading/error, text dài,
responsive và reduced-motion. Chạy check khả dụng, chụp kết quả thật.
Trả danh sách file đổi, lỗi còn lại, API blocker và test đã/chưa chạy.
Không kết luận production-ready khi còn gap nghiệp vụ P0 liên quan.
```

## 6. Page/subpage và người phụ trách

Đây là sitemap mục tiêu. **D** = page/detail; **T** = tab; **F** = flow; **O** = overlay. Các bảng trong assignment chứa route, nội dung, CTA và tiêu chí nghiệm thu từng ID; không biến mọi tab/dialog thành page độc lập.

| Owner / ID | Page chính → subpage/flow | Skill ưu tiên sau context |
|---|---|---|
| An A01–A04 | Tổng quan; Khám phá dùng catalog Khôi; Lịch lớp + PT → chi tiết; Khóa của tôi → ghi danh/lịch/điểm danh | UX Operate → UI có mật độ vừa |
| An A05–A09 | Gym & PT → Membership/lịch sử Gym; gói PT/quota; đặt PT; chi tiết buổi → yêu cầu hủy/đổi lịch; yêu cầu đổi HLV | UX điều kiện/quota/conflict → UI form |
| An A10–A11 | Tập luyện → hồ sơ, kế hoạch, kết quả, tiến độ, homework | UX relationship/quyền → UI nội dung |
| An A12–A15 | Tài chính → ví/ledger; hóa đơn/detail; yêu cầu hoàn/theo dõi; shared checkout → điểm → VNPay → kết quả | UX tiền/trạng thái trước UI |
| An A16–A20 | Phản hồi ngưỡng 3 phương án; inbox thông báo; AI Member Drawer; nguyện vọng khóa sau; thẻ hội viên mã/QR | UX ngoại lệ, context, quyền |
| Khôi K01–K03 | Landing; Bộ môn → chi tiết; Khóa học → lọc/chi tiết/lịch toàn khóa | UX Persuade → Taste đầy đủ |
| Khôi K04–K07 | Gym → Membership; PT → hồ sơ HLV; Sân → chi tiết/lịch trống; Dành cho HLV ngoài | UX chọn dịch vụ → Taste |
| Khôi K08–K10 | Về trung tâm/cơ sở vật chất; Liên hệ; Hỗ trợ/FAQ/chính sách | UX nội dung → Taste |
| Khôi K11–K17 | Login; Member register/OTP; ExternalCoach register/OTP/Pending; forgot/reset; Google onboarding; account/profile/security/language; trang lỗi/phiên | UX auth → UI shared |
| Khôi K18–K25 | ExternalCoach: tổng quan; tìm sân/chọn slot/review; pending/payment; rentals/detail; hủy; đặt lại; ví/hóa đơn; hồ sơ | UX Operate → UI shared |
| Hào H01–H04 | Quầy hôm nay; hội viên → hồ sơ; hỗ trợ đăng ký; Gym check-in/out/danh sách đang ở Gym | UX tốc độ/nhận diện → UI quick actions |
| Hào H05–H11 | Bán dịch vụ → Member/sản phẩm/checkout/OTP; điểm danh/roster; lịch sân/detail; hóa đơn; tạo hộ refund; ví Member | UX thao tác/quyền → UI dense |
| Hào H12–H15 | Coach tổng quan; lịch dạy/detail; lớp/roster; học viên PT/hồ sơ | UX scope/relationship → UI lịch |
| Hào H16–H20 | Plan tạo/sửa/detail; kết quả/tiến độ; homework; buổi PT/detail; AI gợi ý → review/edit/draft/apply | UX human review → UI editor |
| Khoa Q01–Q07 | Manager tổng quan/lịch; lớp list/create/edit/detail; publish/dời/bù/hủy; xử lý ngưỡng | UX tác động/flow → UI bảng/form |
| An Q08–Q12 | Nguyện vọng khóa sau; PT relationship/sessions/requests; Member profile vận hành | UX quyền/quota → UI dùng chung |
| Khoa Q13–Q18 | HLV trung tâm; duyệt HLV ngoài; sân/phòng/loại sân; incident preview/resolve/detail/history; notices compose/preview/delivery | UX ngoại lệ trước UI |
| An Q19–Q23 | Hóa đơn; refund queue/review; ví/ledger/adjustment; báo cáo; export/history/download/retry | UX tiền/async → UI bảng/biểu đồ |
| Khoa Q24–Q27 | Danh mục môn/Gym/PT/rental rates; settings; audit/detail | UX validation → UI theo mẫu đã duyệt |
| Khoa Q28 | Manager AI xếp lịch → review/edit/draft trong ClassEditor | UX human review → UI shared Drawer |
| Khoa Q29–Q33 | Admin tổng quan; users list/detail; tạo nhân sự; đổi role/khóa/mở; audit log/detail | UX authorization → UI shared |

Landing K01 gồm **14 section**: Header → Hero → tìm khóa → Bộ môn → khóa đang mở → Gym & PT → sân/lịch trống → cơ sở vật chất → HLV → cách bắt đầu → HLV ngoài → FAQ → địa điểm/liên hệ → Footer. Khôi chịu trách nhiệm nội dung, nguồn dữ liệu, CTA, ảnh hợp lệ, SEO và responsive từng section; chi tiết ở assignment Khôi. Không thêm testimonial, số hội viên, thành tích hay form gửi thành công giả để lấp section.

**ID Q được giữ để truy vết, không còn đồng nghĩa owner Khoa.** Tổng 98 mục được chia: An 30 (A01–A20 + 10 Q), Khôi 25 (K01–K25), Hào 20, Khoa 23 (9 Q gốc + 14 Q nhận từ Khôi ngày 05/10/2026). Đây là số mục page/tab/flow, không phải 98 page độc lập hoặc thước đo công sức bằng nhau. Khoa giữ cấu hình/nhật ký/Admin và vận hành Manager (lớp, HLV, sân, sự cố, notices, AI); tài chính/PT/báo cáo thuộc An.

Manager vẫn có **một sidebar**, An tích hợp route config từ ba owner: Điều hành (tổng quan/lịch/lớp/PT/sự cố/thông báo); Khách hàng & HLV; Tài chính (giao dịch/ví/báo cáo); Cấu hình (sân/danh mục/tham số/nhật ký). Không chia menu theo tên người code hoặc tạo sidebar phẳng hơn 20 mục. Saved filters/tabs không tự thành mục menu. Admin giữ shell role riêng, không có menu tài chính Manager.

## 7. Thành phần dùng chung — một owner, nhiều consumer

**Dùng chung** nghĩa là chung code/contract/tokens và trạng thái, có variant/slot hợp lệ theo ngữ cảnh. Không bắt header Guest và header nhân viên giống từng pixel, cũng không copy component rồi chỉnh màu riêng.

| Thành phần **dùng chung** | Owner | Cách sử dụng / ranh giới |
|---|---|---|
| Design tokens và primitives: Button, Field, Select, Table, StatusChip, Dialog/Drawer, PageHeader | **An** | Cả nhóm import; thêm variant qua owner. An giữ root layout/global CSS, không nhận bốn bản `:root` |
| Triển khai Table/FilterBar/StatusChip và các state trong đợt tuần | **Khoa thực hiện; An giữ owner kỹ thuật** | Task N-KO theo contract An; Khôi review mẫu. Merge một bản dùng chung, Khoa không nhận toàn bộ design system |
| Header nền tảng, BrandLogo, slots actions, language | **An**; Khôi làm variant Guest | Guest có public nav/login; app có role nav/notification/account. Một logo, một quy tắc focus/height; không 6 header độc lập |
| Footer | **Khôi** | Guest đầy đủ contact/policies; app dùng variant gọn hoặc ẩn theo shell, không tự tạo footer khác |
| AccountMenu + account/security forms | **Khôi** | An gắn vào AppShell; cùng Profile/Security/Language/Logout và trạng thái session; không trùng training profile |
| Notification bell/dropdown/panel/inbox | **An** | Mọi role theo quyền backend; unread/read/read-all/deep link/failure thống nhất. Khoa sở hữu composer gửi tin Q18 |
| Loading / Empty / Error / Forbidden / Conflict | **An** | Cùng API component, content/CTA theo task; không tạo error page/card tùy role |
| AppShell/MemberShell, breadcrumbs/navigation | **An** | Hào/Khoa/Khôi portal cung cấp cấu hình role; Guest shell Khôi dùng nền tảng header/footer chung |
| **Payment flow**: Checkout, PointsSelector, HoldCountdown, OTP, result, invoice, ledger, refund quote | **An** | Member, quầy, ExternalCoach dùng adapter; Manager dùng read/review variant. Không fork tính điểm, timer, callback |
| Calendar, event drawer, MemberSearch, QuickActions, AttendanceBoard | **Hào** | Consumer gắn DTO theo quyền; public chỉ projection an toàn. An cung cấp Drawer primitive |
| AI Drawer experience + Review/Edit wrapper | **Hào** | Member/Coach/Manager giữ cùng loading/error/cancel UX; mỗi role có adapter/quyền riêng; không tự save |
| CourseCard/catalog/detail | **Khôi** | An reuse discovery; ClassEditor là nghiệp vụ Manager riêng, dùng primitives An, không fork public card |
| IncidentWorkbench, Manager AI adapter, NoticeComposer | **Khoa** | Tái dùng primitives/finance/calendar/AI wrapper; kết quả nghiệp vụ từ server |
| Manager PT/Member, finance, Reports/Export | **An** | Chung financial primitives và Calendar Hào; Khôi review hierarchy/visual |
| ClassEditor/ThresholdManager (Manager) | **Khoa** | Dùng primitives An, không fork public CourseCard của Khôi; Khôi review màn mẫu |
| Catalog/settings, AdminUsers, AuditLog views | **Khoa** | Dùng template An/Khôi đã chốt; CAT-01 do An giữ contract/migration |

Consumer yêu cầu owner bằng mẫu `component — page ID — state/props cần — ví dụ — hạn tích hợp`. Owner thêm variant và ví dụ usage trong PR; consumer không sửa âm thầm file shared. Hào sở hữu hành vi AI/calendar, An sở hữu primitive: không hai người dựng hai Drawer API. Cả nhóm dùng chung icon convention hiện có; thư viện mới phải qua owner và package review.

**Phân quyền lead:** Khôi chịu trách nhiệm flow/layout/hierarchy/visual consistency; An chịu trách nhiệm component API, token CSS, cascade và kỹ thuật accessibility. Thay đổi token/shared variant cần Khôi review trải nghiệm và An review triển khai. Token Court & Volt đã chốt, vai trò lead không cho phép tự chọn lại palette. Khoa không làm người duyệt cuối hoặc tổng hợp API cho các phần đã chuyển.

## 8. Các flow nghiệp vụ phải đồng nhất

- **Đặt dịch vụ:** lớp mua toàn khóa; Gym bằng Membership; PT mua riêng sau Membership Active; thuê sân chỉ ExternalCoach Approved. Không tự biến thành đặt lẻ buổi lớp nhóm.
- **Split payment:** chọn/dùng ví điểm trước → xác nhận → phần chênh lệch VNPay. Hiện đủ tổng VND, điểm khả dụng/đang giữ, điểm chọn/quy đổi, số VND còn lại. Có thể chọn ít điểm hơn hoặc 0; không trừ điểm chỉ vì mở trang. `1 điểm = 1.000 VND`; 0 VND còn lại dùng luồng xác nhận điểm, không redirect VNPay vô ích.
- **Quầy dùng điểm:** cần OTP email Member đúng checkout/revision; thay người thụ hưởng/số điểm phải xử lý lại xác nhận. OTP deadline riêng, gửi lại OTP không kéo dài hold.
- **Pending checkout:** countdown lấy `expiresAtUtc` và `serverNowUtc`, không reset khi reload, không hard-code 15 phút. Hết hạn khóa action cũ, đọc server; backend nhả hold/slot/điểm theo lifecycle và reconciliation. FE refresh availability, không tự hứa slot chắc chắn trống đúng giây 0. Gateway return không tự xác nhận Paid; callback muộn/replay cần xử lý thật.
- **AI:** mở từ dashboard/lịch bằng slide-over. Desktop non-modal không che/khóa lịch, không `aria-modal=true`/trap focus; mobile modal/fullscreen quản lý focus và lưu context. Coach/Manager phải **Xem lại & Chỉnh sửa → Lưu nháp / Áp dụng** qua API có quyền, revalidate conflict; gợi ý không tự commit. Đổi Member không giữ draft người cũ.
- **Quầy hôm nay:** search SĐT/mã/QR ở trung tâm, xác nhận đúng người; check-in/check-out/điểm danh là quick actions có nhãn. QR nhận diện không thay auth/check-in. Shortcut có hiển thị và không kích hoạt khi đang gõ input.
- **Lớp thiếu ngưỡng:** chung Dialog/Notification ba lựa chọn **Chuyển lớp tương đương / Chờ đợt sau / Hoàn 100% điểm**. Chờ đợt sau **hoàn điểm ngay + nhận thông báo khóa sau**; không giữ tiền, slot hoặc tự ghi danh. Refund + interest phải atomic/idempotent (G02).
- **Maintenance:** Manager khóa sân phải thấy preview lớp/PT/rental bị ảnh hưởng, phương án dời/bù/hủy, bồi hoàn và thông báo ngay trên workbench. Đọc rõ giới hạn backend G06; không hiển thị “đã xử lý tất cả” nếu chỉ hoàn thành một bước.
- **Dialog rủi ro:** tiêu đề hành động → đối tượng → hệ quả lịch/điểm → lý do → Hủy / nút xác nhận cụ thể. Timeout kiểm lại intent; không bấm lại gây giao dịch trùng.

## 9. Quy tắc chống AI-slop

- Không palette/font khác theo role; không raw hex ngoài token, trừ nội dung/asset hợp lệ có giải thích. Không ép xóa mọi `px`: border 1px, breakpoint và kích thước media có thể cần giá trị riêng.
- Không gradient trang trí, glass toàn trang, blob ngẫu nhiên, emoji thay icon, card lồng card hay 3-card grid lặp vô nghĩa. Grid ba cột vẫn hợp lệ nếu nội dung thật cần so sánh; quyết định theo nội dung, không luật máy móc.
- Một CTA chính trong một vùng làm việc. Label mô tả kết quả: “Gửi yêu cầu hoàn điểm”, không “OK/Submit” cho mọi nơi.
- Không KPI/chart chỉ để trang trông giống dashboard; phải có kỳ đo, đơn vị, nguồn và tác vụ tiếp theo. Không bịa dữ liệu khi API lỗi.
- Ảnh có mục đích/quyền dùng; giữ tỷ lệ và kích thước để tránh layout shift. Không stock photo ngụ ý đó là trung tâm thật. Không carousel/video autoplay chỉ để trông hiện đại.
- Dùng khoảng trống, typography và divider để tạo hierarchy trước khi thêm card/shadow. Bảng giữ header/đơn vị và số dễ so sánh; mobile có list hoặc vùng scroll được ghi nhãn.
- Motion chỉ báo thay đổi/focus/navigation; dùng duration/easing token, tôn trọng reduced-motion. Không trì hoãn check-in hay submit để chạy animation.
- UI phải đọc được VI/EN, lỗi dài, tên dài. Nhãn/placeholder/aria-label có locale; placeholder không thay label.
- Không đổi logo, pháp lý hay route SEO âm thầm. Canonical `/courses` giữ tương thích alias `/classes`; lập mapping khi di chuyển page.

## 10. Đồng bộ và giao hàng

| Mốc | An | Khôi | Hào | Khoa |
|---|---|---|---|---|
| M0: bản chuẩn | Chia bundle; tokens/primitives/shell/checkout contract | Hero/CourseCard và mẫu public; dẫn review UX/UI bốn mẫu (gồm class/incident của Khoa) | Quầy/Calendar/AI Drawer mẫu | Table/State theo contract An, dùng vào Admin mẫu; đọc G10 |
| M1: hành trình chính | Member/payment; Manager PT/Member/finance/reports | Guest/auth (tiếng Anh)/rental | Quầy/check-in/sales/attendance; Coach/PT result | Catalog/settings/audit/Admin; Manager lớp/HLV/sân/incident/notices |
| M2: gap/ngoại lệ | G02/G05/G08/G11/CAT-01 và D01–D05/D07/D08 | G01/G09; consumer G11 | G04/G12/D06; shared AI review | G10; G03/G06/G07/G13; consumer CAT-01 theo contract An |
| M3: tích hợp | Shared/contract/financial/export/PT regression | UX/UI consistency và public/auth regression | Scope/keyboard/calendar/context regression | Kiểm 23 mục của mình: Manager vận hành, auth/audit/config |

An dùng Claude để chuẩn bị nền tảng và review shared, **không trở thành người code thay toàn bộ nhóm**. Khôi là người mạnh UI/UX nhất nhóm, giữ review flow/màn mẫu và thay đổi lớn; không cần duyệt từng padding của page đã dùng pattern chuẩn. Ba bạn dùng ChatGPT để shape/critique, Antigravity để code/browser/test, rồi gửi cùng bộ evidence. Mỗi PR một vertical slice gồm page + states + API integration; không gom toàn bộ màu/global CSS vào cuối kỳ.

PR ghi: owner/page IDs; flow; shared reuse/variant; token thay đổi nếu có; API đã nối + G/D liên quan; ảnh desktop/mobile + lỗi/empty; test thực đã chạy; blocker. Mỗi người cập nhật phần API trong **chính assignment mình**. An điều phối contract dùng chung; Khôi điều phối review UX/UI; chủ page cập nhật tiến độ riêng. Không giao Khoa tổng hợp toàn nhóm hoặc tạo lại API plan riêng.

### Có thể bắt đầu song song

Cả bốn có thể bắt đầu song song. An ưu tiên tokens/primitives/shell và contract checkout; Khôi ưu tiên mẫu và review UX/UI; Hào dựng Calendar/AI contract; Khoa làm flow/catalog/Admin mẫu rồi Manager vận hành. Chưa có component thì dùng contract/fixture có nhãn để làm flow; không tạo bản shared thứ hai. Tích hợp theo từng phần hoàn thành, không đợi cuối kỳ.


### API liên vai trò và điều kiện đóng việc

| Primary owner | Gap/legacy chính | Consumer cần phối hợp |
|---|---|---|
| An | G02, G05, G08, G11, CAT-01; D01–D05, D07, D08 | Khoa ngưỡng/incident; Khôi payment rental; Hào quầy; Khoa catalog theo schema |
| Khôi | G01, G09 | An financial; Hào Calendar/AI |
| Hào | G04, G12; D06 | An QR và Manager Member/PT scope; Khoa Admin detail regression |
| Khoa | G03, G06, G07, G10, G13 | An hỗ trợ kỹ thuật shared; Hào Calendar/AI; kiểm tránh mở rộng StaffRead cho G10 |

Primary owner chịu trách nhiệm đặc tả, phối hợp sửa backend, nối FE và evidence nghiệm thu phần của mình; không có nghĩa một người sở hữu tất cả file backend liên quan. Contract dùng chung phải review với consumer. **P0** (G02/G11/G12) chặn nghiệm thu luồng liên quan; sửa quyền G10 trước bàn giao Admin detail. Sau đó public/QR, PT/AI, incident/notices/catalog; G08 và retire legacy làm sau khi có bằng chứng cần thiết.

- API mới giữ wire casing/envelope hiện tại; cập nhật OpenAPI và FE types cùng nhau. Instant UTC, hiển thị `Asia/Ho_Chi_Minh`; DateOnly tách timestamp. Giá VND/điểm do server quyết định.
- Pagination có range cap/order/hasMore rõ. Mutation giữ chỗ/tài chính có idempotency/revision/transaction; backend kiểm actor ownership/relationship, không tin role/MemberId từ UI hay model AI.
- Ví/lịch/dashboard có thể compose API hiện có; tab mới không đồng nghĩa endpoint mới. FAQ/contact có thể là nội dung versioned. `.ics` có thể sinh từ lịch đã được phép đọc; export báo cáo dùng API thật.
- Trước retire API: kiểm frontend/tests/scripts/integrations, canonical replacement, OpenAPI deprecation, logs nếu có, compatibility và regression. Không có FE caller **không đủ kết luận API thừa**. Callback, audit/history, by-key/by-reference và endpoint role khác phải giữ theo nhiệm vụ.
- Regression liên quan: tranh slot cuối, hold/release điểm, OTP/revision, callback late/replay, refund/interest retry, incident không double credit, Coach scope, PT quota/calendar và export ownership. Concurrency cần integration DB thật. Mock VNPay chỉ Development + bật UseMock rõ ràng; thiếu credentials không được tự fallback và mock không chứng minh gateway thật hoạt động.

## 11. Nguồn và cách duy trì

Tài liệu dự án: [nguồn chuẩn](docs/00-Source-of-Truth.md), [thiết kế hệ thống](docs/Center-Management-System-Design-v3.md), [API contract](docs/api-contract.md), [frontend README](frontend/README.md). Hai skill được đọc trực tiếp từ bản local nói ở mục 1; hướng dẫn cài được đối chiếu nguồn chính thức ngày 04/10/2026. Khi tool đổi giao diện/command, cập nhật mục 3 theo bản nhóm dùng; không đổi chuẩn UI để chạy theo mặc định tool.

Guide này và bốn assignment thay bộ giao việc cũ; **DESIGN-TOKENS.md giữ nguyên vai trò nguồn token duy nhất**. Thay đổi token phải có Khôi review UX/UI, An review triển khai, ảnh so sánh trên bốn màn mẫu và kiểm contrast thực tế trước merge.
