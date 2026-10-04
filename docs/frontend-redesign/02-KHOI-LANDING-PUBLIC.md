# Giao việc Khôi — UI/UX Lead, Landing và vận hành Manager

SportHub là **hệ thống quản lý trung tâm thể thao với ba môn Gym (bao gồm PT), cầu lông và bóng rổ; có thể mở rộng thêm môn trong tương lai**. PT là dịch vụ thuộc Gym, không phải môn thứ tư.

**Khôi là UI/UX Lead của nhóm và vẫn chủ trì landing page.** Khôi quyết định mẫu flow/layout/hierarchy/visual theo DESIGN-TOKENS, review màn mẫu của ba bạn; An chịu trách nhiệm nền tảng kỹ thuật/shared implementation. Khôi nhận thêm vận hành Manager Q01–Q07, Q13–Q18, Q28.

Đọc bắt buộc: [DESIGN-SKILLS-GUIDE](../../DESIGN-SKILLS-GUIDE.md), [DESIGN-TOKENS](../../DESIGN-TOKENS.md), [PRODUCT](../../PRODUCT.md) và [nguồn nghiệp vụ](../00-Source-of-Truth.md). Kế hoạch API nằm ngay cuối file này. **Dùng cả Impeccable (UX) và Taste (UI) theo guide; DESIGN-TOKENS là chuẩn duy nhất.**

## Bắt đầu tuần 05–11/10

- **Làm trước:** Chốt hero/CourseCard/Header/Footer/AccountMenu và mẫu list/detail/form; review mẫu của nhóm theo token.
- **Thứ tự trang:** Landing/catalog → Auth/nội dung public → Lớp Manager → HLV/sân/incident/notices/AI → ExternalCoach.
- Bảng tên trang, hạn mục tiêu và tiêu chí xong: [kế hoạch FE một tuần](KE-HOACH-FE-1-TUAN.md). Phần bên dưới giữ đặc tả đầy đủ để tra khi làm từng trang.
- Chỉ ghi “Hoàn thành” khi UI + API thật + kiểm chứng đạt; fixture có nhãn là “Xong UI – chờ API”. Không chờ toàn bộ backend/shared xong mới bắt đầu.


## 1. Phạm vi

- PublicShell/Header/Footer, landing và toàn bộ public pages, course card/catalog/detail dùng lại ở Member.
- Auth/register/OTP/Google onboarding/forgot password; account/security dùng cho các role.
- Portal ExternalCoach, dùng AppShell của An, calendar của Hào và checkout/wallet/invoice của An.
- Nhận Q01–Q07, Q13–Q18, Q28; sở hữu ClassEditor/ThresholdManager, IncidentWorkbench, NoticeComposer và Manager AI adapter. Chi tiết/API/nghiệm thu ở phần Manager cuối file.
- Không tự làm payment engine, token CSS riêng hay calendar engine riêng.

Public nav: **Bộ môn · Khóa học · Gym & PT · Sân**; menu phụ Về trung tâm/Hỗ trợ/Dành cho HLV ngoài; EN/VI + Đăng nhập + Tạo tài khoản. Header mobile có menu thật, đủ tên và trạng thái focus.

## 2. Public sitemap và subpage

