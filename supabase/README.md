# Supabase schema

1. Create a Supabase project.
2. In **SQL Editor**, run `migrations/20260809_init_ops_schema.sql` once, then run `migrations/20260809_analytics_foundation.sql`, then `migrations/20260828_expiry_stock.sql`. The migrations are safe to re-run for their tables, indexes, trigger names, bucket, and policies.
3. Copy the project URL and anon/publishable key into `.env.local` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

`ops-files` is private. The SQL policies intentionally grant every authenticated
operator full read/write access to the shared CPC1HN data store; `anon` has no
table or object policy. Never place `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`
for Vite, Vercel, source code, or any `VITE_*` variable. It is only for the
one-time offline migration script.

`20260809_analytics_foundation.sql` adds the explicit analytics publication
gate. The publish RPC validates the saved Tổng đơn snapshot and saved Đơn C +
Đơn DTP snapshots again in Postgres; TMĐT is intentionally not a v1 hard gate.

## Edge Function `pxk-ocr` (AI đọc Phiếu xuất kho scan / ảnh)

Mục **Nhập hàng › Đối chiếu sổ sách (PXK)** gọi hàm này để Google Gemini đọc PDF scan / ảnh phiếu. Chưa cài hàm thì app
tự dùng bộ đọc chữ trên trình duyệt như cũ.

1. Lấy khoá Gemini ở https://aistudio.google.com (Get API key → Create API key). Không dán khoá vào code hay chat.
2. Supabase Dashboard → **Edge Functions** → **Deploy a new function** → **Via Editor**, tên `pxk-ocr`, dán toàn bộ
   `functions/pxk-ocr/index.ts`, bấm **Deploy** (giữ bật *Verify JWT* — chỉ người đã đăng nhập app gọi được).
   Hoặc dùng CLI: `supabase functions deploy pxk-ocr`.
3. **Edge Functions → Secrets**: thêm `GEMINI_API_KEY` = khoá ở bước 1. Tuỳ chọn `GEMINI_MODEL` để cố định mô hình
   (để trống thì hàm tự chọn mô hình "flash" mới nhất của tài khoản; mô hình đó báo bận / hết lượt thì tự thử tối đa
   3 mô hình "flash" khác).
   Hàm tắt chế độ "suy nghĩ" của mô hình (đọc bảng nhanh hơn nhiều lần) và tự dừng sau ~130 giây để không bị Supabase
   ngắt (lỗi 546); app tự chia PDF scan thành từng phần 4 trang, phần lỗi gửi lại từng trang.
4. Sửa code hàm (vd bản mới trong repo): mở hàm → tab **Code** → dán đè toàn bộ `functions/pxk-ocr/index.ts` → **Deploy**.
   App gọi được cả tên `pxk-ocr` lẫn `PXK-OCR`.

Gói miễn phí của Gemini có giới hạn lượt / ngày và Google có thể dùng dữ liệu gửi lên để cải thiện sản phẩm.

## Edge Function `ke-toan` (link riêng cho kế toán, tab Hàng trả & huỷ)

Kế toán mở link `https://<app>/#ketoan=<mã>` (không cần đăng nhập) để xem việc đang chờ mình (hồ sơ khách trả chờ nhập
trả lại, đợt huỷ chờ xuất huỷ) và bấm **Đã xong**. App kho tự chuyển hồ sơ / đợt huỷ sang bước kế khi mở tab.

1. Supabase Dashboard → **Edge Functions** → **Deploy a new function** → **Via Editor**, tên đúng `ke-toan` (chữ
   thường), dán toàn bộ `functions/ke-toan/index.ts`, bấm **Deploy**.
2. Mở hàm → **Details** (hoặc Settings) → **tắt "Verify JWT" / "Enforce JWT verification"** → Save. Kế toán không có
   tài khoản đăng nhập nên phải tắt; hàm tự kiểm tra mã link, chỉ trả việc của đúng người giữ link và chỉ ghi được
   khoá xác nhận `flowv2_ktdone:*`.
3. Không cần thêm secret: `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY` có sẵn trong môi trường Edge Function. Không
   đưa khoá service role vào code app hay biến `VITE_*`.
4. Trong app: tab **Hàng trả & huỷ** → nút **Link kế toán** → **Tạo link** cho từng kế toán, chép gửi qua Zalo.
   Lộ link thì bấm **Đổi link** — link cũ hết dùng được ngay.
