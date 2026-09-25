import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as XLSX from 'xlsx'
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

function seedViettelWeek(carrierKey) {
  const rows = [
    { 'Mã Vận Đơn': 'VTP001', 'Mã đơn hàng': 'DH001', 'Trạng Thái': 'Đang vận chuyển', 'Ngày tạo': '', 'Ngày chuyển trạng thái': '', 'Tên hàng': '', 'Đơn chuyển hoàn': '' },
  ]
  store.opsStore.setItem(`carrier_weeks_${carrierKey}`, JSON.stringify([
    { id: 'w1', fileName: 'vtp.xlsx', uploadedAt: new Date().toISOString(), rows },
  ]))
}

describe('CarrierStats — liveSessionKey: màn hình tuần mới (chưa lưu) không được tự hiện nhầm file SPX của tuần cũ', () => {
  // Bug thật: carrierKey của panel SPX ở tab "Gộp kênh" dùng CHUNG 1 kho cho mọi tuần (không tách theo
  // tuần) — nếu vẫn "khớp theo ngày gần nhất" như các nơi khác, màn hình tuần MỚI (chưa upload file SPX
  // nào) sẽ tự hiện file SPX của TUẦN TRƯỚC (file duy nhất có sẵn) vì đó là file "gần nhất". Người dùng
  // tưởng tuần này đã có file, bấm "X xoá hẳn dữ liệu tuần này" định dọn "file cũ" -> xoá mất luôn dữ liệu
  // SPX của tuần TRƯỚC (kho dùng chung), dù đang đứng ở tab tuần mới.
  it('chưa upload file SPX nào trong phiên làm việc mới -> hiện trống, KHÔNG tự hiện file SPX tuần trước', async () => {
    const carrierKey = 'unifiedTrial_donSO_spx_livetest1'
    const oldUploadedAt = '2026-09-14T08:00:00.000Z' // tuần trước
    store.opsStore.setItem(`carrier_weeks_${carrierKey}`, JSON.stringify([
      { id: 'spx-old', fileName: 'spx-tuan-truoc.xlsx', uploadedAt: oldUploadedAt, rows: [] },
    ]))

    const newRefDate = '2026-09-21T08:00:00.000Z' // ngày upload file Đơn SO của tuần MỚI
    render(<CarrierPanel carrierKey={carrierKey} label="SPX Express" carrierType="spx" referenceDate={newRefDate} liveSessionKey={newRefDate} />)

    await screen.findByText(/kéo & thả file xuất spx express/i)
    expect(screen.queryByText('spx-tuan-truoc.xlsx')).not.toBeInTheDocument()
  })

  it('KHÔNG truyền liveSessionKey (nơi gọi cũ) -> vẫn khớp theo ngày gần nhất như trước (tái hiện đúng bug gốc)', async () => {
    const carrierKey = 'unifiedTrial_donSO_spx_livetest2'
    store.opsStore.setItem(`carrier_weeks_${carrierKey}`, JSON.stringify([
      { id: 'spx-old', fileName: 'spx-tuan-truoc.xlsx', uploadedAt: '2026-09-14T08:00:00.000Z', rows: [] },
    ]))
    render(<CarrierPanel carrierKey={carrierKey} label="SPX Express" carrierType="spx" referenceDate="2026-09-21T08:00:00.000Z" />)
    await screen.findByText('spx-tuan-truoc.xlsx')
  })

  it('đã upload file SPX mới trong phiên -> hiện đúng file mới upload, không còn trống nữa', async () => {
    const carrierKey = 'unifiedTrial_donSO_spx_livetest3'
    const newRefDate = '2026-09-21T08:00:00.000Z'
    render(<CarrierPanel carrierKey={carrierKey} label="SPX Express" carrierType="spx" referenceDate={newRefDate} liveSessionKey={newRefDate} />)
    await screen.findByText(/kéo & thả file xuất spx express/i)

    const aoa = [
      ['Mã vận đơn', 'Thời gian tạo đơn', 'Thời gian lấy hàng/gửi hàng', 'Thời gian giao hàng', 'Trạng thái hiện tại', 'Mã khách hàng'],
      ['SPXB001', '', '', '', 'Đang vận chuyển', 'DH010'],
    ]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
    const file = new File([buf], 'spx-tuan-moi.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })

    const input = document.querySelector('input[type="file"][accept=".xlsx,.xls"]')
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => expect(screen.getByText('spx-tuan-moi.xlsx')).toBeInTheDocument())
  })
})

describe('CarrierStats — upload "Chờ giao Logistics" cho Viettel Post Đơn DTP', () => {
  // carrierKey ở tab "Gộp kênh" có tiền tố "unifiedTrial_" (khác "donDTP_viettel" ở ThongKeGiaoHang/
  // SheetReportPanel) nên không tự suy đoán được là kênh Đơn DTP từ carrierKey — nếu không truyền
  // showLogisticsHold, mục upload "Chờ giao Logistics" biến mất dù đúng là kênh Đơn DTP.
  it('carrierKey không có tiền tố "donDTP" + không truyền showLogisticsHold -> ẩn mất mục "Chờ giao Logistics" (tái hiện bug)', async () => {
    const carrierKey = 'unifiedTrial_donDTP_viettel'
    seedViettelWeek(carrierKey)
    render(<CarrierPanel carrierKey={carrierKey} label="Viettel Post" carrierType="viettel" />)
    await screen.findByText('vtp.xlsx')
    expect(screen.queryByText(/Chờ giao Logistics/i)).not.toBeInTheDocument()
  })

  it('truyền showLogisticsHold=true -> luôn hiện mục "Chờ giao Logistics" dù carrierKey không có tiền tố "donDTP"', async () => {
    const carrierKey = 'unifiedTrial_donDTP_viettel'
    seedViettelWeek(carrierKey)
    render(<CarrierPanel carrierKey={carrierKey} label="Viettel Post" carrierType="viettel" showLogisticsHold />)
    await screen.findByText('vtp.xlsx')
    expect(screen.getByText(/Chưa có file "Chờ giao Logistics"/i)).toBeInTheDocument()
  })

  it('carrierKey đúng tiền tố "donDTP" vẫn hiện mục "Chờ giao Logistics" như cũ khi không truyền showLogisticsHold', async () => {
    const carrierKey = 'donDTP_viettel'
    seedViettelWeek(carrierKey)
    render(<CarrierPanel carrierKey={carrierKey} label="Viettel Post" carrierType="viettel" />)
    await screen.findByText('vtp.xlsx')
    expect(screen.getByText(/Chưa có file "Chờ giao Logistics"/i)).toBeInTheDocument()
  })
})
