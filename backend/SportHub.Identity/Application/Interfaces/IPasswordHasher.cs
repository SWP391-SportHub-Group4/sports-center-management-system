namespace SportHub.Identity.Application.Interfaces;

public interface IPasswordHasher
{
    string Hash(string password);

    bool Verify(string password, string hash);

    /// <summary>
    /// Chạy một phép BCrypt verify trên hash giả rồi bỏ kết quả, dùng cho các nhánh login
    /// thất bại mà không có hash thật để verify (email không tồn tại, chưa đặt password).
    /// Mục đích: mọi request login hợp lệ về DTO đều tốn đúng một lần BCrypt, không còn
    /// nhánh trả 401 gần như tức thì để phân biệt với nhánh sai password.
    /// KHÔNG BAO GIỜ dùng hàm này để xác thực thành công — nó không trả kết quả.
    /// </summary>
    void VerifyDummy(string password);
}
