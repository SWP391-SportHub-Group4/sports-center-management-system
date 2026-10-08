# Giao việc An — Nền tảng, Member, PT và tài chính Manager

SportHub là **hệ thống quản lý trung tâm thể thao với ba môn Gym (bao gồm PT), cầu lông và bóng rổ; có thể mở rộng thêm môn trong tương lai**. PT là dịch vụ thuộc Gym, không phải môn thứ tư.

Mục tiêu: giữ nền tảng frontend dùng chung; hoàn thiện Member và phía Manager cho PT/Member/tài chính/báo cáo. **An giữ kỹ thuật nền tảng; Khôi là UI/UX Lead** chốt mẫu trải nghiệm và visual.

Đọc bắt buộc: [DESIGN-SKILLS-GUIDE](../../DESIGN-SKILLS-GUIDE.md), [DESIGN-TOKENS](../../DESIGN-TOKENS.md), [PRODUCT](../../PRODUCT.md) và [nguồn nghiệp vụ](../00-Source-of-Truth.md). Kế hoạch API nằm ngay cuối file này. **Dùng cả Impeccable (UX) và Taste (UI) theo guide; DESIGN-TOKENS là chuẩn duy nhất.**

## Bắt đầu tuần 05–11/10

- **Làm trước:** Bật token và shell; bàn giao Button/Form/Dialog/Drawer, props Table/State và checkout để cả nhóm dùng.
- **Thứ tự trang:** Checkout/ví/hóa đơn → Member chính → Tập luyện/PT Manager → Finance/reports → các màn gap/AI.
- Bảng tên trang, hạn mục tiêu và tiêu chí xong: [kế hoạch FE một tuần](KE-HOACH-FE-1-TUAN.md). Phần bên dưới giữ đặc tả đầy đủ để tra khi làm từng trang.
- Chỉ ghi “Hoàn thành” khi UI + API thật + kiểm chứng đạt; fixture có nhãn là “Xong UI – chờ API”. Không chờ toàn bộ backend/shared xong mới bắt đầu.


## 1. Phạm vi và phối hợp

- Owner: tokens, primitives, AppShell/MemberShell, navigation config, notification experience; Member portal; checkout/OTP/ví/hóa đơn/refund primitives dùng chung.
- Khôi sở hữu public course catalog/detail và auth/account. Member discovery dẫn tới hoặc nhúng các component đó, không clone catalog.
- Hào sở hữu Calendar và AI experience trên Drawer primitive của An; An nối dữ liệu Member.
- An trực tiếp sở hữu Q08–Q12 và Q19–Q23: nguyện vọng, PT/Member vận hành, tài chính/báo cáo/export Manager. Khoa sở hữu UI lớp/sân/sự cố/notices/AI Manager (nhận từ Khôi 05/10) cùng cấu hình/Admin theo bảng phân công mới.
- Checkout lễ tân chỉ là adapter và context riêng; không fork logic points/expiry.

Menu desktop (tám mục): **Tổng quan · Khám phá · Lịch của tôi · Khóa học của tôi · Gym & PT · Thuê sân · Tập luyện · Tài chính**. Header sticky một hàng: logo và badge Member, menu ở giữa, bên phải là mã Member (nút tròn chỉ icon), ngôn ngữ, chuông, avatar. Menu nằm trên cùng hàng từ 1360px; dưới đó thu vào drawer qua nút hamburger. Lời chào và ngày là page header riêng bên dưới thanh header. Mobile: Tổng quan, Lịch, Dịch vụ, Tài chính, Thêm.

## 2. Page và subpage phải giao

Route dưới đây là đề xuất; ưu tiên giữ link cũ bằng alias/redirect có bảo toàn query. D = page/detail; T = tab; F = flow; O = overlay.

