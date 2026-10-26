namespace SportHub.BuildingBlocks.Abstractions.Audit;

/// <summary>Action codes emitted for UserAccount targets and available in Admin audit filters.</summary>
public static class AccountAuditActions
{
    public const string CreateStaffAccount = "CREATE_STAFF_ACCOUNT";
    public const string ChangeUserRole = "CHANGE_USER_ROLE";
    public const string ActivateUserAccount = "ACTIVATE_USER_ACCOUNT";
    public const string DeactivateUserAccount = "DEACTIVATE_USER_ACCOUNT";
    // Historical actions remain searchable; new transitions use Activate/Deactivate.
    public const string LockUserAccount = "LOCK_USER_ACCOUNT";
    public const string UnlockUserAccount = "UNLOCK_USER_ACCOUNT";
    public const string ResendStaffActivation = "RESEND_STAFF_ACTIVATION";
    public const string ChangePendingStaffEmail = "CHANGE_PENDING_STAFF_EMAIL";
    public const string FrontDeskCreateMember = "FRONT_DESK_CREATE_MEMBER";
    public const string ResendMemberActivation = "RESEND_MEMBER_ACTIVATION";
    public const string ChangePendingMemberEmail = "CHANGE_PENDING_MEMBER_EMAIL";
    public const string ExpireUnactivatedStaffAccount = "EXPIRE_UNACTIVATED_STAFF_ACCOUNT";
    public const string ExpireUnactivatedMemberAccount = "EXPIRE_UNACTIVATED_MEMBER_ACCOUNT";
    public const string UpdateCoachSpecialties = "UPDATE_COACH_SPECIALTIES";

    public static IReadOnlyList<string> All { get; } = Array.AsReadOnly(new[]
    {
        CreateStaffAccount, ChangeUserRole, ActivateUserAccount, DeactivateUserAccount,
        LockUserAccount, UnlockUserAccount,
        ResendStaffActivation, ChangePendingStaffEmail, FrontDeskCreateMember,
        ResendMemberActivation, ChangePendingMemberEmail, ExpireUnactivatedStaffAccount, ExpireUnactivatedMemberAccount,
        UpdateCoachSpecialties
    });
}
