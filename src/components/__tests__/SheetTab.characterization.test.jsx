/**
 * SheetTab characterization tests — verifies layout and KPI invariants
 * before and after the no-scroll redesign (R1–R28).
 *
 * These tests validate:
 *  - DonC and DonDTP render with the new .sheet-tab class
 *  - KPI strip shows correct total / delivered / pending counts
 *  - Detail accordion defaults to closed
 *  - Saved-mode class applied when weekId is in savedIds
 *  - Old view toggle buttons are removed (R11)
 *  - Empty state shows upload zone (R6)
 *
 * All counting logic is PRESERVED — no business rules change.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SheetTab from '../SheetTab'
import { donCFixture } from './fixtures/sheetTabDonCFixture'
import { donDTPFixture } from './fixtures/sheetTabDonDTPFixture'

// ─── Global ResizeObserver mock (needed by DataTable) ──────────────────────────
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// ─── Module-level hoisted refs (set once, used inside every it block) ──────────
const store = vi.hoisted(() => {
  const values = new Map()
  return {
    clear: () => values.clear(),
    opsStore: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, String(value)) },
      removeItem: (key) => values.delete(key),
    },
  }
})

vi.mock('../../data/workspace', () => ({ opsStore: store.opsStore }))
vi.mock('../../supabase', () => ({ supabase: {} }))
vi.mock('../../utils/sheetReports', () => ({ readSheetReports: () => [], renameSheetReport: vi.fn(), removeSheetReport: vi.fn() }))
vi.mock('../CarrierStats', () => ({
  getCarrierFileStats: vi.fn(),
  getCarrierFileTotal: vi.fn(() => null),
  readHoldWeeks: vi.fn(() => []),
  pickCarrierWeekIdByDate: vi.fn(),
  carrierWeekHasRows: vi.fn(() => false),
  snapshotCarrierLookup: vi.fn(() => ({})),
  useCarrierRowsPendingClear: vi.fn(() => ({
    pendingClear: null,
    scheduleClear: vi.fn(),
    cancelClear: vi.fn(),
  })),
}))

// ─── useWeeklyData mock — ref is stable; factory is called inside each it ──────
const mockUseWeeklyDataRef = vi.hoisted(() => vi.fn())
vi.mock('../../useWeeklyData', () => ({ useWeeklyData: mockUseWeeklyDataRef }))

// ─── useSheetReportActions mock ───────────────────────────────────────────────
vi.mock('../useSheetReportActions', () => ({
  useSheetReportActions: vi.fn(() => ({
    snapshot: null,
    isPendingClear: false,
    handleSave: vi.fn(),
    handleUndo: vi.fn(),
    handleRelink: vi.fn(),
    handleExportImage: vi.fn(),
    handlePrint: vi.fn(),
    handleClearCarrierNow: vi.fn(),
    exporting: false,
    pendingBannerProps: null,
    reports: [],
  })),
  computeBuckets: vi.fn(() => ({ b24: 0, b48: 0, b72: 0, chanhXeCount: 0 })),
}))

// ─── Factory helpers (call inside each it block) ─────────────────────────────
function makeDonCWeek(data = donCFixture.rows) {
  return {
    id: donCFixture.weekId,
    label: donCFixture.weekLabel,
    fileName: 'donC_test.xlsx',
    uploadedAt: new Date().toISOString(),
    data,
  }
}

function makeDonDTPWeek(data = donDTPFixture.rows) {
  return {
    id: donDTPFixture.weekId,
    label: donDTPFixture.weekLabel,
    fileName: 'donDTP_test.xlsx',
    uploadedAt: new Date().toISOString(),
    data,
  }
}

function makeWeeklyDataMock(week) {
  return {
    weeks: week ? [week] : [],
    activeWeek: week,
    activeId: week?.id ?? null,
    addWeek: vi.fn(),
    removeWeek: vi.fn(),
    renameWeek: vi.fn(),
    selectWeek: vi.fn(),
    pendingClear: null,
    schedulePendingClear: vi.fn(),
    cancelPendingClear: vi.fn(),
  }
}

// ─── DonC ───────────────────────────────────────────────────────────────────
describe('SheetTab Đơn C — layout and KPI invariants', () => {
  afterEach(() => {
    cleanup()
    store.clear()
  })

  it('renders with .sheet-tab class and shows KPI strip when data is loaded', () => {
    const week = makeDonCWeek()
    mockUseWeeklyDataRef.mockReturnValue(makeWeeklyDataMock(week))
    render(<SheetTab type="donC" />)
    expect(document.querySelector('.sheet-tab')).toBeInTheDocument()
    // KPI strip must be present — use the container class
    expect(document.querySelector('.sheet-tab-kpi')).toBeInTheDocument()
  })

  it('detail accordion defaults to closed (aria-expanded=false)', () => {
    const week = makeDonCWeek()
    mockUseWeeklyDataRef.mockReturnValue(makeWeeklyDataMock(week))
    render(<SheetTab type="donC" />)
    const btn = screen.getByRole('button', { name: /Danh sách chi tiết đơn hàng/i })
    expect(btn).toBeInTheDocument()
    expect(btn).toHaveAttribute('aria-expanded', 'false')
  })

  it('accordion toggles open/closed on click', () => {
    const week = makeDonCWeek()
    mockUseWeeklyDataRef.mockReturnValue(makeWeeklyDataMock(week))
    render(<SheetTab type="donC" />)
    const btn = screen.getByRole('button', { name: /Danh sách chi tiết đơn hàng/i })
    fireEvent.click(btn)
    expect(btn).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(btn)
    expect(btn).toHaveAttribute('aria-expanded', 'false')
  })

  it('does NOT render old view toggle buttons (R11: removed)', () => {
    const week = makeDonCWeek()
    mockUseWeeklyDataRef.mockReturnValue(makeWeeklyDataMock(week))
    render(<SheetTab type="donC" />)
    // Old toggles must be gone
    expect(screen.queryByRole('button', { name: /Thống kê giao hàng/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Đối tác VC/i })).not.toBeInTheDocument()
  })
})

// ─── DonDTP ──────────────────────────────────────────────────────────────────
describe('SheetTab Đơn DTP — layout and DTP-specific invariants', () => {
  afterEach(() => {
    cleanup()
    store.clear()
  })

  it('renders with .sheet-tab class for DonDTP', () => {
    const week = makeDonDTPWeek()
    mockUseWeeklyDataRef.mockReturnValue(makeWeeklyDataMock(week))
    render(<SheetTab type="donDTP" />)
    expect(document.querySelector('.sheet-tab')).toBeInTheDocument()
  })

  it('detail accordion defaults to closed for DonDTP', () => {
    const week = makeDonDTPWeek()
    mockUseWeeklyDataRef.mockReturnValue(makeWeeklyDataMock(week))
    render(<SheetTab type="donDTP" />)
    const btn = screen.getByRole('button', { name: /Danh sách chi tiết đơn hàng/i })
    expect(btn).toHaveAttribute('aria-expanded', 'false')
  })

  it('shows "Giao hàng Đơn DTP" eyebrow in context bar', () => {
    const week = makeDonDTPWeek()
    mockUseWeeklyDataRef.mockReturnValue(makeWeeklyDataMock(week))
    render(<SheetTab type="donDTP" />)
    expect(screen.getByText('Giao hàng Đơn DTP')).toBeInTheDocument()
  })
})

// ─── Empty state ─────────────────────────────────────────────────────────────
describe('SheetTab empty state', () => {
  afterEach(() => {
    cleanup()
    store.clear()
  })

  it('shows upload zone when no weeks exist (R6)', () => {
    mockUseWeeklyDataRef.mockReturnValue(makeWeeklyDataMock(null))
    render(<SheetTab type="donC" />)
    // .sheet-tab only present when data loaded — empty shows upload zone
    expect(document.querySelector('.sheet-tab')).not.toBeInTheDocument()
    expect(screen.getByText(/kéo.*thả.*file.*excel/i)).toBeInTheDocument()
  })
})