| ID | Page chính → subpage | Route/kiểu đề xuất | Nội dung và hành động |
|---|---|---|---|
| A01 | Tổng quan | `/member`, D | Lịch hôm nay, buổi tiếp theo, Membership/quota, số điểm, checkout đang chờ, việc cần phản hồi. CTA theo dữ liệu thật (đã có: dải Cần bạn xử lý gồm hóa đơn, lớp dưới ngưỡng, Membership sắp hết, PT còn ít buổi; thẻ Gym có số ngày còn lại và trạng thái đang ở Gym; thẻ PT có nút đặt buổi) |
| A02 | Khám phá → Danh mục/chi tiết | `/courses`, `/courses/[id]`, `/gym`, `/personal-training`; dùng component Khôi | Bộ lọc, lịch toàn khóa, giá, chỗ còn; quay lại sau login và đưa đúng intent vào checkout |
| A03 | Lịch của tôi → Chi tiết buổi | `/member/schedule`, D + O | Ngày/tuần/tháng/list, lớp và PT chung timeline; room/coach, trạng thái, buổi bù; xuất `.ics` phía client nếu đủ dữ liệu |
| A04 | Khóa học của tôi → Chi tiết ghi danh | `/member/courses`, `/member/courses/[classId]`, D | Tabs Sắp học/Đang học/Lịch sử; lịch từng buổi, điểm danh của chính mình, invoice và yêu cầu hoàn liên quan |
| A05 | Gym & PT → Membership | `/member/services?tab=gym`, T | Gói đang hiệu lực/sắp có hiệu lực/hết hạn; ngày bắt đầu-kết thúc; mua/gia hạn; lịch sử check-in/out |
| A06 | Gym & PT → Gói PT | `/member/services?tab=pt`, T → detail | Coach, Membership liên kết, quota đã dùng/còn/chờ bảo lưu/hết hạn; mức frequency chỉ để tính quota, không chặn cứng mỗi tuần |
| A07 | Gói PT → Đặt lịch | `/member/pt/book`, F | Chọn giờ theo Coach được phép, kiểm tra ngày/90 phút/quota/conflict, review. **G05** đã có API (xem api-contract); giao diện đã làm: chọn ngày, giờ, phòng, xác nhận, báo "vừa có người đặt" khi 409 |
| A08 | Buổi PT → Chi tiết → Hủy/đổi lịch | `/member/pt/sessions/[id]`, D + F (đã làm: form chỉ mở khi bấm, quy tắc 24 giờ, yêu cầu chờ duyệt ghi rõ lịch chưa đổi) | Lịch hiện tại, thời hạn 24 giờ, ảnh hưởng quota; hiện tại gửi change request, không giả thao tác đổi lịch đã hoàn tất |
| A09 | Gói PT → Yêu cầu đổi HLV | Form lồng trong `/member/services?tab=pt` + lịch sử yêu cầu | Lý do, Coach đề xuất hợp lệ, đang chờ/duyệt/từ chối; các buổi bị conflict giữ trạng thái cần xử lý |
| A10 | Tập luyện → Hồ sơ | `/member/training?tab=profile`, T | Mục tiêu/trình độ/thông tin được phép cập nhật, validation. `/member/profile` chuyển hướng về đây |
| A11 | Tập luyện → Kế hoạch / Kết quả / Tiến độ | `/member/training?tab=...`, T → D | Xem kế hoạch và nhận xét riêng mình; chỉ đọc nội dung Coach tạo. Tab: Buổi tập · Kế hoạch · Kết quả · Tiến độ · Hồ sơ, kèm dải tóm tắt HLV/quota/buổi tiếp theo |
| A12 | Tài chính → Ví điểm | `/member/finance?tab=wallet`, T | Available/Held, quy đổi VND, ledger Hold/Spend/Release/Earn/Adjustment, link invoice/source |
| A13 | Tài chính → Hóa đơn → Chi tiết | `/member/finance?tab=invoices`, `/member/invoices/[id]`, D | Từng item, giá snapshot, points/cash, lịch sử payment và adjustment; tiếp tục thanh toán/hủy checkout nếu hợp lệ |
| A14 | Hóa đơn → Tạo yêu cầu hoàn → Theo dõi | D + F (đã làm: form chỉ mở khi bấm, ước tính điểm kèm VND, thông báo chưa hoàn điểm đến khi Manager duyệt) | Quote theo item, chính sách, số điểm server tính, lý do, hệ quả quyền lợi; Requested/Completed/Rejected. G08 nếu cần danh sách tổng hợp độc lập |
| A15 | Checkout → Chọn điểm → VNPay → Kết quả | `/checkout/[invoiceId]`, F; `/payments/return` | Shared cho ba người mua; nhận identity từ server, không dựa role trong URL |
| A16 | Ngưỡng mở lớp → Phản hồi ba phương án | `/member/threshold-responses/[responseId]`, D; entry email token | Chuyển lớp / Chờ đợt sau / Hoàn 100% điểm; deadline, hệ quả, xác nhận và kết quả; G02 |
| A17 | Thông báo → Chi tiết/đi đến tác vụ | `/notifications`, D + header bell | Tất cả/chưa đọc, read/read-all; link đúng đối tượng; mỗi role chỉ dữ liệu được phép |
| A18 | AI Assistant | Drawer từ dashboard/lịch | Hỏi lịch hôm nay, kết quả có link mở buổi, timestamp; không điều hướng rời lịch  Đã làm trên dashboard: nút Hỏi SportHub mở Drawer dùng chung (modal; chưa phải slide-over không chặn như thiết kế), gợi ý câu hỏi, luồng giữ `previousInteractionId`, dừng/thử lại, văn bản thuần, liên kết nhanh tới lịch/dịch vụ/tài chính. Chưa có link mở đúng buổi vì câu trả lời là văn bản tự do. |
| A19 | Khóa học của tôi → Nguyện vọng khóa sau | `/member/courses?tab=interests`, T | Lớp nguồn, môn muốn nhận tin, điểm đã hoàn, trạng thái nhận tin, khóa mới được gợi ý; hủy nhận tin không thu hồi điểm; G02 |
| A20 | Thẻ hội viên → Mã/QR nhận diện | O từ dashboard hoặc account | Mã dễ đọc + QR backend cấp, trạng thái/hạn nếu có; QR chỉ nhận diện để lễ tân tra cứu, không chứng minh quyền vào Gym; G04 |

Tài khoản, mật khẩu, Google linking do Khôi làm trong `/account`; An cung cấp entry và shell đúng role. Không tạo trang Member profile trùng nội dung account; training profile là phần riêng.

## 3. Checkout — đặc tả bắt buộc

Desktop hai cột: trái thông tin dịch vụ/điểm/thanh toán, phải tóm tắt đơn sticky; mobile một cột, tổng tiền và CTA dễ tiếp cận. Timer trong summary và vùng bước thanh toán, cùng một clock source.

Ví dụ hiển thị: **Tổng 300.000đ → Dùng 200 điểm (200.000đ) → Thanh toán VNPay 100.000đ**. Có nút “Dùng tối đa”, input số nguyên và lựa chọn không dùng điểm; không ép thanh toán bằng hết ví.

Luồng:

