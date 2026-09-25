namespace SportHub.API.Modules.Identity.Admin;

public sealed class AdminOperationException : Exception
{
    public AdminOperationException(int statusCode, string code, string message) : base(message)
    {
        StatusCode = statusCode;
        Code = code;
    }

    public int StatusCode { get; }

    public string Code { get; }
}
