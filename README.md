# Chat Cận Date

Ứng dụng React + TypeScript dành cho khoảng 3 người dùng kho cùng nhập và đối chiếu dữ liệu cận date. Firestore là nguồn dữ liệu chính thức; ứng dụng không giả lập lưu bằng LocalStorage.

## Kiến trúc và luồng dữ liệu

```text
Firebase Authentication
  └─ kiểm tra allowedUsers/{uid}
      ├─ products/{productId}         danh mục độc lập
      └─ dateRecords/{date_productId} một mã/ngày, chứa nhiều lots
             ↓ onSnapshot thời gian thực
      so sánh thuần theo productId + productionDate + lotLabel
             ↓
      thống kê, bộ lọc, bảng đối chiếu, CSV/XLSX
```

- `src/domain`: hàm nghiệp vụ thuần, có unit test (so sánh, kiểm tra lô, retention).
- `src/services`: truy cập Firestore, transaction chống ghi đè và batch delete.
- `src/components`: đăng nhập, bảng đối chiếu, workflow Sale, cảnh báo, lịch sử, danh mục, chọn sản phẩm và drawer nhập nhanh.
- `src/lib`: Firebase, múi giờ Việt Nam và import/export.
- `functions`: quản trị Firebase Auth an toàn, audit log và retention chạy theo lịch.

Các giả định nghiệp vụ:

- `productCode` được chuẩn hóa chữ hoa; ID sản phẩm tạo từ mã và mã không đổi sau khi tạo.
- Mỗi sản phẩm có nhóm hàng (`ambient`, `chilled`, `sterilized-sausage`, `frozen`). Hàng thường dùng `carton-only`, `carton-pack` hoặc `carton-bag-pack`; hàng chill dùng `basket-bag-pack` (rổ → túi → gói); xúc xích tiệt trùng dùng `box-bag-pack` hoặc `box-pack`; hàng đông lạnh dùng `carton-pack` (thùng → gói). Sản phẩm cũ chưa có các trường này được đọc với mặc định **Hàng thường · Chỉ thùng**.
- Hai lô khớp nhau khi có cùng `productionDate` và `lotLabel` sau khi chuẩn hóa chữ thường. Nếu cùng ngày sản xuất có nhiều lô, mọi lô phải có nhãn khác nhau.
- Đơn vị chỉ được coi là tương thích khi chuỗi đơn vị giống nhau (không tự quy đổi kg/thùng/hộp).
- “Không còn ghi nhận” không có nghĩa là hết hàng. Chỉ số lượng `0` do người dùng nhập mới là số 0 xác nhận.
- `RETENTION_DAYS = 5` nghĩa là giữ 5 **ngày chát có dữ liệu** gần nhất theo ngày lịch, không phải 5 ngày liên tục.

## Chạy trên Windows

Yêu cầu Node.js 20 trở lên và npm.

```powershell
git clone <repository-url>
cd toolDateCity
copy .env.example .env.local
npm install
npm run dev
```

Mở địa chỉ Vite in ra, thường là `http://localhost:5173`.

Kiểm tra trước khi phát hành:

```powershell
npm test
npm run lint
npm run build
```

## Thiết lập Firebase

1. Tạo project tại Firebase Console.
2. Trong **Build → Authentication → Sign-in method**, bật **Email/Password**.
3. Trong **Authentication → Users**, tạo từng tài khoản cho người được phép dùng. Không có màn hình tự đăng ký trong app.
4. Trong **Project settings → Your apps**, tạo Web app và chép cấu hình public vào `.env.local` theo `.env.example`. Firebase Web config không phải server secret; tuyệt đối không thêm service-account/Admin SDK vào frontend.
5. Tạo Cloud Firestore ở production mode, chọn khu vực gần người dùng (ví dụ Singapore nếu phù hợp chính sách tổ chức).
6. Với từng Firebase Authentication user, lấy UID và tạo document `allowedUsers/{uid}`. Nội dung nên là `{ "email": "user@example.com", "active": true, "role": "user" }`. Dùng `"role": "admin"` cho tài khoản toàn quyền, `"role": "sale"` cho tài khoản cập nhật quy trình và ghi chú Sale, và `"role": "user"` cho tài khoản chỉ xem/xuất báo cáo. Nếu không có trường `role`, ứng dụng mặc định là `user`. Rules dùng sự tồn tại của document làm allowlist.
7. Cài Firebase CLI và đăng nhập:

```powershell
npm install -g firebase-tools
firebase login
firebase use --add
cd functions
npm install
npm run build
cd ..
firebase deploy --only firestore:rules,firestore:indexes,functions
```

Sau khi Functions đã deploy thành công, đặt `VITE_USE_ADMIN_FUNCTIONS=true` trên môi trường frontend rồi deploy lại ứng dụng. Khi bật, tạo/sửa/xóa tài khoản trong Admin Panel sẽ đồng bộ cả Firebase Authentication và `allowedUsers`. Trước khi bật, ứng dụng vẫn dùng luồng tương thích cũ.

Functions yêu cầu Node.js 22. Scheduled function chạy lúc 01:00 theo múi giờ Việt Nam để giữ 5 ngày dữ liệu gần nhất. Firestore triggers ghi 100% thay đổi của `dateRecords`, `products` và `allowedUsers` vào `auditLogs`; chỉ admin được đọc lịch sử này.

### Kiểm tra Security Rules