1. Từ dịch vụ, người dùng chủ động bấm tiếp tục. Tạo checkout bằng API loại dịch vụ + idempotency key; server giữ tài nguyên nếu loại dịch vụ cần giữ.
2. Đọc tổng tiền/số dư/expiry/revision/beneficiary. Hiển thị chính xác đơn của ai và ai thao tác tại quầy.
3. Self buyer chọn điểm qua API self. Receptionist chỉ gửi yêu cầu OTP, Member đọc mã; sau verify mới giữ/trừ theo backend. Không ghi điểm optimistic.
4. Nếu cash = 0: CTA “Xác nhận thanh toán bằng điểm”, dùng points confirmation workflow, không tạo VNPay attempt.
5. Nếu cash > 0: tạo payment attempt, render hướng dẫn và VNPay/payment URL theo contract thật. Nhãn mock gateway chỉ dùng môi trường demo.
6. Khi trở lại: đọc checkout/invoice từ backend, dựa fulfillmentOutcome. URL return không chứng minh đã thu tiền.
7. Reload/network timeout phục hồi bằng checkout ID/key/reference; không tạo đơn mới chỉ vì response lần đầu thất lạc.

State cần thiết kế: điểm = 0; đủ điểm; split; vượt số dư; điểm thay đổi ở tab khác; OTP sai/hết hạn/đủ số lần sai; đổi điểm cần OTP lại; hold gần hết/hết; VNPay pending/fail; đã thu cần đối soát; thanh toán muộn giữ lại được chỗ; thanh toán muộn không còn chỗ được bồi hoàn; cancel checkout; click đôi.

Frontend không có quyền “release slot”. Khi timer về 0, dừng action cũ, refetch; backend job/lifecycle xử lý release. Không hiển thị thành công hay thất bại cuối cùng trước khi xác minh.

Không có giỏ hàng nhiều dịch vụ trong đợt này: contract checkout hiện theo một intent. Không gộp mua Membership mới và PT cùng checkout.

## 4. Phản hồi lớp không đủ ngưỡng

Notification nhỏ dẫn tới page đầy đủ; không buộc đọc lịch và chênh lệch giá trong một dialog chật. Trên page có ba radio-card bằng nhau, không chọn sẵn quyết định tài chính:

| Lựa chọn | Nội dung trước xác nhận |
|---|---|
| Chuyển lớp tương đương | Các lớp cùng môn hợp lệ, lịch/Coach/chỗ còn/giá; quote chênh; giá cao hơn mở checkout; chỉ chuyển sau fulfillment |
| Chờ đợt sau | **Đã chốt: hoàn 100% bằng điểm ngay + lưu nguyện vọng nhận tin khóa mới cùng môn.** Xem lại/hủy nhận tin tại A19; không tự giữ chỗ/ghi danh, không bảo lưu giá cũ; chưa có ngày khai giảng thì nói rõ |
| Hoàn 100% vào ví | Số điểm thực tế theo server và dòng dịch vụ; quyền lợi cũ kết thúc; không ghi “hoàn tiền về ngân hàng” |

Trạng thái: còn hạn/chưa phản hồi; đã chọn; cần thanh toán chênh; deadline hết; lớp mới hết chỗ; lớp đã đổi trạng thái; link thuộc tài khoản khác. Chọn cuối cùng cần confirm; không để back button sửa quyết định đã commit. G02 chặn nghiệm thu phương án “Chờ đợt sau” nếu backend chưa hỗ trợ.

## 5. API và code tái sử dụng

| Nhu cầu | API hiện có / dependency |
|---|---|
| Membership/PT | `GET /api/members/me/packages`; `/api/members/me/pt-entitlements`; POST checkout membership/PT và quote PT |
| Lịch | `GET /api/members/me/schedule` chỉ lớp; ghép với `GET /api/members/me/pt-sessions`, phân trang đầy đủ |
| Ghi danh | `GET /api/members/me/enrollments`; `/api/members/me/classes/{id}/sessions` |
| Ví | `GET /api/wallet/me`, `/api/wallet/me/ledger` |
| Checkout | POST các route `/api/checkouts/membership`, `/class`, `/pt`; GET by-key/by-reference/id; confirm-points/attempts/cancel/retry |
| Điểm tự dùng | `POST /api/wallet/me/checkouts/{invoiceId}/points`; selection state qua invoice endpoint |
| Hóa đơn/hoàn | `GET /api/members/me/invoices`, `/api/invoices/{id}`; refund quote và POST `/api/refunds`; adjustments có trong invoice detail |
| Ngưỡng | GET/POST `/api/class-threshold-responses/...`; transfer quote; bổ sung G02 |
| AI | `POST /api/ai/chat` hiện chỉ Member; dùng server data, không thêm write action |
| Workout | APIs training-profile, workout-plans/results và progress đang có; dùng đúng owner scope |

Code đầu vào: `frontend/src/features/payments`, `features/wallet`, `features/training`, `features/pt`, `app/member`, `components/MemberShell.tsx`, `components/ui.tsx`, `shared/lib/clock.ts`. Đọc logic trước khi thay layout. Không xóa idempotency/reconciliation vì khó thiết kế.

Mapping route cũ: `member/class-schedule` → lịch; `my-registrations` → khóa học; `my-plans` → Gym & PT; `wallet/invoices` → Tài chính; `profile` → training profile; các threshold aliases → một flow giữ nguyên token/ID. Giữ bookmark và email links; không đổi tên API theo tên page mới.

## 6. Trình tự và tiêu chí nghiệm thu

