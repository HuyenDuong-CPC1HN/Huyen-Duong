import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TongDonTab from '../TongDonTab'

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
}))

const report = {
  id: 'tongdon-1',
  weekKey: 'x_x',
  createdAt: '2026-08-10T08:00:00.000Z',
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
  insight1: 'Sản lượng tăng.', insight2: 'Giao 24h ổn định.', insight3: 'Theo dõi tồn.',
  insight4: 'Cơ cấu đơn ổn định.', insight5: 'SPX cần theo dõi.', insight6: 'Viettel Post ổn định.',
  verdict: 'Kết luận vận hành.',
  sol1: 'Ưu tiên xử lý tồn.', sol2: 'Rà soát SLA.', sol3: 'Đối soát hằng ngày.',
  sol4: 'Bố trí nguồn lực.', sol5: 'Thiết lập KPI tuần tới.',
}

describe('TongDonTab saved-report composition', () => {
  afterEach(() => {
    cleanup()
    workspaceMocks.clear()
  })

  it('keeps report actions, two periods, and a tabbed internal operations panel available', () => {
    workspaceMocks.opsStore.setItem('tongdon_reports', JSON.stringify([report]))

    render(<TongDonTab onNavigate={vi.fn()} />)

    expect(document.querySelector('.tongdon-tab.is-saved-report')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Công bố cho phân tích/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Chọn lại & làm lại/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Upload tuần mới/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Xuất ảnh/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /In \/ Xuất PDF/i })).toBeInTheDocument()
    expect(screen.getByText('TUẦN NÀY')).toBeInTheDocument()
    expect(screen.getByText('TUẦN TRƯỚC')).toBeInTheDocument()

    const periodDetailToggles = document.querySelectorAll('button[aria-controls^="tongdon-period-details-"]')
    expect(periodDetailToggles).toHaveLength(2)
    expect(periodDetailToggles[0]).toHaveAttribute('aria-expanded', 'false')
    expect(document.querySelector('.tongdon-breakdown-sub')).toHaveAttribute('hidden')
    expect(document.querySelector('.tongdon-breakdown-chips')).toHaveAttribute('hidden')
    fireEvent.click(periodDetailToggles[0])
    expect(periodDetailToggles[0]).toHaveAttribute('aria-expanded', 'true')
    expect(document.querySelector('.tongdon-breakdown-sub')).not.toHaveAttribute('hidden')
    expect(document.querySelector('.tongdon-breakdown-chips')).not.toHaveAttribute('hidden')

    const insightToggle = document.querySelector('.tongdon-insight-toggle')
    const insightBody = document.querySelector('.tongdon-insight-body')
    expect(insightToggle).toHaveAttribute('aria-expanded', 'false')
    expect(insightBody).toHaveAttribute('hidden')
    fireEvent.click(insightToggle)
    expect(insightToggle).toHaveAttribute('aria-expanded', 'true')
    expect(insightBody).not.toHaveAttribute('hidden')

    expect(screen.getByRole('tab', { name: 'Nhận định' })).toHaveAttribute('aria-selected', 'true')
    expect(document.getElementById('tongdon-solutions')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Giải pháp' }))
    expect(screen.getByRole('tab', { name: 'Giải pháp' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Ưu tiên xử lý tồn.')).toBeInTheDocument()
    expect(document.querySelector('.tongdon-operations-scroll')).toBeInTheDocument()
  })
})
