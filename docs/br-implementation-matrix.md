# Ma trận triển khai Business Rules v1.4 (BR-1 → BR-64)

> Lập 22/09/2026. Nguồn yêu cầu: `SportManagement_BusinessRules.docx` v1.4 và
> [SSOT](00-Source-of-Truth.md). Giữ nguyên 64 mã BR, không đánh số lại.
>
> **Cột "Bằng chứng" là phần quan trọng nhất của bảng này.** Không cột nào được chép từ báo
> cáo cũ. Trạng thái baseline và blockers: [implementation-status.md](implementation-status.md).

## Quy ước trạng thái

| Ký hiệu | Nghĩa |
|---|---|
| ✅ **Đã kiểm chứng** | Có code VÀ có test tự động đã CHẠY và PASS trong phiên này |
| 🟡 **Code có, chưa chạy test** | Code tồn tại và build được, nhưng test phủ nó chưa chạy được |
| 🟠 **Code có, chưa có test** | Code tồn tại, không có test tự động phủ rule này |
| ❌ **Chưa làm** | Không có code đáp ứng rule |
| ⏸️ **Ngoài đợt** | Thuộc Flow 6 stretch hoặc phụ thuộc hạ tầng deploy |

> **Cập nhật cuối phiên 22/09:** blocker B1 (Docker) đã gỡ. **191/191 test pass**, migration
> kiểm chứng hai chiều trên dữ liệu legacy, và kịch bản nghiệm thu §9.4 chạy hết qua HTTP
> thật — xem [implementation-status.md §7](implementation-status.md). Các dòng liên quan đã
> chuyển từ 🟡 sang ✅ bên dưới.

---

## A. Tài khoản người dùng & xác thực

| BR | Yêu cầu v1.4 (tóm tắt) | Code / API | Test | Trạng thái | Bằng chứng |
|---|---|---|---|---|---|
| BR-1 | Member tự đăng ký bằng email duy nhất, password đủ mạnh | `Identity/AuthService.cs`, `POST /api/auth/register` | `Security.Tests` | ✅ | `Security.Tests` 65/65 pass |
| BR-2 | Chỉ SystemAdministrator tạo tài khoản nhân sự/đổi role; token role cũ bị từ chối | `Administration/UserAdminService.cs`, `AuthorizationPolicyExtensions` | `Security.Tests/AccountStatusJwtTests` | ✅ (JWT) / 🟠 (endpoint) | 65/65 pass. Phần "token role cũ bị từ chối ở request sau" **chưa có test riêng** |
| BR-3 | Mỗi tài khoản đúng một vai trò | `UserAccount.RoleId` (FK not-null), seed 5 role | — | 🟠 | Ràng buộc schema; không có test khẳng định |
| BR-4 | (Hồ sơ hội viên) | `Identity/AccountService.cs` | — | 🟠 | |
| BR-5 | (Đăng nhập) | `AuthService.LoginAsync` | `LoginContractTests` | ✅ | 65/65 pass |
| BR-6 | Chỉ SysAdmin khóa/mở khóa; account không Active bị từ chối JWT | Hook `OnTokenValidated` + `IsActiveAsync` | `AccountStatusJwtTests` | ✅ (JWT) / 🟠 (endpoint) | 65/65 pass. SSOT §5.6 ghi phần endpoint đổi trạng thái **chưa đạt** |
| BR-7 | Không tự khóa mình / không khóa SysAdmin Active cuối cùng; có Audit kèm lý do | `UserAdminService` | — | 🟠 | SSOT §5.6 liệt kê đây là mục **chưa đáp ứng**; cần xác minh lại |
| BR-49 | Email duy nhất | Unique index `user_accounts.email` | `Security.Tests` | ✅ | 65/65 pass |
| BR-59 | Google link phải tường minh, không auto-link email trùng | `Identity/GoogleAuthService.cs` | — | 🟠 | Không có ClientId thật để thử (blocker B5) |
| BR-60 | Credential nullable cho account Google-only; lỗi login không lộ tài khoản | `UserCredential.PasswordHash` nullable; 401 chung | `LoginContractTests` | ✅ | 65/65 pass |
| BR-62 | Phone unique (partial index, bỏ qua NULL) | Partial unique index `user_profiles.phone` | — | 🟠 | |
| BR-63 | `role_name` unique, 5 role cố định | Unique index + seed | — | 🟠 | |