1. Bàn giao token/component/shell/route contract trước, có ví dụ Table/Form/Modal/Drawer/State.
2. Làm Member dashboard + lịch + khóa học; dùng public catalog của Khôi và calendar của Hào.
3. Hoàn tất shared checkout/ví/invoice và demo ba buyer context với Hào/Khôi.
4. Làm training/PT/threshold/notifications; phần G02/G05 theo phần kế hoạch API cuối file.
5. Tích hợp AI, test responsive và quyền; mapping route cũ.

Checklist nghiệm thu ngoài DESIGN-SKILLS-GUIDE:

- [ ] Guest chọn khóa → login → quay lại khóa → checkout đúng đối tượng.
- [ ] Cùng đơn 300.000đ, 200 điểm, cash 100.000đ hiển thị nhất quán ở Member/quầy/hóa đơn.
- [ ] 100% điểm không tạo VNPay; số dư 0 không gây lỗi hoặc tự âm điểm.
- [ ] Refresh/đổi tab không reset countdown; timeout request không tạo đơn trùng.
- [ ] Hai người tranh chỗ cuối: người thua thấy giải thích/action, không báo thành công giả.
- [ ] Late payment/compensation khác “đăng ký thành công”.
- [ ] Lễ tân dùng shared component không thể bypass OTP.
- [ ] Member chỉ học nhóm không bị bắt mua Gym.
- [ ] Drawer AI giữ filter/ngày/scroll lịch và không che toàn bộ lịch desktop.
- [ ] Threshold đủ ba phương án ở thiết kế; chỉ xác nhận hoạt động khi G02 đã hoàn tất.
- [ ] Theo dõi request PT đúng trạng thái; không báo đã đổi buổi khi chỉ gửi yêu cầu.
- [ ] Không lộ invoice/training của Member khác khi sửa ID trong URL.

Deliverable: page/subpage ở bảng, shared components có contract props, route migration, screenshot các trạng thái, API gap IDs và bằng chứng kiểm tra. Không nghiệm thu chỉ bằng ảnh happy path.

## Phối hợp thiết kế dùng chung và skill

An sở hữu **Header nền tảng/BrandLogo, AppShell, PageHeader, tokens/primitives, states, notification và payment flow**. AccountMenu/Footer/PublicHeader variant do Khôi; Calendar/AI experience do Hào. Dùng props/slots, không tạo lại từng role. Claude Code dùng Impeccable UX trước, Taste cho UI phù hợp, rồi critique/audit/polish. An giữ bundle hai skill và migration token.

Trước merge: flow/state matrix → màn mẫu desktop/mobile → critique/audit → polish → kiểm nghiệp vụ theo guide. Không đánh dấu hoàn thành chỉ vì AI sinh code.

## Kế hoạch API gắn với page được giao

**Đối chiếu tĩnh controller/service/DTO/jobs và FE consumers; chưa gọi runtime/security test.** Route đề xuất chưa được triển khai chỉ vì có trong tài liệu. An là đầu mối đặc tả, phối hợp backend, nối FE và nghiệm thu các mục primary; backend shared cần review cùng consumer.

### Mapping API → page/subpage

| Mục | Page/subpage cần triển khai/nghiệm thu |
|---|---|
| G02 | A16/A19/Q08 và Khoa Q07 |
| G05 | A06–A09 |
| G08 | A13–A14 |
| G11 | A15, Hào H06/H09, Khôi K20 |
| D01/D02/D05/D07/D08 | A05/A12–A15 |

**G04** do [Hào](03-HAO-RECEPTION-COACH.md): An làm A20 và dùng identification API, không tự sinh QR từ MemberId. **G01/G09** do [Khôi](02-KHOI-LANDING-PUBLIC.md): A02 dùng catalog chung. **CAT-01 do An chủ trì**, Khoa chỉ nối form danh mục theo schema được chốt.

### API hiện có: tái sử dụng trước khi thêm

Kiểm verb, constraint và body trong controller/OpenAPI; page mới không nhất thiết cần endpoint mới.

| Nghiệp vụ | Endpoint hiện có | Consumer / lưu ý |
|---|---|---|
| Membership checkout | `POST /api/checkouts/membership` | Member/quầy; key bắt buộc; không dùng purchase legacy mới |
| Class checkout | `POST /api/checkouts/class` | Hold thật + chống oversell |
| PT checkout/quote | `POST /api/checkouts/pt`; `POST /api/checkouts/pt/quote`; `GET /api/pt-pricing` | Quote/price hiện cần auth; không gộp Membership mới với PT |
| Checkout phục hồi | `GET /api/checkouts/{invoiceId}`, `/by-key`, `/by-reference` | Dùng `expiresAtUtc`, `serverNowUtc`, revision, fulfillmentOutcome; timer không thiếu API |
| Checkout actions | `POST /api/checkouts/{id}/confirm-points`, `/attempts`, `/cancel`, `/retry` | Retry intent/revision; không dựa return URL để commit |
| Chọn điểm self | `POST /api/wallet/me/checkouts/{id}/points`; `GET /api/invoices/{id}/point-selection` | Member, không nhận user tùy ý |
| OTP quầy | `POST /api/invoices/{id}/point-confirmations`; `GET .../current`; `POST .../clear`; `POST /api/point-confirmations/{id}/verify` | Receptionist; có expiry/revision/Member binding |
| Ví | `GET /api/wallet/me`, `/ledger`; `/api/members/{id}/points`, `/points/ledger`; `/api/manager/wallets/{id}`, `/ledger` | Đúng consumer self/frontdesk/manager; không alias mù |
| Invoice | `GET /api/invoices`, `/{id}`, `/by-item/{itemId}`; `/api/members/me/invoices` | Detail có `Adjustments`; đủ xem refund theo invoice |
| Refund | `GET /api/refunds/quote/{invoiceItemId}`; `POST /api/refunds`; staff GET `/api/refunds`; manager approve/reject | Item-scoped, server tính điểm; Member không gọi staff list |
| Reconcile/gateway | `POST /api/invoices/{id}/reconcile`; `GET /api/payments/vnpay/ipn`, `/return` | G11 cần kiểm tra auth callback; không coi return là xác nhận |
| Member lịch/ghi danh | `GET /api/members/me/enrollments`, `/schedule`, `/classes/{id}/sessions` | `/schedule` chỉ lớp; ghép với PT ở FE |
| PT entitlement/session | GET member/coach/manager pt-entitlements; GET member/coach/manager pt-sessions; manager create/cancel/reschedule | G05: chưa có member create booking |
| PT yêu cầu | Member create/list session-change/coach-change request; manager list/approve/reject | Đang chờ khác với đã đổi lịch |
| Training | Profile, plans, results, progress, relationship APIs | Phân quyền relationship/specialty; không tạo endpoint chỉ vì thêm tab |
| AI | `POST /api/ai/chat`; `/workout-suggestions/{memberId}`; `GET /api/ai/logs` | Chat Member, suggestions Coach PT, logs theo actor scope |
| Threshold | `/api/class-threshold-responses/mine`, `/{id}`, `/by-token`, `/{id}/transfer-quote`; POST `/{id}` hoặc root token flow | Choice hiện Refund/Transfer; G02 mở rộng |

