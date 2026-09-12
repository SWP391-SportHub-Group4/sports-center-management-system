namespace SportHub.Repository.Entities.AI;

public class AiLog
{
    public Guid LogId { get; set; } // PK

    public Guid UserId { get; set; } // FK -> UserAccount

    public UserAccount? User { get; set; }

    public string QueryType { get; set; } = string.Empty; // vd "WORKOUT_SUGGESTION" — chuỗi tự do, không phải enum

    public string InputPayload { get; set; } = string.Empty; // jsonb, input thực tế gửi AI

    public string ResponsePayload { get; set; } = string.Empty; // jsonb, kết quả AI trả về

    public int ResponseTimeMs { get; set; }

    public DateTime CreatedAt { get; set; }
}
