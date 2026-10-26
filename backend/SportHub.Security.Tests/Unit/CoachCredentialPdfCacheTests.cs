using SportHub.Identity.Infrastructure;

namespace SportHub.Security.Tests.Unit;

public sealed class CoachCredentialPdfCacheTests
{
    private const string Key = "tenant-a|sporthub/coach-credentials/coach/document.pdf";

    [Fact]
    public async Task Concurrent_reads_for_the_same_key_download_once()
    {
        using var cache = new CoachCredentialPdfCache();
        var release = Completion<byte[]>();
        var calls = 0;
        Task<byte[]> Loader(CancellationToken _) { Interlocked.Increment(ref calls); return release.Task; }

        var readers = Enumerable.Range(0, 12).Select(_ => cache.GetAsync(Key, Loader, default)).ToArray();
        Assert.Equal(1, calls);
        var bytes = "%PDF-1.7\nOriginal document"u8.ToArray();
        release.SetResult(bytes);

        var results = await Task.WhenAll(readers).WaitAsync(TimeSpan.FromSeconds(10));
        Assert.All(results, result => Assert.Same(bytes, result));
        Assert.Equal(1, calls);
    }

    [Fact]
    public async Task Canceling_one_waiter_keeps_the_shared_download_and_cached_result()
    {
        using var cache = new CoachCredentialPdfCache();
        using var caller = new CancellationTokenSource();
        var release = Completion<byte[]>();
        CancellationToken downloadToken = default;
        var calls = 0;
        Task<byte[]> Loader(CancellationToken token)
        {
            Interlocked.Increment(ref calls);
            downloadToken = token;
            return release.Task;
        }

        var canceledReader = cache.GetAsync(Key, Loader, caller.Token);
        var remainingReader = cache.GetAsync(Key, Loader, default);
        caller.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => canceledReader);
        Assert.True(downloadToken.CanBeCanceled);
        Assert.False(downloadToken.IsCancellationRequested);

