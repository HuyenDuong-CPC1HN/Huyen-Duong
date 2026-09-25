import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CarrierPanel } from '../CarrierStats'

const store = vi.hoisted(() => {
  const values = new Map()
  return {
    opsStore: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, String(value)) },
      removeItem: (key) => values.delete(key),
    },
  }
})

vi.mock('../../data/workspace', () => ({ opsStore: store.opsStore }))

afterEach(cleanup)

// Không seed "Danh sách thống kê" (salesWeeks) -> salesLookup rỗng -> MỌI dòng SPX đều thành
// "Không khớp Mã đơn" (đúng nhánh !moc1 trong reconcileNgoaiSan), đủ để test nút lọc mà không cần
// dựng thêm dữ liệu khớp.
function seedSpxWeek(carrierKey) {
  const rows = [
    { 'Mã vận đơn': 'SPXA001', 'Mã khách hàng': 'DH001', 'Trạng thái hiện tại': 'Đang vận chuyển', 'Thời gian tạo đơn': '', 'Thời gian lấy hàng/gửi hàng': '', 'Thời gian giao hàng': '' },
    { 'Mã vận đơn': 'SPXA002', 'Mã khách hàng': 'DH002', 'Trạng thái hiện tại': 'Đã giao hàng', 'Thời gian tạo đơn': '', 'Thời gian lấy hàng/gửi hàng': '', 'Thời gian giao hàng': '' },
  ]
  store.opsStore.setItem(`carrier_weeks_${carrierKey}`, JSON.stringify([
    { id: 'w1', fileName: 'spx.xlsx', uploadedAt: new Date().toISOString(), rows },
  ]))
  // "Chi tiết đối soát" (và badge "chưa tìm thấy Mã đơn") chỉ hiện khi có ít nhất 1 tuần salesWeeks/
  // packingWeeks — rows rỗng để không tạo thêm đơn khớp nào, giữ nguyên cả 2 dòng trên là "Không khớp".
  store.opsStore.setItem(`carrier_salesorderweeks_${carrierKey}`, JSON.stringify([
    { id: 'sw1', fileName: 'sales.xlsx', uploadedAt: new Date().toISOString(), rows: [] },
  ]))
}

describe('CarrierStats — NgoaiSanPanel (SPX): bấm badge "chưa tìm thấy Mã đơn tương ứng" để xem chi tiết', () => {
  it('bấm badge lọc bảng chỉ còn đúng các đơn không khớp, bấm lại để bỏ lọc', async () => {
    const carrierKey = 'spx_test'
    seedSpxWeek(carrierKey)

    render(<CarrierPanel carrierKey={carrierKey} label="SPX Test" carrierType="spx" />)

    const expandButton = await screen.findByRole('button', { name: /chi tiết đối soát/i })
    fireEvent.click(expandButton)

    const khongKhopButton = await screen.findByRole('button', { name: /2 đơn spx chưa tìm thấy mã đơn tương ứng/i })
    fireEvent.click(khongKhopButton)

    await waitFor(() => expect(screen.getByText('DH001')).toBeInTheDocument())
    expect(screen.getByText('DH002')).toBeInTheDocument()
    // Cả 2 dòng hiện trong bảng đều là "Không khớp Mã đơn" — không lẫn dòng nào khác.
    expect(screen.getAllByText('Không khớp Mã đơn').length).toBeGreaterThan(0)

    const activeButton = screen.getByRole('button', { name: /đang chỉ hiện đơn chưa tìm thấy mã đơn tương ứng/i })
    fireEvent.click(activeButton)
    await waitFor(() => expect(screen.queryByRole('button', { name: /đang chỉ hiện đơn chưa tìm thấy/i })).not.toBeInTheDocument())
  })
})
