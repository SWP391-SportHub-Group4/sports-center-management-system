# Giao việc Khôi — UI/UX Lead, Landing, Auth và Thuê sân của Member

SportHub là **hệ thống quản lý trung tâm thể thao với ba môn Gym (bao gồm PT), cầu lông và bóng rổ; có thể mở rộng thêm môn trong tương lai**. PT là dịch vụ thuộc Gym, không phải môn thứ tư.

**Khôi là UI/UX Lead của nhóm và vẫn chủ trì landing page.** Khôi quyết định mẫu flow/layout/hierarchy/visual theo DESIGN-TOKENS, review màn mẫu của ba bạn; An chịu trách nhiệm nền tảng kỹ thuật/shared implementation. Phần vận hành Manager Q01–Q07, Q13–Q18, Q28 đã chuyển cho Khoa; Khôi review flow/visual của màn mẫu.

Đọc bắt buộc: [DESIGN-SKILLS-GUIDE](../../DESIGN-SKILLS-GUIDE.md), [DESIGN-TOKENS](../../DESIGN-TOKENS.md), [PRODUCT](../../PRODUCT.md) và [nguồn nghiệp vụ](../00-Source-of-Truth.md). Kế hoạch API nằm ngay cuối file này. **Dùng cả Impeccable (UX) và Taste (UI) theo guide; DESIGN-TOKENS là chuẩn duy nhất.**

## Bắt đầu tuần 05–11/10

- **Làm trước:** Chốt hero/CourseCard/Header/Footer/AccountMenu và mẫu list/detail/form; review mẫu của nhóm theo token.
- **Thứ tự trang:** Landing/catalog → Auth/nội dung public → Thuê sân của Member; review mẫu class/incident của Khoa.
- Bảng tên trang, hạn mục tiêu và tiêu chí xong: [kế hoạch FE một tuần](KE-HOACH-FE-1-TUAN.md). Phần bên dưới giữ đặc tả đầy đủ để tra khi làm từng trang.
- Chỉ ghi “Hoàn thành” khi UI + API thật + kiểm chứng đạt; fixture có nhãn là “Xong UI – chờ API”. Không chờ toàn bộ backend/shared xong mới bắt đầu.


## 1. Phạm vi

- PublicShell/Header/Footer, landing và toàn bộ public pages, course card/catalog/detail dùng lại ở Member.
- Auth/register/OTP/Google onboarding/forgot password; account/security dùng cho các role.
- Chức năng thuê sân của Member (BR-140), dùng AppShell của An, calendar của Hào và checkout/wallet/invoice của An.
- Q01–Q07, Q13–Q18, Q28 đã chuyển cho Khoa (ClassEditor/ThresholdManager, IncidentWorkbench, NoticeComposer, Manager AI adapter); Khôi chỉ review UX/UI các mẫu đó.
- **Quy ước ngôn ngữ trang xác thực:** login, register (Member) và forgot-password luôn **tiếng Anh hoàn toàn**, không có nút đổi ngôn ngữ và không đọc ngôn ngữ đã lưu của portal (component `EnglishOnly` trong `lib/language.tsx`, áp bằng `layout.tsx` của từng route). Không trộn Anh–Việt trong cùng một trang; thông báo lỗi từ API trên các trang này cũng map sang tiếng Anh.
- Không tự làm payment engine, token CSS riêng hay calendar engine riêng.

Public nav: **Bộ môn · Khóa học · Gym & PT · Sân**; menu phụ Về trung tâm/Hỗ trợ; EN/VI (chỉ cho trang public/portal, không áp cho trang xác thực) + Đăng nhập + Tạo tài khoản. Header mobile có menu thật, đủ tên và trạng thái focus.

## 2. Public sitemap và subpage

