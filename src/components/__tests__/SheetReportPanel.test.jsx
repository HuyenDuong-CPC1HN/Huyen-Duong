import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import SheetReportPanel from '../SheetReportPanel'

const snapshot = {
  id: 'donC_week_1',
  createdAt: '2026-08-09T00:00:00.000Z',
  label: 'Đơn C - Tuần 1.8',
  b24: 316,
  b48: 35,
  b72: 1,
  chanhXeCount: 215,
  viettelWeekId: 'viettel_week_1',
  spxWeekId: 'spx_week_1',
  viettelFrozen: {
    total: 20,
    stats: { '24h': 1, '48h': 8, '72h': 2, dangVanChuyen: 8, choLay: 0, giaoLai: 0, hoanHang: 1 },
  },
  spxFrozen: {
    total: 833,
    stats: { '24h': 56, '48h': 289, '72h': 195, dangVanChuyen: 157, choLay: 38, giaoLai: 88, hoanHang: 10 },
  },
}

describe('saved Đơn C report presentation', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('sheet_reports_donC', JSON.stringify([snapshot]))
    localStorage.setItem('chuagiao_kh_donC_tructIep_donC_week_1', JSON.stringify({ bv: 16, nt: 3 }))
    localStorage.setItem('chuagiao_override_donC_chanhXe_donC_week_1_chuagui', '11')
  })

  it('preserves business totals and exposes report sections as disclosures', () => {
    render(
      <SheetReportPanel
        type="donC"
        data={[]}
        weekId="donC_week_1"
        weekLabel="Đơn C - Tuần 1.8"
      />,
    )

    expect(screen.getByText('1.450')).toBeInTheDocument()
    expect(screen.getByText('371')).toBeInTheDocument()
    expect(screen.getByText('226')).toBeInTheDocument()
    expect(screen.getByText('853')).toBeInTheDocument()

    const directDelivery = screen.getByRole('button', { name: /Giao hàng trực tiếp.*371 đơn/i })
    expect(directDelivery).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(directDelivery)
    expect(directDelivery).toHaveAttribute('aria-expanded', 'false')
  })
})
