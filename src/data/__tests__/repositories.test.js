import { describe, expect, it, vi } from 'vitest'
import { createReportWeeksRepository } from '../reportWeeks'
import { createOpsSettingsRepository } from '../opsSettings'
import { createStorageFilesRepository } from '../storageFiles'
import { createAnalyticsPackagesRepository } from '../analyticsPackages'
import { createReportingCyclesRepository } from '../reportingCycles'
import { createGoodsReceiptBatchesRepository } from '../goodsReceiptBatches'

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
  it('saves a week payload before its metadata and returns the domain object', async () => {
    const storage = { upload: vi.fn().mockResolvedValue({ error: null }) }
    const table = chain({ data: { id: 'donC_1', channel: 'donC', label: 'Tuần 32', storage_path: 'weeks/donC/donC_1.json' }, error: null })
    const client = { storage: { from: vi.fn(() => storage) }, from: vi.fn(() => table) }
    const repo = createReportWeeksRepository(client)

    const saved = await repo.save({ id: 'donC_1', channel: 'donC', label: 'Tuần 32', rows: [{ code: 'A1' }] })

    expect(storage.upload.mock.invocationCallOrder[0]).toBeLessThan(table.upsert.mock.invocationCallOrder[0])
    expect(saved).toMatchObject({ id: 'donC_1', channel: 'donC', label: 'Tuần 32' })
  })

  it('removes an uploaded payload when saving its metadata fails', async () => {
    const storage = {
      upload: vi.fn().mockResolvedValue({ error: null }),
      remove: vi.fn().mockResolvedValue({ error: null }),
    }
    const activeTable = chain({ data: null, error: null })
    const failingTable = chain({ data: null, error: { message: 'RLS denied' } })
    const client = {
      storage: { from: vi.fn(() => storage) },
      from: vi.fn().mockReturnValueOnce(activeTable).mockReturnValueOnce(failingTable),
    }

    await expect(createReportWeeksRepository(client).save({ id: 'donC_1', channel: 'donC', label: 'Tuần 32', rows: [] }))
      .rejects.toThrow('RLS denied')
    expect(storage.remove).toHaveBeenCalledWith(['weeks/donC/donC_1.json'])
  })

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

  it('turns a missing Storage object into a clear Vietnamese error', async () => {
    const storage = { download: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }) }
    const client = { storage: { from: vi.fn(() => storage) } }

    await expect(createStorageFilesRepository(client).readJson('weeks/donC/missing.json'))
      .rejects.toThrow('Không tải được dữ liệu tuần từ kho tệp')
  })

  it('publishes and unpublishes a KPI package through the server-side completion gate', async () => {
    const client = {
      rpc: vi.fn()
        .mockResolvedValueOnce({ data: { cycle_key: 'donC_32_donDTP_32', status: 'ready' }, error: null })
        .mockResolvedValueOnce({ data: null, error: null }),
    }
    const repo = createAnalyticsPackagesRepository(client)

    await expect(repo.publish({
      cycleKey: 'donC_32_donDTP_32',
      tongdonReportId: 'tongdon-32',
      kpiJson: { schema_version: '1.0' },
      sourceRefs: { tongdon_report_id: 'tongdon-32' },
    })).resolves.toMatchObject({ cycle_key: 'donC_32_donDTP_32', status: 'ready' })
    await expect(repo.markStale('donC_32_donDTP_32')).resolves.toBeUndefined()

    expect(client.rpc).toHaveBeenNthCalledWith(1, 'publish_analytics_cycle', {
      p_cycle_key: 'donC_32_donDTP_32',
      p_tongdon_report_id: 'tongdon-32',
      p_kpi_json: { schema_version: '1.0' },
      p_source_refs: { tongdon_report_id: 'tongdon-32' },
    })
    expect(client.rpc).toHaveBeenNthCalledWith(2, 'unpublish_analytics_cycle', {
      p_cycle_key: 'donC_32_donDTP_32',
    })
  })

  it('loads cycle status for the shared workspace cache', async () => {
    const table = chain({ data: [{ cycle_key: 'donC_32_donDTP_32', status: 'ready_for_analytics' }], error: null })
    const client = { from: vi.fn(() => table) }

    await expect(createReportingCyclesRepository(client).list()).resolves.toEqual([
      { cycle_key: 'donC_32_donDTP_32', status: 'ready_for_analytics' },
    ])
    expect(client.from).toHaveBeenCalledWith('reporting_cycles')
  })
})