        var bytes = "%PDF-1.7\nShared original"u8.ToArray();
        release.SetResult(bytes);
        Assert.Same(bytes, await remainingReader.WaitAsync(TimeSpan.FromSeconds(10)));
        Assert.Same(bytes, await cache.GetAsync(Key, Loader, default));
        Assert.Equal(1, calls);
    }

    [Fact]
    public async Task Failed_download_is_removed_so_a_later_read_can_retry()
    {
        using var cache = new CoachCredentialPdfCache();
        var release = Completion<byte[]>();
        var first = cache.GetAsync(Key, _ => release.Task, default);
        var second = cache.GetAsync(Key, _ => throw new InvalidOperationException("Must share the first read."), default);
        release.SetException(new IOException("Provider failed."));
        await Assert.ThrowsAsync<IOException>(() => first);
        await Assert.ThrowsAsync<IOException>(() => second);

        var bytes = "%PDF-1.7\nRetry succeeded"u8.ToArray();
        var calls = 0;
        Task<byte[]> Loader(CancellationToken _) { calls++; return Task.FromResult(bytes); }
        Assert.Same(bytes, await cache.GetAsync(Key, Loader, default));
        Assert.Same(bytes, await cache.GetAsync(Key, Loader, default));
        Assert.Equal(1, calls);
    }

    [Fact]
    public async Task Remove_forces_a_fresh_download()
    {
        using var cache = new CoachCredentialPdfCache();
        var original = "%PDF-1.7\nOld document"u8.ToArray();
        cache.Set(Key, original);
        Assert.Same(original, await cache.GetAsync(Key, _ => throw new InvalidOperationException(), default));
        cache.Remove(Key);

        var replacement = "%PDF-1.7\nFresh document"u8.ToArray();
        var calls = 0;
        Task<byte[]> Loader(CancellationToken _) { calls++; return Task.FromResult(replacement); }
        Assert.Same(replacement, await cache.GetAsync(Key, Loader, default));
        Assert.Same(replacement, await cache.GetAsync(Key, Loader, default));
        Assert.Equal(1, calls);
    }

    [Fact]
    public async Task Tenant_keys_keep_the_same_public_id_isolated()
    {
        using var cache = new CoachCredentialPdfCache();
        var firstRelease = Completion<byte[]>();
        var secondRelease = Completion<byte[]>();
        var first = cache.GetAsync(Key, _ => firstRelease.Task, default);
        var second = cache.GetAsync(Key.Replace("tenant-a|", "tenant-b|"), _ => secondRelease.Task, default);
        var firstBytes = "%PDF-1.7\nTenant A"u8.ToArray();
        var secondBytes = "%PDF-1.7\nTenant B"u8.ToArray();
        firstRelease.SetResult(firstBytes);
        secondRelease.SetResult(secondBytes);

        Assert.Same(firstBytes, await first.WaitAsync(TimeSpan.FromSeconds(10)));
        Assert.Same(secondBytes, await second.WaitAsync(TimeSpan.FromSeconds(10)));
        Assert.Same(firstBytes, await cache.GetAsync(Key, _ => throw new InvalidOperationException(), default));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(10 * 1024 * 1024 + 1)]
    public void Set_rejects_empty_or_oversized_documents(int length)
    {
        using var cache = new CoachCredentialPdfCache();
        Assert.Throws<ArgumentException>(() => cache.Set(Key, new byte[length]));
    }

    [Fact]
    public async Task Invalid_download_is_not_cached()
    {
        using var cache = new CoachCredentialPdfCache();
        await Assert.ThrowsAsync<ArgumentException>(() => cache.GetAsync(Key, _ => Task.FromResult(Array.Empty<byte>()), default));
        var bytes = "%PDF-1.7\nValid document"u8.ToArray();
        Assert.Same(bytes, await cache.GetAsync(Key, _ => Task.FromResult(bytes), default));
    }

    [Fact]
    public async Task Priming_a_document_prevents_an_older_read_from_overwriting_it()
    {
        using var cache = new CoachCredentialPdfCache();
        var release = Completion<byte[]>();
        var oldRead = cache.GetAsync(Key, _ => release.Task, default);
        var primed = "%PDF-1.7\nUploaded original"u8.ToArray();
        cache.Set(Key, primed);
        release.SetResult("%PDF-1.7\nOlder provider bytes"u8.ToArray());
        await oldRead.WaitAsync(TimeSpan.FromSeconds(10));

        Assert.Same(primed, await cache.GetAsync(Key, _ => throw new InvalidOperationException(), default));
    }

    [Fact]
    public async Task Removing_a_document_prevents_an_older_read_from_repopulating_it()
    {
        using var cache = new CoachCredentialPdfCache();
        var release = Completion<byte[]>();
        var oldRead = cache.GetAsync(Key, _ => release.Task, default);
        cache.Remove(Key);
        release.SetResult("%PDF-1.7\nInvalidated provider bytes"u8.ToArray());
        await oldRead.WaitAsync(TimeSpan.FromSeconds(10));

        var fresh = "%PDF-1.7\nFresh provider bytes"u8.ToArray();
        Assert.Same(fresh, await cache.GetAsync(Key, _ => Task.FromResult(fresh), default));
    }

    [Fact]
    public async Task At_most_four_different_documents_download_at_once()
    {
        using var cache = new CoachCredentialPdfCache();
        var releases = Enumerable.Range(0, 5).Select(_ => Completion<byte[]>()).ToArray();
        var fifthStarted = Completion<bool>();
        var calls = 0;
        var readers = Enumerable.Range(0, 5).Select(index => cache.GetAsync($"tenant-a|document-{index}.pdf", _ =>
        {
            Interlocked.Increment(ref calls);
            if (index == 4) fifthStarted.SetResult(true);
            return releases[index].Task;
        }, default)).ToArray();
        Assert.Equal(4, calls);
        Assert.False(fifthStarted.Task.IsCompleted);
        releases[0].SetResult("%PDF-1.7\nFirst document"u8.ToArray());
        await fifthStarted.Task.WaitAsync(TimeSpan.FromSeconds(10));
        Assert.Equal(5, calls);
        for (var index = 1; index < releases.Length; index++)
            releases[index].SetResult("%PDF-1.7\nAnother document"u8.ToArray());
        await Task.WhenAll(readers).WaitAsync(TimeSpan.FromSeconds(10));
    }

    private static TaskCompletionSource<T> Completion<T>() => new(TaskCreationOptions.RunContinuationsAsynchronously);
}