### Backlog chính được giao

P0 chặn nghiệm thu luồng liên quan; P1 phục vụ đủ sitemap; P2 tối ưu khi có nhu cầu. Route/wire enum mới phải chốt contract, cập nhật OpenAPI + FE types và error mapping VI/EN.

#### G02 — Chờ đợt sau: hoàn điểm ngay + nhận thông báo khóa mới [P0 cho A16/Q08; An chủ trì, Khoa phối hợp Q07]

**Bằng chứng:** [ThresholdResponseChoice](../../backend/SportHub.Scheduling/Threshold/Domain/ThresholdResponseChoice.cs) chỉ `Refund`, `Transfer`; [ThresholdResponseService](../../backend/SportHub.Scheduling/Threshold/Application/ThresholdResponseService.cs) chưa có interest subscription. Người dùng đã chốt lựa chọn mới; không cần hỏi lại giữ tiền hay hoàn điểm.

**Contract đề xuất:** mở rộng POST `/api/class-threshold-responses/{id}` với choice mới tên wire dự kiến `WAIT_NEXT_COURSE`. Transaction: kiểm tra owner/deadline/chưa chọn → hoàn 100% điểm còn được hoàn theo source item → kết thúc enrollment cũ/nhả chỗ → lưu nguyện vọng nhận tin cùng môn → đánh dấu resolution completed + audit/outbox. Refund dùng service/idempotency ledger hiện có, không FE gọi refund rồi gọi interest riêng gây thành công nửa chừng.

Response thêm `refundPoints`, `interestId`, `interestStatus`, `refundedAtUtc`, `resolutionStatus`; tên cuối cùng đưa vào OpenAPI. Đề xuất bảng interest với memberId/sportId/sourceClassId/sourceResponseId/status/createdAt/lastNotifiedAt; unique source response, dedup thông báo theo interest + class publish event. Nếu đã nhận đủ hoàn trước đó, không cộng trùng.

Đề xuất `GET /api/members/me/course-interests`, `POST /api/members/me/course-interests/{id}/cancel`, `GET /api/manager/course-interests?sportId&status&page&pageSize`. An hiển thị tại Khóa học của tôi và tab nguyện vọng Manager Q08; Khôi nối trạng thái vào chi tiết lớp Q07. Khi publish lớp cùng môn hợp lệ, gửi link xem khóa qua outbox; không auto-create hold/enrollment/invoice. Hủy nhận tin không thu hồi điểm đã hoàn.

Matching MVP đề xuất: cùng sport, Published, chưa bắt đầu, đang nhận đăng ký; thông báo không bảo đảm còn chỗ khi click. Không áp ràng buộc lịch/level mà Member chưa chọn. Một khóa không gửi lặp khi job retry; cần chốt ghi nhận publish/re-publish event và dừng nhận tin sau Member cancel hoặc quy tắc lifecycle đã ghi rõ.

Test: ba lựa chọn đầy đủ; request lặp trả kết quả cũ; cạnh tranh với expiry/waive/cancel không refund đôi; transaction rollback không để subscription thiếu refund; khóa mới gửi đúng môn, email failure retry không refund lần hai; cancel subscription có ownership; checkout khóa mới dùng giá/slot mới. Không biến thành waitlist xếp hàng.

#### G05 — Member tự đặt buổi PT / xem slot khả dụng [P1; An] — đã triển khai

**Trạng thái (07/10/2026):** backend `GET members/me/pt-entitlements/{id}/availability` và `POST members/me/pt-sessions` (tên route khác đề xuất bên dưới vì gắn theo quyền lợi), lõi tạo buổi dùng chung với Manager; test đơn vị `PtSlotCalculatorTests` đạt, test tích hợp `PtSelfBookingTests` chưa chạy được vì thiếu Docker. Khác đề xuất: chống đặt trùng bằng 409 thay vì Idempotency-Key; chưa kiểm Membership Active ngoài hiệu lực của quyền lợi; chính sách (báo trước 12 giờ, tối đa 30 ngày, lưới 30 phút) là hằng số trong `PtSessionRules`, chưa là system setting. Đổi/hủy vẫn qua change request.

