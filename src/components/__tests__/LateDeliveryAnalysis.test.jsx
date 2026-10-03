import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import LateDeliveryAnalysis from '../LateDeliveryAnalysis'

const spxRows = [
  { 'Mã vận đơn': 'A1', 'Tỉnh gửi': 'Thành phố Hồ Chí Minh', 'Tỉnh nhận': 'Thành phố Hồ Chí Minh' },
  { 'Mã vận đơn': 'A2', 'Tỉnh gửi': 'Thành phố Hồ Chí Minh', 'Tỉnh nhận': 'Tỉnh Gia Lai' },
]
const rows = [
  { maDon: 'ORD1', maVanDon: 'A1', tinhTrangGiao: 'TRỄ HẠN (>48h)', gioGiaoTong: 60, gioDongKien: 1, gioLaySauDongKien: 1 },
  { maDon: 'ORD2', maVanDon: 'A2', tinhTrangGiao: 'TRỄ HẠN (>48h)', gioGiaoTong: 80, gioDongKien: 1, gioLaySauDongKien: 1 },
]

describe('LateDeliveryAnalysis', () => {
  it('mặc định chỉ hiện số tổng hợp, bấm vào ô số mới mở danh sách đơn', () => {
    render(<LateDeliveryAnalysis rows={rows} spxRows={spxRows} />)
    expect(screen.getByText('D) Phân tích đơn giao trễ hạn 48h')).toBeInTheDocument()
    expect(screen.getByText(/2 đơn giao quá 48h\. Trong đó có/)).toBeInTheDocument()
    expect(screen.queryByText('ORD1')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Nội tỉnh \(đơn nội thành HCM\)/ }))
    expect(screen.getByText('ORD1')).toBeInTheDocument()
    expect(screen.queryByText('ORD2')).not.toBeInTheDocument()
    expect(screen.getByText('+12h')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Liên miền, giao trong 96h/ }))
    expect(screen.getByText('ORD2')).toBeInTheDocument()
    expect(screen.getByText('còn 16h')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Thu gọn' }))
    expect(screen.queryByText('ORD2')).not.toBeInTheDocument()
  })
})
