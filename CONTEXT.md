# Bối cảnh dự án — Báo cáo giao hàng CPC1HN

Đọc file này trước khi sửa code — tóm tắt các quyết định thiết kế quan trọng, tránh đi lại đường cũ.

## Stack & hạ tầng
- Vite + React 19 + Tailwind CSS 4, biểu đồ dùng `recharts`, đọc Excel dùng `xlsx`, icon `lucide-react`.
- Deploy: GitHub Pages qua `.github/workflows/deploy.yml`, base path `/Huyen-Duong/`.
- Repo: `HuyenDuong-CPC1HN/Huyen-Duong`, branch `master`.
- Chạy local: double-click `Chạy Web App.bat` trên Desktop (chạy `npm run dev` trong thư mục này, mở `http://localhost:5173/Huyen-Duong/`). Nếu port 5173 bận, Vite tự chuyển port khác — xem log terminal.
- Người dùng **không phải dev**, cần hướng dẫn từng bước rõ ràng khi có việc ngoài code (Firebase Console, GitHub...).

## Nguồn dữ liệu (quan trọng, dễ nhầm)
- Dữ liệu "sống" của Đơn C / Đơn DTP lấy từ Google Sheets (CSV export, `useSheetData.js`).
- Người dùng có thể **upload file Excel theo từng tuần** (`useWeeklyData.js`) — khi có tuần đang chọn (`activeWeek`), dữ liệu Excel ưu tiên hơn Google Sheets. Mỗi tuần có `id` riêng (`${type}_${timestamp}`).
- **Quy ước bắt buộc**: mọi số liệu nhập tay/tính toán gắn với 1 tuần cụ thể (chưa giao, ghi chú, dữ liệu carrier...) PHẢI lưu localStorage theo key có gắn `weekId` (hoặc `'live'` khi không có tuần active), KHÔNG được dùng key chung — nếu không sẽ bị "ghi đè" giữa các tuần (đã từng là bug lớn, sửa nhiều lần).
- Excel upload (`ExcelUpload.jsx`) đọc cột ngày bằng `raw:true` lấy `Date` object thật, tự format lại `dd/mm/yyyy` — KHÔNG dùng chuỗi hiển thị của Excel vì có thể lệch định dạng Mỹ (m/d) vs Việt (d/m), từng gây sai lệch nghiêm trọng số liệu 24h/48h/72h.

## Cloud sync (Firebase)
- `src/firebase.js`: config Firebase project `huyen-duong-cpc1hn`.
- `src/cloudSync.js`: monkey-patch `localStorage.setItem/removeItem` — mọi ghi/xoá localStorage tự động đồng bộ lên Firestore collection `kvstore` (key gốc → 1 document, ghi đè chứ không nhân bản).
- Đăng nhập bắt buộc (`Login.jsx`, Firebase Auth email/password) — bảo mật vì config Firebase lộ công khai trong bundle JS của GitHub Pages. Firestore rules: `allow read, write: if request.auth != null`.
- Nút "Đồng bộ toàn bộ dữ liệu" (sidebar) = đẩy toàn bộ localStorage hiện có lên cloud 1 lần (dùng khi máy có dữ liệu cũ chưa từng sync).
- **Chuyển máy/tài khoản Claude khác**: code nằm trên GitHub, dữ liệu nằm trên Firebase — cả 2 đều độc lập với tài khoản Claude. Chỉ cần `git clone` + `npm install` là đủ code; đăng nhập đúng tài khoản là thấy đủ dữ liệu.

