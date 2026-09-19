import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TongDonTab from '../TongDonTab'

const toPngMock = vi.fn()
vi.mock('html-to-image', () => ({ toPng: (...args) => toPngMock(...args) }))

const workspaceMocks = vi.hoisted(() => {
  const values = new Map()
  return {
    clear: () => values.clear(),
    opsStore: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, String(value)); return Promise.resolve() },
      removeItem: (key) => { values.delete(key); return Promise.resolve() },
    },
  }
})

vi.mock('../../data/workspace', () => ({
  opsStore: workspaceMocks.opsStore,
  refreshReportingCycles: vi.fn().mockResolvedValue([]),
}))
vi.mock('../../supabase', () => ({ supabase: {} }))
vi.mock('../../data/analyticsPackages', () => ({
  createAnalyticsPackagesRepository: vi.fn(),
}))
vi.mock('../../useWeeklyData', () => ({
  useWeeklyData: () => ({ weeks: [], pruneToIds: vi.fn() }),
}))
vi.mock('../../utils/sheetReports', () => ({ readSheetReports: () => [] }))
vi.mock('../CarrierStats', () => ({
  getCarrierFileStats: vi.fn(),
  pickCarrierWeekIdByDate: vi.fn(),
  carrierWeekHasRows: vi.fn(() => false),
  computeFrozenNgoaiSan: vi.fn(() => ({ rows: [], stats: {} })),
  getCarrierWeekRows: vi.fn(() => []),
}))

// Snapshot đã lưu, đúng shape mới: current/previous giữ nguyên (computeWeekReport gốc, không đổi) +
// 2 khối donSan/truyenThong chứa riêng chữ nhận định của từng báo cáo.
const report = {
  id: 'tongdon-1',
  weekKey: 'x_x',
  createdAt: '2026-08-10T08:00:00.000Z',
  label: 'Báo cáo giao hàng - CN HCM · 10/08/2026 08:00',
  title: 'Báo cáo giao hàng - CN HCM',
  current: {
    grandTotal: 120, totalC: 70, totalDTP: 35, totalTMDT: 15,
    tructiepTotalC: 40, tructiepTotalDTP: 20, chanhXeTotal: 10, codC: 20, codDTP: 15,
    gh24: 40, gh48: 10, gh72: 5, chuaGiao: 5, chuaGiaoC: 3, chuaGiaoDTP: 2,
    trucTiepTong: 60, bC: { 24: 26, 48: 8, 72: 3 }, bDTP: { 24: 14, 48: 2, 72: 2 }, rate24h: 66.7,
  },
  previous: {
    grandTotal: 100, totalC: 60, totalDTP: 30, totalTMDT: 10,
    tructiepTotalC: 35, tructiepTotalDTP: 17, chanhXeTotal: 8, codC: 17, codDTP: 13,
    gh24: 35, gh48: 9, gh72: 4, chuaGiao: 4, chuaGiaoC: 2, chuaGiaoDTP: 2,
    trucTiepTong: 52, bC: { 24: 22, 48: 7, 72: 2 }, bDTP: { 24: 13, 48: 2, 72: 2 }, rate24h: 67.3,
  },
  donSan: {
    ngoaiSan: null,
    tmdtBody: 'Đơn sàn TMĐT tăng nhẹ.', ngoaiSanBody: 'Ngoại sàn ổn định.', reconNote: 'Đối soát ổn định.',
    verdict: 'Kết luận Đơn sàn.',
    sol1: 'Ưu tiên xử lý tồn SPX.', sol2: 'Rà soát SLA ngoại sàn.', sol3: 'Đối soát hằng ngày.', sol4: 'Theo dõi tăng trưởng.',
  },
  truyenThong: {
    cocauBody: 'Cơ cấu đơn ổn định.', dtpBody: 'Đơn DTP ổn định.', cBody: 'Đơn C cần theo dõi.', vtpBody: 'Viettel Post ổn định.',
    verdict: 'Kết luận Đơn truyền thống.',
    sol1: 'Theo dõi năng lực Đơn C.', sol2: 'Xử lý đơn bệnh viện.', sol3: 'Nhân rộng cách làm DTP.', sol4: 'Theo dõi SLA Viettel Post.',
  },
}