| ID | Page → subpage | Route đề xuất | Nội dung/CTA |
|---|---|---|---|
| K01 | Trang chủ | `/` | 14 section bên dưới; ưu tiên khám phá khóa học, xem sân |
| K02 | Bộ môn → Chi tiết môn | `/sports`, `/sports/[id]` | Môn đang hoạt động, mô tả, hình ảnh được phép dùng, cách tham gia theo operation type; dẫn sang đúng dịch vụ |
| K03 | Khóa học → Chi tiết khóa | `/courses`, `/courses/[id]` | Giá toàn khóa, tổng buổi, khai giảng/kết thúc, lịch, Coach, sân, chỗ còn, điều kiện mở lớp, chính sách |
| K04 | Gym → Gói Membership | `/gym`, tab/anchor giá | So sánh 1/3/6/12 tháng nếu catalog có, quyền lợi thật, giá; mua/gia hạn dẫn qua auth/Member |
| K05 | Personal Training → HLV | `/personal-training`, `/coaches/[id]` | PT là dịch vụ thuộc Gym, mua riêng với Membership; điều kiện Active Membership, buổi 90 phút, quota; hồ sơ công khai tối thiểu; G01 |
| K06 | Sân → Chi tiết → Lịch trống | `/courts`, `/courts/[id]`, `/courts/availability` | Loại sân, ảnh, môn, giờ hoạt động, giá theo khung; chỉ trống/bận, không chủ sở hữu; G01 |
| K07 | Thuê sân | `/courts/rent` (hoặc section của `/courts`) | Mọi Member thuê được khung trống; khung lớp cố định không cho thuê; chính sách hủy, trả bằng điểm/VNPay; CTA đăng ký/đăng nhập Member. |
| K08 | Về trung tâm → Cơ sở vật chất | `/about`, section hoặc subpage | Thông tin và ảnh đã xác thực; không bịa chứng chỉ, giải thưởng, số khách |
| K09 | Liên hệ | `/contact` | Địa chỉ, giờ hoạt động, hotline/email, chỉ đường; mặc định liên hệ trực tiếp, không tạo form gửi rồi giả thành công |
| K10 | Hỗ trợ & chính sách | `/help`, `/policies/[slug]` | FAQ, ghi danh, hủy/hoàn điểm, nội quy, điều khoản, riêng tư; nội dung tĩnh versioned đủ dùng, không bắt buộc CMS |

API public class hiện lọc môn/ngày/phân trang; tìm keyword, khoảng giá hoặc lịch thứ/buổi toàn catalog cần G09, không lọc mỗi trang rồi tuyên bố kết quả toàn hệ thống.

## 3. Landing page — đặc tả từng section