| ID | Page → subpage | Route đề xuất | Nội dung/CTA |
|---|---|---|---|
| K01 | Trang chủ | `/` | 14 section bên dưới; ưu tiên khám phá khóa học, xem sân |
| K02 | Bộ môn → Chi tiết môn | `/sports`, `/sports/[id]` | Môn đang hoạt động, mô tả, hình ảnh được phép dùng, cách tham gia theo operation type; dẫn sang đúng dịch vụ |
| K03 | Khóa học → Chi tiết khóa | `/courses`, `/courses/[id]` | Giá toàn khóa, tổng buổi, khai giảng/kết thúc, lịch, Coach, sân, chỗ còn, điều kiện mở lớp, chính sách |
| K04 | Gym → Gói Membership | `/gym`, tab/anchor giá | So sánh 1/3/6/12 tháng nếu catalog có, quyền lợi thật, giá; mua/gia hạn dẫn qua auth/Member |
| K05 | Personal Training → HLV | `/personal-training`, `/coaches/[id]` | PT là dịch vụ thuộc Gym, mua riêng với Membership; điều kiện Active Membership, buổi 90 phút, quota; hồ sơ công khai tối thiểu; G01 |
| K06 | Sân → Chi tiết → Lịch trống | `/courts`, `/courts/[id]`, `/courts/availability` | Loại sân, ảnh, môn, giờ hoạt động, giá theo khung; chỉ trống/bận, không chủ sở hữu; G01 |
| K07 | Dành cho HLV ngoài | `/for-coaches` | Cách đăng ký/duyệt/thuê sân, chính sách hủy, trả bằng điểm/VNPay; CTA đăng ký ExternalCoach |
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
| 07 | Sân & lịch trống | Ảnh sân + tìm nhanh ngày/giờ/môn, giá theo slot | “Xem lịch sân”; ghi “Thuê sân dành cho HLV ngoài đã được duyệt”; G01 |
| 08 | Cơ sở vật chất | Một cụm ảnh có chú thích + tiện ích thực tế | “Khám phá trung tâm”; tránh collage ảnh stock giả địa điểm |
| 09 | HLV | Hồ sơ tối thiểu, chuyên môn và mô tả đã cho phép công khai | “Xem HLV”; không đưa email/SĐT tài khoản nội bộ; G01 |
| 10 | Cách bắt đầu | Chọn dịch vụ → Tạo tài khoản/xác thực → Thanh toán, xem lịch | “Bắt đầu”; PT có điều kiện riêng, không hứa mọi dịch vụ chung một checkout |
| 11 | Dành cho HLV tự do | Phí thuê sân, quy trình chờ duyệt, quản lý lịch thuê | “Đăng ký HLV ngoài”; giải thích không quản lý học viên của HLV ngoài |
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
| K13 | `/register-external-coach` → OTP → Pending | Họ tên, email, SĐT, môn, mô tả; sau thành công phải nói đang chờ duyệt, không cho đặt sân ngay |
| K14 | `/forgot-password` → OTP/reset → Success | Không cần password cũ; phản hồi trung tính; gửi lại/hết hạn/sai mã |
| K15 | Google onboarding | Lần đầu thiết lập mật khẩu; trùng email chưa linked phải đăng nhập/liên kết rõ ràng; không tự merge tài khoản |
| K16 | `/account` → Hồ sơ / Bảo mật / Ngôn ngữ | Profile, change password, Google link/unlink theo API; giữ shell role; không trùng training profile |
| K17 | Trang lỗi/phiên hết hạn | 401, 403, 404, unavailable; next hợp lệ, không open redirect; tích hợp primitive An |

Thời hạn OTP registration/reset và OTP chi điểm tại quầy khác nhau; không tái sử dụng một giá trị hard-code cho cả hai. OTP input cho paste/autofill, error theo field và summary; không mất thông tin form khi lỗi mạng.

## 6. Portal ExternalCoach

Menu: **Tổng quan · Tìm & thuê sân · Lượt thuê của tôi · Tài chính**. Hồ sơ trong menu tài khoản và banner trạng thái duyệt.

| ID | Page/subpage | Route đề xuất | Chức năng |
|---|---|---|---|
| K18 | Tổng quan | `/external-coach` | Trạng thái Pending/Approved/Rejected/Suspended, lý do phù hợp, lượt thuê kế tiếp và việc cần làm |
| K19 | Tìm sân → Chọn slot → Review | `/external-coach/book` | Môn, sân, ngày/giờ, tổng số giờ, attendees nếu khai báo; quote chi tiết từng giờ, chính sách server |
| K20 | Pending checkout → Payment/result | Shared An | Countdown tài nguyên, điểm trước/VNPay phần còn; reconnect không tạo rental trùng |
| K21 | Lượt thuê → Chi tiết | `/external-coach/rentals`, `/external-coach/rentals/[id]` | Sắp tới/hoàn tất/hủy/pending; sân, giờ, price snapshot, invoice, sự cố |
| K22 | Hủy thuê → Kết quả | Dialog từ rental | >=24h hoàn 100% điểm, muộn 0 theo policy; quote/hệ quả, không gọi generic refund để hoàn lần hai |
| K23 | Đặt lại sau sự cố | F từ rental bị hủy | Mở availability với môn/ngày phù hợp; phải chọn slot và checkout mới; không hứa backend đã có quyền ưu tiên tự động |
| K24 | Tài chính → Ví / Hóa đơn | `/external-coach/finance?tab=...` | Shared An, chỉ data của chính mình; giữ alias routes wallet/invoices |
| K25 | Hồ sơ HLV ngoài | `/external-coach/profile` | Profile và chuyên môn/mô tả, trạng thái duyệt; tách cập nhật hồ sơ khỏi đổi role |

