import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import {
  buildReceiptFromFiles,
  calcChenhLech,
  detectPhieuXuatKhoWarehouse,
  enrichRowsFromPdfCatalog,
  joinPdfTextItems,
  mergeActualScanRows,
  mergeSupplementRows,
  mergeWarehouseRows,
  parsePdfDeliveryNote,
  parsePdfItems,
  reconcileActualVsInvoice,
  readActualScanRows,
  readWarehouseExportRows,
  recheckKienTotal,
  splitSoRows,
} from '../parseGoodsReceipt'

function makeWorkbook(rows) {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Sheet1')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
}

describe('parseGoodsReceipt', () => {
  it('merges same maHang + soLo and keeps different lots separate', () => {
    const merged = mergeWarehouseRows([
      { maHang: 'A001', soLo: 'L1', slHoaDon: 10, kienNguyen: 2, kienLe: 1 },
      { maHang: 'A001', soLo: 'L1', slHoaDon: 5, kienNguyen: 1, kienLe: 0 },
      { maHang: 'A001', soLo: 'L2', slHoaDon: 3, kienNguyen: 1, kienLe: 0 },
    ])
    expect(merged).toHaveLength(2)
    expect(merged.find(r => r.soLo === 'L1')).toMatchObject({ slHoaDon: 15, kienNguyen: 3, kienLe: 1 })
    expect(merged.find(r => r.soLo === 'L2')).toMatchObject({ slHoaDon: 3 })
  })

  it('mergeSupplementRows: cộng dồn dòng trùng Mã hàng+Số lô, giữ nguyên Ghi chú/SL TT đã sửa tay, thêm dòng mới hoàn toàn vào cuối', () => {
    const existing = [
      { rowId: 'r1', maHang: 'A001', soLo: 'L1', tenHang: 'Thuốc A', dvt: 'ONG', slHoaDon: 10, kienNguyen: 2, kienLe: 0, slThucTe: 10, ghiChu: 'Đã kiểm đủ', needsManual: false },
      { rowId: 'r2', maHang: 'B002', soLo: 'L2', tenHang: 'Thuốc B', dvt: 'VIEN', slHoaDon: 5, kienNguyen: 1, kienLe: 0, slThucTe: null, ghiChu: '', needsManual: false },
    ]
    const supplement = [
      { maHang: 'A001', soLo: 'L1', tenHang: 'Thuốc A', dvt: 'ONG', slHoaDon: 4, kienNguyen: 1, kienLe: 0 },
      { maHang: 'C003', soLo: 'L3', tenHang: 'Thuốc C', dvt: 'LO', slHoaDon: 6, kienNguyen: 1, kienLe: 1 },
    ]
    const merged = mergeSupplementRows(existing, supplement)
    expect(merged).toHaveLength(3)
    // Dòng trùng key A001/L1: cộng dồn số lượng/kiện, KHÔNG đụng vào rowId/Ghi chú/SL TT đã có.
    expect(merged.find(r => r.maHang === 'A001')).toMatchObject({
      rowId: 'r1', slHoaDon: 14, kienNguyen: 3, ghiChu: 'Đã kiểm đủ', slThucTe: 10,
    })
    // Dòng không trùng (B002) giữ nguyên y hệt.
    expect(merged.find(r => r.maHang === 'B002')).toMatchObject(existing[1])
    // Dòng hoàn toàn mới (C003) được thêm vào cuối.
    expect(merged.find(r => r.maHang === 'C003')).toMatchObject({ slHoaDon: 6, kienNguyen: 1, kienLe: 1 })
    // existingRows gốc không bị mutate.
    expect(existing[0].slHoaDon).toBe(10)
  })

  // Dữ liệu item mô phỏng lấy TRỰC TIẾP từ getTextContent() thật của 1 file "Giao nhận - DTP.pdf" người
  // dùng gửi — tên hàng "Sữa tắm gội..." bị vỡ chữ do dấu tiếng Việt (mỗi ký tự 1 item sát nhau) và Số lô
  // "202602/DTP-HTC" bị ngắt dòng giữa chừng vì cột quá hẹp, trước đây .join(' ') làm sai cả 2.
  function fakeItem(str, x, width, hasEOL = false) {
    return { str, transform: [1, 0, 0, 1, x, 0], width, hasEOL }
  }

  it('joinPdfTextItems: KHÔNG chèn khoảng trắng giữa các item chữ dính sát nhau (dấu tiếng Việt bị pdf.js tách vụn)', () => {
    // "Sữa tắm" rồi xuống dòng "gội" (Tên hàng bị wrap trong ô hẹp) — mỗi ký tự có dấu là 1 item riêng,
    // x liền kề TUYỆT ĐỐI (không có khoảng trống thật) nên không được chèn cách; ranh giới dòng (hasEOL)
    // vẫn cần 1 khoảng trắng để "tắm" và "gội" không dính liền thành 1 từ.
    const items = [
      fakeItem('S', 133.50, 6.67), fakeItem('ữ', 140.17, 6.74), fakeItem('a t', 146.91, 11.66),
      fakeItem('ắ', 158.57, 5.33), fakeItem('m', 163.90, 9.33, true),
      fakeItem('g', 133.50, 6.00), fakeItem('ộ', 139.50, 6.00), fakeItem('i', 145.50, 3.33, true),
    ]
    expect(joinPdfTextItems(items)).toBe('Sữa tắm gội')
  })

  it('joinPdfTextItems: giá trị bị ngắt dòng giữa chừng (kết thúc bằng "-" áp sát chữ) nối liền KHÔNG cách, dấu "-" ngăn cách (có cách trước đó) vẫn giữ cách', () => {
    const soLoWrap = [fakeItem('202602/DTP-', 204.73, 66.00, true), fakeItem('HTC', 225.73, 24.00)]
    expect(joinPdfTextItems(soLoWrap)).toBe('202602/DTP-HTC')

    const tenHangWithDash = [fakeItem('Zentokid -', 133.50, 50.32, true), fakeItem('Lọ 500ml', 133.50, 47.00)]
    expect(joinPdfTextItems(tenHangWithDash)).toBe('Zentokid - Lọ 500ml')
  })

  it('joinPdfTextItems: vẫn chèn khoảng trắng bình thường khi 2 item cách nhau thật (vd giữa STT và Mã hàng)', () => {
    const items = [fakeItem('16', 46.50, 12.00), fakeItem('S10693', 82.16, 36.67)]
    expect(joinPdfTextItems(items)).toBe('16 S10693')
  })

  it('reads warehouse export columns (Mã, Lượng cần, Số kiện cần)', () => {
    const buffer = makeWorkbook([
      {
        Mã: 'A01259',
        Tên: 'Thuốc A',
        'Số lô đề nghị': 'LOT1',
        'Hạn dùng': '2028-04-23',
        'Lượng cần': 20,
        'Số kiện cần': 2,
        'Số hộp cần': 1,
        ĐVT: 'VIEN',
      },
    ])
    const rows = readWarehouseExportRows(buffer)
    expect(rows[0]).toMatchObject({
      maHang: 'A01259',
      slHoaDon: 20,
      kienNguyen: 2,
      kienLe: 1,
      hanDung: '2028-04-23',
    })
  })

  it('header có CẢ "Lượng cần" lẫn "Đã lấy" (file thực tế mã A01338): ưu tiên "Lượng cần" làm SL HĐ, không để cột đứng sau ("Đã lấy" — số thực lấy tại kho nguồn, có thể lệch khi lấy thiếu/dư) đè mất', () => {
    const buffer = makeWorkbook([
      {
        TT: 1, Mã: 'A01338', Tên: 'Afenemi', 'Số lô đề nghị': '28826G01', 'Hạn dùng': '2029-06-30',
        'Lượng cần': 25200, ĐVT: 'ONG', 'Quy cách kiện': 126, 'Quy cách hộp': 20,
        'Số kiện cần': 10, 'Số hộp cần': 0, 'Đã lấy': 27720,
      },
    ])
    const rows = readWarehouseExportRows(buffer)
    expect(rows[0]).toMatchObject({ slHoaDon: 25200, kienNguyen: 10 })
  })

  it('header có cả "Lượng cần" lẫn "Đã lấy": dòng CHƯA thực xuất (Đã lấy=0, Số kiện/hộp cần=0) vẫn bị lọc bỏ dù "Lượng cần" > 0 — ưu tiên "Lượng cần" làm SL HĐ không được kéo theo việc hiện lại các dòng chưa xuất được (lô ghi "Chưa đc xuất"/"KL"/để trống) mà trước đây đã bị lọc đúng vì Đã lấy=0', () => {
    const buffer = makeWorkbook([
      {
        TT: 1, Mã: 'A01497', Tên: 'Thuốc chưa xuất', 'Số lô đề nghị': 'Chưa đc xuất', 'Hạn dùng': '',
        'Lượng cần': 30, ĐVT: 'HOP', 'Quy cách kiện': 0, 'Quy cách hộp': 0,
        'Số kiện cần': 0, 'Số hộp cần': 0, 'Đã lấy': 0,
      },
      {
        TT: 2, Mã: 'N00845', Tên: 'Thuốc đã xuất đủ kiện nhưng Đã lấy ghi 0', 'Số lô đề nghị': '18726H01', 'Hạn dùng': '2027-01-01',
        'Lượng cần': 5000, ĐVT: 'HOP', 'Quy cách kiện': 24, 'Quy cách hộp': 50,
        'Số kiện cần': 4, 'Số hộp cần': 4, 'Đã lấy': 0,
      },
    ])
    const rows = readWarehouseExportRows(buffer)
    expect(rows.find(r => r.maHang === 'A01497')).toBeUndefined()
    expect(rows.find(r => r.maHang === 'N00845')).toMatchObject({ slHoaDon: 5000, kienNguyen: 4, kienLe: 1 })
  })

  it('"Số hộp cần" là số hộp lẻ, không phải số kiện — dù bao nhiêu hộp cũng chỉ tính thành 1 kiện lẻ', () => {
    const buffer = makeWorkbook([
      { Mã: 'G00898', Tên: 'Guacanyl', 'Số lô đề nghị': 'LOT1', 'Lượng cần': 3200, 'Số kiện cần': 2, 'Số hộp cần': 18, ĐVT: 'HOP' },
      { Mã: 'P01818', Tên: 'Pilo Drop', 'Số lô đề nghị': 'LOT2', 'Lượng cần': 200, 'Số kiện cần': 0, 'Số hộp cần': 200, ĐVT: 'HOP' },
    ])
    const rows = readWarehouseExportRows(buffer)
    expect(rows[0]).toMatchObject({ kienNguyen: 2, kienLe: 1 })
    expect(rows[1]).toMatchObject({ kienNguyen: 0, kienLe: 1 })
  })

  it('ghi chú lại số hộp lẻ gốc vào Ghi chú ("Kiện lẻ: X hộp") dù cột Kiện lẻ đã ép về 0/1', () => {
    const buffer = makeWorkbook([
      { Mã: 'G00898', Tên: 'Guacanyl', 'Số lô đề nghị': 'LOT1', 'Lượng cần': 3200, 'Số kiện cần': 2, 'Số hộp cần': 18, ĐVT: 'HOP' },
    ])
    const rows = mergeWarehouseRows(readWarehouseExportRows(buffer))
    expect(rows[0]).toMatchObject({ kienLe: 1, ghiChu: 'Kiện lẻ: 18 hộp' })
  })

  it('cộng dồn số hộp lẻ khi gộp nhiều dòng cùng mã hàng + số lô', () => {
    const buffer = makeWorkbook([
      { Mã: 'G00898', Tên: 'Guacanyl', 'Số lô đề nghị': 'LOT1', 'Lượng cần': 3200, 'Số kiện cần': 2, 'Số hộp cần': 18, ĐVT: 'HOP' },
      { Mã: 'G00898', Tên: 'Guacanyl', 'Số lô đề nghị': 'LOT1', 'Lượng cần': 1600, 'Số kiện cần': 1, 'Số hộp cần': 5, ĐVT: 'HOP' },
    ])
    const rows = mergeWarehouseRows(readWarehouseExportRows(buffer))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kienLe: 2, ghiChu: 'Kiện lẻ: 23 hộp' })
  })

  it('không để ghi chú "Kiện lẻ: X hộp" chặn mất cảnh báo lệch SL — nối thêm chứ không đè', () => {
    const rows = enrichRowsFromPdfCatalog(
      [{ maHang: 'H05005', soLo: '010826', slHoaDon: 1000, kienNguyen: 1, kienLe: 1, ghiChu: 'Kiện lẻ: 18 hộp' }],
      [{ maHang: 'H05005', soLo: '010826', soLuong: 1440, kienNguyen: 1, kienLe: 0, source: 'bienBanGiaoNhan' }],
    )
    expect(rows[0].ghiChu).toContain('Kiện lẻ: 18 hộp')
    expect(rows[0].ghiChu).toContain('Lệch SL')
  })

  it('parses pdf delivery note rows by stt + product code', () => {
    const pdfText = '3 F00507 Falgankid - Hộp 4 vỉ x 5 ống 10ml 010526 0 20 26400 44 A01259 Aricamun - 2 vỉ x 15 viên 010426 0 1 7920'
    const rows = parsePdfDeliveryNote(pdfText)
    expect(rows).toHaveLength(2)
    expect(rows[1]).toMatchObject({ maHang: 'A01259', soLo: '010426', kienNguyen: 1, tongSl: 7920 })
  })

  it('parses real "Phiếu xuất kho" PDF layout (Tên trước Mã, số lượng có dấu phẩy/chấm)', () => {
    const pdfText = 'Địa điểm: DH030926/03507_Dự trù SO Kho C - Chi nhánh HCM - 0903114623 '
      + 'Stt   Mã vật tư   Tên vật tư   Đvt   Số lượng   Hạn dùng Lô Nước SX   Vị trí  A   B C   D   2   3   5 1   4 '
      + '1   Arica Folicus Cream - Hộp 1 tuýp 30g A01840   TUBE   272,000 DTP-VNM   612   21/06/2029 '
      + '2   Hexami Cap - Lọ 60 viên H05005   VIEN   1.440,000 DTP-VNM   010826   31/07/2029'
    const rows = parsePdfItems(pdfText)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ maHang: 'A01840', tenHang: 'Arica Folicus Cream - Hộp 1 tuýp 30g', dvt: 'TUBE', soLuong: 272, soLo: '612', hanDung: '2029-06-21' })
    expect(rows[1]).toMatchObject({ maHang: 'H05005', soLuong: 1440, hanDung: '2029-07-31' })
  })

  it('KHÔNG match nhầm 1 PDF khác (vd biên bản giao nhận) thành "Phiếu xuất kho" chỉ vì bảng có hình dạng tương tự — thiếu "Vị trí" (cột bắt buộc của đúng mẫu 02-VT) thì không match', () => {
    // Y hệt fixture "Phiếu xuất kho" hợp lệ ở trên nhưng CỐ TÌNH bỏ "Vị trí" khỏi dòng tiêu đề — trước đây
    // bug thật: thiếu "Vị trí" thì compact.split(/Vị trí/i).pop() trả nguyên văn bản, regex vẫn chạy trên
    // toàn văn bản và match nhầm, khiến 1 file "biên bản giao nhận - DTP" bị coi là phiếu xuất kho (mất
    // Kiện nguyên/Kiện lẻ, tên hàng vỡ vụn do regex không đúng mẫu thật của file đó).
    const pdfText = 'Địa điểm: DH030926/03507_Dự trù SO Kho C - Chi nhánh HCM - 0903114623 '
      + 'Stt   Mã vật tư   Tên vật tư   Đvt   Số lượng   Hạn dùng Lô Nước SX '
      + '1   Arica Folicus Cream - Hộp 1 tuýp 30g A01840   TUBE   272,000 DTP-VNM   612   21/06/2029'
    const rows = parsePdfItems(pdfText)
    expect(rows.every(r => r.source !== 'phieuXuatKho')).toBe(true)
  })

  it('mặt hàng KHÔNG có Hạn dùng (vd quà tặng/khuyến mãi kèm theo, không phải thuốc) trong "Phiếu xuất kho" không bị cuốn dính vào Tên hàng của dòng liền sau', () => {
    // Dữ liệu thật từ 1 file "Phiếu xuất kho" người dùng gửi — dòng 2 "Quạt cầm tay mini..." (mã Q00008)
    // là hàng khuyến mãi không có Hạn dùng, trước đây bị cuốn dính vào Tên hàng của dòng 3 (mã S10693,
    // Sữa tắm gội) vì regex chính chỉ coi 1 dòng là "xong" khi tìm được ngày Hạn dùng hợp lệ ở cuối.
    const pdfText = 'Địa điểm: Chi nhánh HCM - Kho DTP LGT '
      + 'Stt   Mã vật tư   Tên vật tư   Đvt   Số lượng   Hạn dùng Lô Nước SX   Vị trí  A   B C   D   2   3   5 1   4 '
      + '1   pH Balance Protect Intimate Gel - Hộp 1 lọ 200ml (MP) P01879   LO   40,000 DTP-VNM   020526   17/05/2029 '
      + '2   Quạt cầm tay mini gấp gọn - Laforin Q00008   CAI   59,000   Lô 202602.DT P-HTC ngày nhập 08/09/2026 08/09/2026 '
      + '3   Sưa tăm gội Zentokid - Lọ 500ml S10693   LO   21,000 DTP-VNM   010826   16/08/2029'
    const rows = parsePdfItems(pdfText)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({ maHang: 'P01879', soLuong: 40, hanDung: '2029-05-17' })
    // Dòng bị thiếu Hạn dùng vẫn tách được thành 1 dòng riêng — Đvt/Số lượng đọc đúng, Số lô/Hạn dùng để
    // trống (không có nguồn đáng tin cậy để tách phần "Lô 202602.DT P-HTC ngày nhập..." rất phi chuẩn).
    expect(rows[1]).toMatchObject({ maHang: 'Q00008', tenHang: 'Quạt cầm tay mini gấp gọn - Laforin', dvt: 'CAI', soLuong: 59, hanDung: null })
    // Quan trọng nhất: Tên hàng dòng liền sau PHẢI sạch, không dính chữ của dòng Quạt phía trước.
    expect(rows[2]).toMatchObject({ maHang: 'S10693', tenHang: 'Sưa tăm gội Zentokid - Lọ 500ml', soLuong: 21, hanDung: '2029-08-16' })
  })

  it('detects target warehouse from Phiếu xuất kho "Địa điểm" line', () => {
    expect(detectPhieuXuatKhoWarehouse('...Địa điểm: DH030926/03507_Dự trù SO Kho C - Chi nhánh HCM...')).toBe('C')
    expect(detectPhieuXuatKhoWarehouse('...Địa điểm: DH030926/03506_Chi nhánh HCM - Kho DTP LGT...')).toBe('LGT')
    expect(detectPhieuXuatKhoWarehouse('không có thông tin kho')).toBeNull()
  })

  it('fills missing hạn dùng/dvt from pdf catalog and flags quantity mismatch in ghi chú', () => {
    const rows = enrichRowsFromPdfCatalog(
      [{ maHang: 'A01840', soLo: '612', slHoaDon: 300, dvt: '', hanDung: null }],
      [{ maHang: 'A01840', soLo: '612', tenHang: 'Arica', dvt: 'TUBE', hanDung: '2029-06-21', soLuong: 272 }],
    )
    expect(rows[0]).toMatchObject({ dvt: 'TUBE', hanDung: '2029-06-21' })
    expect(rows[0].ghiChu).toContain('272')
    expect(rows[0].ghiChu).toContain('300')
  })

  it('merges multiple excel files (already-parsed rows) per warehouse into one table', () => {
    const excelC1 = makeWorkbook([{ Mã: 'A01259', Tên: 'A', 'Số lô đề nghị': '010426', 'Lượng cần': 7920, 'Số kiện cần': 1, ĐVT: 'VIEN' }])
    const excelC2 = makeWorkbook([{ Mã: 'A01259', Tên: 'A', 'Số lô đề nghị': '010426', 'Lượng cần': 80, 'Số kiện cần': 0, ĐVT: 'VIEN' }])
    const rowsC1 = readWarehouseExportRows(excelC1)
    const rowsC2 = readWarehouseExportRows(excelC2)
    const { khoC, khoLgt } = buildReceiptFromFiles({ khoCRows: [...rowsC1, ...rowsC2], khoLgtRows: rowsC1 })
    expect(khoC).toHaveLength(1)
    expect(khoC[0].slHoaDon).toBe(8000)
    expect(khoLgt).toHaveLength(1)
    expect(khoLgt[0].maHang).toBe('A01259')
  })

  it('skips rows whose Số lô is "Hết" — item was never actually fulfilled', () => {
    const buffer = makeWorkbook([
      { Mã: 'A01259', Tên: 'A', 'Số lô đề nghị': 'LOT1', 'Lượng cần': 20, ĐVT: 'VIEN' },
      { Mã: 'A01497', Tên: 'B', 'Số lô đề nghị': 'Hết', 'Lượng cần': 30, ĐVT: 'LO' },
      { Mã: 'B01418', Tên: 'C', 'Số lô đề nghị': 'ko lấy', 'Lượng cần': 1440, ĐVT: 'ONG' },
    ])
    const rows = readWarehouseExportRows(buffer)
    expect(rows).toHaveLength(1)
    expect(rows[0].maHang).toBe('A01259')
  })

  it('routes "Phiếu xuất kho" rows by their OWN "Lý do xuất kho" content — not by which vùng the file was dropped in', () => {
    // Bug thật (2 lần): (1) trước đây pdfTexts của cả 2 kho bị gộp chung nên hàng "chỉ thấy trong PDF"
    // luôn mặc định về Kho C; (2) sau đó sửa theo VÙNG thả file — vẫn sai, vì bản chất 1 phiếu xuất kho
    // (từ nhà máy DTP) TỰ quyết định đích đến qua "Lý do xuất kho", không phụ thuộc người dùng thả vào
    // vùng nào. Test này cố tình đặt CẢ 2 phiếu vào chung 1 mảng pdfTexts (mô phỏng: không còn khái niệm
    // "vùng" cho loại PDF này nữa) để xác nhận code tự tách đúng theo nội dung.
    const pdfKhoC = 'Địa điểm: Kho C '
      + 'Stt   Mã vật tư   Tên vật tư   Đvt   Số lượng   Hạn dùng Lô Nước SX   Vị trí  A   B C   D   2   3   5 1   4 '
      + '1   Arica Folicus Cream - Hộp 1 tuýp 30g A01840   TUBE   272,000 DTP-VNM   612   21/06/2029'
    const pdfKhoLgt = 'Địa điểm: Kho DTP LGT '
      + 'Stt   Mã vật tư   Tên vật tư   Đvt   Số lượng   Hạn dùng Lô Nước SX   Vị trí  A   B C   D   2   3   5 1   4 '
      + '1   Hexami Cap - Lọ 60 viên H05005   VIEN   1.440,000 DTP-VNM   010826   31/07/2029'
    const { khoC, khoLgt } = buildReceiptFromFiles({ khoCRows: [], khoLgtRows: [], pdfTexts: [pdfKhoC, pdfKhoLgt] })
    expect(khoC).toHaveLength(1)
    expect(khoC[0]).toMatchObject({ maHang: 'A01840', slHoaDon: 272, ghiChu: '' })
    expect(khoLgt).toHaveLength(1)
    expect(khoLgt[0]).toMatchObject({ maHang: 'H05005', slHoaDon: 1440, ghiChu: '' })
  })

  it('falls back to Kho C + cảnh báo when a "Phiếu xuất kho" PDF has no readable "Lý do xuất kho" line', () => {
    const pdfNoLocation = 'Stt   Mã vật tư   Tên vật tư   Đvt   Số lượng   Hạn dùng Lô Nước SX   Vị trí  A   B C   D   2   3   5 1   4 '
      + '1   Arica Folicus Cream - Hộp 1 tuýp 30g A01840   TUBE   272,000 DTP-VNM   612   21/06/2029'
    const { khoC, khoLgt, warnings } = buildReceiptFromFiles({ khoCRows: [], khoLgtRows: [], pdfTexts: [pdfNoLocation] })
    expect(khoC).toHaveLength(1)
    expect(khoLgt).toHaveLength(0)
    expect(warnings.some(w => w.includes('Lý do xuất kho'))).toBe(true)
  })

  it('calculates chenh lech from actual minus invoice quantity', () => {
    expect(calcChenhLech({ slHoaDon: 10, slThucTe: 12 })).toBe(2)
    expect(calcChenhLech({ slHoaDon: 10, slThucTe: null })).toBeNull()
  })

  it('marks rows needing manual expiry when pdf catalog has no match', () => {
    const rows = enrichRowsFromPdfCatalog([
      { maHang: 'X999', soLo: 'L1', hanDung: null },
    ], [])
    expect(rows[0].needsManual).toBe(true)
  })

  it('parses "biên bản giao nhận" rows even when a trailing Ghi chú follows Tổng SL', () => {
    // Dòng thật có Ghi chú (vd "20h thùng số 2") — trước đây bị coi 3 token cuối (thùng/số/2) là
    // Kiện lẻ/Kiện nguyên/Tổng SL nên rớt hẳn, không parse được.
    const pdfText = '8 K00675 Ketorolac-BFS - Hộp 10 lọ 2ml 010126GMP 1 0 200 20h thùng số 2 '
      + '9 L01021 Liproin - Hộp 1 tuýp 5g 1 15 0 3 2100'
    const rows = parsePdfDeliveryNote(pdfText)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ maHang: 'K00675', soLo: '010126GMP', kienLe: 1, kienNguyen: 0, tongSl: 200 })
  })

  it('never auto-fills "SL thực tế" (chỉ người dùng tự kiểm hàng điền tay) — biên bản giao nhận chỉ đối chiếu ngầm qua ghi chú khi lệch', () => {
    const viaBienBan = enrichRowsFromPdfCatalog(
      [{ maHang: 'F00464', soLo: '080326', slHoaDon: 300, slThucTe: null, ghiChu: '' }],
      [{ maHang: 'F00464', soLo: '080326', soLuong: 5760, source: 'bienBanGiaoNhan' }],
    )
    expect(viaBienBan[0].slThucTe).toBeNull()
    expect(viaBienBan[0].ghiChu).toContain('Lệch SL so biên bản giao nhận')

    const viaPhieuXuatKho = enrichRowsFromPdfCatalog(
      [{ maHang: 'F00464', soLo: '080326', slHoaDon: 300, slThucTe: null }],
      [{ maHang: 'F00464', soLo: '080326', soLuong: 272, source: 'phieuXuatKho' }],
    )
    expect(viaPhieuXuatKho[0].slThucTe).toBeNull()
    expect(viaPhieuXuatKho[0].ghiChu).toContain('Lệch SL so PDF phiếu xuất kho')
  })

  it('điền Kiện nguyên/Kiện lẻ từ biên bản giao nhận khi dòng chưa có số kiện thật (0/0, chỉ có nguồn Phiếu xuất kho)', () => {
    const rows = enrichRowsFromPdfCatalog(
      [{ maHang: 'H05005', soLo: '010826', slHoaDon: 1440, kienNguyen: 0, kienLe: 0, slThucTe: null, ghiChu: '' }],
      [{ maHang: 'H05005', soLo: '010826', soLuong: 1440, kienNguyen: 1, kienLe: 0, source: 'bienBanGiaoNhan' }],
    )
    expect(rows[0]).toMatchObject({ kienNguyen: 1, kienLe: 0, slThucTe: null })
  })

  it('warns when tổng kiện khai trong biên bản giao nhận lệch với tổng đã tách trong bảng', () => {
    const pdfText = '1 A01259 Arica - Hộp 1 tuýp 30g 612 0 1 272 Tổng cả đơn 33 Kiện'
    const excelC = makeWorkbook([{ Mã: 'A01259', Tên: 'A', 'Số lô đề nghị': '612', 'Lượng cần': 272, 'Số kiện cần': 1, ĐVT: 'TUYP' }])
    const { warnings } = buildReceiptFromFiles({ khoCRows: readWarehouseExportRows(excelC), khoLgtRows: [], pdfTexts: [pdfText] })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('khai tổng 33 kiện')
    expect(warnings[0]).toContain('tách được 1 kiện')
  })

  it('nhiều biên bản giao nhận cùng chuyến (file tổng + file riêng gửi kho khác): lấy số LỚN NHẤT, không cộng dồn kẻo đếm trùng', () => {
    // File tổng (CPC1HN) đã gộp sẵn phần gửi DTP vào dòng không mã hàng ("HÀNG GỬI DTP") -> tổng 423 kiện
    // đã bao gồm cả phần đó. File riêng của DTP (31 kiện) chỉ là xác nhận LẠI đúng phần đã gộp đó, không
    // phải hàng thêm — cộng dồn (423+31=454) sẽ đếm trùng, đúng như lỗi thực tế người dùng gặp phải.
    const pdfTongCPC1HN = '1 A01259 Arica - Hộp 1 tuýp 30g 612 0 423 272 Tổng cả đơn 423 Kiện'
    const pdfRiengDTP = '1 A01259 Arica - Hộp 1 tuýp 30g 612 0 31 272 Tổng cả đơn 31 Kiện'
    const excelC = makeWorkbook([{ Mã: 'A01259', Tên: 'A', 'Số lô đề nghị': '612', 'Lượng cần': 272, 'Số kiện cần': 423, ĐVT: 'TUYP' }])
    const { warnings } = buildReceiptFromFiles({
      khoCRows: readWarehouseExportRows(excelC),
      khoLgtRows: [],
      pdfTexts: [pdfTongCPC1HN, pdfRiengDTP],
    })
    expect(warnings).toHaveLength(0) // 423 (lớn nhất) khớp đúng 423 kiện đã tách -> không cảnh báo

    const result = recheckKienTotal({ khoC: readWarehouseExportRows(excelC), khoLgt: [], pdfTexts: [pdfTongCPC1HN, pdfRiengDTP] })
    expect(result).toMatchObject({ checked: true, matched: true, declaredTotal: 423 })
  })

  it('nhiều biên bản giao nhận KHÁC NGÀY (chuyến giao bổ sung/giao bù riêng): cộng dồn, không lấy max', () => {
    // Chuyến ngày 18/09 giao 400 kiện, ngày 19/09 giao bổ sung thêm 45 kiện (cùng đơn hàng, giao thiếu
    // hôm trước bù hôm sau) -> phải cộng dồn 400+45=445, không phải lấy max(400,45)=400 như trước đây
    // (lỗi thực tế người dùng gặp phải: thêm biên bản chuyến bổ sung nhưng tổng không tăng).
    const pdfNgay18 = 'Ngày 18 tháng 09 năm 2026 Họ và tên: Tài xế A Biển số xe: 29E-111.11 SĐT liên hệ: 0900000001 '
      + '1 A01259 Arica - Hộp 1 tuýp 30g 612 0 400 272 Tổng cả đơn 400 Kiện'
    const pdfNgay19 = 'Ngày 19 tháng 09 năm 2026 Họ và tên: Tài xế B Biển số xe: 29E-222.22 SĐT liên hệ: 0900000002 '
      + '1 A01259 Arica - Hộp 1 tuýp 30g 612 0 45 272 Tổng cả đơn 45 Kiện'
    const excelC = makeWorkbook([{ Mã: 'A01259', Tên: 'A', 'Số lô đề nghị': '612', 'Lượng cần': 272, 'Số kiện cần': 445, ĐVT: 'TUYP' }])
    const { warnings } = buildReceiptFromFiles({
      khoCRows: readWarehouseExportRows(excelC),
      khoLgtRows: [],
      pdfTexts: [pdfNgay18, pdfNgay19],
    })
    expect(warnings).toHaveLength(0) // 400+45=445 khớp đúng 445 kiện đã tách -> không cảnh báo

    const result = recheckKienTotal({ khoC: readWarehouseExportRows(excelC), khoLgt: [], pdfTexts: [pdfNgay18, pdfNgay19] })
    expect(result).toMatchObject({ checked: true, matched: true, declaredTotal: 445 })
  })

  it('keeps multi-token số lô intact (vd "1 14") instead of chopping it down to 1 token', () => {
    // Số lô thật ghi 2 token cách nhau bởi khoảng trắng — trước đây bị cắt mất token đầu.
    const pdfText = '9 L01021 Liproin - Hộp 1 tuýp 5g 1 14 1 1 867 167h thùng số 1 '
      + '10 L01021 Liproin - Hộp 1 tuýp 5g 1 15 0 3 2100'
    const rows = parsePdfDeliveryNote(pdfText)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ maHang: 'L01021', tenHang: 'Liproin - Hộp 1 tuýp 5g', soLo: '1 14', kienLe: 1, kienNguyen: 1, tongSl: 867 })
    expect(rows[1]).toMatchObject({ soLo: '1 15', kienNguyen: 3, tongSl: 2100 })
  })

  it('does not auto-fill "SL thực tế" or flag "Lệch SL" for a mã hàng shared by both kho (PDF ghi 1 dòng tổng gộp cả 2 kho)', () => {
    // D02124: Kho C 312 + Kho DTP 468 = PDF 780 — khớp, không phải sai lệch thật, nên không auto-fill
    // và không ghi chú cho dòng nào cả.
    const pdfText = '7 D02124 Dung dịch xịt mũi Nebusal spray baby - Hộp 1 lọ 50ml 07626G01 0 5 780'
    const { khoC, khoLgt, warnings } = buildReceiptFromFiles({
      khoCRows: [{ maHang: 'D02124', tenHang: 'Nebusal', dvt: 'HOP', soLo: '07626G01', hanDung: '2026-07-06', kienNguyen: 2, kienLe: 0, slHoaDon: 312 }],
      khoLgtRows: [{ maHang: 'D02124', tenHang: 'Nebusal', dvt: 'HOP', soLo: '07626G01', hanDung: '2026-07-06', kienNguyen: 3, kienLe: 0, slHoaDon: 468 }],
      pdfTexts: [pdfText],
    })
    expect(khoC[0]).toMatchObject({ slThucTe: null, ghiChu: '' })
    expect(khoLgt[0]).toMatchObject({ slThucTe: null, ghiChu: '' })
    expect(warnings).toHaveLength(0)
  })

  it('warns on the combined total when a shared mã hàng does NOT reconcile between both kho', () => {
    const pdfText = '7 D02124 Dung dịch xịt mũi Nebusal spray baby - Hộp 1 lọ 50ml 07626G01 0 5 780'
    const { warnings } = buildReceiptFromFiles({
      khoCRows: [{ maHang: 'D02124', tenHang: 'Nebusal', dvt: 'HOP', soLo: '07626G01', hanDung: '2026-07-06', kienNguyen: 2, kienLe: 0, slHoaDon: 300 }],
      khoLgtRows: [{ maHang: 'D02124', tenHang: 'Nebusal', dvt: 'HOP', soLo: '07626G01', hanDung: '2026-07-06', kienNguyen: 3, kienLe: 0, slHoaDon: 468 }],
      pdfTexts: [pdfText],
    })
    expect(warnings.some(w => w.includes('D02124') && w.includes('300') && w.includes('768'))).toBe(true)
  })

  it('recheckKienTotal: đối chiếu lại tổng kiện sau khi dò tay sửa số kiện, không đụng cảnh báo khác', () => {
    const pdfText = '1 A01259 Arica - Hộp 1 tuýp 30g 612 0 1 272 Tổng cả đơn 5 Kiện'

    const chuaKhop = recheckKienTotal({
      khoC: [{ kienNguyen: 1, kienLe: 0 }],
      khoLgt: [],
      pdfTexts: [pdfText],
    })
    expect(chuaKhop).toMatchObject({ checked: true, matched: false, declaredTotal: 5, actualTotal: 1 })

    // Người dùng dò tay sửa lại đúng số kiện -> bấm đối chiếu lại -> khớp.
    const daKhop = recheckKienTotal({
      khoC: [{ kienNguyen: 5, kienLe: 0 }],
      khoLgt: [],
      pdfTexts: [pdfText],
    })
    expect(daKhop).toMatchObject({ checked: true, matched: true, declaredTotal: 5, actualTotal: 5 })
  })

  it('recheckKienTotal: báo rõ khi biên bản không có dòng "Tổng cả đơn ... Kiện" để đối chiếu', () => {
    const result = recheckKienTotal({ khoC: [{ kienNguyen: 1, kienLe: 0 }], khoLgt: [], pdfTexts: ['không có dòng tổng nào cả'] })
    expect(result.checked).toBe(false)
  })

  it('readActualScanRows: đọc file quét thực tế (Mã SP/Sản phẩm/Số lô/Số lượng), nối số lô bị tách rời', () => {
    const buffer = makeWorkbook([
      { 'Mã SP': 'A01252', 'Sản phẩm': 'Arimenus - Hộp 10 ống 1ml', 'Số lô': '011225', 'Số lượng': 660, Kho: '020101' },
      { 'Mã SP': 'L01021', 'Sản phẩm': 'Liproin - Hộp 1 tuýp 5g', 'Số lô': '1 14', 'Số lượng': 167, Kho: '020101' },
      { 'Mã SP': 'X00000', 'Sản phẩm': 'Không phải mã hàng hợp lệ', 'Số lô': '1', 'Số lượng': 0, Kho: '020101' },
    ])
    const rows = readActualScanRows(buffer)
    expect(rows).toHaveLength(2)
    expect(rows.find(r => r.maHang === 'A01252')).toMatchObject({ soLo: '011225', soLuong: 660 })
    // "1 14" là 1 số lô bị tách thành 2 cụm số cách nhau khoảng trắng do lỗi hiển thị -> nối lại thành "114".
    expect(rows.find(r => r.maHang === 'L01021')).toMatchObject({ soLo: '114', soLuong: 167 })
  })

  it('readActualScanRows: báo lỗi rõ ràng khi không tìm thấy cột "Mã SP"', () => {
    const buffer = makeWorkbook([{ Cột1: 'a', Cột2: 'b' }])
    expect(() => readActualScanRows(buffer)).toThrow(/Mã SP/)
  })

  it('readActualScanRows: cũng đọc được khi cột mã hàng viết đầy đủ "Mã sản phẩm" thay vì viết tắt "Mã SP" (đợt xuất khác từ website)', () => {
    const buffer = makeWorkbook([
      { 'Mã sản phẩm': 'A01252', 'Sản phẩm': 'Arimenus - Hộp 10 ống 1ml', 'Số lô': '011225', 'Số lượng': 660, Kho: '020101' },
    ])
    const rows = readActualScanRows(buffer)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ maHang: 'A01252', soLo: '011225', soLuong: 660 })
  })

  it('readActualScanRows: cũng đọc được cột tên hàng khi đặt tên "Tên sản phẩm" thay vì "Sản phẩm" (vd file Kho LGT — trước đây bị bỏ trống)', () => {
    const buffer = makeWorkbook([
      { 'Mã SP': 'N01041', 'Tên sản phẩm': 'Neo Tiêu Độc - Hộp 4 vỉ x 5 ống 10ml', 'Số lô': '010126', 'Số lượng': 60, Kho: '020101' },
    ])
    const rows = readActualScanRows(buffer)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ maHang: 'N01041', tenHang: 'Neo Tiêu Độc - Hộp 4 vỉ x 5 ống 10ml', soLo: '010126', soLuong: 60 })
  })

  it('mergeActualScanRows: cộng dồn nhiều dòng quét cùng Mã hàng + Số lô', () => {
    const merged = mergeActualScanRows([
      { maHang: 'N00845', soLo: '18726H01', soLuong: 1200 },
      { maHang: 'N00845', soLo: '18726H01', soLuong: 1200 },
      { maHang: 'N00845', soLo: '020326', soLuong: 500 },
    ])
    expect(merged).toHaveLength(2)
    expect(merged.find(r => r.soLo === '18726H01')).toMatchObject({ soLuong: 2400 })
    expect(merged.find(r => r.soLo === '020326')).toMatchObject({ soLuong: 500 })
  })

  it('splitSoRows: tách hàng có nhãn "(SO)" trong Tên hàng ra khỏi bảng Kho C (Kho SO là tập con của Kho C)', () => {
    const { soRows, nonSoRows } = splitSoRows([
      { maHang: 'A01500', tenHang: 'Actiso Viet - Hộp 4 vỉ x 5 ống 10ml (SO)', soLo: '03226G04', slHoaDon: 3960 },
      { maHang: 'G01006', tenHang: 'Golistin Soda - Hộp 1 lọ 45ml', soLo: '04526F01', slHoaDon: 1920 },
    ])
    expect(soRows).toHaveLength(1)
    expect(soRows[0].maHang).toBe('A01500')
    expect(nonSoRows).toHaveLength(1)
    expect(nonSoRows[0].maHang).toBe('G01006')
  })

  it('reconcileActualVsInvoice: khớp/thiếu/thừa/chưa quét/quét lạ theo Mã hàng + Số lô', () => {
    const invoiceRows = [
      { maHang: 'G01006', tenHang: 'Golistin Soda', soLo: '04526F01', slHoaDon: 1920 },
      { maHang: 'A01338', tenHang: 'Afenemi', soLo: '28826G01', slHoaDon: 51000 },
      { maHang: 'D02124', tenHang: 'Hàng chưa quét', soLo: '30926H01', slHoaDon: 780 },
    ]
    const actualRows = [
      { maHang: 'G01006', tenHang: 'Golistin Soda', soLo: '04526F01', soLuong: 1920 },
      { maHang: 'A01338', tenHang: 'Afenemi', soLo: '28826G01', soLuong: 50400 },
      { maHang: 'X09999', tenHang: 'Quét lạ mã', soLo: '99926X01', soLuong: 45 },
    ]
    const results = reconcileActualVsInvoice(invoiceRows, actualRows)
    expect(results.find(r => r.maHang === 'G01006')).toMatchObject({ trangThai: 'khop', chenhLech: 0 })
    expect(results.find(r => r.maHang === 'A01338')).toMatchObject({ trangThai: 'thieu', chenhLech: -600 })
    expect(results.find(r => r.maHang === 'D02124')).toMatchObject({ trangThai: 'chuaQuet', slThucTe: null, chenhLech: -780 })
    expect(results.find(r => r.maHang === 'X09999')).toMatchObject({ trangThai: 'quetLa', slHoaDon: null })
  })

  it('reconcileActualVsInvoice: nối số lô bị tách rời ở 1 bên vẫn khớp đúng với bên kia', () => {
    const invoiceRows = [{ maHang: 'L01021', tenHang: 'Liproin', soLo: '114', slHoaDon: 167 }]
    const actualRows = [{ maHang: 'L01021', tenHang: 'Liproin', soLo: '1 14', soLuong: 167 }]
    const results = reconcileActualVsInvoice(invoiceRows, actualRows)
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ trangThai: 'khop', chenhLech: 0 })
  })

  it('factoryReconciliation: gộp theo Mã hàng (cả 2 kho) để chỉ đúng mã nào còn thiếu ở nhà máy so với biên bản', () => {
    // G01006: bảng đặt 60 kiện (40 Kho C + 20 Kho LGT) nhưng biên bản chỉ xác nhận 26 -> còn 34 kiện ở NM.
    const pdfText = '19 G01006 Golistin Soda - Hộp 1 lọ 45ml 04526F02 0 26 1664 Tổng cả đơn 26 Kiện'
    const { factoryReconciliation } = buildReceiptFromFiles({
      khoCRows: [{ maHang: 'G01006', tenHang: 'Golistin Soda', dvt: 'HOP', soLo: '04526F02', hanDung: '2026-07-06', kienNguyen: 40, kienLe: 0, slHoaDon: 1000 }],
      khoLgtRows: [{ maHang: 'G01006', tenHang: 'Golistin Soda', dvt: 'HOP', soLo: '04526F02', hanDung: '2026-07-06', kienNguyen: 20, kienLe: 0, slHoaDon: 500 }],
      pdfTexts: [pdfText],
    })
    expect(factoryReconciliation.conONhaMay).toHaveLength(1)
    expect(factoryReconciliation.conONhaMay[0]).toMatchObject({ maHang: 'G01006', dat: 60, bienBan: 26, lech: 34 })
    expect(factoryReconciliation.tongConONhaMay).toBe(34)
    expect(factoryReconciliation.khac).toHaveLength(0)
  })

  it('factoryReconciliation: chiều ngược lại (biên bản khai nhiều hơn bảng) xếp riêng vào "khac", không tính vào "conONhaMay"', () => {
    // E00557: biên bản ghi 36 kiện (hàng lạnh gộp ghi đại diện) nhưng bảng chỉ có 5 -> không phải "còn ở
    // nhà máy" (chiều ngược lại tổng kiện thật lại nhiều hơn khai), phải xếp riêng.
    const pdfText = '45 E00557 Ergome-BFS - Hộp 10 ống 1ml 010426 0 36 3000 thùng xốp Tổng cả đơn 36 Kiện'
    const { factoryReconciliation } = buildReceiptFromFiles({
      khoCRows: [{ maHang: 'E00557', tenHang: 'Ergome-BFS', dvt: 'HOP', soLo: '010426', hanDung: '2026-04-01', kienNguyen: 4, kienLe: 1, slHoaDon: 3000 }],
      khoLgtRows: [],
      pdfTexts: [pdfText],
    })
    expect(factoryReconciliation.conONhaMay).toHaveLength(0)
    expect(factoryReconciliation.khac).toHaveLength(1)
    expect(factoryReconciliation.khac[0]).toMatchObject({ maHang: 'E00557', dat: 5, bienBan: 36, lech: -31 })
    expect(factoryReconciliation.tongKhac).toBe(31)
  })

  it('factoryReconciliation: null khi chuyến không có biên bản giao nhận nào (chỉ có phiếu xuất kho) — tránh báo lệch giả', () => {
    const { factoryReconciliation } = buildReceiptFromFiles({
      khoCRows: [{ maHang: 'A01259', tenHang: 'Arica', dvt: 'TUYP', soLo: '612', hanDung: '2026-01-01', kienNguyen: 5, kienLe: 0, slHoaDon: 1000 }],
      khoLgtRows: [],
      pdfTexts: [],
    })
    expect(factoryReconciliation).toBeNull()
  })

  it('recheckKienTotal cũng trả về factoryReconciliation mới nhất (dùng khi bấm "Đối chiếu lại số kiện" sau khi dò tay sửa)', () => {
    const pdfText = '19 G01006 Golistin Soda - Hộp 1 lọ 45ml 04526F02 0 26 1664 Tổng cả đơn 26 Kiện'
    const result = recheckKienTotal({
      khoC: [{ maHang: 'G01006', tenHang: 'Golistin Soda', kienNguyen: 40, kienLe: 0 }],
      khoLgt: [],
      pdfTexts: [pdfText],
    })
    expect(result.factoryReconciliation.conONhaMay[0]).toMatchObject({ maHang: 'G01006', dat: 40, bienBan: 26, lech: 14 })
  })

  it('reconcileActualVsInvoice: hoá đơn bỏ trống Số lô nhưng quét thực tế có ghi — vẫn ghép thành 1 dòng khớp, không tách thành chưa quét + quét lạ', () => {
    const invoiceRows = [{ maHang: 'Q00008', tenHang: 'Quạt cầm tay mini gấp gọn - Laforin', soLo: '', slHoaDon: 59 }]
    const actualRows = [{ maHang: 'Q00008', tenHang: 'Quạt cầm tay mini gấp gọn - Laforin', soLo: '202602/DTP-HTC', soLuong: 59 }]
    const results = reconcileActualVsInvoice(invoiceRows, actualRows)
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ trangThai: 'khop', chenhLech: 0, soLo: '202602/DTP-HTC' })
  })

  it('reconcileActualVsInvoice: có nhiều hơn 1 dòng chưa khớp cùng Mã hàng thì KHÔNG tự đoán ghép', () => {
    const invoiceRows = [
      { maHang: 'Q00008', tenHang: 'Quạt', soLo: '', slHoaDon: 20 },
      { maHang: 'Q00008', tenHang: 'Quạt', soLo: 'LO-A', slHoaDon: 30 },
    ]
    const actualRows = [{ maHang: 'Q00008', tenHang: 'Quạt', soLo: 'LO-B', soLuong: 20 }]
    const results = reconcileActualVsInvoice(invoiceRows, actualRows)
    // Còn 2 dòng hoá đơn + 1 dòng quét chưa khớp cùng mã — không đủ chắc chắn để đoán ghép dòng nào với
    // dòng nào, giữ nguyên cả 3 dòng riêng biệt thay vì tự gộp nhầm.
    expect(results.filter(r => r.trangThai === 'chuaQuet')).toHaveLength(2)
    expect(results.filter(r => r.trangThai === 'quetLa')).toHaveLength(1)
  })

  it('reconcileActualVsInvoice: cả 2 bên đều có Số lô riêng khác nhau thật thì KHÔNG tự ghép (lệch lô thật)', () => {
    const invoiceRows = [{ maHang: 'Q00008', tenHang: 'Quạt', soLo: 'LO-A', slHoaDon: 59 }]
    const actualRows = [{ maHang: 'Q00008', tenHang: 'Quạt', soLo: 'LO-B', soLuong: 59 }]
    const results = reconcileActualVsInvoice(invoiceRows, actualRows)
    expect(results.find(r => r.soLo === 'LO-A')).toMatchObject({ trangThai: 'chuaQuet' })
    expect(results.find(r => r.soLo === 'LO-B')).toMatchObject({ trangThai: 'quetLa' })
  })
})