---

## B. Hội viên & gói thành viên

| BR | Yêu cầu v1.4 | Code / API | Test | Trạng thái | Bằng chứng |
|---|---|---|---|---|---|
| BR-8 | Chỉ Manager quản lý catalog; `IsActive=false` chặn mua mới, không ảnh hưởng gói đã bán | `Membership/MembershipPackageService.cs` | — | 🟠 | |
| BR-9 | Gói Active khi còn hạn VÀ còn lượt | `MemberPackageRules.IsUsable` | `Scheduling.Tests` | ✅ | 54/54 pass |
| BR-10 | Một gói cùng PackageId Active tại một thời điểm; ngoại lệ cần Manager duyệt, lưu actor/time/reason | `MemberPackage.StackingApproved*`; **mới**: kiểm tra lại lúc kích hoạt trong `PackageActivationService` | `DepositAndActivationTests` | ✅ | **Sửa thật trong phiên này** — trước đó chỉ kiểm lúc bán. 57/57 Payment test pass; ca cộng dồn cũng được API trả 409 `duplicate_active_package` khi chạy kịch bản thật |
| BR-11 | Expired → Active có điều kiện khi hoàn lượt; vướng BR-10 thì vẫn hoàn lượt, giữ Expired, báo Manager | `MemberPackageRules.RestoreSession` (**viết lại**), `EnrollmentService`, `ClassSessionService` | — | 🟠 | **Sửa trong phiên này**: thêm kiểm tra `StartDate`, kiểm tra BR-10, luôn hoàn lượt, thông báo cần Manager. Build + 54/54 Scheduling test cũ vẫn pass, nhưng **chưa có test riêng cho nhánh mới** |
| BR-56 | Tên gói unique | Unique index `membership_packages.name` | — | 🟠 | |

---

## C. Lớp học, lịch học & phòng tập

| BR | Yêu cầu v1.4 | Code / API | Test | Trạng thái | Bằng chứng |
|---|---|---|---|---|---|
| BR-12 | Lớp cần Phòng + Bộ môn; Coach gán sau được | `Scheduling/ClassService.cs`, CHECK `CK_classes_discipline_allowed` | `ClassDisciplineConstraintTests` | ✅ | 54/54 pass |
| BR-13 | Confirmed ≤ Capacity ≤ Baseline/phòng; không giảm dưới ConfirmedCount; không trùng giờ phòng/Coach `[start, end)`; nguyên tử | `ClassSessionService`, index `(room_id, start_at_utc)`, `(coach_id, start_at_utc)` | `Scheduling.Tests` | ✅ (phần cũ) / 🟠 (BR-13 v1.4) | 54/54 pass, nhưng **chưa rà lại theo v1.4 trong phiên này** |
| BR-14 | Chỉ Manager phân công Coach | Policy `CenterManager` | — | 🟠 | |
| BR-15 | Session thừa hưởng khung giờ từ recurrence trừ khi override | `ClassRecurrence` → `ClassSession` | — | 🟠 | |
| BR-51 | `BaselineCapacity = MIN(Room, Class)` lúc tạo và bất biến | `ClassSessionService` | — | 🟠 | **Chưa rà lại trong phiên này** |
| BR-54 | Hủy/dời buổi: hủy đăng ký cũ, hoàn lượt, không phạt; dời tạo buổi thay thế có liên kết; không tự chuyển Member | `ClassSessionService.ReleaseEnrollmentsAsync` | — | 🟠 | **Sửa trong phiên này**: thêm kiểm tra BR-10 khi hoàn lượt (query gộp, tránh N+1). 54/54 test cũ vẫn pass; **chưa có test riêng cho nhánh mới** |
| BR-57 | Tên phòng unique | Unique index `rooms.name` | — | 🟠 | |
| BR-64 | Gym check-in chỉ cần ≥1 gói Active; không trừ lượt; không giới hạn số lần/ngày | `Scheduling/GymCheckInService.cs` | `GymCheckIn*Tests` (4 file) | ✅ | 54/54 pass |