| Thứ tự | Section | Cấu trúc nội dung | CTA / dữ liệu / responsive |
|---|---|---|---|
| 01 | Header | Logo, nav, ngôn ngữ, auth | Sticky nhẹ nếu cần; menu desktop thấy được; mobile drawer, không che nội dung |
| 02 | Hero | H1 ngắn, mô tả cụ thể, ảnh hoạt động trung tâm, địa điểm | Chính “Khám phá khóa học”; phụ “Xem sân trống”. Desktop bố cục chữ/ảnh có tỷ lệ rõ; mobile H1 → copy → CTA → ảnh |
| 03 | Tìm khóa phù hợp | Môn + khoảng ngày; filter khác sau khi API hỗ trợ | “Tìm khóa học” dẫn `/courses?...`; giữ query sau login, không tạo hold |
| 04 | Bộ môn | Card hoặc danh sách biên tập từ active sports | Ba môn sản phẩm: Gym (PT), Cầu lông, Bóng rổ; mở rộng từ catalog, CTA theo dịch vụ. Seed PT riêng cần mapping về Gym, không giới thiệu là môn thứ tư |
| 05 | Khóa đang mở | 4–6 course cards, đủ giá/lịch/chỗ còn | “Xem chi tiết”, “Tất cả khóa học”; skeleton/empty/error thật |
| 06 | Gym & PT | Gói Gym so sánh và một khối PT riêng | “Xem gói Gym”, “Tìm hiểu PT”; không gộp giá Gym bao gồm PT/lớp |
| 07 | Sân & lịch trống | Ảnh sân + tìm nhanh ngày/giờ/môn, giá theo slot | “Xem lịch sân”; ghi “Đăng nhập Member để thuê sân”; G01 |
| 08 | Cơ sở vật chất | Một cụm ảnh có chú thích + tiện ích thực tế | “Khám phá trung tâm”; tránh collage ảnh stock giả địa điểm |
| 09 | HLV | Hồ sơ tối thiểu, chuyên môn và mô tả đã cho phép công khai | “Xem HLV”; không đưa email/SĐT tài khoản nội bộ; G01 |
| 10 | Cách bắt đầu | Chọn dịch vụ → Tạo tài khoản/xác thực → Thanh toán, xem lịch | “Bắt đầu”; PT có điều kiện riêng, không hứa mọi dịch vụ chung một checkout |
| 11 | Thuê sân | Phí thuê sân theo giờ, quy trình đặt/hủy | “Tạo tài khoản để thuê sân”; giải thích trung tâm chỉ tính tiền thuê, không quản lý người đi cùng |
| 12 | FAQ | 5–7 câu hỏi về mua khóa/Gym/PT/điểm/ngưỡng/hủy thuê | Accordion accessible; nội dung chính đọc được không phụ thuộc hover |
| 13 | Địa điểm & liên hệ | Địa chỉ thật, giờ mở cửa, đường đi, hotline | “Chỉ đường”, “Liên hệ”; ưu tiên bản đồ tĩnh/link để giảm tải |
| 14 | Footer | Điều khoản, riêng tư, hoàn điểm, hỗ trợ, thông tin trung tâm | Link hoạt động; không dựng newsletter/sự kiện khi không thuộc phạm vi |

H1 mẫu: **Tìm môn phù hợp. Chọn lịch thuận tiện.** Mô tả: “Khám phá khóa cầu lông, bóng rổ, tập Gym và huấn luyện cá nhân tại SportHub. Xem lịch, giá và đăng ký trực tuyến.” Chỉnh copy cho dữ liệu thật của trung tâm, không dùng lời hứa sức khỏe/kết quả tập.

Course card gồm: tên/mã khóa, môn/trình độ nếu có dữ liệu, HLV, sân, ngày khai giảng, thứ/giờ, tổng buổi, giá toàn khóa, available seats, CTA. Giá/chỗ là dữ liệu server; không dựng số “còn 2 chỗ” để tạo khan hiếm giả.

Hero có một ảnh chủ đạo thay vì carousel tự chạy/video autoplay. Ảnh đúng aspect ratio, có width/height để tránh nhảy layout; ảnh dưới fold lazy-load. Asset chưa có: placeholder ghi rõ trong wireframe, không mô tả là ảnh thật.

## 4. Chi tiết khóa và luồng chuyển đổi

Chi tiết desktop: tiêu đề/mô tả + lịch/sân/Coach bên trái, summary giá/trạng thái/CTA bên phải; mobile summary đưa lên gần đầu. Có lịch tất cả buổi, điều kiện mở lớp, chính sách hoàn điểm trước CTA cuối.

Guest “Đăng ký khóa” → login/register với `next` nội bộ đã kiểm tra → quay lại khóa → An checkout. Không giữ chỗ suốt quá trình khách điền registration khi chưa chủ động checkout. Nếu lớp hết chỗ trong lúc đăng nhập, hiển thị trạng thái mới và lớp khác; không tạo waitlist tự động.

Public schedule chỉ nhận DTO public; không dùng token nhân viên trong server-side frontend để chuyển nguyên roster/occupancy về Guest. Giá sân phải ghi rõ ngày/khung giờ/đơn vị; giá “từ” chỉ dùng nếu là giá thấp nhất hợp lệ, không hard-code.

## 5. Auth và account dùng chung

