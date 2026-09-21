# Quyết định triển khai đã duyệt ngày 22/09/2026

Người dùng đã đồng ý các khuyến nghị trong phiên review và yêu cầu cập nhật tài liệu để push GitHub. Biên bản này ghi phạm vi phê duyệt, không xác nhận code đã đáp ứng. Nguồn cao nhất vẫn là `00-Source-of-Truth.md`; nội dung quy tắc đã đồng bộ vào Business Rules v1.4. File quyết định cũ được Claude dẫn không có trong checkout tại thời điểm cập nhật; các mã A/C giữ để truy vết cuộc review.

## 1. Các quyết định có hiệu lực

| Mã | Quyết định đã duyệt | Điều kiện và giới hạn |
|---|---|---|
| A1 | `Enrollment.CancellationDeadlineHours` và `SystemSetting`; mặc định hủy trước 12 giờ, nhắc hạn gói trước 7 ngày | Manager được cấu hình số nguyên không âm; snapshot lúc booking Confirmed, không sửa booking cũ. Đúng mốc deadline vẫn hoàn lượt. Deadline UTC tuyệt đối là lựa chọn triển khai tùy nhu cầu, không bắt buộc thêm field. |
| A2 | `ClassSession.BaselineCapacity` bất biến | MIN(Room, Class) lúc tạo; capacity hiện hành không vượt baseline/phòng thực tế, không thấp hơn ConfirmedCount. Catalog tăng không tăng baseline buổi cũ. |
| A3 | `Invoice.DueDateUtc`, `FirstDepositAtUtc` | Cộng tháng lịch; hạn đầu 2 tháng; cọc Success đầu tiên còn để lại số dư và nhận tại/trước hạn đầu mới đặt hạn 12 tháng kể từ cọc. Thanh toán đủ ngay lần đầu không phải cọc. Khoản sau không gia hạn. |
| A4 | Entity `ReportExport`, enum `ReportExportStatus` | File riêng tư; metadata chủ sở hữu/tham số/cột/định dạng/trạng thái/lỗi/thời điểm; CSV và PDF; giữ file thành công ít nhất 6 tháng kể từ khi hoàn tất, xóa sau thời hạn làm link cũ mất hiệu lực. |
| A5 | Thông tin duyệt cộng dồn trên MemberPackage | Cùng loại = cùng PackageId. Manager duyệt, lưu người/thời điểm/lý do; các gói độc lập, không gộp ngày/lượt. Không bỏ điều kiện thanh toán đủ. |
| A6 | `AuditLog.TargetId` là string | Kết hợp TargetEntity để định danh; dữ liệu Guid cũ chuyển text không mất giá trị. |
| A7 | `MembershipPackage.IsActive`, `Description` nullable | Ngừng bán chặn mua mới, không tước quyền gói đã bán. Không hard delete lịch sử. |
| C2 | Hồi phục Expired → Active khi hoàn lượt hợp lệ | Chỉ khi hết lượt là lý do hết hiệu lực, vẫn còn trong thời hạn, lượt sau hoàn > 0, không bị Cancelled và không vi phạm BR-10. Không tự gia hạn ngày. Nếu vướng BR-10, vẫn hoàn lượt nhưng giữ Expired, báo Manager xử lý ngoại lệ. |
| C3 | Manager quản lý quan hệ cá nhân; Coach không tự cấp quyền | Quan hệ từ lớp phải giới hạn theo lớp và có điểm kết thúc. Thời điểm kết thúc cụ thể vẫn cần chốt; xem §4. |
| C4 | Gói bắt đầu ngày trả đủ theo Asia/Ho_Chi_Minh | EndDate = StartDate + DurationDays - 1, dùng hết ngày cuối. Kích hoạt chỉ một lần, retry không reset ngày/lượt. |
| C5 | Chặn trùng lịch phòng, Coach và Member | Khoảng nửa mở [start, end), cho phép hai buổi nối tiếp; phải an toàn khi request đồng thời. |
| C6 | Kiểm tra role hiện tại trên request xác thực | Token role cũ khác role hiện tại bị từ chối; không tuyên bố đây là logout-all/security stamp. |
| Naming | JSON camelCase; enum API UPPER_SNAKE_CASE; JWT role PascalCase | Giữ kiểu lưu enum DB hiện có trong đợt này, không đổi ordinal/index. Giữ ID int cho catalog, Guid cho nghiệp vụ như schema hiện tại. |

## 2. C1 được thay thế bằng quy tắc đối soát mới

**Không duyệt** cách coi mọi Adjustment là tiền đã hoàn, hay tự chuyển Refund sang Completed ngay khi Manager approve. Các định nghĩa dưới đây dành cho đối soát nghiệp vụ trong app, không phải chuẩn báo cáo kế toán pháp định.

- `GrossCollected`: tổng Payment Success, không sửa/xóa khoản thu cũ để biểu diễn hoàn tiền.
- `ObligationReduction`: tổng Discount và Correction giảm nghĩa vụ đã Completed. Trong scope này Correction chỉ giảm; điều chỉnh tăng nghĩa vụ cần đặc tả riêng.
- `NetPayable = TotalAmount - ObligationReduction`, không âm.
- `RefundedAmount`: tổng Refund Completed có xác nhận thực trả. Approved không được tính đã hoàn.
- `NetCollected = GrossCollected - RefundedAmount`, không âm.
- `Outstanding = max(0, NetPayable - NetCollected)`.
- `RefundDue = max(0, NetCollected - NetPayable)` là khoản còn phải trả lại, không phải đã trả lại.