---

## D. Đăng ký lớp (đăng ký & hủy)

| BR | Yêu cầu v1.4 | Code / API | Test | Trạng thái | Bằng chứng |
|---|---|---|---|---|---|
| BR-16 | Chỉ dùng gói của chính mình đang Active; không giữ hai Enrollment giao giờ; giữ chỗ + trừ lượt + tạo Enrollment cùng transaction; unlimited giữ null | `EnrollmentService.EnrollAsync` | `Scheduling.Tests` | ✅ | 54/54 pass |
| BR-17 | Member/Lễ tân hủy; phân loại theo BR-50 | `EnrollmentService.CancelAsync` | `Scheduling.Tests` | ✅ | 54/54 pass |
| BR-18 | Hủy đúng hạn hoàn lượt; hiệu lực một lần kể cả retry; giảm ConfirmedCount đúng một lần | `EnrollmentService.CancelAsync` + `ExecuteUpdateAsync` có điều kiện `ConfirmedCount > 0` | — | 🟠 | **Sửa trong phiên này** (nhánh BR-10/11). 54/54 test cũ vẫn pass; **chưa có test riêng cho nhánh mới** |
| BR-19 | Tối đa một đăng ký còn hiệu lực mỗi buổi | Unique index `(session_id, member_id)` | — | 🟠 | |
| BR-50 | Mặc định 12 giờ, Manager cấu hình; Enrollment snapshot `CancellationDeadlineHours`; đổi cấu hình không đổi booking cũ | `Enrollment.CancellationDeadlineHours`, `SystemSettingService` | — | 🟠 | **Chưa rà lại trong phiên này**; plan §5.5 yêu cầu test mốc biên, chưa có |

---

## E. Điểm danh

| BR | Yêu cầu v1.4 | Code / API | Test | Trạng thái | Bằng chứng |
|---|---|---|---|---|---|
| BR-20 | No-show tự động sau buổi cho đăng ký còn hiệu lực chưa điểm danh; đăng ký đã hủy không bị No-show | `AttendanceFinalizerJob` | — | 🟠 | Plan §5.8 yêu cầu kiểm cả session hủy/dời — **chưa rà** |
| BR-21 | Tối đa một bản ghi điểm danh mỗi (member, session) | Unique `attendances.enrollment_id` | — | 🟠 | |
| BR-22 | Chỉ Coach được gán buổi hoặc Lễ tân điểm danh | Policy `AttendanceCheckIn` | — | 🟠 | |
| BR-53 | Present/Absent ghi tay; No-show chỉ do job; job không đè bản ghi đã có | `AttendanceFinalizerJob` | — | 🟠 | **Chưa rà lại trong phiên này** |

---

## F. Huấn luyện viên & bài tập

| BR | Yêu cầu v1.4 | Code / API | Test | Trạng thái | Bằng chứng |
|---|---|---|---|---|---|
| BR-23 | Plan lớp do Coach được phân công; plan cá nhân cần quan hệ Active do Manager tạo; Coach không tự cấp quyền; quan hệ từ lớp phải giới hạn theo lớp | `Training/CoachMemberRelationshipService.cs`, `WorkoutService.cs` | — | 🟠 | **Điểm kết thúc quan hệ ClassBased vẫn là câu hỏi mở** (SSOT §7) — chưa tự quyết |
| BR-24 | Chỉ Coach dạy buổi đó ghi được kết quả | `WorkoutService` | — | 🟠 | |
| BR-25 | Member xem được, không sửa được | Policy + endpoint read-only | — | 🟠 | |
| BR-61 | WorkoutResult chỉ cho Enrollment `Confirmed`; không thêm điều kiện Present | `WorkoutService` | — | 🟠 | |

---

## G. Tích hợp AI