Suspended chặn đặt mới nhưng vẫn trình bày lịch sử, hóa đơn và xử lý lượt thuê hợp lệ theo backend. Không thay cả portal bằng trang trắng. Pending/Rejected có hướng dẫn rõ; không tự thêm “gửi lại hồ sơ” nếu API chưa có lifecycle đó.

## 7. API, file và dependency

- Public đã có: `GET /api/sports`, `/api/classes`, `/api/classes/{id}`, `/api/classes/{id}/public-sessions`, `/api/membership-packages/public`.
- **G01:** chưa có public projections đầy đủ cho sân/availability/giá, hồ sơ HLV, giá PT công khai. Marketing copy/contact/FAQ có thể là nội dung versioned, không cần CMS backend.
- Auth đã có: auth OTP/register/login/password forgot/reset, Google exchange/onboarding/link, `/api/users/me`; ExternalCoach auth và `/api/external-coaches/me`.
- Rental: policy, availability, mine/detail/cancel; POST `/api/checkouts/court-rental`. Dùng đúng quyền, không dùng endpoint lịch sân nhân viên cho Guest.
- **G09:** nâng bộ lọc catalog nếu giữ UI keyword/price/weekday; thu hẹp filter UI theo contract trong khi chờ.
- **G11:** backend cần kiểm tra callback VNPay anonymous trước nghiệm thu payment thật, không sửa FE để giả success.

Code đầu vào: `app/page.tsx`, `home.module.css`, `public-header.tsx`, `membership-pricing*`, `app/courses`, auth routes, `app/account`, `features/identity`, `features/rentals`, `app/external-coach`. `app/classes` là alias của courses: chọn canonical `/courses`, giữ redirect tương thích, không dựng hai catalog.

## 8. Thứ tự và nghiệm thu

1. Chủ trì landing: outline/copy/data sources → wireframe mobile/desktop → hero/course card mẫu → 14 section.
2. Public subpages + course-detail journey; auth preserving intent.
3. ExternalCoach onboarding → booking → financial history, nối shared An.
4. G01/G09 + responsive/a11y/performance; dọn dead links/legacy sections.

- [ ] Guest xem môn, khóa, giá, lịch công khai trước login; không bị gọi API yêu cầu nhân viên.
- [ ] Khôi có đủ landing sections, mỗi section có mục đích/CTA/data source, không chỉ một hero đẹp.
- [ ] Màn 360px không tràn ngang; heading/CTA không đè ảnh; dropdown và accordion dùng keyboard được.
- [ ] Không fake testimonials, coach credentials, số hội viên, sự kiện hoặc form liên hệ gửi giả.
- [ ] Login/OTP/Google lưu đúng next và không tự link email trùng.
- [ ] ExternalCoach Pending/Suspended không thể book; Approved có thể book theo policy server.
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
| G11 (phối hợp An) | K20/K24 |
| CAT-01 (phối hợp An) | K01–K05 |

**G11/D01–D05/D07/D08 và CAT-01** tại [An](01-AN-MEMBER-SHARED.md): Khôi tích hợp payment adapter K20/K24 và classification Gym/PT theo contract. **G06 do Khôi trực tiếp phụ trách** cho Q15/Q17 và K21–K23; không sửa database từ FE.

### API hiện có: tái sử dụng trước khi thêm

Kiểm verb, constraint và body trong controller/OpenAPI; page mới không nhất thiết cần endpoint mới.