## Cấu trúc phân loại đơn hàng
- `src/utils/partnerType.js`: phân loại mỗi dòng đơn theo cột "Đối tác vận chuyển" → `'tructiep' | 'viettel' | 'spx' | 'chanhxe'`. Có `CHANHXE_EXCEPTIONS` cho vài tên đối tác chứa "Trực tiếp" nhưng thực chất là chành xe.
- `src/utils/deliveryDays.js`: `deliveryBucket(row)` phân loại giao trực tiếp 24h/48h/72h/khác dựa vào chênh lệch "Ngày tạo kiện"/"Ngày giao hàng". Có rule đặc biệt: **"Người đặt hàng" chứa "tân thịnh" → luôn tính 24h bất kể ngày thực tế** (cố ý, theo yêu cầu khách hàng vì ngày hệ thống của khách này không đáng tin — ĐỪNG xoá/sửa rule này, đã thử sửa 1 lần và bị revert).

## Carrier (Viettel Post / SPX) — `src/utils/parseCarrierExport.js` + `src/components/CarrierStats.jsx`
- Upload file xuất từ VTP/SPX, mỗi lần upload = **1 tuần dữ liệu độc lập** (`addCarrierWeek`), không ghi đè — có UI chọn lại tuần cũ, xoá riêng từng tuần.
- Trạng thái bị loại khỏi thống kê hoàn toàn (`cancelStatuses`): VTP "Shop hủy lấy", "Tồn - Lấy không thành công"; SPX "Đã hủy".
- SPX "Lấy hàng không thành công" (`pickupFailStatuses`): chỉ tính nếu Mã vận đơn khớp dữ liệu nội bộ (Đơn C/DTP), không khớp thì bỏ.
- VTP "Đang lấy hàng" (`holdStatuses`) — **chỉ áp dụng cho tab Đơn DTP** (Đơn C không cần): đối chiếu với file phụ "Chờ giao Logistics" (cột "Mã vận đơn VT") upload riêng theo tuần (`addHoldWeek`, gộp mã từ mọi tuần đã upload). Khớp → tính vào mục riêng "Chờ lấy". Không khớp → loại khỏi tổng + highlight đỏ trong bảng chi tiết + có cột "Ghi chú" để theo dõi tay.
- Loại trừ theo "Tên hàng" (`carrier_exclude_tenhang_...`): áp dụng chung mọi tuần của carrier đó (không theo tuần) — bấm vào ô "Tên hàng" trong bảng chi tiết để loại trừ/khôi phục 1 loại hàng (vd voucher) khỏi thống kê.
- Không còn override sửa tay các ô Đang vận chuyển/Giao lại/Hoàn hàng — chỉ đếm thuần theo file upload + các rule trên.

## Tab Tổng đơn — `src/components/TongDonTab.jsx`
- "Tuần này" = tuần đang active ở Đơn C/DTP (mới nhất). "Tuần trước" = tuần liền kề trước đó. Đừng nhầm ngược lại (đã từng bị yêu cầu đổi 1 lần).
- Có tính năng **lưu báo cáo cố định**: nút "Lưu báo cáo tuần này" đóng băng toàn bộ số liệu + nhận định/giải pháp thành 1 bản ghi trong `tongdon_reports` (localStorage), xem lại qua thanh "Lịch sử báo cáo", không bị ảnh hưởng khi dữ liệu sau này thay đổi.
- Biểu đồ sản lượng dùng cột ngang (horizontal bar), có label số liệu hiện trực tiếp trên cột.

## Quy ước làm việc với người dùng
- Trả lời ngắn gọn bằng tiếng Việt.
- Luôn `npx vite build` để kiểm tra lỗi biên dịch sau khi sửa code (không có preview server sẵn để test UI thực tế qua trình duyệt trong nhiều trường hợp — build sạch là mức xác minh tối thiểu).
- Chỉ `git commit`/`git push` khi người dùng yêu cầu rõ ràng ("đẩy lên github", "cập nhật github"...).
- Khi có bug report mơ hồ, nên hỏi lại (AskUserQuestion) thay vì đoán — nhiều lần sửa sai vì đoán nhầm ý, phải revert.
- Nếu cần đối chiếu số liệu thực tế, có thể đọc trực tiếp file Excel người dùng cung cấp đường dẫn bằng Node + thư viện `xlsx` (đã có sẵn trong `node_modules`) để kiểm tra logic thay vì đoán.