Payment mới phải dương và không vượt Outstanding, kiểm tra trong transaction khóa invoice. Refund không tự giảm NetPayable. Khi hoàn vì hủy phần dịch vụ chưa dùng, phải có Correction/Discount giảm nghĩa vụ tương ứng; khi hoàn khoản thu thừa sau Discount, không tạo thêm lần giảm nghĩa vụ cho cùng số tiền. Yêu cầu Refund phải chỉ ra căn cứ giảm nghĩa vụ trong Reason/audit; không tự sinh một khoản giảm thứ hai.

Manager duyệt Refund tối đa số thực thu còn có thể hoàn; lúc xác nhận thực trả kiểm tra lại trần đó và RefundDue để không hoàn quá khoản cần trả. Không chỉ kiểm tra số dư tại lúc tạo yêu cầu. Nhiều request đồng thời và retry không được gây hoàn trùng. Trạng thái Paid giữ ý nghĩa lịch sử đã thanh toán đủ, không chứng minh Refund đã thực hiện; hiển thị riêng các số dư ở trên.

| Ví dụ VND | GrossCollected | NetPayable | RefundedAmount | RefundDue | Outstanding |
|---|---:|---:|---:|---:|---:|
| Hóa đơn 3 triệu, đã thu đủ | 3.000.000 | 3.000.000 | 0 | 0 | 0 |
| Discount 500 nghìn Completed, chưa trả tiền | 3.000.000 | 2.500.000 | 0 | 500.000 | 0 |
| Refund 500 nghìn Approved | 3.000.000 | 2.500.000 | 0 | 500.000 | 0 |
| Đã xác nhận trả 500 nghìn | 3.000.000 | 2.500.000 | 500.000 | 0 | 0 |
| Hóa đơn 3 triệu, thu cọc 1 triệu, Discount 500 nghìn | 1.000.000 | 2.500.000 | 0 | 0 | 1.500.000 |

Báo cáo thu tiền ròng trong kỳ = Payment Success theo thời điểm thu − Refund Completed theo thời điểm thực trả. Discount/Correction hiển thị riêng ở báo cáo điều chỉnh nghĩa vụ, không trừ thêm khỏi chỉ tiêu thu tiền ròng. Không dùng duy nhất ResolvedAt cho cả ngày duyệt và ngày hoàn.

Refund mặc định BR-52 theo tỷ lệ chưa dùng, làm tròn đến đồng gần nhất; nửa đồng làm tròn lên cho số tiền dương (`AwayFromZero`). Manager được override trong trần hợp lệ và phải lưu lý do. Quy ước số ngày chưa dùng cụ thể khi hoàn trong ngày đang sử dụng còn ở §4; không tự gán cho quyết định đã duyệt.

## 3. Quá hạn và phạm vi nghiệm thu

Hóa đơn quá hạn không tự Void; gói PendingPayment không tự Cancelled chỉ vì hạn hóa đơn trôi qua. Chặn đường thu thông thường sau hạn (đúng hạn vẫn được thu); Manager xử lý ngoại lệ theo chính sách cần đặc tả thêm. Không tự tịch thu cọc, tự hoàn tiền hay ngầm gia hạn. Trước khi có quy trình ngoại lệ đã chốt, chỉ cung cấp thông tin quá hạn và từ chối thu; không thêm bypass cho Manager.

PDF BR-48, Google Login và AI provider thật vẫn trong scope. Fixture/deterministic provider chỉ dùng demo/test có nhãn rõ. Backup hằng ngày, HTTPS và uptime thuộc nghiệm thu vận hành, không bị loại khỏi requirements. 119 tests cũ được Claude báo pass là thông tin lịch sử, không phải bằng chứng kiểm thử mới cho v1.4.

## 4. Những chi tiết chưa được phê duyệt cụ thể

1. Quan hệ ClassBased kết thúc sau buổi cuối, sau khóa học hay sau một khoảng lưu quyền để Coach ghi kết quả? Quyền đọc lịch sử sau kết thúc ra sao? Không cấp quyền toàn bộ hồ sơ vô thời hạn từ một booking. Có thể hoàn thiện quan hệ do Manager cấp và quyền theo session độc lập trong lúc chờ.
2. Manager xử lý thu quá hạn bằng gia hạn có audit hay hủy nghĩa vụ/hoàn cọc? Không tự thiết kế endpoint bỏ qua deadline.
3. Refund theo ngày: ngày hiện tại đang sử dụng có tính là chưa dùng hay không, và thời điểm bắt đầu tính khi chưa dùng ngày nào? Phải chốt ví dụ biên trước khi coi công thức theo ngày đã nghiệm thu.
4. Sau hoàn tiền vì hủy dịch vụ, gói và booking tương lai bị tác động thế nào? Không tự hủy MemberPackage chỉ vì có một Refund.

Các điểm này chưa được cuộc review chọn một phương án cụ thể. Claude phải hỏi gọn khi cần triển khai nhánh phụ thuộc và tiếp tục phần độc lập. Không mở lại A1–A7 hoặc các quyết định đã duyệt ở trên.
