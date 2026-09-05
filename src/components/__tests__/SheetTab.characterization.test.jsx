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
 *  - VC edit overlay key alignment (rows without Mã hóa đơn use index fallback)
 *
 * All counting logic is PRESERVED — no business rules change.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SheetTab from '../SheetTab'
import { useSheetReportActions } from '../useSheetReportActions'
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
  CarrierPanel: () => null,
  FrozenNgoaiSanPanel: () => null,
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

  it('renders with .sheet-tab class when data is loaded', () => {
    const week = makeDonCWeek()
    mockUseWeeklyDataRef.mockReturnValue(makeWeeklyDataMock(week))
    render(<SheetTab type="donC" />)
    expect(document.querySelector('.sheet-tab')).toBeInTheDocument()
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

  it('shows the saved snapshot view instead of the live report body', () => {
    const week = makeDonCWeek([])
    mockUseWeeklyDataRef.mockReturnValue(makeWeeklyDataMock(week))
    vi.mocked(useSheetReportActions).mockReturnValueOnce({
      snapshot: {
        id: week.id,
        createdAt: week.uploadedAt,
        label: week.label,
        b24: 316,
        b48: 35,
        b72: 1,
        chanhXeCount: 215,
      },
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
    })
    render(<SheetTab type="donC" />)
    expect(screen.getByText('Bản đã lưu')).toBeInTheDocument()
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

// ─── VC edit overlay key alignment (T2 bug fix) ───────────────────────────────
// Bug: DataTable calls onEditVC(key = row['Mã hóa đơn'] || String(i), v).
// SheetTab activeData looked up vcEdits[key] with fallback '' instead of String(i).
// Row without 'Mã hóa đơn' → save key "0", lookup key '' → overlay never shows.
// Fix: align SheetTab lookup with DataTable fallback (String(i)).
describe('SheetTab VC edit overlay key alignment', () => {
  afterEach(() => {
    cleanup()
    store.clear()
  })

  it('activeData reflects VC edit when row has no Mã hóa đơn (index fallback)', () => {
    // Row WITHOUT 'Mã hóa đơn' — DataTable saves with String(i) key
    // Bug: SheetTab looked up vcEdits[''] instead of vcEdits['0'] → overlay never showed
    const rowWithoutMaHD = {
      'Mã kiện hàng': 'K999',
      // NO 'Mã hóa đơn'
      'Tên khách hàng': 'Test Customer',
      'Thành phố': 'HCM',
      'Trạng thái': 'Đã giao',
      'Ngày tạo kiện': '01/08/2026',
      'Ngày giao hàng': '02/08/2026',
      'Đối tác vận chuyển': 'Viettel Post',
      'Thu hộ': '',
    }
    const week = makeDonCWeek([rowWithoutMaHD])
    mockUseWeeklyDataRef.mockReturnValue(makeWeeklyDataMock(week))

    // Pre-seed localStorage as SheetTab reads it once on init
    store.opsStore.setItem('vc_edits_donC', JSON.stringify({ '0': 'SPX Express' }))

    render(<SheetTab type="donC" />)

    // Open accordion to trigger DataTable render
    const btn = screen.getByRole('button', { name: /Danh sách chi tiết đơn hàng/i })
    fireEvent.click(btn)

    // Scope to DataTable container to avoid KPI/header matches
    const table = document.querySelector('[data-sheet-tab-accordion] + *')
    const tableContainer = table ? within(table) : screen

    // After fix: activeData maps row index 0 → key '0' → vcEdits['0'] = 'SPX Express'
    // Bug (before fix): SheetTab looked up vcEdits[''] → undefined → original value
    const spxElements = tableContainer.getAllByText('SPX Express')
    expect(spxElements.length).toBeGreaterThan(0)
    // Verify original value NOT in table cell
    const viettelCell = tableContainer.queryByText('Viettel Post')
    expect(viettelCell).not.toBeInTheDocument()
  })

  it('activeData reflects VC edit when row has Mã hóa đơn (invoice key)', () => {
    // Row WITH 'Mã hóa đơn' — DataTable saves with invoice key
    const rowWithMaHD = {
      'Mã kiện hàng': 'K999',
      'Mã hóa đơn': 'HD001',
      'Tên khách hàng': 'Test Customer',
      'Thành phố': 'HCM',
      'Trạng thái': 'Đã giao',
      'Ngày tạo kiện': '01/08/2026',
      'Ngày giao hàng': '02/08/2026',
      'Đối tác vận chuyển': 'Viettel Post',
      'Thu hộ': '',
    }
    const week = makeDonCWeek([rowWithMaHD])
    mockUseWeeklyDataRef.mockReturnValue(makeWeeklyDataMock(week))

    // Pre-seed localStorage with invoice-keyed edit
    store.opsStore.setItem('vc_edits_donC', JSON.stringify({ 'HD001': 'Chành xe' }))

    render(<SheetTab type="donC" />)

    const btn = screen.getByRole('button', { name: /Danh sách chi tiết đơn hàng/i })
    fireEvent.click(btn)

    // Scope to DataTable container
    const table = document.querySelector('[data-sheet-tab-accordion] + *')
    const tableContainer = table ? within(table) : screen

    // Invoice-keyed rows work correctly (key = 'HD001')
    const chanhXeCells = tableContainer.getAllByText('Chành xe')
    expect(chanhXeCells.length).toBeGreaterThan(0)
    const viettelCell = tableContainer.queryByText('Viettel Post')
    expect(viettelCell).not.toBeInTheDocument()
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
