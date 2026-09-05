-- Thêm chỗ lưu biên bản giao nhận tổng (bản scan/ảnh, đính kèm cả chuyến hàng) vào goods_receipt_batches.
-- An toàn để chạy lại.

alter table public.goods_receipt_batches
  add column if not exists bien_ban_tong_file_name text,
  add column if not exists bien_ban_tong_storage_path text;