| ID | Page/subpage | Chi tiết |
|---|---|---|
| K11 | `/login` | Email/password, Google, forgot, register; loading/error; chuyển đúng role |
| K12 | `/register` → OTP → Hoàn tất | Member registration, checklist mật khẩu, xác thực email, resend countdown, max-attempt error; không hỏi vai trò nội bộ |
| K14 | `/forgot-password` → email link → `/reset-password` → Success | **Đã triển khai (link email, không OTP).** Không cần password cũ; phản hồi trung tính; cooldown 60 giây theo từng email, đổi email gửi được ngay; link hết hạn/đã dùng/thiếu token → trạng thái "Link no longer works"; ô mật khẩu có con mắt; luôn tiếng Anh |
| K15 | Google onboarding | Lần đầu thiết lập mật khẩu; trùng email chưa linked phải đăng nhập/liên kết rõ ràng; không tự merge tài khoản |
| K16 | `/account` → Hồ sơ / Bảo mật / Ngôn ngữ | Profile, change password, Google link/unlink theo API; giữ shell role; không trùng training profile |
| K17 | Trang lỗi/phiên hết hạn | 401, 403, 404, unavailable; next hợp lệ, không open redirect; tích hợp primitive An |

Thời hạn OTP registration/reset và OTP chi điểm tại quầy khác nhau; không tái sử dụng một giá trị hard-code cho cả hai. OTP input cho paste/autofill, error theo field và summary; không mất thông tin form khi lỗi mạng.

## 6. Thuê sân của Member

Mọi Member có thêm mục **Thuê sân** trong menu (giữa Gym & PT và Tập luyện). Trung tâm chỉ tính tiền thuê, không hỏi mục đích và không khai báo số người. Code: `features/rentals` (`availability-picker`, `rental-list`), route `/member/courts/book`, `/member/rentals`, `/member/rentals/[rentalId]`; môn trong form lấy từ `GET /api/sports?service=COURT_RENTAL`, giờ chọn 1 đến `maxHours` từ policy server. Bookmark cũ `/external-coach/*` được chuyển về các route Member trong `next.config.mjs`.

| ID | Page/subpage | Route đề xuất | Chức năng |
|---|---|---|---|
| K19 | Tìm sân → Chọn slot → Review | `/member/courts/book` | Môn, sân, ngày/giờ, tổng số giờ; quote chi tiết từng giờ, chính sách server; không có trường số người |
| K20 | Pending checkout → Payment/result | Shared An | Countdown tài nguyên, điểm trước/VNPay phần còn; reconnect không tạo rental trùng |
| K21 | Lượt thuê → Chi tiết | `/member/rentals`, `/member/rentals/[id]` | Sắp tới/hoàn tất/hủy/pending; sân, giờ, price snapshot, invoice, sự cố |
| K22 | Hủy thuê → Kết quả | Dialog từ rental | >=24h hoàn 100% điểm, muộn 0 theo policy; quote/hệ quả, không gọi generic refund để hoàn lần hai |
| K23 | Đặt lại sau sự cố | F từ rental bị hủy | Mở availability với môn/ngày phù hợp; phải chọn slot và checkout mới; không hứa backend đã có quyền ưu tiên tự động |

Khung giờ lớp cố định (seed Bóng rổ/Cầu lông 01–02, BR-141) hiện là bận; chỉ khung còn lại cho thuê. Member bị khóa chặn đặt mới nhưng vẫn xem lịch sử.

## 7. API, file và dependency

- Public đã có: `GET /api/sports`, `/api/classes`, `/api/classes/{id}`, `/api/classes/{id}/public-sessions`, `/api/membership-packages/public`.
- **G01:** chưa có public projections đầy đủ cho sân/availability/giá, hồ sơ HLV, giá PT công khai. Marketing copy/contact/FAQ có thể là nội dung versioned, không cần CMS backend.
- Auth đã có: auth OTP/register/login/password forgot/reset, Google exchange/onboarding/link, `/api/users/me`.
- Rental: policy, availability, mine/detail/cancel; POST `/api/checkouts/court-rental`. Dùng đúng quyền, không dùng endpoint lịch sân nhân viên cho Guest.
- **G09:** nâng bộ lọc catalog nếu giữ UI keyword/price/weekday; thu hẹp filter UI theo contract trong khi chờ.
- **G11:** backend cần kiểm tra callback VNPay anonymous trước nghiệm thu payment thật, không sửa FE để giả success.

