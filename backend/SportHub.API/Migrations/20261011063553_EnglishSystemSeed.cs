using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SportHub.API.Migrations;

public partial class EnglishSystemSeed : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // Change exact system seed values only; preserve manager edits and user-entered text.
        migrationBuilder.Sql("""
            UPDATE sports SET name = 'Badminton' WHERE sport_id = 3 AND name = 'Cầu lông';
            UPDATE sports SET name = 'Basketball' WHERE sport_id = 4 AND name = 'Bóng rổ';
            UPDATE room_types SET name = 'Gym room' WHERE room_type_id = 1 AND name = 'Phòng Gym';
            UPDATE room_types SET name = 'PT room' WHERE room_type_id = 2 AND name = 'Phòng PT';
            UPDATE room_types SET name = 'Badminton court' WHERE room_type_id = 3 AND name = 'Sân cầu lông';
            UPDATE room_types SET name = 'Basketball court' WHERE room_type_id = 4 AND name = 'Sân bóng rổ';
            UPDATE system_settings SET description = 'BR-33 — Days before membership expiration to remind members.' WHERE key = 'membership.expiry_notice_days' AND description = 'BR-33 — Nhắc hội viên trước bao nhiêu ngày khi gói thành viên sắp hết hạn.';
            UPDATE system_settings SET description = 'BR-119 — Days before the first session to evaluate the course threshold.' WHERE key = 'class.threshold_days_before_start' AND description = 'BR-119 — Đánh giá ngưỡng hoàn vốn của khóa trước buổi đầu bao nhiêu ngày.';
            UPDATE system_settings SET description = 'BR-120 — Hours for members to respond when a course risks missing its threshold.' WHERE key = 'class.threshold_response_hours' AND description = 'BR-120 — Số giờ Member được trả lời khi khóa học có nguy cơ không đủ ngưỡng.';
            UPDATE system_settings SET description = 'BR-115 — Maximum minutes to hold a place and complete checkout.' WHERE key = 'hold.minutes' AND description = 'BR-115 — Số phút giữ chỗ và thanh toán tối đa khi checkout.';
            UPDATE system_settings SET description = 'Demo PT price per session; the center manager must confirm the business price.' WHERE key = 'pt.price_per_session_vnd' AND description = 'Đơn giá demo PT mỗi buổi; Center Manager cần xác nhận giá kinh doanh.';
            UPDATE system_settings SET description = 'BR-139 — Minutes a points confirmation OTP remains valid at reception.' WHERE key = 'points.confirm_otp_minutes' AND description = 'BR-139 — Số phút OTP tại quầy xác nhận dùng điểm còn hiệu lực.';
            UPDATE system_settings SET description = 'BR-126 — Court rental slot length (30 or 60 minutes).' WHERE key = 'rental.slot_minutes' AND description = 'BR-126 — Độ dài mỗi khối thuê sân (30 hoặc 60 phút).';
            UPDATE system_settings SET description = 'BR-128 — Maximum court rental duration in hours.' WHERE key = 'rental.max_hours' AND description = 'BR-128 — Thời lượng thuê sân tối đa theo giờ.';
            UPDATE system_settings SET description = 'BR-128 — Maximum days to book a court in advance.' WHERE key = 'rental.advance_days' AND description = 'BR-128 — Số ngày tối đa được đặt sân trước.';
            UPDATE system_settings SET description = 'BR-129 — Minimum hours before a rental for free cancellation.' WHERE key = 'rental.cancel_free_hours' AND description = 'BR-129 — Hủy miễn phí nếu còn ít nhất số giờ này trước lượt thuê.';
            UPDATE rooms SET name = 'Badminton court 1' WHERE room_type_id = 3 AND name = 'Sân cầu lông 1';
            UPDATE rooms SET name = 'Basketball court 1' WHERE room_type_id = 4 AND name = 'Sân bóng rổ 1';
            UPDATE rooms SET name = 'PT room 1' WHERE room_type_id = 2 AND name = 'Phòng PT 1';
            UPDATE rooms SET name = 'Open gym' WHERE room_type_id = 1 AND name = 'Khu Gym tự do';
            UPDATE membership_packages SET name = 'Gym 1 month' WHERE duration_days = 30 AND name = 'Gym 1 tháng';
            UPDATE membership_packages SET name = 'Gym 3 months' WHERE duration_days = 90 AND name = 'Gym 3 tháng';
            UPDATE membership_packages SET name = 'Gym 6 months' WHERE duration_days = 180 AND name = 'Gym 6 tháng';
            UPDATE membership_packages SET name = 'Gym 12 months' WHERE duration_days = 365 AND name = 'Gym 12 tháng';
            UPDATE membership_packages SET description = 'Unlimited gym check-ins for 30 days. An active Gym membership is required to purchase PT separately.' WHERE duration_days = 30 AND description = 'Tập Gym tự do trong 30 ngày, không giới hạn check-in. Cần Membership Gym còn hiệu lực để mua PT riêng.';
            UPDATE membership_packages SET description = 'Gym access for 90 days. An active Gym membership is required to purchase PT separately.' WHERE duration_days = 90 AND description = 'Tập Gym tự do trong 90 ngày. Cần Membership Gym còn hiệu lực để mua PT riêng.';
            UPDATE membership_packages SET description = 'Gym access for 180 days. An active Gym membership is required to purchase PT separately.' WHERE duration_days = 180 AND description = 'Tập Gym tự do trong 180 ngày. Cần Membership Gym còn hiệu lực để mua PT riêng.';
            UPDATE membership_packages SET description = 'Gym access for 365 days. An active Gym membership is required to purchase PT separately.' WHERE duration_days = 365 AND description = 'Tập Gym tự do trong 365 ngày. Cần Membership Gym còn hiệu lực để mua PT riêng.';
            UPDATE classes SET name = 'Badminton ATRISK' WHERE code = 'DEMO-ATRISK' AND name = 'Cầu lông ATRISK';
            UPDATE classes SET name = 'Badminton INPROGRESS' WHERE code = 'DEMO-INPROGRESS' AND name = 'Cầu lông INPROGRESS';
            UPDATE classes SET name = 'Badminton COMPLETED' WHERE code = 'DEMO-COMPLETED' AND name = 'Cầu lông COMPLETED';
            UPDATE classes SET name = 'Badminton 01' WHERE code = 'CAULONG-01' AND name = 'Cầu lông 01';
            UPDATE classes SET name = 'Basketball 01' WHERE code = 'BONGRO-01' AND name = 'Bóng rổ 01';
            UPDATE classes SET name = 'Badminton basics · 6 sessions' WHERE code = 'DEMO-ARENA-CAULONG' AND name = 'Cầu lông cơ bản · 6 buổi';
            UPDATE classes SET name = 'Basketball introduction · 8 sessions' WHERE code = 'DEMO-ARENA-BONGRO' AND name = 'Bóng rổ nhập môn · 8 buổi';
            UPDATE classes SET name = 'Basketball 01' WHERE code = 'BR141-BONGRO-01' AND name = 'Bóng rổ 01';
            UPDATE classes SET name = 'Basketball 02' WHERE code = 'BR141-BONGRO-02' AND name = 'Bóng rổ 02';
            UPDATE classes SET name = 'Badminton 01' WHERE code = 'BR141-CAULONG-01' AND name = 'Cầu lông 01';
            UPDATE classes SET name = 'Badminton 02' WHERE code = 'BR141-CAULONG-02' AND name = 'Cầu lông 02';
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Reversing a data translation after catalog edits could overwrite user changes.
    }
}
