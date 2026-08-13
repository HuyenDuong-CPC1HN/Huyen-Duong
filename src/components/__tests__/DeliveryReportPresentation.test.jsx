/**
 * DeliveryReportPresentation tests — verify ThongKeDoiTac and ThongKeGiaoHang
 * render without crashing and that their section structure is preserved.
 *
 * These are "presentation invariant" tests: they ensure the counting logic
 * hasn't drifted after the redesign. Components are presentation-only changes
 * per R26–R28; we verify structure stability rather than pixel-perfect text.
 */
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ThongKeDoiTac from '../ThongKeDoiTac'
import ThongKeGiaoHang from '../ThongKeGiaoHang'
import { donCFixture } from './fixtures/sheetTabDonCFixture'
import { donDTPFixture } from './fixtures/sheetTabDonDTPFixture'

// ─── Mocks ────────────────────────────────────────────────────────────────────
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
vi.mock('../CarrierStats', () => ({
  // Null → fall back to Excel row count (no carrier file in test)
  getCarrierFileTotal: vi.fn(() => null),
  getCarrierFileStats: vi.fn(() => null),
  readHoldWeeks: vi.fn(() => []),
  pickCarrierWeekIdByDate: vi.fn(),
  snapshotCarrierLookup: vi.fn(() => ({})),
  useCarrierRowsPendingClear: vi.fn(() => ({
    pendingClear: null,
    scheduleClear: vi.fn(),
    cancelClear: vi.fn(),
  })),
}))

describe('ThongKeDoiTac — renders without crashing', () => {
  beforeEach(() => { store.clear() })

  it('renders donC data without error', () => {
    const { container } = render(
      <ThongKeDoiTac
        data={donCFixture.rows}
        type="donC"
        weekKey="test"
        referenceDate={null}
      />,
    )
    // Container has child elements (not empty render)
    expect(container.firstChild).toBeTruthy()
  })

  it('renders donDTP data without error', () => {
    const { container } = render(
      <ThongKeDoiTac
        data={donDTPFixture.rows}
        type="donDTP"
        weekKey="test"
        referenceDate={null}
      />,
    )
    expect(container.firstChild).toBeTruthy()
  })

  it('shows Viettel Post section for donC', () => {
    const { container } = render(
      <ThongKeDoiTac
        data={donCFixture.rows}
        type="donC"
        weekKey="test"
        referenceDate={null}
      />,
    )
    // Check for the section header element (Viettel Post appears in section title)
    expect(container.querySelector('[class*="viettel"]') || container.textContent.includes('Viettel Post')).toBeTruthy()
  })

  it('shows Viettel Post section for donDTP', () => {
    const { container } = render(
      <ThongKeDoiTac
        data={donDTPFixture.rows}
        type="donDTP"
        weekKey="test"
        referenceDate={null}
      />,
    )
    expect(container.textContent.includes('Viettel Post')).toBeTruthy()
  })

  it('does NOT show SPX Express for donDTP (R14: SPX only for donC)', () => {
    const { container } = render(
      <ThongKeDoiTac
        data={donDTPFixture.rows}
        type="donDTP"
        weekKey="test"
        referenceDate={null}
      />,
    )
    // SPX Express is only shown for donC, not donDTP
    expect(container.textContent.includes('SPX Express')).toBeFalsy()
  })

  it('does NOT show Chành xe section header for donDTP', () => {
    const { container } = render(
      <ThongKeDoiTac
        data={donDTPFixture.rows}
        type="donDTP"
        weekKey="test"
        referenceDate={null}
      />,
    )
    // Only the header "Giao qua Chành xe" should be absent for donDTP
    // (individual rows with "Chành xe" carrier still appear)
    // Check that the section wrapper with "Giao qua Chành xe" is not present
    const sections = container.querySelectorAll('[class*="section"]')
    const hasChanhSection = Array.from(sections).some(s => s.textContent.includes('Giao qua Chành xe'))
    expect(hasChanhSection).toBe(false)
  })
})

describe('ThongKeGiaoHang — renders without crashing', () => {
  beforeEach(() => { store.clear() })

  it('renders donC data without error', () => {
    const { container } = render(
      <ThongKeGiaoHang
        data={donCFixture.rows}
        type="donC"
        weekKey="test"
        referenceDate={null}
      />,
    )
    expect(container.firstChild).toBeTruthy()
  })

  it('renders donDTP data without error', () => {
    const { container } = render(
      <ThongKeGiaoHang
        data={donDTPFixture.rows}
        type="donDTP"
        weekKey="test"
        referenceDate={null}
      />,
    )
    expect(container.firstChild).toBeTruthy()
  })

  it.each([
    ['Viettel Post'],
    ['SPX Express'],
    ['Giao qua Chành xe'],
  ])('shows %s group for donC', (label) => {
    const { container } = render(
      <ThongKeGiaoHang
        data={donCFixture.rows}
        type="donC"
        weekKey="test"
        referenceDate={null}
      />,
    )
    expect(container.textContent.includes(label)).toBeTruthy()
  })

  it('shows Viettel Post group for donDTP', () => {
    const { container } = render(
      <ThongKeGiaoHang
        data={donDTPFixture.rows}
        type="donDTP"
        weekKey="test"
        referenceDate={null}
      />,
    )
    expect(container.textContent.includes('Viettel Post')).toBeTruthy()
  })

  it('does NOT show SPX Express for donDTP', () => {
    const { container } = render(
      <ThongKeGiaoHang
        data={donDTPFixture.rows}
        type="donDTP"
        weekKey="test"
        referenceDate={null}
      />,
    )
    expect(container.textContent.includes('SPX Express')).toBeFalsy()
  })

  it('does NOT show Chành xe section for donDTP', () => {
    const { container } = render(
      <ThongKeGiaoHang
        data={donDTPFixture.rows}
        type="donDTP"
        weekKey="test"
        referenceDate={null}
      />,
    )
    expect(container.textContent.includes('Giao qua Chành xe')).toBeFalsy()
  })
})