**Bằng chứng:** [PtSessionsController](../../backend/SportHub.Training/Api/PtSessionsController.cs) chỉ Manager POST create; Member GET lịch và gửi change request ở controller riêng. Không có Member create booking/availability chuyên dụng.

Để thực hiện A07: đề xuất `GET /api/members/me/pt-availability?entitlementId&fromDate&toDate`, `POST /api/members/me/pt-sessions {entitlementId,startAtUtc,roomId?}` với idempotency. Coach lấy từ entitlement/relationship hợp lệ; không để tự đổi Coach bằng body để bypass change request. Bắt buộc 90 phút, Active Membership, quota, validity, occupancy, trùng lịch Member theo BR.

Giữ luồng change request hiện có cho đổi/hủy/ngoại lệ đến khi contract self-action được chốt; không đổi nhãn “Gửi yêu cầu” thành “Đã hủy”. Nếu cần tự hủy/đổi tức thời đúng hạn phải bổ sung command contract và quote quota riêng, không FE gọi Manager endpoint.

Test hai lượt đặt cuối quota, idempotency, giờ hết Membership, Coach cố định, overlap, hết hạn quan hệ và role. Gap này là chênh lệch sitemap mục tiêu với implementation hiện tại, không quy là thiếu toàn bộ PT.

#### G08 — Danh sách refund riêng của Member [P2; An]

**Bằng chứng:** [PointRefundsController](../../backend/SportHub.Payment/Api/PointRefundsController.cs) GET root FrontDesk; [InvoiceDetailResponse](../../backend/SportHub.Payment/Application/DTOs/Invoices/InvoiceDetailResponse.cs) đã chứa Adjustments. Vì vậy **không thiếu xem refund của một hóa đơn**.

Nếu cần tab refund tổng hợp có paging/search độc lập: thêm `GET /api/members/me/refunds?status&page&pageSize` và optional detail owner scope. Nếu chỉ xem từ invoice thì dùng hiện có, không thêm API. Không tải mọi trang invoice + từng detail để làm một bảng refund lớn.

#### G11 — Callback VNPay có thể bị fallback authentication chặn [P0; An chủ trì, phối hợp backend]

**Bằng chứng tĩnh:** [PaymentsController](../../backend/SportHub.Payment/Api/PaymentsController.cs) `GET /api/payments/vnpay/ipn` và `/return` không có AllowAnonymous; [AuthorizationPolicyExtensions](../../backend/SportHub.API/Extensions/AuthorizationPolicyExtensions.cs) đặt fallback require authenticated; [Program](../../backend/SportHub.API/Program.cs) MapControllers thường. Đây là rủi ro cấu hình thể hiện từ mã, **chưa chạy request anonymous để xác nhận status thực tế**.

Test server-side callback không JWT ngay trước release. Nếu bị chặn, đánh dấu AllowAnonymous chỉ trên callback cần public, giữ signature/TmnCode/TxnRef/amount/status verification và rate limiting. Không mở reconcile hay toàn bộ Payment API cho anonymous. Return chỉ báo trạng thái và FE đọc invoice authenticated; mock simulate qua FrontDesk không thay thế test IPN public.

Acceptance: callback hợp lệ không JWT đi được tới verifier, sai checksum không fulfill, replay không thu/cấp quyền hai lần, reconcile vẫn FrontDesk. Không chạy thanh toán thật khi chỉ audit tài liệu.

### API legacy/dư thừa trong phạm vi

| ID | Endpoint/contract | Bằng chứng hành vi | Kế hoạch |
|---|---|---|---|
| D01 | `POST /api/invoices/{invoiceId}/payments` | [PaymentRecordingService](../../backend/SportHub.Payment/Application/Services/PaymentRecordingService.cs) luôn throw `checkout_requires_verified_payment` | Đánh deprecated/OpenAPI; FE dùng checkout + VNPay/points + reconcile. Giữ negative test không tự Paid; chỉ xóa route sau kiểm consumer/version |
| D02 | `POST /api/invoices/{invoiceId}/adjustments` | [PaymentAdjustmentService.RequestAsync](../../backend/SportHub.Payment/Application/Services/PaymentAdjustmentService.cs) throw legacy/refund workflow conflict | Không dựng form discount/correction/refund tiền; dùng item-scoped `/api/refunds` |
| D05 | `POST /api/member-packages/purchase` | [InvoicesController](../../backend/SportHub.Payment/Api/InvoicesController.cs) gọi purchase với key tự sinh mỗi request; overlap `POST /api/checkouts/membership` nhận key ổn định từ client | Chuyển FE mới sang checkout; route cũ deprecated/adapter nếu có consumer. Không gọi là dead code chỉ vì không thấy call FE |
| D07 | `POST /api/member-packages/{id}/cancel` | [MemberPackageService.CancelAsync](../../backend/SportHub.Membership/Application/Services/MemberPackageService.cs) đổi status, không refund/invoice workflow; FrontDesk được gọi | Rà nghiệp vụ với checkout cancel/refund; không dùng như nút “Hủy và hoàn điểm”. Có thể là operation đặc biệt cần giữ/thu hẹp, chưa đủ căn cứ xóa |
| D08 | `InvoiceDetail.SuggestedRefundAmount` | DTO ghi deprecated, always zero | FE mới dùng `/api/refunds/quote/{itemId}`; bỏ field khi version migration, không suy zero = không đủ điều kiện |