| BR | Yêu cầu v1.4 | Code / API | Test | Trạng thái | Bằng chứng |
|---|---|---|---|---|---|
| BR-26 | Gợi ý dựa trên ≥3 đầu vào: mục tiêu, trình độ, lịch sử ≥30 ngày | `AI/WorkoutRecommendationService.cs`, `RuleBasedAiRecommendationService` (`HistoryWindowDays = 30`) | — | 🟠 | Ba đầu vào có trong code. **Không phải AI provider thật** — blocker B4 |
| BR-27 | Mọi request/response AI ghi `AiLog` gồm payload và thời gian | `WorkoutRecommendationService` → `AiLog` | — | 🟠 | |
| BR-28 | Chatbot trả lời ≤3 giây | — | — | ⏸️ | Flow 6 stretch (SSOT §1.4) |
| BR-29 | Chatbot giới hạn phạm vi, không tư vấn y tế/pháp lý/tài chính | — | — | ⏸️ | Flow 6 stretch |

---

## H. Thanh toán & hóa đơn — **trọng tâm phiên này**

| BR | Yêu cầu v1.4 | Code / API | Test | Trạng thái | Bằng chứng |
|---|---|---|---|---|---|
| BR-30 | Cùng transaction tạo MemberPackage/Invoice/Item; chỉ kích hoạt khi đủ nghĩa vụ hợp lệ + thỏa BR-9/10; StartDate = ngày trả đủ giờ VN; EndDate = Start + Duration − 1; kích hoạt một lần, retry không reset | `PackagePurchaseService`, **`PackageActivationService.cs` (mới)** | `DepositAndActivationTests` (4 test) | ✅ | **Sửa thật trong phiên này**: trước đây kích hoạt chỉ nằm ở đường thu tiền, nên một Discount làm tròn nghĩa vụ để gói kẹt ở PendingPayment. **57/57 pass** |
| BR-31 | Hóa đơn đã phát hành không xóa được | Không có endpoint xóa; FK `Restrict` | `RefundWorkflowTests.Hoa_don_khong_bi_xoa...` | ✅ | 57/57 pass |
| BR-32 | Chỉ Manager xem/xuất báo cáo tài chính | Policy `CenterManager` trên `RevenueReportsController` | `RevenueReportPeriodTests` (Theory 4 role) | ✅ | 57/57 pass; kịch bản thật: letan `403`, manager `200` |
| BR-40 | Hóa đơn không bao giờ bị xóa; mọi sửa đổi qua PaymentAdjustment | `InvoiceMath.DeriveStatus` giữ `Paid`/`Void` | `InvoiceBalanceTests.DeriveStatus_giu_Paid_khi_da_hoan_tien` | ✅ | **Unit test PASS.** Trước đây `Paid` có thể bị kéo ngược về PartiallyPaid |
| BR-41 | 6 đại lượng tách bạch; Refund không giảm nghĩa vụ; Discount/Correction không tự là tiền hoàn; thu mới dương và ≤ Outstanding; khóa nguyên tử | **`InvoiceMath.cs` viết lại hoàn toàn**, `InvoiceQueryService` tách hai tổng | `InvoiceBalanceTests` (25 test) + `RefundWorkflowTests` | ✅ | **25 unit test + 32 integration test PASS.** Phần khoá nguyên tử ban đầu **FAIL thật** (thu 2 triệu trên hoá đơn 1 triệu) — đã sửa bằng `SELECT ... FOR UPDATE` trên hàng `invoices`, xem implementation-status.md §7.2 |
| BR-42 | Lễ tân tạo, Manager duyệt không tự duyệt; **Refund Approved chưa phải đã trả**; Lễ tân xác nhận thực trả mới Completed, lưu người/thời điểm/phương thức/tham chiếu + Audit cùng transaction; không đổi số đã duyệt; retry không hoàn hai lần | **`PaymentAdjustmentService.CompleteRefundAsync` (mới)**, `POST /api/payment-adjustments/{id}/complete`, `SELECT ... FOR UPDATE`, 2 CHECK constraint | `RefundWorkflowTests` (14 test) | ✅ | **Thay đổi lớn nhất phiên này — đã chạy đủ.** Phủ retry, hai kiểu đồng thời, sai vai trò, tự duyệt, thiếu mã tham chiếu, complete một Discount. Kịch bản thật: duyệt Refund cho `awaitingPayout=true`, tiền KHÔNG đổi; chỉ bước complete mới đổi |
| BR-43 | Thu ròng = Payment Success theo ngày thu − Refund Completed theo ngày THỰC TRẢ; Discount/Correction hiển thị riêng; ngày duyệt không thay ngày thực hoàn | **`RevenueReportService.cs` viết lại** | `RevenueReportPeriodTests` (8 test) | ✅ | Test duyệt-tháng-4/trả-tháng-5 **pass**. Kịch bản thật: `collected=3600000 refunded=500000 obligationReduction=500000 NET=3100000` — NET không trừ giảm nghĩa vụ |
| BR-52 | Refund mặc định theo tỷ lệ phần chưa dùng; Manager override có lý do, không vượt số thực thu còn hoàn được; complete phải thỏa RefundDue | `RefundCalculator.SuggestDefault`, `EnsureWithinCeiling` (trần khác nhau theo loại), kiểm `MaxRefundable` + `RefundDue` lúc complete | `RefundWorkflowTests` | ✅ (trần) / 🟠 (công thức ngày) | Trần theo loại là **mới** — trước đây Refund dùng chung trần với Discount. **57/57 pass**. **Công thức "ngày hiện tại có tính là chưa dùng không" vẫn là câu hỏi mở** (SSOT §7) — chưa tự quyết |
| BR-55 | Hạn đầu = phát hành + 2 tháng lịch; chỉ CỌC (còn dư nợ sau thu) nhận tại/trước hạn đầu mới gia hạn +12 tháng; khoản sau không gia hạn; sau hạn chặn thu thông thường, không tự Void/Cancel/tịch thu | `InvoiceMath.InitialDueDate/DueDateAfterFirstDeposit`, `PaymentRecordingService` | `InvoiceBalanceTests` (4 test ngày) + `DepositAndActivationTests` (5 test) | ✅ | **Test AddMonths cuối tháng + năm nhuận PASS.** Phân biệt cọc/trả đủ và chặn thu quá hạn là **mới trong phiên này** — 5 integration test pass |
| BR-58 | InvoiceNumber unique, sinh từ DB sequence | `InvoiceNumberGenerator` + sequence `invoice_number_seq` | — | 🟠 | |

