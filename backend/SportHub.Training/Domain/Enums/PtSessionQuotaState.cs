namespace SportHub.Training.Domain.Enums;

/// <summary>Mới 29/09/2026 (BE-4) — theo dõi quota gắn với từng session để transition không double-consume/release.</summary>
public enum PtSessionQuotaState
{
    Reserved,
    Consumed,
    Released
}