Code đầu vào: `app/page.tsx`, `home.module.css`, `public-header.tsx`, `membership-pricing*`, `app/courses`, auth routes, `app/account`, `features/identity`, `features/rentals` (phần thuê sân thuộc Member). `app/classes` là alias của courses: chọn canonical `/courses`, giữ redirect tương thích, không dựng hai catalog.

## 8. Thứ tự và nghiệm thu

1. Chủ trì landing: outline/copy/data sources → wireframe mobile/desktop → hero/course card mẫu → 14 section.
2. Public subpages + course-detail journey; auth preserving intent.
3. Member thuê sân: tìm khung trống → checkout → lịch thuê/hủy, nối shared An.
4. G01/G09 + responsive/a11y/performance; dọn dead links/legacy sections.

- [ ] Guest xem môn, khóa, giá, lịch công khai trước login; không bị gọi API yêu cầu nhân viên.
- [ ] Khôi có đủ landing sections, mỗi section có mục đích/CTA/data source, không chỉ một hero đẹp.
- [ ] Màn 360px không tràn ngang; heading/CTA không đè ảnh; dropdown và accordion dùng keyboard được.
- [ ] Không fake testimonials, coach credentials, số hội viên, sự kiện hoặc form liên hệ gửi giả.
- [ ] Login/OTP/Google lưu đúng next và không tự link email trùng.
- [ ] Member đăng nhập đặt được khung trống theo policy server; khung lớp cố định không hiện là trống; Member bị khóa không đặt mới.
- [ ] Booking hết hạn nhả occupancy qua backend, lịch công khai refresh; không reset timer khi reload.
- [ ] Không lộ renter/member/roster trên public schedule.
- [ ] Hủy sát mốc 24h phản ánh quote/policy server, không tính riêng mâu thuẫn với backend.

Bàn giao screenshot landing desktop/mobile, public sitemap, assets có nguồn/quyền dùng, page/subpage đầy đủ, auth/rental state matrix và kết quả kiểm tra theo DESIGN-SKILLS-GUIDE.

## Phối hợp thiết kế dùng chung và skill

Khôi sở hữu **Footer, AccountMenu, PublicHeader variant**, auth/account forms, CourseCard/catalog/detail. Dùng Header nền tảng/BrandLogo, AppShell/state/notification/payment của An; Calendar của Hào. Guest footer đầy đủ, app dùng variant gọn/ẩn. ChatGPT Plus để shape/critique; Antigravity dùng cùng bundle để code/test. Landing dùng Taste đầy đủ sau Impeccable Persuade; auth/rental dùng Operate.

Trước merge: flow/state matrix → màn mẫu desktop/mobile → critique/audit → polish → kiểm nghiệp vụ theo guide. Không đánh dấu hoàn thành chỉ vì AI sinh code.

## Kế hoạch API gắn với page được giao

**Đối chiếu tĩnh controller/service/DTO/jobs và FE consumers; chưa gọi runtime/security test.** Route đề xuất chưa được triển khai chỉ vì có trong tài liệu. Khôi là đầu mối đặc tả, phối hợp backend, nối FE và nghiệm thu các mục primary; backend shared cần review cùng consumer.

### Mapping API → page/subpage

| Mục | Page/subpage cần triển khai/nghiệm thu |
|---|---|
| G01 | K05–K06 và K01 phần sân/HLV/PT |
| G09 | K01 tìm nhanh/K03 catalog |
| G11 (phối hợp An) | K20 |
| CAT-01 (phối hợp An) | K01–K05 |

**G11/D01–D05/D07/D08 và CAT-01** tại [An](01-AN-MEMBER-SHARED.md): Khôi tích hợp payment adapter K20 và classification Gym/PT theo contract. **G06 do Khoa phụ trách** cho Q15/Q17; Khôi là consumer ở K21–K23 và không sửa database từ FE.

