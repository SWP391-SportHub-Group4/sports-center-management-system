namespace SportHub.API.Jobs;

/// <summary>
/// Khung chung cho các tác vụ nền chạy theo chu kỳ (BR-11, BR-20, BR-33, BR-34).
///
/// Dùng hosted service trong chính tiến trình API, không thêm scheduler ngoài: BR-34 nêu rõ
/// quy mô MVP dùng background job / bảng outbox, hàng đợi chuyên dụng chỉ đưa vào khi khối
/// lượng đòi hỏi.
///
/// Mọi lượt chạy tự mở scope DI riêng vì DbContext là scoped, còn hosted service là singleton —
/// dùng chung một DbContext suốt vòng đời tiến trình sẽ tích luỹ change tracker và giữ lại
/// dữ liệu cũ. Lỗi của một lượt chỉ được log rồi bỏ qua: ném ra ngoài sẽ hạ luôn cả host.
/// </summary>
public abstract class PeriodicJob(IServiceProvider services, ILogger logger, TimeSpan interval)
    : BackgroundService
{
    protected abstract string JobName { get; }

    protected abstract Task RunOnceAsync(IServiceProvider scopedServices, CancellationToken ct);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Chờ một nhịp trước lượt đầu: lúc khởi động, migration và seed dữ liệu demo còn đang
        // chạy, và job đọc dữ liệu dở dang sẽ ra kết quả sai.
        using var timer = new PeriodicTimer(interval);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {               
                if (!await timer.WaitForNextTickAsync(stoppingToken))
                {
                    break;
                }

                await using var scope = services.CreateAsyncScope();
                await RunOnceAsync(scope.ServiceProvider, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Job {JobName} thất bại ở một lượt chạy; sẽ thử lại ở lượt sau.", JobName);
            }
        }
    }
}