| Nghiệp vụ | Endpoint hiện có | Consumer / lưu ý |
|---|---|---|
| Public sports | `GET /api/sports` | Khôi/An; active sports, anonymous |
| Public courses | `GET /api/classes`; `GET /api/classes/{id}`; `GET /api/classes/{id}/public-sessions` | Khôi/An; đừng dùng manager DTO công khai |
| Public Membership | `GET /api/membership-packages/public` | Khôi; không gọi endpoint authenticated khi guest |
| Auth/account | `/api/auth/register/otp`, `/register`, `/login`, `/password/forgot`, `/password/reset`; Google endpoints; `/api/users/me` | Khôi; đọc verb/body trong controllers, giữ OTP/onboarding/link rule |
| ExternalCoach | Auth external-coach OTP/register; GET/PUT `/api/external-coaches/me`; manager list/detail/approve/reject/suspend/reactivate | Khôi: Guest/ExternalCoach và Manager Q14 |
| Rental checkout | `POST /api/checkouts/court-rental` | ExternalCoach Approved; giữ room/coach occupancy |
| Checkout phục hồi | `GET /api/checkouts/{invoiceId}`, `/by-key`, `/by-reference` | Dùng `expiresAtUtc`, `serverNowUtc`, revision, fulfillmentOutcome; timer không thiếu API |
| Checkout actions | `POST /api/checkouts/{id}/confirm-points`, `/attempts`, `/cancel`, `/retry` | Retry intent/revision; không dựa return URL để commit |
| Chọn điểm self | `POST /api/wallet/me/checkouts/{id}/points`; `GET /api/invoices/{id}/point-selection` | Member/ExternalCoach, không nhận user tùy ý |
| Ví | `GET /api/wallet/me`, `/ledger`; `/api/members/{id}/points`, `/points/ledger`; `/api/manager/wallets/{id}`, `/ledger` | Đúng consumer self/frontdesk/manager; không alias mù |
| Invoice | `GET /api/invoices`, `/{id}`, `/by-item/{itemId}`; `/api/members/me/invoices`; `/api/external-coaches/me/invoices` | Detail có `Adjustments`; đủ xem refund theo invoice |
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

Chưa xác nhận endpoint Guest/ExternalCoach đủ điều kiện xóa. /classes và /courses là alias **frontend**, không phải hai backend API dư. Financial legacy do An giữ bản chính; Khôi kiểm consumers K20/K24 trước retire.

Không xóa API chỉ vì không thấy FE call. Giữ read-history, callback IPN/return, by-key/by-reference và projection theo role. Trước retire: scan consumers/tests/scripts/integrations, deprecation/OpenAPI, replacement, logs nếu có và compatibility regression. Đợt tài liệu này không xóa endpoint.

### Đóng việc API cùng FE

- [ ] Có request/response/error examples, role/ownership, freshness/pagination và compatibility; không tự đoán JSON.
- [ ] Mutation tiền/hold có idempotency/revision và backend validation; deadline từ server, points integer, VND do backend tính.
- [ ] Test success/error/forbidden và cạnh tranh/retry của gap trên; nối đúng page ở mapping.
- [ ] Chưa có backend: đánh dấu prototype/blocker, không toast thành công giả; phần API đã có vẫn triển khai.
- [ ] Cập nhật mục này + PR evidence khi chốt API; consumer xác nhận trước đóng gap hoặc retire legacy.

## Vai trò UI/UX Lead — Khôi

- Chốt mẫu UX/UI cho landing, checkout, quầy/calendar và Manager class/incident theo token đã chọn. Không tự đổi palette/font để thể hiện vai trò lead.
- Review theo hai mốc: **flow + màn mẫu trước nhân rộng**, và **trước merge thay đổi lớn về UX/UI**. Page chỉ tái sử dụng pattern đã duyệt không cần chờ Khôi review từng padding.
- An quyết định component API/cascade/accessibility implementation; Khôi quyết định hierarchy/layout/visual consistency. Thay đổi token/variant dùng chung: Khôi review trải nghiệm, An triển khai và quản lý compatibility.
- Không dùng lead review để thay kiểm nghiệp vụ/API: chủ page vẫn chịu trách nhiệm tests/evidence.

## Phần nhận thêm từ Manager — Khôi trực tiếp triển khai

**14 mục Q, giữ nguyên ID/route; Khoa không còn là owner các phần này.** Dùng AppShell An và Calendar/AI wrapper Hào; cùng design language với Guest nhưng mật độ dành cho vận hành.

