import { describe, expect, it, vi } from 'vitest'
import { createOpsSettingsRepository } from '../opsSettings'
import { createStorageFilesRepository } from '../storageFiles'
import { createGoodsReceiptBatchesRepository } from '../goodsReceiptBatches'
import { createExpiryStockMonthsRepository } from '../expiryStockMonths'

function chain(result) {
  const api = {
    select: vi.fn(() => api),
    eq: vi.fn(() => api),
    order: vi.fn(() => api),
    upsert: vi.fn(() => api),
    update: vi.fn(() => api),
    insert: vi.fn(() => api),
    delete: vi.fn(() => api),
    single: vi.fn(() => api),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  }
  return api
}

describe('Supabase repositories', () => {
  it('gets, sets and removes a residual week-scoped setting', async () => {
    const table = chain({ data: { key: 'chuagiao_donC_week_1', value: { bv: 3 } }, error: null })
    const client = { from: vi.fn(() => table) }
    const repo = createOpsSettingsRepository(client)

    await expect(repo.get('chuagiao_donC_week_1')).resolves.toEqual({ bv: 3 })
    await repo.set('chuagiao_donC_week_1', { bv: 4 })
    await repo.remove('chuagiao_donC_week_1')

    expect(table.upsert).toHaveBeenCalledWith({ key: 'chuagiao_donC_week_1', value: { bv: 4 } })
    expect(table.delete).toHaveBeenCalled()
  })

  it('lưu đủ khoCFileNames/khoLgtFileNames/usedSharedExcel/pdfMetadata/warnings vào blob JSON — không chỉ khoC/khoLgt (thiếu thì mất "Kho C: X file" + Cảnh báo đối chiếu ngay sau khi Lưu chỉnh sửa hoặc tải lại trang)', async () => {
    const storage = { upload: vi.fn().mockResolvedValue({ error: null }) }
    const table = chain({ data: null, error: null })
    const client = { storage: { from: vi.fn(() => storage) }, from: vi.fn(() => table) }
    const repo = createGoodsReceiptBatchesRepository(client)

    await repo.save({
      id: 'b1',
      processedAt: '2026-09-04T00:00:00.000Z',
      khoCFileNames: ['phieu_a.xlsx'],
      khoLgtFileNames: [],
      usedSharedExcel: true,
      pdfMetadata: { soHoaDon: 'HD1' },
      warnings: ['Lệch số kiện so biên bản giao nhận'],
      bienBanFiles: [{ fileName: 'bb.pdf', storagePath: 'goods-receipt/2026/09/b1/bb.pdf' }],
      khoC: [{ maHang: 'A1', slHoaDon: 10 }],
      khoLgt: [],
    })

    const [, body] = storage.upload.mock.calls[0]
    const payload = JSON.parse(await body.text())
    expect(payload).toMatchObject({
      khoCFileNames: ['phieu_a.xlsx'],
      khoLgtFileNames: [],
      usedSharedExcel: true,
      pdfMetadata: { soHoaDon: 'HD1' },
      warnings: ['Lệch số kiện so biên bản giao nhận'],
    })
    // bien_ban_files có cột riêng trên bảng, không nằm trong blob JSON.
    expect(table.upsert).toHaveBeenCalledWith(expect.objectContaining({
      bien_ban_files: [{ fileName: 'bb.pdf', storagePath: 'goods-receipt/2026/09/b1/bb.pdf' }],
    }))
  })

  it('tách file JSON ra làm 2 theo kho (Kho C / Kho LGT), mỗi file chỉ chứa dòng của kho đó — biên bản giao nhận vẫn dùng chung, không tách', async () => {
    const storage = { upload: vi.fn().mockResolvedValue({ error: null }) }
    const table = chain({ data: null, error: null })
    const client = { storage: { from: vi.fn(() => storage) }, from: vi.fn(() => table) }
    const repo = createGoodsReceiptBatchesRepository(client)

    await repo.save({
      id: 'b1',
      processedAt: '2026-09-04T00:00:00.000Z',
      bienBanFiles: [{ fileName: 'bb.pdf', storagePath: 'goods-receipt/2026/09/b1/bb.pdf' }],
      khoC: [{ maHang: 'A1', slHoaDon: 10 }],
      khoLgt: [{ maHang: 'B1', slHoaDon: 20 }],
    })

    const [pathC, bodyC] = storage.upload.mock.calls[0]
    const [pathLgt, bodyLgt] = storage.upload.mock.calls[1]
    expect(pathC).toBe('goods-receipt/Kho C/2026/09/b1.json')
    expect(pathLgt).toBe('goods-receipt/Kho LGT/2026/09/b1.json')

    const payloadC = JSON.parse(await bodyC.text())
    const payloadLgt = JSON.parse(await bodyLgt.text())
    expect(payloadC.khoC).toEqual([{ maHang: 'A1', slHoaDon: 10 }])
    expect(payloadC.khoLgt).toBeUndefined()
    expect(payloadLgt.khoLgt).toEqual([{ maHang: 'B1', slHoaDon: 20 }])
    expect(payloadLgt.khoC).toBeUndefined()

    expect(table.upsert).toHaveBeenCalledWith(expect.objectContaining({
      storage_path: 'goods-receipt/Kho C/2026/09/b1.json',
      storage_path_lgt: 'goods-receipt/Kho LGT/2026/09/b1.json',
      // Biên bản giao nhận không tách theo kho — 1 đường dẫn dùng chung như cũ.
      bien_ban_files: [{ fileName: 'bb.pdf', storagePath: 'goods-receipt/2026/09/b1/bb.pdf' }],
    }))
  })

  it('loadBatch gộp lại đúng 2 file theo kho; batch cũ (chưa tách, không có storage_path_lgt) vẫn đọc được như 1 file gộp', async () => {
    const files = {
      'goods-receipt/Kho C/2026/09/b1.json': { id: 'b1', khoC: [{ maHang: 'A1' }] },
      'goods-receipt/Kho LGT/2026/09/b1.json': { khoLgt: [{ maHang: 'B1' }] },
      'goods-receipt/2026/08/old.json': { id: 'old', khoC: [{ maHang: 'X' }], khoLgt: [{ maHang: 'Y' }] },
    }
    const storage = {
      download: vi.fn(path => Promise.resolve({ data: new Blob([JSON.stringify(files[path])]), error: null })),
    }
    const client = { storage: { from: vi.fn(() => storage) } }
    const repo = createGoodsReceiptBatchesRepository(client)

    const merged = await repo.loadBatch({ storage_path: 'goods-receipt/Kho C/2026/09/b1.json', storage_path_lgt: 'goods-receipt/Kho LGT/2026/09/b1.json' })
    expect(merged).toMatchObject({ id: 'b1', khoC: [{ maHang: 'A1' }], khoLgt: [{ maHang: 'B1' }] })

    const legacy = await repo.loadBatch({ storage_path: 'goods-receipt/2026/08/old.json', storage_path_lgt: null })
    expect(legacy).toMatchObject({ id: 'old', khoC: [{ maHang: 'X' }], khoLgt: [{ maHang: 'Y' }] })
  })

  it('turns a missing Storage object into a clear Vietnamese error', async () => {
    const storage = { download: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }) }
    const client = { storage: { from: vi.fn(() => storage) } }

    await expect(createStorageFilesRepository(client).readJson('weeks/donC/missing.json'))
      .rejects.toThrow('Không tải được dữ liệu tuần từ kho tệp')
  })

  it('downloads raw file bytes for re-reading a saved PDF (đối chiếu lại số kiện)', async () => {
    const bytes = new Uint8Array([1, 2, 3])
    const blob = new Blob([bytes])
    const storage = { download: vi.fn().mockResolvedValue({ data: blob, error: null }) }
    const client = { storage: { from: vi.fn(() => storage) } }

    const buf = await createStorageFilesRepository(client).downloadFile('goods-receipt/2026/09/b1/bb.pdf')
    expect(new Uint8Array(buf)).toEqual(bytes)
    expect(storage.download).toHaveBeenCalledWith('goods-receipt/2026/09/b1/bb.pdf')
  })

  it('lưu tháng tồn kho kèm kỳ báo cáo; tháng lưu trước đây (chỉ có mảng dòng) vẫn đọc được', async () => {
    const written = {}
    const storage = {
      upload: vi.fn(async (path, blob) => { written[path] = JSON.parse(await blob.text()); return { error: null } }),
      download: vi.fn(async (path) => ({ data: new Blob([JSON.stringify(path === 'old.json' ? [{ maVatTu: 'A' }] : written[path])]), error: null })),
    }
    const table = chain({ data: null, error: null })
    const client = { storage: { from: vi.fn(() => storage) }, from: vi.fn(() => table) }
    const repo = createExpiryStockMonthsRepository(client)
    const dateRange = { tuNgay: '2026-03-01', denNgay: '2026-05-31', soNgay: 91 }

    await repo.save({ id: 'm1', rows: [{ maVatTu: 'B' }], dateRange, isActive: false })
    await expect(repo.loadMonth({ storage_path: 'expiry-stock/m1.json' })).resolves.toEqual({ rows: [{ maVatTu: 'B' }], dateRange })
    await expect(repo.loadMonth({ storage_path: 'old.json' })).resolves.toEqual({ rows: [{ maVatTu: 'A' }], dateRange: null })
  })
})