---

## I. Thông báo

| BR | Yêu cầu v1.4 | Code / API | Test | Trạng thái | Bằng chứng |
|---|---|---|---|---|---|
| BR-33 | Thông báo đổi lịch/hủy/sắp hết hạn; ngưỡng mặc định 7 ngày cấu hình được; nội dung nêu rõ booking cũ đã hủy, lượt đã hoàn, cần đăng ký lại; job không gửi trùng | `ClassSessionService` (message đầy đủ), `PackageExpiryReminderJob`, **mới**: thông báo khi vướng BR-10 | — | 🟠 | Nội dung message có đủ 4 ý. **"Job không gửi trùng" chưa có test** |
| BR-34 | Thông báo khi nhận thanh toán | `PaymentRecordingService` → `NotificationEvents.PaymentReceived` | — | 🟠 | |

---

## J. Phi chức năng

| BR | Yêu cầu v1.4 | Code / API | Test | Trạng thái | Bằng chứng |
|---|---|---|---|---|---|
| BR-35 | API tiêu chuẩn trung bình ≤200 ms | — | `PerformanceProbeTests` | 🟡 | SSOT §5.6 có số đo 18/09 (login mean 130–150 ms, **p95 chạm 193 ms**, biên mỏng). **Chưa đo lại trong phiên này** |
| BR-36 | Uptime | — | — | ⏸️ | Cần quan sát môi trường deploy; không suy ra từ test local |
| BR-37 | (Khả năng mở rộng) | — | — | ⏸️ | |
| BR-38 | HTTPS | HTTPS redirect trong `Program.cs` | — | ⏸️ | SSOT §5.6: test chạy trên HTTP của TestServer nên **không phải bằng chứng** |
| BR-39 | (Audit/bảo mật vận hành) | `Audit/AuditLog` + `IAuditWriter` | — | 🟠 | |