### API hiện có: tái sử dụng trước khi thêm

Kiểm verb, constraint và body trong controller/OpenAPI; page mới không nhất thiết cần endpoint mới.

| Nghiệp vụ | Endpoint hiện có | Consumer / lưu ý |
|---|---|---|
| Public sports | `GET /api/sports` | Khôi/An; active sports, anonymous |
| Public courses | `GET /api/classes`; `GET /api/classes/{id}`; `GET /api/classes/{id}/public-sessions` | Khôi/An; đừng dùng manager DTO công khai |
| Public Membership | `GET /api/membership-packages/public` | Khôi; không gọi endpoint authenticated khi guest |
| Auth/account | `/api/auth/register/otp`, `/register`, `/login`, `/password/forgot`, `/password/reset`; Google endpoints; `/api/users/me` | Khôi; đọc verb/body trong controllers, giữ OTP/onboarding/link rule |
| Rental checkout | `POST /api/checkouts/court-rental` | Member; giữ room occupancy |
| Checkout phục hồi | `GET /api/checkouts/{invoiceId}`, `/by-key`, `/by-reference` | Dùng `expiresAtUtc`, `serverNowUtc`, revision, fulfillmentOutcome; timer không thiếu API |
| Checkout actions | `POST /api/checkouts/{id}/confirm-points`, `/attempts`, `/cancel`, `/retry` | Retry intent/revision; không dựa return URL để commit |
| Chọn điểm self | `POST /api/wallet/me/checkouts/{id}/points`; `GET /api/invoices/{id}/point-selection` | Member, không nhận user tùy ý |
| Ví | `GET /api/wallet/me`, `/ledger`; `/api/members/{id}/points`, `/points/ledger`; `/api/manager/wallets/{id}`, `/ledger` | Đúng consumer self/frontdesk/manager; không alias mù |
| Invoice | `GET /api/invoices`, `/{id}`, `/by-item/{itemId}`; `/api/members/me/invoices` | Detail có `Adjustments`; đủ xem refund theo invoice |
| Rental | `GET /api/court-rentals/policy`, `/availability`, `/mine`, `/{id}`; POST `/{id}/cancel`; manager cancel | Không public, không cần viết lại cho portal Khôi |

### Backlog chính được giao

P0 chặn nghiệm thu luồng liên quan; P1 phục vụ đủ sitemap; P2 tối ưu khi có nhu cầu. Route/wire enum mới phải chốt contract, cập nhật OpenAPI + FE types và error mapping VI/EN.

#### G01 — Public sân, availability/giá, HLV và PT pricing [P1; Khôi]

**Bằng chứng:** [RoomsController](../../backend/SportHub.Scheduling/Api/RoomsController.cs) đọc StaffRead; [AvailabilityController](../../backend/SportHub.Scheduling/Occupancy/Api/AvailabilityController.cs) có Authorize; [CourtRentalsController](../../backend/SportHub.Scheduling/Rental/Api/CourtRentalsController.cs) chỉ CourtRental; [CourtRatesController](../../backend/SportHub.Scheduling/Catalog/Api/CourtRatesController.cs) authenticated; [CoachCatalogController](../../backend/SportHub.Training/Api/CoachCatalogController.cs) role-bound và chỉ trả danh mục tối thiểu; [PtPricingController](../../backend/SportHub.Training/Api/PtPricingController.cs) authenticated.

**Đề xuất:** `GET /api/public/courts`, `GET /api/public/courts/{id}`, `GET /api/public/court-availability?sportId&date&durationMinutes`, `GET /api/public/coaches`, `GET /api/public/coaches/{id}`, `GET /api/public/pt-pricing`. Dùng query services hiện có phía trong, thêm DTO whitelist public; không đổi staff endpoint thành anonymous.

DTO sân: id/name/type, môn, description/media/amenities nếu có dữ liệu, opening hours. Availability: slot start/end/status, price breakdown, currency, generatedAtUtc, timezone; không sourceId/member/renter/roster. Coach: displayName/bio/specialties/public image được phép, không email/phone/account metadata. PT pricing: đơn giá và mô tả cách tính; quote cá nhân vẫn authenticated.

