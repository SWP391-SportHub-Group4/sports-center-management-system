# Component hiển thị dữ liệu dùng chung

`data` ở đây là nhóm giao diện giúp người dùng xem và lọc dữ liệu. Thư mục này không chứa database, dữ liệu mẫu hay code gọi backend trực tiếp. Tên và vị trí theo `../contracts/table.ts` do An chốt.

| File             | Vai trò                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------ |
| `Table.tsx`      | Tự dựng dòng/cột từ `columns` và `rows`; phát sự kiện sort/phân trang, hiển thị mobile.    |
| `FilterBar.tsx`  | Dựng các ô tìm kiếm/lọc từ `fields`; phát giá trị mới qua `onChange`.                      |
| `StatusChip.tsx` | Hiển thị nhãn trạng thái; tự chọn chữ/màu từ `value`, cho phép ghi đè bằng `label`/`tone`. |
| `ApiTable.tsx`   | Nối kết quả `useApi` vào Table và chọn trạng thái tải/lỗi.                                 |
| `StateView.tsx`  | Thông báo rỗng, lỗi, thiếu quyền, xung đột và tải dữ liệu.                                 |
| `*.module.css`   | CSS chỉ áp dụng trong component tương ứng.                                                 |
| `index.ts`       | Gom export để trang import từ `@/components/data`.                                         |

## Luồng sử dụng

Trang khai báo cột/bộ lọc và gọi API → FilterBar báo giá trị mới → trang lưu URL, gọi lại API → ApiTable/Table hiển thị kết quả.

- Users & roles: `features/administration/users.tsx`. Tìm kiếm áp dụng ngay; chọn vai trò/trạng thái cập nhật URL và đưa về trang 1.
- Audit log: `components/AuditLogView.tsx`. Nhập điều kiện rồi bấm Áp dụng; URL giữ bộ lọc đã áp dụng. Nhập dở ID người thực hiện không phát request lỗi.
- `lib/useUrlQuery.ts` giữ URL là nguồn của bộ lọc đã áp dụng, trang hiện tại và sort; hỗ trợ tải lại, chia sẻ, Back/Forward; giữ nguyên tham số URL không thuộc danh sách.
- Table/FilterBar không tự gọi API. Callback thuộc trang.

## FilterBar

```tsx
import { FilterBar } from "@/components/data";

<FilterBar
  fields={[
    { id: "keyword", label: "Tìm kiếm", kind: "search" },
    {
      id: "role",
      label: "Vai trò",
      kind: "select",
      options: [
        { value: "", label: "Tất cả" },
        { value: "COACH", label: "Huấn luyện viên" },
      ],
    },
  ]}
  values={filters}
  onChange={setFilters}
  onReset={clearFilters}
/>;
```

Các loại field: `search`, `select`, `date`, `dateRange`, `toggle`. Với dateRange có id `period`, hai giá trị là `periodFrom` và `periodTo`; toggle dùng `"true"` hoặc chuỗi rỗng. `actions` dành cho nút tạo mới/xuất file/áp dụng; `activeCount` có thể truyền số bộ lọc đã áp dụng khi trang có thao tác Áp dụng riêng. FilterBar không tạo form lồng nhau: trang có thể bọc nó trong một form.

## StatusChip

```tsx
import { StatusChip } from "@/components/data";

<StatusChip value="ACTIVE" />; // Tự lấy nhãn theo ngôn ngữ và màu từ lib/format.
<StatusChip value="ACTIVE" label="Đang hoạt động" tone="success" />;
```

`label` là chữ hiển thị; `tone` là tông màu (`neutral`, `success`, `warning`, `danger`, `info`). Hai giá trị tùy chọn này có thể ghi đè độc lập. Giá trị thiếu hiển thị dấu `—`; giá trị chưa có bản dịch dùng nhãn dự phòng từ `lib/format`. Import StatusChip từ `components/ui.tsx` vẫn dùng cùng bản mới để các trang khác tiếp tục chạy.

Users & roles truyền nhãn riêng cho tài khoản (dùng chung với bộ lọc) và tông: `ACTIVE` → `success`, `BANNED` → `danger`, `DEACTIVATED` → `neutral`. Đây là lựa chọn của trang Admin; các trang khác vẫn dùng tông mặc định từ `chipTone` nếu không truyền `tone`.

Giao diện của mọi StatusChip nằm chung trong `StatusChip.module.css`: nền `#EDE5E4`, chữ và viền cùng tông, kích thước chữ/padding/bo góc thống nhất. Các tông dùng token của dự án; không ghi đè màu riêng tại page. `DEACTIVATED` cũng mặc định là `neutral` ở `lib/format` để nhất quán giữa các trang. Nhãn dài tự xuống dòng trên màn hình nhỏ.

## Trạng thái dữ liệu trong Admin

`ApiTable` xử lý trạng thái của bảng Users và Audit log; `SportOptions` xử lý vùng chọn bộ môn khi tạo/sửa tài khoản Coach. Các vùng này dùng StateView chung khi dữ liệu rỗng, tải lỗi, thiếu quyền hoặc xung đột; loading dùng skeleton theo bố cục nội dung.

Các kiểm tra HTTP giả lập và thao tác phục hồi nằm trong `tests/admin-sport-states.spec.ts` và `tests/admin-tables.spec.ts`.

Các trang chưa chuyển đổi vẫn dùng Table cũ trong `components/ui.tsx`. Không xóa bản cũ trước khi chuyển hết consumers.
