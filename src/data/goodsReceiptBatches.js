import { createStorageFilesRepository } from './storageFiles'

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
      khoC = [],
      khoLgt = [],
    }) {
      const storagePath = `goods-receipt/${id}.json`
      const payload = {
        id,
        processedAt,
        pdfFileName,
        excelCFileName,
        excelLgtFileName,
        khoC,
        khoLgt,
      }
      await files.writeJson(storagePath, payload)

      const record = {
        id,
        processed_at: processedAt,
        pdf_file_name: pdfFileName,
        excel_c_file_name: excelCFileName,
        excel_lgt_file_name: excelLgtFileName,
        bien_ban_files: bienBanFiles,
        storage_path: storagePath,
      }
      const { error: batchError } = await batchTable().upsert(record)
      if (batchError) {
        await files.remove(storagePath).catch(() => undefined)
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
      return files.readJson(batch.storage_path)
    },

    async remove(batch) {
      fail((await lineTable().delete().eq('batch_id', batch.id)).error)
      fail((await batchTable().delete().eq('id', batch.id)).error)
      await files.remove(batch.storage_path)
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