| ID | Page → subpage | Route đề xuất | Chức năng / cấu trúc |
|---|---|---|---|
| Q01 | Tổng quan | `/manager` | Việc cần xử lý trước: lớp AtRisk, refund/request chờ duyệt, incident, lịch hôm nay; KPI có khoảng thời gian và link |
| Q02 | Lịch vận hành → Theo sân / Coach / lớp → Chi tiết | `/manager/schedule?view=...` | Ngày/tuần/list; nhận diện lớp/PT/rental/block; filter giữ trên URL; thay đổi lịch mở form review |
| Q03 | Khóa học → Danh sách | `/manager/classes` | Status, môn, keyword, threshold; các saved view Draft/Đang tuyển/AtRisk/Đang học/Lịch sử |
| Q04 | Khóa học → Tạo/sửa | `/manager/classes/new`, `/manager/classes/[id]/edit` | Các bước nội dung → Coach/sân/lịch → giá/chi phí/sĩ số → xem lịch sinh ra → lưu nháp/publish riêng |
| Q05 | Khóa học → Chi tiết | `/manager/classes/[id]` | Tab Tổng quan, Lịch buổi, Học viên, Giữ chỗ, Điều kiện mở lớp, Lịch sử |
| Q06 | Chi tiết lớp → Publish / Dời buổi / Hủy buổi-bù / Hủy lớp | F từ Q05 | Preview xung đột/tác động, lý do, lịch mới, hoàn điểm nếu hủy cả lớp; gửi thông báo qua server |
| Q07 | Điều kiện mở lớp → Xử lý ngưỡng | Tab Q05 hoặc saved view Q03 | Giá/chi phí/ngưỡng/số Confirmed, deadline, phản hồi Member; waive có lý do, không coi hold là đã ghi danh |
| Q13 | HLV trung tâm → Tạo/sửa → Chi tiết | `/manager/coaches`, `/manager/coaches/[id]` | Account Coach, chuyên môn, mô tả, lịch phân công; cảnh báo chuyên môn thay đổi ảnh hưởng lớp hiện tại |
| Q14 | HLV ngoài → Duyệt hồ sơ → Chi tiết | `/manager/external-coaches`, detail | Pending/Approved/Rejected/Suspended; approve/reject/suspend/reactivate có lý do; rental history |
| Q15 | Sân & cơ sở vật chất → Sân/phòng → Chi tiết | `/manager/facilities`, `/manager/facilities/[id]` | Môn tương thích, trạng thái, opening-hours, lịch block; block có hoạt động ảnh hưởng dẫn IncidentWorkbench |
| Q16 | Loại sân/phòng | Tab Q15 hoặc Danh mục | Loại và môn tương thích, validation tham chiếu; không xóa lịch sử |
| Q17 | Sự cố → Tạo/preview/xử lý → Chi tiết | `/manager/incidents`, `/manager/incidents/[id]` | IncidentWorkbench bên dưới; history/detail **G06** |
| Q18 | Thông báo → Soạn/xem trước → Theo dõi gửi | `/manager/notices`, detail | Chọn nhóm đúng quyền, review nội dung/người nhận, idempotency; lịch sử danh sách **G07** |
| Q28 | AI xếp lịch | Drawer từ Q04/Q02 | Gợi ý → Xem lại & Chỉnh sửa → Lưu nháp; **G03**; không tự publish |

### Tạo lớp và xử lý ngưỡng — Q03–Q07

Form nhiều bước trên page riêng, draft dễ quay lại. Review sinh lịch phải thấy tất cả buổi, sân/Coach, xung đột, ngày ngoài giờ mở cửa. Giá/chi phí/sĩ số cùng phần, ngưỡng = ceil(cost/price) là preview; server xác nhận lại và chặn ngưỡng vượt capacity.

Chi tiết lớp ưu tiên status và tác vụ tiếp theo; table học viên/holds tách vì ý nghĩa khác nhau. Khách công khai không thấy cost nội bộ. Công khai giải thích điều kiện mở lớp theo nội dung được duyệt, không render nguyên manager DTO.

Các lựa chọn của Member:

- Chuyển lớp: cùng môn, hợp lệ, còn chỗ, quote chênh; nếu phải trả thêm thì chờ checkout.
- **Chờ đợt sau: hoàn 100% điểm ngay và lưu nguyện vọng nhận tin khóa phù hợp.** Không giữ tiền/ghế và không tự đăng ký khóa mới; giá khóa mới theo checkout mới.
- Hoàn điểm: hoàn 100% theo event/quy tắc, không lưu nguyện vọng nhận tin.

