import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Package } from 'lucide-react'
import { KpiTile, StatCard, SectionCard } from '../ReportCards'

describe('ReportCards — số trống không làm sập trang', () => {
  it('value null / undefined / NaN hiện "—", số thật vẫn định dạng vi-VN', () => {
    render(<>
      <KpiTile icon={Package} value={null} label="Tổng đơn" sub={[{ label: 'VTP', value: undefined, pct: 0 }]} />
      <StatCard icon={Package} value={Number.NaN} label="≤ 24 giờ" />
      <SectionCard title="Giao hàng trực tiếp" total={null}><p>x</p></SectionCard>
      <KpiTile icon={Package} value={1234} label="Số thật" />
    </>)
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3)
    expect(screen.getByText('1.234')).toBeInTheDocument()
  })
})