Nếu ảnh/mô tả chưa có schema, bước đầu dùng content file versioned map theo ID; không bắt buộc xây CMS/upload. Test anonymous success, inactive không lộ, không PII, hold/expired/block phản ánh đúng, range cap/rate limit/cache ngắn có freshness.

#### G09 — Bộ lọc catalog công khai phía server [P1 nếu UI có các filter này; Khôi]

**Bằng chứng:** [ClassesController.ListPublic](../../backend/SportHub.Scheduling/Api/ClassesController.cs) nhận sportId/page/pageSize/fromDate/toDate; không keyword/price/weekday/time-of-day.

Mở rộng GET `/api/classes` với keyword, minPrice/maxPrice, weekday/timeRange theo định nghĩa rõ; filter trước paging/count, sort ổn định. Trả totalCount chính xác. Không cần endpoint mới cho mỗi filter. Không hứa “cơ bản/nâng cao” nếu schema không có level.

### API legacy/dư thừa trong phạm vi

Chưa xác nhận endpoint Guest đủ điều kiện xóa. /classes và /courses là alias **frontend**, không phải hai backend API dư. Financial legacy do An giữ bản chính; Khôi kiểm consumer K20 trước retire.

Không xóa API chỉ vì không thấy FE call. Giữ read-history, callback IPN/return, by-key/by-reference và projection theo role. Trước retire: scan consumers/tests/scripts/integrations, deprecation/OpenAPI, replacement, logs nếu có và compatibility regression. Đợt tài liệu này không xóa endpoint.

### Đóng việc API cùng FE

- [ ] Có request/response/error examples, role/ownership, freshness/pagination và compatibility; không tự đoán JSON.
- [ ] Mutation tiền/hold có idempotency/revision và backend validation; deadline từ server, points integer, VND do backend tính.
- [ ] Test success/error/forbidden và cạnh tranh/retry của gap trên; nối đúng page ở mapping.
- [ ] Chưa có backend: đánh dấu prototype/blocker, không toast thành công giả; phần API đã có vẫn triển khai.
- [ ] Cập nhật mục này + PR evidence khi chốt API; consumer xác nhận trước đóng gap hoặc retire legacy.

## Vai trò UI/UX Lead — Khôi

- Chốt mẫu UX/UI cho landing, checkout, quầy/calendar; review mẫu Manager class/incident do Khoa làm, theo token đã chọn. Không tự đổi palette/font để thể hiện vai trò lead.
- Review theo hai mốc: **flow + màn mẫu trước nhân rộng**, và **trước merge thay đổi lớn về UX/UI**. Page chỉ tái sử dụng pattern đã duyệt không cần chờ Khôi review từng padding.
- An quyết định component API/cascade/accessibility implementation; Khôi quyết định hierarchy/layout/visual consistency. Thay đổi token/variant dùng chung: Khôi review trải nghiệm, An triển khai và quản lý compatibility.
- Không dùng lead review để thay kiểm nghiệp vụ/API: chủ page vẫn chịu trách nhiệm tests/evidence.

## Phần Manager vận hành đã chuyển cho Khoa

**Q01–Q07, Q13–Q18, Q28 (task KH-03/KH-04 cũ) do [Khoa](04-KHOA-MANAGER-ADMIN.md) trực tiếp triển khai và nghiệm thu từ 05/10/2026**, gồm ClassEditor/ThresholdManager, IncidentWorkbench, NoticeComposer, Manager AI adapter và G03/G06/G07/G13. Khôi **không còn** là owner các phần này; Khôi vẫn là UI/UX Lead nên review flow/visual của màn mẫu (class và incident) theo mục "Vai trò UI/UX Lead" ở trên. Toàn bộ đặc tả chi tiết đã nằm ở mục 7 của file Khoa; không duy trì bản sao ở đây.