Manager thấy khác nhau giữa “Hoàn điểm” và “Hoàn điểm + nhận tin khóa sau”; không hiển thị cả hai như Transfer pending. Khóa mới publish kích hoạt thông báo matching theo G02, không tự thu điểm.

Q08 nguyện vọng và G02 backend do **An** làm; Khôi gắn entry/status vào Q07. Đóng tuyển sinh G13 là command riêng, không map sang cancel hoặc sửa capacity giả. Khôi sở hữu ClassEditor/ThresholdManager và validation UI; server xác nhận ngưỡng/giá/conflict.

### IncidentWorkbench — Q15/Q17

Một page thực hiện từ preview tới xử lý, không rải ra năm màn mất ngữ cảnh:

1. **Phạm vi:** một sân hoặc toàn trung tâm, thời gian, lý do.
2. **Preview:** tự tải danh sách bị ảnh hưởng; nhóm lớp/PT/rental/pending/block; tổng số buổi/người/lượt thuê và giá trị bồi hoàn khi API cung cấp. Không dùng con số tự ước lượng như quote chính thức.
3. **Phương án từng dòng:** lớp dời hoặc hủy kèm buổi bù; PT dời/hủy theo rule; confirmed rental hủy và hoàn 100% điểm; pending rental hủy và release điểm/slot; existing block xử lý theo resolution option hợp lệ.
4. **Review:** lịch cũ/mới, người nhận, điểm hoàn, thao tác còn chặn; cho Xem lại & Chỉnh sửa. Nút rõ “Xác nhận xử lý và khóa sân”.
5. **Kết quả:** trạng thái từng thao tác, ledger/refund reference, block, thông báo queued/sent/failed. Email fail không phải nghiệp vụ rollback; retry giao hàng không hoàn điểm lại.

**Hiện trạng quan trọng:** backend preview/resolve đã có nhưng `resolve` từ chối khi còn class/PT/block cần xử lý. UI hiện tại có thể dùng các API dời/bù trong cùng workbench rồi preview lại; các bước này không phải một transaction chung. Phải ghi nhận bước đã hoàn thành khi bước sau lỗi, không nói “tất cả đã rollback”. G06 đề xuất enrichment/history và reservation fence để tránh người khác đặt vào khung đang xử lý trước lúc block cuối.

Không gửi thêm manual notice trùng với thông báo tự động cùng sự kiện. Trường hợp cần thông báo bổ sung chỉ cho chọn người/nội dung rõ ràng. Preview cũ khi lịch thay đổi phải reload; không tin `canResolve` cũ sau vài phút.

### HLV, thông báo và AI — Q13/Q14/Q18/Q28

Q13 quản lý HLV nội bộ và specialty theo CAT-01 của An; Q14 duyệt/suspend/reactivate HLV ngoài phải phản ánh đúng lifecycle portal K18–K25. Q18 là composer/history thông báo; dùng Notification Panel chung của An, không dựng một inbox thứ hai. Q28 dùng AI Drawer của Hào: Xem lại & Chỉnh sửa → lưu nháp bằng ClassEditor; không tự publish.

### API đi cùng phần việc nhận thêm

| Nghiệp vụ | Endpoint hiện có | Consumer / lưu ý |
|---|---|---|
| ExternalCoach | Auth external-coach OTP/register; GET/PUT `/api/external-coaches/me`; manager list/detail/approve/reject/suspend/reactivate | Khôi: Guest/ExternalCoach và Manager Q14 |
| Lịch sân/availability staff | `GET /api/manager/court-schedule`, `/rentals`; `/api/coaches/me/court-schedule`; `/api/availability/rooms`, `/coaches`, `/rooms/{id}/busy` | Quyền khác nhau, public không dùng trực tiếp |
| Attendance | `GET /api/class-sessions/{id}/roster`; `PUT /api/class-sessions/{id}/attendance/{enrollmentId}` | Lễ tân ghi từng dòng; Coach/Manager đọc theo quyền |
| Lớp Manager | `/api/manager/classes` CRUD/detail/publish/cancel/cancellation-preview/holds/enrollments/threshold-responses/threshold waive/pricing | G13 nếu cần manual close enrollment |
| Incident | `POST /api/manager/incidents/preview`, `/resolve`; `GET /{id}/notifications` | Đã có, còn hạn chế tại G06 |
| Manual notice | `POST /api/manager/notices`; `GET /{id}`, `/by-key/{key}` | Đã gửi/theo dõi được; G07 thiếu history list/preview recipients |
| Catalog/coaches | sports/room-types/rooms/opening-hours/room-blocks/court-rates/membership-packages, manager coaches/external coaches, system-settings | Tái dùng, gom UI không buộc gom API |

