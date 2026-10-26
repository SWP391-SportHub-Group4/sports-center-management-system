using Microsoft.Extensions.Caching.Memory;

namespace SportHub.Identity.Infrastructure;

/// <summary>Caches original PDF bytes and shares a provider read across concurrent callers.</summary>
public sealed class CoachCredentialPdfCache : IDisposable
{
    private const int MaxPdfBytes = 10 * 1024 * 1024;
    private static readonly TimeSpan EntryLifetime = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan LoadTimeout = TimeSpan.FromSeconds(120);
    private readonly object _gate = new();
    private readonly MemoryCache _cache = new(new MemoryCacheOptions { SizeLimit = 32L * 1024 * 1024 });
    private readonly Dictionary<string, PendingRead> _pending = new(StringComparer.Ordinal);
    private readonly SemaphoreSlim _downloads = new(4, 4);
    private readonly CancellationTokenSource _shutdown = new();
    private int _activeLoads;
    private bool _disposed;
    private bool _shutdownRequested;

    public async Task<byte[]> GetAsync(string key, Func<CancellationToken, Task<byte[]>> loader,
        CancellationToken caller)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(key);
        ArgumentNullException.ThrowIfNull(loader);
        caller.ThrowIfCancellationRequested();

        PendingRead pending;
        var startLoad = false;
        lock (_gate)
        {
            ObjectDisposedException.ThrowIf(_disposed, this);
            if (_cache.TryGetValue<byte[]>(key, out var bytes)) return bytes!;
            if (!_pending.TryGetValue(key, out pending!))
            {
                pending = new PendingRead(_shutdown.Token);
                _pending.Add(key, pending);
                _activeLoads++;
                startLoad = true;
                ObserveFailure(pending.Completion.Task);
            }
        }

        if (startLoad) _ = LoadAsync(key, pending, loader);
        // A disconnected request must not cancel the download needed by another viewer.
        return await pending.Completion.Task.WaitAsync(caller).ConfigureAwait(false);
    }

    public void Set(string key, byte[] bytes)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(key);
        ValidateBytes(bytes);
        lock (_gate)
        {
            ObjectDisposedException.ThrowIf(_disposed, this);
            Store(key, bytes);
            // A previous download may still finish, but must not replace this original.
            _pending.Remove(key);
        }
    }

    public void Remove(string key)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(key);
        lock (_gate)
        {
            ObjectDisposedException.ThrowIf(_disposed, this);
            _cache.Remove(key);
            // Identity of the pending read acts as its generation; no retained key history is needed.
            _pending.Remove(key);
        }
    }

    private async Task LoadAsync(string key, PendingRead pending, Func<CancellationToken, Task<byte[]>> loader)
    {
        var acquired = false;
        Task<byte[]>? loading = null;
        try
        {
            var token = pending.Timeout.Token;
            await _downloads.WaitAsync(token).ConfigureAwait(false);
            acquired = true;
            token.ThrowIfCancellationRequested();
            loading = loader(token);
            ObserveFailure(loading);
            var bytes = await loading.WaitAsync(token).ConfigureAwait(false);
            ValidateBytes(bytes);
            lock (_gate)
            {
                if (!_disposed && _pending.TryGetValue(key, out var current) && ReferenceEquals(current, pending))
                {
                    Store(key, bytes);
                    _pending.Remove(key);
                }
            }
            pending.Completion.TrySetResult(bytes);
        }
        catch (OperationCanceledException error)
        {
            RemovePending(key, pending);
            pending.Completion.TrySetCanceled(error.CancellationToken);
        }
        catch (Exception error)
        {
            RemovePending(key, pending);
            pending.Completion.TrySetException(error);
        }
        finally
        {
            if (acquired && loading is { IsCompleted: false })
                _ = FinishAfterLoadingAsync(loading, pending);
            else
            {
                if (acquired) _downloads.Release();
                FinishLoad(pending);
            }
        }
    }

    private async Task FinishAfterLoadingAsync(Task<byte[]> loading, PendingRead pending)
    {
        // Keep the permit if a provider ignores cancellation, until it stops allocating bytes.
        try { await loading.ConfigureAwait(false); }
        catch (Exception) { /* The caller's completion already carries the failure or timeout. */ }
        finally
        {
            _downloads.Release();
            FinishLoad(pending);
        }
    }

    private void RemovePending(string key, PendingRead pending)
    {
        lock (_gate)
        {
            if (_pending.TryGetValue(key, out var current) && ReferenceEquals(current, pending))
                _pending.Remove(key);
        }
    }

    private void Store(string key, byte[] bytes) => _cache.Set(key, bytes,
        new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = EntryLifetime, Size = bytes.Length });

    private static void ValidateBytes(byte[] bytes)
    {
        ArgumentNullException.ThrowIfNull(bytes);
        if (bytes.Length is 0 or > MaxPdfBytes)
            throw new ArgumentException("PDF contents must contain between 1 byte and 10 MiB.", nameof(bytes));
    }

    private static void ObserveFailure(Task task) => _ = task.ContinueWith(
        static failed => { _ = failed.Exception; }, CancellationToken.None,
        TaskContinuationOptions.OnlyOnFaulted | TaskContinuationOptions.ExecuteSynchronously, TaskScheduler.Default);

    private void FinishLoad(PendingRead pending)
    {
        pending.Timeout.Dispose();
        lock (_gate)
        {
            _activeLoads--;
            DisposeSourcesIfFinished();
        }
    }

    public void Dispose()
    {
        lock (_gate)
        {
            if (_disposed) return;
            _disposed = true;
            _pending.Clear();
            _cache.Dispose();
        }
        try { _shutdown.Cancel(); }
        finally
        {
            lock (_gate)
            {
                _shutdownRequested = true;
                DisposeSourcesIfFinished();
            }
        }
    }

    private void DisposeSourcesIfFinished()
    {
        if (!_disposed || !_shutdownRequested || _activeLoads != 0) return;
        _downloads.Dispose();
        _shutdown.Dispose();
    }

    private sealed class PendingRead
    {
        public PendingRead(CancellationToken shutdown)
        {
            Timeout = CancellationTokenSource.CreateLinkedTokenSource(shutdown);
            Timeout.CancelAfter(LoadTimeout);
        }

        public TaskCompletionSource<byte[]> Completion { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public CancellationTokenSource Timeout { get; }
    }
}
