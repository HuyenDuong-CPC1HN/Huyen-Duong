import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ReturnSlipWorkspace from '../ReturnSlipWorkspace'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function makeSlip(overrides = {}) {
  return {
    id: 's1', maPhieu: 'DHC250926/01284', donHang: 'DH240926/69551',
    khachHang: 'Công ty TNHH Bệnh Viện Quốc tế City', nhanVien: 'Trương Thanh Thảo', stage: 'doing',
    pdf: {
      mau: 'NOIBO', fileName: 'bbth_qtcity.pdf',
      benC: { daiDien: 'Trương Thanh Thảo', chucVu: 'Nhân viên kinh doanh PS' },
      lyDo: 'Hàng chưa giao cho khách hàng.',
      items: [{ stt: 1, ten: 'Zenace - Hộp 10 ống 10ml', dvt: 'ONG', soLuong: 80, soLo: '010526', donGia: 12600, thanhTien: 1008000 }],
      tongTien: 1008000,
    },
    form: {
      ngayLap: '2026-09-26', mst: '', soHD: '34528', kyHieu: '1C26TSG', ngayHD: '2026-09-24',
      benA: 'Lưu Thị Thuỳ', benAChucVu: 'Kế toán đơn hàng', benB: 'Dương Thị Ngọc Huyền', benBChucVu: 'Thủ kho',
      xmMau: 'C', xmNgay: '2026-09-26', xmGio: '08:30', xmDiaDiem: 'CN.Hồ Chí Minh',
      xmKeToan: 'Lưu Thị Thuỳ', xmTinhTrang: 'Hàng nguyên vẹn', xmKetQua: 'Kiểm tra hàng đúng lô, đúng hạn dùng, đúng số lượng.',
      items: [{ soLo: '010526', hanDung: '2029-05-15', quyCach: 'Hộp 10 ống' }],
    },
    ...overrides,
  }
}

// Nút "In" mới thêm cạnh toggle "Xem trước" — bấm là gọi window.print() ngay, in đúng nội dung đang xem
// (đã render sẵn qua portal thẳng ra <body>, tách khỏi khung "Xem trước" sticky để không bị lệch vị trí
// khi in — xem index.css .rsw-print-root).
describe('ReturnSlipWorkspace — nút "In" khung Xem trước', () => {
  it('chưa có pdf (chưa upload file website) -> không hiện nút In', () => {
    render(<ReturnSlipWorkspace slip={makeSlip({ pdf: null })} onChange={() => {}} onBack={() => {}} />)
    expect(screen.queryByTitle(/In trực tiếp/)).not.toBeInTheDocument()
  })

  it('bấm "In" -> gọi window.print() đúng 1 lần', () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {})
    render(<ReturnSlipWorkspace slip={makeSlip()} onChange={() => {}} onBack={() => {}} />)

    fireEvent.click(screen.getByTitle(/In trực tiếp/))

    expect(printSpy).toHaveBeenCalledTimes(1)
  })

  it('mặc định toggle "Biên bản trả lại hàng" -> nội dung portal in đúng biên bản trả hàng (BÊN A/B/C)', () => {
    vi.spyOn(window, 'print').mockImplementation(() => {})
    render(<ReturnSlipWorkspace slip={makeSlip()} onChange={() => {}} onBack={() => {}} />)

    // Xuất hiện 2 lần: 1 ở khung "Xem trước" hiển thị, 1 ở bản portal ẩn dành riêng cho in.
    expect(screen.getAllByText('BIÊN BẢN TRẢ LẠI HÀNG (NỘI BỘ)').length).toBe(2)
    expect(screen.getAllByText(/BÊN C: Bộ phận Kinh Doanh/).length).toBe(2)
  })

  it('chuyển toggle sang "Biên bản xác minh" -> cả khung xem lẫn bản portal in đều đổi đúng nội dung', () => {
    vi.spyOn(window, 'print').mockImplementation(() => {})
    render(<ReturnSlipWorkspace slip={makeSlip()} onChange={() => {}} onBack={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: 'Biên bản xác minh' }))

    expect(screen.getAllByText('BIÊN BẢN XÁC MINH TÌNH TRẠNG HÀNG HOÁ').length).toBe(2)
    expect(screen.getAllByText('CÔNG TY CỔ PHẦN DƯỢC PHẨM CPC1 HÀ NỘI').length).toBe(2)
    expect(screen.queryByText('BIÊN BẢN TRẢ LẠI HÀNG (NỘI BỘ)')).not.toBeInTheDocument()
  })
})

