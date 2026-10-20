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
   (để trống thì hàm tự chọn mô hình "flash" mới nhất của tài khoản).

Gói miễn phí của Gemini có giới hạn lượt / ngày và Google có thể dùng dữ liệu gửi lên để cải thiện sản phẩm.
