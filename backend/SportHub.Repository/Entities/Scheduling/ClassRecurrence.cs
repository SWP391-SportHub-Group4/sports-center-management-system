namespace SportHub.Repository.Entities;

// Nguồn: docs/00-Source-of-Truth.md §2 (Entity đã chốt) — module Scheduling.
// Định nghĩa QUY LUẬT LẶP LẠI của 1 lớp (vd "Thứ 2-4-6, 18h-19h30") — tách riêng
// khỏi session cụ thể để 1 job nền có thể sinh trước hàng loạt ClassSession mà
// không phải nhập tay từng buổi.
public class ClassRecurrence
{
    public int recurrence_id { get; set; }

    public int class_id { get; set; }

    public Class? Class { get; set; }

    // Các thứ trong tuần lặp lại (vd "MON,WED,FRI").
    public string days_of_week { get; set; } = string.Empty;

    // Giờ bắt đầu/kết thúc theo giờ ĐỊA PHƯƠNG (không phải UTC — lịch lặp theo
    // "giờ trong ngày", không theo mốc tuyệt đối).
    public TimeOnly start_time_local { get; set; }

    public TimeOnly end_time_local { get; set; }

    // Neo giờ local về đúng múi giờ (vd "Asia/Ho_Chi_Minh") khi convert sang
    // start_at_utc/end_at_utc của session.
    public string timezone { get; set; } = string.Empty;

    // Khoảng thời gian pattern này còn áp dụng — cho phép đổi lịch theo kỳ mà
    // không xóa lịch sử session cũ.
    public DateOnly effective_from { get; set; }

    public DateOnly? effective_to { get; set; }

    public ICollection<ClassSession> Sessions { get; set; } = new List<ClassSession>();
}
