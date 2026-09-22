import { describe, expect, it, vi } from 'vitest'

const carrierMocks = vi.hoisted(() => ({
  getCarrierFileStats: vi.fn(),
  carrierWeekHasRows: vi.fn(),
  getCarrierWeekRows: vi.fn(),
  computeFrozenNgoaiSan: vi.fn(),
}))
vi.mock('../carrierUtils', () => carrierMocks)

const { computeWeekReportFromUnifiedTrial, ngoaiSanForWeekIdUnifiedTrial } = await import('../tongDonUnifiedTrialAdapter')

function makeDonSOEntry(overrides = {}) {
  return {
    id: '2026-09-21T00:00:00.000Z', fileName: 'Đơn SO_21-09.xlsx', label: 'Đơn SO_21-09.xlsx · 21/09/2026',
    total: 2385, tmdtCount: 1721, ngoaiSanCount: 664, otherCount: 0, mismatchCount: 0, shops: [],
    spxWeekId: 'spx-week-1', carrierLookup: { X001: {} },
    ...overrides,
  }
}
function makeChannelSnapshot(overrides = {}) {
  return {
    total: 617, trucTiepBadge: 377, trucTiepStats: { '24h': 200, '48h': 100, '72h': 20, khac: 0 },
    trucTiepDelivered: 320, khBreakdownSum: 57, khValues: {}, chanhXeBadge: 214, chanhXeCount: 200,
    chuaGuiChanh: 14, viettelCount: 26, spxCount: 0, doitacTotal: 26,
    viettelWeekId: 'vtp-week-1', spxWeekId: null, carrierLookup: { Y001: {} },
    ...overrides,
  }
}
function makeDonTTEntry(overrides = {}) {
  return {
    id: '2026-09-21T01:00:00.000Z', fileName: 'Đơn TT_21-09.xlsx', label: 'Đơn TT_21-09.xlsx · 21/09/2026',
    otherCount: 0, mismatchCount: 0,
    donC: makeChannelSnapshot(),
    donDTP: makeChannelSnapshot({ total: 686, trucTiepBadge: 427, chanhXeBadge: 0, viettelCount: 259, viettelWeekId: 'vtp-week-2' }),
    ...overrides,
  }
}

describe('computeWeekReportFromUnifiedTrial', () => {
  it('map đúng field sang đúng hình dạng computeWeekReport() — TMĐT/Đơn C/Đơn DTP/Viettel Post/SPX', () => {
    carrierMocks.getCarrierFileStats.mockImplementation((key) => {
      if (key === 'unifiedTrial_donSO_spx') return { weekId: 'spx-week-1', total: 664, stats: { '24h': 45 } }
      if (key === 'unifiedTrial_donC_viettel') return { weekId: 'vtp-week-1', total: 26, stats: { '24h': 8 } }
      if (key === 'unifiedTrial_donDTP_viettel') return { weekId: 'vtp-week-2', total: 259, stats: { '24h': 120 } }
      return null
    })

    const result = computeWeekReportFromUnifiedTrial({ donSOEntry: makeDonSOEntry(), donTTEntry: makeDonTTEntry() })

    expect(result.totalTMDT).toBe(1721)
    expect(result.totalC).toBe(617)
    expect(result.totalDTP).toBe(686)
    expect(result.grandTotal).toBe(617 + 686 + 1721)
    expect(result.tructiepTotalC).toBe(377)
    expect(result.tructiepTotalDTP).toBe(427)
    expect(result.chanhXeTotal).toBe(214)
    expect(result.bC).toEqual({ 24: 200, 48: 100, 72: 20 })
    expect(result.gh24).toBe(400) // donC (200) + donDTP (200, dùng chung trucTiepStats mẫu qua makeChannelSnapshot)
    expect(result.viettelC).toMatchObject({ total: 26 })
    expect(result.viettelDTP).toMatchObject({ total: 259 })
    expect(result.spxC).toMatchObject({ total: 664 })
    expect(result.codC).toBe(26) // donC showSpx:false ở Gộp kênh -> KHÔNG cộng SPX vào codC/totalC (khác nguồn cũ)

    expect(carrierMocks.getCarrierFileStats).toHaveBeenCalledWith('unifiedTrial_donSO_spx', 'spx', [], 'spx-week-1', { X001: {} })
    expect(carrierMocks.getCarrierFileStats).toHaveBeenCalledWith('unifiedTrial_donC_viettel', 'viettel', [], 'vtp-week-1', { Y001: {} })
  })

  it('donSOEntry/donTTEntry null (chưa lưu tuần nào) -> mọi số về 0, không crash', () => {
    const result = computeWeekReportFromUnifiedTrial({ donSOEntry: null, donTTEntry: null })
    expect(result.grandTotal).toBe(0)
    expect(result.totalC).toBe(0)
    expect(result.viettelC).toBeNull()
    expect(result.spxC).toBeNull()
  })
})

describe('ngoaiSanForWeekIdUnifiedTrial', () => {
  it('còn rows sống -> tính qua computeFrozenNgoaiSan, frozen:false', () => {
    carrierMocks.carrierWeekHasRows.mockReturnValue(true)
    carrierMocks.getCarrierWeekRows.mockReturnValue([{ maDon: 'A1' }])
    carrierMocks.computeFrozenNgoaiSan.mockReturnValue({ rows: [], stats: { total: 1 } })

    const result = ngoaiSanForWeekIdUnifiedTrial('spx-week-1')

    expect(carrierMocks.carrierWeekHasRows).toHaveBeenCalledWith('unifiedTrial_donSO_spx', 'spx-week-1')
    expect(carrierMocks.computeFrozenNgoaiSan).toHaveBeenCalledWith('unifiedTrial_donSO_spx', [{ maDon: 'A1' }])
    expect(result).toEqual({ data: { rows: [], stats: { total: 1 } }, frozen: false })
  })

  it('rows đã bị thay file mới (không còn) -> null, không crash', () => {
    carrierMocks.carrierWeekHasRows.mockReturnValue(false)
    expect(ngoaiSanForWeekIdUnifiedTrial('spx-week-old')).toBeNull()
  })

  it('không có spxWeekId -> null ngay, không gọi gì thêm', () => {
    carrierMocks.carrierWeekHasRows.mockClear()
    expect(ngoaiSanForWeekIdUnifiedTrial(null)).toBeNull()
    expect(carrierMocks.carrierWeekHasRows).not.toHaveBeenCalled()
  })
})