describe('TongDonTab saved-report composition', () => {
  afterEach(() => {
    cleanup()
    workspaceMocks.clear()
  })

  it('keeps report actions and lets người dùng switch between 2 báo cáo Đơn sàn / Đơn truyền thống', () => {
    workspaceMocks.opsStore.setItem('tongdon_reports', JSON.stringify([report]))

    render(<TongDonTab onNavigate={vi.fn()} />)

    expect(screen.getByRole('button', { name: /Công bố cho phân tích/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Chọn lại & làm lại/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Upload tuần mới/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Xuất ảnh PNG/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /In \/ Xuất PDF/i })).toBeInTheDocument()

    const tabDonSan = screen.getByRole('button', { name: 'Đơn sàn' })
    const tabTruyenThong = screen.getByRole('button', { name: 'Đơn truyền thống' })
    expect(tabDonSan).toHaveClass('active')
    expect(tabTruyenThong).not.toHaveClass('active')

    expect(screen.getByText('ĐƠN SÀN')).toBeInTheDocument()
    expect(screen.getByText('Kết luận Đơn sàn.')).toBeInTheDocument()
    expect(screen.getByText('Ưu tiên xử lý tồn SPX.')).toBeInTheDocument()

    fireEvent.click(tabTruyenThong)
    expect(tabTruyenThong).toHaveClass('active')
    expect(tabDonSan).not.toHaveClass('active')
    expect(screen.getByText('ĐƠN TRUYỀN THỐNG')).toBeInTheDocument()
    expect(screen.getByText('Kết luận Đơn truyền thống.')).toBeInTheDocument()
    expect(screen.getByText('Theo dõi năng lực Đơn C.')).toBeInTheDocument()
  })

  it('shows read-only "Báo cáo đã lưu" period label instead of week pickers once saved', () => {
    workspaceMocks.opsStore.setItem('tongdon_reports', JSON.stringify([report]))

    render(<TongDonTab onNavigate={vi.fn()} />)

    expect(within(document.querySelector('.tdr.is-active')).getByText(/Báo cáo đã lưu ·/)).toBeInTheDocument()
    expect(document.querySelector('.tdr-source-picker')).not.toBeInTheDocument()
  })

  it('bật tạm class "tdr-export-cream" (nền/viền/chữ + khổ 1180px khớp mẫu) đúng lúc chụp ảnh, tắt lại ngay sau đó', async () => {
    workspaceMocks.opsStore.setItem('tongdon_reports', JSON.stringify([report]))
    let classDuringCapture = null
    toPngMock.mockImplementation((node) => {
      // toPng "chụp" DOM ngay tại thời điểm gọi — đúng lúc này class kem PHẢI đang có mặt.
      classDuringCapture = node.classList.contains('tdr-export-cream')
      return Promise.resolve('data:image/png;base64,fake')
    })

    // jsdom không tự chạy vòng lặp requestAnimationFrame — cho chạy callback ngay để await trong
    // handleExportImage không treo mãi (bản thân component chỉ cần "đợi 1 frame" trước khi chụp).
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => { cb(); return 0 })

    render(<TongDonTab onNavigate={vi.fn()} />)
    const node = document.querySelector('.tdr.is-active')
    expect(node.classList.contains('tdr-export-cream')).toBe(false)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Xuất ảnh PNG/i }))
      await Promise.resolve()
      await Promise.resolve()
    })
    rafSpy.mockRestore()

    expect(toPngMock).toHaveBeenCalledWith(node, { backgroundColor: '#f5f4f0', pixelRatio: 1 })
    expect(classDuringCapture).toBe(true)
    // Sau khi xuất xong, màn hình đang xem phải trở lại đúng giao diện thường — không bị kẹt kiểu kem.
    expect(node.classList.contains('tdr-export-cream')).toBe(false)
  })
})
