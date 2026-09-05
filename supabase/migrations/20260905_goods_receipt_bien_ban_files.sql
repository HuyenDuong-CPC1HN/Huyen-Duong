-- Thay bien_ban_tong_file_name/bien_ban_tong_storage_path (1 file duy nhất, thiết kế ban đầu sai) bằng
-- bien_ban_files (mảng) — 1 chuyến hàng có thể có nhiều biên bản giao nhận (vd biên bản tổng CPC1HN +
-- biên bản chi tiết DTP), giờ được upload ngay từ vùng "Biên bản giao nhận" lúc xử lý, không cần upload
-- lại lần 2. Giữ nguyên 2 cột cũ (không xoá) để không phá dữ liệu cũ nếu đã có, chỉ ngưng dùng trong code.
-- An toàn để chạy lại.

alter table public.goods_receipt_batches
  add column if not exists bien_ban_files jsonb not null default '[]'::jsonb;
