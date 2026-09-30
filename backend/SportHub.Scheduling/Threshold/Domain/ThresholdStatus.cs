namespace SportHub.Scheduling.Threshold.Domain;

// Trạng thái ngưỡng hoàn vốn của khóa (BR-119). Đánh giá thật ở chặng ngưỡng (P1.09); publish đặt NotEvaluated.
public enum ThresholdStatus
{
    NotEvaluated,
    Met,
    AtRisk,
    WaivedByManager
}
