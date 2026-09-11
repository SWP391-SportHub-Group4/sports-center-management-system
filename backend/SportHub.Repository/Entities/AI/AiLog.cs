namespace SportHub.Repository.Entities;

// Nguồn: docs/00-Source-of-Truth.md §2 (Entity đã chốt) — module AI.
// Log mọi lượt gọi tính năng AI (gợi ý bài tập — Flow 5) — phục vụ debug, đo hiệu
// năng, audit việc AI trả lời gì cho ai. (AI assistant/chat — Flow 6 — đã hạ
// xuống stretch, chỉ log nếu flow đó thực sự được triển khai; SSOT §1.4.)
public class AiLog
{
    public Guid LogId { get; set; }

    public Guid UserId { get; set; }

    public UserAccount? User { get; set; }

    // Loại truy vấn (vd "WORKOUT_SUGGESTION") — chuỗi tự do, KHÔNG phải enum kín.
    public string QueryType { get; set; } = string.Empty;

    // jsonb — input thực tế gửi cho AI, debug khi kết quả sai.
    public string InputPayload { get; set; } = string.Empty;

    // jsonb — kết quả AI trả về.
    public string ResponsePayload { get; set; } = string.Empty;

    public int ResponseTimeMs { get; set; }

    public DateTime CreatedAt { get; set; }
}