---

## K. Báo cáo & xuất dữ liệu

| BR | Yêu cầu v1.4 | Code / API | Test | Trạng thái | Bằng chứng |
|---|---|---|---|---|---|
| BR-44 | File xuất chỉ chứa cột Manager đã chọn | `ReportTypes.AllowedColumns` whitelist, giữ thứ tự whitelist | `ReportPdfRendererTests.Chi_in_cot_da_chon` | ✅ | **Whitelist cột Revenue đã cập nhật trong phiên này** cho 6 đại lượng v1.4 (bỏ `adjustmentAmount`/`netAmount` gộp cũ). Test PDF khẳng định nhãn cột không chọn KHÔNG xuất hiện trong file. Kịch bản thật: xuất 9 cột đã chọn → `rows=2 bytes=28623` |
| BR-45 | Chỉ xem/tải báo cáo của chính mình; Manager truy cập tất cả | `ReportExportService.LoadForActorAsync` | — | 🟠 | Plan §6.5 yêu cầu test ownership trực tiếp qua API — **chưa có** |
| BR-46 | Giữ file thành công ≥6 tháng kể từ **CompletedAt**; chặn xóa trước hạn | `ReportExportService.RunAsync` đặt `ExpiresAt = CompletedAt + 6 tháng` | — | 🟠 | **Sửa trong phiên này**: trước đây tính từ `CreatedAt`, nên bản retry lệch hẳn một lần chờ. Đã chạy qua API thật khi xuất báo cáo, nhưng **chưa có test khẳng định mốc ExpiresAt** |
| BR-47 | Xóa rồi thì biến khỏi danh sách và link cũ không truy cập được | `ReportExport.IsDeleted` + xoá file theo đúng đuôi định dạng | — | 🟠 | |
| BR-48 | **PDF ≤20 trang trong ≤15 giây**, PDF bắt buộc, CSV không thay thế; chỉ Completed khi file tải được; metadata đầy đủ | `ReportPdfRenderer.cs` (QuestPDF), `ReportColumnLabels.cs`, `ReportExport.Format` + CHECK, download đúng content type | `ReportPdfRendererTests` (15 test) | ✅ | **Làm trong phiên này.** 15 test **pass**: PDF hợp lệ, tiếng Việt có dấu trích ngược đúng, phân trang, header lặp mỗi trang, số trang. **Đo được: 42 trang / 547 ms** (ngưỡng: 20 trang / 15 s). Luồng qua API cũng đã chạy thật: `format=Pdf status=Completed`, tải về `Content-Type: application/pdf`, file bắt đầu `%PDF-` |

---

## Tổng hợp

Tổng 64 BR. Bốn BR có hai trạng thái vì một phần đã kiểm chứng, phần còn lại thì chưa
(BR-2, BR-6, BR-13, BR-52), nên các con số dưới đây cộng lại lớn hơn 64.

| Trạng thái | Số BR |
|---|---:|
| ✅ Có test đã chạy và pass | 24 |
| 🟠 Code có, chưa có test phủ trực tiếp | 38 |
| 🟡 Code có, test chưa chạy lại | 1 (BR-35 — cần đo lại) |
| ❌ Chưa làm | 0 |
| ⏸️ Ngoài đợt / phụ thuộc deploy | 5 |

**Cần nói rõ về nhóm 🟠 (38 BR).** Đây KHÔNG phải "chưa làm" — code tồn tại và build được,
nhưng chưa có test tự động nào khẳng định riêng rule đó. Phần lớn là các ràng buộc unique ở
DB, các kiểm tra RBAC đơn giản, và nhóm attendance/scheduling chưa được rà lại theo v1.4
trong phiên này. Không mục nào trong nhóm này được báo là đã nghiệm thu.

**Bốn BR được sửa trong phiên này nhưng vẫn ở 🟠** vì chỉ có test cũ phủ, chưa có test cho
nhánh mới: BR-11, BR-18, BR-54 (hoàn lượt có điều kiện BR-10) và BR-46 (mốc retention).
Đây là việc tiếp theo nên làm.