// Bản in phải giống bản in gốc của website: chữ thường cho ô đã điền (CSS in bỏ tô/gạch chân qua lớp
// rsw-fill), chừa khoảng trống để ký trước tên, dòng "Số tiền bằng chữ" nằm trong bảng hàng hoá.
describe('ReturnSlipWorkspace — cấu trúc bản in', () => {
  it('bản in có đủ lớp móc cho CSS in: ô đã điền, chỗ ký, dòng "Căn cứ" in nghiêng', () => {
    vi.spyOn(window, 'print').mockImplementation(() => {})
    render(<ReturnSlipWorkspace slip={makeSlip()} onChange={() => {}} onBack={() => {}} />)
    const root = document.querySelector('.rsw-print-root')
    expect(root.querySelector('.rsw-paper')).toBeTruthy()
    expect([...root.querySelectorAll('.rsw-fill')].map(e => e.textContent)).toContain('34528')
    expect(root.querySelectorAll('.rsw-sign-gap').length).toBe(3) // 3 bên A/B/C đều có chỗ ký
    expect(root.querySelector('.rsw-it i').textContent).toMatch(/^- Căn cứ vào Nghị định 70\/2025/)
  })

  it('mẫu có bên mua/bán: "Số tiền bằng chữ" nằm trong bảng hàng hoá, không phải đoạn văn riêng', () => {
    vi.spyOn(window, 'print').mockImplementation(() => {})
    const slip = makeSlip()
    slip.pdf = { ...slip.pdf, mau: 'CPC1HN', bangChu: 'Một triệu không trăm linh tám nghìn đồng./.', benMua: { ten: 'Khách A', diaChi: 'HCM', mst: '', daiDien: 'Anh B', chucVu: 'Dược sĩ' }, benBan: { ten: 'Công ty', diaChi: 'HN', mst: '01', daiDien: 'Thu', chucVu: 'GĐ' } }
    render(<ReturnSlipWorkspace slip={slip} onChange={() => {}} onBack={() => {}} />)
    const root = document.querySelector('.rsw-print-root')
    expect(root.querySelector('table.rsw-table').textContent).toContain('Số tiền bằng chữ: Một triệu không trăm linh tám nghìn đồng./.')
  })
})

describe('ReturnSlipWorkspace — hướng giấy khi in', () => {
  it('biên bản trả lại hàng in dọc; biên bản xác minh in ngang (A4 landscape) và gỡ rule sau khi in', () => {
    const sizes = []
    vi.spyOn(window, 'print').mockImplementation(() => { sizes.push(document.querySelector('style[data-print-orientation]')?.textContent ?? null) })
    render(<ReturnSlipWorkspace slip={makeSlip()} onChange={() => {}} onBack={() => {}} />)

    fireEvent.click(screen.getByTitle(/In trực tiếp/))
    fireEvent.click(screen.getByRole('button', { name: 'Biên bản xác minh' }))
    fireEvent.click(screen.getByTitle(/In trực tiếp/))

    expect(sizes[0]).toBeNull()
    expect(sizes[1]).toContain('A4 landscape')
    window.dispatchEvent(new Event('afterprint'))
    expect(document.querySelector('style[data-print-orientation]')).toBeNull()
  })
})

describe('ReturnSlipWorkspace — khung ký duyệt biên bản xác minh', () => {
  it('"Xác nhận của Quản lý chi nhánh/ văn phòng" nằm trong khung (ô của bảng ký duyệt) kèm ô trống để ký, như file Word mẫu', () => {
    vi.spyOn(window, 'print').mockImplementation(() => {})
    render(<ReturnSlipWorkspace slip={makeSlip()} onChange={() => {}} onBack={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Biên bản xác minh' }))

    const table = document.querySelector('.rsw-print-root table.rsw-xm-sign')
    const mgrRow = table.querySelector('tr.rsw-mgr-row')
    const cells = mgrRow.querySelectorAll('td')
    expect(cells).toHaveLength(2)
    expect(cells[0].textContent).toBe('Xác nhận của Quản lý chi nhánh/ văn phòng')
    expect(cells[1].getAttribute('colspan')).toBe('2') // ô ký trống chiếm 2 cột
    expect(cells[1].textContent).toBe('')
  })
})

describe('ReturnSlipWorkspace — logo và mã biểu mẫu của biên bản xác minh', () => {
  it('mẫu C dùng logo CPC1HN, mẫu U (Đơn DTP) dùng logo UPHARMA; có mã biểu mẫu đầu trang như file Word mẫu', () => {
    vi.spyOn(window, 'print').mockImplementation(() => {})
    const { unmount } = render(<ReturnSlipWorkspace slip={makeSlip()} onChange={() => {}} onBack={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Biên bản xác minh' }))
    const root = document.querySelector('.rsw-print-root')
    expect(root.querySelector('img.rsw-logo').getAttribute('src')).toBe('/templates/logo_cpc1hn.png')
    expect(root.querySelector('.rsw-doccode').textContent).toBe('CNQT019-BM02Lần 0105/03/2026') // 3 dòng: mã / lần / ngày
    unmount()

    const slipU = makeSlip()
    slipU.pdf = { ...slipU.pdf, mau: 'UPHARMA' }
    render(<ReturnSlipWorkspace slip={slipU} onChange={() => {}} onBack={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Biên bản xác minh' }))
    expect(document.querySelector('.rsw-print-root img.rsw-logo').getAttribute('src')).toBe('/templates/logo_upharma.png')
  })
})

