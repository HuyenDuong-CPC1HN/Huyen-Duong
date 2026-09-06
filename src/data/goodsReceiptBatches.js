import { createStorageFilesRepository, monthFolder } from './storageFiles'

function fail(error) { if (error) throw new Error(error.message || String(error)) }

function toLineRecord(batchId, warehouse, row) {
  return {
    batch_id: batchId,
    warehouse,
    ma_hang: row.maHang || '',
    ten_hang: row.tenHang || null,
    dvt: row.dvt || null,
    so_lo: row.soLo || '',
    han_dung: row.hanDung || null,
    kien_nguyen: row.kienNguyen ?? null,
    kien_le: row.kienLe ?? null,
    sl_hoa_don: row.slHoaDon ?? 0,
    sl_thuc_te: row.slThucTe ?? null,
    ghi_chu: row.ghiChu || null,
  }
}

export function createGoodsReceiptBatchesRepository(client) {
  const files = createStorageFilesRepository(client)
  const batchTable = () => client.from('goods_receipt_batches')
  const lineTable = () => client.from('goods_receipt_lines')

  return {
    async list() {
      const { data, error } = await batchTable().select('*').order('processed_at', { ascending: false })
      fail(error)
      return data || []
    },

    async save({
      id,
      processedAt = new Date().toISOString(),
      pdfFileName = null,
      excelCFileName = null,
      excelLgtFileName = null,
      bienBanFiles = [],
      khoCFileNames = [],
      khoLgtFileNames = [],
      usedSharedExcel = false,
      pdfMetadata = {},
      warnings = [],
      khoC = [],
      khoLgt = [],
    }) {
      // Tách file lưu trữ ra làm 2 theo kho — duyệt trong Supabase Storage theo Kho C/Kho LGT > Năm >
      // Tháng > các chuyến trong tháng, thay vì gộp chung 1 file cho cả 2 kho. Các trường chung (không
      // thuộc riêng kho nào — tên file nguồn, cảnh báo đối chiếu...) nhân đôi vào cả 2 file để mỗi file tự
      // đủ thông tin khi duyệt/tải riêng lẻ trên Storage, không phải mở cả 2 mới biết chuyến này ngày nào.
      // Biên bản giao nhận (bienBanFiles) KHÔNG tách theo kho — 1 biên bản thường dùng chung đối chiếu cả
      // 2 kho nên vẫn để ở goods-receipt/{năm}/{tháng}/{chuyến}/... như cũ, không nhân đôi.
      const month = monthFolder(processedAt)
      const shared = {
        id,
        processedAt,
        pdfFileName,
        excelCFileName,
        excelLgtFileName,
        khoCFileNames,
        khoLgtFileNames,
        usedSharedExcel,
        pdfMetadata,
        warnings,
      }
      const storagePathC = `goods-receipt/Kho C/${month}/${id}.json`
      const storagePathLgt = `goods-receipt/Kho LGT/${month}/${id}.json`
      await files.writeJson(storagePathC, { ...shared, khoC })
      await files.writeJson(storagePathLgt, { ...shared, khoLgt })

      const record = {
        id,
        processed_at: processedAt,
        pdf_file_name: pdfFileName,
        excel_c_file_name: excelCFileName,
        excel_lgt_file_name: excelLgtFileName,
        bien_ban_files: bienBanFiles,
        storage_path: storagePathC,
        storage_path_lgt: storagePathLgt,
      }
      const { error: batchError } = await batchTable().upsert(record)
      if (batchError) {
        await Promise.all([
          files.remove(storagePathC).catch(() => undefined),
          files.remove(storagePathLgt).catch(() => undefined),
        ])
        fail(batchError)
      }

      fail((await lineTable().delete().eq('batch_id', id)).error)

      const lines = [
        ...khoC.map(row => toLineRecord(id, 'C', row)),
        ...khoLgt.map(row => toLineRecord(id, 'LGT', row)),
      ]
      if (lines.length > 0) {
        const { error: lineError } = await lineTable().insert(lines)
        if (lineError) fail(lineError)
      }

      return record
    },

    async loadBatch(batch) {
      // Chuyến lưu TRƯỚC khi tách file theo kho chỉ có storage_path (1 file gộp cả 2 kho, đọc nguyên như
      // cũ) — không có storage_path_lgt để tách lại hồi tố, không cần thiết vì dữ liệu vẫn đọc đúng.
      if (!batch.storage_path_lgt) return files.readJson(batch.storage_path)
      const [payloadC, payloadLgt] = await Promise.all([
        files.readJson(batch.storage_path),
        files.readJson(batch.storage_path_lgt),
      ])
      return { ...payloadC, khoLgt: payloadLgt.khoLgt || [] }
    },

    async remove(batch) {
      fail((await lineTable().delete().eq('batch_id', batch.id)).error)
      fail((await batchTable().delete().eq('id', batch.id)).error)
      await files.remove(batch.storage_path)
      if (batch.storage_path_lgt) await files.remove(batch.storage_path_lgt).catch(() => undefined)
      for (const bb of batch.bien_ban_files || []) {
        if (bb.storagePath) await files.remove(bb.storagePath).catch(() => undefined)
      }
    },

    async getBienBanFileUrl(storagePath) {
      if (!storagePath) return null
      return files.getSignedUrl(storagePath)
    },

    async searchByMaHang(maHang, limit = 200) {
      const q = String(maHang || '').trim()
      if (!q) return []
      const { data, error } = await lineTable()
        .select('*, goods_receipt_batches(processed_at, pdf_file_name, excel_c_file_name, excel_lgt_file_name)')
        .ilike('ma_hang', `%${q}%`)
        .order('created_at', { ascending: false })
        .limit(limit)
      fail(error)
      return data || []
    },
  }
}