Không xóa API chỉ vì không thấy FE call. Giữ read-history, callback IPN/return, by-key/by-reference và projection theo role. Trước retire: scan consumers/tests/scripts/integrations, deprecation/OpenAPI, replacement, logs nếu có và compatibility regression. Đợt tài liệu này không xóa endpoint.

Split payment, OTP, expiresAtUtc/serverNowUtc, jobs hết hạn và reconciliation **đã có nền tảng**; không thêm endpoint FE “force release”. Lịch Member compose lớp + PT cần đủ pagination. Mock VNPay chỉ Development + explicit UseMock; không fallback vì thiếu credentials.

### Đóng việc API cùng FE

- [ ] Có request/response/error examples, role/ownership, freshness/pagination và compatibility; không tự đoán JSON.
- [ ] Mutation tiền/hold có idempotency/revision và backend validation; deadline từ server, points integer, VND do backend tính.
- [ ] Test success/error/forbidden và cạnh tranh/retry của gap trên; nối đúng page ở mapping.
- [ ] Chưa có backend: đánh dấu prototype/blocker, không toast thành công giả; phần API đã có vẫn triển khai.
- [ ] Cập nhật mục này + PR evidence khi chốt API; consumer xác nhận trước đóng gap hoặc retire legacy.

## Phần nhận thêm từ Manager — An trực tiếp triển khai

**10 mục Q, giữ nguyên ID/route để truy vết; không phải việc phối hợp hộ Khoa.** An vẫn là owner nền tảng kỹ thuật; Khôi là UI/UX Lead review flow và visual trên màn mẫu. Nghiệm thu phần mới sau khi bàn giao shared nền tảng, không để finance/report trì hoãn component cho cả nhóm.

| ID | Page → subpage | Route đề xuất | Chức năng / cấu trúc |
|---|---|---|---|
| Q08 | Nguyện vọng khóa sau | Subpage trong Khóa học | Danh sách theo môn/lớp nguồn, đã hoàn điểm, đang nhận tin/hủy nhận tin, khóa mới đã thông báo; **G02** |
| Q09 | Vận hành PT → Quan hệ Coach–Member | `/manager/pt?tab=relationships` (một trang ba tab; route cũ chuyển hướng) | Tạo/kết thúc quan hệ; HLV phải có specialty và Member đúng điều kiện |
| Q10 | Vận hành PT → Buổi PT → Tạo/dời/hủy | `/manager/pt?tab=sessions` | 90 phút, quota/Membership, thời gian/sân/Coach, conflict, hệ quả quota |
| Q11 | Vận hành PT → Hàng đợi yêu cầu | `/manager/pt?tab=requests` → detail | Đổi Coach, đổi lịch, ngoại lệ muộn; duyệt/từ chối có lý do, các buổi conflict không âm thầm hủy |
| Q12 | Hội viên → Hồ sơ vận hành | `/manager/members`, `/manager/members/[id]` | Đã làm (chỉ xem): Membership, gói PT, quan hệ Coach, hóa đơn; ghi danh lớp chưa có; siết scope khi G12 xong; không thêm quyền sửa workout của Coach |
| Q19 | Giao dịch → Danh sách → Hóa đơn | `/manager/finance?tab=invoices`, detail (đã làm) | Filter/points/cash/fulfillment; đối soát server, không manual Paid |
| Q20 | Hoàn điểm → Hàng đợi → Chi tiết review | `/manager/finance?tab=refunds` (đã làm; `/manager/payment-adjustments` chuyển hướng) | Quote từng item, đã hoàn/còn hoàn, quyền lợi ảnh hưởng; approve/reject có lý do; legacy chỉ đọc |
| Q21 | Ví điểm → Chủ ví → Ledger / Điều chỉnh | `/manager/points`, detail | Tìm đúng Member, available/held, số điểm điều chỉnh, lý do và preview trước submit |
| Q22 | Báo cáo → Các tab nghiệp vụ | `/manager/reports?tab=revenue|rentals|classes|members` (đã làm; bộ lọc kỳ dùng chung) | Hội viên, đăng ký/lấp lớp, cash theo môn/nguồn, rental theo Member thuê, issued/redeemed/outstanding points |
| Q23 | Báo cáo → Xuất → Lịch sử tệp | `/manager/reports/exports` (đã làm; tự làm mới khi tệp còn chuẩn bị) | Chọn kỳ/cột/PDF hoặc CSV, queued/generating/completed/failed, download/retry theo quyền và retention |

### Ranh giới file và phối hợp

- An sửa các route/component cho Q08–Q12, Q19–Q23: interests, manager PT, Member profile, finance, points, reports và exports. Khoa sửa classes/incidents; không lấy toàn bộ thư mục `app/manager` làm sở hữu độc quyền.
- Q08 là subpage riêng; Khoa đặt entry từ Q07, An cung cấp dữ liệu trạng thái đã hoàn + đang nhận tin. G02 vẫn một contract atomic, không tách refund và interest thành hai mutation FE.
- Q09–Q11 dùng Calendar của Hào; kiểm quota/90 phút/Membership, relationship, đổi HLV và request lifecycle. Tạo/dời/hủy buổi chỉ gọi API Manager đúng quyền; không mở quyền cho Coach.
- Q12 dùng MemberSearch/shared identity của Hào và G12 scope; không cho Manager sửa workout vốn thuộc Coach.
- Q19–Q21 dùng chính primitives tài chính An đã làm; phân biệt read/detail/review/adjustment theo role, không dùng self-wallet endpoint cho Manager.
- Q22–Q23: Khôi review bố cục bảng/biểu đồ một lần theo template; An triển khai data mapping, bộ lọc, export async và quyền tải tệp. Không chuyển QA kỹ thuật ngược về Khoa.

