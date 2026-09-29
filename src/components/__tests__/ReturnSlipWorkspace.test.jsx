import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import invoiceFixtures from '../../utils/__tests__/fixtures/invoiceLines.json'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ReturnSlipWorkspace from '../ReturnSlipWorkspace'

vi.mock('../../utils/returnSlipPdf', () => ({ extractPdfLines: vi.fn(async () => invoiceFixtures.dtp_1item) }))

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

describe('ReturnSlipWorkspace — nhắc chọn hướng giấy khi in', () => {
  it('không ép hướng giấy (để hộp thoại in hiện mục Layout); nhắc chọn Portrait cho biên bản trả hàng, Landscape cho biên bản xác minh', () => {
    vi.spyOn(window, 'print').mockImplementation(() => {})
    render(<ReturnSlipWorkspace slip={makeSlip()} onChange={() => {}} onBack={() => {}} />)
    expect(screen.getByTestId('print-hint').textContent).toContain('Portrait (dọc)')
    expect(screen.getByTestId('print-hint').textContent).toContain('Pages per sheet')

    fireEvent.click(screen.getByRole('button', { name: 'Biên bản xác minh' }))
    expect(screen.getByTestId('print-hint').textContent).toContain('Landscape (ngang)')

    fireEvent.click(screen.getByTitle(/In trực tiếp/))
    expect(window.print).toHaveBeenCalledTimes(1)
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
    expect(cells[0].className).toContain('text-center') // chữ canh giữa ô
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

describe('ReturnSlipWorkspace — bảng xác minh tình trạng hàng hoá', () => {
  it('cột Số lượng, Quy cách, Tình trạng canh giữa', () => {
    vi.spyOn(window, 'print').mockImplementation(() => {})
    render(<ReturnSlipWorkspace slip={makeSlip()} onChange={() => {}} onBack={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Biên bản xác minh' }))
    const cells = document.querySelectorAll('.rsw-print-root table.rsw-table')[1].querySelectorAll('tbody tr:first-child td')
    const byText = t => [...cells].find(c => c.textContent === t)
    for (const t of ['80', 'Hộp 10 ống', 'Hàng nguyên vẹn']) expect(byText(t).className).toContain('text-center')
  })
})


describe('ReturnSlipWorkspace — đơn nhập tay (không có PDF website)', () => {
  it('chọn mẫu → dựng dữ liệu rỗng, nhập hàng thì tự tính thành tiền, tổng tiền, bằng chữ; thêm/xoá dòng giữ form.items khớp', () => {
    vi.spyOn(window, 'print').mockImplementation(() => {})
    let slip = makeSlip({ pdf: null, khachHang: 'Khách A', lyDo: '', form: null })
    const onChange = (next) => { slip = next }
    const view = render(<ReturnSlipWorkspace slip={slip} onChange={onChange} onBack={() => {}} />)
    const rerender = () => view.rerender(<ReturnSlipWorkspace slip={slip} onChange={onChange} onBack={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: /Nhập tay · Đơn DTP/ }))
    rerender()
    expect(slip.pdf).toMatchObject({ mau: 'UPHARMA', manual: true, benBan: { ten: 'CÔNG TY CỔ PHẦN UPHARMA' }, benMua: { ten: 'Khách A' } })
    expect(slip.stage).toBe('doing')
    expect(slip.form.xmMau).toBe('U')

    fireEvent.change(screen.getByLabelText('Tên hàng dòng 1'), { target: { value: 'Tranfast' } })
    rerender()
    fireEvent.change(screen.getByLabelText('Số lượng dòng 1'), { target: { value: '100' } })
    rerender()
    fireEvent.change(screen.getByLabelText('Đơn giá dòng 1'), { target: { value: '29500' } })
    rerender()
    expect(slip.pdf).toMatchObject({ tongTien: 2950000, bangChu: 'Hai triệu chín trăm năm mươi nghìn đồng./.' })
    expect(slip.pdf.items[0]).toMatchObject({ stt: 1, ten: 'Tranfast', thanhTien: 2950000 })

    fireEvent.click(screen.getByRole('button', { name: /Thêm dòng hàng/ }))
    rerender()
    expect(slip.pdf.items).toHaveLength(2)
    expect(slip.form.items).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Xoá dòng 2' }))
    rerender()
    expect(slip.pdf.items).toHaveLength(1)
    expect(slip.form.items).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Xoá dòng 1' })).toBeDisabled() // luôn còn ít nhất 1 dòng
  })

  it('mẫu nội bộ chỉ nhập bên C (kinh doanh), không có bên mua/bán', () => {
    vi.spyOn(window, 'print').mockImplementation(() => {})
    let slip = makeSlip({ pdf: null, nhanVien: 'Nguyễn Hồng Nhung', form: null })
    render(<ReturnSlipWorkspace slip={slip} onChange={(n) => { slip = n }} onBack={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Nhập tay · Nội bộ/ }))
    expect(slip.pdf).toMatchObject({ mau: 'NOIBO', benMua: null, benBan: null, benC: { daiDien: 'Nguyễn Hồng Nhung' } })
  })
})

describe('ReturnSlipWorkspace — đọc từ hoá đơn PDF (đơn nhập tay)', () => {
  it('đọc hoá đơn Đơn DTP: chọn mẫu UPHARMA, điền hàng, số hoá đơn, ký hiệu, ngày, lô, hạn dùng', async () => {
    vi.spyOn(window, 'print').mockImplementation(() => {})
    let slip = makeSlip({ pdf: null, khachHang: '', form: null })
    const onChange = (next) => { slip = next }
    render(<ReturnSlipWorkspace slip={slip} onChange={onChange} onBack={() => {}} />)
    fireEvent.change(screen.getByLabelText('File hoá đơn PDF'), { target: { files: [new File(['%PDF'], 'hoadon.pdf')] } })
    await waitFor(() => expect(slip.pdf).toBeTruthy())
    expect(slip.pdf).toMatchObject({ mau: 'UPHARMA', manual: true, tongTien: 2520000, benMua: { ten: 'Nguyễn Văn A' }, benBan: { ten: 'CÔNG TY CỔ PHẦN UPHARMA' } })
    expect(slip.pdf.items[0]).toMatchObject({ ten: 'Topi Nebuliser - Hộp 10 ống 5ml', dvt: 'Ống', soLuong: 30, donGia: 84000, soLo: '011125' })
    expect(slip.form).toMatchObject({ soHD: '00581703', kyHieu: '1C26MNT', ngayHD: '2026-08-06', xmMau: 'U', items: [{ soLo: '011125', hanDung: '2028-11-28', quyCach: '' }] })
    expect(slip.khachHang).toBe('Nguyễn Văn A')
    expect(slip.stage).toBe('doing')
  })
})
