-- Tách file lưu trữ (JSON) của 1 chuyến nhập hàng ra làm 2 theo kho — storage_path (đã có) giờ trỏ tới
-- file của Kho C, thêm storage_path_lgt trỏ tới file của Kho LGT — để duyệt trong Supabase Storage theo
-- Kho C/Kho LGT > Năm > Tháng > các chuyến trong tháng thay vì gộp chung 1 file cho cả 2 kho.
-- Cho phép null để tương thích ngược: các chuyến đã lưu TRƯỚC migration này chỉ có storage_path (chứa cả
-- 2 kho gộp chung, đọc theo code cũ) — không cần/không thể tách lại hồi tố. An toàn để chạy lại.

alter table public.goods_receipt_batches
  add column if not exists storage_path_lgt text;