### API đi cùng phần việc nhận thêm

| Nghiệp vụ | Endpoint hiện có | Consumer / lưu ý |
|---|---|---|
| Điều chỉnh điểm | `POST /api/wallets/{ownerId}/adjustments` | Manager, reason/idempotency theo contract; không dùng cho lễ tân |
| Invoice | `GET /api/invoices`, `/{id}`, `/by-item/{itemId}`; `/api/members/me/invoices` | Detail có `Adjustments`; đủ xem refund theo invoice |
| Refund | `GET /api/refunds/quote/{invoiceItemId}`; `POST /api/refunds`; staff GET `/api/refunds`; manager approve/reject | Item-scoped, server tính điểm; Member không gọi staff list |
| PT entitlement/session | GET member/coach/manager pt-entitlements; GET member/coach/manager pt-sessions; manager create/cancel/reschedule | G05: chưa có member create booking |
| PT yêu cầu | Member create/list session-change/coach-change request; manager list/approve/reject | Đang chờ khác với đã đổi lịch |
| Reports | `GET /api/reports/membership-period`, `/membership-summary`, `/class-enrollment`, `/class-utilization`, `/revenue`, `/revenue-dimensions`, `/court-rental-revenue` | PointsReport FE đọc field từ RevenueReport, không thiếu riêng `/reports/points` |
| Export/audit/admin | `/api/reports/exports` + download/retry/delete; `/api/audit-logs`; `/api/users/admin` + user mutations | Giữ retention/ownership; G10 detail admin, G12 staff scope |

| Mục | Page/subpage | Owner và nghiệm thu |
|---|---|---|
| G02 | A16/A19 và Q08; Khoa Q07 | An hoàn thiện cả hai phía Member/Manager; publish gửi tin không auto-enroll |
| G05 | A07 và consumer Q09–Q11 | An đối chiếu self-book với quota/relationship vận hành |
| G12 (consumer) | Q12 | Hào giữ spec chính; An test Member scope của Manager/PT |
| D03/D04 | Q20 | An nhận việc retire action legacy, bảo toàn read-history |
| CAT-01 | Q09–Q12; Khoa Q13, Q24–Q25 | An chốt contract/migration; consumers nối đúng classification |

### Đặc tả CAT-01 — owner mới An

#### CAT-01 — Gym là môn, PT là dịch vụ thuộc Gym

Theo [thiết kế hệ thống mục 13](../Center-Management-System-Design-v3.md), seed kỹ thuật còn Personal Training riêng. An đầu mối contract/migration và Membership/PT entitlement; Khôi xử lý public catalog/Q13; Khoa nối Q24/Q25 theo contract, Hào kiểm Coach specialty. Không xóa ID/đổi seed trên dữ liệu đang dùng mà chưa migrate references.

Chốt contract sport/service classification; bảo toàn FK/specialty/room compatibility/class/training và snapshot invoice/report; thêm migration mới, không sửa migration đã chạy. Nghiệm thu: catalog sản phẩm có ba môn, Gym có PT mua riêng; Coach PT còn đúng quyền; giá/quota/lịch sử tiền/filter báo cáo không mất hoặc tính đôi. Chưa chốt schema thì ghi dependency, không giả field serviceType đã tồn tại.

### Legacy nhận từ Q20

| ID | Endpoint/contract | Bằng chứng hành vi | Kế hoạch |
|---|---|---|---|
| D03 | `POST /api/payment-adjustments/{id}/approve` | Service chỉ load rồi throw `legacy_refund_not_approvable` hoặc read-only | Candidate retire sau kiểm consumer; tuyệt đối không gọi route này để duyệt refund mới |
| D04 | `POST /api/payment-adjustments/{id}/reject` | Service luôn throw `legacy_adjustment_read_only` | Tương tự D03; không mở nút action trên bảng lịch sử |

`GET /api/payment-adjustments` vẫn phục vụ lịch sử read-only trong `features/payments/manager-refunds.tsx`; không dư. Reports points lấy field từ RevenueReport, không tự thêm `/reports/points`. Không retire route trước khi kiểm consumer, compatibility và negative test.

### Checklist nhận thêm

- [ ] Q08 phân biệt “hoàn điểm” với “hoàn điểm + nhận tin”; không refund/enroll/charge lần hai.
- [ ] Q09–Q11 kiểm conflict/quota/Membership/relationship; yêu cầu chưa duyệt không hiển thị như lịch đã đổi.
- [ ] Q12 đúng scope, không lộ training/payment ngoài quyền.
- [ ] Q19–Q21 tách cash/points, không manual Paid, adjustment có lý do/preview và server validation.
- [ ] Q22 phân biệt CashCollected với PointsRedeemed/Issued/Outstanding, không tự gọi doanh thu là lợi nhuận.
- [ ] Q23 export thật: queued/generating/completed/failed, retry/download/retention/ownership; tệp không public.
- [ ] CAT-01 không mất ID/FK/specialty/quyền lợi/snapshot; Khoa không phải tự thiết kế lại schema.

### File triển khai và route phần Manager

Code đầu vào: `features/pt/manager-*`, `features/wallet/manager-*`, `features/payments`, `features/reports` và các route Q08–Q12/Q19–Q23 trong `app/manager`. Mapping cũ: coaching-relationships/pt-sessions/pt-change-requests → PT; payment-adjustments → finance refunds + legacy read-only. Giữ redirect/deep link và read history; menu gộp không có nghĩa API cũ tự dư thừa.