| Mục | Page/subpage | Việc Khôi chịu trách nhiệm |
|---|---|---|
| G03 | Q02/Q04/Q28 | Suggestion chỉ đọc, review/edit rồi tạo nháp; Hào cung cấp wrapper |
| G06 | Q15/Q17; K21–K23 consumer | Incident preview/history/fence/recovery; trạng thái từng bước thật |
| G07 | Q18 | Notice list/recipient preview/delivery không gửi trùng |
| G13 | Q03/Q05/Q06 | Chốt đóng tuyển sinh độc lập hủy lớp, xử lý hold đang tồn tại |
| G02 (consumer) | Q07 | An giữ spec và Q08; tích hợp trạng thái ngưỡng/interest |
| CAT-01 (consumer) | K01–K05/Q13 | An giữ schema/migration; kiểm public catalog và Coach specialty |

### Backlog API nhận từ Khoa

#### G03 — Manager AI hỗ trợ xếp lịch [P1; Khôi + Hào]

**Bằng chứng:** [AiController](../../backend/SportHub.AI/Api/AiController.cs) `POST chat` chỉ Member; suggestions chỉ Coach PT. Availability và create class đã có, thiếu orchestration gợi ý Manager.

Đề xuất `POST /api/manager/ai/class-schedule-suggestions` body sportId, numSessions, date range, preferred times, optional room/coach IDs; trả `suggestionId`, generatedAt, proposals, proposed fields, warnings/conflicts. Chỉ đọc, không ghi class. Lọc Coach specialty, giờ hoạt động/room compatibility ngay trong service, không tin model tự kiểm.

FE mở review/edit; sau xác nhận dùng **POST `/api/manager/classes` đang có** để lưu nháp. Có thể thêm optional suggestionId làm provenance, không cần thêm endpoint AI có quyền publish. Backend validate lại occupancy tại thời điểm create/save. Nếu cần function-calling theo BR-123, tool registry cũng phải giới hạn và buộc explicit confirmation token/action riêng.

Test role, conflict phát sinh sau suggestion, thiếu provider/dữ liệu, request trễ không ghi đè draft mới, không ghi DB chỉ vì sinh gợi ý. Member/Coach chat không được gọi route Manager.

#### G06 — Sự cố: history/detail, preview đầy đủ và bảo vệ khung giờ đang xử lý [P1; Khôi]

**Bằng chứng:** [IncidentsController](../../backend/SportHub.Scheduling/Rental/Api/IncidentsController.cs) chỉ notifications/preview/resolve; [IncidentService](../../backend/SportHub.Scheduling/Rental/Application/IncidentService.cs) preview trả sourceType/sourceId/time/resolutionOptions, resolve chặn class/PT/block; confirmed rentals hoàn điểm, pending rentals release, cuối cùng mới tạo room block. Không có list/detail route hay preview refund/recipient breakdown đầy đủ.

Đề xuất `GET /api/manager/incidents?from&to&roomId&page&pageSize`, `GET /api/manager/incidents/{id}`; persist initial impacts/outcomes để lịch sử không phải suy từ occupancy đã xóa. Enrich preview: room/class/coach display names, beneficiary counts, confirmed-vs-pending, computed refund points theo item, notification recipients summary (data scoped), required resolution actions và version/fingerprint.

Nâng workflow theo thứ tự: preview → tạo incident draft/fence riêng chặn booking mới vào phạm vi → thực hiện phương án lớp/PT có checkpoint → preview lại → commit rental refunds/final block → outbox. Fence không thể là room occupancy block đè lên occupancy đang tồn tại; thiết kế status/range guard riêng được mọi write kiểm tra trong transaction. Cần release/expiry/recovery fence nếu bỏ dở; không treo sân vô hạn. Đây là phần backend bổ sung, không tuyên bố current resolve đã làm.