Trong Firestore Rules Playground hoặc Emulator Suite, kiểm tra tối thiểu:

- Không đăng nhập: đọc/ghi `products` và `dateRecords` bị từ chối.
- Đăng nhập nhưng không có `allowedUsers/{uid}`: bị từ chối.
- UID có trong allowlist: đọc và CRUD dữ liệu hợp lệ thành công.
- Client không thể tự tạo/sửa `allowedUsers`.

Chạy emulator (tùy chọn):

```powershell
firebase emulators:start --only auth,firestore
```

## Cấu trúc Firestore

### `products/{productId}`

```json
{
  "productCode": "SP001",
  "productName": "Original product name",
  "vietnameseName": "Tên sản phẩm",
  "aliases": ["từ khóa", "tên khác"],
  "productGroup": "chilled",
  "packaging": {
    "type": "basket-bag-pack",
    "bagsPerBasket": 6,
    "packsPerBag": 10,
    "note": "Bảo quản mát"
  },
  "active": true,
  "createdAt": "server timestamp",
  "updatedAt": "server timestamp"
}
```

### `dateRecords/{yyyy-MM-dd_productId}`

```json
{
  "chatDate": "2026-10-21",
  "productId": "sp001",
  "productCode": "SP001",
  "productName": "Original product name",
  "vietnameseName": "Tên sản phẩm",
  "isNewDate": false,
  "saleWorkflow": {
    "status": "pending",
    "priority": "normal",
    "assigneeUid": "firebase uid",
    "dueDate": "2026-10-25"
  },
  "lots": [{
    "lotId": "uuid",
    "productionDate": "2026-09-10",
    "quantity": 12,
    "unit": "thùng",
    "datePercent": 68,
    "lotLabel": "L01"
  }],
  "createdAt": "server timestamp",
  "updatedAt": "server timestamp",
  "createdBy": "firebase uid",
  "updatedBy": "firebase uid"
}
```

## Nhập và xuất dữ liệu

Danh mục nhận `.csv`, `.xlsx`, `.xls`. Dòng đầu hỗ trợ: `Mã sản phẩm`, `Tên sản phẩm`, `Tên tiếng Việt`, `Nhóm hàng`, `Kiểu quy cách`, `Gói/thùng`, `Túi/thùng`, `Gói/túi`, `Túi/rổ`, `Túi/hộp`, `Gói/hộp`, `Ghi chú quy cách`, `Từ khóa`, `Hoạt động`. Chỉ **Mã sản phẩm** là bắt buộc; tên và thông tin quy cách có thể để trống rồi bổ sung sau. Nhóm hàng và quy cách độc lập, mọi nhóm đều dùng được mọi kiểu quy cách. Màn hình xem trước sẽ phân biệt cảnh báo với lỗi và vẫn cho nhập các dòng thiếu dữ liệu không bắt buộc. Mã đã tồn tại được cập nhật; danh mục khác không bị xóa. File cũ không có cột quy cách vẫn nhập được và nhận mặc định **Hàng thường · Chỉ thùng**.

Trong màn hình **Danh mục sản phẩm**, nút **File mẫu** tạo tệp `mau-import-danh-muc-san-pham.xlsx` gồm sheet dữ liệu đúng định dạng, các dòng minh họa và sheet hướng dẫn. Người dùng có thể xóa các dòng mẫu, giữ nguyên hàng tiêu đề rồi điền dữ liệu thật để import.

Danh mục sản phẩm vẫn hỗ trợ xuất Excel để quản trị dữ liệu. Báo cáo cận date trên màn hình chính chỉ xuất Word/PDF theo ngày, bộ lọc và thứ tự đang hiển thị. Mỗi mã là một khối riêng, ghi chú Sale áp dụng cho cả mã; từng dòng NSX giữ số lượng gói và `% date` riêng, không hiển thị mã lô.

Số lượng cận date được chuẩn hóa về **gói**. Khi quy cách có đủ hệ số, form nhập cho phép cộng đồng thời nhiều đơn vị (ví dụ `2 rổ + 3 túi + 2 gói`) và tự lưu tổng số gói; bảng và file xuất chỉ hiển thị số lượng gói.

## Triển khai Vercel

1. Đẩy project lên GitHub/GitLab/Bitbucket và import vào Vercel.
2. Framework preset: **Vite**; Build command: `npm run build`; Output directory: `dist`.
3. Trong **Project Settings → Environment Variables**, khai báo toàn bộ biến `VITE_FIREBASE_*` trong `.env.example` cho Production/Preview.
4. Deploy. `vercel.json` đã cấu hình SPA rewrite và các security header cơ bản.
5. Trong Firebase Authentication → Settings → Authorized domains, thêm domain Vercel (ví dụ `chat-can-date.vercel.app`).

Không đưa `.env.local`, service-account JSON hay Firebase Admin credentials lên Git hoặc Vercel frontend.

## Kiểm thử thủ công quan trọng

Ngoài unit test, dùng Firebase project thử nghiệm riêng để kiểm tra: realtime giữa hai trình duyệt; xung đột khi cùng sửa một bản ghi; refresh vẫn còn dữ liệu; tài khoản ngoài allowlist; lỗi mạng; xóa một ngày không ảnh hưởng danh mục/ngày khác; retention chỉ xóa ngày thứ 6 trở về trước.

Không có dữ liệu mẫu nào tự động ghi vào production. Có thể import một CSV thử nghiệm và xóa thủ công sau khi kiểm tra.