Có thể giao giai đoạn đầu chỉ dùng current preview + action riêng + recheck và ghi rõ nguy cơ lịch thay đổi; không nói mọi bước atomic. Mutation cuối nên nhận preview version + idempotency key, trả outcomes/ledger refs/notice IDs để resume sau timeout. Gửi thủ công bổ sung không trùng automated event.

Test incident một sân/toàn trung tâm, PT không room, pending/paid rental, class bù, schedule race giữa preview và commit, failure giữa các bước, repeated resolve, email retry, no double credit, history sau reload. Không lấy preview tổng tiền do FE tự cộng làm nguồn hoàn chính thức.

#### G07 — Lịch sử thông báo thủ công và preview người nhận [P1; Khôi]

**Bằng chứng:** [NoticesController](../../backend/SportHub.Notification/Api/NoticesController.cs) có send/detail/by-key, chưa thấy GET root list hay POST preview. Có thể gửi đúng theo service hiện tại nhưng màn history/review đầy đủ thiếu contract.

Đề xuất `GET /api/manager/notices?status&from&to&page&pageSize`; `POST /api/manager/notices/preview` nhận cùng selector, trả tổng/người nhận được phép/channel và thời điểm; server tính lại khi send. Không cho FE tự upload danh sách email bất kỳ để bypass selector. Dùng Idempotency-Key hiện có khi send, status gắn outbox, retry delivery có dedup.

Test selector Member theo lớp/Coach/ExternalCoach theo rental window; preview khác actual recipients khi dữ liệu đổi phải giải thích; không resend trùng do timeout.

#### G13 — Đóng tuyển sinh thủ công mà vẫn giữ lớp [P1; Khôi]

**Bằng chứng:** ClassesController có publish/cancel và enum ClassStatus chỉ lifecycle; chưa có close-enrollment command. Sơ đồ UI trước đó có “close”, nhưng cancel không tương đương.

Đề xuất tách enrollment availability khỏi class lifecycle, thêm `POST /api/manager/classes/{id}/enrollment/close {reason}` và reopen nếu nghiệp vụ cho phép. Kiểm tra hold/attempt đang tồn tại, late payment, threshold transfer, public CTA. Chính sách đề xuất: chặn checkout mới, giữ quyền lợi Confirmed; hold cũ xử lý theo deadline/quote đã cam kết, không tự hủy khi chưa chốt rule. Đưa chính sách này vào BR trước implementation command. Trong lúc chưa có, bỏ action active khỏi production UI, vẫn giữ thiết kế/gap ID.

### Checklist nhận thêm

- [ ] Q01 KPI có kỳ đo/nguồn/link; ưu tiên việc cần xử lý, không tự tạo aggregate API cho mọi card.
- [ ] Q02 filter/calendar giữ context; Q04 thấy đủ buổi, conflict và trạng thái draft/publish.
- [ ] Holds khác Confirmed; ngưỡng không vượt capacity; public không thấy cost nội bộ.
- [ ] Dời/hủy buổi xử lý bù và thông báo đúng; hủy lớp có preview, không hoàn điểm hai lần.
- [ ] Q13/Q14 đúng lifecycle/role; suspend không làm mất lịch sử rental.
- [ ] Q15/Q17 liệt kê đủ impacts, không báo đã khóa khi còn class/PT chưa xử lý; email fail không đồng nghĩa refund fail.
- [ ] Q18 preview người nhận và trạng thái delivery; timeout/retry không gửi trùng.
- [ ] Q28 bắt buộc review/edit; conflict khi lưu giữ dữ liệu form.
- [ ] Khôi review visual; An review thay đổi shared/financial contract, Hào review calendar/AI contract.

### File triển khai, route và thứ tự phần Manager

Code đầu vào: `app/manager` theo route được giao; `features/courses`, `features/coaches`, `features/incidents` và phần facilities/notices tương ứng. Class/court schedule cũ gom thành Q02 nhưng giữ redirect/query/deep-link. Khôi bàn giao cấu hình navigation cho An, không tự tạo AppShell riêng.

Triển khai mẫu class/incident cùng landing mẫu → Q01–Q07 → HLV/sân → incident/notices/AI theo API. Có thể làm UI states bằng fixture có nhãn trong lúc chờ G03/G06/G07/G13; không báo production complete. API và sự cố tài chính review cùng An; Calendar/AI interaction review cùng Hào.
